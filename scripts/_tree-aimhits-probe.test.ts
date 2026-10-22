/**
 * _tree-aimhits-probe.test.ts — 木の当たりの判定 aimHeld (tree-sample) をエンジンの入口の aimHits に置き換えると何が変わるか (2026-10-22 シミュ部長 14 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-aimhits-probe.config.ts
 *
 * aimHeld = 同じ modId か「同じ系統で効果の文も同じ別の modId」(エッセンス版・まとめ行)、未発現も数える。
 * aimHits = 同じ modId だけ、未発現は数えない。段の合わせ方は両方同じ (段の名前の数字) として、違いは modId の広げ方と未発現だけを数える。
 * 1) データ全体: 系統 + 文が同じ別の modId を持つ MOD の数 (aimHeld だけが当たりに数える組)
 * 2) 見本の木: 箱ごとの見本 20 個で、狙いごとに aimHeld と exact (同じ modId・未発現を除く) が食い違った回数
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { type StageItem, type StageMod } from "../src/services/craft-stage/engine";
import { aimHeldOn } from "../src/services/simulator/tree/tree-aim";
import { aimsOf, sampleOf } from "../src/services/simulator/tree/tree-sample";
import { treeSample, TREE_SAMPLES } from "../src/services/simulator/tree/tree-samples";

const tierNo = (m: StageMod): number => Number(/\d+/.exec(m.tierName)?.[0] ?? 99);

it("前の aimHeld の式 → 入口の aimHeldOn の違い", () => {
  const data = loadPatch();
  const groups = new Map<string, string[]>();
  for (const [id, m] of data.mods) if (m.family) groups.set(`${m.family}|${m.text}`, [...(groups.get(`${m.family}|${m.text}`) ?? []), id]);
  const wide = [...groups.values()].filter((l) => l.length > 1);
  console.log(`1) 系統 + 文が同じ別の modId の組: ${wide.length} 組 (MOD ${wide.reduce((n, l) => n + l.length, 0)} 個)`);
  for (const l of wide.slice(0, 8)) console.log(`   ${l.join(" / ")}`);

  // 置き換えの前の aimHeld の式 (4ae96729)。今の aimHeld (入口の aimHits の sameText) と食い違わないかを見る (10-22 14 本目)
  const exact = (item: StageItem, a: { modId: string; tier: number }): boolean => {
    const want = data.mods.get(a.modId);
    const same = (m: StageMod): boolean => m.modId === a.modId || (!!want?.family && m.family === want.family && data.mods.get(m.modId)?.text === want.text);
    return [...item.prefixes, ...item.suffixes].some((m) => !m.unrevealed && same(m) && tierNo(m) <= a.tier);
  };
  // 3) 同じ系統・同じ文の組の全部で、別の modId の MOD を段ごとに作り、狙いの段 1〜段の数で前後の式を比べる
  let n3 = 0, d3 = 0;
  for (const l of wide) for (const aId of l) for (const bId of l) {
    const A = data.mods.get(aId)!, B = data.mods.get(bId)!;
    for (let i = 0; i < B.tiers.length; i++) {
      const m = { modId: bId, family: B.family, tierName: `T${B.tiers.length - i}`, tierIndex: i } as unknown as StageMod;
      const it = { prefixes: [m], suffixes: [] } as unknown as StageItem;
      for (let tier = 1; tier <= A.tiers.length; tier++) { n3++; if (aimHeldOn(data, it, { modId: aId, tier }, { sameText: true }) !== exact(it, { modId: aId, tier })) { d3++; if (d3 <= 3) console.log(`   3) 食い違い ${aId} T${tier} ← ${bId} ${m.tierName}`); } }
    }
  }
  console.log(`3) 組の総当たり: 判定 ${n3} 回中 食い違い ${d3}`);
  for (const key of TREE_SAMPLES) {
    const doc = treeSample(key);
    if (!doc) continue;
    const aims = [...aimsOf(doc), ...(doc.memoAims ?? [])];
    let n = 0, diff = 0;
    const ex: string[] = [];
    for (const id of Object.keys(doc.boxes)) {
      for (let s = 1; s <= 20; s++) {
        const it = sampleOf(data, doc, id, s).item;
        for (const a of aims) {
          n++;
          if (aimHeldOn(data, it, a, { sameText: true }) !== exact(it, a)) { diff++; if (ex.length < 3) ex.push(`${id}#${s} ${a.modId} T${a.tier}: ${[...it.prefixes, ...it.suffixes].map((m) => m.modId + (m.unrevealed ? "(未発現)" : "")).join(",")}`); }
        }
      }
    }
    console.log(`2) ${key}: 判定 ${n} 回中 食い違い ${diff}`);
    for (const e of ex) console.log(`   ${e}`);
  }
});
