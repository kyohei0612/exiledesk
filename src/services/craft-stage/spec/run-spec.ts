/**
 * 説明文の分解 (CurrencySpec) で 1 手打つ (2026-10-16、ADR-004)。
 *
 * 流れ: 骨の種類を部位で選ぶ → アイテムの状態 (コラプトなど) → 対象 → 制約 → お告げの対象 → 動作の部品を順に。
 * お告げは掛かる手の種類 (kind) が合う物だけ食い、効き目は部品への修飾 (Mods) にまとめる。
 * まだ移していない手は null を返す (呼ぶ側は今の applyCurrency を使う)。画面はまだ今の関数のまま (切り替えない)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { skip } from "../stage-core";
import type { StageApply, StageItem } from "../types";
import type { CurrencySpec, OmenSpec } from "./types";
import { ANNUL_SPEC, BONE_SPECS, OMEN_SPECS, REVEAL_SPEC } from "./desecrate-specs";
import { ORB_OMEN_SPECS, ORB_SPEC_BY_KEY, UNPORTED_OMENS } from "./orb-specs";
import { ESSENCE_OMEN_SPECS, prepareEssence, resolveEssence } from "./essence-specs";
import { ARTIFICER_SPEC, CATALYST_SPEC_BY_KEY, QUALITY_SPECS, RUNE_SPEC } from "./other-specs";
import { isRune } from "../stage-runes";
import { groupsFit, limitBlock, stateBlock, targetBlock } from "./judge";
import { NO_MODS, runPart, type Mods, type PartCtx } from "./parts";
import { tr } from "../../../i18n/lang";
import { OMEN_FOR } from "../omens";

type Resolved = { spec: CurrencySpec; reveal: PartCtx["reveal"]; reason?: string };

/**
 * 手順の鍵 → カレンシー。骨はアイテムの部位に合う種類 (顎骨・肋骨 …) を対象から選ぶ。合う物が無ければ reason
 * (例: 古代の頭蓋骨はクライアントに無い)。移していない鍵は null
 */
export function resolveSpec(key: string, item: StageItem, data?: PatchData): Resolved | null {
  if (key.startsWith("essence:")) {
    const e = data ? resolveEssence(data, item, key) : null;
    return e ? { spec: e.spec, reveal: null, ...(e.reason ? { reason: e.reason } : {}) } : null;
  }
  if (key === ANNUL_SPEC.stageKey) return { spec: ANNUL_SPEC, reveal: null };
  const orb = ORB_SPEC_BY_KEY.get(key) ?? CATALYST_SPEC_BY_KEY.get(key) ?? QUALITY_SPECS.find((s) => s.stageKey === key) ?? (key === ARTIFICER_SPEC.stageKey ? ARTIFICER_SPEC : null);
  if (orb) return { spec: orb, reveal: null };
  if (isRune(key)) return { spec: RUNE_SPEC, reveal: null };
  if (key.startsWith("reveal")) {
    const m = /^reveal:(\d)(:reroll)?$/.exec(key);
    return { spec: REVEAL_SPEC, reveal: m ? { index: Number(m[1]), reroll: !!m[2] } : { invalid: key } };
  }
  const bones = BONE_SPECS.filter((s) => s.stageKey === key);
  if (!bones.length) return null;
  const fit = bones.find((s) => groupsFit(s.target, item));
  if (fit) return { spec: fit, reveal: null };
  // 部位に合う骨が無い: 1 つだけなら (変質した鎖骨) その対象の一言、いくつもあれば共通の一言
  const reason = bones.length === 1 ? targetBlock(bones[0]!.target, item) ?? "" : tr("この部位に使える骨が無い", "No bone of this kind for this item class");
  return { spec: bones[0]!, reveal: null, reason };
}
/** そのお告げがその手の種類に掛かるか (今の棚の OMEN_FOR) */
const OMEN_FOR_KIND = (kind: string, omen: string): boolean => (OMEN_FOR[kind] ?? []).includes(omen);
/** この鍵を新しい作りで打てるか (移し終えた手) */
export const specCovers = (key: string): boolean =>
  key === ANNUL_SPEC.stageKey || /^reveal/.test(key) || BONE_SPECS.some((s) => s.stageKey === key) || ORB_SPEC_BY_KEY.has(key) ||
  CATALYST_SPEC_BY_KEY.has(key) || QUALITY_SPECS.some((s) => s.stageKey === key) || key === ARTIFICER_SPEC.stageKey || isRune(key) ||
  /^essence:(breach$|(lesser|normal|greater|perfect):)/.test(key);

/** 全部のお告げ (冒涜まわり + オーブ)。並びは左右を両方掛けた時に先に効く方 */
export const ALL_OMEN_SPECS: readonly OmenSpec[] = [...OMEN_SPECS, ...ORB_OMEN_SPECS, ...ESSENCE_OMEN_SPECS];
const OMEN_BY_KEY: ReadonlyMap<string, OmenSpec> = new Map(ALL_OMEN_SPECS.map((o) => [o.key, o]));

