// CHKC 商场数据开放接口 客户端
// 文档要点：
//   - 服务器: http://hkchkc.yzt3d.com/
//   - 鉴权: token = md5(api_key + "," + api_secret + "," + app_date) 取32位大写
//   - app_date 格式: PHP date('Y-m-d H')  例如 "2026-05-29 14"
//   - 提交方式: POST (application/x-www-form-urlencoded)
//   - 接口: Home/public/test (校验)  Home/public/getshop (商铺数据)

import crypto from "crypto";

// 接口返回的 JSON 中，部分字段（如营业时间）含有未转义的控制字符，
// 直接 JSON.parse 会报 "Bad control character"。这里先把所有控制字符转义。
const CTRL = new RegExp("[\\u0000-\\u001F]", "g");

function parseLooseJson(text) {
  const escaped = text.replace(CTRL, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
  return JSON.parse(escaped);
}

// app_date = date('Y-m-d H')，按服务器本地时间小时粒度
export function buildAppDate(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}`;
}

export function buildToken(apiKey, apiSecret, appDate) {
  return crypto.createHash("md5").update(`${apiKey},${apiSecret},${appDate}`).digest("hex").toUpperCase();
}

function normalizeBaseUrl(baseUrl) {
  return (baseUrl || "http://hkchkc.yzt3d.com/").replace(/\/+$/, "") + "/";
}

async function postForm(url, params, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

// 校验接口：成功返回 { code: 1, msg: "验证成功" }
// 接收配置形态 { key, secret, baseUrl }
export async function verify({ key, secret, baseUrl } = {}) {
  const appDate = buildAppDate();
  const token = buildToken(key, secret, appDate);
  const url = normalizeBaseUrl(baseUrl) + "Home/public/test";
  const { status, text } = await postForm(url, { api_key: key, token });
  let body;
  try { body = parseLooseJson(text); } catch { body = { raw: text }; }
  const ok = String(body.code) === "1";
  return { ok, status, appDate, body };
}

// 获取商铺数据：成功返回 { code: "200", msg: "操作成功", data: [...] }
// 接收配置形态 { key, secret, baseUrl }
export async function fetchShops({ key, secret, baseUrl } = {}) {
  const appDate = buildAppDate();
  const token = buildToken(key, secret, appDate);
  const url = normalizeBaseUrl(baseUrl) + "Home/public/getshop";
  const { status, text } = await postForm(url, { api_key: key, token });
  if (status !== 200) throw new Error(`接口请求失败 HTTP ${status}`);

  let body;
  try {
    body = parseLooseJson(text);
  } catch (e) {
    throw new Error(`接口返回解析失败: ${e.message}`);
  }
  if (!Array.isArray(body.data)) {
    throw new Error(`接口返回异常: code=${body.code} msg=${body.msg || ""}`);
  }
  return body.data;
}

// ---- 对照表（来自接口文档） ----
export const BUSINESS_CLASSIFY = {
  "1": "AV PRODUCTS ELECTRICAL APPLIANCES/影音及电器",
  "2": "BANKS/银行",
  "3": "BEAUTY PERSONAL CARE/美容及个人护理",
  "4": "DELI CONFECTIONARIES/轻便美食",
  "5": "FASHION/时装",
  "6": "FURNITURE HOUSEHOLD PRODUCTS/家居生活",
  "7": "GOLD JEWELLERY WATCHES OPTICAL ACCESSORIES/黄金珠宝手表及眼镜精品",
  "8": "LEATHER GOODS SHOES LUGGAGE/皮革制品及皮鞋行李",
  "9": "SPORTSWEAR EQUIPMENT/运动服装及用品",
  "10": "TRAVELS/旅行",
  "11": "OTHERS/其他",
};

export const FOODS = {
  "1": "Chinese Cuisine/中式",
  "2": "Deli Confectioneries/零售轻便美食",
  "3": "Asian Cuisine/东南亚",
  "4": "Western Cuisine/西式",
  "5": "Japanese/日式",
};

// 字段中文名（用于邮件展示）
export const FIELD_LABELS = {
  id: "业态ID",
  name: "商铺名称",
  name_2: "商铺名称(简)",
  name_3: "商铺名称(英)",
  nameinitial: "名称首字母",
  floor: "楼层",
  building_no: "广场序号",
  no: "商铺编号",
  business_classify: "类别",
  foods: "美食业态",
  tel: "电话",
  web: "网址",
  logo: "商铺图标",
  qrcode: "二维码",
  img_1: "商铺照片1",
  img_2: "商铺照片2",
  img_3: "商铺照片3",
  location: "位置",
  location_2: "位置(简)",
  location_3: "位置(英)",
  businesshour: "营业时间",
  businesshour_2: "营业时间(简)",
  businesshour_3: "营业时间(英)",
};
