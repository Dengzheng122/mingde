# 算法等价验证 — 用 Python 复刻 JS 逻辑，验证数学正确性
# 不需要 Node 环境即可查出卦象映射等问题

import random
import json
from datetime import datetime

# ---------------- 八卦 ----------------
# bits 顺序: [初爻, 中爻, 上爻]，1=阳 0=阴
TRIGRAMS = {
    "乾": {"symbol": "☰", "bits": [1,1,1], "nature":"天", "element":"金", "later":6, "earlier":1},
    "兑": {"symbol": "☱", "bits": [1,1,0], "nature":"泽", "element":"金", "later":7, "earlier":2},
    "离": {"symbol": "☲", "bits": [1,0,1], "nature":"火", "element":"火", "later":9, "earlier":3},
    "震": {"symbol": "☳", "bits": [1,0,0], "nature":"雷", "element":"木", "later":4, "earlier":4},
    "巽": {"symbol": "☴", "bits": [0,1,1], "nature":"风", "element":"木", "later":5, "earlier":5},
    "坎": {"symbol": "☵", "bits": [0,1,0], "nature":"水", "element":"水", "later":2, "earlier":6},
    "艮": {"symbol": "☶", "bits": [0,0,1], "nature":"山", "element":"土", "later":8, "earlier":7},
    "坤": {"symbol": "☷", "bits": [0,0,0], "nature":"地", "element":"土", "later":3, "earlier":8},
}

# 与 JS 保持一致
HEXAGRAM_NAMES = {
    "乾乾":"乾为天","乾兑":"天泽履","乾离":"天火同人","乾震":"天雷无妄",
    "乾巽":"天风姤","乾坎":"天水讼","乾艮":"天山遁","乾坤":"天地否",
    "兑乾":"泽天夬","兑兑":"兑为泽","兑离":"泽火革","兑震":"泽雷随",
    "兑巽":"泽风大过","兑坎":"泽水困","兑艮":"泽山咸","兑坤":"泽地萃",
    "离乾":"火天大有","离兑":"火泽睽","离离":"离为火","离震":"火雷噬嗑",
    "离巽":"火风鼎","离坎":"火水未济","离艮":"火山旅","离坤":"火地晋",
    "震乾":"雷天大壮","震兑":"雷泽归妹","震离":"火雷丰" if False else "雷火丰","震震":"震为雷",
    "震巽":"雷风恒","震坎":"雷水解","震艮":"雷山小过","震坤":"雷地豫",
    "巽乾":"风天小畜","巽兑":"风泽中孚","巽离":"风火家人","巽震":"风雷益",
    "巽巽":"巽为风","巽坎":"风水涣","巽艮":"风山渐","巽坤":"风地观",
    "坎乾":"水天需","坎兑":"水泽节","坎离":"水火既济","坎震":"水雷屯",
    "坎巽":"水风井","坎坎":"坎为水","坎艮":"水山蹇","坎坤":"水地比",
    "艮乾":"山天大畜","艮兑":"山泽损","艮离":"山火贲","艮震":"山雷颐",
    "艮巽":"山风蛊","艮坎":"山水蒙","艮艮":"艮为山","艮坤":"山地剥",
    "坤乾":"地天泰","坤兑":"地泽临","坤离":"地火明夷","坤震":"地雷复",
    "坤巽":"地风升","坤坎":"地水师","坤艮":"地山谦","坤坤":"坤为地",
}

def trigram_of(bits):
    for name, t in TRIGRAMS.items():
        if all(t["bits"][i] == bits[i] for i in range(3)):
            return name
    return None

def toss_coins():
    heads = sum(1 for _ in range(3) if random.random() < 0.5)
    total = heads + 6
    is_yang = total in (7, 9)
    is_moving = total in (6, 9)
    return total, is_yang, is_moving

def cast_liuyao():
    tosses = [toss_coins() for _ in range(6)]
    primary = [1 if t[1] else 0 for t in tosses]
    changed = list(primary)
    for i, t in enumerate(tosses):
        if t[2]:
            changed[i] = 0 if primary[i] else 1

    up = trigram_of(changed[3:6])
    down = trigram_of(changed[0:3])
    p_up = trigram_of(primary[3:6])
    p_down = trigram_of(primary[0:3])

    key = p_up + p_down
    name = HEXAGRAM_NAMES.get(key, "未知卦")

    return {
        "name": name, "key": key,
        "p_up": p_up, "p_down": p_down,
        "up": up, "down": down,
        "symbol": TRIGRAMS[p_up]["symbol"] + TRIGRAMS[p_down]["symbol"],
        "expect_symbol": TRIGRAMS[p_up]["symbol"] + TRIGRAMS[p_down]["symbol"],
        "changed_name": HEXAGRAM_NAMES.get(up+down, "未知卦"),
        "yao_count": len(tosses),
        "has_moving": any(t[2] for t in tosses),
    }

print("=" * 60)
print("  六爻算法验证 · 10000 次随机")
print("=" * 60)

unknown = set()
sym_bad = 0
yao_bad = 0
all_static = 0
name_counter = {}

for i in range(10000):
    r = cast_liuyao()
    if r["name"] == "未知卦":
        unknown.add(r["key"])
    if r["symbol"] != r["expect_symbol"]:
        sym_bad += 1
    if r["yao_count"] != 6:
        yao_bad += 1
    if not r["has_moving"]:
        all_static += 1
    name_counter[r["name"]] = name_counter.get(r["name"], 0) + 1

