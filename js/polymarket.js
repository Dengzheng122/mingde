/* ============================================================
   Polymarket 预测市场数据
   Gamma API：https://gamma-api.polymarket.com

   官方字段说明（docs.polymarket.com）：
   - conditionId        市场标识（用于链上查询，非交易标的）
   - clobTokenIds       JSON 编码字符串数组，与 outcomes 索引对齐
   - outcomes           JSON 编码字符串数组，如 '["Yes","No"]'
   - outcomePrices      JSON 编码字符串数组，最后成交价
   - active             是否已上架且活跃
   - closed             是否已结算
   - acceptingOrders    CLOB 当前是否接受挂单
   - bestBid/bestAsk    指示性买一/卖一价
   - lastTradePrice     最后成交价（Gamma 里的权威价格字段）
   - volume24hr         24 小时成交额（USDC）
   - endDate            结算时间（ISO 8601）

   注意事项（官方明确提示）：
   1. outcomes / outcomePrices / clobTokenIds 是 JSON 编码字符串，需二次解析
   2. Yes 不保证在索引 0，必须按名称从 outcomes 数组映射
   3. Gamma 价格仅供参考，下单需走 CLOB 实时订单簿
   ============================================================ */

const GAMMA = 'https://gamma-api.polymarket.com';
const TIMEOUT = 9000;
const CACHE_TTL = 90 * 1000;

const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data;
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, time: Date.now() });
  if (cache.size > 30) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

async function fetchJSON(url, timeout = TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('请求超时');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 解析 Gamma 的 JSON 编码字符串字段 */
function parseJsonField(value, fallback) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }
  return fallback;
}

/** 安全转数字 */
function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * 归一化单个市场（严格按官方字段名）
 */
function normalizeMarket(m) {
  if (!m) return null;

  // 官方推荐的可交易判定：active && !closed
  if (m.active === false || m.closed === true) return null;

  // outcomes 与 outcomePrices 均需二次解析，且索引对齐
  const outcomes = parseJsonField(m.outcomes, []);
  const prices = parseJsonField(m.outcomePrices, []);
  if (outcomes.length < 2 || prices.length < 2) return null;

  // 按名称映射 Yes/No，不硬编码索引
  const yesIdx = outcomes.findIndex(o => String(o).trim().toLowerCase() === 'yes');
  const noIdx = outcomes.findIndex(o => String(o).trim().toLowerCase() === 'no');

  const yesIdxFinal = yesIdx >= 0 ? yesIdx : 0;
  const noIdxFinal = noIdx >= 0 ? noIdx : (prices.length > 1 ? 1 : 0);

  let yes = num(prices[yesIdxFinal], NaN);
  if (Number.isNaN(yes)) return null;

  let no = num(prices[noIdxFinal], NaN);
  if (Number.isNaN(no)) no = Math.max(0, 1 - yes);

  // lastTradePrice 为 Gamma 官方标注的价格字段；outcomePrices 即其对齐值
  const lastTrade = num(m.lastTradePrice, yes);

  const volume24h = num(m.volume24hr, 0);
  const totalVolume = num(m.volume, 0);
  const liquidity = num(m.liquidity, 0);
  const openInterest = num(m.openInterest, 0);

  // 24h 价格变化：官方字段为 oneDayPriceChange（价格口径，非百分比口径）
  const change24h = num(m.oneDayPriceChange, 0);

  return {
    id: m.id || '',
    conditionId: m.conditionId || '',
    question: m.question || '',
    slug: m.slug || '',
    description: m.description || '',

    outcomes,
    prices,
    yesPrice: yes,
    noPrice: no,
    lastTradePrice: lastTrade,

    // 官方价格字段
    bestBid: num(m.bestBid, 0),
    bestAsk: num(m.bestAsk, 0),

    // 概率百分比
    yesPct: Math.round(yes * 100),
    noPct: Math.round(no * 100),

    volume24hr: volume24h,
    volume: totalVolume,
    liquidity,
    openInterest,

    change24h,

    startDate: m.startDate || null,
    endDate: m.endDate || null,

    marketType: m.marketType || null,
    negRisk: m.negRisk === true,
    acceptingOrders: m.acceptingOrders === true,

    url: `https://polymarket.com/event/${m.slug || ''}`,
  };
}

/**
 * 获取热门预测市场
 * @param {number} limit 数量
 * @param {'volume'|'new'|'crypto'} filter 排序/筛选
 */
