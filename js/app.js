/* ============================================================
   玄象卜卦 · 主应用
   ============================================================ */

import { castLiuyao, meihuaByTime, meihuaByText, drawTarot, SPREADS, MAJOR_ARCANA } from './algorithms.js';
import { queryToken, validateAddress, analyzeMarket, formatPrice, formatNumber, formatPercent, formatTime } from './market.js';
import { buildReport, dailyFortune, escapeHtml } from './interpret.js';
import * as store from './storage.js';
import { generateShareCard, downloadCanvas } from './share.js';
import { initMarketBoard } from './market-board.js';
import { initPredictionBoard } from './prediction-board.js';
import { findRelatedMarket } from './polymarket.js';

/* ---------------- 状态 ---------------- */
const state = {
  method: 'liuyao',
  spread: 'three',
  token: null,
  market: null,
  result: null,
  currentPage: 'divine',
  busy: false,
};

/* ---------------- DOM ---------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const el = {
  nav: $('#nav'),
  themeToggle: $('#themeToggle'),
  methodGrid: $('#methodGrid'),
  spreadPanel: $('#spreadPanel'),
  spreadOptions: $('#spreadOptions'),
  tokenInput: $('#tokenInput'),
  tokenPreview: $('#tokenPreview'),
  queryBtn: $('#queryBtn'),
  clearTokenBtn: $('#clearTokenBtn'),
  searchResults: $('#searchResults'),
  divineBtn: $('#divineBtn'),
  resultArea: $('#resultArea'),
  dailyContent: $('#dailyContent'),
  dailyDate: $('#dailyDate'),
  historyContent: $('#historyContent'),
  favContent: $('#favContent'),
};

/* ============================================================
   初始化
   ============================================================ */

function init() {
  const prefs = store.getPrefs();

  // 主题
  applyTheme(prefs.theme);
  // 方法
  state.method = prefs.defaultMethod;
  state.spread = prefs.defaultSpread;
  syncMethodUI();
  renderSpreadOptions();

  // 事件绑定
  bindNav();
  bindTheme();
  bindMethod();
  bindToken();
  bindButtons();
  bindDaily();

  // 市场速览看板
  initMarketBoard({
    onPick: handlePickFromBoard,
  });

  // 预测市场看板
  initPredictionBoard();

  // 初始渲染
  renderDaily();
  renderHistory();
  renderFavorites();
}

/** 从行情看板选取代币 → 自动填充并直接起卦 */
function handlePickFromBoard(token) {
  state.token = token;
  state.market = analyzeMarket(token);
  el.tokenInput.value = token.address;
  el.tokenInput.classList.remove('error');
  el.clearTokenBtn.style.display = 'inline-flex';
  el.searchResults.style.display = 'none';
  renderTokenPreview(token);

  // 滚动到起卦区
  document.getElementById('methodGrid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`已选中 ${token.symbol}，为你起卦`);
  setTimeout(performDivination, 420);
}

/* ---------------- 导航 ---------------- */

function bindNav() {
  el.nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    switchPage(btn.dataset.page);
  });
}

function switchPage(page) {
  state.currentPage = page;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));

  if (page === 'daily') renderDaily();
  if (page === 'history') renderHistory();
  if (page === 'favorites') renderFavorites();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------- 主题 ---------------- */

function bindTheme() {
  el.themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.setPref('theme', next);
    toast(next === 'dark' ? '已切换至秘夜模式' : '已切换至羊皮纸模式');
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀' : '☾';
}

/* ---------------- 术数选择 ---------------- */

function bindMethod() {
  el.methodGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.method-card');
    if (!card) return;
    state.method = card.dataset.method;
    syncMethodUI();
    store.setPref('defaultMethod', state.method);
  });
}

function syncMethodUI() {
  $$('.method-card').forEach(c => c.classList.toggle('selected', c.dataset.method === state.method));
  el.spreadPanel.style.display = state.method === 'tarot' ? 'block' : 'none';
}

