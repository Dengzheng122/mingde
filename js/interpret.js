/* ============================================================
   解读引擎 — 卦象 × 行情 交叉分析
   ============================================================ */

import { analyzeMarket } from './market.js';
import { fundingSentiment, consensusScore } from './derivatives.js';

/** 根据卦象基调 + 市场情绪生成综合结论 */
export function synthesize(divination, token, market) {
  const luck = divination.luck || 3;      // 1~5
  const score = market.score;              // 0~100

  // 卦象 × 市场 双重加权
  const luckNorm = (luck - 1) / 4;         // 0~1
  const marketNorm = score / 100;          // 0~1

  const combined = luckNorm * 0.45 + marketNorm * 0.55;
  const finalScore = Math.round(combined * 100);

  let verdict, advice;
  if (finalScore >= 70) {
    verdict = { label: '顺势可为', cls: 'verdict-bull', icon: '▲' };
    advice = '卦象与行情同向共振。当前是相对有利的窗口，若已持仓可继续持有，尚未入场者可择机分批建仓。仍需设定止盈纪律。';
  } else if (finalScore >= 55) {
    verdict = { label: '谨慎看多', cls: 'verdict-bull', icon: '◈' };
    advice = '整体偏向正面但仍有隐忧。建议轻仓试探，设好止损，不宜重仓押注单一方向。';
  } else if (finalScore >= 42) {
    verdict = { label: '观望为宜', cls: 'verdict-neutral', icon: '◆' };
    advice = '多空力量胶着，方向未明。此刻最忌频繁操作，建议等待更明确信号或更优价格区间出现。';
  } else if (finalScore >= 28) {
    verdict = { label: '谨慎防守', cls: 'verdict-bear', icon: '▼' };
    advice = '卦象与行情均现疲态。若已持仓，建议收紧止损、控制仓位，避免逆势加仓摊薄成本。';
  } else {
    verdict = { label: '暂避锋芒', cls: 'verdict-bear', icon: '▽' };
    advice = '风险信号明显。无论盈亏，都建议降低敞口、保留现金，等待趋势重新明朗再考虑入场。';
  }

  return { finalScore, verdict, advice, luck, marketScore: score };
}

