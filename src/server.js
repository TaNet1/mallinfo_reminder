// HTTP 服务：提供配置界面 + REST 接口
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import { getConfig, saveConfig, getSnapshot, getHistory } from "./store.js";
import { verify, fetchShops, BUSINESS_CLASSIFY, FOODS } from "./api.js";
import { diffShops } from "./diff.js";
import { sendTestEmail } from "./mailer.js";
import { sendTestLark } from "./lark.js";
import { scheduler } from "./scheduler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve(__dirname, "..", "public")));

// 出于安全，配置返回时隐去 SMTP 密码（只返回是否已设置）
function redactConfig(cfg) {
  return {
    ...cfg,
    smtp: { ...cfg.smtp, pass: cfg.smtp.pass ? "********" : "" },
    lark: { ...cfg.lark, secret: cfg.lark.secret ? "********" : "" },
  };
}

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  res.status(500).json({ ok: false, error: e.message });
});

// 读取配置
app.get("/api/config", wrap((req, res) => {
  res.json({ ok: true, config: redactConfig(getConfig()) });
}));

// 保存配置（密码字段若为占位符 ******** 则保持原值不变）
app.post("/api/config", wrap((req, res) => {
  const incoming = req.body || {};
  if (incoming.smtp && incoming.smtp.pass === "********") {
    delete incoming.smtp.pass; // 不覆盖已有密码
  }
  if (incoming.lark && incoming.lark.secret === "********") {
    delete incoming.lark.secret; // 不覆盖已有 Secret
  }
  if (typeof incoming.recipients === "string") {
    incoming.recipients = incoming.recipients
      .split(/[,，;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const saved = saveConfig(incoming);
  scheduler.reschedule();
  res.json({ ok: true, config: redactConfig(saved), schedule: scheduler.status() });
}));

// 校验接口连通性（手动触发，同时刷新自动检测的记录）
app.post("/api/verify", wrap(async (req, res) => {
  const cfg = getConfig();
  const r = await verify(cfg.api);
  scheduler.lastVerify = { ok: r.ok, at: new Date().toISOString(), msg: r.body?.msg || "" };
  res.json({ ok: r.ok, detail: r });
}));

// 立即抓取并预览变动（不发邮件）
app.post("/api/check-now", wrap(async (req, res) => {
  const sendEmail = req.body?.sendEmail === true;
  const result = await scheduler.runCheck({ sendEmail, reason: sendEmail ? "manual-send" : "manual-preview" });
  res.json({ ok: result.ok !== false, result });
}));

// 当前商铺数据（来自最近快照，没有则实时抓一次）
app.get("/api/shops", wrap(async (req, res) => {
  let snap = getSnapshot();
  if (!snap) {
    const shops = await fetchShops(getConfig().api);
    snap = { fetchedAt: new Date().toISOString(), shops };
  }
  res.json({ ok: true, fetchedAt: snap.fetchedAt, count: snap.shops.length, shops: snap.shops });
}));

// 发送测试邮件
app.post("/api/test-email", wrap(async (req, res) => {
  const cfg = getConfig();
  const recipients = Array.isArray(req.body?.recipients) && req.body.recipients.length
    ? req.body.recipients
    : cfg.recipients;
  const id = await sendTestEmail({ smtp: cfg.smtp, recipients });
  res.json({ ok: true, messageId: id });
}));

// 发送 Lark 测试消息
app.post("/api/test-lark", wrap(async (req, res) => {
  const cfg = getConfig();
  await sendTestLark({ webhook: cfg.lark.webhook, secret: cfg.lark.secret });
  res.json({ ok: true });
}));

// 调度状态 + 运行历史
app.get("/api/status", wrap((req, res) => {
  res.json({ ok: true, status: scheduler.status(), history: getHistory() });
}));

// 对照表（供前端展示）
app.get("/api/dicts", wrap((req, res) => {
  res.json({ ok: true, businessClassify: BUSINESS_CLASSIFY, foods: FOODS });
}));

app.listen(PORT, () => {
  console.log(`\n  商场商铺数据监控服务已启动`);
  console.log(`  配置界面: http://localhost:${PORT}\n`);
  scheduler.reschedule();
  scheduler.startVerifyLoop(); // 每 12 小时自动检测接口连通
  const cfg = getConfig();
  console.log(`  定时任务: ${cfg.enabled ? "已开启" : "未开启"}（${cfg.schedule.mode === "daily" ? `每天 ${cfg.schedule.dailyTime}` : `每 ${cfg.schedule.intervalMinutes} 分钟`}）`);
  console.log(`  接口连通检测: 每 12 小时自动执行`);
});