function renderSpreadOptions() {
  el.spreadOptions.innerHTML = Object.entries(SPREADS).map(([key, s]) => `
    <button class="btn ${key === state.spread ? '' : 'btn-ghost'} btn-sm" data-spread="${key}" type="button">
      ${s.name}
    </button>
  `).join('');

  el.spreadOptions.onclick = (e) => {
    const btn = e.target.closest('[data-spread]');
    if (!btn) return;
    state.spread = btn.dataset.spread;
    store.setPref('defaultSpread', state.spread);
    renderSpreadOptions();
  };
}

/* ---------------- 代币输入 ---------------- */

function bindToken() {
  // 回车即查询
  el.tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleTokenInput();
  });

  el.tokenInput.addEventListener('blur', () => {
    // 失焦不自动查询，避免打扰；仅在有内容且已离开时校验
    const v = el.tokenInput.value.trim();
    if (v && !state.token) {
      const check = validateAddress(v);
      el.tokenInput.classList.toggle('error', !check.valid);
    }
  });
}

function bindButtons() {
  el.queryBtn.addEventListener('click', handleTokenInput);
  el.clearTokenBtn.addEventListener('click', clearToken);
  el.divineBtn.addEventListener('click', performDivination);

  $('#clearHistoryBtn').addEventListener('click', () => {
    if (confirm('确定清空全部占卜历史？此操作不可撤销。')) {
      store.clearHistory();
      renderHistory();
      toast('历史已清空');
    }
  });

  $('#clearFavBtn').addEventListener('click', () => {
    if (confirm('确定清空全部收藏？此操作不可撤销。')) {
      store.clearFavorites();
      renderFavorites();
      toast('收藏已清空');
    }
  });

  $('#exportBtn').addEventListener('click', () => exportData('history'));
  $('#exportFavBtn').addEventListener('click', () => exportData('favorites'));
}

async function handleTokenInput() {
  const v = el.tokenInput.value.trim();
  if (!v) {
    clearToken();
    return;
  }

  el.tokenInput.classList.remove('error');
  showTokenLoading();
  el.clearTokenBtn.style.display = 'inline-flex';

  try {
    const token = await queryToken(v);
    if (!token) throw new Error(`未找到「${v}」对应的代币，请检查输入是否正确`);

    state.token = token;
    state.market = analyzeMarket(token);
    el.tokenInput.value = token.address || v;
    renderTokenPreview(token);
    toast(`已获取 ${token.symbol} 行情`);
  } catch (err) {
    state.token = null;
    state.market = null;
    el.tokenPreview.innerHTML = `<div class="disclaimer">⚠ ${escapeHtml(err.message)}</div>`;
    el.clearTokenBtn.style.display = 'none';
  }
}

function clearToken() {
  state.token = null;
  state.market = null;
  el.tokenInput.value = '';
  el.tokenInput.classList.remove('error');
  el.tokenPreview.innerHTML = '';
  el.searchResults.style.display = 'none';
  el.clearTokenBtn.style.display = 'none';
}

function showTokenLoading() {
  el.tokenPreview.innerHTML = `
    <div class="row" style="padding: var(--space);">
      <div class="spinner"></div>
      <span class="small muted">正在获取链上行情…</span>
    </div>
  `;
}