/** 生成完整的文字报告 */
export function buildReport(divination, token, market, consensus = null) {
  const synth = synthesize(divination, token, market);
  const sections = [];

  // ---------- 引言 ----------
  const intro = [];
  if (token) {
    intro.push(`本次占卜对象为 <strong>${escapeHtml(token.name)}</strong>（$${escapeHtml(token.symbol)}）。`);
    intro.push('卦象由传统术数推演而来，行情数据取自链上实时交易，两者交叉印证。');
  } else {
    intro.push('本次为纯卦象占卜，未关联链上行情。卦象反映的是当下之势与心理预期。');
  }
  sections.push({ title: '◈ 起卦', icon: '☯', text: intro.join(' ') });

  // ---------- 卦象详解 ----------
  if (divination.method === 'liuyao' || divination.method === 'meihua') {
    const lines = [];
    lines.push(`本卦为 <strong>${divination.name}</strong>${divination.symbol}，上卦${divination.upperTrigram}、下卦${divination.lowerTrigram}。`);
    if (divination.naying) lines.push(`卦宫纳音属 ${divination.naying}。`);
    if (divination.source) lines.push(`${divination.source}。`);
    lines.push('');
    lines.push(divination.meaning);

    if (divination.hasMoving) {
      const movingYao = divination.yaos.filter(y => y.isMoving);
      const movingPos = movingYao.map(y => `${y.position}爻`).join('、');
      lines.push('');
      lines.push(`动爻在 <strong>${movingPos}</strong>，变卦为 <strong>${divination.changedName}</strong>。`);
      if (divination.changedMeaning) {
        lines.push(divination.changedMeaning);
        lines.push('');
        lines.push('卦象有变，提示当前形势处于转折之中，事态可能与预期有所出入，宜预留调整空间。');
      }
    } else {
      lines.push('');
      lines.push('六爻安静，无变爻。事态相对稳定，按既定方向推进即可。');
    }
    sections.push({ title: '☰ 卦象', icon: '卦', text: lines.join('\n') });
  }

  // ---------- 塔罗详解 ----------
  if (divination.method === 'tarot') {
    const lines = [];
    lines.push(`牌阵为 <strong>${divination.spreadName}</strong> — ${divination.spreadDesc}`);
    lines.push('');
    divination.cards.forEach((c, i) => {
      const dir = c.reversed ? '逆位' : '正位';
      lines.push(`${i + 1}. 【${c.position}】${c.name}${c.suit ? ' · ' + c.suitTheme : ''}（${dir}）`);
      lines.push(`   ${c.meaning}`);
    });

    // 大阿卡纳统计
    const majors = divination.cards.filter(c => c.major);
    const reverseds = divination.cards.filter(c => c.reversed);
    lines.push('');
    lines.push('—');
    if (majors.length >= 2) {
      lines.push(`本次出现 ${majors.length} 张大阿卡纳（命运牌），说明此事牵涉较深的命运转折，非日常小事所能左右，宜慎重对待。`);
    } else if (majors.length === 0) {
      lines.push('全为小阿卡纳，事情落在日常层面，可通过具体行动改善结果，不必有宿命之忧。');
    } else {
      lines.push('仅一张大阿卡纳，命运之手有所触及但非主导，主体仍在你自己的选择。');
    }
    if (reverseds.length > divination.cards.length / 2) {
      lines.push(`过半牌面逆位（${reverseds.length}/${divination.cards.length}），能量较为阻塞，宜放慢节奏，先解决内部阻碍再谈外部推进。`);
    } else if (reverseds.length === 0) {
      lines.push('全部正位，能量流动顺畅，是适合主动出击的时机。');
    } else {
      lines.push(`逆位 ${reverseds.length} 张，正逆相杂，提示过程会有反复，但整体尚可控。`);
    }
    sections.push({ title: '✦ 塔罗', icon: '牌', text: lines.join('\n') });
  }

  // ---------- 行情分析 ----------
  if (token && market) {
    const lines = [];
    const srcLabel = token.source === 'gate'
      ? `数据源：Gate.io 现货 ${token.pair || ''}`
      : `数据源：DexScreener · ${(token.chain || '').toUpperCase()} ${(token.dex || '').toUpperCase()}`;

    lines.push(`当前价格 <strong>$${token.priceUsd}</strong>，24小时涨跌 <strong>${token.change24h >= 0 ? '+' : ''}${(token.change24h || 0).toFixed(2)}%</strong>。`);
    lines.push(`24小时成交额 ${formatVol(token.volume24h)}${token.liquidity > 0 ? `，流动性约 ${formatVol(token.liquidity)}` : ''}。`);
    if (token.buyCount > 0) {
      lines.push(`买单 ${token.buyCount} 笔，卖单 ${token.sellCount} 笔，买盘占比 ${(token.buyRatio * 100).toFixed(0)}%。`);
    }
    lines.push('');
    lines.push(srcLabel);
    lines.push('');
    lines.push('市场信号拆解：');
    market.signals.forEach(s => {
      const arrow = s.score > 0 ? '↑' : s.score < 0 ? '↓' : '→';
      lines.push(`${arrow} ${s.reason}`);
    });
    sections.push({ title: '⚖ 行情', icon: '市', text: lines.join('\n') });
  }

  // ---------- 仓位共识对照（永续合约） ----------
  if (consensus) {
    const sent = fundingSentiment(consensus);
    const cScore = consensusScore(consensus);
    const lines = [];
    const luckPct = Math.round(((synth.luck - 1) / 4) * 100);
    const aprPct = (consensus.fundingAPR * 100).toFixed(1);
    const aprSign = consensus.fundingAPR > 0 ? '+' : '';

    lines.push(`永续合约：<strong>${escapeHtml(consensus.contract)}</strong>（Gate.io USDT 本位）`);
    lines.push('');
    lines.push(`资金费率年化：<strong>${aprSign}${aprPct}%</strong> · 多空账户比 <strong>${consensus.accountLS.toFixed(2)}</strong>`);
    lines.push(`持仓 ${formatNumber(consensus.oiBase)} · 24 小时成交 ${formatVol(consensus.volume24h)}`);
    lines.push(`共识看多度：<strong>${cScore}</strong> / 100（50 为多空均衡）`);
    lines.push('');
    lines.push('卦象与仓位对照：');

    const gap = luckPct - cScore;
    if (Math.abs(gap) <= 12) {
      lines.push(`→ 卦象基调（${luckPct}%）与仓位共识（${cScore}%）基本吻合，说明当前判断已反映在价格与仓位中，超额空间有限。${sent.label}的状态下，顺势而为优于逆向操作。`);
    } else if (gap > 12) {
      lines.push(`→ 卦象明显乐观于仓位共识（卦象 ${luckPct}% vs 共识 ${cScore}%）。合约持仓尚未把这份乐观计入，意味着它代表的是尚未被定价的可能性 —— 但同样要警惕，这也可能只是自我安慰。分歧本身就是机会窗口。`);
    } else {
      lines.push(`→ 卦象明显谨慎于仓位共识（卦象 ${luckPct}% vs 共识 ${cScore}%）。仓位仍偏乐观而卦象示警，这种背离常出现在行情末段。若卦象应验，说明共识尚未反映风险。`);
    }

    if (Math.abs(consensus.fundingAPR) >= 0.30) {
      lines.push('');
      lines.push(`⚠ 资金费率已达极端水平（年化 ${aprSign}${aprPct}%），意味着${consensus.fundingAPR > 0 ? '多头仓位高度拥挤，一旦转势容易触发连环平仓' : '空头仓位高度拥挤，一旦反弹容易触发轧空'}。极端共识往往正是风险而非机会的来源。`);
    }

    lines.push('');
    lines.push('需注意：资金费率反映的是持仓者愿意付出的持仓成本，是真金白银的仓位倾向，而非对未来的可靠预测。此处仅作为「市场在想什么」的一面镜子。');

    sections.push({ title: '◉ 共识', icon: '众', text: lines.join('\n'), verdict: sent });
  }

  // ---------- 综合结论 ----------
  const conclusion = [];
  conclusion.push(synth.advice);
  conclusion.push('');
  conclusion.push(`综合评分 <strong>${synth.finalScore}</strong> / 100，其中卦象贡献约 ${Math.round(((synth.luck - 1) / 4) * 100)} 分，市场情绪约 ${synth.marketScore} 分。`);
  sections.push({ title: '✧ 结论', icon: '断', text: conclusion.join('\n'), verdict: synth.verdict });

  return { ...synth, sections };
}

