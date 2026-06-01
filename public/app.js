const $ = (id) => document.getElementById(id);

function toast(msg, type = "") {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast " + type;
  el.hidden = false;
  // 触发过渡
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 220);
  }, 3500);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// ---------- 配置加载/渲染 ----------
let dicts = { businessClassify: {}, foods: {} };
let allShops = []; // 当前商铺数据缓存，用于搜索过滤
let appBaseUrl = "http://hkchkc.yzt3d.com/"; // 用于拼接 logo 图片地址
let shopPage = 1;
const SHOP_PAGE_SIZE = 10;
let allHistory = []; // 运行历史缓存，用于弹窗筛选

function applyConfig(cfg) {
  $("enabled").checked = !!cfg.enabled;
  $("notifyWhenNoChange").checked = !!cfg.notifyWhenNoChange;
  document.querySelector(`input[name=mode][value="${cfg.schedule.mode}"]`).checked = true;
  $("intervalMinutes").value = cfg.schedule.intervalMinutes;
  $("dailyTime").value = cfg.schedule.dailyTime;
  $("recipients").value = (cfg.recipients || []).join(", ");
  $("smtpHost").value = cfg.smtp.host || "";
  $("smtpPort").value = cfg.smtp.port || 465;
  $("smtpSecure").checked = cfg.smtp.secure !== false;
  $("smtpUser").value = cfg.smtp.user || "";
  $("smtpPass").value = cfg.smtp.pass || "";
  $("smtpFrom").value = cfg.smtp.from || "";
  $("larkEnabled").checked = !!cfg.lark?.enabled;
  $("larkWebhook").value = cfg.lark?.webhook || "";
  $("larkSecret").value = cfg.lark?.secret || "";
  if (cfg.api?.baseUrl) appBaseUrl = cfg.api.baseUrl;
  updateModeBoxes();
  syncQuickSet();
  updateSmtpStatus();
  updateLarkStatus();
}

function updateSmtpStatus() {
  const host = $("smtpHost").value.trim();
  const user = $("smtpUser").value.trim();
  const el = $("smtpStatus");
  if (host && user) {
    el.textContent = `已配置 · ${user}`;
    el.className = "smtp-state set";
  } else {
    el.textContent = "未配置";
    el.className = "smtp-state";
  }
}

function openSmtp() { $("smtpModal").hidden = false; }
function closeSmtp() { $("smtpModal").hidden = true; }

function updateLarkStatus() {
  const on = $("larkEnabled").checked;
  const hasHook = !!$("larkWebhook").value.trim();
  const el = $("larkStatus");
  if (on && hasHook) {
    el.textContent = "已启用";
    el.className = "smtp-state set";
  } else if (hasHook) {
    el.textContent = "已配置（未启用）";
    el.className = "smtp-state";
  } else {
    el.textContent = "未启用";
    el.className = "smtp-state";
  }
}

function openLark() { $("larkModal").hidden = false; }
function closeLark() { $("larkModal").hidden = true; }

function updateModeBoxes() {
  const mode = document.querySelector("input[name=mode]:checked")?.value;
  $("intervalBox").hidden = mode !== "interval";
  $("dailyBox").hidden = mode !== "daily";
}

// 发送周期相关
function collectSchedule() {
  const mode = document.querySelector("input[name=mode]:checked").value;
  return {
    enabled: $("enabled").checked,
    notifyWhenNoChange: $("notifyWhenNoChange").checked,
    schedule: {
      mode,
      intervalMinutes: Number($("intervalMinutes").value) || 60,
      dailyTime: $("dailyTime").value || "09:00",
    },
  };
}

// SMTP 相关
function collectSmtp() {
  return {
    smtp: {
      host: $("smtpHost").value.trim(),
      port: Number($("smtpPort").value) || 465,
      secure: $("smtpSecure").checked,
      user: $("smtpUser").value.trim(),
      pass: $("smtpPass").value,
      from: $("smtpFrom").value.trim(),
    },
  };
}

