/* ============================================================
   六爻 · 梅花易数 · 塔罗  —  核心算法
   纯函数实现，无外部依赖
   ============================================================ */

/** 安全随机源：支持注入以便复现 */
export function makeRandom(seed) {
  if (seed == null) {
    return Math.random;
  }
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* ============================================================
   八卦基础数据
   先天八卦数（梅花易数用），后天八卦数（六爻纳甲用）
   ============================================================ */

export const TRIGRAMS = {
  乾: { symbol: '☰', bits: [1, 1, 1], nature: '天', element: '金', later: 6, earlier: 1, attr: '健' },
  兑: { symbol: '☱', bits: [1, 1, 0], nature: '泽', element: '金', later: 7, earlier: 2, attr: '悦' },
  离: { symbol: '☲', bits: [1, 0, 1], nature: '火', element: '火', later: 9, earlier: 3, attr: '丽' },
  震: { symbol: '☳', bits: [1, 0, 0], nature: '雷', element: '木', later: 4, earlier: 4, attr: '动' },
  巽: { symbol: '☴', bits: [0, 1, 1], nature: '风', element: '木', later: 5, earlier: 5, attr: '入' },
  坎: { symbol: '☵', bits: [0, 1, 0], nature: '水', element: '水', later: 2, earlier: 6, attr: '陷' },
  艮: { symbol: '☶', bits: [0, 0, 1], nature: '山', element: '土', later: 8, earlier: 7, attr: '止' },
  坤: { symbol: '☷', bits: [0, 0, 0], nature: '地', element: '土', later: 3, earlier: 8, attr: '顺' },
};

/** 六十四卦（上卦 × 下卦），索引 1~64 */
const HEXAGRAM_NAMES = {
  '乾乾': '乾为天', '乾兑': '天泽履', '乾离': '天火同人', '乾震': '天雷无妄',
  '乾巽': '天风姤', '乾坎': '天水讼', '乾艮': '天山遁', '乾坤': '天地否',
  '兑乾': '泽天夬', '兑兑': '兑为泽', '兑离': '泽火革', '兑震': '泽雷随',
  '兑巽': '泽风大过', '兑坎': '泽水困', '兑艮': '泽山咸', '兑坤': '泽地萃',
  '离乾': '火天大有', '离兑': '火泽睽', '离离': '离为火', '离震': '火雷噬嗑',
  '离巽': '火风鼎', '离坎': '火水未济', '离艮': '火山旅', '离坤': '火地晋',
  '震乾': '雷天大壮', '震兑': '雷泽归妹', '震离': '雷火丰', '震震': '震为雷',
  '震巽': '雷风恒', '震坎': '雷水解', '震艮': '雷山小过', '震坤': '雷地豫',
  '巽乾': '风天小畜', '巽兑': '风泽中孚', '巽离': '风火家人', '巽震': '风雷益',
  '巽巽': '巽为风', '巽坎': '风水涣', '巽艮': '风山渐', '巽坤': '风地观',
  '坎乾': '水天需', '坎兑': '水泽节', '坎离': '水火既济', '坎震': '水雷屯',
  '坎巽': '水风井', '坎坎': '坎为水', '坎艮': '水山蹇', '坎坤': '水地比',
  '艮乾': '山天大畜', '艮兑': '山泽损', '艮离': '山火贲', '艮震': '山雷颐',
  '艮巽': '山风蛊', '艮坎': '山水蒙', '艮艮': '艮为山', '艮坤': '山地剥',
  '坤乾': '地天泰', '坤兑': '地泽临', '坤离': '地火明夷', '坤震': '地雷复',
  '坤巽': '地风升', '坤坎': '地水师', '坤艮': '地山谦', '坤坤': '坤为地',
};

/** 六十四卦吉凶倾向（用于定吉凶基调） */
const HEXAGRAM_LUCK = {
  '乾为天': 5, '坤为地': 5, '水雷屯': 2, '山水蒙': 2, '水天需': 4, '天水讼': 1,
  '地水师': 2, '水地比': 4, '风天小畜': 3, '天泽履': 3, '地天泰': 5, '天地否': 1,
  '天火同人': 5, '火天大有': 5, '地山谦': 5, '雷地豫': 4, '泽雷随': 3, '山风蛊': 2,
  '地泽临': 4, '风地观': 4, '火雷噬嗑': 3, '山火贲': 3, '山地剥': 1, '地雷复': 3,
  '天雷无妄': 4, '山天大畜': 4, '山雷颐': 3, '泽风大过': 1, '坎为水': 2, '离为火': 2,
  '泽山咸': 4, '雷风恒': 4, '天山遁': 1, '雷天大壮': 4, '火地晋': 4, '地火明夷': 1,
  '风火家人': 4, '火泽睽': 2, '水山蹇': 1, '雷水解': 4, '山泽损': 2, '风雷益': 5,
  '泽天夬': 5, '天风姤': 2, '泽地萃': 4, '地风升': 4, '泽水困': 1, '水风井': 3,
  '泽火革': 4, '火风鼎': 4, '震为雷': 3, '艮为山': 2, '火山旅': 2,
  '巽为风': 3, '兑为泽': 3, '风水涣': 1, '水泽节': 3, '风泽中孚': 4, '雷山小过': 2,
  '水火既济': 5, '火水未济': 2, '山风蛊': 2,
};

/** 六十四卦释义（精简版，用于报告） */
const HEXAGRAM_MEANING = {
  '乾为天': '刚健中正，六爻纯阳。事势刚猛，宜进取有为，然过刚易折。',
  '坤为地': '柔顺承载，六爻纯阴。宜静守待时，不可妄动贪进。',
  '水雷屯': '云雷屯难，初生多阻。宜蓄势待变，缓图不宜速进。',
  '山水蒙': '山下出泉，蒙昧未开。宜虚心求教，明辨是非。',
  '水天需': '云上于天，等待时机。时机未至，守正待时为上。',
  '天水讼': '天水违行，争讼是非。宜和解退让，强行必两败俱伤。',
  '地水师': '地中有水，行师有律。宜整军经武，师出有名。',
  '水地比': '水在地上，亲比相辅。宜结盟互助，众心所归。',
  '风天小畜': '风行天上，小有蓄积。力量未足，宜小步积累。',
  '天泽履': '上天下泽，履道有礼。宜循礼而行，谨慎则吉。',
  '地天泰': '天地交泰，上下通达。大吉之象，诸事顺遂。',
  '天地否': '天地不交，闭塞不通。宜静守，勿妄求。',
  '天火同人': '天与火同，与人和同。宜合作共赢。',
  '火天大有': '火在天上，大有所得。收获丰盛，宜守成。',
  '地山谦': '地中有山，谦抑有礼。谦则得众，刚则招损。',
  '雷地豫': '雷出地奋，和乐豫备。宜顺时而动，逸乐勿沉溺。',
  '泽雷随': '泽上有雷，随时而动。宜顺应时势，随机应变。',
  '山风蛊': '山下有风，积弊待治。宜整顿更新，革故鼎新。',
  '地泽临': '泽上有地，阳气渐临。势头向好，宜积极进取。',
  '风地观': '风行地上，观仰仰望。宜观察形势，静观其变。',
  '火雷噬嗑': '雷电噬嗑，除去梗阻。宜果断除弊，咬定不放。',
  '山火贲': '山下有火，文饰其外。宜修内敛华，不可务虚。',
  '山地剥': '山附于地，剥落将尽。宜顺势收缩，保存实力。',
  '地雷复': '雷在地中，一阳来复。否极泰来，转机初现。',
  '天雷无妄': '天下雷行，物与无妄。宜守本分，不生妄念。',
  '山天大畜': '天在山中，蓄积至大。宜厚积，等待时机爆发。',
  '山雷颐': '山下有雷，颐养正道。宜养精蓄锐，慎言节食。',
  '泽风大过': '泽灭木，栋桡过重。负担过重，宜减负分担。',
  '坎为水': '重险相叠，险难重重。宜谨慎小心，避险守成。',
  '离为火': '明两相继，附丽有恒。宜依附正道，光明远行。',
  '泽山咸': '山上有泽，二气感应。宜相互感应，以诚相待。',
  '雷风恒': '雷风相与，恒久有常。宜守常持久，循序渐进。',
  '天山遁': '天下有山，适时退避。宜急流勇退，保存实力。',
  '雷天大壮': '雷在天上，刚壮非常。宜用而勿滥用，壮而知止。',
  '火地晋': '明出地上，晋升向上。宜积极进取，功名有望。',
  '地火明夷': '明入地中，外明内暗。宜韬光养晦，藏锋待时。',
  '风火家人': '风自火出，治家有道。宜内部和睦，立规守正。',
  '火泽睽': '上火下泽，志不同行。宜求同存异，勿强行。',
  '水山蹇': '山上有水，行道艰难。宜知难而退，寻求助力。',
  '雷水解': '雷雨作解，险难消散。宜及时解困，释放压力。',
  '山泽损': '山下有泽，损下益上。宜有所付出，方有增益。',
  '风雷益': '风雷相益，损上益下。宜损己利人，得道多助。',
  '泽天夬': '泽上于天，决而去之。宜果断决断，去除积弊。',
  '天风姤': '天下有风，不期而遇。宜把握机遇，谨防意外。',
  '泽地萃': '泽上于地，聚集众心。宜聚合众人，共成其事。',
  '地风升': '地中生木，积小成高。宜循序渐进，稳步上升。',
  '泽水困': '泽无水，困顿受制。宜俭省节约，蓄势待变。',
  '水风井': '木上有水，井养不穷。宜守常更新，惠及众人。',
  '泽火革': '水火相息，变革更新。宜革故鼎新，顺应时势。',
  '火风鼎': '木上有火，鼎新之象。宜建立新制，稳固根基。',
  '震为雷': '重雷发动，震惊百里。宜果敢行动，惊醒蛰伏。',
  '艮为山': '重山相叠，静止不妄。宜适时止步，静以修身。',
  '火山旅': '山上有火，行旅无常。宜谨慎行事，柔顺谦和。',
  '巽为风': '随风巽入，顺以行事。宜顺遂自然，柔顺渗透。',
  '兑为泽': '两泽相连，喜悦相与。宜和悦待人，以言感人。',
  '风水涣': '风行水上，涣散流离。宜聚散有度，重建凝聚。',
  '水泽节': '泽上有水，节以制度。宜节制有度，方能长久。',
  '风泽中孚': '泽上有风，中心诚信。宜以诚待人，信任为本。',
  '雷山小过': '山上有雷，小有过越。宜谨守本分，小事可为。',
  '水火既济': '水在火上，事已成。宜守成防变，居安思危。',
  '火水未济': '火在水上，事未成。宜耐心等待，积蓄力量。',
};

/* ============================================================
   六爻（周易）
   三枚铜钱掷六次，自下而上成卦
   ============================================================ */

const YAO_NAMES = ['初', '二', '三', '四', '五', '上'];

/** 纳甲：八宫六十四卦纳音简表（卦名 → 纳音） */
const NAYIN = {
  '乾为天': '天子火', '坤为地': '地母金', '水雷屯': '水雷雷', '山水蒙': '山水木',
  '水天需': '水天金', '天水讼': '天水火', '地水师': '地水火', '水地比': '水地土',
  '风天小畜': '风天火', '天泽履': '天泽火', '地天泰': '地天木', '天地否': '天地金',
  '天火同人': '天火火', '火天大有': '火天火', '地山谦': '地山金', '雷地豫': '雷地火',
  '泽雷随': '泽雷火', '山风蛊': '山风木', '地泽临': '地泽金', '风地观': '风地木',
  '火雷噬嗑': '火雷火', '山火贲': '山火金', '山地剥': '山地火', '地雷复': '地雷木',
  '天雷无妄': '天雷金', '山天大畜': '山天火', '山雷颐': '山雷木', '泽风大过': '泽风木',
  '坎为水': '坎为水', '离为火': '离为火', '泽山咸': '泽山土', '雷风恒': '雷风木',
  '天山遁': '天山金', '雷天大壮': '雷天火', '火地晋': '火地火', '地火明夷': '地火土',
  '风火家人': '风火木', '火泽睽': '火泽金', '水山蹇': '水山土', '雷水解': '雷水解',
  '山泽损': '山泽火', '风雷益': '风雷火', '泽天夬': '泽天火', '天风姤': '天风金',
  '泽地萃': '泽地火', '地风升': '地风金', '泽水困': '泽水解', '水风井': '水风木',
  '泽火革': '泽火革', '火风鼎': '火风火', '震为雷': '震为木', '艮为山': '艮为土',
  '火山旅': '火山火', '巽为风': '巽为木', '兑为泽': '兑为金', '风水涣': '风水涣',
  '水泽节': '水泽节', '风泽中孚': '风泽中孚', '雷山小过': '雷山小过', '水火既济': '水火既济',
  '火水未济': '火水未济',
};

/**
 * 掷一次三枚铜钱
 * 返回 { sum, type, isYang, isMoving }
 * 3 正(背) = 老阳(重) 9 —— 阳 + 动
 * 2 正 = 少阴 8 —— 阳
 * 1 正 = 少阳 7 —— 阴
 * 0 正 = 老阴(交) 6 —— 阴 + 动
 */
function tossCoins(rng) {
  let heads = 0;
  for (let i = 0; i < 3; i++) {
    if (rng() < 0.5) heads++;
  }
  const sum = heads + 6;
  const isYang = sum === 7 || sum === 9;
  const isMoving = sum === 6 || sum === 9;
  const typeMap = { 6: '老阴', 7: '少阳', 8: '少阴', 9: '老阳' };
  return { sum, type: typeMap[sum], isYang, isMoving };
}

/**
 * 六爻起卦
 * @param {function} rng 随机源
 * @returns 六爻卦象
 */
export function castLiuyao(rng = Math.random) {
  const tosses = [];
  for (let i = 0; i < 6; i++) {
    tosses.push(tossCoins(rng));
  }

  // 本卦：自下而上
  const primaryBits = tosses.map(t => (t.isYang ? 1 : 0));

  // 变卦：动爻变
  const changedBits = tosses.map(t => {
    if (!t.isMoving) return t.isYang ? 1 : 0;
    return t.isYang ? 0 : 1;
  });

  const trigramOf = (bits) => {
    for (const [name, t] of Object.entries(TRIGRAMS)) {
      if (t.bits.every((b, i) => b === bits[i])) return name;
    }
    return null;
  };

  // bits 顺序为 [初, 中, 上]
  const upName = trigramOf([changedBits[3], changedBits[4], changedBits[5]]);
  const downName = trigramOf([changedBits[0], changedBits[1], changedBits[2]]);

  const primaryUp = trigramOf([primaryBits[3], primaryBits[4], primaryBits[5]]);
  const primaryDown = trigramOf([primaryBits[0], primaryBits[1], primaryBits[2]]);

  const key = primaryUp + primaryDown;
  const changedKey = upName + downName;
  const name = HEXAGRAM_NAMES[key] || '未知卦';
  const changedName = HEXAGRAM_NAMES[changedKey] || name;

  const yaos = tosses.map((t, i) => ({
    position: YAO_NAMES[i],
    index: i,
    isYang: t.isYang,
    isMoving: t.isMoving,
    value: t.sum,
    type: t.type,
  }));

  return {
    method: 'liuyao',
    name,
    changedName,
    symbol: TRIGRAMS[primaryUp].symbol + TRIGRAMS[primaryDown].symbol,
    upperTrigram: primaryUp,
    lowerTrigram: primaryDown,
    changedUpper: upName,
    changedDown: downName,
    yaos,
    tosses,
    meaning: HEXAGRAM_MEANING[name] || '',
    changedMeaning: name === changedName ? '' : (HEXAGRAM_MEANING[changedName] || ''),
    naying: NAYIN[name] || '',
    luck: HEXAGRAM_LUCK[name] || 3,
    hasMoving: yaos.some(y => y.isMoving),
  };
}

/* ============================================================
   梅花易数
   时间起卦 / 数字起卦 / 随机起卦
   ============================================================ */

/** 时间起卦：年月日时数 */
export function meihuaByTime(date, rng = Math.random) {
  const d = date || new Date();
  const lunarLike = {
    year: d.getFullYear() - 1900 + 1900,
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
  };

  const upperNum = (lunarLike.year + lunarLike.month + lunarLike.day) % 8 || 8;
  const lowerNum = (lunarLike.year + lunarLike.month + lunarLike.day + lunarLike.hour) % 8 || 8;
  const movingNum = (lunarLike.year + lunarLike.month + lunarLike.day + lunarLike.hour) % 6 || 6;

  return buildMeihua(upperNum, lowerNum, movingNum, `时间起卦（${lunarLike.year}年${lunarLike.month}月${lunarLike.day}日${lunarLike.hour}时）`);
}

/** 数字起卦 */
export function meihuaByNumbers(a, b, rng = Math.random) {
  const upperNum = a % 8 || 8;
  const lowerNum = b % 8 || 8;
  const total = a + b;
  const movingNum = total % 6 || 6;
  return buildMeihua(upperNum, lowerNum, movingNum, `数字起卦（${a} / ${b}）`);
}

/** 随机起卦 */
export function meihuaRandom(rng = Math.random) {
  const a = Math.floor(rng() * 999) + 1;
  const b = Math.floor(rng() * 999) + 1;
  return meihuaByNumbers(a, b, rng);
}

/** 字符起卦（输入代币地址或文字） */
export function meihuaByText(text, rng = Math.random) {
  const h = hashString(text);
  const a = h % 997 + 1;
  const b = Math.floor(h / 997) % 997 + 1;
  return meihuaByNumbers(a, b, rng);
}

function numToTrigram(n) {
  const map = { 1: '乾', 2: '兑', 3: '离', 4: '震', 5: '巽', 6: '坎', 7: '艮', 8: '坤' };
  return map[n];
}

function buildMeihua(upperNum, lowerNum, movingNum, source) {
  const upper = numToTrigram(upperNum);
  const lower = numToTrigram(lowerNum);
  const key = upper + lower;
  const name = HEXAGRAM_NAMES[key] || '未知卦';

  // 动爻索引（1~6，自下而上）
  const movingIndex = movingNum - 1;

  const primaryBits = TRIGRAMS[upper].bits.map((_, i) => TRIGRAMS[lower].bits[i]);
  const primaryBitsTop = TRIGRAMS[upper].bits;
  const bits = [primaryBits[0], primaryBits[1], primaryBits[2]];

  const changedBits = bits.slice();
  changedBits[movingIndex] = changedBits[movingIndex] ? 0 : 1;

  const trigramOf = (b) => {
    for (const [n, t] of Object.entries(TRIGRAMS)) {
      if (t.bits.every((x, i) => x === b[i])) return n;
    }
    return null;
  };
  const changedUp = trigramOf([changedBits[3], changedBits[4], changedBits[5]]);
  const changedDown = trigramOf([changedBits[0], changedBits[1], changedBits[2]]);
  const changedName = HEXAGRAM_NAMES[changedUp + changedDown] || name;

  const yaos = [0, 1, 2, 3, 4, 5].map(i => ({
    position: YAO_NAMES[i],
    index: i,
    isYang: bits[i] === 1,
    isMoving: i === movingIndex,
    value: 0,
    type: i === movingIndex ? (bits[i] ? '老阳' : '老阴') : (bits[i] ? '少阳' : '少阴'),
  }));

  return {
    method: 'meihua',
    name,
    changedName,
    symbol: TRIGRAMS[upper].symbol + TRIGRAMS[lower].symbol,
    upperTrigram: upper,
    lowerTrigram: lower,
    changedUpper: changedUp,
    changedDown: changedDown,
    yaos,
    meaning: HEXAGRAM_MEANING[name] || '',
    changedMeaning: name === changedName ? '' : (HEXAGRAM_MEANING[changedName] || ''),
    naying: NAYIN[name] || '',
    luck: HEXAGRAM_LUCK[name] || 3,
    hasMoving: true,
    source,
    numbers: { upperNum, lowerNum, movingNum },
  };
}

/* ============================================================
   韦特塔罗（Rider-Waite-Smith）
   78 张：22 大阿卡纳 + 56 小阿卡纳
   ============================================================ */

export const MAJOR_ARCANA = [
  { id: 0, name: '愚者', en: 'The Fool', numeral: '0', upright: '纯真无畏，新起点与无限可能。宜放下包袱，轻装上路。', reversed: '鲁莽轻率或过分天真。宜三思，勿被表象迷惑。' },
  { id: 1, name: '魔术师', en: 'The Magician', numeral: 'I', upright: '资源齐备，意志集中。宜主动出击，把握时机。', reversed: '才不配位或力不从心。宜认清现状，蓄力再发。' },
  { id: 2, name: '女祭司', en: 'The High Priestess', numeral: 'II', upright: '直觉敏锐，潜藏真相。宜静待时机，遵从内心。', reversed: '忽视直觉或信息不足。宜深入探究，勿轻下判断。' },
  { id: 3, name: '皇后', en: 'The Empress', numeral: 'III', upright: '丰饶丰盛，生机勃发。宜享受当下，静待果实。', reversed: '过度依赖或创造力受阻。宜自足自立，减少外求。' },
  { id: 4, name: '皇帝', en: 'The Emperor', numeral: 'IV', upright: '秩序稳固，权威掌控。宜建立规则，承担责任。', reversed: '专断僵化或权威受挑战。宜适度放权，灵活应变。' },
  { id: 5, name: '教皇', en: 'The Hierophant', numeral: 'V', upright: '传统指引，信念坚定。宜遵循既有规范，寻求正统。', reversed: '教条固执或形式化。宜独立思考，创新突破。' },
  { id: 6, name: '恋人', en: 'The Lovers', numeral: 'VI', upright: '结合共鸣，价值抉择。宜真诚连结，顺应吸引。', reversed: '关系失衡或选择犹疑。宜直面内心，厘清取舍。' },
  { id: 7, name: '战车', en: 'The Chariot', numeral: 'VII', upright: '意志坚定，勇往直前。宜果断推进，克服阻力。', reversed: '方向混乱或操之过急。宜收缰慢行，统合意志。' },
  { id: 8, name: '力量', en: 'Strength', numeral: 'VIII', upright: '内在力量，以柔克刚。宜耐心驯服，坚持不懈。', reversed: '自我怀疑或精力耗竭。宜重拾信心，温柔以待。' },
  { id: 9, name: '隐士', en: 'The Hermit', numeral: 'IX', upright: '沉思内省，独处有益。宜退守自省，寻求真知。', reversed: '孤僻封闭或逃避现实。宜走出自我，重新连结。' },
  { id: 10, name: '命运之轮', en: 'Wheel of Fortune', numeral: 'X', upright: '时来运转，周期更迭。宜顺应变化，把握机遇。', reversed: '时运不济或抗拒改变。宜耐心等待，周期自转。' },
  { id: 11, name: '正义', en: 'Justice', numeral: 'XI', upright: '公正无私，因果分明。宜客观理性，权衡轻重。', reversed: '偏见失衡或逃避责任。宜直面过失，寻求公正。' },
  { id: 12, name: '倒吊人', en: 'The Hanged Man', numeral: 'XII', upright: '悬置等待，转换视角。宜暂停退一步，另辟蹊径。', reversed: '徒劳拖延或执迷不悟。宜及时抽身，务实行动。' },
  { id: 13, name: '死神', en: 'Death', numeral: 'XIII', upright: '终结转化，断舍离。宜放手过去，迎向新生。', reversed: '抗拒改变或拖泥带水。宜接受现实，及早了断。' },
  { id: 14, name: '节制', en: 'Temperance', numeral: 'XIV', upright: '调和平衡，中道而行。宜取长补短，循序渐进。', reversed: '失衡过度或急躁冒进。宜回归中庸，耐心调和。' },
  { id: 15, name: '恶魔', en: 'The Devil', numeral: 'XV', upright: '欲望束缚，执念缠绕。宜直面欲望，挣脱束缚。', reversed: '挣脱枷锁或压抑释放。宜重获自由，告别依赖。' },
  { id: 16, name: '塔', en: 'The Tower', numeral: 'XVI', upright: '突变崩塌，幻象破灭。宜接受现实，重建根基。', reversed: '抗拒崩塌或灾难延续。宜接受损失，缓慢修复。' },
  { id: 17, name: '星星', en: 'The Star', numeral: 'XVII', upright: '希望重燃，灵感涌现。宜保持乐观，耐心等待。', reversed: '信心动摇或迷失方向。宜重拾初心，向光而行。' },
  { id: 18, name: '月亮', en: 'The Moon', numeral: 'XVIII', upright: '迷雾重重，真假难辨。宜保持谨慎，缓步前行。', reversed: '迷雾渐散或恐惧消退。宜厘清真相，恢复判断。' },
  { id: 19, name: '太阳', en: 'The Sun', numeral: 'XIX', upright: '光明磊落，活力充沛。宜乐观向前，成果显现。', reversed: '光芒受掩或过度乐观。宜低调行事，正视阴霾。' },
  { id: 20, name: '审判', en: 'Judgement', numeral: 'XX', upright: '觉醒清算，重新出发。宜总结过往，果断决断。', reversed: '自我苛责或不愿面对。宜放下包袱，原谅自己。' },
  { id: 21, name: '世界', en: 'The World', numeral: 'XXI', upright: '圆满完成，格局升华。宜收官总结，拥抱成果。', reversed: '未竟之功或收尾欠缺。宜补齐短板，再接再厉。' },
];

const SUITS = [
  { name: '权杖', element: '火', theme: '行动、事业、热情', symbol: '🌿' },
  { name: '圣杯', element: '水', theme: '情感、关系、内心', symbol: '🍷' },
  { name: '宝剑', element: '风', theme: '思维、沟通、冲突', symbol: '⚔️' },
  { name: '星币', element: '土', theme: '物质、金钱、健康', symbol: '🌾' },
];

const RANKS = ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', '侍从', '骑士', '皇后', '国王'];

const RANK_UPRIGHT = {
  Ace: '新的开始与纯粹的能量。此牌正位，起点利好，宜主动开创。',
  2: '权衡与平衡。此牌正位，需要在两种力量之间做出平衡的选择。',
  3: '协作与等待成果。此牌正位，前期布局已具，宜与伙伴共谋。',
  4: '稳定与休整。此牌正位，进入守成阶段，宜休养生息。',
  5: '冲突与代价。此牌正位，竞争难免，争夺中必有损耗。',
  6: '平衡与施与受。此牌正位，开始得到回报，付出有了意义。',
  7: '策略与坚持。此牌正位，处境微妙，需要策略性防守。',
  8: '迅捷与专注。此牌正位，节奏加快，宜专注眼前勿分心。',
  9: '韧性与警觉。此牌正位，坚持到最后但需防范意外。',
  10: '圆满与负担。此牌正位，目标达成但责任随之而来。',
  侍从: '探索与消息。此牌正位，新消息将至，宜开放接受。',
  骑士: '行动与冲动。此牌正位，积极行动但需避免莽撞。',
  皇后: '丰盛与滋养。此牌正位，内在外皆丰，宜慷慨给予。',
  国王: '掌控与权威。此牌正位，成熟主导，权威自现。',
};

const RANK_REVERSED = {
  Ace: '新的能量受阻或被浪费。此牌逆位，起步不顺，宜蓄势。',
  2: '失衡或犹豫不决。此牌逆位，难以兼顾，宜专注一端。',
  3: '协作不畅或延宕。此牌逆位，团队配合不顺，需沟通。',
  4: '倦怠或停滞。此牌逆位，休息不足或进展停滞，宜调整。',
  5: '冲突升级或惨胜。此牌逆位，纷争难解，宜退让求全。',
  6: '施受不公或依赖。此牌逆位，付出未必有报，宜自省。',
  7: '防守失守或耗费。此牌逆位，策略失效或过度消耗。',
  8: '延误或受阻。此牌逆位，进展变缓，宜耐心等待。',
  9: '疲惫与戒备。此牌逆位，疑心过重，需放松心态。',
  10: '超载或责任难承。此牌逆位，负担沉重，宜卸载卸下。',
  侍从: '消息延迟或幼稚不成熟。此牌逆位，宜辨别真伪。',
  骑士: '冲动或停滞。此牌逆位，行动力不足或方向偏差。',
  皇后: '内耗或过度付出。此牌逆位，关怀他人而忽视自己。',
  国王: '专制或软弱。此牌逆位，权威受挑战或缺乏担当。',
};

/** 构建完整 78 张牌 */
export const TAROT_DECK = (() => {
  const deck = [];
  MAJOR_ARCANA.forEach(c => {
    deck.push({
      ...c,
      major: true,
      suit: null,
      suitSymbol: '✦',
      suitElement: null,
      suitTheme: '命运转折',
    });
  });
  SUITS.forEach(s => {
    RANKS.forEach((r, i) => {
      deck.push({
        id: 22 + SUITS.indexOf(s) * 14 + i,
        name: `${s.name}${r === 'Ace' ? '首牌' : r === '侍从' || r === '骑士' || r === '皇后' || r === '国王' ? r + '牌' : r}`,
        en: `${r} of ${s.name}`,
        numeral: r,
        major: false,
        suit: s.name,
        suitSymbol: s.symbol,
        suitElement: s.element,
        suitTheme: s.theme,
        upright: RANK_UPRIGHT[r],
        reversed: RANK_REVERSED[r],
      });
    });
  });
  return deck;
})();

/** 牌阵位置定义 */
export const SPREADS = {
  single: {
    name: '单张指引',
    desc: '快速洞察当前处境，适合日常轻决策',
    positions: ['当前局势'],
  },
  three: {
    name: '时间之流（三张）',
    desc: '过去、现在、未来的完整脉络，最经典的牌阵',
    positions: ['过去', '现在', '未来'],
  },
  decision: {
    name: '抉择对比（五张）',
    desc: '看清选项利弊，辅助重大决策',
    positions: ['现状', '选项 A', '选项 A 结果', '选项 B', '选项 B 结果'],
  },
  celtic: {
    name: '凯尔特十字（十张）',
    desc: '全景式深度解读，适合复杂局势',
    positions: ['现状', '阻碍', '根基', '过去', '顶点', '未来', '自我', '环境', '希望与恐惧', '最终结果'],
  },
};

/**
 * 塔罗抽牌
 * @param {string} spreadName 牌阵名
 * @param {number} seed 随机种子
 */
export function drawTarot(spreadName = 'three', seed = null) {
  const rng = makeRandom(seed);
  const spread = SPREADS[spreadName] || SPREADS.three;

  // Fisher-Yates 洗牌
  const pool = TAROT_DECK.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // 正逆位概率：大牌 30% 逆位，小牌 45% 逆位
  const reversedChance = (card) => (card.major ? 0.3 : 0.45);

  const cards = spread.positions.map((position, i) => {
    const card = pool[i];
    const reversed = rng() < reversedChance(card);
    return {
      ...card,
      position,
      positionIndex: i,
      reversed,
      meaning: reversed ? card.reversed : card.upright,
    };
  });

  return {
    method: 'tarot',
    spreadName: spread.name,
    spreadDesc: spread.desc,
    cards,
    raw: cards.map(c => `${c.name}${c.reversed ? '（逆位）' : ''}`).join('、'),
  };
}
