/**
 * E-65 の確かめ (2026-11-06): 紋章から打つ骨は、消された元の MOD の段のレベル L × 0.4 の四捨五入「以下」の段が出ない。
 * 外の正解 = オーナーの言葉 (「消された元の MOD のレベルだね参照」「四捨五入だそうです」)。打つ処理 (骨 → 発現) と確率の表 (heldOdds) の両方で見る。
 * 段が全部下限より下の MOD は一番上の段が残る (E-11d の元からの例外、floorKeepIndex) ので分けて数える。
 * 回し方: pnpm -s exec vitest run -c scripts/_mark-floor-probe.config.ts
 */
import { expect, it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { allMods, replaced } from "../src/services/craft-stage/stage-core";
import { heldOdds } from "../src/services/craft-stage/held-odds";
import { essenceShelf } from "../src/state/for-share/craft-stage-shelf";
import { resolveEssence, ABYSS_ESSENCE_SPEC } from "../src/services/craft-stage/spec/essence-specs";
import { floorKeepIndex } from "../src/vendor/poe2htc/engine/pool";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem, StageMod } from "../src/services/craft-stage/types";

const data = loadPatch();
const ILVL = 82;
const ring = freshItem(data, "Gold Ring", ILVL);

function marked(): { item: StageItem; mark: StageMod; gone: StageMod } {
  for (let s = 1; s < 500; s++) {
    const it = applyCurrency(data, ring, "alchemy", mulberry32(s)).item;
    const key = essenceShelf(data, it).flatMap((g) => g.keys).find((k) => resolveEssence(data, it, k)?.spec === ABYSS_ESSENCE_SPEC);
    if (!key) continue;
    const r = applyCurrency(data, it, key, mulberry32(s + 7));
    if (!r.applied || !r.removed[0]) continue;
    return { item: r.item, mark: allMods(r.item).find((m) => m.abyssMark)!, gone: r.removed[0] };
  }
  throw new Error("紋章の品が見つからない");
}

/** 紋章の L を書き換えて、骨の未発現の下限・発現の段・確率の表の段を数える */
function probe(base: { item: StageItem; mark: StageMod }, L: number | undefined, expectFloor: number) {
  const mark: StageMod = { ...base.mark };
  if (L == null) delete mark.markFrom; else mark.markFrom = L;
  const item = replaced(base.item, base.mark, mark);
  // 打つ処理: 骨 → 未発現の下限、発現 (候補の 1 つ目を選ぶ) の段
  const bad: string[] = [];
  let atFloor = 0, kept = 0, n = 0;
  for (let s = 1; s <= 400; s++) {
    const bone = applyCurrency(data, item, "desecrate", mulberry32(s));
    expect(bone.applied, bone.reason).toBe(true);
    const u = bone.added[0]!.unrevealed!;
    expect(u.floor).toBe(expectFloor);
    const rev = applyCurrency(data, bone.item, "reveal:1", mulberry32(s + 1000));
    if (!rev.applied) continue;
    const m = rev.added.find((x) => x.desecrated && !x.unrevealed);
    if (!m) continue;
    n++;
    const mod = data.mods.get(m.modId)!;
    const lv = mod.tiers[m.tierIndex]!.ilvl;
    if (lv < expectFloor) {
      if (floorKeepIndex(mod, expectFloor, ILVL) === m.tierIndex) kept++;
      else bad.push(`${m.modId}#${m.tierIndex} lv${lv}`);
    }
    if (lv === expectFloor) atFloor++;
  }
  // 確率の表: 骨の候補の段
  const h = heldOdds(data, item, "desecrate", [])!;
  const badOdds: string[] = [];
  let keptOdds = 0, floorOdds = 0;
  for (const [id, e] of h.byMod) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    for (const t of e.tiers) {
      if (!(t.w > 0)) continue;
      const lv = mod.tiers[t.index]!.ilvl;
      if (lv < expectFloor) {
        if (floorKeepIndex(mod, expectFloor, ILVL) === t.index) keptOdds++;
        else badOdds.push(`${id}#${t.index} lv${lv}`);
      }
      if (lv === expectFloor) floorOdds++;
    }
  }
  const lvs = new Set<number>();
  for (const [id, e] of h.byMod) for (const t of e.tiers) if (t.w > 0 && data.mods.get(id)) lvs.add(data.mods.get(id)!.tiers[t.index]!.ilvl);
  console.log(`  確率の表に出る段のレベル (40 まで): ${[...lvs].filter((x) => x <= 40).sort((a, b) => a - b).join(" ")}`);
  console.log(`L=${L ?? "無し"} 下限 N=${expectFloor} | 打つ処理: 発現 ${n} 回、N 未満 ${bad.length} (例外で残る一番上 ${kept})、ちょうど N ${atFloor} | 確率の表: N 未満の段 ${badOdds.length} (例外 ${keptOdds})、ちょうど N の段 ${floorOdds}`);
  expect(bad).toEqual([]);
  expect(badOdds).toEqual([]);
}

it("E-65 紋章の下限 = 消された元の MOD のレベル × 0.4 の四捨五入より上", () => {
  const base = marked();
  console.log(`紋章が覚えた L = ${base.mark.markFrom}、消された MOD = ${base.gone.modId} の段のレベル ${base.gone.modLevel}`);
  expect(base.mark.markFrom).toBe(base.gone.modLevel);
  probe(base, 75, 31); // 75 × 0.4 = 30 → 30 は出ず 31 以上
  probe(base, 76, 31); // 30.4 → 30
  probe(base, 79, 33); // 31.6 → 32 → 33 以上
  // 金の指輪には段のレベル 30・31 が無いので、境目は今ある段 29 で見る
  probe(base, 72, 30); // 28.8 → 29 → 段 29 は出ない (ちょうども出ない)
  probe(base, 70, 29); // 28 → 段 29 は出る
  probe(base, 1, 1); // 未発現を消した紋章 (L=1、オーナー 11-06 ②) → 下限は実質なし
  probe(base, undefined, 0); // 消した MOD が無い紋章 (空きに付いた・前の保存) = 下限なし (アイテムレベルの式は撤回)
});
