/**
 * defence.ts — 防御の仕組みの計算 (2026-09-30、POE2Tube 要望 ㉒-B、動画モードの view=layers / armour / evasion / es / bases)
 *
 * 数字は defence-data.json (scripts/build-defence-data.mjs、ゲームのデータ優先、無い物だけ PoB)。式は PoB の CalcDefence.lua と同じ:
 *   - 敵が当てる率 = 1 − 0.95 × 回避力 ÷ (回避力 + 4 × 命中力) (公式 0.3.1 のパッチノートと同じ)。当てる率は 5% より下がらない (回避の上限 95%)
 *   - 受け流さない率 = 命中力 ÷ (命中力 + 受け流し力 × 0.12) × 150 − 50 (PoB の calcs.deflectChance)。受け流すと 40% を防ぐ
 *   - アーマーの軽減率 = アーマー ÷ (アーマー + 10 × 一撃)、上限 90%。既定は物理だけ
 *   - 耐性 = 上限 75% (最大耐性)。混沌は ES を 2 倍削る。出血・毒は ES を素通りしてライフへ (ゲームの説明文)
 * 回避は確率として扱う (エントロピー = 決まった周期で当たる、はゲームのデータにも公式の発言にも無い。要望 ㉒ A-4)。
 */
import raw from "./defence-data.json";

export interface DefenceData {
  constants: {
    evadeCap: number; deflectPct: number; esDelay: number; esRatePct: number; shockPct: number;
    freezePlayer: number; chillPlayer: number; shockPlayer: number; wardRegenPct: number;
    armourRatio: number; armourCap: number; deflectCap: number; resistCap: number; chaosEsMult: number;
  };
  sources: Record<string, string>;
  monsterAccuracy: number[];
  monsterDamage: number[];
  bases: Array<{ en: string; ja: string; slot: string; lvl: number; ar: number; ev: number; es: number }>;
}
export const DEF = raw as DefenceData;
const C = DEF.constants;

/** 敵の命中力 (PoB の表、敵のレベル 1〜) */
export const monsterAccuracy = (level: number): number => DEF.monsterAccuracy[Math.max(1, Math.min(DEF.monsterAccuracy.length, Math.round(level))) - 1] ?? 0;

/** 敵がプレイヤーに当てる率 (%)。PoB の calcs.monsterHitChance と同じ (四捨五入、5〜100) */
export function hitChance(evasion: number, accuracy: number): number {
  if (accuracy < 0) return 5;
  const r = (1 - (0.95 * evasion) / (evasion + 4 * accuracy)) * 100;
  return Math.max(Math.min(Math.round(r), 100), 100 - C.evadeCap);
}
/** 回避する率 (%) */
export const evadeChance = (evasion: number, accuracy: number): number => (evasion > 0 ? 100 - hitChance(evasion, accuracy) : 0);

/** 受け流す率 (%)。PoB の calcs.deflectChance と同じ */
export function deflectChance(deflection: number, accuracy: number): number {
  if (deflection < 1) return 0;
  const not = (accuracy / (accuracy + deflection * 0.12)) * 150 - 50;
  return Math.max(Math.min(100 - Math.round(not), C.deflectCap), 0);
}

/** アーマーの軽減率 (%)。上限 90% */
export function armourReduction(armour: number, hit: number): number {
  if (armour <= 0 || hit <= 0) return armour > 0 ? C.armourCap : 0;
  return Math.min(C.armourCap, (armour / (armour + C.armourRatio * hit)) * 100);
}

export type DamageKind = "physical" | "fire" | "cold" | "lightning" | "chaos";
export const KIND_JA: Record<DamageKind, string> = { physical: "物理", fire: "火", cold: "冷気", lightning: "雷", chaos: "混沌" };
export const KIND_COLOR: Record<DamageKind, string> = { physical: "#d8c8a8", fire: "#ff7a45", cold: "#6fc3ff", lightning: "#ffe066", chaos: "#c77dff" };