/* ============================================================
   每日运势 — 按日期确定性生成
   ============================================================ */

const FORTUNE_ITEMS = [
  { key: 'wealth', label: '财运', icon: '💰' },
  { key: 'love', label: '桃花', icon: '🌹' },
  { key: 'work', label: '事业', icon: '⚔️' },
  { key: 'health', label: '健康', icon: '🌿' },
  { key: 'luck', label: '综合运', icon: '🍀' },
];

const FORTUNE_HINTS = {
  wealth: ['正财稳中有进，偏财需谨慎', '适合守财，不宜大额投机', '正财佳，宜专注主业收入', '财务紧绷，控制开支', '意外之财可期，但需防破财'],
  love: ['桃花渐旺，单身者可留意', '感情平稳，宜真诚以待', '易有误会，宜多沟通', '暧昧不明，宜明确态度', '旧缘有复燃之兆'],
  work: ['贵人相助，逢凶化吉', '任务繁重，注意节奏', '思路清晰，适合攻坚', '易遇阻力，宜借力', '低调收敛，勿争锋头'],
  health: ['精力充沛，适合运动', '注意作息，勿熬夜', '身体无恙，饮食清淡', '留意脾胃，避免生冷', '宜静养，少应酬'],
  luck: ['诸事顺遂，大吉', '稳中有进，可小赌', '平顺，无大起大落', '宜守成，不宜冒进', '波折较多，谨慎行事'],
};

/** 生成指定日期的运势（确定性：同一天结果一致） */
export function dailyFortune(date) {
  const d = date || new Date();
  const dateKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }

  const items = FORTUNE_ITEMS.map((item, i) => {
    const h = (hash >>> (i * 3)) ^ (hash << (i + 1));
    const score = 1 + (Math.abs(h) % 5);
    const hintIdx = Math.abs(h >> 5) % 5;
    return {
      ...item,
      score,
      stars: '★'.repeat(score) + '☆'.repeat(5 - score),
      hint: FORTUNE_HINTS[item.key][hintIdx],
    };
  });

  const totalScore = items.reduce((s, i) => s + i.score, 0);
  const avg = totalScore / items.length;

  let summary, color;
  if (avg >= 4.2) { summary = '诸事皆宜的大吉之日'; color = 'var(--success)'; }
  else if (avg >= 3.4) { summary = '稳中有升，利于进取'; color = 'var(--celadon-400)'; }
  else if (avg >= 2.6) { summary = '平稳无奇，守成为上'; color = 'var(--gold-500)'; }
  else { summary = '多事之期，宜静不宜动'; color = 'var(--wine-400)'; }

  return {
    date: dateKey,
    displayDate: d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
    items,
    totalScore,
    avgScore: avg.toFixed(1),
    summary,
    color,
    luckyColor: ['正红', '玄黑', '素白', '琥珀', '黛蓝', '紫罗兰'][Math.abs(hash) % 6],
    luckyNumber: String((Math.abs(hash) % 9) + 1),
    luckyDirection: ['东', '南', '西', '北', '东南', '西南', '东北', '西北'][Math.abs(hash >> 3) % 8],
    fortuneCard: Math.floor((Math.abs(hash >> 5) % 22)),
  };
}

/** 金额格式化（亿/万） */
function formatVol(n) {
  const v = n || 0;
  const abs = Math.abs(v);
  if (abs >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
  return '$' + v.toFixed(2);
}

/** HTML 转义 */
export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