/** その手に掛かるお告げ (持っている中から)。単体で効く物 (腐食) があればそれだけ */
export function omensOf(spec: CurrencySpec, held: readonly string[]): OmenSpec[] {
  const used = held.flatMap((k) => { const o = OMEN_BY_KEY.get(k); return o && o.appliesTo === spec.kind ? [o] : []; });
  const alone = used.find((o) => o.alone);
  return alone ? [alone] : used;
}
/**
 * お告げの効き目をまとめる。左右を両方掛けた時は左 (OMEN_SPECS の順)、勢力を 2 つ掛けた時は先に掛けた方
 * (どちらも画面では一緒に掛けられない: omens.ts の OMEN_EXCLUSIVE。今の関数と同じ選び方)
 */
function modsOf(used: readonly OmenSpec[]): Mods {
  const m: Mods = { ...NO_MODS };
  for (const o of ALL_OMEN_SPECS) {
    if (!used.includes(o)) continue;
    if ("side" in o.effect && !m.side) m.side = o.effect.side;
    if ("removeSide" in o.effect && !m.removeSide) m.removeSide = o.effect.removeSide;
  }
  for (const o of used) {
    const e = o.effect;
    if ("guaranteeTag" in e) m.guaranteeTag ??= e.guaranteeTag;
    else if ("rerolls" in e) m.rerolls += e.rerolls;
    else if ("pick" in e) m.pick = e.pick;
    else if ("replace" in e) m.plain = e.plain;
    else if ("addCount" in e) m.addCount = e.addCount;
    else if ("pickLowest" in e) m.pickLowest = true;
    else if ("catalysing" in e) m.catalysing = true;
    else if ("implicitOnly" in e) m.implicitOnly = true;
  }
  return m;
}

/** 1 手打つ (applyCurrency と同じ形)。移していない手は null。oneCatalyst: 手順の再生 (触媒は 1 手 = 1 個。applyCurrency の hint.oneCatalyst と同じ) */
export function applyBySpec(data: PatchData, item: StageItem, key: string, rng: () => number, omens: readonly string[] = [], opts: { oneCatalyst?: boolean } = {}): StageApply | null {
  const r = resolveSpec(key, item, data);
  if (!r) return null;
  const { spec } = r;
  // 移していないお告げ (聖別) が掛かる手は今の関数で
  if (omens.some((o) => UNPORTED_OMENS.includes(o) && OMEN_FOR_KIND(spec.kind, o))) return null;
  const st = stateBlock(spec, item, omens);
  if (st) return skip(item, st);
  if (r.reason) return skip(item, r.reason);
  const t = targetBlock(spec.target, item);
  if (t) return skip(item, t);
  const used = omensOf(spec, omens);
  const mods = modsOf(used);
  const catalystTag = spec.kind === "catalyst" ? key.slice(key.indexOf("_") + 1) : null;
  for (const l of spec.limits) {
    const why = limitBlock(l, item, mods, catalystTag);
    if (why) return skip(item, why);
  }
  for (const o of used) {
    const why = (o.target ? targetBlock(o.target, item) : null) ?? (o.limits ?? []).map((l) => limitBlock(l, item, mods)).find((x) => x) ?? null;
    if (why) return skip(item, why);
  }
  const replace = used.map((o) => o.effect).find((e) => "replace" in e);
  const actions = replace && "replace" in replace ? replace.replace : spec.actions;
  // エッセンスの MOD は打つ前に作る (値の乱数は今の関数と同じく消す前)
  const essence = spec.actions.some((a) => "addEssence" in a) ? prepareEssence(data, item, key, rng) : null;
  if (spec.actions.some((a) => "addEssence" in a) && !essence) return skip(item, tr("このエッセンスのティアが無い", "No tier for this Essence"));
  const ctx: PartCtx = {
    data, rng, mods, reveal: r.reveal, removedSoFar: [], essence,
    catalystTag, oneCatalyst: !!opts.oneCatalyst, runeKey: key,
    altered: spec.actions.some((a) => "addUnrevealed" in a && a.addUnrevealed.pools.includes("otherworldly")),
  };
  let cur = item;
  const added: StageApply["added"] = [];
  const removed: StageApply["removed"] = [];
  const rolled: NonNullable<StageApply["rolled"]> = [];
  const parts: StageApply[] = [];
  for (const a of actions) {
    const p = runPart(ctx, cur, a);
    parts.push(p);
    // 途中で弾かれたら、打つ前のアイテムのまま (カレンシーも減らない)
    if (!p.applied) return { ...skip(item, p.reason ?? ""), ...(p.random ? { random: true } : {}) };
    cur = p.item;
    added.push(...p.added);
    removed.push(...p.removed);
    ctx.removedSoFar.push(...p.removed);
    rolled.push(...(p.rolled ?? []));
  }
  // ヒネコラの予見は「アイテムを変えると消える」(説明文)
  if (cur.foreseen) cur = { ...cur, foreseen: false };
  const note = parts.map((p) => p.note).find((x) => x);
  const count = parts.map((p) => p.count).find((x) => x != null);
  const augment = parts.map((p) => p.augment).find((x) => x);
  return {
    applied: true, item: cur, added, removed,
    ...(rolled.length ? { rolled } : {}), ...(note ? { note } : {}), ...(count != null ? { count } : {}), ...(augment ? { augment } : {}),
    omensUsed: used.map((o) => o.key),
  };
}
