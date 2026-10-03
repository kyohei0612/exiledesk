/**
 * breakdown.ts — 火力の内訳 (2026-10-03 オーナー「どこの火力が乗っているから今こんな火力が出ている、という詳細が欲しい。
 * 出した数字を辿ればその数字になればクリア。外したり自分の物で計算させたり色々できるように」)
 *
 * PoB の中の部品 (pck.lua の PCK.breakdown) が返す生の数字 (内訳 CALCS の出力と、増加 / 増し / 基礎の MOD を出所つきで) を、
 * **掛け算を辿ると画面の DPS になる式の鎖** に組み立てる。ここは純粋関数 (tests/pob-breakdown.test.ts でヘッドレスの数字と突き合わせる)。
 *
 * 式 (本家 CalcOffence をなぞる。ゲーム内の表記 = 敵側の倍率 EffMult を掛けない):
 *   ヒットの DPS = Σ手 [ 平均の 1 発 × 命中率 × 1 秒の回数 × DPS 倍率 × 数の倍率 ]   (二刀流で交互に振る物は ÷2)
 *   平均の 1 発 = 1 発 (非クリ) × (1 − クリ率) + 1 発 (クリ) × クリ率
 *   1 発 (非クリ) = Σ種類 [ 基礎 (min〜max) × (1 + 増加の合計) × 増しの積 × その他の倍率 (allMult) → 平均 (運の良いヒットなら 1/3・2/3) ]
 *   1 発 (クリ) = 同じ物 × クリ倍率
 *   行の DPS = ヒットの DPS + 継続 + その他 (インペイル等) + ミニオン   (pck.lua の gameNumbers と同じ)
 * 丸め: 本家は 種類ごとの min / max を round() してから allMult を掛ける。ここも同じ順で計算して、PoB の値 (StoredHitAvg) と突き合わせる
 */
import type { GameNumbers } from "./api";

// ---------------------------------------------------------------- PoB から来る生の形 (pck.lua の PCK.breakdown)
export interface ModSrc {
  kind: "item" | "tree" | "gem" | "config" | "base" | "other";
  /** 英語の名前 (装備名 / ノード名 / スキル名)。日本語にするのは画面 */
  label: string;
  id?: number | string;
  /** item: ベースとレアリティ、入っている欄 (無ければ使っていない武器セットなど)、ジュエルの穴か、読み込んだ時から変えたか */
  base?: string;
  rarity?: string;
  slot?: string;
  jewel?: boolean;
  changed?: boolean;
  /** tree: 取っているか、装備が与えている (外せない) か、始点か */
  alloc?: boolean;
  granted?: boolean;
  nodeType?: string;
  /** gem: その組の中の位置 (無ければ別の組 / 装備が与えるスキル)、サポートか、使っているか */
  gi?: number;
  gj?: number;
  gemName?: string;
  support?: boolean;
  enabled?: boolean;
}
export interface ModTag {
  t: string;
  v: string;
  neg?: boolean;
}
export interface ModRow {
  /** 本家 EvalMod 後の値 (チャージの数などを掛けた後)。INC / MORE は %、BASE はそのまま */
  value: number;
  type: string;
  name: string;
  flags: string[];
  source: string;
  src: ModSrc;
  tags: ModTag[];
  /** パワーチャージの数で変わる */
  pc?: boolean;
  /** 装備の行 (英語) */
  line?: string;
  /** 追加ダメージの行だけ: 出所ごとにまとめた min / max */
  min?: number;
  max?: number;
}
export interface TypeRaw {
  type: string;
  srcMin: number;
  srcMax: number;
  srcIsWeapon: boolean;
  bonusMin: number;
  bonusMax: number;
  addedMin: number;
  addedMax: number;
  addedMult: number;
  baseMultiplier: number;
  baseMin: number;
  baseMax: number;
  convMult: number;
  summedMin: number;
  summedMax: number;
  inc: number;
  more: number;
  moreMin: number;
  moreMax: number;
  allMult: number;
  lucky: number;
  critLucky: number;
  storedHit: number;
  storedCrit: number;
  hitAvg: number;
  critAvg: number;
  effMult: number;
  incMods: ModRow[];
  moreMods: ModRow[];
  addedMods: ModRow[];
}
export interface SpeedRaw {
  attack: boolean;
  baseTime: number;
  castTime?: number;
  attackRate?: number;
  inc: number;
  more: number;
  extraTime: number;
  action: number;
  speed: number;
  hitSpeed?: number;
  cooldown?: number;
  repeats: number;
  fixed: boolean;
  triggered: boolean;
  incMods: ModRow[];
  moreMods: ModRow[];
}
export interface CritRaw {
  baseCrit: number;
  override?: number;
  base: number;
  inc: number;
  more: number;
  cap: number;
  pre: number;
  eff: number;
  accuracy: number;
  lucky: boolean;
  bifurcate: boolean;
  inevitable: boolean;
  never: boolean;
  baseMods: ModRow[];
  incMods: ModRow[];
  moreMods: ModRow[];
  /** 固定 (OVERRIDE) の出所。あると加算・増加・増しは効かない */
  overrideMods?: ModRow[];
}
export interface CritMultRaw {
  base: number;
  inc: number;
  more: number;
  override?: number;
  enemyBase: number;
  enemyInc: number;
  value: number;
  none: boolean;
  baseMods: ModRow[];
  incMods: ModRow[];
  moreMods: ModRow[];
  overrideMods?: ModRow[];
}
export interface HandRaw {
  key: "MainHand" | "OffHand" | null;
  out: Record<string, number | undefined>;
  types: TypeRaw[];
  speed: SpeedRaw;
  crit: CritRaw;
  critMult: CritMultRaw;
}
export interface BreakdownRaw {
  skill: string;
  attack: boolean;
  dual: boolean;
  combines: boolean;
  showAverage: boolean;
  triggered: boolean;
  out: Record<string, number | undefined>;
  /** pck.lua の gameNumbers (行の DPS と同じ物差し) */
  game: GameNumbers;
  powerCharges: number;
  hands: HandRaw[];
}

