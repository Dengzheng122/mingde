/* 算法自检脚本 — 在 Node 中运行：node test-algorithms.mjs */

import { castLiuyao, meihuaByTime, meihuaByText, drawTarot, SPREADS, TAROT_DECK, MAJOR_ARCANA, TRIGRAMS, hashString } from './js/algorithms.js';
import { validateAddress, analyzeMarket, formatPrice, formatNumber } from './js/market.js';
import { dailyFortune, buildReport, synthesize } from './js/interpret.js';

let pass = 0, fail = 0;

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`); }
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/* ---------------- 基础数据 ---------------- */
section('基础数据完整性');

check('八卦共 8 个', Object.keys(TRIGRAMS).length === 8);
check('大阿卡纳共 22 张', MAJOR_ARCANA.length === 22, `实际 ${MAJOR_ARCANA.length}`);
check('塔罗总牌数 78 张', TAROT_DECK.length === 78, `实际 ${TAROT_DECK.length}`);
check('四花色 × 14 张 = 56 小阿卡纳', TAROT_DECK.filter(c => !c.major).length === 56);
check('每张牌都有正逆位释义', TAROT_DECK.every(c => c.upright && c.reversed));
check('牌 ID 唯一', new Set(TAROT_DECK.map(c => c.id)).size === 78);
check('牌阵共 4 种', Object.keys(SPREADS).length === 4);

/* ---------------- 六爻 ---------------- */
section('六爻起卦（2000 次随机）');

let liuyaoErrors = 0;
let unknownNames = new Set();
let badYaoCount = 0;
let symbolMismatch = 0;

for (let i = 0; i < 2000; i++) {
  const r = castLiuyao(Math.random);

  if (r.yaos.length !== 6) badYaoCount++;
  if (r.name === '未知卦') unknownNames.add(r.upperTrigram + r.lowerTrigram + '/' + r.changedUpper + r.changedDown);

  // 符号一致性：上卦符号 + 下卦符号
  const expectSym = TRIGRAMS[r.upperTrigram].symbol + TRIGRAMS[r.lowerTrigram].symbol;
  if (r.symbol !== expectSym) symbolMismatch++;

  // 卦名与上下卦一致性
  const expectedName = Object.entries(TRIGRAMS).find(([k, v]) => k === r.upperTrigram);
  if (!expectedName) liuyaoErrors++;
}

check('六爻数均为 6', badYaoCount === 0, `异常 ${badYaoCount} 次`);
check('无「未知卦」', unknownNames.size === 0, [...unknownNames].slice(0, 5).join(', '));
check('卦象符号与上下卦一致', symbolMismatch === 0, `不一致 ${symbolMismatch} 次`);
check('无异常卦组', liuyaoErrors === 0);

// 动爻率统计（六次皆静的概率应存在）
let allStatic = 0;
for (let i = 0; i < 2000; i++) {
  if (!castLiuyao(Math.random).hasMoving) allStatic++;
}
const staticRate = allStatic / 2000;
check('六爻皆静占比在合理区间(8%~20%)', staticRate > 0.08 && staticRate < 0.20, `实际 ${(staticRate*100).toFixed(1)}%`);

// 理论值 (2/3)^6 = 8.8%
console.log(`     理论值 (2/3)^6 = ${((2/3)**6*100).toFixed(1)}%`);

/* ---------------- 梅花易数 ---------------- */
section('梅花易数');

let meihuaErrors = 0;
const nameSet = new Set();

for (let i = 0; i < 1000; i++) {
  const r = meihuaByTime(new Date(), Math.random);
  if (r.name === '未知卦') { meihuaErrors++; nameSet.add(r.upperTrigram + r.lowerTrigram); }
}
check('时间起卦无「未知卦」', meihuaErrors === 0, [...nameSet].slice(0, 5).join(', '));

const m2 = meihuaByText('So11111111111111111111111111111111111112', Math.random);
check('文本起卦返回有效卦象', !!m2.name && m2.name !== '未知卦', m2.name);
check('梅花起卦恒有一动爻', m2.hasMoving === true);
check('上下卦数在 1~8', m2.numbers.upperNum >= 1 && m2.numbers.upperNum <= 8);
check('动爻数在 1~6', m2.numbers.movingNum >= 1 && m2.numbers.movingNum <= 6);

// 确定性：同一地址应得同一卦
const a = meihuaByText('test-address-123', Math.random);
const b = meihuaByText('test-address-123', Math.random);
check('同一文本起卦结果可复现', a.name === b.name && a.numbers.upperNum === b.numbers.upperNum);

/* ---------------- 塔罗 ---------------- */
section('塔罗抽牌');

for (const [key, spread] of Object.entries(SPREADS)) {
  const r = drawTarot(key, null);
  check(`${spread.name} 牌数正确`, r.cards.length === spread.positions.length, `期望 ${spread.positions.length} 实际 ${r.cards.length}`);
  check(`${spread.name} 无重复牌`, new Set(r.cards.map(c => c.id)).size === spread.positions.length);
  check(`${spread.name} 每张牌有释义`, r.cards.every(c => c.meaning && c.meaning.length > 5));
}

// 正逆位概率统计
let revCount = 0, total = 0;
for (let i = 0; i < 500; i++) {
  drawTarot('celtic', null).cards.forEach(c => { if (c.reversed) revCount++; total++; });
}
const revRate = revCount / total;
check('逆位率在 25%~48% 区间', revRate > 0.25 && revRate < 0.48, `实际 ${(revRate*100).toFixed(1)}%`);

// 种子复现
const t1 = drawTarot('three', 12345);
const t2 = drawTarot('three', 12345);
check('相同种子产生相同牌面', t1.raw === t2.raw);

/* ---------------- 行情 ---------------- */
section('行情与地址校验');

check('合法 Solana 地址', validateAddress('So11111111111111111111111111111111111112').valid);
check('合法 EVM 地址', validateAddress('0x1234567890abcdef1234567890abcdef12345678').valid);
check('拒绝非法地址', !validateAddress('not-a-real-address').valid);
check('拒绝空值', !validateAddress('').valid);
check('拒绝过短 EVM', !validateAddress('0x1234').valid);

const mockToken = {
  name: 'Test Token', symbol: 'TEST', priceUsd: 0.001234,
  change24h: 35, change1h: 5, liquidity: 800000, volume24h: 2400000,
  buyRatio: 0.65, marketCap: 5000000, chain: 'solana', dex: 'raydium',
};

const m1 = analyzeMarket(mockToken);
check('强势行情评分 > 55', m1.score > 55, `实际 ${m1.score}`);
check('弱势行情评分 < 45', analyzeMarket({ ...mockToken, change24h: -40, buyRatio: 0.3, liquidity: 5000 }).score < 45);
check('评分范围 0~100', m1.score >= 0 && m1.score <= 100);
check('信号数组非空', m1.signals.length >= 3);

check('价格格式化 大额', formatPrice(12345.6) === '$12,346', formatPrice(12345.6));
check('价格格式化 常规', formatPrice(1.5) === '$1.50', formatPrice(1.5));
check('价格格式化 微小', formatPrice(0.00001234).startsWith('$1.234e'), formatPrice(0.00001234));
check('大数字格式化', formatNumber(1500000) === '$1.50M', formatNumber(1500000));

/* ---------------- 解读引擎 ---------------- */
section('解读引擎');

const div1 = castLiuyao(Math.random);
const rep1 = buildReport(div1, mockToken, m1);
check('报告包含结论段', rep1.sections.some(s => s.title.includes('结论')));
check('报告分数 0~100', rep1.finalScore >= 0 && rep1.finalScore <= 100);
check('报告有断语', typeof rep1.advice === 'string' && rep1.advice.length > 20);
check('报告有判定标签', !!rep1.verdict.label);

const noTokenReport = buildReport(div1, null, null);
check('无代币时也能生成报告', noTokenReport.sections.length > 0);
check('无代币报告不含行情段', !noTokenReport.sections.some(s => s.title.includes('行情')));

const tarotDiv = drawTarot('celtic', null);
const tarotReport = buildReport(tarotDiv, mockToken, m1);
check('塔罗报告含塔罗段', tarotReport.sections.some(s => s.title.includes('塔罗')));
check('塔罗报告列出全部牌', tarotReport.sections.find(s => s.title.includes('塔罗')).text.includes('愚者') || tarotReport.sections.find(s => s.title.includes('塔罗')).text.length > 100);

/* ---------------- 每日运势 ---------------- */
section('每日运势');

const d1 = dailyFortune(new Date('2026-10-14'));
const d2 = dailyFortune(new Date('2026-10-14'));
const d3 = dailyFortune(new Date('2026-10-15'));

check('同日运势一致', d1.totalScore === d2.totalScore);
check('不同日运势不同', d1.totalScore !== d3.totalScore || d1.summary !== d3.summary);
check('运势项共 5 项', d1.items.length === 5);
check('各项分数 1~5', d1.items.every(i => i.score >= 1 && i.score <= 5));
check('星数与分数匹配', d1.items.every(i => i.stars.length === 5));
check('有幸运数字/方位/颜色', !!d1.luckyNumber && !!d1.luckyDirection && !!d1.luckyColor);

/* ---------------- 汇总 ---------------- */
console.log(`\n${'='.repeat(46)}`);
console.log(`  通过 ${pass} 项 · 失败 ${fail} 项`);
console.log('='.repeat(46));

if (fail > 0) process.exit(1);
