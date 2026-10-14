/* ============================================================
   分享卡片 — Canvas 生成塔罗风格图片
   ============================================================ */

import { escapeHtml } from './interpret.js';

const GOLD = '#c9a961';
const GOLD_LIGHT = '#e8d9a8';
const GOLD_DARK = '#a8873f';
const WINE = '#7a2540';
const IVORY = '#f0e6d8';
const INK = '#1a1024';

/**
 * 生成分享卡片
 * @param {object} result 占卜结果
 * @param {object} token 代币信息（可选）
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function generateShareCard(result, token) {
  const canvas = document.createElement('canvas');
  const scale = 2; // 高清
  const W = 720;
  const H = 1280;
  canvas.width = W * scale;
  canvas.height = H * scale;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  drawBackground(ctx, W, H);
  drawFrame(ctx, W, H);

  let y = 92;
  y = drawHeader(ctx, W, y);
  y = drawSubject(ctx, W, y, token);
  y = drawDivination(ctx, W, y, result);
  y = drawScore(ctx, W, y, result);
  drawAdvice(ctx, W, H, y, result);
  drawFooter(ctx, W, H);

  return canvas;
}

/* ---------------- 背景 ---------------- */

function drawBackground(ctx, W, H) {
  // 基础渐变
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#251a36');
  grad.addColorStop(0.45, INK);
  grad.addColorStop(1, '#15101f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 顶部紫晕
  const glow = ctx.createRadialGradient(W / 2, -60, 20, W / 2, -60, 460);
  glow.addColorStop(0, 'rgba(139, 95, 168, 0.42)');
  glow.addColorStop(1, 'rgba(139, 95, 168, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 460);

  // 底部酒红晕
  const glow2 = ctx.createRadialGradient(W / 2, H + 80, 20, W / 2, H + 80, 420);
  glow2.addColorStop(0, 'rgba(122, 37, 64, 0.3)');
  glow2.addColorStop(1, 'rgba(122, 37, 64, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, H - 420, W, 420);

  // 细网格
  ctx.strokeStyle = 'rgba(201, 169, 97, 0.045)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let yy = 0; yy <= H; yy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(W, yy);
    ctx.stroke();
  }

  // 散落星点
  ctx.fillStyle = 'rgba(232, 217, 168, 0.28)';
  for (let i = 0; i < 40; i++) {
    const x = pseudoRandom(i * 7 + 1) * W;
    const yy = pseudoRandom(i * 13 + 5) * H;
    const r = pseudoRandom(i * 3 + 2) * 1.4 + 0.3;
    ctx.beginPath();
    ctx.arc(x, yy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------------- 外框 ---------------- */

function drawFrame(ctx, W, H) {
  const pad = 24;
  ctx.strokeStyle = 'rgba(201, 169, 97, 0.5)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 12);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(201, 169, 97, 0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, pad + 7, pad + 7, W - (pad + 7) * 2, H - (pad + 7) * 2, 8);
  ctx.stroke();

  // 四角装饰
  const corner = 42;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  const corners = [
    [pad, pad, 1, 1],
    [W - pad, pad, -1, 1],
    [pad, H - pad, 1, -1],
    [W - pad, H - pad, -1, -1],
  ];
  corners.forEach(([cx, cy, dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 10, cy + dy * corner);
    ctx.lineTo(cx + dx * 10, cy + dy * 10);
    ctx.lineTo(cx + dx * corner, cy + dy * 10);
    ctx.stroke();
  });
}

/* ---------------- 标题 ---------------- */

function drawHeader(ctx, W, y) {
  ctx.textAlign = 'center';

  ctx.fillStyle = GOLD;
  ctx.font = '600 15px "Noto Serif SC", serif';
  ctx.fillText('🍀  LUCKY DIVINATION', W / 2, y);

  y += 48;
  ctx.fillStyle = IVORY;
  ctx.font = '600 40px "Cinzel", "Noto Serif SC", serif';
  ctx.fillText('玄 象 卜 卦', W / 2, y);

  y += 22;
  ctx.strokeStyle = 'rgba(201, 169, 97, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 120, y);
  ctx.lineTo(W / 2 + 120, y);
  ctx.stroke();

  // 中央菱形
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = GOLD;
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();

  return y + 34;
}

/* ---------------- 对象 ---------------- */

function drawSubject(ctx, W, y, token) {
  ctx.textAlign = 'center';

  if (token) {
    y += 8;
    ctx.fillStyle = GOLD_LIGHT;
    ctx.font = '600 26px "Noto Serif SC", serif';
    ctx.fillText(truncate(token.symbol, 18), W / 2, y);

    y += 22;
    ctx.fillStyle = 'rgba(240, 230, 216, 0.6)';
    ctx.font = '13px "Noto Serif SC", serif';
    ctx.fillText(truncate(token.name, 26), W / 2, y);

    y += 24;
    ctx.fillStyle = IVORY;
    ctx.font = '600 22px monospace';
    ctx.fillText('$' + formatP(token.priceUsd), W / 2, y);

    const chg = token.change24h || 0;
    ctx.fillStyle = chg >= 0 ? '#6b9b5e' : '#b8454a';
    ctx.font = '15px monospace';
    ctx.fillText((chg >= 0 ? '+' : '') + chg.toFixed(2) + '%  ·  24h', W / 2, y + 22);
    y += 34;
  } else {
    y += 10;
    ctx.fillStyle = 'rgba(240, 230, 216, 0.45)';
    ctx.font = '15px "Noto Serif SC", serif';
    ctx.fillText('— 纯卦象占卜 · 未关联行情 —', W / 2, y);
    y += 28;
  }

  return y + 10;
}

/* ---------------- 卦象 ---------------- */

function drawDivination(ctx, W, y, result) {
  const d = result.divination;

  ctx.textAlign = 'center';
  y += 6;

  if (d.method === 'liuyao' || d.method === 'meihua') {
    // 卦名
    ctx.fillStyle = GOLD_LIGHT;
    ctx.font = '600 34px "Cinzel", "Noto Serif SC", serif';
    ctx.fillText(d.name, W / 2, y);
    y += 24;
    ctx.fillStyle = 'rgba(240, 230, 216, 0.55)';
    ctx.font = '13px "Noto Serif SC", serif';
    ctx.fillText(d.symbol + '  上' + d.upperTrigram + ' 下' + d.lowerTrigram, W / 2, y);
    y += 26;

    // 卦象线条
    const barW = 108;
    const barH = 9;
    const gap = 14;
    const totalH = barH * 6 + gap * 5;
    const startY = y + 6;

    d.yaos.forEach((yao, i) => {
      const yy = startY + totalH - (i + 1) * (barH + gap) + gap;
      const cx = W / 2;

      if (yao.isYang) {
        const g = ctx.createLinearGradient(cx - barW / 2, 0, cx + barW / 2, 0);
        if (yao.isMoving) {
          g.addColorStop(0, '#b8456a');
          g.addColorStop(0.5, '#e06a8c');
          g.addColorStop(1, '#b8456a');
        } else {
          g.addColorStop(0, GOLD_DARK);
          g.addColorStop(0.5, GOLD_LIGHT);
          g.addColorStop(1, GOLD_DARK);
        }
        ctx.fillStyle = g;
        roundRect(ctx, cx - barW / 2, yy, barW, barH, 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = yao.isMoving ? '#e06a8c' : GOLD;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - barW / 2, yy + barH / 2);
        ctx.lineTo(cx + barW / 2, yy + barH / 2);
        ctx.stroke();
      }

      // 爻位标签
      ctx.fillStyle = 'rgba(240, 230, 216, 0.35)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(yao.position, cx - barW / 2 - 10, yy + barH);
      ctx.textAlign = 'left';
      ctx.fillText(yao.isMoving ? '动' : yao.isYang ? '阳' : '阴', cx + barW / 2 + 10, yy + barH);
      ctx.textAlign = 'center';
    });

    y = startY + totalH + 12;

    if (d.hasMoving && d.changedName !== d.name) {
      ctx.fillStyle = 'rgba(240, 230, 216, 0.6)';
      ctx.font = '14px "Noto Serif SC", serif';
      ctx.fillText('之卦：' + d.changedName, W / 2, y);
      y += 20;
    }
  } else if (d.method === 'tarot') {
    // 塔罗牌阵
    ctx.fillStyle = GOLD_LIGHT;
    ctx.font = '600 22px "Noto Serif SC", serif';
    ctx.fillText(d.spreadName, W / 2, y);
    y += 12;
    ctx.fillStyle = 'rgba(240, 230, 216, 0.5)';
    ctx.font = '12px "Noto Serif SC", serif';
    ctx.fillText(d.spreadDesc, W / 2, y);
    y += 22;

    // 卡片（最多显示 5 张）
    const show = d.cards.slice(0, 5);
    const cardW = show.length <= 3 ? 110 : 92;
    const cardH = cardW * 1.55;
    const gap = 12;
    const totalW = show.length * cardW + (show.length - 1) * gap;
    const startX = (W - totalW) / 2;

    show.forEach((c, i) => {
      const x = startX + i * (cardW + gap);
      const yy = y;

      // 牌面
      const g = ctx.createLinearGradient(x, yy, x + cardW, yy + cardH);
      g.addColorStop(0, '#2b1b3d');
      g.addColorStop(0.55, WINE);
      g.addColorStop(1, '#1f1430');
      ctx.fillStyle = g;
      roundRect(ctx, x, yy, cardW, cardH, 8);
      ctx.fill();

      ctx.strokeStyle = GOLD_DARK;
      ctx.lineWidth = 1.2;
      roundRect(ctx, x + 4, yy + 4, cardW - 8, cardH - 8, 6);
      ctx.stroke();

      // 花色符号
      ctx.textAlign = 'center';
      ctx.fillStyle = GOLD;
      ctx.font = (cardW * 0.26) + 'px serif';
      ctx.fillText(c.suitSymbol || '✦', x + cardW / 2, yy + cardH * 0.42);

      // 牌名
      ctx.fillStyle = GOLD_LIGHT;
      ctx.font = '600 ' + Math.max(9, cardW * 0.082) + 'px "Noto Serif SC", serif';
      const name = c.name.length > 6 ? c.name.slice(0, 6) : c.name;
      ctx.fillText(name, x + cardW / 2, yy + cardH * 0.66);

      // 位置
      ctx.fillStyle = 'rgba(240, 230, 216, 0.45)';
      ctx.font = Math.max(8, cardW * 0.07) + 'px "Noto Serif SC", serif';
      ctx.fillText(c.position, x + cardW / 2, yy + cardH * 0.78);

      // 逆位标记
      if (c.reversed) {
        ctx.save();
        ctx.translate(x + cardW / 2, yy + cardH * 0.9);
        ctx.rotate(Math.PI);
        ctx.fillStyle = '#b8456a';
        ctx.font = '9px "Noto Serif SC", serif';
        ctx.fillText('逆位', 0, 0);
        ctx.restore();
      }
    });

    y += cardH + 8;
  }

  return y;
}

/* ---------------- 评分 ---------------- */

function drawScore(ctx, W, y, result) {
  y += 16;

  // 分数环
  const cx = W / 2;
  const cy = y + 62;
  const r = 52;

  ctx.textAlign = 'center';

  // 底环
  ctx.strokeStyle = 'rgba(201, 169, 97, 0.15)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // 进度环
  const score = result.finalScore;
  const color = score >= 60 ? '#6b9b5e' : score >= 40 ? GOLD : '#b8454a';
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (score / 100) * Math.PI * 2);
  ctx.stroke();

  // 分数
  ctx.fillStyle = IVORY;
  ctx.font = '600 34px "Cinzel", serif';
  ctx.fillText(String(score), cx, cy + 11);

  // 判定
  ctx.fillStyle = color;
  ctx.font = '600 20px "Noto Serif SC", serif';
  ctx.fillText(result.verdict.icon + ' ' + result.verdict.label, cx, cy + 44);

  return cy + 74;
}

/* ---------------- 建议 ---------------- */

function drawAdvice(ctx, W, H, y, result) {
  const boxY = Math.max(y + 12, H - 260);
  const boxH = 150;

  ctx.fillStyle = 'rgba(201, 169, 97, 0.05)';
  roundRect(ctx, 62, boxY, W - 124, boxH, 10);
  ctx.fill();

  ctx.strokeStyle = 'rgba(201, 169, 97, 0.22)';
  ctx.lineWidth = 1;
  roundRect(ctx, 62, boxY, W - 124, boxH, 10);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = '600 14px "Noto Serif SC", serif';
  ctx.fillText('✦ 断 语', W / 2, boxY + 28);

  // 文字换行
  ctx.fillStyle = 'rgba(240, 230, 216, 0.88)';
  ctx.font = '14px "Noto Serif SC", serif';
  const text = stripHtml(result.advice);
  const lines = wrapText(ctx, text, W - 168, 5);
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, boxY + 54 + i * 22);
  });
}

/* ---------------- 页脚 ---------------- */

function drawFooter(ctx, W, H) {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240, 230, 216, 0.3)';
  ctx.font = '11px "Noto Serif SC", serif';
  ctx.fillText('卦象仅供参考 · 投资需谨慎', W / 2, H - 52);

  const d = new Date();
  ctx.fillStyle = 'rgba(201, 169, 97, 0.45)';
  ctx.font = '10px monospace';
  ctx.fillText(
    d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'),
    W / 2, H - 34
  );
}

/* ---------------- 工具函数 ---------------- */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth, maxLines) {
  const chars = String(text).split('');
  const lines = [];
  let line = '';

  for (const ch of chars) {
    const test = line + ch;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && chars.join('').length > lines.join('').length) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
  }
  return lines;
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, '');
}

function formatP(p) {
  const n = Math.abs(p || 0);
  if (n >= 1) return p.toFixed(2);
  if (n >= 0.01) return p.toFixed(4);
  if (n >= 0.0001) return p.toFixed(6);
  return (p || 0).toExponential(3);
}

/** 确定性伪随机（保证同一次生成结果稳定） */
function pseudoRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** 触发下载 */
export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `divination-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