// ---------------------------------------------------------------- 組み立てた鎖
export interface TypeChain {
  type: string;
  /** 基礎 (変換後、min〜max とその平均) */
  min: number;
  max: number;
  base: number;
  /** 1 + 増加の合計 (%) / 増しの積 / その他の倍率 (ダブルダメージ・ウォークライなど) / クリ倍率 */
  incPct: number;
  inc: number;
  more: number;
  allMult: number;
  critMult: number;
  lucky: number;
  /** 辿って出した 1 発 (非クリ、敵の前) と PoB の値 (StoredHitAvg)、一致したか */
  value: number;
  pobValue: number;
  ok: boolean;
  /** クリの 1 発 (PoB の値) */
  crit: number;
  /** 敵側の倍率 (ゲーム内の表記では入れない) */
  effMult: number;
  /** 基礎の中身 */
  src: { min: number; max: number; weapon: boolean };
  added: { min: number; max: number; mult: number };
  baseMultiplier: number;
  convMult: number;
  incMods: ModRow[];
  moreMods: ModRow[];
  addedMods: ModRow[];
}
export interface SpeedChain {
  attack: boolean;
  /** 基礎の回数 (1 / 基礎の時間) */
  baseRate: number;
  baseTime: number;
  incPct: number;
  inc: number;
  more: number;
  /** 本家は (1 + inc) × more を 2 桁に丸める */
  rounded: number;
  extraTime: number;
  action: number;
  /** 辿って出した回数と実際の回数 (クールダウンなどで上限が掛かると違う) */
  derived: number;
  speed: number;
  hitSpeed?: number;
  ok: boolean;
  fixed: boolean;
  triggered: boolean;
  cooldown?: number;
  incMods: ModRow[];
  moreMods: ModRow[];
}
export interface CritChain {
  baseCrit: number;
  base: number;
  incPct: number;
  inc: number;
  more: number;
  /** 上限の前 / 上限 / 上限の後 (PreEffective) / 実効 (命中・運・分岐の後) */
  raw: number;
  cap: number;
  pre: number;
  eff: number;
  accuracy: number;
  ok: boolean;
  override?: number;
  never: boolean;
  lucky: boolean;
  bifurcate: boolean;
  inevitable: boolean;
  baseMods: ModRow[];
  incMods: ModRow[];
  moreMods: ModRow[];
  overrideMods: ModRow[];
}
export interface CritMultChain {
  /** 追加ダメージ % (基礎の合計 / 増加 / 増し) → 倍率 */
  basePct: number;
  incPct: number;
  more: number;
  derived: number;
  value: number;
  ok: boolean;
  override?: number;
  none: boolean;
  enemyBase: number;
  enemyInc: number;
  baseMods: ModRow[];
  incMods: ModRow[];
  moreMods: ModRow[];
  overrideMods: ModRow[];
}
export interface HandChain {
  key: "MainHand" | "OffHand" | null;
  types: TypeChain[];
  /** 1 発 (非クリ) / 1 発 (クリ) / クリ率 (0〜1) / クリ倍率 / 平均の 1 発 */
  hit: number;
  crit: number;
  cc: number;
  critMult: number;
  avg: number;
  hitChance: number;
  speed: number;
  hitSpeed?: number;
  dpsMult: number;
  quantity: number;
  /** この手のヒットの DPS (ゲーム内の表記) */
  dps: number;
  speedChain: SpeedChain;
  critChain: CritChain;
  critMultChain: CritMultChain;
}
export interface Chain {
  skill: string;
  attack: boolean;
  dual: boolean;
  combines: boolean;
  hands: HandChain[];
  /** 辿って出したヒットの DPS と、表 (summary) のヒットの DPS、一致したか */
  hitDps: number;
  hitDpsSummary: number;
  okHit: boolean;
  /** 行の DPS = ヒット + 継続 + その他 + ミニオン (summary と同じ) */
  dps: number;
  dpsSummary: number;
  okDps: boolean;
  dot: number;
  other: number;
  minion: number;
  minionName?: string;
  cull: number;
  /** 敵込み (PoB の TotalDPS) と、種類ごとの敵側の倍率 */
  pobDps: number;
  enemy: Array<{ type: string; effMult: number }>;
  powerCharges: number;
  /** 式の中で一致しなかった所 (画面の注記) */
  mismatches: string[];
}