function renderTokenPreview(token) {
  const m = token.market || analyzeMarket(token);
  const sourceLabel = token.source === 'gate'
    ? escapeHtml(token.pair || '')
    : `${escapeHtml((token.chain || '').toUpperCase())} · ${escapeHtml((token.dex || '').toUpperCase())}`;

  el.tokenPreview.innerHTML = `
    <div class="token-card">
      ${token.logo
        ? `<img class="token-logo" src="${escapeHtml(token.logo)}" alt="" onerror="this.outerHTML='<div class=\\'token-logo token-logo-fallback\\'>◆</div>'">`
        : `<div class="token-logo token-logo-fallback">◆</div>`}
      <div class="token-meta">
        <div class="token-name">${escapeHtml(token.name)}</div>
        <div class="token-symbol">$${escapeHtml(token.symbol)} · ${sourceLabel}</div>
      </div>
      <div class="token-price">
        <div class="price-val">${formatPrice(token.priceUsd)}</div>
        <div class="price-change ${token.change24h >= 0 ? 'price-up' : 'price-down'}">${formatPercent(token.change24h)}</div>
      </div>
    </div>

    <div class="card" style="background: transparent; border-color: var(--border-subtle);">
      <div class="row-between" style="margin-bottom: var(--space-sm);">
        <span class="label">市场情绪评分</span>
        <span class="verdict ${m.sentiment.cls}" style="padding: 2px 10px; font-size: 0.8rem;">${m.sentiment.label} · ${m.score}</span>
      </div>
      <div class="score-track" style="margin-bottom: var(--space-sm);">
        <div class="score-fill" style="width:${m.score}%; background: linear-gradient(90deg, var(--wine-500), var(--gold-500), var(--success));"></div>
      </div>
      <div class="small muted">
        流动性 ${formatNumber(token.liquidity)} · 24h 成交 ${formatNumber(token.volume24h)} ·
        买入占比 ${(token.buyRatio * 100).toFixed(0)}%
        ${token.pairCreatedAt ? ` · 上市 ${formatTime(token.pairCreatedAt)}` : ''}
      </div>
    </div>
  `;
}

/* ============================================================
   占卜主流程
   ============================================================ */

async function performDivination() {
  if (state.busy) return;

  // 若输入框有内容但还没查过，先查
  const inputVal = el.tokenInput.value.trim();
  if (inputVal && !state.token) {
    await handleTokenInput();
    if (!state.token) return;
  }

  state.busy = true;
  el.divineBtn.disabled = true;
  el.divineBtn.innerHTML = '<span class="spinner"></span> 推演中…';

  await new Promise(r => setTimeout(r, 420)); // 让动画有机会渲染

  try {
    let divination;

    if (state.method === 'liuyao') {
      divination = castLiuyao(Math.random);
    } else if (state.method === 'meihua') {
      if (state.token) {
        divination = meihuaByText(state.token.address + state.token.symbol, Math.random);
      } else {
        divination = meihuaByTime(new Date(), Math.random);
      }
    } else {
      divination = drawTarot(state.spread, null);
    }

    const market = state.token ? (state.market || analyzeMarket(state.token)) : null;

    // 尝试找相关预测市场（失败不影响主流程）
    let prediction = null;
    if (state.token) {
      prediction = await findRelatedMarket(state.token).catch(() => null);
    }

    const report = buildReport(divination, state.token, market, prediction);

    state.result = { divination, token: state.token, prediction, ...report };

    renderResult();
    saveResult();
    toast(prediction ? '卦象已成 · 已结合人群共识' : '卦象已成');
  } catch (err) {
    console.error(err);
    toast('推演失败：' + err.message);
  } finally {
    state.busy = false;
    el.divineBtn.disabled = false;
    el.divineBtn.innerHTML = '◈ 起卦解读';
  }
}