// Lark 相关
function collectLark() {
  return {
    lark: {
      enabled: $("larkEnabled").checked,
      webhook: $("larkWebhook").value.trim(),
      secret: $("larkSecret").value,
    },
  };
}

// 通信配置（收件邮箱 + 发件服务器 + Lark）
function collectComms() {
  return { recipients: $("recipients").value, ...collectSmtp(), ...collectLark() };
}

// ---------- 各操作 ----------
async function loadAll() {
  try {
    dicts = (await api("/api/dicts"));
  } catch {}
  const { config } = await api("/api/config");
  applyConfig(config);
  await refreshStatus();
  await loadShops();
}

function applyVerifyPill(v) {
  if (!v) return;
  const b = $("apiStatus");
  const when = v.at ? new Date(v.at).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  b.className = "pill " + (v.ok ? "pill-ok" : "pill-err");
  b.title = when ? `最近检测：${when}` : "";
  b.innerHTML = `<i class="dot"></i>接口：${v.ok ? "连通正常" : "校验失败"}`;
}

async function refreshStatus() {
  try {
    const { status, history } = await api("/api/status");
    applyVerifyPill(status.lastVerify);
    const info = $("scheduleInfo");
    const pill = $("schedPill");
    if (status.enabled) {
      const when = status.nextRunAt ? new Date(status.nextRunAt).toLocaleString("zh-CN", { hour12: false }) : "—";
      info.textContent = `定时任务已开启，下次检查：${when}`;
      pill.className = "pill pill-live";
      pill.innerHTML = `<i class="dot"></i>定时：运行中`;
    } else {
      info.textContent = "定时任务未开启（保存配置时按当前设置生效）";
      pill.className = "pill pill-gray";
      pill.innerHTML = `<i class="dot"></i>定时：未开启`;
    }
    allHistory = history || [];
    if (!$("historyModal").hidden) renderHistoryList();
  } catch (e) { /* ignore */ }
}

const REASON_LABEL = {
  interval: "间隔", daily: "每天", "manual-preview": "手动预览",
  "manual-send": "手动发送", scheduled: "定时",
};

function histChanged(h) {
  const c = h.counts || {};
  return (c.added || 0) + (c.modified || 0) + (c.removed || 0) > 0;
}

function buildHistRow(h) {
  const t = new Date(h.at).toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const tag = `<span class="tag">${esc(REASON_LABEL[h.reason] || h.reason || "—")}</span>`;

  if (h.ok === false) {
    return `<div class="hist-row fail">
      <div class="hist-line1"><span class="hist-icon">✕</span><span class="hist-time">${esc(t)}</span>${tag}</div>
      <div class="hist-line2"><span class="hist-err">${esc(h.error)}</span></div>
    </div>`;
  }

  const c = h.counts || {};
  const changed = histChanged(h);
  const badges = changed
    ? [
        c.added ? `<span class="chip chip-add">+${c.added}</span>` : "",
        c.modified ? `<span class="chip chip-mod">~${c.modified}</span>` : "",
        c.removed ? `<span class="chip chip-del">−${c.removed}</span>` : "",
      ].join("")
    : `<span class="hist-nochange">无变动</span>`;
  const chans = [];
  if (h.emailed) chans.push(`<span class="hist-mail ok">✉️ 邮件</span>`);
  else if (h.emailError) chans.push(`<span class="hist-mail warn" title="${esc(h.emailError)}">✉️ 邮件失败</span>`);
  if (h.larked) chans.push(`<span class="hist-mail ok">💬 Lark</span>`);
  else if (h.larkError) chans.push(`<span class="hist-mail warn" title="${esc(h.larkError)}">💬 Lark失败</span>`);
  const mail = chans.length ? `<span class="hist-mail-wrap">${chans.join(" ")}</span>` : `<span class="hist-mail">— 未推送</span>`;
  const icon = changed ? "●" : "○";

  return `<div class="hist-row ${changed ? "changed" : ""}">
    <div class="hist-line1">
      <span class="hist-icon">${icon}</span>
      <span class="hist-time">${esc(t)}</span>${tag}
      ${mail}
    </div>
    <div class="hist-line2">${badges}<span class="hist-total">共 ${h.totalNew} 家</span></div>
  </div>`;
}

