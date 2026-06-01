// 配置、快照、运行历史的持久化（JSON 文件存储）
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "..", "data");
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const SNAPSHOT_FILE = path.join(DATA_DIR, "snapshot.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const DEFAULT_CONFIG = {
  api: {
    key: "es",
    secret: "rc8Xuwl1o9NLlXCWW1HcM1E4be",
    baseUrl: "http://hkchkc.yzt3d.com/",
  },
  recipients: [],            // 收件邮箱列表
  schedule: {
    mode: "interval",        // "interval" 间隔 | "daily" 每天定时
    intervalMinutes: 60,     // interval 模式：每隔多少分钟
    dailyTime: "09:00",      // daily 模式：每天几点（HH:MM，24h）
  },
  smtp: {
    host: "",
    port: 465,
    secure: true,            // 465 用 SSL=true；587 用 false(STARTTLS)
    user: "",
    pass: "",
    from: "",                // 发件人显示地址，留空则用 user
  },
  lark: {
    enabled: false,          // 是否启用 Lark 通知
    webhook: "",             // Lark 群自定义机器人 Webhook 地址
    secret: "",              // 可选：签名校验 Secret
  },
  notifyWhenNoChange: false,  // 无变动时是否也发邮件
  enabled: false,             // 定时任务总开关
};

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// 深合并，保证新增的默认字段在旧配置上也存在
function mergeConfig(base, override) {
  const out = { ...base };
  for (const k of Object.keys(override || {})) {
    const v = override[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" && !Array.isArray(base[k])) {
      out[k] = mergeConfig(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function getConfig() {
  const stored = readJson(CONFIG_FILE, {});
  return mergeConfig(DEFAULT_CONFIG, stored);
}

export function saveConfig(partial) {
  const next = mergeConfig(getConfig(), partial);
  writeJson(CONFIG_FILE, next);
  return next;
}

// 快照：上一次拿到的商铺数据，用于比对
export function getSnapshot() {
  return readJson(SNAPSHOT_FILE, null); // { fetchedAt, shops: [...] }
}

export function saveSnapshot(shops) {
  const snap = { fetchedAt: new Date().toISOString(), shops };
  writeJson(SNAPSHOT_FILE, snap);
  return snap;
}

// 运行历史（最近 N 条）
export function getHistory() {
  return readJson(HISTORY_FILE, []);
}

export function addHistory(entry) {
  const list = getHistory();
  list.unshift({ at: new Date().toISOString(), ...entry });
  writeJson(HISTORY_FILE, list.slice(0, 50));
}

export const PATHS = { DATA_DIR, CONFIG_FILE, SNAPSHOT_FILE, HISTORY_FILE };
