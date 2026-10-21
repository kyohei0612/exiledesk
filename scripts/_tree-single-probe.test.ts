/**
 * _tree-single-probe.test.ts — 結果が 1 通りの手 (tree-sample の singleOutOf) を並べる台本 (2026-10-22 シミュ部長 7 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-single-probe.config.ts
 *
 * 1) 見本の木の手のある箱ごとに、singleOutOf (その箱の見本 8 つ × stepOutcomes の全部の枝) が何を返すか
 * 2) 見本の箱 (始まり・当たり 1 つ・外れ・サフィックス完成 d1・サフィ 3 + プレの外れ 1 の pJ・P2 の当たり・冒涜の外れ) に、カレンシー × お告げ 0〜1 枚で、
 *    結果が 1 通りになる手の一覧 (オーナー 10-22 の例「サフィ 3 MOD・プレ 1 MOD で左側の消去」= pJ の左側の消去)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { kindOf, OMEN_FOR } from "../src/services/craft-stage/engine";
import { sampleOf, singleOutOf } from "../src/services/simulator/tree/tree-sample";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

const CURRENCIES = ["transmute", "augment", "regal", "alch", "exalt", "exalt_greater", "exalt_perfect", "chaos", "chaos_greater", "chaos_perfect", "annul", "divine", "vaal", "fracturing", "desecrate", "essence:perfect:Rings/PerfectEssence_EssenceAbyss"];

it("結果が 1 通りの手", () => {
  const data = loadPatch();
  const doc = treeSample("gold-ring-suffix")!;
  for (const b of Object.values(doc.boxes)) {
    if (!b.hand) continue;
    const r = singleOutOf(data, doc, b.id, b.hand);
    console.log(`箱 ${b.id.padEnd(5)} ${b.hand.currency}+${b.hand.omens.join("+")} → ${r ? `${r.out}${r.aim ? " " + r.aim.modId : ""}` : "分かれる / 対象外"}`);
  }
  const found = new Map<string, string[]>();
  for (const id of ["start", "sR", "jR", "d1", "pJ", "pR", "pX"]) {
    const m = sampleOf(data, doc, id, 1).item;
    console.log(`見本 ${id}: プレ ${m.prefixes.map((x) => x.modId.split("/")[1] + (x.fractured ? "(F)" : "")).join(",")} / サフィ ${m.suffixes.length}`);
    for (const c of CURRENCIES) {
      const k = c.startsWith("essence:perfect") ? "essence_perfect" : kindOf(c);
      for (const om of [[], ...(OMEN_FOR[k] ?? []).map((o) => [o])]) {
        const r = singleOutOf(data, doc, id, { currency: c, omens: om, catalyst: null, quality: 0 });
        if (!r) continue;
        const key = `${c}${om.length ? "+" + om[0] : ""}`;
        found.set(key, [...(found.get(key) ?? []), `${id}:${r.out}`]);
      }
    }
  }
  for (const [k, v] of found) console.log(`1 通り ${k.padEnd(60)} ${v.join(" ")}`);
});