export interface Defender {
  life: number;
  es: number;
  armour: number;
  evasion: number;
  /** 受け流し力 */
  deflection: number;
  /** ブロック率 (%) */
  block: number;
  /** その種類の耐性 (%、上限前)。物理は無し */
  resist: number;
}
/** 途中で止まる所 (避けた・受け流した・ブロックした)。hit = 全部通る */
export type Outcome = "hit" | "evade" | "deflect" | "block";

export interface Layer {
  key: "hit" | "evade" | "deflect" | "block" | "resist" | "armour" | "es" | "life";
  ja: string;
  /** この段の前 → 後のダメージ (ES / ライフの段は、その段が受けた量) */
  before: number;
  after: number;
  /** この段の確率・率の言葉 (「回避率 42%」) */
  note: string;
  /** この段が効かない (物理に耐性、赤い技に回避 など) */
  skipped: boolean;
  /** ここで止まった */
  stopped: boolean;
}

/**
 * 一撃が段ごとに減っていく流れ (view=layers)。順番は 回避 → 受け流し → ブロック → 耐性 → アーマー → ES → ライフ。
 * 耐性とアーマーは掛け算なので順番で結果は変わらない (PoB はアーマーを耐性の前の一撃で計算する)。
 * red = ボスの赤く光る技: ブロックできない (ゲームの説明文)。回避もできない扱い (POE2Tube の前提、ゲームのデータには書いていない)。受け流しは効く
 */
export function layersOf(d: Defender, hit: number, kind: DamageKind, accuracy: number, outcome: Outcome, red: boolean): Layer[] {
  const out: Layer[] = [];
  let dmg = hit;
  let stopped = false;
  const push = (l: Omit<Layer, "stopped"> & { stopped?: boolean }) => out.push({ stopped: false, ...l });
  push({ key: "hit", ja: "敵の一撃", before: hit, after: hit, note: `${KIND_JA[kind]} ${Math.round(hit)}${red ? " (赤い技)" : ""}`, skipped: false });

  const ev = evadeChance(d.evasion, accuracy);
  const evSkip = red || d.evasion <= 0;
  const evStop = !evSkip && outcome === "evade";
  push({ key: "evade", ja: "回避", before: dmg, after: evStop ? 0 : dmg, note: red ? "赤い技は回避できない" : `回避率 ${ev}%`, skipped: evSkip, stopped: evStop });
  if (evStop) { dmg = 0; stopped = true; }

  const df = deflectChance(d.deflection, accuracy);
  const dfSkip = stopped || d.deflection <= 0;
  const dfHit = !dfSkip && outcome === "deflect";
  const afterDf = dfHit ? dmg * (1 - C.deflectPct / 100) : dmg;
  push({ key: "deflect", ja: "受け流し", before: dmg, after: afterDf, note: dfHit ? `受け流した: ${C.deflectPct}% 防ぐ` : `受け流す率 ${df}%`, skipped: dfSkip });
  dmg = afterDf;

  const blSkip = stopped || red || d.block <= 0;
  const blStop = !blSkip && outcome === "block";
  push({ key: "block", ja: "ブロック", before: dmg, after: blStop ? 0 : dmg, note: red && !stopped ? "赤い技はブロックできない" : `ブロック率 ${d.block}%`, skipped: blSkip, stopped: blStop });
  if (blStop) { dmg = 0; stopped = true; }

  const res = kind === "physical" ? 0 : Math.min(C.resistCap, d.resist);
  const resSkip = stopped || kind === "physical";
  const afterRes = resSkip ? dmg : dmg * (1 - res / 100);
  push({ key: "resist", ja: "耐性", before: dmg, after: afterRes, note: kind === "physical" ? "物理に耐性は無い" : `${KIND_JA[kind]}耐性 ${res}%${d.resist > C.resistCap ? ` (上限 ${C.resistCap}%)` : ""}`, skipped: resSkip });

  // アーマーは耐性の前の一撃で軽減率を決める (PoB と同じ)。既定は物理だけ
  const arSkip = stopped || kind !== "physical" || d.armour <= 0;
  const ar = arSkip ? 0 : armourReduction(d.armour, dmg);
  const afterAr = afterRes * (1 - ar / 100);
  push({ key: "armour", ja: "アーマー", before: afterRes, after: afterAr, note: kind !== "physical" ? "アーマーは物理だけ" : `軽減 ${ar.toFixed(0)}%`, skipped: arSkip });
  dmg = afterAr;

  // ES → ライフ (混沌は ES を 2 倍削る)
  const mult = kind === "chaos" ? C.chaosEsMult : 1;
  const esTaken = stopped ? 0 : Math.min(d.es, dmg * mult);
  const toLife = stopped ? 0 : Math.max(0, dmg - esTaken / mult);
  push({ key: "es", ja: "ES", before: dmg, after: toLife, note: d.es > 0 ? `ES が ${Math.round(esTaken)} 受ける${mult > 1 ? " (混沌は 2 倍減る)" : ""}` : "ES 無し", skipped: stopped || d.es <= 0 });
  push({ key: "life", ja: "ライフ", before: toLife, after: toLife, note: `ライフ ${Math.round(Math.max(0, d.life - toLife))} / ${d.life}`, skipped: stopped });
  return out;
}

