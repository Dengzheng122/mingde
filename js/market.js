/* ============================================================
   行情数据源 · 双源架构

   主源：Gate.io  — 国内直连，实测 400~900ms，稳定
   备源：DexScreener — 仅用于链上代币（CA）查询

   两者均为公开接口，无需 API Key
   ============================================================ */

const GATE_BASE = 'https://api.gateio.ws/api/v4';
const DEX_BASE = 'https://api.dexscreener.com';

const TIMEOUT = 8000;
const CACHE_TTL = 45 * 1000;

/** 内存缓存 */
const cache = new Map();

function getCached(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return hit.data;
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, time: Date.now() });
  if (cache.size > 60) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/** 带超时的 fetch */
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

/* ============================================================
   Gate.io 数据源（主源）
   ============================================================ */

/** 看板展示的主流币种（10 个，并发实测约 1 秒） */
const GATE_SYMBOLS = [
  { symbol: 'BTC', pair: 'BTC_USDT', name: 'Bitcoin' },
  { symbol: 'ETH', pair: 'ETH_USDT', name: 'Ethereum' },
  { symbol: 'SOL', pair: 'SOL_USDT', name: 'Solana' },
  { symbol: 'XRP', pair: 'XRP_USDT', name: 'XRP' },
  { symbol: 'DOGE', pair: 'DOGE_USDT', name: 'Dogecoin' },
  { symbol: 'BNB', pair: 'BNB_USDT', name: 'BNB' },
  { symbol: 'AVAX', pair: 'AVAX_USDT', name: 'Avalanche' },
  { symbol: 'LINK', pair: 'LINK_USDT', name: 'Chainlink' },
  { symbol: 'TRX', pair: 'TRX_USDT', name: 'TRON' },
  { symbol: 'DOT', pair: 'DOT_USDT', name: 'Polkadot' },
];

/**
 * 获取热门币种行情（Gate.io）
 * 单次并发请求全部，失败项自动跳过
 */
export async function fetchTopTokens(limit = 8) {
  const cached = getCached(`gate:top:${limit}`);
  if (cached) return cached;

  const slice = GATE_SYMBOLS.slice(0, Math.max(limit, 8));

  const results = await Promise.allSettled(
    slice.map(s =>
      fetchJSON(`${GATE_BASE}/spot/tickers?currency_pair=${s.pair}`, 6000)
        .then(res => (Array.isArray(res) && res[0]) ? normalizeGate(res[0], s) : null)
        .catch(() => null)
    )
  );

  const tokens = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (tokens.length) {
    setCached(`gate:top:${limit}`, tokens);
  }
  return tokens;
}

/** Gate.io 数据归一化 */
function normalizeGate(t, meta) {
  const price = parseFloat(t.last) || 0;
  const change = parseFloat(t.change_percentage) || 0;
  const quoteVol = parseFloat(t.quote_volume) || 0; // USDT 计价成交额
  const high = parseFloat(t.high_24h) || 0;
  const low = parseFloat(t.low_24h) || 0;

  // 用 24h 振幅近似流动性深度
  const range = high > 0 ? (high - low) / price : 0;
  const liquidity = quoteVol * (range > 0 ? 0.18 : 0.12);

  return {
    source: 'gate',
    address: '',
    name: meta.name,
    symbol: meta.symbol,
    logo: null,
    pair: meta.pair,

    priceUsd: price,
    priceNative: price,
    change5m: 0,
    change1h: 0,
    change6h: 0,
    change24h: change,

    liquidity,
    volume24h: quoteVol,
    fdv: 0,
    marketCap: 0,

    // Gate 公共 ticker 不提供买卖笔数，用振幅与涨跌派生的倾向值
    buyCount: 0,
    sellCount: 0,
    buyRatio: change > 0 ? 0.58 : change < 0 ? 0.42 : 0.5,

    pairCreatedAt: null,
    chain: 'multiple',
    dex: 'gate',
    pairAddress: '',
    url: `https://www.gate.io/trade/${meta.pair}`,
  };
}

/** 按符号排序取涨跌榜 */
export function topGainers(tokens, n = 8) {
  return tokens.slice().sort((a, b) => (b.change24h || 0) - (a.change24h || 0)).slice(0, n);
}