function renderResult() {
  const r = state.result;
  if (!r) return;

  const isFav = state.token
    ? store.isFavorite(state.token.address)
    : store.isFavorite('latest');

  let html = `
    <div class="divider"></div>

    <div class="card-framed" style="margin-bottom: var(--space-lg);">
      <div class="row-between" style="margin-bottom: var(--space-md);">
        <div>
          <div class="method-name" style="font-size: 1.3rem;">
            ${r.divination.method === 'tarot' ? escapeHtml(r.divination.spreadName) : escapeHtml(r.divination.name)}
          </div>
          <div class="small muted">${new Date().toLocaleString('zh-CN')}</div>
        </div>
        <div class="verdict ${r.verdict.cls}">
          ${r.verdict.icon} ${escapeHtml(r.verdict.label)}
        </div>
      </div>

      <!-- 卦象展示 -->
      <div class="hexagram-box" id="resultVisual"></div>

      <!-- 评分 -->
      <div class="card" style="background: transparent; border-color: var(--border-subtle); margin-bottom: var(--space-md);">
        <div class="row-between" style="margin-bottom: var(--space-sm);">
          <span class="label">综合评分</span>
          <span class="mono" style="font-size: 1.3rem; color: var(--accent);">${r.finalScore}<span class="muted" style="font-size: 0.8rem;"> / 100</span></span>
        </div>
        <div class="score-track" style="height: 8px;">
          <div class="score-fill" id="scoreFill" style="width:0%; background: linear-gradient(90deg, var(--wine-500), var(--gold-500), var(--success));"></div>
        </div>
        <div class="row" style="margin-top: var(--space-sm); gap: var(--space-md);">
          <div class="score-row" style="flex:1; margin:0;">
            <span class="score-label">卦象</span>
            <div class="score-track"><div class="score-fill" style="width:${Math.round(((r.luck - 1) / 4) * 100)}%; background: var(--amethyst-500);"></div></div>
          </div>
          <div class="score-row" style="flex:1; margin:0;">
            <span class="score-label">市场</span>
            <div class="score-track"><div class="score-fill" style="width:${r.marketScore}%; background: var(--celadon-500);"></div></div>
          </div>
        </div>
      </div>

      <!-- 报告正文 -->
      ${r.sections.map(s => `
        <div class="report-section">
          <div class="report-title">${escapeHtml(s.title)}</div>
          <div class="report-text">${s.text}</div>
        </div>
      `).join('')}

      <!-- 操作 -->
      <div class="divider"></div>
      <div class="row">
        <button class="btn btn-sm" id="shareBtn" type="button">🖼 生成分享图</button>
        <button class="btn btn-wine btn-sm" id="favBtn" type="button">${isFav ? '★ 已收藏' : '☆ 收藏'}</button>
        <button class="btn btn-ghost btn-sm" id="againBtn" type="button">↻ 再起一卦</button>
      </div>
      <div id="sharePreview"></div>
    </div>
  `;

  el.resultArea.innerHTML = html;
  renderVisual(r.divination);

  // 评分动画
  setTimeout(() => {
    const fill = document.getElementById('scoreFill');
    if (fill) fill.style.width = r.finalScore + '%';
  }, 120);

  bindResultButtons();
}

function renderVisual(div) {
  const box = document.getElementById('resultVisual');
  if (!box) return;

  if (div.method === 'liuyao' || div.method === 'meihua') {
    box.innerHTML = `
      <div style="font-size: 2.4rem; color: var(--accent); letter-spacing: 0.3em;">${escapeHtml(div.symbol)}</div>
      <div class="hexagram-lines">
        ${div.yaos.map(y => `
          <div class="yao">
            <span class="yao-label">${y.position}${y.isMoving ? ' 动' : ''}</span>
            <div class="yao-bar ${y.isYang ? 'yao-yang' : 'yao-yin'} ${y.isMoving ? 'yao-moving' : ''}"></div>
          </div>
        `).join('')}
      </div>
      ${div.hasMoving && div.changedName !== div.name ? `
        <div class="small muted">本卦 <strong style="color:var(--gold-400)">${escapeHtml(div.name)}</strong> → 之卦 <strong style="color:var(--wine-400)">${escapeHtml(div.changedName)}</strong></div>
      ` : ''}
    `;
  } else if (div.method === 'tarot') {
    box.innerHTML = `
      <div class="tarot-spread">
        ${div.cards.map((c, i) => `
          <div class="tarot-card back flip-in" data-cfg="${i}" style="animation-delay:${i * 90}ms" title="点击翻开"></div>
        `).join('')}
      </div>
    `;

    // 依次翻牌
    div.cards.forEach((c, i) => {
      setTimeout(() => {
        const node = box.querySelector(`[data-cfg="${i}"]`);
        if (!node) return;
        node.classList.remove('back');
        node.classList.add('revealed', 'flip-in');
        if (c.reversed) node.classList.add('reversed');
        node.innerHTML = `
          <div class="tarot-suit">${escapeHtml(c.suitSymbol)}</div>
          <div class="tarot-name">${escapeHtml(c.name)}</div>
          <div class="tarot-numeral">${escapeHtml(c.position)}</div>
        `;
      }, 300 + i * 320);
    });
  }
}

