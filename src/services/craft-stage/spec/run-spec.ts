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
import { ANNUL_SPEC, BONE_SPECS, OMEN_SPECS, OMEN_SPEC_BY_KEY, REVEAL_SPEC } from "./desecrate-specs";
import { groupsFit, limitBlock, stateBlock, targetBlock } from "./judge";
import { runPart, type Mods, type PartCtx } from "./parts";
import { tr } from "../../../i18n/lang";

type Resolved = { spec: CurrencySpec; reveal: PartCtx["reveal"]; reason?: string };

/**
 * 手順の鍵 → カレンシー。骨はアイテムの部位に合う種類 (顎骨・肋骨 …) を対象から選ぶ。合う物が無ければ reason
 * (例: 古代の頭蓋骨はクライアントに無い)。移していない鍵は null
 */
export function resolveSpec(key: string, item: StageItem): Resolved | null {
  if (key === ANNUL_SPEC.stageKey) return { spec: ANNUL_SPEC, reveal: null };
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
/** この鍵を新しい作りで打てるか (移し終えた手) */
export const specCovers = (key: string): boolean =>
  key === ANNUL_SPEC.stageKey || /^reveal/.test(key) || BONE_SPECS.some((s) => s.stageKey === key);

/** その手に掛かるお告げ (持っている中から)。単体で効く物 (腐食) があればそれだけ */
export function omensOf(spec: CurrencySpec, held: readonly string[]): OmenSpec[] {
  const used = held.flatMap((k) => { const o = OMEN_SPEC_BY_KEY.get(k); return o && o.appliesTo === spec.kind ? [o] : []; });
  const alone = used.find((o) => o.alone);
  return alone ? [alone] : used;
}
/**
 * お告げの効き目をまとめる。左右を両方掛けた時は左 (OMEN_SPECS の順)、勢力を 2 つ掛けた時は先に掛けた方
 * (どちらも画面では一緒に掛けられない: omens.ts の OMEN_EXCLUSIVE。今の関数と同じ選び方)
 */
function modsOf(used: readonly OmenSpec[]): Mods {
  const m: Mods = { side: null, guaranteeTag: null, rerolls: 0, pick: null, plain: false };
  for (const o of OMEN_SPECS) if (used.includes(o) && "side" in o.effect && !m.side) m.side = o.effect.side;
  for (const o of used) {
    const e = o.effect;
    if ("guaranteeTag" in e) m.guaranteeTag ??= e.guaranteeTag;
    else if ("rerolls" in e) m.rerolls += e.rerolls;
    else if ("pick" in e) m.pick = e.pick;
    else if ("replace" in e) m.plain = e.plain;
  }
  return m;
}

/** 1 手打つ (applyCurrency と同じ形)。移していない手は null */
export function applyBySpec(data: PatchData, item: StageItem, key: string, rng: () => number, omens: readonly string[] = []): StageApply | null {
  const r = resolveSpec(key, item);
  if (!r) return null;
  const { spec } = r;
  const st = stateBlock(spec, item, omens);
  if (st) return skip(item, st);
  if (r.reason) return skip(item, r.reason);
  const t = targetBlock(spec.target, item);
  if (t) return skip(item, t);
  for (const l of spec.limits) {
    const why = limitBlock(l, item);
    if (why) return skip(item, why);
  }
  const used = omensOf(spec, omens);
  for (const o of used) {
    const why = o.target ? targetBlock(o.target, item) : null;
    if (why) return skip(item, why);
  }
  const mods = modsOf(used);
  const replace = used.map((o) => o.effect).find((e) => "replace" in e);
  const actions = replace && "replace" in replace ? replace.replace : spec.actions;
  const ctx: PartCtx = {
    data, rng, mods, reveal: r.reveal,
    altered: spec.actions.some((a) => "addUnrevealed" in a && a.addUnrevealed.pools.includes("otherworldly")),
  };
  let cur = item;
  const added: StageApply["added"] = [];
  const removed: StageApply["removed"] = [];
  const rolled: NonNullable<StageApply["rolled"]> = [];
  for (const a of actions) {
    const p = runPart(ctx, cur, a);
    // 途中で弾かれたら、打つ前のアイテムのまま (カレンシーも減らない)
    if (!p.applied) return { ...skip(item, p.reason ?? ""), ...(p.random ? { random: true } : {}) };
    cur = p.item;
    added.push(...p.added);
    removed.push(...p.removed);
    rolled.push(...(p.rolled ?? []));
  }
  // ヒネコラの予見は「アイテムを変えると消える」(説明文)
  if (cur.foreseen) cur = { ...cur, foreseen: false };
  return { applied: true, item: cur, added, removed, ...(rolled.length ? { rolled } : {}), omensUsed: used.map((o) => o.key) };
}