/** 本家 round(x, n) と同じ (floor(x × 10^n + 0.5) / 10^n) */
export const pobRound = (x: number, n = 0): number => {
  const m = 10 ** n;
  return Math.floor(x * m + 0.5) / m;
};
/** 相対の誤差で一致 (0 同士は一致) */
export const near = (a: number, b: number, rel = 0.005): boolean => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const d = Math.abs(a - b);
  return d <= 1e-6 || d / Math.max(Math.abs(a), Math.abs(b)) <= rel;
};

/** 種類 1 つ: 基礎 × 増加 × 増し × その他 → 平均 (運の良いヒットは 1/3・2/3) */
export function typeChain(t: TypeRaw): TypeChain {
  const inc = 1 + t.inc / 100;
  // 本家 calcDamage: round(summedMin × inc × more × moreMin) → × allMult (クリは × CritMultiplier)
  const min = pobRound(t.summedMin * inc * t.more * t.moreMin) * t.allMult;
  const max = pobRound(t.summedMax * inc * t.more * t.moreMax) * t.allMult;
  const notLucky = min / 2 + max / 2;
  const luckyAvg = min / 3 + (2 * max) / 3;
  const value = notLucky * (1 - t.lucky) + luckyAvg * t.lucky;
  return {
    type: t.type,
    min: t.summedMin,
    max: t.summedMax,
    base: (t.summedMin + t.summedMax) / 2,
    incPct: t.inc,
    inc,
    more: t.more,
    allMult: t.allMult,
    critMult: t.storedHit > 0 ? t.storedCrit / t.storedHit : 1,
    lucky: t.lucky,
    value,
    pobValue: t.storedHit,
    ok: near(value, t.storedHit, 0.002),
    crit: t.storedCrit,
    effMult: t.effMult,
    src: { min: t.srcMin + t.bonusMin, max: t.srcMax + t.bonusMax, weapon: t.srcIsWeapon },
    added: { min: t.addedMin, max: t.addedMax, mult: t.addedMult },
    baseMultiplier: t.baseMultiplier,
    convMult: t.convMult,
    incMods: t.incMods,
    moreMods: t.moreMods,
    addedMods: t.addedMods,
  };
}

