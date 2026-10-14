/* ============================================================
   本地存储 — 历史记录 / 收藏 / 偏好设置
   ============================================================ */

const KEY_HISTORY = 'tarot.history';
const KEY_FAVORITES = 'tarot.favorites';
const KEY_PREFS = 'tarot.prefs';

const MAX_HISTORY = 100;
const MAX_FAVORITES = 200;

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('读取本地存储失败', key, e);
    return [];
  }
}

function write(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('写入本地存储失败', key, e);
    return false;
  }
}

/* ---------------- 历史记录 ---------------- */

export function getHistory() {
  return read(KEY_HISTORY).sort((a, b) => b.timestamp - a.timestamp);
}

export function addHistory(entry) {
  const list = read(KEY_HISTORY);
  const record = {
    ...entry,
    id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  list.unshift(record);
  if (list.length > MAX_HISTORY) list.length = MAX_HISTORY;
  write(KEY_HISTORY, list);
  return record;
}

export function removeHistory(id) {
  write(KEY_HISTORY, read(KEY_HISTORY).filter(x => x.id !== id));
}

export function clearHistory() {
  write(KEY_HISTORY, []);
}

/* ---------------- 收藏 ---------------- */

export function getFavorites() {
  return read(KEY_FAVORITES).sort((a, b) => b.timestamp - a.timestamp);
}

export function addFavorite(entry) {
  const list = read(KEY_FAVORITES);
  const record = {
    ...entry,
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
  };
  list.unshift(record);
  if (list.length > MAX_FAVORITES) list.length = MAX_FAVORITES;
  write(KEY_FAVORITES, list);
  return record;
}

export function removeFavorite(id) {
  write(KEY_FAVORITES, read(KEY_FAVORITES).filter(x => x.id !== id));
}

export function isFavorite(key) {
  const list = read(KEY_FAVORITES);
  return list.some(x => x.favKey === key);
}

export function toggleFavorite(entry) {
  const key = entry.favKey || entry.address || entry.id;
  const list = read(KEY_FAVORITES);
  const existing = list.find(x => x.favKey === key);
  if (existing) {
    removeFavorite(existing.id);
    return false;
  }
  addFavorite({ ...entry, favKey: key });
  return true;
}

export function clearFavorites() {
  write(KEY_FAVORITES, []);
}

/* ---------------- 偏好设置 ---------------- */

const defaultPrefs = {
  theme: 'dark',
  defaultMethod: 'liuyao',
  defaultSpread: 'three',
  autoFetch: true,
};

export function getPrefs() {
  try {
    const raw = localStorage.getItem(KEY_PREFS);
    return { ...defaultPrefs, ...(raw ? JSON.parse(raw) : {}) };
  } catch (e) {
    return { ...defaultPrefs };
  }
}

export function setPref(key, value) {
  const prefs = getPrefs();
  prefs[key] = value;
  write(KEY_PREFS, prefs);
  return prefs;
}

/** 导出全部数据 */
export function exportAll() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    history: read(KEY_HISTORY),
    favorites: read(KEY_FAVORITES),
    prefs: getPrefs(),
  };
}

/** 导入数据 */
export function importAll(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('数据格式不正确');
  }
  if (Array.isArray(data.history)) write(KEY_HISTORY, data.history);
  if (Array.isArray(data.favorites)) write(KEY_FAVORITES, data.favorites);
  if (data.prefs) write(KEY_PREFS, { ...defaultPrefs, ...data.prefs });
  return true;
}
