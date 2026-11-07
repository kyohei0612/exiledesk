/**
 * 説明文の分解 (CurrencySpec) で 1 手打つ (2026-10-16、ADR-004)。
 *
 * 流れ: 骨の種類を部位で選ぶ → アイテムの状態 (コラプトなど) → 対象 → 制約 → お告げの対象 → 動作の部品を順に。
 * お告げは掛かる手の種類 (kind) が合う物だけ食い、効き目は部品への修飾 (Mods) にまとめる。
 * まだ移していない手は null を返す (呼ぶ側は今の applyCurrency を使う)。画面はまだ今の関数のまま (切り替えない)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { skip, type Force } from "../stage-core";
import type { StageApply, StageItem } from "../types";
import type { Action, CurrencySpec, OmenSpec } from "./types";
import { specDrawsOtherworldly } from "./parts-unrevealed";
import { ANNUL_SPEC, BONE_SPECS, REVEAL_SPEC } from "./desecrate-specs";
import { ORB_SPEC_BY_KEY } from "./orb-specs";
import { ALLOY_SPEC, ESSENCE_SPEC, isAlloyKey, PERFECT_ESSENCE_SPEC, prepareEssence, resolveEssence } from "./essence-specs";
import { ALL_OMEN_SPECS, omensOfKind } from "./omen-layer";
import { ARTIFICER_SPEC, CATALYST_SPEC_BY_KEY, EMOTION_SPEC, FLUX_SPECS, QUALITY_SPECS, RUNE_SPEC } from "./other-specs";
import { emotionReason } from "../apply-emotion";
import { isRune } from "../stage-runes";
import { groupsFit, limitBlock, stateBlock, targetBlock } from "./judge";
import { NO_MODS, runPart, type Mods, type PartCtx } from "./parts";
import { tr } from "../../../i18n/lang";
import { parseKey } from "../key";
import { dropForesight } from "../apply-extra";

type Resolved = { spec: CurrencySpec; reveal: PartCtx["reveal"]; reason?: string };

/**
 * 手順の鍵 → カレンシー。骨はアイテムの部位に合う種類 (顎骨・肋骨 …) を対象から選ぶ。合う物が無ければ reason
 * (例: 古代の頭蓋骨はクライアントに無い)。移していない鍵は null
 */
export function resolveSpec(key: string, item: StageItem, data?: PatchData): Resolved | null {
  // 鍵の読みは key.ts の parseKey 1 か所 (E-20a)。ルーンは鍵の形ではなくルーンの表にあるかで決まるので isRune のまま
  const k = parseKey(key);
  if (k.type === "essence") {
    const e = data ? resolveEssence(data, item, key) : null;
    return e ? { spec: e.spec, reveal: null, ...(e.reason ? { reason: e.reason } : {}) } : null;
  }
  if (key === ANNUL_SPEC.stageKey) return { spec: ANNUL_SPEC, reveal: null };
  const orb = ORB_SPEC_BY_KEY.get(key) ?? CATALYST_SPEC_BY_KEY.get(key) ?? QUALITY_SPECS.find((s) => s.stageKey === key) ?? (key === ARTIFICER_SPEC.stageKey ? ARTIFICER_SPEC : null);
  if (orb) return { spec: orb, reveal: null };
  if (isRune(key)) return { spec: RUNE_SPEC, reveal: null };
  const flux = FLUX_SPECS.find((s) => s.stageKey === key);
  if (flux) return { spec: flux, reveal: null };
  // 感情: その部位で使える物か (古代の版は時を失ったジュエル用)。使えなければ一言
  if (k.type === "emotion") { const why = emotionReason(item, key); return { spec: EMOTION_SPEC, reveal: null, ...(why ? { reason: why } : {}) }; }
  if (k.type === "reveal") return { spec: REVEAL_SPEC, reveal: k.index != null ? { index: k.index, reroll: k.reroll } : { invalid: key } };
  const bones = BONE_SPECS.filter((s) => s.stageKey === key);
  if (!bones.length) return null;
  const fit = bones.find((s) => groupsFit(s.target, item));
  if (fit) return { spec: fit, reveal: null };
  // 部位に合う骨が無い: 1 つだけなら (変質した鎖骨) その対象の一言、いくつもあれば共通の一言
  const reason = bones.length === 1 ? targetBlock(bones[0]!.target, item) ?? "" : tr("この部位に使える骨が無い", "No bone of this kind for this item class");
  return { spec: bones[0]!, reveal: null, reason };
}
/**
 * 品も data も使わずに鍵 → カレンシー (resolveSpec と同じ引き。2026-11-07 シミュ部長 sim-light22 の頼み、木の手の鍵だけで手の種類を引く)。
 * 骨は同じ鍵のどれか (種類で部品の並びは同じ)、エッセンスは段と完全かで決まる spec (深淵のエッセンスも部品の種類は完全エッセンスと同じ)。
 * 打てるか・お告げで置き換わる部品は見ない (それは planSpec)。移していない鍵は null
 */