/** 速さ: 1 / (基礎の時間 / round((1 + inc) × more, 2) + 追加の時間) × 行動速度。固定・発動の速さは増加が効かない */
export function speedChain(s: SpeedRaw): SpeedChain {
  const inc = 1 + s.inc / 100;
  const rounded = pobRound(inc * s.more, 2);
  const derived = s.fixed ? s.speed : s.baseTime > 0 && rounded > 0 ? (1 / (s.baseTime / rounded + s.extraTime)) * s.action : s.speed;
  return {
    attack: s.attack,
    baseRate: s.baseTime > 0 ? 1 / s.baseTime : 0,
    baseTime: s.baseTime,
    incPct: s.inc,
    inc,
    more: s.more,
    rounded,
    extraTime: s.extraTime,
    action: s.action,
    derived,
    speed: s.speed,
    hitSpeed: s.hitSpeed,
    ok: near(derived, s.speed, 0.005),
    fixed: s.fixed,
    triggered: s.triggered,
    cooldown: s.cooldown,
    incMods: s.incMods,
    moreMods: s.moreMods,
  };
}

/** クリ率: (基礎 + 加算) × (1 + inc) × more → 上限 → (命中・運・分岐は PoB の値をそのまま) */
export function critChain(c: CritRaw): CritChain {
  const inc = 1 + c.inc / 100;
  const raw = c.override != null && c.override === 100 ? 100 : (c.baseCrit + c.base) * inc * c.more;
  const capped = Math.max(0, Math.min(raw, c.cap));
  const ok = c.never ? true : near(capped, c.pre, 0.005) || (c.override != null && near(c.override, c.pre, 0.005));
  return {
    baseCrit: c.baseCrit,
    base: c.base,
    incPct: c.inc,
    inc,
    more: c.more,
    raw,
    cap: c.cap,
    pre: c.pre,
    eff: c.eff,
    accuracy: c.accuracy,
    ok,
    override: c.override,
    never: c.never,
    lucky: c.lucky,
    bifurcate: c.bifurcate,
    inevitable: c.inevitable,
    baseMods: c.baseMods,
    incMods: c.incMods,
    moreMods: c.moreMods,
    overrideMods: c.overrideMods ?? [],
  };
}

/** クリ倍率: 1 + 追加ダメージ% × (1 + inc) × more / 100 (敵の受けるクリダメージ増加も)。本家は 2 桁に丸める */
export function critMultChain(c: CritMultRaw): CritMultChain {
  let extra = c.override != null ? c.override / 100 : (c.base / 100) * (1 + c.inc / 100) * c.more;
  extra = pobRound((extra + c.enemyBase / 100) * (1 + c.enemyInc / 100), 2);
  const derived = c.none ? 1 : 1 + Math.max(0, extra);
  return {
    basePct: c.base,
    incPct: c.inc,
    more: c.more,
    derived,
    value: c.value,
    ok: near(derived, c.value, 0.005),
    override: c.override,
    none: c.none,
    enemyBase: c.enemyBase,
    enemyInc: c.enemyInc,
    baseMods: c.baseMods,
    incMods: c.incMods,
    moreMods: c.moreMods,
    overrideMods: c.overrideMods ?? [],
  };
}

