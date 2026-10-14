/* ============================================================
   合约共识看板（Gate.io 永续合约）
   用真金白银的仓位分布替代预测市场的吃瓜投票
   ============================================================ */

import { fetchConsensus, SORTS, fundingSentiment, consensusScore, secondsToFunding } from './derivatives.js';
import { escapeHtml } from './interpret.js';
import { formatNumber } from './market.js';

const state = {
  list: [],
  sort: 'funding',
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
    state.sort = tab.dataset.sort || 'funding';
    tabs.querySelectorAll('.pred-tab').forEach(t => t.classList.toggle('active', t === tab));
    render();
  });

  refreshBtn?.addEventListener('click', () => {
    load();
  });

  load();

  state.timer = setInterval(() => {
    if (document.visibilityState === 'visible') load(true);
  }, REFRESH_INTERVAL);
}

async function load() {
  if (state.loading) return;
  state.loading = true;

  const btn = document.getElementById('predRefresh');
  btn?.classList.add('spinning');

  try {
    const list = await fetchConsensus(10);
    if (!list.length) throw new Error('未取到合约数据');
    state.list = list;
    state.updatedAt = new Date();
    render();
  } catch (err) {
    renderError(err.message);
  } finally {
    state.loading = false;
    btn?.classList.remove('spinning');
  }
}

/** 资金费率年化展示：+10.6% / -3.2% */
function fmtAPR(apr) {
  const pct = apr * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function render() {
  const grid = document.getElementById('predGrid');
  if (!grid) return;

  if (!state.list.length) {
    grid.innerHTML = `<div class="market-error"><span>暂无合约数据</span></div>`;
    updateStamp();
    return;
  }

  const sorted = [...state.list].sort(SORTS[state.sort] || SORTS.funding);

  grid.innerHTML = `<div class="pred-grid">
    ${sorted.map(c => {
      const sent = fundingSentiment(c);
      const score = consensusScore(c);
      const chg = c.changePct || 0;
      const secs = secondsToFunding(c);

      return `
        <a class="pred-card" href="${escapeHtml(c.url)}" target="_blank" rel="noopener">
          <div class="pred-q">
            <strong>${escapeHtml(c.symbol)}</strong>
            <span class="small muted">${escapeHtml(c.name)}</span>
          </div>

          <div class="pred-bar">
            <div class="pred-bar-yes" style="width:${score}%"></div>
          </div>

          <div class="pred-row">
            <span class="pred-pct pred-pct-yes">费率年化 ${fmtAPR(c.fundingAPR)}</span>
            <span class="pred-chg ${chg >= 0 ? 'price-up' : 'price-down'}">
              ${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%
            </span>
            <span class="pred-pct pred-pct-no">多空 ${c.accountLS.toFixed(2)}</span>
          </div>

          <div class="pred-foot">
            <span class="verdict ${sent.cls}" style="padding:1px 8px;font-size:0.7rem;">${sent.icon} ${sent.label}</span>
            <span class="pred-meta">
              持仓 ${formatNumber(c.oiBase)}${secs !== null ? ` · ${Math.floor(secs / 3600)}h 后结算` : ''}
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
      <span>⚠ 合约数据接口暂不可用（${escapeHtml(msg)}）。可能是网络限制，占卜功能不受影响。</span>
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
