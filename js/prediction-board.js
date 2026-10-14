/* ============================================================
   预测市场看板（Polymarket）
   ============================================================ */

import { fetchMarkets, probSentiment, daysLeft } from './polymarket.js';
import { escapeHtml } from './interpret.js';
import { formatNumber } from './market.js';

const state = {
  markets: [],
  filter: 'volume',
  loading: false,
  updatedAt: null,
  timer: null,
};

const REFRESH_INTERVAL = 120 * 1000; // 2 分钟

/** 初始化 */
export function initPredictionBoard() {
  const board = document.getElementById('predBoard');
  const tabs = document.getElementById('predTabs');
  const refreshBtn = document.getElementById('predRefresh');

  if (!board) return;

  tabs?.addEventListener('click', (e) => {
    const tab = e.target.closest('.pred-tab');
    if (!tab) return;
    state.filter = tab.dataset.filter;
    tabs.querySelectorAll('.pred-tab').forEach(t => t.classList.toggle('active', t === tab));
    load();
  });

  refreshBtn?.addEventListener('click', () => {
    state.markets = [];
    load();
  });

  load();

  state.timer = setInterval(() => {
    if (document.visibilityState === 'visible') load(true);
  }, REFRESH_INTERVAL);
}

async function load(silent = false) {
  if (state.loading) return;
  state.loading = true;

  const btn = document.getElementById('predRefresh');
  btn?.classList.add('spinning');

  try {
    const markets = await fetchMarkets(8, state.filter);
    if (!markets.length) throw new Error('暂无数据');
    state.markets = markets;
    state.updatedAt = new Date();
    render();
  } catch (err) {
    renderError(err.message);
  } finally {
    state.loading = false;
    btn?.classList.remove('spinning');
  }
}

function render() {
  const grid = document.getElementById('predGrid');
  if (!grid) return;

  if (!state.markets.length) {
    grid.innerHTML = `<div class="market-error"><span>暂无预测市场数据</span></div>`;
    updateStamp();
    return;
  }

  grid.innerHTML = `<div class="pred-grid">
    ${state.markets.map(m => {
      const sent = probSentiment(m);
      const dLeft = daysLeft(m);
      const chg = m.change24h || 0;

      return `
        <a class="pred-card" href="${escapeHtml(m.url)}" target="_blank" rel="noopener">
          <div class="pred-q">${escapeHtml(m.question)}</div>

          <div class="pred-bar">
            <div class="pred-bar-yes" style="width:${m.yesPct}%"></div>
          </div>

          <div class="pred-row">
            <span class="pred-pct pred-pct-yes">是 ${m.yesPct}%</span>
            <span class="pred-chg ${chg >= 0 ? 'price-up' : 'price-down'}">
              ${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(1)}%
            </span>
            <span class="pred-pct pred-pct-no">否 ${m.noPct}%</span>
          </div>

          <div class="pred-foot">
            <span class="verdict ${sent.cls}" style="padding:1px 8px;font-size:0.7rem;">${sent.icon} ${sent.label}</span>
            <span class="pred-meta">
              ${formatNumber(m.volume24hr)}
              ${dLeft !== null && dLeft >= 0 ? ` · ${dLeft}天` : ''}
            </span>
          </div>
        </a>
      `;
    }).join('')}
  </div>`;

  updateStamp();
}

function renderError(msg) {
  const grid = document.getElementById('predGrid');
  if (!grid) return;
  grid.innerHTML = `
    <div class="market-error">
      <span>⚠ 预测市场接口暂不可用（${escapeHtml(msg)}）。可能是网络限制，占卜功能不受影响。</span>
      <button class="btn btn-ghost btn-sm" onclick="location.reload()" type="button">重试</button>
    </div>
  `;
  updateStamp();
}

function updateStamp() {
  const stamp = document.getElementById('predStamp');
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