function handChain(h: HandRaw): HandChain {
  const types = h.types.map(typeChain).filter((t) => t.pobValue > 0 || t.base > 0);
  const hit = types.reduce((a, t) => a + t.pobValue, 0);
  const crit = types.reduce((a, t) => a + t.crit, 0);
  const cc = (h.out.CritChance ?? 0) / 100;
  const avg = hit * (1 - cc) + crit * cc;
  const hitChance = (h.out.HitChance ?? 100) / 100;
  const speed = h.out.Speed ?? 0;
  const hitSpeed = h.out.HitSpeed;
  const dpsMult = h.out.DpsMultiplier ?? 1;
  const quantity = h.out.QuantityMultiplier ?? 1;
  return {
    key: h.key,
    types,
    hit,
    crit,
    cc,
    critMult: h.out.CritMultiplier ?? 1,
    avg,
    hitChance,
    speed,
    hitSpeed,
    dpsMult,
    quantity,
    dps: avg * hitChance * (hitSpeed ?? speed) * dpsMult * quantity,
    speedChain: speedChain(h.speed),
    critChain: critChain(h.crit),
    critMultChain: critMultChain(h.critMult),
  };
}

/** 生の数字 → 式の鎖。一致しなかった所は mismatches に (画面の注記、テストの失敗の理由) */
export function buildChain(raw: BreakdownRaw): Chain {
  const hands = raw.hands.map(handChain);
  let hitDps = hands.reduce((a, h) => a + h.dps, 0);
  // 二刀流で交互に振る物 (本家 combineStat "DPS"): 両手の和 ÷ 2
  if (raw.dual && hands.length === 2 && !raw.combines) hitDps /= 2;
  const g = raw.game;
  const dps = hitDps + g.dot + g.other + g.minion;
  const mismatches: string[] = [];
  for (const h of hands) {
    const who = h.key === "MainHand" ? "メインハンド: " : h.key === "OffHand" ? "オフハンド: " : "";
    for (const t of h.types) if (!t.ok) mismatches.push(`${who}${t.type} の 1 発 (辿った値 ${t.value.toFixed(1)} / PoB ${t.pobValue.toFixed(1)})`);
    if (!h.speedChain.ok) mismatches.push(`${who}1 秒の回数 (辿った値 ${h.speedChain.derived.toFixed(2)} / PoB ${h.speedChain.speed.toFixed(2)}。クールダウンや上限)`);
    if (!h.critChain.ok) mismatches.push(`${who}クリ率 (辿った値 ${Math.min(h.critChain.raw, h.critChain.cap).toFixed(2)} / PoB ${h.critChain.pre.toFixed(2)})`);
    if (!h.critMultChain.ok) mismatches.push(`${who}クリ倍率 (辿った値 ${h.critMultChain.derived.toFixed(2)} / PoB ${h.critMultChain.value.toFixed(2)})`);
  }
  const okHit = near(hitDps, g.hitDps, 0.005);
  if (!okHit) mismatches.push(`ヒットの DPS (辿った値 ${hitDps.toFixed(0)} / 表 ${g.hitDps.toFixed(0)})`);
  const enemy: Array<{ type: string; effMult: number }> = [];
  for (const h of hands) for (const t of h.types) if (!enemy.some((e) => e.type === t.type)) enemy.push({ type: t.type, effMult: t.effMult });
  return {
    skill: raw.skill,
    attack: raw.attack,
    dual: raw.dual,
    combines: raw.combines,
    hands,
    hitDps,
    hitDpsSummary: g.hitDps,
    okHit,
    dps,
    dpsSummary: g.dps,
    okDps: near(dps, g.dps, 0.005),
    dot: g.dot,
    other: g.other,
    minion: g.minion,
    minionName: g.minionName,
    cull: g.cull,
    pobDps: raw.out.TotalDPS ?? 0,
    enemy,
    powerCharges: raw.powerCharges,
    mismatches,
  };
}