function bindResultButtons() {
  document.getElementById('shareBtn')?.addEventListener('click', handleShare);
  document.getElementById('againBtn')?.addEventListener('click', performDivination);
  document.getElementById('favBtn')?.addEventListener('click', handleToggleFav);
}

async function handleShare() {
  const box = document.getElementById('sharePreview');
  if (!box) return;

  box.innerHTML = `<div class="row" style="justify-content:center; padding: var(--space-lg);"><div class="spinner"></div><span class="small muted">正在绘制…</span></div>`;

  try {
    const canvas = await generateShareCard(state.result, state.token);
    box.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'share-preview';
    wrap.appendChild(canvas);

    const actions = document.createElement('div');
    actions.className = 'row';
    actions.style.justifyContent = 'center';
    actions.innerHTML = `
      <button class="btn btn-sm" id="dlBtn" type="button">⬇ 下载图片</button>
      <button class="btn btn-ghost btn-sm" id="closeShareBtn" type="button">关闭</button>
    `;
    box.appendChild(wrap);
    box.appendChild(actions);

    document.getElementById('dlBtn').addEventListener('click', () => {
      downloadCanvas(canvas, `divination-${Date.now()}.png`);
      toast('图片已下载');
    });
    document.getElementById('closeShareBtn').addEventListener('click', () => {
      box.innerHTML = '';
    });
  } catch (err) {
    box.innerHTML = `<div class="disclaimer">生成失败：${escapeHtml(err.message)}</div>`;
  }
}

function handleToggleFav() {
  const btn = document.getElementById('favBtn');
  const r = state.result;
  if (!r || !btn) return;

  const key = state.token ? state.token.address : 'latest';
  const added = store.toggleFavorite({
    favKey: key,
    method: r.divination.method,
    title: r.divination.method === 'tarot' ? r.divination.spreadName : r.divination.name,
    verdict: r.verdict.label,
    score: r.finalScore,
    advice: r.advice,
    tokenSymbol: state.token ? state.token.symbol : null,
    tokenName: state.token ? state.token.name : null,
    tokenAddress: state.token ? state.token.address : null,
    price: state.token ? state.token.priceUsd : null,
    change24h: state.token ? state.token.change24h : null,
    divination: r.divination,
  });

  btn.textContent = added ? '★ 已收藏' : '☆ 收藏';
  btn.classList.toggle('btn-wine', added);
  toast(added ? '已加入收藏' : '已取消收藏');
  renderFavorites();
}

function saveResult() {
  const r = state.result;
  if (!r) return;
  store.addHistory({
    method: r.divination.method,
    title: r.divination.method === 'tarot' ? r.divination.spreadName : r.divination.name,
    verdict: r.verdict.label,
    score: r.finalScore,
    advice: r.advice,
    tokenSymbol: state.token ? state.token.symbol : null,
    tokenName: state.token ? state.token.name : null,
    tokenAddress: state.token ? state.token.address : null,
    price: state.token ? state.token.priceUsd : null,
    change24h: state.token ? state.token.change24h : null,
    prediction: state.result.prediction ? {
      question: state.result.prediction.question,
      yesPct: state.result.prediction.yesPct,
      url: state.result.prediction.url,
    } : null,
    divination: r.divination,
  });
  renderHistory();
}

/* ============================================================
   每日运势
   ============================================================ */

function bindDaily() {
  // 无需额外绑定，渲染时处理
}