// 按筛选条件渲染运行历史（弹窗内）
function renderHistoryList() {
  const kw = ($("histSearch").value || "").trim().toLowerCase();
  const reason = $("histReason").value;
  const result = $("histResult").value;

  const list = allHistory.filter((h) => {
    if (reason && h.reason !== reason) return false;
    if (result === "changed" && !(h.ok !== false && histChanged(h))) return false;
    if (result === "nochange" && !(h.ok !== false && !histChanged(h))) return false;
    if (result === "emailed" && !h.emailed) return false;
    if (result === "failed" && h.ok !== false) return false;
    if (kw) {
      const hay = [REASON_LABEL[h.reason] || h.reason, h.error || "", h.emailError || ""].join(" ").toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  $("histCount").textContent = `${list.length} / ${allHistory.length}`;
  const el = $("historyList");
  el.innerHTML = list.length
    ? list.map(buildHistRow).join("")
    : `<div class="empty">没有匹配的记录</div>`;
}

function openHistory() {
  $("historyModal").hidden = false;
  renderHistoryList();
}
function closeHistory() { $("historyModal").hidden = true; }

async function loadShops() {
  const meta = $("shopsMeta");
  meta.textContent = "加载中…";
  try {
    const { shops, count, fetchedAt } = await api("/api/shops");
    allShops = shops;
    meta.textContent = `共 ${count} 家商铺 · 数据时间 ${new Date(fetchedAt).toLocaleString("zh-CN", { hour12: false })}`;
    renderShops();
  } catch (e) {
    meta.textContent = "加载失败：" + e.message;
  }
}

function filterShops() {
  const q = ($("shopSearch").value || "").trim().toLowerCase();
  if (!q) return allShops;
  return allShops.filter((s) => {
    const hay = [
      s.name, s.name_2, s.name_3, s.no, s.floor, s.tel, s.location, s.location_2, s.location_3,
      catName(s.business_classify), foodNames(s.foods).join(" "),
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderShops() {
  const q = ($("shopSearch").value || "").trim();
  const list = filterShops();
  $("shopsCount").textContent = q ? `${list.length} / ${allShops.length}` : `${allShops.length}`;

  if (!list.length) {
    $("shopsTable").innerHTML = `<div class="empty">没有匹配的商铺</div>`;
    $("shopsPager").innerHTML = "";
    return;
  }

  const pages = Math.max(1, Math.ceil(list.length / SHOP_PAGE_SIZE));
  if (shopPage > pages) shopPage = pages;
  if (shopPage < 1) shopPage = 1;
  const start = (shopPage - 1) * SHOP_PAGE_SIZE;
  const pageItems = list.slice(start, start + SHOP_PAGE_SIZE);

  const head = `<thead><tr>
    <th>商铺</th><th>楼层</th><th>广场</th><th>编号</th><th>类别</th><th>美食</th>
    <th>电话</th><th>网址</th><th>位置</th><th>营业时间</th>
  </tr></thead>`;
  const body = pageItems.map(renderShopRow).join("");
  $("shopsTable").innerHTML = `<div class="table-wrap"><table class="shops-full">${head}<tbody>${body}</tbody></table></div>`;
  renderPager(pages, list.length);
  lockPageHeight();
}

// 用页面最底部的占位元素把「整页高度」锁定为见过的最大值：
// - 搜索过滤后页面不塌缩，滚动位置不会被顶到顶部
// - 表格和分页/统计依然紧贴结果下方，占位空白落在页面最底部（无边框、不显眼）
let maxDocH = 0;
function lockPageHeight() {
  const spacer = $("pageSpacer");
  spacer.style.height = "0px";                 // 先清零，测自然高度
  const natural = document.documentElement.scrollHeight;
  if (natural > maxDocH) maxDocH = natural;
  spacer.style.height = Math.max(0, maxDocH - natural) + "px";
}

function renderPager(pages, total) {
  if (pages <= 1) {
    $("shopsPager").innerHTML = `<span class="pager-info">共 ${total} 家</span>`;
    return;
  }
  const btn = (label, page, opts = {}) =>
    `<button data-page="${page}" ${opts.disabled ? "disabled" : ""} class="${opts.active ? "active" : ""}">${label}</button>`;

  // 窗口化页码：当前页前后各 2 页
  const win = [];
  const from = Math.max(1, shopPage - 2);
  const to = Math.min(pages, shopPage + 2);
  if (from > 1) { win.push(1); if (from > 2) win.push("…"); }
  for (let p = from; p <= to; p++) win.push(p);
  if (to < pages) { if (to < pages - 1) win.push("…"); win.push(pages); }

  const nums = win.map((p) => p === "…"
    ? `<span class="ellipsis">…</span>`
    : btn(p, p, { active: p === shopPage })).join("");

  $("shopsPager").innerHTML =
    btn("‹", shopPage - 1, { disabled: shopPage <= 1 }) +
    nums +
    btn("›", shopPage + 1, { disabled: shopPage >= pages }) +
    `<span class="pager-info">第 ${shopPage} / ${pages} 页 · 共 ${total} 家</span>`;
}

const AV_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
function avColor(s) { return AV_COLORS[(parseInt(s.id, 10) || 0) % AV_COLORS.length]; }

function logoUrl(s) {
  if (!s.logo) return "";
  if (/^https?:/i.test(s.logo)) return s.logo;
  return appBaseUrl.replace(/\/+$/, "") + "/" + String(s.logo).replace(/^\/+/, "");
}

function catNames(raw) {
  if (!raw) return [];
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean)
    .map((id) => (dicts.businessClassify[id] || id).split("/").pop());
}

function foodNames(raw) {
  if (!raw) return [];
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean)
    .map((id) => (dicts.foods[id] || id).split("/").pop());
}

// 营业时间字段含 {bs}(空格) {br}(换行) 占位符，清洗为可读文本
function cleanHours(s) {
  if (!s) return "";
  return String(s)
    .replace(/\{bs\}/g, " ")
    .replace(/\{br\}/g, " / ")
    .replace(/[\r\n]+/g, " / ")
    .replace(/(\s*\/\s*)+/g, " / ")
    .trim();
}

function renderShopRow(s) {
  const name = s.name || s.name_3 || `ID ${s.id}`;
  const initial = esc((s.nameinitial || name).slice(0, 1).toUpperCase());
  const lu = logoUrl(s);
  const img = lu ? `<img src="${esc(lu)}" loading="lazy" onerror="this.style.display='none'" alt="">` : "";
  const av = `<div class="shop-av" style="background:${avColor(s)}"><span>${initial}</span>${img}</div>`;

  const altParts = [];
  if (s.name_2 && s.name_2 !== name) altParts.push(s.name_2);
  if (s.name_3 && s.name_3 !== name) altParts.push(s.name_3);
  const alt = altParts.length ? `<span class="alt">${esc(altParts.join(" · "))}</span>` : "";

  const cats = catNames(s.business_classify).map((c) => `<span class="cat-tag">${esc(c)}</span>`).join("");
  const foods = foodNames(s.foods).map((c) => `<span class="food-tag">${esc(c)}</span>`).join("");
  const web = s.web
    ? `<a href="${esc(s.web)}" target="_blank" rel="noopener">${esc(s.web.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`
    : "";
  const loc = s.location || s.location_2 || s.location_3 || "";
  const hours = cleanHours(s.businesshour || s.businesshour_2 || s.businesshour_3);

  return `<tr>
    <td class="col-name"><div style="display:flex;align-items:center;gap:10px">${av}<div><b>${esc(name)}</b>${alt}<span class="col-id" style="display:block;font-size:11px">ID ${esc(s.id)}</span></div></div></td>
    <td><span class="floor-chip">${esc(s.floor || "—")}</span></td>
    <td>${esc(s.building_no || "—")}</td>
    <td>${esc(s.no || "—")}</td>
    <td><div class="cell-tags">${cats || "—"}</div></td>
    <td><div class="cell-tags">${foods || "—"}</div></td>
    <td>${s.tel ? "☎ " + esc(s.tel) : "—"}</td>
    <td class="cell-web">${web || "—"}</td>
    <td class="col-loc">${esc(loc) || "—"}</td>
    <td class="col-hours">${esc(hours) || "—"}</td>
  </tr>`;
}

function catName(raw) {
  if (!raw) return "";
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean)
    .map((id) => (dicts.businessClassify[id] || id)).join("; ");
}

function renderDiff(diff) {
  const card = $("diffCard");
  card.hidden = false;
  const c = diff.counts;
  $("diffSummary").innerHTML =
    `<span class="chip chip-add">新增 ${c.added}</span>` +
    `<span class="chip chip-mod">修改 ${c.modified}</span>` +
    `<span class="chip chip-del">删除 ${c.removed}</span>` +
    `<span class="hint">（共 ${diff.totalNew} 家，上次 ${diff.totalOld} 家）</span>`;

  let html = "";
  if (diff.added?.length) {
    html += `<div class="diff-block"><h4>🟢 新增</h4><ul>` +
      diff.added.map((s) => `<li>${esc(s.name || s.id)}（ID ${esc(s.id)}）</li>`).join("") + `</ul></div>`;
  }
  if (diff.removed?.length) {
    html += `<div class="diff-block"><h4>🔴 删除</h4><ul>` +
      diff.removed.map((s) => `<li>${esc(s.name || s.id)}（ID ${esc(s.id)}）</li>`).join("") + `</ul></div>`;
  }
  if (diff.modified?.length) {
    html += `<div class="diff-block"><h4>🟡 修改</h4>` + diff.modified.map((m) =>
      `<div><b>${esc(m.name)}</b>（ID ${esc(m.id)}）<table class="diff-table">` +
      m.changes.map((ch) => `<tr><td>${esc(ch.label)}</td><td class="before">${esc(ch.before) || "&lt;空&gt;"}</td><td class="after">${esc(ch.after) || "&lt;空&gt;"}</td></tr>`).join("") +
      `</table></div>`).join("") + `</div>`;
  }
  if (!diff.hasChanges) html = `<div class="empty">与上次相比没有变动 🎉</div>`;
  $("diffDetail").innerHTML = html;
}

// ---------- 事件绑定 ----------
document.querySelectorAll("input[name=mode]").forEach((r) => r.addEventListener("change", updateModeBoxes));

// 频率快捷按钮
function syncQuickSet() {
  const v = String($("intervalMinutes").value);
  document.querySelectorAll(".quick-set button").forEach((b) => {
    b.classList.toggle("active", b.dataset.v === v);
  });
}
document.querySelectorAll(".quick-set button").forEach((btn) => {
  btn.addEventListener("click", () => {
    $("intervalMinutes").value = btn.dataset.v;
    syncQuickSet();
  });
});
$("intervalMinutes").addEventListener("input", syncQuickSet);

// 商铺搜索（重置到第 1 页）
$("shopSearch").addEventListener("input", () => { shopPage = 1; renderShops(); });

// 分页点击（事件委托）
$("shopsPager").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-page]");
  if (!btn || btn.disabled) return;
  shopPage = Number(btn.dataset.page);
  renderShops();
  document.querySelector(".shops-full")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
});

// SMTP 弹窗
$("btnOpenSmtp").addEventListener("click", openSmtp);
$("btnCloseSmtp").addEventListener("click", closeSmtp);
$("smtpModal").addEventListener("click", (e) => { if (e.target.id === "smtpModal") closeSmtp(); });

// Lark 弹窗
$("btnOpenLark").addEventListener("click", openLark);
$("btnCloseLark").addEventListener("click", closeLark);
$("larkModal").addEventListener("click", (e) => { if (e.target.id === "larkModal") closeLark(); });
$("larkEnabled").addEventListener("change", updateLarkStatus);
$("larkWebhook").addEventListener("input", updateLarkStatus);

// 运行历史弹窗
$("btnHistory").addEventListener("click", openHistory);
$("btnCloseHistory").addEventListener("click", closeHistory);
$("historyModal").addEventListener("click", (e) => { if (e.target.id === "historyModal") closeHistory(); });
["histSearch", "histReason", "histResult"].forEach((id) => $(id).addEventListener("input", renderHistoryList));

// Esc 关闭任意打开的弹窗
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("smtpModal").hidden) closeSmtp();
  if (!$("larkModal").hidden) closeLark();
  if (!$("historyModal").hidden) closeHistory();
});