/**
 * 攻撃を n 回並べた例 (view=evasion)。確率の通りの回数 (四捨五入) を、偏らないように散らして並べる (乱数を使わない、同じ URL なら同じ絵)。
 * 回避 → 受け流し (当たった物のうち) の順。red = 赤い技 (回避できない、受け流しは効く)
 */
export function attackRow(n: number, evade: number, deflect: number, red: boolean): Array<"evade" | "deflect" | "hit"> {
  const ev = red ? 0 : Math.round((n * evade) / 100);
  const df = Math.round(((n - ev) * deflect) / 100);
  const row: Array<"evade" | "deflect" | "hit"> = Array.from({ length: n }, () => "hit");
  // 黄金比で散らす (回避 → 受け流しの順に、空いている所へ)
  const place = (count: number, kind: "evade" | "deflect", phase: number) => {
    let k = 0;
    for (let i = 0; k < count && i < n * 4; i++) {
      const at = Math.floor(((phase + i * 0.6180339887) % 1) * n);
      for (let j = 0; j < n; j++) {
        const p = (at + j) % n;
        if (row[p] === "hit") { row[p] = kind; k++; break; }
      }
    }
  };
  place(ev, "evade", 0.1);
  place(df, "deflect", 0.45);
  return row;
}

export interface EsPoint { t: number; es: number; life: number; hit: boolean }
/**
 * ES とライフの時間の流れ (view=es)。hits = 当たる時刻 (秒)、dmg = 一撃、kind:
 *   phys (物理など普通の一撃) / chaos (ES を 2 倍削る) / bleed (出血・毒: ES を素通りしてライフへ)。
 * ES は最後に ES が減ってから 4 秒後に、最大の 12.5% / 秒で戻る (ゲームの説明文)。ライフは戻さない (自然回復は入れない)。
 * 刻みは dt 秒
 */
export function esTimeline(life: number, es: number, dmg: number, hits: number[], kind: "phys" | "chaos" | "bleed", until: number, dt = 0.05): EsPoint[] {
  const pts: EsPoint[] = [];
  let e = es;
  let l = life;
  let lastEsLoss = -Infinity;
  const hitAt = [...hits].sort((a, b) => a - b);
  let hi = 0;
  for (let i = 0; i <= Math.round(until / dt); i++) {
    const t = i * dt;
    let hit = false;
    while (hi < hitAt.length && hitAt[hi]! <= t + 1e-9) {
      hit = true;
      hi++;
      if (kind === "bleed") {
        l = Math.max(0, l - dmg);
      } else {
        const mult = kind === "chaos" ? C.chaosEsMult : 1;
        const take = Math.min(e, dmg * mult);
        if (take > 0) { e -= take; lastEsLoss = t; }
        l = Math.max(0, l - (dmg - take / mult));
      }
    }
    if (!hit && e < es && t - lastEsLoss >= C.esDelay) e = Math.min(es, e + (es * C.esRatePct) / 100 * dt);
    pts.push({ t, es: e, life: l, hit });
  }
  return pts;
}
