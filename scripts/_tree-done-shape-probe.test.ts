/**
 * _tree-done-shape-probe.test.ts — 見本 gold-ring-suffix の完成の枝 (d1・d2・d3) で、完成した時点のアイテムがプレフィックス側から見て同じ形かを数える台本
 * (2026-10-22 シミュ部長 6 本目、オーナー「サフィに 3 MOD 付いた時点で、そこから先は全て同じルート…パターンが違う事はありえる?」)。
 *
 *   pnpm exec vitest run -c scripts/_tree-done-shape-probe.config.ts   (人数は N=、既定 300)
 *
 * 回し方は tree-run の runOne と同じ道 (始まり → 手をエンジンで打つ → 結果の箱 → settle、戻りは決めた箱 / 形の合う箱 / 作り直し)。
 * tree-run は完成の時点のアイテムを返さないので、ここで同じ順に辿る (見本は split・next を使わない)。値段は数えない。合否は付けない (並べるだけ)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { mulberry32, type StageItem, type StageMod } from "../src/services/craft-stage/engine";
import { aimsOf, outcomeOf, playHand, startItemOf } from "../src/services/simulator/tree/tree-sample";
import { MATCH, matchItem, RESTART, settle, shapesOf } from "../src/services/simulator/tree/tree-run";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

const data = loadPatch();
const tag = (m: StageMod): string => `${m.modId.replace(/^Rings\//, "")} ${m.tierName}`;

it("完成の枝の形", () => {
  const doc = treeSample("gold-ring-suffix")!;
  const aims = aimsOf(doc), shapes = shapesOf(doc);
  const N = Number(process.env.N ?? 300), rng = mulberry32(1);
  /** 完成の箱 → 形 → 人数 (形 = フラクチャー以外のプレフィックス・品質・サフィックスの段) */
  const byBox: Record<string, Record<string, number>> = {};
  const parts: Record<string, Record<string, number>> = { prefix: {}, quality: {}, suffix: {}, open: {} };
  const bump = (o: Record<string, number>, k: string): void => { o[k] = (o[k] ?? 0) + 1; };
  let stuck = 0;
  for (let n = 0; n < N; n++) {
    let item: StageItem = startItemOf(data, doc, rng).item, at = "start", hops = 0;
    for (let steps = 0; steps < 50_000; steps++) {
      const b = doc.boxes[at]!;
      if (b.done === "main") break;
      if (b.back) {
        if (++hops > 1000) { at = ""; break; }
        if (b.back === RESTART) { item = startItemOf(data, doc, rng).item; at = "start"; continue; }
        at = (b.back === MATCH ? matchItem(data, doc, item, aims) : b.back) ?? "";
        if (!at) break;
        continue;
      }
      hops = 0;
      const r = playHand(data, item, b.hand!, rng, aims);
      if (!r.applied) { at = ""; break; }
      const oc = outcomeOf(data, item, r.item, aims);
      const next = b.outs.find((id) => { const c = doc.boxes[id]!; return (c.out === oc.out || c.out === "any") && (oc.out !== "hit" || (!!c.aim && oc.hits.some((a) => a.modId === c.aim!.modId && a.tier === c.aim!.tier))); });
      if (!next) { at = ""; break; }
      item = r.item;
      at = settle(data, doc, shapes, next, item, aims);
    }
    if (!at || doc.boxes[at]?.done !== "main") { stuck++; continue; }
    const pre = item.prefixes.filter((m) => !m.fractured).map(tag).sort().join(" + ") || "無し";
    const q = `${item.quality}% ${item.qualityTag ?? "-"}`;
    const suf = item.suffixes.map(tag).sort().join(" + ");
    const open = `P 空き ${3 - item.prefixes.length} / S 空き ${3 - item.suffixes.length}`;
    byBox[at] ??= {};
    bump(byBox[at]!, `P[${pre}] Q[${q}] ${open}`);
    bump(parts.prefix!, pre); bump(parts.quality!, q); bump(parts.suffix!, suf); bump(parts.open!, open);
  }
  console.log(`${N} 人 (止まり ${stuck})`);
  for (const [box, m] of Object.entries(byBox)) {
    console.log(`== ${box} (${Object.values(m).reduce((a, x) => a + x, 0)} 人)`);
    for (const [k, v] of Object.entries(m).sort((a, z) => z[1] - a[1])) console.log(`  ${v}  ${k}`);
  }
  for (const [name, m] of Object.entries(parts)) {
    console.log(`-- ${name}`);
    for (const [k, v] of Object.entries(m).sort((a, z) => z[1] - a[1]).slice(0, 12)) console.log(`  ${v}  ${k}`);
  }
});