$("btnSaveLark").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  try {
    await api("/api/config", { method: "POST", body: collectLark() });
    updateLarkStatus();
    toast("Lark 配置已保存", "ok");
    closeLark();
  } catch (e) { toast(e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnTestLark").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  toast("正在发送 Lark 测试消息…");
  try {
    await api("/api/config", { method: "POST", body: collectLark() });
    await api("/api/test-lark", { method: "POST", body: {} });
    toast("Lark 测试消息已发送，请查看群消息", "ok");
  } catch (e) { toast("发送失败：" + e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnSaveSmtp").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  try {
    await api("/api/config", { method: "POST", body: collectSmtp() });
    updateSmtpStatus();
    toast("发件服务器已保存", "ok");
    closeSmtp();
  } catch (e) { toast(e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnSaveSchedule").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  try {
    await api("/api/config", { method: "POST", body: collectSchedule() });
    toast("发送周期已保存", "ok");
    await refreshStatus();
  } catch (e) { toast(e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnSaveComms").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  try {
    await api("/api/config", { method: "POST", body: collectComms() });
    updateSmtpStatus();
    updateLarkStatus();
    toast("通信配置已保存", "ok");
  } catch (e) { toast(e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnVerify").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  try {
    const { ok } = await api("/api/verify", { method: "POST" });
    applyVerifyPill({ ok, at: new Date().toISOString() });
    toast(ok ? "接口连通正常" : "接口校验失败", ok ? "ok" : "err");
  } catch (e) { toast(e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnPreview").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  toast("正在抓取最新数据…");
  try {
    const { result } = await api("/api/check-now", { method: "POST", body: { sendEmail: false } });
    if (result.ok === false) throw new Error(result.error);
    renderDiff(result.diff);
    toast("抓取完成", "ok");
    await loadShops();
    await refreshStatus();
  } catch (e) { toast(e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnTestEmail").addEventListener("click", async (ev) => {
  ev.target.disabled = true;
  toast("正在发送测试邮件…");
  try {
    // 先保存当前 SMTP/收件配置，确保用的是界面上的值
    await api("/api/config", { method: "POST", body: collectComms() });
    await api("/api/test-email", { method: "POST", body: {} });
    toast("测试邮件已发送，请查收", "ok");
  } catch (e) { toast("发送失败：" + e.message, "err"); }
  finally { ev.target.disabled = false; }
});

$("btnReloadShops").addEventListener("click", loadShops);

loadAll();
setInterval(refreshStatus, 30000);
