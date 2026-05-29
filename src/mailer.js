// 邮件发送：基于 nodemailer
import nodemailer from "nodemailer";

function createTransport(smtp) {
  if (!smtp || !smtp.host || !smtp.user) {
    throw new Error("SMTP 未配置（需要 host / user / pass）");
  }
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 465,
    secure: smtp.secure !== false,
    auth: { user: smtp.user, pass: smtp.pass },
  });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function shopTitle(shop) {
  return shop.name || shop.name_3 || shop.name_2 || `ID ${shop.id}`;
}

// 把单个商铺渲染成简表
function renderShopRow(shop) {
  const fields = ["floor", "no", "tel", "location"];
  const extra = fields
    .map((f) => shop[f])
    .filter(Boolean)
    .join(" · ");
  return `<li><b>${esc(shopTitle(shop))}</b>（ID ${esc(shop.id)}）${extra ? `<br><span style="color:#666">${esc(extra)}</span>` : ""}</li>`;
}

export function buildChangeEmailHtml(diff, meta = {}) {
  const { added, removed, modified, counts } = diff;
  const when = new Date().toLocaleString("zh-CN", { hour12: false });

  const sections = [];

  sections.push(`
    <div style="background:#f4f6f8;border-radius:8px;padding:14px 18px;margin-bottom:16px">
      <div style="font-size:13px;color:#666">检查时间：${esc(when)}</div>
      <div style="font-size:13px;color:#666">商铺总数：${esc(diff.totalNew)}（上次 ${esc(diff.totalOld)}）</div>
      <div style="margin-top:8px;font-size:15px">
        <span style="color:#1a7f37">新增 ${counts.added}</span> ·
        <span style="color:#9a6700">修改 ${counts.modified}</span> ·
        <span style="color:#cf222e">删除 ${counts.removed}</span>
      </div>
    </div>`);

  if (added.length) {
    sections.push(`<h3 style="color:#1a7f37">🟢 新增商铺（${added.length}）</h3>
      <ul style="line-height:1.7">${added.map(renderShopRow).join("")}</ul>`);
  }

  if (removed.length) {
    sections.push(`<h3 style="color:#cf222e">🔴 删除商铺（${removed.length}）</h3>
      <ul style="line-height:1.7">${removed.map(renderShopRow).join("")}</ul>`);
  }

  if (modified.length) {
    const rows = modified
      .map((m) => {
        const changeRows = m.changes
          .map(
            (c) => `<tr>
              <td style="padding:4px 8px;color:#57606a;white-space:nowrap">${esc(c.label)}</td>
              <td style="padding:4px 8px;color:#cf222e;text-decoration:line-through">${esc(c.before) || "<空>"}</td>
              <td style="padding:4px 8px;color:#1a7f37">${esc(c.after) || "<空>"}</td>
            </tr>`
          )
          .join("");
        return `<div style="margin-bottom:14px">
            <div style="font-weight:600">${esc(m.name)}（ID ${esc(m.id)}）</div>
            <table style="border-collapse:collapse;font-size:13px;margin-top:4px">
              <tr style="color:#999"><td style="padding:4px 8px">字段</td><td style="padding:4px 8px">原值</td><td style="padding:4px 8px">新值</td></tr>
              ${changeRows}
            </table>
          </div>`;
      })
      .join("");
    sections.push(`<h3 style="color:#9a6700">🟡 修改商铺（${modified.length}）</h3>${rows}`);
  }

  if (!diff.hasChanges) {
    sections.push(`<p style="color:#666">本次检查未发现商铺数据变动。</p>`);
  }

  return `<!doctype html><html><body style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#1f2328;max-width:720px;margin:0 auto;padding:20px">
    <h2 style="margin:0 0 4px">商场商铺数据变动报告</h2>
    <div style="color:#999;font-size:12px;margin-bottom:12px">CHKC ShopInfo Reminder${meta.baseUrl ? ` · ${esc(meta.baseUrl)}` : ""}</div>
    ${sections.join("\n")}
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
    <div style="color:#999;font-size:12px">此邮件由 商铺数据监控服务 自动发送。</div>
  </body></html>`;
}

export function buildSubject(diff) {
  if (!diff.hasChanges) return "【商铺数据】本次无变动";
  const { counts } = diff;
  const parts = [];
  if (counts.added) parts.push(`新增${counts.added}`);
  if (counts.modified) parts.push(`修改${counts.modified}`);
  if (counts.removed) parts.push(`删除${counts.removed}`);
  return `【商铺数据变动】${parts.join("，")}`;
}

export async function sendChangeReport({ smtp, recipients, diff, meta }) {
  if (!recipients || recipients.length === 0) throw new Error("未配置收件邮箱");
  const transport = createTransport(smtp);
  const info = await transport.sendMail({
    from: smtp.from || smtp.user,
    to: recipients.join(","),
    subject: buildSubject(diff),
    html: buildChangeEmailHtml(diff, meta),
  });
  return info.messageId;
}

export async function sendTestEmail({ smtp, recipients }) {
  if (!recipients || recipients.length === 0) throw new Error("未配置收件邮箱");
  const transport = createTransport(smtp);
  await transport.verify();
  const info = await transport.sendMail({
    from: smtp.from || smtp.user,
    to: recipients.join(","),
    subject: "【测试邮件】商铺数据监控服务",
    html: `<div style="font-family:sans-serif">这是一封来自「商场商铺数据监控服务」的测试邮件。<br>如果你收到了它，说明 SMTP 与收件设置都正确。<br><br>时间：${new Date().toLocaleString("zh-CN", { hour12: false })}</div>`,
  });
  return info.messageId;
}
