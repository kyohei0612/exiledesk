/**
 * _tree-shelf-rune-probe.test.ts — 白い手袋に特別なルーンが打てるか (ツリーの棚に「特別なルーン」が出ず、エミュには出た 10-23 の見比べ)。並べるだけ
 *
 *   pnpm exec vitest run -c scripts/_tree-shelf-rune-probe.config.ts
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { freshItem, mulberry32, useReason } from "../src/services/craft-stage/engine";
import { startItemOf } from "../src/services/simulator/tree/tree-sample";
import { newTree } from "../src/services/simulator/tree/tree-model";

it("白い手袋とルーン", () => {
  const data = loadPatch();
  const fresh = freshItem(data, "Sirenscale Gloves", 82, "normal");
  const tree = startItemOf(data, newTree("Sirenscale Gloves", 82), mulberry32(1)).item;
  for (const [name, it] of [["freshItem", fresh], ["ツリーのスタート", tree]] as const) {
    console.log(`■ ${name}: ${it.rarity} ソケット ${it.sockets ?? "無し"}`);
    for (const k of ["rune:Serle's Triumph", "rune:Kolr's Hunt", "artificer"]) console.log(`  ${k}: ${useReason(data, it, k, []) ?? "打てる"}`);
  }
});