export async function fetchMarkets(limit = 8, filter = 'volume') {
  const cached = getCached(`pm:${filter}:${limit}`);
  if (cached) return cached;

  const params = new URLSearchParams({
    active: 'true',
    closed: 'false',
    limit: String(Math.min(limit * 2, 100)),
  });

  if (filter === 'new') {
    params.set('order', 'startDate');
    params.set('ascending', 'false');
  } else if (filter === 'crypto') {
    // 官方 tag_slug 筛选；无匹配时回退到全量再客户端筛选
    params.set('tag_slug', 'crypto');
    params.set('order', 'volume24hr');
    params.set('ascending', 'false');
  } else {
    params.set('order', 'volume24hr');
    params.set('ascending', 'false');
  }

  const data = await fetchJSON(`${GAMMA}/markets?${params.toString()}`);
  if (!Array.isArray(data)) throw new Error('返回格式异常');

  let markets = data.map(normalizeMarket).filter(Boolean);

  // 加密筛选回退：客户端关键词过滤
  if (filter === 'crypto' && markets.length < limit) {
    const fallback = await fetchJSON(
      `${GAMMA}/markets?active=true&closed=false&limit=100&order=volume24hr&ascending=false`
    ).catch(() => []);
    const crypto = (Array.isArray(fallback) ? fallback : [])
      .map(normalizeMarket)
      .filter(Boolean)
      .filter(isCryptoMarket);
    const seen = new Set(markets.map(m => m.id || m.slug));
    markets = markets.concat(crypto.filter(m => !seen.has(m.id || m.slug)));
  }

  // 过滤掉概率已定的市场（100% / 0% 已无参考价值）
  markets = markets.filter(m => m.yesPct > 2 && m.yesPct < 98);

  // 排序
  if (filter === 'new') {
    markets.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
  } else {
    markets.sort((a, b) => b.volume24hr - a.volume24hr);
  }

  const result = markets.slice(0, limit);
  setCached(`pm:${filter}:${limit}`, result);
  return result;
}

/** 判断市场是否属于加密相关 */
export function isCryptoMarket(market) {
  const text = `${market.question} ${market.description || ''}`.toLowerCase();
  const keys = ['bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'crypto', 'token',
    'defi', 'nft', 'altcoin', 'xrp', 'doge', 'stablecoin', 'blockchain',
    'monetary', 'fed', 'interest rate', 'inflation', 'microstrategy', 'saylor'];
  return keys.some(k => text.includes(k));
}

/**
 * 判断概率倾向
 * 概率极端意味着共识强烈，接近 50% 意味着分歧大
 */
export function probSentiment(market) {
  const p = market.yesPct;
  if (p >= 85) return { key: 'high-conf', label: '共识强烈', cls: 'verdict-bull', icon: '▲' };
  if (p >= 65) return { key: 'lean-yes', label: '偏多共识', cls: 'verdict-bull', icon: '◈' };
  if (p > 35) return { key: 'split', label: '分歧显著', cls: 'verdict-neutral', icon: '◆' };
  if (p > 15) return { key: 'lean-no', label: '偏空共识', cls: 'verdict-bear', icon: '◈' };
  return { key: 'low-conf', label: '高度不确定', cls: 'verdict-bear', icon: '▽' };
}

/**
 * 检索与某代币相关的预测市场
 * 官方：/public-search 用 q 参数（非 query），分页用 limit_per_type
 */
export async function findRelatedMarket(token) {
  if (!token || !token.symbol) return null;

  const cached = getCached(`pm:find:${token.symbol}`);
  if (cached !== undefined) return cached;

  const q = token.symbol.toLowerCase();
  try {
    const data = await fetchJSON(
      `${GAMMA}/public-search?q=${encodeURIComponent(q)}&limit_per_type=6`,
      7000
    );
    const events = data?.events || [];
    for (const ev of events) {
      for (const m of ev.markets || []) {
        const item = normalizeMarket(m);
        if (item && item.yesPct > 2 && item.yesPct < 98 && item.volume24hr > 5000) {
          setCached(`pm:find:${token.symbol}`, item);
          return item;
        }
      }
    }
  } catch (e) {
    // 检索失败不阻塞占卜主流程
  }

  setCached(`pm:find:${token.symbol}`, null);
  return null;
}

/** 距结算天数 */
export function daysLeft(market) {
  if (!market || !market.endDate) return null;
  const diff = new Date(market.endDate).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  return Math.floor(diff / 86400000);
}