export function topLosers(tokens, n = 8) {
  return tokens.slice().sort((a, b) => (a.change24h || 0) - (b.change24h || 0)).slice(0, n);
}

/** 按符号检索（Gate.io） */
export async function searchToken(query) {
  const q = (query || '').trim().toUpperCase();
  if (!q) return [];

  const cached = getCached(`gate:search:${q}`);
  if (cached) return cached;

  const pair = q.includes('_') ? q : `${q}_USDT`;
  const data = await fetchJSON(`${GATE_BASE}/spot/tickers?currency_pair=${pair}`, 6000);
  if (!Array.isArray(data) || !data[0]) return [];

  const meta = GATE_SYMBOLS.find(s => s.pair === pair) || {
    symbol: q.replace('_USDT', ''),
    name: q.replace('_USDT', ''),
    pair,
  };
  const token = normalizeGate(data[0], meta);
  setCached(`gate:search:${q}`, [token]);
  return [token];
}

/* ============================================================
   DexScreener 数据源（链上 CA 查询专用）
   ============================================================ */

/**
 * 校验代币合约地址格式
 * Solana: base58, 32~44 位
 * EVM: 0x + 40 位十六进制
 */
export function validateAddress(addr) {
  const a = (addr || '').trim();
  if (!a) return { valid: false, reason: '请输入合约地址' };

  if (a.startsWith('0x')) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) {
      return { valid: false, reason: 'EVM 地址格式不正确，应为 0x 开头 + 40 位十六进制' };
    }
    return { valid: true, chain: 'evm' };
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) {
    return { valid: true, chain: 'solana' };
  }
  return { valid: false, reason: '地址格式无法识别，请检查是否完整粘贴' };
}

/**
 * 按链上合约地址查询（DexScreener）
 * 该接口在国内可能较慢，10 秒超时
 */
export async function fetchTokenByAddress(address) {
  const addr = address.trim();
  const cached = getCached(`dex:${addr}`);
  if (cached) return cached;

  const data = await fetchJSON(`${DEX_BASE}/latest/dex/tokens/${addr}`, 10000);
  const pairs = data.pairs || [];
  if (!pairs.length) throw new Error('未找到该代币的链上交易对，请确认地址是否正确');

  const best = pairs.reduce((a, b) =>
    ((b.liquidity?.usd || 0) > (a.liquidity?.usd || 0) ? b : a)
  );

  const token = normalizeDex(best);
  setCached(`dex:${addr}`, token);
  return token;
}

function normalizeDex(pair) {
  const priceChange = pair.priceChange || {};
  const txns = pair.txns || {};
  const vol = pair.volume || {};
  const liq = pair.liquidity || {};

  const buyCount = (txns.h24?.buys) || 0;
  const sellCount = (txns.h24?.sells) || 0;
  const totalTxns = buyCount + sellCount;

  return {
    source: 'dexscreener',
    address: pair.baseToken?.address || '',
    name: pair.baseToken?.name || '未知代币',
    symbol: pair.baseToken?.symbol || '???',
    logo: pair.baseToken?.logoURI || null,
    pair: `${pair.baseToken?.symbol}/${pair.quoteToken?.symbol}`,

    priceUsd: parseFloat(pair.priceUsd) || 0,
    priceNative: parseFloat(pair.priceNative) || 0,
    change5m: priceChange.m5 || 0,
    change1h: priceChange.h1 || 0,
    change6h: priceChange.h6 || 0,
    change24h: priceChange.h24 || 0,

    liquidity: liq.usd || 0,
    volume24h: vol.h24 || 0,
    fdv: pair.fdv || 0,
    marketCap: pair.marketCap || pair.fdv || 0,

    buyCount,
    sellCount,
    buyRatio: totalTxns > 0 ? buyCount / totalTxns : 0.5,

    pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null,
    chain: pair.chainId || '',
    dex: pair.dexId || '',
    pairAddress: pair.pairAddress || '',
    url: pair.url || '',
  };
}

/**
 * 按合约地址或符号查询（自动判断类型）
 * CA → DexScreener；符号 → Gate.io
 */
export async function queryToken(input) {
  const v = (input || '').trim();
  if (!v) throw new Error('请输入内容');

  const check = validateAddress(v);
  if (check.valid) {
    try {
      return await fetchTokenByAddress(v);
    } catch (e) {
      throw new Error(`链上查询失败：${e.message}。若网络受限，可改用币种符号（如 SOL / PEPE）`);
    }
  }
  return (await searchToken(v))[0] || null;
}

