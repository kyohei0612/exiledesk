/**
 * _tree-quality-probe.test.ts — 品質だけ上げる手 (カタリスト、結果の箱無しの通り抜け pass) を白紙から組んで、見本・精査・100 人回しを並べる台本 (2026-10-22 シミュ部長 6 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-quality-probe.config.ts   (DUMP=<パス> で組んだ木を整列して JSON に書く = 開発版の localStorage exiledesk.tree.v0 に入れて画面で見る用)
 *
 * 組む形 (画面で人が組むのと同じ setHand / setAim / setDone の順): 始まり (金の指輪、スペルダメージ T2 のフラクチャー + 乱数 1 つ) →
 * カオスを当たるまで (キャストスピード T2+ / 全耐性 T2+。全耐性が先なら始めに戻ってもう一度) → トゥルのカタリスト (品質を最大まで) → 通り抜け → 触媒 + 右側の高貴のお告げ + 完全の高貴 (全耐性 T2+) →
 * 当たり = 完成 / 外れ → 消去 → 外れが消えた (自動で通り抜けの上の箱へ) / 狙いが消えた (始めに戻る)。合否は付けない (並べるだけ。見張りではない)
 */
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { sampleOf } from "../src/services/simulator/tree/tree-sample";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { runTree } from "../src/services/simulator/tree/tree-run";
import { effectOf } from "../src/services/craft-stage/engine-sim";
import { kindOfHand, newTree, setAim, setDone, setHand, tidy, type Aim, type Hand } from "../src/services/simulator/tree/tree-model";

const data = loadPatch();
const hand = (currency: string, omens: string[] = [], extra: Partial<Hand> = {}): Hand => ({ currency, omens, catalyst: null, quality: 0, ...extra });
const put = (d: ReturnType<typeof newTree>, id: string, h: Hand, aims: Aim[] = []): string[] => { setHand(d, id, h, kindOfHand(h, effectOf(h.currency)), aims); return d.boxes[id]!.outs; };

it("品質だけ上げる手", () => {
  const C: Aim = { modId: "Rings/IncreasedCastSpeed", tier: 2 }, A: Aim = { modId: "Rings/AllResistances", tier: 2 };
  const d = newTree("Gold Ring", 82);
  d.fracture = { modId: "Rings/Special_genesis_tree_caster_SpellDamage", tier: 2 };
  d.startRandom = 1;
  const [hc, ha] = put(d, "start", hand("chaos", [], { repeat: { until: "hit", max: null } }), [C, A]);
  d.boxes[ha!]!.back = "start";
  const [pass] = put(d, hc!, hand("catalyst_cold"));
  const outs = put(d, pass!, hand("exalt_perfect", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]));
  const hit = outs.find((o) => d.boxes[o]!.out === "hit")!, junk = outs.find((o) => d.boxes[o]!.out === "junk")!;
  setAim(d, hit, A);
  setDone(d, hit, "main");
  const [gone, lost] = put(d, junk, hand("annul"));
  console.log("箱", Object.values(d.boxes).map((b) => `${b.id}:${b.out}${b.back ? `→${b.back}` : ""}`).join(" "));
  console.log(`外れが消えた ${gone} の戻り先 ${d.boxes[gone!]!.back} (通り抜けの上 = ${hc})、狙いが消えた ${lost} → ${d.boxes[lost!]!.back}`);
  for (const id of Object.keys(d.boxes)) {
    const s = sampleOf(data, d, id, 1);
    console.log(`${id.padEnd(4)} ${d.boxes[id]!.out.padEnd(8)} ${s.note ?? "ok"} 品質 ${s.item.quality}% ${s.item.qualityTag ?? "-"}  ${[...s.item.prefixes, ...s.item.suffixes].map((m) => `${m.modId.replace("Rings/", "")} ${m.tierName}`).join(", ")}`);
  }
  const issues = checkTree(data, d);
  console.log(`精査 穴 ${issues.length}`);
  for (const x of issues) console.log(`  ! ${x.boxId} ${x.kind} ${x.text}`);
  const r = runTree(data, d, { n: 100, seed: 1, price: () => 0 });
  console.log(`100 人: 完成 ${r.finished} · 打ち止め ${r.capped} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
  if (process.env.DUMP) { tidy(d); writeFileSync(process.env.DUMP, JSON.stringify(d)); }
});