export function specOfKey(key: string): CurrencySpec | null {
  const k = parseKey(key);
  if (k.type === "essence") return !k.tier ? null : k.tier !== "perfect" ? ESSENCE_SPEC : isAlloyKey(key) ? ALLOY_SPEC : PERFECT_ESSENCE_SPEC;
  if (k.type === "emotion") return EMOTION_SPEC;
  if (k.type === "bone") return BONE_SPECS.find((s) => s.stageKey === key) ?? null;
  // 残りの鍵 (オーブ・消去・品質・触媒・熟練工・ルーン・フラックス・発現) は resolveSpec の中で品を見ない
  return resolveSpec(key, {} as StageItem)?.spec ?? null;
}

// 全部のお告げとお告げの層 (今効くお告げ・排他・側) は omen-layer.ts。シミュ・チュートリアルはここから読む
export { ALL_OMEN_SPECS } from "./omen-layer";

/**
 * その手に掛かるお告げ (持っている中から、エンジンが食う物)。単体 (腐食)・上書き (光 → 左右の消去)・一緒に効かない組 (左右・勢力) は
 * お告げの層 (omen-layer.ts の omensOfKind) の 1 か所。item を渡すと状態で効かない物 (紋章がある骨のネクロマンシー) も落とす
 */
export const omensOf = (spec: CurrencySpec, held: readonly string[], item?: StageItem): OmenSpec[] => omensOfKind(spec.kind, held, item);
/**
 * お告げの効き目をまとめる (used はお告げの層で一緒に効かない組を落とした後なので、側・勢力は 1 つずつ)
 */
export function modsOf(used: readonly OmenSpec[]): Mods {
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
    else if ("replace" in e) m.plain = !!e.plain;
    else if ("addCount" in e) m.addCount = e.addCount;
    else if ("pickLowest" in e) m.pickLowest = true;
    else if ("catalysing" in e) m.catalysing = true;
    else if ("implicitOnly" in e) m.implicitOnly = true;
  }
  return m;
}

/**
 * 付く MOD の指名が効く手 = 部品に「付ける (add)」がある手 (E-20a、手の種類の名前の表は持たない)。指名を食うのは add の部品だけ (parts.ts)。
 * 2026-11-07 に手の定義の全部 (73 行) で前の表 (変化・増強・リーガル・錬金・エクザルテッド・カオス) と同じ手になるのを確かめた。
 * カオス (指名は 1 つ目だけ・消える MOD の指名) は種類の名前で見たまま: 部品の種類 (actionClass の replace = 消す + 付ける) では
 * 錬金 (全部消す + レア + 4 つ付ける)・完全エッセンス・感情・発現も同じ replace になり、錬金の 4 つの指名が 1 つに削られて答えが変わる
 */
const takesPick = (spec: CurrencySpec): boolean => spec.actions.some((a) => "add" in a);

/**
 * 打つ前の判定とお告げの効き目 (打つ処理 applyBySpec と確率表 spec/odds.ts が同じ物を使う)。移していない手は null。
 * block: 打てない一言。stage = state (アイテムの状態・骨が部位に合わない)・target (対象)・limit (制約・お告げの前提)。
 * actions: 打つ部品 (腐食のお告げなら置き換えた物)
 */