function renderDaily() {
  const f = dailyFortune(new Date());
  el.dailyDate.textContent = f.displayDate;

  const card = MAJOR_ARCANA[f.fortuneCard];

  el.dailyContent.innerHTML = `
    <div class="card-framed">
      <div class="center" style="margin-bottom: var(--space-lg);">
        <div style="font-size: 2.6rem; margin-bottom: var(--space-sm);">${card.suitSymbol || '✦'}</div>
        <div class="method-name" style="font-size: 1.5rem;">今日之牌 · ${escapeHtml(card.name)}</div>
        <div class="small muted" style="margin-bottom: var(--space);">${escapeHtml(card.en)} · ${escapeHtml(card.numeral)}</div>
        <div class="report-text" style="max-width: 520px; margin: 0 auto;">${escapeHtml(card.upright)}</div>
      </div>

      <div class="fortune-grid">
        ${f.items.map(i => `
          <div class="fortune-item">
            <div class="fortune-label">${i.icon} ${i.label}</div>
            <div class="fortune-stars">${i.stars}</div>
            <div class="fortune-hint">${escapeHtml(i.hint)}</div>
          </div>
        `).join('')}
      </div>

      <div class="divider"></div>

      <div class="row-between" style="gap: var(--space-md);">
        <div>
          <div class="small muted">综合评分</div>
          <div class="mono" style="font-size: 1.8rem; color: ${f.color};">${f.avgScore}<span class="muted" style="font-size: 0.85rem;"> / 5.0</span></div>
        </div>
        <div style="text-align:center;">
          <div class="small muted">幸运色</div>
          <div style="color: var(--gold-400);">${escapeHtml(f.luckyColor)}</div>
        </div>
        <div style="text-align:center;">
          <div class="small muted">幸运数字</div>
          <div class="mono" style="color: var(--gold-400);">${escapeHtml(f.luckyNumber)}</div>
        </div>
        <div style="text-align:center;">
          <div class="small muted">幸运方位</div>
          <div style="color: var(--gold-400);">${escapeHtml(f.luckyDirection)}</div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="center">
        <div class="method-name" style="font-size: 1.15rem; color: ${f.color};">${escapeHtml(f.summary)}</div>
      </div>

      <div class="row" style="justify-content:center; margin-top: var(--space-lg);">
        <button class="btn btn-ghost btn-sm" id="dailyShareBtn" type="button">🖼 分享今日运势</button>
      </div>
      <div id="dailyShare"></div>
    </div>

    <div class="disclaimer" style="margin-top: var(--space-lg);">
      运势由日期确定性推算，同一天内结果不变。纯属娱乐参考。
    </div>
  `;

  document.getElementById('dailyShareBtn')?.addEventListener('click', async () => {
    const box = document.getElementById('dailyShare');
    box.innerHTML = `<div class="share-preview"><div class="spinner"></div></div>`;
    try {
      const canvas = await generateDailyCard(f);
      box.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'share-preview';
      wrap.appendChild(canvas);
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm';
      btn.style.marginTop = 'var(--space)';
      btn.textContent = '⬇ 下载图片';
      btn.onclick = () => { downloadCanvas(canvas, `daily-fortune-${f.date}.png`); toast('已下载'); };
      box.appendChild(wrap);
      box.appendChild(btn);
    } catch (e) {
      box.innerHTML = `<div class="disclaimer">生成失败</div>`;
    }
  });
}

async function generateDailyCard(f) {
  const { generateShareCard } = await import('./share.js');
  // 复用分享卡渲染，构造一个简化结果
  return generateShareCard({
    divination: {
      method: 'daily',
      name: f.summary,
      symbol: '✦',
      yaos: f.items.map(i => ({
        position: i.label,
        isYang: i.score >= 3,
        isMoving: i.score >= 5,
      })),
      hasMoving: false,
      changedName: null,
      upperTrigram: null,
      lowerTrigram: null,
    },
    finalScore: Math.round(f.avgScore * 20),
    verdict: { label: f.summary, cls: 'verdict-neutral', icon: '✦' },
    advice: f.items.map(i => `${i.label}：${i.hint}`).join('；'),
    sections: [],
  }, null);
}

/* ============================================================
   历史 / 收藏
   ============================================================ */

