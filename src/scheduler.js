// 定时调度：根据配置按「间隔」或「每天定时」执行检查
import { fetchShops, verify } from "./api.js";
import { diffShops } from "./diff.js";
import { sendChangeReport } from "./mailer.js";
import { sendChangeCard } from "./lark.js";
import { getConfig, getSnapshot, saveSnapshot, addHistory } from "./store.js";

const VERIFY_INTERVAL_MS = 12 * 60 * 60 * 1000; // 每 12 小时自动检测一次接口连通

export class Scheduler {
  constructor() {
    this.timer = null;
    this.running = false;       // 一次检查是否正在执行
    this.nextRunAt = null;
    this.lastResult = null;     // 最近一次检查结果摘要
    this.verifyTimer = null;
    this.lastVerify = null;     // 最近一次接口连通检测结果 { ok, at }
    this.larkSkipDate = null;   // 若某天 Lark 连续失败，记录该日期，当天不再尝试
  }

  // 检测接口连通性并记录结果
  async runVerify() {
    try {
      const r = await verify(getConfig().api);
      this.lastVerify = { ok: r.ok, at: new Date().toISOString(), msg: r.body?.msg || "" };
    } catch (e) {
      this.lastVerify = { ok: false, at: new Date().toISOString(), msg: e.message };
    }
    return this.lastVerify;
  }

  // 启动 12 小时一次的连通检测循环（立即先测一次）
  startVerifyLoop() {
    if (this.verifyTimer) clearInterval(this.verifyTimer);
    this.runVerify();
    this.verifyTimer = setInterval(() => this.runVerify(), VERIFY_INTERVAL_MS);
  }

  // 执行一次检查；sendEmail=false 时只比对不发邮件（用于手动预览）
  async runCheck({ sendEmail = true, reason = "scheduled" } = {}) {
    if (this.running) return { skipped: true, msg: "已有检查在执行中" };
    this.running = true;
    try {
      const cfg = getConfig();
      const shops = await fetchShops(cfg.api);
      const prev = getSnapshot();
      const firstRun = !prev;
      const diff = diffShops(prev?.shops || [], shops);

      let emailed = false;
      let emailError = null;
      let messageId = null;
      let larked = false;
      let larkError = null;
      let larkAttempts = null;
      let larkSkipped = false;

      // 首次运行：仅建立基准快照，不把现有全部商铺当作「新增」推送
      const shouldNotify = sendEmail && !firstRun && (diff.hasChanges || cfg.notifyWhenNoChange);
      if (shouldNotify) {
        const meta = { baseUrl: cfg.api.baseUrl };

        // 通道一：邮件（仅在配置了收件人时尝试）
        if (cfg.recipients?.length) {
          try {
            messageId = await sendChangeReport({ smtp: cfg.smtp, recipients: cfg.recipients, diff, meta });
            emailed = true;
          } catch (e) {
            emailError = e.message;
          }
        }

        // 通道二：Lark（仅在启用且有 webhook 时尝试）
        // 失败自动重试最多 5 次；若连续 5 次都失败，标记当天不再尝试。
        if (cfg.lark?.enabled && cfg.lark.webhook) {
          const today = new Date().toISOString().slice(0, 10);
          if (this.larkSkipDate === today) {
            larkSkipped = true;
            larkError = `当天已连续失败，已暂停推送（${today}），明日恢复`;
          } else {
            try {
              const r = await sendChangeCard({ webhook: cfg.lark.webhook, secret: cfg.lark.secret, diff, meta, maxAttempts: 5 });
              larked = true;
              larkAttempts = r.attempts;
              this.larkSkipDate = null; // 成功则清除暂停标记
            } catch (e) {
              larkError = e.message;
              larkAttempts = e.attempts || 5;
              this.larkSkipDate = today; // 连续 5 次失败：当天不再尝试
            }
          }
        }
      }

      // 比对完成后更新快照（即便推送失败也更新，避免重复告警；如需重试可改为失败不更新）
      saveSnapshot(shops);

      const result = {
        ok: true,
        reason,
        counts: diff.counts,
        hasChanges: diff.hasChanges,
        totalNew: diff.totalNew,
        totalOld: diff.totalOld,
        emailed,
        emailError,
        messageId,
        larked,
        larkError,
        larkAttempts,
        larkSkipped,
        firstRun: !prev,
      };
      this.lastResult = { ...result, at: new Date().toISOString() };
      addHistory(result);
      return { ...result, diff };
    } catch (e) {
      const result = { ok: false, reason, error: e.message };
      this.lastResult = { ...result, at: new Date().toISOString() };
      addHistory(result);
      return result;
    } finally {
      this.running = false;
    }
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = null;
    }
    this.nextRunAt = null;
  }

  // 按当前配置重新编排定时器
  reschedule() {
    this.stop();
    const cfg = getConfig();
    if (!cfg.enabled) return;

    if (cfg.schedule.mode === "daily") {
      this._scheduleDaily(cfg.schedule.dailyTime);
    } else {
      const minutes = Math.max(1, Number(cfg.schedule.intervalMinutes) || 60);
      const ms = minutes * 60 * 1000;
      this.nextRunAt = new Date(Date.now() + ms).toISOString();
      this.timer = setInterval(() => {
        this.nextRunAt = new Date(Date.now() + ms).toISOString();
        this.runCheck({ reason: "interval" });
      }, ms);
    }
  }

  _scheduleDaily(hhmm) {
    const [h, m] = String(hhmm || "09:00").split(":").map((x) => parseInt(x, 10));
    const now = new Date();
    const next = new Date(now);
    next.setHours(isNaN(h) ? 9 : h, isNaN(m) ? 0 : m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    this.nextRunAt = next.toISOString();
    const delay = next - now;
    this.timer = setTimeout(async () => {
      await this.runCheck({ reason: "daily" });
      this._scheduleDaily(hhmm); // 排下一天
    }, delay);
  }

  status() {
    const cfg = getConfig();
    return {
      enabled: cfg.enabled,
      mode: cfg.schedule.mode,
      nextRunAt: this.nextRunAt,
      running: this.running,
      lastResult: this.lastResult,
      lastVerify: this.lastVerify,
    };
  }
}

export const scheduler = new Scheduler();
