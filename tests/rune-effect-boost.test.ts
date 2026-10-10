// ソケットのルーンの効果が 100% 以上でセールの凱旋が +2 サフィ・アストリッドの創造性が +2 クラフト (切り捨て)。
// ルーンシーカーの呼び声の遺産 (ワンド 75%) + 合金の「ソケットのオーグメントの効果 20〜30%」。2026-10-10 Benton の動画、データで数値を確認
import { expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { startFrom } from "../src/services/craft-stage/run-plan";
import { allMods, limitOf, runeEffectPct } from "../src/services/craft-stage/stage-core";
import { craftedLimitOf } from "../src/services/craft-stage/apply-essence";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const wandBase = "Acrid Wand";
const wand = (pct: number, runes: string[]): StageItem => {
  // ワンドの熟練工の上限は 1 なので、規格外 (2 ソケット) の物として直に作る
  // 合金の MOD は打って付ける物なので、行を直に置く
  const it = startFrom(data, wandBase, 82, { rarity: "rare" } as never, 1);
  const alloy = { modId: "Wands/PerfectEssence_SoulCore", family: "SoulCore", side: "suffix", tierIndex: 0, tierName: "T1", affix: "", modLevel: 65, values: [pct], ranges: [[20, 30]], textJa: "", textEn: `${pct}% increased effect of Socketed Augment Items`, crafted: true } as never;
  return { ...it, sockets: 2, augments: runes.map((en) => ({ en, ja: en, key: `rune:${en}` })) as never, suffixes: [alloy] };
};

it("遺産 75% + 合金 25% = 100% でサフィックス 5 (+2)", () => {
  const it0 = wand(25, ["Serle's Triumph", "Legacy of Runeseeker's Call"]);
  expect(runeEffectPct(it0)).toBe(100);
  expect(limitOf(it0, "suffix")).toBe(5);
});
it("遺産 75% + 合金 20% = 95% では +1 のまま (切り捨て)", () => {
  expect(limitOf(wand(20, ["Serle's Triumph", "Legacy of Runeseeker's Call"]), "suffix")).toBe(4);
});
it("アストリッドの創造性も 100% でクラフト MOD 3", () => {
  expect(craftedLimitOf(wand(25, ["Astrid's Creativity", "Legacy of Runeseeker's Call"]))).toBe(3);
  expect(allMods(wand(25, ["Astrid's Creativity"])).length).toBeGreaterThan(0);
});