function renderHistory() {
  const list = store.getHistory();
  if (!list.length) {
    el.historyContent.innerHTML = `
      <div class="state">
        <div class="state-icon">☰</div>
        <div class="state-title">尚无占卜记录</div>
        <div class="small">起一卦试试，记录会自动保存在这里</div>
      </div>
    `;
    return;
  }

  el.historyContent.innerHTML = `<div class="list">${list.map(renderListItem).join('')}</div>`;
  bindListItems(el.historyContent, 'history');
}

function renderFavorites() {
  const list = store.getFavorites();
  if (!list.length) {
    el.favContent.innerHTML = `
      <div class="state">
        <div class="state-icon">✦</div>
        <div class="state-title">尚无收藏</div>
        <div class="small">占卜后点击「收藏」即可留存</div>
      </div>
    `;
    return;
  }

  el.favContent.innerHTML = `<div class="list">${list.map(renderListItem).join('')}</div>`;
  bindListItems(el.favContent, 'favorites');
}

function renderListItem(r) {
  const methodIcon = { liuyao: '☰', meihua: '🌸', tarot: '✦' }[r.method] || '✦';
  const chg = r.change24h;
  return `
    <div class="list-item" data-id="${r.id}">
      <div style="font-size: 1.4rem;">${methodIcon}</div>
      <div class="list-item-main">
        <div class="list-item-title">
          ${escapeHtml(r.title)}
          ${r.tokenSymbol ? `<span class="muted"> · $${escapeHtml(r.tokenSymbol)}</span>` : ''}
        </div>
        <div class="list-item-sub">
          评分 ${r.score} · ${escapeHtml(r.verdict)}
          ${r.price ? ` · ${formatPrice(r.price)}` : ''}
          ${chg != null ? ` · <span class="${chg >= 0 ? 'price-up' : 'price-down'}">${formatPercent(chg)}</span>` : ''}
          · ${formatTime(new Date(r.timestamp))}
        </div>
      </div>
      <div class="list-item-actions">
        <button class="icon-btn" data-action="view" title="查看">◈</button>
        <button class="icon-btn" data-action="delete" title="删除">✕</button>
      </div>
    </div>
  `;
}

function bindListItems(container, type) {
  container.querySelectorAll('.list-item').forEach(item => {
    const id = item.dataset.id;

    item.querySelector('[data-action="view"]')?.addEventListener('click', () => {
      const list = type === 'history' ? store.getHistory() : store.getFavorites();
      const record = list.find(x => x.id === id);
      if (!record || !record.divination) return;

      state.result = {
        divination: record.divination,
        finalScore: record.score,
        verdict: { label: record.verdict, cls: 'verdict-neutral', icon: '◆' },
        advice: record.advice,
        marketScore: record.score,
        luck: record.score >= 60 ? 5 : record.score >= 40 ? 3 : 2,
        sections: [],
      };
      state.token = record.tokenAddress ? {
        address: record.tokenAddress,
        name: record.tokenName || record.tokenSymbol,
        symbol: record.tokenSymbol,
        priceUsd: record.price,
        change24h: record.change24h,
        logo: null,
        chain: '', dex: '',
      } : null;

      switchPage('divine');
      setTimeout(() => {
        renderResult();
        window.scrollTo({ top: 400, behavior: 'smooth' });
      }, 100);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
      if (type === 'history') {
        store.removeHistory(id);
        renderHistory();
      } else {
        store.removeFavorite(id);
        renderFavorites();
      }
      toast('已删除');
    });
  });
}

/* ---------------- 数据导出 ---------------- */

function exportData(which) {
  const data = store.exportAll();
  const payload = which === 'history'
    ? { ...data, history: data.history, favorites: undefined }
    : { ...data, history: undefined, favorites: data.favorites };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tarot-${which}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已导出 JSON');
}

/* ============================================================
   Toast
   ============================================================ */

let toastTimer = null;

function toast(msg) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = msg;
  document.body.appendChild(node);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.remove(), 2600);
}

/* ============================================================
   启动
   ============================================================ */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
