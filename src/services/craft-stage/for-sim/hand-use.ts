/**
 * hand-use.ts — 手を 1 回打つ (お告げ・触媒の前のカタリスト・フラクチャーで固定する MOD・骨の後の発現込み。2026-10-22 シミュの自前の式を入口へ、
 * sim-own-logic.md の B6・B7・B8)。打つ処理はエンジンの applyCurrency・fillCatalyst・revealOffers のまま。ここは打つ順と選び方をまとめるだけ。
 * 乱数は 1 本の rng を カタリスト → 手 → フラクチャーの指名 → 発現 の順に使う (シミュの playHand と同じ)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency, kindOf } from "../apply-currency";
import { revealOffers, unrevealedOf } from "../apply-desecrate";
import { forceKey } from "../apply-force";
import { CATALYSING_OMEN, handOmens } from "./can-use";
import { catalystFull, catalystTagOf, effectOf, fillCatalyst } from "./hand-effect";
import { catalystOf } from "../stage-core";
import { mulberry32 } from "../../htc/rng";
import type { StageApply, StageItem, StageMod } from "../types";

/** アビスの反響のお告げ (発現の候補を 1 回引き直せる。骨の手に付けると続けて打つ発現で使う) */
export const ABYSSAL_ECHO_OMEN = "OmenofAbyssalEchoes";

export interface HandSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ) */
  omens?: readonly string[];
  /** 触媒の高貴の前に品質を最大まで入れるカタリスト (お告げに触媒の高貴がある時だけ) */
  catalyst?: string | null;
  /** フラクチャーの手で ✦ にする MOD (付いていれば打った後にそれを固定。付いていない・打てない時はエンジンの乱数のまま) */
  fractureOf?: string | null;
  /** 未発現が付いた時、そのまま発現で選ぶ候補 (true の候補の最初の物、無ければ 1 つ目)。false = 発現しない。既定 = 1 つ目 */
  reveal?: false | ((m: StageMod) => boolean);
}
export interface HandResult extends StageApply {
  /** 触媒の前 (かカタリストの手そのもの) で打ったカタリストの個数 */
  catalystCount: number;
  /** 手そのもので使ったお告げ (発現の前。発現の物は omensUsed) */
  handOmensUsed: string[];
  /** 反響を発現に使った */
  echoUsed: boolean;
}

/**
 * 発現 (魂の井戸) で候補を選んで打つ。候補 3 つ (revealOffers) のうち want に合う最初の物、無ければ 1 つ目。
 * echo = アビスの反響があれば、最初の 3 つに無い時に 1 回引き直した 3 つから (同じ種で引くのでエンジンの reveal:N:reroll と同じ候補、apply-desecrate.ts)。
 * r = 未発現が付いた手の結果 (付いた・消えた MOD は足し合わせる)。発現できなければ r のまま
 */
export function revealBy(data: PatchData, r: StageApply, rng: () => number, want: (m: StageMod) => boolean, echo = false): StageApply {
  const seed = Math.floor(rng() * 2 ** 31);
  const offers = revealOffers(data, r.item, mulberry32(seed));
  const n = offers.first.findIndex(want);
  const k = n < 0 && echo ? offers.reroll.findIndex(want) : -1;
  // reveal:N の N は 1 から (エンジンの run-plan と同じ。0 は「その番号の候補が無い」)
  const x = k >= 0 ? applyCurrency(data, r.item, `reveal:${k + 1}:reroll`, mulberry32(seed), [ABYSSAL_ECHO_OMEN]) : applyCurrency(data, r.item, `reveal:${Math.max(0, n) + 1}`, mulberry32(seed));
  return x.applied ? { ...x, added: [...r.added, ...x.added], removed: [...r.removed, ...x.removed] } : r;
}

/** 手を 1 回打つ (上の HandSpec の順)。カタリストの手は品質を今の最大まで (もう最大なら打てた扱いで何もしない) */
export function applyHand(data: PatchData, item: StageItem, key: string, rng: () => number, spec: HandSpec = {}): HandResult {
  if (kindOf(key) === "catalyst") {
    const r = fillCatalyst(data, item, key, rng);
    return { ...r, applied: r.applied || r.count > 0 || catalystFull(item, key), catalystCount: r.count, handOmensUsed: [], echoUsed: false };
  }
  const { now, reveal } = handOmens(key, spec.omens ?? []);
  let it = item, catalystCount = 0;
  if (spec.catalyst && now.includes(CATALYSING_OMEN)) {
    const c = fillCatalyst(data, it, spec.catalyst, rng);
    if (!c.applied && c.count === 0 && catalystOf(it).tag !== catalystTagOf(spec.catalyst)) return { ...c, catalystCount: 0, handOmensUsed: [], echoUsed: false };
    catalystCount = c.count;
    it = c.item;
  }
  let r = applyCurrency(data, it, key, rng, now);
  const fo = spec.fractureOf;
  if (r.applied && fo && effectOf(key) === "fracture" && [...it.prefixes, ...it.suffixes].some((m) => m.modId === fo)) {
    const f = applyCurrency(data, it, forceKey(fo, "T1", "f"), rng);
    if (f.applied) r = { ...r, item: f.item, added: f.added, removed: f.removed };
  }
  const base = { catalystCount, handOmensUsed: r.omensUsed ?? [] };
  if (!r.applied || !unrevealedOf(r.item) || spec.reveal === false) return { ...r, ...base, echoUsed: false };
  const echo = reveal.includes(ABYSSAL_ECHO_OMEN);
  return { ...revealBy(data, r, rng, spec.reveal ?? (() => false), echo), ...base, echoUsed: echo };
}