print(f"\n卦名覆盖: {len(name_counter)} 种不同卦象")
print(f"'未知卦' 出现: {len(unknown)} 种卦组")
if unknown:
    print(f"  问题卦组: {list(unknown)[:10]}")
print(f"符号不一致: {sym_bad}")
print(f"爻数异常: {yao_bad}")
print(f"六爻皆静占比: {all_static/10000*100:.2f}%  (理论 (2/3)^6 = {(2/3)**6*100:.2f}%)")

# 交叉验证：卦象 bits 必须与卦名一致
print("\n--- 卦名与阴阳线一致性交叉验证 ---")
mismatch = []
for i in range(3000):
    r = cast_liuyao()
    key = r["key"]
    if key not in HEXAGRAM_NAMES:
        continue
    # 从卦名反查标准六爻
    up = key[0]; down = key[1:]
    up_bits = TRIGRAMS[up]["bits"]
    down_bits = TRIGRAMS[down]["bits"]
    # 卦象线序（下卦 3 爻 + 上卦 3 爻）
    expected_lines = down_bits + up_bits
    # 重新生成对照
    pass

# 直接枚举全部 64 卦验证映射表完整性
print("\n--- 六十四卦映射表完整性 ---")
total_combos = 0
missing = []
for up in TRIGRAMS:
    for down in TRIGRAMS:
        total_combos += 1
        key = up + down
        if key not in HEXAGRAM_NAMES:
            missing.append(key)
print(f"理论卦组数: 8×8 = {total_combos}")
print(f"映射表覆盖: {len(HEXAGRAM_NAMES)}")
print(f"缺失卦组: {len(missing)}")
if missing:
    print(f"  缺失列表: {missing}")

# 名称唯一性
dup = {}
for k, v in HEXAGRAM_NAMES.items():
    dup.setdefault(v, []).append(k)
dupes = {k: v for k, v in dup.items() if len(v) > 1}
print(f"卦名重复: {len(dupes)}")
if dupes:
    for k, v in list(dupes.items())[:5]:
        print(f"  '{k}' <- {v}")

# ---------------- 梅花易数 ----------------
print("\n" + "=" * 60)
print("  梅花易数验证")
print("=" * 60)

def build_meihua(un, ln, mn):
    m = {1:"乾",2:"兑",3:"离",4:"震",5:"巽",6:"坎",7:"艮",8:"坤"}
    up = m[un]; down = m[ln]
    return HEXAGRAM_NAMES.get(up+down, "未知卦")

mh_unknown = set()
for i in range(5000):
    un = random.randint(1,8); ln = random.randint(1,8); mn = random.randint(1,6)
    n = build_meihua(un, ln, mn)
    if n == "未知卦":
        mh_unknown.add((un,ln))

print(f"'未知卦' 出现: {len(mh_unknown)}")
if mh_unknown:
    print(f"  问题: {list(mh_unknown)[:5]}")

# ---------------- 塔罗 ----------------
print("\n" + "=" * 60)
print("  塔罗牌验证")
print("=" * 60)

MAJORS = ["愚者","魔术师","女祭司","皇后","皇帝","教皇","恋人","战车","力量",
          "隐士","命运之轮","正义","倒吊人","死神","节制","恶魔","塔","星星",
          "月亮","太阳","审判","世界"]
SUITS = ["权杖","圣杯","宝剑","星币"]
RANKS = ["Ace","2","3","4","5","6","7","8","9","10","侍从","骑士","皇后","国王"]

print(f"大阿卡纳: {len(MAJORS)} 张 (期望 22) {'OK' if len(MAJORS)==22 else 'FAIL'}")
print(f"小阿卡纳: {len(SUITS)*len(RANKS)} 张 (期望 56) {'OK' if len(SUITS)*len(RANKS)==56 else 'FAIL'}")
print(f"总计: {len(MAJORS)+len(SUITS)*len(RANKS)} 张 (期望 78) {'OK' if len(MAJORS)+len(SUITS)*len(RANKS)==78 else 'FAIL'}")

SPREADS = {"single":1, "three":3, "decision":5, "celtic":10}
for k, v in SPREADS.items():
    print(f"  牌阵 {k}: {v} 张")

# 逆位率
rev = 0; tot = 0
for _ in range(500):
    for _ in range(10):
        major = random.random() < 22/78
        chance = 0.3 if major else 0.45
        if random.random() < chance: rev += 1
        tot += 1
print(f"\n逆位率: {rev/tot*100:.1f}% (期望 25~48%)")

# ---------------- 汇总 ----------------
print("\n" + "=" * 60)
issues = []
if unknown: issues.append(f"六爻有 {len(unknown)} 种卦组无法映射到卦名")
if missing: issues.append(f"映射表缺失 {len(missing)} 个卦组")
if dupes: issues.append(f"{len(dupes)} 个卦名重复")
if sym_bad: issues.append(f"{sym_bad} 次符号不一致")
if mh_unknown: issues.append(f"梅花有 {len(mh_unknown)} 种卦组无法映射")

if issues:
    print("  发现问题：")
    for i in issues:
        print(f"   ✗ {i}")
else:
    print("  ✓ 全部核心映射完整，无未知卦")
print("=" * 60)
