/* ============================================================
   市场速览看板
   ============================================================ */

import { fetchTopTokens, topGainers, topLosers, analyzeMarket, formatPrice, formatPercent } from './market.js';
import { escapeHtml } from './interpret.js';

const state = {
  tokens: [],
  mode: 'hot',
  loading: false,
  updatedAt: null,
  autoTimer: null,
};

const REFRESH_INTERVAL = 90 * 1000; // 90 秒自动刷新

/** 币种图标（CoinGecko CDN，加载失败时回退到文字符号） */
const ICON_MAP = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple',
  DOGE: 'dogecoin', BNB: 'binancecoin', AVAX: 'avalanche-2',
  LINK: 'chainlink', TRX: 'tron', DOT: 'polkadot', ADA: 'cardano',
  MATIC: 'matic-network', PEPE: 'pepe', SHIB: 'shiba-inu',
};

/** CoinGecko 图片 ID */
const ICON_ID = {
  bitcoin: 1, ethereum: 279, solana: 4128, ripple: 44,
  dogecoin: 5, binancecoin: 825, 'avalanche-2': 12559,
  chainlink: 877, tron: 1094, polkadot: 12171, cardano: 975,
  'matic-network': 4713, pepe: 29850, 'shiba-inu': 11939,
};

function tokenIcon(token) {
  if (token.logo) return token.logo;
  const key = ICON_MAP[(token.symbol || '').toUpperCase()];
  if (!key) return null;
  return `https://assets.coingecko.com/coins/images/${ICON_ID[key] || 1}/large/${key}.png`;
}

/** 文字符号兜底，保证没有图也能好看 */
const FALLBACK_GLYPH = {
  BTC: '₿', ETH: 'Ξ', SOL: '◎', XRP: '✕', DOGE: 'Ð',
  BNB: '◆', AVAX: '▲', LINK: '⬡', TRX: 'T', DOT: '●', ADA: '₳',
  PEPE: '🐸', SHIB: '🐕',
};

/**
 * 初始化看板
 * @param {object} handlers { onPick }
 */
export function initMarketBoard(handlers = {}) {
  const grid = document.getElementById('marketGrid');
  const tabs = document.getElementById('marketTabs');
  const refreshBtn = document.getElementById('marketRefresh');
  const stamp = document.getElementById('marketStamp');

  if (!grid) return;

  // 切换榜单模式
  tabs?.addEventListener('click', (e) => {
    const tab = e.target.closest('.market-tab');
    if (!tab) return;
    state.mode = tab.dataset.mode;
    tabs.querySelectorAll('.market-tab').forEach(t => t.classList.toggle('active', t === tab));
    renderGrid();
  });

  // 手动刷新
  refreshBtn?.addEventListener('click', () => {
    state.tokens = []; // 清缓存强制拉取
    loadMarket();
  });

  // 点击代币 → 回填到占卜输入
  grid.addEventListener('click', (e) => {
    const card = e.target.closest('.quote-card');
    if (!card) return;
    const idx = Number(card.dataset.idx);
    const token = getVisible()[idx];
    if (token && handlers.onPick) handlers.onPick(token);
  });

  // 首次加载
  loadMarket();

  // 自动刷新
  state.autoTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadMarket(true);
  }, REFRESH_INTERVAL);
}

/** 当前模式下的可见列表 */
function getVisible() {
  if (!state.tokens.length) return [];
  if (state.mode === 'gainers') return topGainers(state.tokens, 8);
  if (state.mode === 'losers') return topLosers(state.tokens, 8);
  return state.tokens.slice(0, 8);
}

/** 拉取行情 */
async function loadMarket(silent = false) {
  if (state.loading) return;
  state.loading = true;

  const refreshBtn = document.getElementById('marketRefresh');
  refreshBtn?.classList.add('spinning');

  try {
    const tokens = await fetchTopTokens(10);
    if (!tokens.length) throw new Error('未获取到行情数据');
    state.tokens = tokens;
    state.updatedAt = new Date();
    renderGrid();
  } catch (err) {
    renderError(err.message);
  } finally {
    state.loading = false;
    refreshBtn?.classList.remove('spinning');
  }
}

/** 渲染网格 */
function renderGrid() {
  const grid = document.getElementById('marketGrid');
  if (!grid) return;

  const list = getVisible();

  if (!list.length) {
    grid.innerHTML = `<div class="market-error"><span>暂无行情数据</span></div>`;
    updateStamp();
    return;
  }

  grid.innerHTML = `<div class="market-grid">
    ${list.map((t, i) => {
      const chg = t.change24h || 0;
      const cls = chg > 0.5 ? 'up' : chg < -0.5 ? 'down' : '';
      const m = analyzeMarket(t);
      const icon = tokenIcon(t);
      const glyph = FALLBACK_GLYPH[(t.symbol || '').toUpperCase()] || '◆';

      const avatar = icon
        ? `<img class="quote-logo" src="${escapeHtml(icon)}" alt="" loading="lazy"
             onerror="this.outerHTML='<div class=\\'quote-logo quote-logo-fallback\\'>${glyph}</div>'">`
        : `<div class="quote-logo quote-logo-fallback">${glyph}</div>`;

      return `
        <button class="quote-card ${cls}" data-idx="${i}" type="button" title="点击对 ${escapeHtml(t.symbol)} 起卦">
          ${avatar}
          <div class="quote-body">
            <div class="quote-symbol">$${escapeHtml(t.symbol)}</div>
            <div class="quote-sub">${escapeHtml((t.name || '').slice(0, 14))} · ${m.score}分</div>
          </div>
          <div class="quote-right">
            <div class="quote-price">${formatPrice(t.priceUsd)}</div>
            <div class="quote-change ${chg >= 0 ? 'price-up' : 'price-down'}">${formatPercent(chg)}</div>
          </div>
        </button>
      `;
    }).join('')}
  </div>`;

  updateStamp();
}

/** 渲染错误态 */
function renderError(msg) {
  const grid = document.getElementById('marketGrid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="market-error">
      <span>⚠ 行情接口暂时不可用（${escapeHtml(msg)}）。占卜功能不受影响，可手动输入合约地址查询。</span>
      <button class="btn btn-ghost btn-sm" onclick="location.reload()" type="button">重试</button>
    </div>
  `;
  updateStamp();
}

/** 更新时间戳 */
function updateStamp() {
  const stamp = document.getElementById('marketStamp');
  if (!stamp) return;

  if (!state.updatedAt) {
    stamp.innerHTML = `<span class="live-dot" style="background:var(--danger);"></span><span>未连接</span>`;
    return;
  }

  const diff = Math.floor((Date.now() - state.updatedAt.getTime()) / 1000);
  const ago = diff < 60 ? `${diff} 秒前` : `${Math.floor(diff / 60)} 分钟前`;

  stamp.innerHTML = `
    <span class="live-dot"></span>
    <span>${state.updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新 · ${ago}</span>
  `;
}
