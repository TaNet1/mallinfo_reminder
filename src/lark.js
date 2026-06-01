// Lark / 飞书 自定义机器人 (Custom Bot) 通知
// 通过群机器人的 Webhook 发送消息；可选「签名校验」(secret)。
import crypto from "crypto";

// 签名算法：string_to_sign = `${timestamp}\n${secret}`，
// 以其为 HMAC-SHA256 的 key 对空串求值，再 base64。
function buildSign(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`;
  return crypto.createHmac("sha256", stringToSign).update("").digest("base64");
}

async function postWebhook(webhook, payload, secret) {
  if (!webhook) throw new Error("未配置 Lark Webhook 地址");
  const body = { ...payload };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    body.timestamp = timestamp;
    body.sign = buildSign(timestamp, secret);
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  // 成功：code === 0（新版）或 StatusCode === 0（旧版）
  const ok = json.code === 0 || json.StatusCode === 0;
  if (!ok) {
    throw new Error(`Lark 返回错误: ${json.msg || json.StatusMessage || text}`);
  }
  return json;
}

function clip(arr, n) {
  return { items: arr.slice(0, n), more: Math.max(0, arr.length - n) };
}

function shopLine(s) {
  const extra = [s.floor, s.no].filter(Boolean).join(" · ");
  return `- ${s.name || s.name_3 || ("ID " + s.id)}（ID ${s.id}）${extra ? " · " + extra : ""}`;
}

// 把 diff 渲染成 Lark 交互卡片
export function buildChangeCard(diff, meta = {}) {
  const { counts } = diff;
  const when = new Date().toLocaleString("zh-CN", { hour12: false });

  // 标题颜色：删除>红，修改>橙，新增>绿，无变动>灰
  let template = "grey";
  if (counts.added) template = "green";
  if (counts.modified) template = "orange";
  if (counts.removed) template = "red";

  const elements = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content:
          `**新增 ${counts.added}** · **修改 ${counts.modified}** · **删除 ${counts.removed}**\n` +
          `共 ${diff.totalNew} 家（上次 ${diff.totalOld} 家）· 检查时间 ${when}`,
      },
    },
  ];

  if (diff.added?.length) {
    const { items, more } = clip(diff.added, 15);
    elements.push({ tag: "hr" });
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `🟢 **新增（${diff.added.length}）**\n` + items.map(shopLine).join("\n") + (more ? `\n…及 ${more} 项` : "") },
    });
  }

  if (diff.removed?.length) {
    const { items, more } = clip(diff.removed, 15);
    elements.push({ tag: "hr" });
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `🔴 **删除（${diff.removed.length}）**\n` + items.map(shopLine).join("\n") + (more ? `\n…及 ${more} 项` : "") },
    });
  }

  if (diff.modified?.length) {
    const { items, more } = clip(diff.modified, 12);
    const lines = items.map((m) => {
      const fields = m.changes
        .slice(0, 4)
        .map((c) => `${c.label}：\`${c.before || "空"}\` → \`${c.after || "空"}\``)
        .join("\n  ");
      const extra = m.changes.length > 4 ? `\n  …等 ${m.changes.length} 项字段` : "";
      return `- **${m.name}**（ID ${m.id}）\n  ${fields}${extra}`;
    });
    elements.push({ tag: "hr" });
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: `🟡 **修改（${diff.modified.length}）**\n` + lines.join("\n") + (more ? `\n…及 ${more} 家` : "") },
    });
  }

  if (!diff.hasChanges) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: "本次检查未发现商铺数据变动。" } });
  }

  if (meta.baseUrl) {
    elements.push({ tag: "note", elements: [{ tag: "plain_text", content: `数据源 ${meta.baseUrl}` }] });
  }

  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: { template, title: { tag: "plain_text", content: "🏬 商铺数据变动报告" } },
      elements,
    },
  };
}

export async function sendChangeCard({ webhook, secret, diff, meta }) {
  return postWebhook(webhook, buildChangeCard(diff, meta), secret);
}

export async function sendTestLark({ webhook, secret }) {
  const payload = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: { template: "blue", title: { tag: "plain_text", content: "✅ 测试消息" } },
      elements: [
        { tag: "div", text: { tag: "lark_md", content: "这是一条来自「商场商铺数据监控」的测试消息。\n如果你收到了它，说明 Lark 机器人配置正确。" } },
        { tag: "note", elements: [{ tag: "plain_text", content: new Date().toLocaleString("zh-CN", { hour12: false }) }] },
      ],
    },
  };
  return postWebhook(webhook, payload, secret);
}
