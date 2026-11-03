/**
 * tree-omen.ts — 木の手でそのお告げを掛けられるか (S-20b、11-03 シミュ部長 72)。
 * エンジンの omenBlock に、木の箱は何人もの集まりなので「今は意味なし」(付く・消す側の反対が埋まって / 消せる物が無くて、見本 1 人には効かないだけ) では止めない、を足す。
 * 掛けると打てなくなる・その側が満杯 / 消せる物が無いは omenBlock のまま止める (オーナー 10-22「進行不能」)
 */
import { applyCurrency, listOf, mulberry32, omenBlock, room, type PatchData, type StageItem } from "../../craft-stage/engine";

type Side = "prefix" | "suffix";
/** 側を決めるお告げ → 付ける (add) / 消す (remove) 側 (エンジンの omens.ts の addSide・removeSide と同じ並び) */
const SIDE_OMEN: Readonly<Record<string, readonly ["add" | "remove", Side]>> = {
  OmenofSinistralExaltation: ["add", "prefix"], OmenofDextralExaltation: ["add", "suffix"],
  OmenofSinistralNecromancy: ["add", "prefix"], OmenofDextralNecromancy: ["add", "suffix"],
  OmenofSinistralAnnulment: ["remove", "prefix"], OmenofDextralAnnulment: ["remove", "suffix"],
  OmenofSinistralErasure: ["remove", "prefix"], OmenofDextralErasure: ["remove", "suffix"],
  OmenofSinistralCrystallisation: ["remove", "prefix"], OmenofDextralCrystallisation: ["remove", "suffix"],
};

/** 打てない理由 (掛けられるなら null)。omens = 一緒に掛けるお告げ (omen を含んでもよい) */
export function treeOmenBlock(data: PatchData | null | undefined, item: StageItem | null | undefined, held: string | null | undefined, omens: readonly string[], omen: string): string | null {
  const why = omenBlock(data, item, held, omens, omen);
  const s = SIDE_OMEN[omen];
  if (!why || !s || !data || !item || !held || item.rarity !== "rare") return why;
  const [how, side] = s, other: Side = side === "prefix" ? "suffix" : "prefix";
  const ok = (sd: Side): boolean => (how === "add" ? room(item, sd) : listOf(item, sd).some((m) => !m.fractured));
  // その側は効く・反対の側は効かない = 「今は意味なし」だけ。掛けて打てるかはエンジンで見る
  if (!ok(side) || ok(other)) return why;
  const r = applyCurrency(data, item, held, mulberry32(0), [...omens.filter((o) => o !== omen), omen]);
  return r.applied || r.random ? null : r.reason ?? why;
}