// ---------------------------------------------------------------- MOD の行の日本語 (画面)
/** PoB の MOD の名前 → 日本語 */
const STAT_JA: Record<string, string> = {
  Damage: "ダメージ",
  PhysicalDamage: "物理ダメージ",
  LightningDamage: "雷ダメージ",
  ColdDamage: "冷気ダメージ",
  FireDamage: "火ダメージ",
  ElementalDamage: "元素ダメージ",
  ChaosDamage: "混沌ダメージ",
  CritChance: "クリティカルヒット率",
  CritMultiplier: "クリティカルダメージボーナス",
  PhysicalMin: "物理ダメージを追加",
  LightningMin: "雷ダメージを追加",
  ColdMin: "冷気ダメージを追加",
  FireMin: "火ダメージを追加",
  ChaosMin: "混沌ダメージを追加",
};
/** MOD の flags (どのスキルに効くか) → 日本語 */
const FLAG_JA: Record<string, string> = {
  Spell: "スペル",
  Attack: "アタック",
  Melee: "近接",
  Projectile: "投射物",
  Hit: "ヒット",
  Area: "範囲",
  Ailment: "状態異常",
  Dot: "継続",
  Cast: "詠唱",
  Weapon: "武器",
  Unarmed: "素手",
  Bow: "弓",
  Wand: "ワンド",
  Staff: "スタッフ",
  Sword: "剣",
  Axe: "斧",
  Mace: "メイス",
  Claw: "クロー",
  Dagger: "ダガー",
  Crossbow: "クロスボウ",
  Sceptre: "セプター",
  Quarterstaff: "クォータースタッフ",
  Spear: "スピア",
  Flail: "フレイル",
  Lightning: "雷",
  Cold: "冷気",
  Fire: "火",
  Chaos: "混沌",
  Physical: "物理",
  Minion: "ミニオン",
  Aura: "オーラ",
  Curse: "呪い",
  Totem: "トーテム",
  Trap: "トラップ",
  Mine: "マイン",
  Movement: "移動",
  Channelled: "チャネリング",
  Duration: "持続時間",
  Warcry: "ウォークライ",
  Brand: "ブランド",
  Fist: "拳",
  Shield: "盾",
  Weapon1H: "片手武器",
  Weapon2H: "両手武器",
  WeaponMelee: "近接武器",
  WeaponRanged: "遠隔武器",
  Buff: "バフ",
  Triggered: "発動",
};
/** 条件の変数名 → 日本語 (よく出る物だけ。無ければ英語のまま) */
const VAR_JA: Record<string, string> = {
  PowerCharge: "パワーチャージ",
  FrenzyCharge: "フレンジーチャージ",
  EnduranceCharge: "エンデュランスチャージ",
  LowLife: "低ライフ",
  FullLife: "ライフ満タン",
  FullMana: "マナ満タン",
  Leeching: "リーチ中",
  CriticalStrike: "クリティカル時",
  UsingWand: "ワンド装備時",
  UsingStaff: "スタッフ装備時",
  UsingSceptre: "セプター装備時",
  UsingShield: "盾装備時",
  UsingFocus: "フォーカス装備時",
  Unarmed: "素手",
  Shocked: "感電の敵",
  Chilled: "冷却の敵",
  Frozen: "凍結の敵",
  Ignited: "発火の敵",
  Blinded: "盲目の敵",
  Onslaught: "猛攻",
  Tailwind: "テイルウィンド",
  DualWielding: "二刀流",
  WeaponSet1: "武器セット I の時",
  WeaponSet2: "武器セット II の時",
  Mana: "マナ",
  Life: "ライフ",
  EnergyShield: "ES",
  Spirit: "スピリット",
  Str: "筋力",
  Dex: "器用さ",
  Int: "知性",
  "LifeCost/LifePerSecondCost": "ライフコストのスキル",
  RemovablePowerCharge: "パワーチャージ",
  SigilOfPowerStage: "シギルオブパワーの段階",
  ElementalConfluxLightningEffect: "エレメンタルコンフラックスの効き (雷)",
  ElementalConfluxColdEffect: "エレメンタルコンフラックスの効き (冷気)",
  ElementalConfluxFireEffect: "エレメンタルコンフラックスの効き (火)",
  Fortified: "フォーティファイ",
  Rage: "レイジ",
  Enemy: "敵",
};
const flagJa = (f: string): string => FLAG_JA[f] ?? f;
export const varJa = (v: string): string => VAR_JA[v] ?? v;

