/**
 * _slot-mods-probe.test.ts — 枠を増やす MOD (S-04b) の完成形のカードをエンジンで組んで並べる台本 (2026-11-03 シミュ部長 68)。
 *
 *   pnpm exec vitest run -c scripts/_slot-mods-probe.config.ts
 *
 * サファイア (動画 h4dw1U9Od0Y の 5 MOD): 軽蔑の +1 サフィ枠 (途中で消える) + 獰猛のサフィの効果増加 + クリダメ・マナで受ける・効果範囲・クリティカルヒット率 (動画は冒涜で付ける)。
 * 枠の数・カードに乗らない狙いを並べるだけ (合否は付けない)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { freshItem, limitOf, modListFor, SIDES } from "../src/services/craft-stage/engine";
import { jewelEmotionsOf } from "../src/services/htc/patch";
import { placeWithSlots, slotsAdded } from "../src/views/simulator/tree/tree-slot-mods";
import { stepOutcomes } from "../src/services/simulator/sim-engine";
import { applyCurrency, mulberry32 } from "../src/services/craft-stage/engine";

const data = loadPatch();
it("sapphire slots", () => {
  const base = "Sapphire", lv = 82;
  const item = freshItem(data, base, lv, "rare");
  const rows = modListFor(data, item);
  const find = (side: string, re: RegExp, g = "normal") => rows.find((r) => r.side === side && r.group === g && re.test(r.text + r.template));
  const show = (r: { id: string; text: string } | undefined) => (r ? `${r.id} (${r.text})` : "なし");
  const crit = find("suffix", /クリティカルダメージ|Critical Damage/), mana = find("suffix", /マナ|Mana/), aoe = find("prefix", /効果範囲|Area/), critCh = find("suffix", /^クリティカルヒット率|^\(5-15\)% increased Critical Hit Chance$/);
  console.log("crit", show(crit), "\nmana", show(mana), "\naoe", show(aoe), "\ncritChance(冒涜)", show(critCh));
  console.log("一覧の group:", [...new Set(rows.map((r) => r.group))]);
  const emo = jewelEmotionsOf(item.cls.id).filter((e) => /Contempt|Ferocity/.test(e.item));
  for (const e of emo) console.log("感情", e.item, e.side, e.modId, "枠+", slotsAdded(data, base, lv, { modId: e.modId, tier: 1 }));
  const plusSuffix = emo.find((e) => /AdditionalSuffixAllowed/.test(e.modId))!.modId;
  const sufEffect = emo.find((e) => /CraftedJewelSuffixEffect/.test(e.modId))!.modId;
  const T = (r: { id: string } | undefined) => ({ modId: r!.id, tier: 1 });
  const aims = [T(crit), T(mana), T(critCh), T(aoe), { modId: sufEffect, tier: 1 }];
  const card = (label: string, way: Array<{ modId: string; tier: number }>, a = aims) => {
    const r = placeWithSlots(data, base, lv, a, way, () => 0.5);
    console.log(`--- ${label}: 枠 P${limitOf(r.item, "prefix")} S${limitOf(r.item, "suffix")}`, SIDES.map((s) => `${s}: ${(s === "prefix" ? r.item.prefixes : r.item.suffixes).map((m) => m.modId.split("/")[1]).join(", ")}`).join(" | "), "\n  乗らない:", r.left.map((x) => `${x.modId.split("/")[1]} (${x.reason})`));
  };
  card("枠の MOD 無し", []);
  card("+1 サフィ枠を狙いに", [], [{ modId: plusSuffix, tier: 1 }, ...aims.filter((x) => x.modId !== sufEffect)]);
  card("+1 サフィ枠を途中で消える", [{ modId: plusSuffix, tier: 1 }]);
  // 動画の 2 手目: 3 MOD (プレ 植物のダメージ・サフィ クリダメ・マナで受ける) に強力な液化した軽蔑。エンジンの枝 (stepOutcomes) と 2000 回打った結果
  let it3 = freshItem(data, base, lv, "rare");
  for (const k of [`force:${crit!.id}|T1|n`, `force:${mana!.id}|T1|n`, "force:Jewels_int/JewelPlantDamage|T1|n"]) it3 = applyCurrency(data, it3, k, mulberry32(1)).item;
  const key = "emotion:Potent Liquid Contempt";
  const short = (it: typeof it3) => `P[${it.prefixes.map((m) => m.modId.split("/")[1]).join(",")}] S[${it.suffixes.map((m) => m.modId.split("/")[1]).join(",")}]`;
  console.log("打つ前", short(it3));
  for (const o of stepOutcomes(data, it3, key) ?? []) console.log(`枝 ${(o.p * 100).toFixed(1)}%`, o.void ? "不成立" : short(o.item));
  const by: Record<string, number> = {};
  for (let i = 1; i <= 2000; i++) { const r = applyCurrency(data, it3, key, mulberry32(i)); const k = r.applied ? short(r.item) : `打てない ${r.reason}`; by[k] = (by[k] ?? 0) + 1; }
  console.log("打った 2000 回", by);
});
