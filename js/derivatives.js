/* ============================================================
   衍生品共识数据（Gate.io 永续合约）
   https://api.gateio.ws/api/v4/futures/usdt/

   为什么用永续合约代替预测市场：
   Polymarket / Kalshi / Manifold 在国内网络均不可达，实测全部超时。
   Gate.io 永续合约的「资金费率 + 多空账户比 + 持仓量」本质上是
   加密市场里最接近「人群共识」的可达信号——它反映的是真金白银的
   仓位分布，而不是吃瓜群众的投票。

   关键字段：
   tickers?contract=
     last                 最新价
     change_percentage    24h 涨跌幅（%）
     volume_24h_settle    24h 成交额（计价币结算口径）
     total_size           持仓量（张数）
     funding_rate         当前资金费率（单期）
     funding_rate_indicative  预估费率
     mark_price / index_price
     quanto_multiplier    每张合约对应的币数量

   contracts/{name}
     funding_interval     结算间隔（秒），USDT 本位为 28800 = 8 小时
     funding_next_apply   下次结算时间戳
     long_users           多头账户数
     short_users          空头账户数
     trade_size           累计成交张数
   ============================================================ */

const FUTURES_BASE = 'https://api.gateio.ws/api/v4/futures/usdt';
const TIMEOUT = 9000;
const CACHE_TTL = 90 * 1000;

/** 结算间隔 8 小时 → 每日 3 次 → 每年 1095 次 */
const FUNDING_INTERVAL_HOURS = 8;
const PERIODS_PER_YEAR = (24 / FUNDING_INTERVAL_HOURS) * 365;

const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data;
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, time: Date.now() });
  if (cache.size > 30) cache.delete(cache.keys().next().value);
}

/** 安全转数字 */
function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isNaN(n) || !Number.isFinite(n) ? fallback : n;
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

/** 资金费率折年化（返回小数，0.3 = 30%） */
export function annualizeFunding(rate) {
  return num(rate) * PERIODS_PER_YEAR;
}

/** 看板覆盖的合约（与现货看板同口径，便于对照） */
const PERPETUALS = [
  { symbol: 'BTC', contract: 'BTC_USDT', name: 'Bitcoin' },
  { symbol: 'ETH', contract: 'ETH_USDT', name: 'Ethereum' },
  { symbol: 'SOL', contract: 'SOL_USDT', name: 'Solana' },
  { symbol: 'XRP', contract: 'XRP_USDT', name: 'XRP' },
  { symbol: 'DOGE', contract: 'DOGE_USDT', name: 'Dogecoin' },
  { symbol: 'BNB', contract: 'BNB_USDT', name: 'BNB' },
  { symbol: 'AVAX', contract: 'AVAX_USDT', name: 'Avalanche' },
  { symbol: 'LINK', contract: 'LINK_USDT', name: 'Chainlink' },
  { symbol: 'TRX', contract: 'TRX_USDT', name: 'TRON' },
  { symbol: 'DOT', contract: 'DOT_USDT', name: 'Polkadot' },
];

/** 合并 ticker 与 contract 两个端点，产出统一的共识对象 */
function normalize(meta, ticker, detail) {
  if (!ticker) return null;
  if (ticker.contract && detail?.status && detail.status !== 'trading') return null;

  const fundingRate = num(
    ticker.funding_rate,
    num(detail?.funding_rate, 0)
  );
  const fundingAPR = annualizeFunding(fundingRate);

  const longUsers = num(detail?.long_users, 0);
  const shortUsers = num(detail?.short_users, 0);
  const accountLS = shortUsers > 0 ? longUsers / shortUsers : (longUsers > 0 ? 3 : 1);

  // total_size 是张数，乘以每张合约的币数量才是真实持仓
  const multiplier = num(ticker.quanto_multiplier, num(detail?.quanto_multiplier, 0));
  const oiContracts = num(ticker.total_size, 0);

  return {
    symbol: meta.symbol,
    contract: meta.contract,
    name: meta.name,

    last: num(ticker.last, 0),
    changePct: num(ticker.change_percentage, 0),
    high24h: num(ticker.high_24h, 0),
    low24h: num(ticker.low_24h, 0),

    // 共识核心
    fundingRate,
    fundingAPR,
    longUsers,
    shortUsers,
    accountLS,

    // 热度
    oiContracts,
    oiBase: oiContracts * multiplier,
    volume24h: num(ticker.volume_24h_settle, num(ticker.volume_24h_quote, 0)),

    nextFundingAt: num(detail?.funding_next_apply, 0) || null,
    url: `https://www.gate.com/futures/${meta.contract}`,
  };
}