export interface SpecPlan {
  spec: CurrencySpec;
  reveal: PartCtx["reveal"];
  used: OmenSpec[];
  mods: Mods;
  actions: readonly Action[];
  catalystTag: string | null;
  block: { stage: "state" | "target" | "limit"; reason: string } | null;
  /** 対象 (レアリティ・部位) が合わない (アイテムの状態より先に見る時に使う: 確率表は対象が合わなければ表を出さない) */
  offTarget: boolean;
}
export function planSpec(data: PatchData, item: StageItem, key: string, omens: readonly string[]): SpecPlan | null {
  const r = resolveSpec(key, item, data);
  if (!r) return null;
  const { spec } = r;
  // アビサルロードの紋章がある時の骨は必ず印と入れ替わるので、左右のネクロマンシーのお告げは使えない (効かず、減らない。OmenSpec の idleWhen、E-67)
  const used = omensOf(spec, omens, item);
  const mods = modsOf(used);
  const pk = parseKey(key);
  const catalystTag = spec.kind === "catalyst" && pk.type === "catalyst" ? pk.tag : null;
  const replace = used.map((o) => o.effect).find((e) => "replace" in e);
  const actions = replace && "replace" in replace ? replace.replace : spec.actions;
  const plan = { spec, reveal: r.reveal, used, mods, actions, catalystTag, offTarget: !!r.reason || !!targetBlock(spec.target, item) };
  const block = (stage: "state" | "target" | "limit", reason: string): SpecPlan => ({ ...plan, block: { stage, reason } });
  const st = stateBlock(spec, item, omens);
  if (st) return block("state", st);
  if (r.reason) return block("state", r.reason);
  const t = targetBlock(spec.target, item);
  if (t) return block("target", t);
  for (const l of spec.limits) {
    const why = limitBlock(l, item, mods, catalystTag, { data, key });
    if (why) return block("limit", why);
  }
  for (const o of used) {
    const why = (o.target ? targetBlock(o.target, item) : null) ?? (o.limits ?? []).map((l) => limitBlock(l, item, mods)).find((x) => x) ?? null;
    if (why) return block("limit", why);
  }
  return { ...plan, block: null };
}

/**
 * 1 手打つ (applyCurrency と同じ形)。移していない手は null。oneCatalyst: 手順の再生 (触媒は 1 手 = 1 個。applyCurrency の hint.oneCatalyst と同じ)。
 * pick / remove: 付く MOD・消える MOD の指名 (手順の再生、要望 ⑱-1。applyCurrency の hint と同じ)
 */
export function applyBySpec(data: PatchData, item: StageItem, key: string, rng: () => number, omens: readonly string[] = [], opts: { oneCatalyst?: boolean; pick?: readonly Force[]; remove?: string } = {}): StageApply | null {
  const plan = planSpec(data, item, key, omens);
  if (!plan) return null;
  if (plan.block) return skip(item, plan.block.reason);
  const { spec, used, mods, actions, catalystTag } = plan;
  // エッセンスの MOD は打つ前に作る (値の乱数は今の関数と同じく消す前)
  const essence = spec.actions.some((a) => "addEssence" in a) ? prepareEssence(data, item, key, rng) : null;
  if (spec.actions.some((a) => "addEssence" in a) && !essence) return skip(item, tr("このエッセンスのティアが無い", "No tier for this Essence"));
  const ctx: PartCtx = {
    data, rng, mods, reveal: plan.reveal, removedSoFar: [], essence, before: item,
    catalystTag, oneCatalyst: !!opts.oneCatalyst, runeKey: key,
    altered: specDrawsOtherworldly(spec),
    // カオスは指名の 1 つ目だけ見る (今の関数と同じ。余った指名は無視)
    ...(takesPick(spec) && opts.pick?.length ? { pick: spec.kind === "chaos" ? opts.pick.slice(0, 1) : opts.pick } : {}),
    ...(spec.kind === "chaos" && opts.remove ? { removeForce: opts.remove } : {}),
  };
  let cur = item;
  const added: StageApply["added"] = [];
  const removed: StageApply["removed"] = [];
  const rolled: NonNullable<StageApply["rolled"]> = [];
  const picked: NonNullable<StageApply["picked"]> = [];
  const parts: StageApply[] = [];
  for (const a of actions) {
    const p = runPart(ctx, cur, a);
    parts.push(p);
    // 途中で弾かれたら、打つ前のアイテムのまま (カレンシーも減らない)
    if (!p.applied) return { ...skip(item, p.reason ?? ""), ...(p.random ? { random: true } : {}), ...(p.pickError ? { pickError: true } : {}) };
    cur = p.item;
    added.push(...p.added);
    removed.push(...p.removed);
    ctx.removedSoFar.push(...p.removed);
    rolled.push(...(p.rolled ?? []));
    picked.push(...(p.picked ?? []));
  }
  // ヒネコラの予見は「アイテムを変えると消える」(説明文、決まりは apply-extra.ts の dropForesight 1 か所)
  cur = dropForesight(cur, key);
  const note = parts.map((p) => p.note).find((x) => x);
  const count = parts.map((p) => p.count).find((x) => x != null);
  const augment = parts.map((p) => p.augment).find((x) => x);
  const converted = parts.map((p) => p.converted).find((x) => x);
  return {
    applied: true, item: cur, added, removed,
    ...(picked.length ? { picked } : {}), ...(rolled.length ? { rolled } : {}), ...(note ? { note } : {}), ...(count != null ? { count } : {}), ...(augment ? { augment } : {}), ...(converted ? { converted } : {}),
    omensUsed: used.map((o) => o.key),
  };
}
