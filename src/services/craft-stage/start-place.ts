/**
 * start-place.ts — 始めの状態に MOD を「置く」(E-29b、11-17 オーナー「完成形につく奴全部エミュに対応したらいい」、シミュ S-211c)。
 * 指名 (Force、addForced) はその時点で乱数で付きうる物だけ通すので、エッセンス・合金・ルーンの池・冒涜の MOD を断る。
 * 置く方は付きうるかを問わず、段 (添字)・値・印のまま品に置く (完成形の品は placeMods = 指名の手 force: で決まりを守って作った物なので、置く時に見直さない)。
 * 段は添字で持つ (クラフト MOD の tierName は普通の MOD の段の名前に読み替えてあり、T の数からは戻せない)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { normalTierOf } from "./apply-essence";
import { allMods, makeStageMod, withMod, withValues } from "./stage-core";
import type { StageItem, StageSide } from "./types";
import { tr } from "../../i18n/lang";

/** 置く MOD 1 つ (手順 JSON の start.placed に入るので JSON で書ける形) */
export interface PlacedMod {
  /** MOD の id */
  mod: string;
  /** 段の添字 (Mod.tiers の。大きいほど上の段) */
  tierIndex: number;
  /** 値 (画面の単位、伸びる前)。無ければ乱数 */
  values?: number[];
  fractured?: boolean;
  desecrated?: boolean;
  /** クラフト MOD (エッセンス・完全なエッセンス・合金で付いた物。上限の数え E-11h に入る) */
  crafted?: boolean;
}

/** 品に付いている MOD を置く形に (プレ → サフィの順、品の並びのまま) */
export const placedOf = (it: StageItem): PlacedMod[] => allMods(it).map((m) => ({
  mod: m.modId, tierIndex: m.tierIndex, values: [...m.values],
  ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}), ...(m.crafted ? { crafted: true } : {}),
}));

/** 置く MOD を順に品に置く (枠・系統・上限は見ない)。MOD か段がデータに無ければ投げる */
export function placeStartMods(data: PatchData, from: StageItem, mods: readonly PlacedMod[], rng: () => number): StageItem {
  let item = from;
  for (const [i, p] of mods.entries()) {
    const mod = data.mods.get(p.mod);
    if (!mod) throw new Error(tr(`始めの状態の置く MOD ${i + 1} つ目: ${p.mod} という MOD が無い`, `Start placed mod #${i + 1}: no mod named ${p.mod}`));
    const tier = mod.tiers[p.tierIndex];
    if (!tier) throw new Error(tr(`始めの状態の置く MOD ${i + 1} つ目: ${p.mod} に段 ${p.tierIndex} が無い`, `Start placed mod #${i + 1}: ${p.mod} has no tier ${p.tierIndex}`));
    const side: StageSide = mod.type === "suffix" ? "suffix" : "prefix";
    let sm = makeStageMod(mod, side, p.tierIndex, rng);
    if (p.values?.length) sm = withValues(sm, mod, rng, p.values);
    // クラフト MOD の段の名前は指名の手 (apply-force) と同じく普通の MOD の段に読み替える
    if (p.crafted) sm = { ...sm, ...normalTierOf(data, item, mod, tier), crafted: true };
    if (p.fractured) sm = { ...sm, fractured: true };
    if (p.desecrated) sm = { ...sm, desecrated: true };
    item = withMod(item, sm);
  }
  return item;
}