/** 数字の表記: 増加 +141% / 増し ×1.30 (+30%) / 追加 +a〜b */
export function modValueText(m: ModRow): string {
  if (m.type === "MORE") {
    const v = m.value;
    return `×${(1 + v / 100).toFixed(2)} (${v >= 0 ? "+" : "−"}${fmtMod(Math.abs(v))}%)`;
  }
  if (m.type === "OVERRIDE") return `= ${fmtMod(m.value)}${m.name === "CritChance" || m.name === "CritMultiplier" ? "%" : ""}`;
  if (m.type === "BASE" && m.min != null && m.max != null) return `+${fmtMod(m.min)}〜${fmtMod(m.max)}`;
  const v = m.value;
  const s = `${v >= 0 ? "+" : "−"}${fmtMod(Math.abs(v))}`;
  return m.type === "INC" ? `${s}%` : m.name === "CritChance" ? `${s}%` : m.name === "CritMultiplier" ? `${s}%` : s;
}
const fmtMod = (v: number): string => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : v.toFixed(1));

/** MOD の中身 (何に効くか): 「スペルダメージ」「雷ダメージ (アタック)」など。装備の行があればそれが主役なので短く */
export function modStatText(m: ModRow): string {
  // 速さは flags で アタック / 詠唱 が決まる (PoB の名前は両方 Speed)
  if (m.name === "Speed") return m.flags.includes("Attack") ? "アタック速度" : m.flags.includes("Cast") ? "キャストスピード" : "速度";
  const stat = STAT_JA[m.name] ?? STAT_JA[m.name.replace(/Max$/, "Min")] ?? m.name;
  // 増加 / 増しの「スペルダメージ」は PoB では Damage + flags Spell。flags を前に付けて自然な日本語に
  const flags = m.flags.filter((f) => f !== "Hit");
  const kinds = flags.filter((f) => ["Spell", "Attack", "Melee", "Projectile", "Area", "Minion", "Aura", "Curse", "Totem", "Trap", "Mine", "Channelled", "Triggered", "Warcry", "Movement", "Brand", "Duration"].includes(f));
  const weapons = flags.filter((f) => !kinds.includes(f) && !["Lightning", "Cold", "Fire", "Chaos", "Physical", "Dot", "Ailment", "Cast", "Buff", "Weapon"].includes(f));
  const head = kinds.map(flagJa).join("・");
  const tail = weapons.length ? ` (${weapons.map(flagJa).join("・")})` : "";
  if (m.name === "Damage" && head) return `${head}ダメージ${tail}`;
  return `${head ? head + "の" : ""}${stat}${tail}`;
}

/** 条件の短い文 (「パワーチャージ 1 個ごと」「クリティカル時」) */
export function modCondText(m: ModRow): string[] {
  const out: string[] = [];
  for (const t of m.tags) {
    if (t.t === "Multiplier") out.push(`${varJa(t.v)} 1 つごと`);
    else if (t.t === "MultiplierThreshold" || t.t === "StatThreshold") out.push(`${varJa(t.v)} が一定以上`);
    else if (t.t === "PerStat") out.push(`${varJa(t.v)} に応じて`);
    else if (t.t === "Condition" || t.t === "ActorCondition") out.push(`${t.neg ? "〜でない: " : ""}${varJa(t.v)}`);
    else if (t.t === "SkillName") out.push(`スキル: ${t.v}`);
  }
  return out;
}

/** 出所の見出しの種類 (画面の札の色・ボタン) */
export const srcKindJa = (k: ModSrc["kind"]): string => ({ item: "装備", tree: "ノード", gem: "ジェム", config: "設定", base: "基本", other: "その他" })[k];

/** 一覧の並び: 効きの大きい順 (増加・増しは値の絶対値、追加は平均) */
export const sortMods = (rows: ModRow[]): ModRow[] =>
  [...rows].sort((a, b) => Math.abs(b.min != null && b.max != null ? (b.min + b.max) / 2 : b.value) - Math.abs(a.min != null && a.max != null ? (a.min + a.max) / 2 : a.value));