/**
 * 并发拉取永续合约共识
 * @param {number} limit 展示数量上限（实际覆盖 PERPETUALS 全集后再截断）
 */
export async function fetchConsensus(limit = 10) {
  const key = `deriv:${limit}`;
  const cached = getCached(key);
  if (cached) return cached;

  const results = await Promise.allSettled(
    PERPETUALS.map(async (meta) => {
      const [ticker, detail] = await Promise.all([
        fetchJSON(`${FUTURES_BASE}/tickers?contract=${meta.contract}`).catch(() => null),
        fetchJSON(`${FUTURES_BASE}/contracts/${meta.contract}`, 6000).catch(() => null),
      ]);
      const t = Array.isArray(ticker) ? ticker[0] : ticker;
      return normalize(meta, t, detail);
    })
  );

  const list = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (!list.length) throw new Error('未取到合约数据');

  setCached(key, list);
  return list.slice(0, limit);
}

/** 排序模式 */
export const SORTS = {
  funding: (a, b) => Math.abs(b.fundingAPR) - Math.abs(a.fundingAPR),
  oi: (a, b) => b.oiBase - a.oiBase,
  volume: (a, b) => b.volume24h - a.volume24h,
};

/**
 * 共识倾向判定
 * 资金费率为正 = 多头付费给空头 = 多头仓位拥挤，为负则反之。
 * 极端费率往往意味着反向风险（轧空 / 多杀多）。
 */
export function fundingSentiment(c) {
  const apr = c?.fundingAPR ?? 0;
  if (apr >= 0.30) return { key: 'crowd-long', label: '多头拥挤', cls: 'verdict-bear', icon: '▲' };
  if (apr >= 0.10) return { key: 'lean-long', label: '偏多共识', cls: 'verdict-bull', icon: '◈' };
  if (apr > -0.10) return { key: 'neutral', label: '多空均衡', cls: 'verdict-neutral', icon: '◆' };
  if (apr > -0.30) return { key: 'lean-short', label: '偏空共识', cls: 'verdict-bear', icon: '◈' };
  return { key: 'crowd-short', label: '空头拥挤', cls: 'verdict-bull', icon: '▽' };
}

/**
 * 共识看多度 0~100（50 为中性）
 * 资金费率折年化后线性映射，再夹逼到有效区间
 */
export function consensusScore(c) {
  const apr = c?.fundingAPR ?? 0;
  const raw = 50 + apr * 120;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** 距下次资金费率结算的剩余秒数 */
export function secondsToFunding(c) {
  if (!c?.nextFundingAt) return null;
  const diff = c.nextFundingAt * 1000 - Date.now();
  if (Number.isNaN(diff) || diff < 0) return null;
  return Math.floor(diff / 1000);
}

/**
 * 按合约名取单个共识（占卜联动用）
 * token 来自 market.js 的 queryToken，带 pair / symbol
 */
export async function findConsensus(token) {
  if (!token) return null;

  const contract = /^[A-Z0-9]+_USDT$/i.test(token.pair || '')
    ? String(token.pair).toUpperCase()
    : (token.symbol ? `${String(token.symbol).toUpperCase()}_USDT` : null);

  if (!contract) return null;

  const key = `deriv:one:${contract}`;
  const cached = getCached(key);
  if (cached !== undefined) return cached;

  const meta = {
    symbol: token.symbol || contract.split('_')[0],
    contract,
    name: token.name || token.symbol || contract.split('_')[0],
  };

  try {
    const [ticker, detail] = await Promise.all([
      fetchJSON(`${FUTURES_BASE}/tickers?contract=${contract}`, 7000),
      fetchJSON(`${FUTURES_BASE}/contracts/${contract}`, 5000).catch(() => null),
    ]);
    const t = Array.isArray(ticker) ? ticker[0] : ticker;
    const item = normalize(meta, t, detail);
    setCached(key, item || null);
    return item;
  } catch (e) {
    // 取不到不阻塞占卜主流程
    setCached(key, null);
    return null;
  }
}
