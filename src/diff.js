// 比对两次商铺数据，得出新增 / 修改 / 删除
import { FIELD_LABELS } from "./api.js";

// 以 id 作为主键比对
export function diffShops(oldShops, newShops) {
  const oldMap = new Map((oldShops || []).map((s) => [String(s.id), s]));
  const newMap = new Map((newShops || []).map((s) => [String(s.id), s]));

  const added = [];
  const removed = [];
  const modified = [];

  for (const [id, shop] of newMap) {
    if (!oldMap.has(id)) {
      added.push(shop);
    } else {
      const before = oldMap.get(id);
      const changes = diffFields(before, shop);
      if (changes.length > 0) {
        modified.push({ id, name: shop.name || before.name || id, changes });
      }
    }
  }

  for (const [id, shop] of oldMap) {
    if (!newMap.has(id)) removed.push(shop);
  }

  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;
  return {
    added,
    removed,
    modified,
    hasChanges,
    counts: { added: added.length, removed: removed.length, modified: modified.length },
    totalOld: oldMap.size,
    totalNew: newMap.size,
  };
}

function diffFields(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changes = [];
  for (const key of keys) {
    const a = norm(before?.[key]);
    const b = norm(after?.[key]);
    if (a !== b) {
      changes.push({ field: key, label: FIELD_LABELS[key] || key, before: a, after: b });
    }
  }
  return changes;
}

function norm(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}