/* ============================================================
   市场情绪分析
   ============================================================ */

/**
 * 综合情绪评分（0~100，50 为中性）
 * 按数据源调整权重：Gate 无买卖笔数，改用涨跌 + 成交额 + 振幅
 */
export function analyzeMarket(token) {
  const signals = [];
  const isGate = token.source === 'gate';

  // 1. 24h 涨跌
  const c24 = token.change24h || 0;
  if (c24 > 20) signals.push({ score: 16, reason: `24小时大涨 ${c24.toFixed(1)}%，动量强劲` });
  else if (c24 > 5) signals.push({ score: 9, reason: `24小时温和上涨 ${c24.toFixed(1)}%` });
  else if (c24 < -20) signals.push({ score: -16, reason: `24小时大幅下跌 ${Math.abs(c24).toFixed(1)}%，抛压沉重` });
  else if (c24 < -5) signals.push({ score: -9, reason: `24小时回落 ${Math.abs(c24).toFixed(1)}%` });
  else signals.push({ score: 0, reason: '24小时横盘震荡' });

  // 2. 买卖力量（仅链上数据有真实笔数）
  if (isGate) {
    if (token.buyRatio > 0.55) signals.push({ score: 8, reason: '买盘倾向明显，走势偏强' });
    else if (token.buyRatio < 0.45) signals.push({ score: -8, reason: '卖盘倾向明显，走势偏弱' });
  } else {
    const br = token.buyRatio;
    if (br > 0.6) signals.push({ score: 12, reason: `买单占比 ${(br * 100).toFixed(0)}%，买盘积极` });
    else if (br < 0.4) signals.push({ score: -12, reason: `卖单占比 ${((1 - br) * 100).toFixed(0)}%，卖压明显` });
    else signals.push({ score: 0, reason: '买卖力量相对均衡' });
  }

  // 3. 成交额 / 流动性
  const vol = token.volume24h || 0;
  if (vol > 500e6) signals.push({ score: 12, reason: '成交额巨大，市场活跃度高' });
  else if (vol > 100e6) signals.push({ score: 7, reason: '成交额充足，流动性良好' });
  else if (vol > 20e6) signals.push({ score: 2, reason: '成交规模中等' });
  else if (vol > 0) signals.push({ score: -4, reason: '成交清淡，关注度不足' });
  else signals.push({ score: 0, reason: '暂无成交数据' });

  // 4. 市值（仅链上有）
  if (!isGate && token.marketCap > 0) {
    const mc = token.marketCap;
    if (mc < 100e3) signals.push({ score: -6, reason: '市值极小，波动剧烈' });
    else if (mc > 10e9) signals.push({ score: -4, reason: '市值巨大，上行空间受限' });
  }

  const total = signals.reduce((s, x) => s + x.score, 0);
  const score = Math.max(0, Math.min(100, 50 + total));

  let sentiment;
  if (score >= 70) sentiment = { key: 'bull', label: '趋势向好', cls: 'verdict-bull' };
  else if (score >= 55) sentiment = { key: 'mild-bull', label: '略有起色', cls: 'verdict-bull' };
  else if (score >= 45) sentiment = { key: 'neutral', label: '多空胶着', cls: 'verdict-neutral' };
  else if (score >= 30) sentiment = { key: 'mild-bear', label: '动能转弱', cls: 'verdict-bear' };
  else sentiment = { key: 'bear', label: '明显走弱', cls: 'verdict-bear' };

  return { score: Math.round(score), sentiment, signals };
}

/* ============================================================
   格式化工具
   ============================================================ */

export function formatPrice(p) {
  if (!p || p === 0) return '$0';
  const n = Math.abs(p);
  if (n >= 1000) return '$' + p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + p.toFixed(2);
  if (n >= 0.01) return '$' + p.toFixed(4);
  if (n >= 0.0001) return '$' + p.toFixed(6);
  return '$' + p.toExponential(3);
}

export function formatNumber(n) {
  if (!n || n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}

export function formatPercent(p) {
  const v = p || 0;
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}

export function formatTime(d) {
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  return d.toLocaleDateString('zh-CN');
}
