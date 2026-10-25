/**
 * _tree-autolink-probe.test.ts — 白紙から手を付けた時の「同じ形の箱へ自動でつなぐ」(tree-run の linkSameShape) の行き先を並べる台本 (2026-10-22 シミュ部長 8 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-autolink-probe.config.ts
 *
 * 金の指輪のサフィックス (見本と同じ狙い) を、画面の pickHand と同じ順 (setHand → linkSameShape(新しい箱)) で組み、結果の箱ごとの戻り先と印を出す。並べるだけ (見張りではない)
 */
import { it } from "vitest";
import { newTree, setHand, type Aim, type Hand, type HandKind, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { linkSameShape } from "../src/services/simulator/tree/tree-shape";

const A = { R: { modId: "Rings/ItemFoundRarityIncrease", tier: 1 }, C: { modId: "Rings/IncreasedCastSpeed", tier: 2 }, A: { modId: "Rings/AllResistances", tier: 2 } };
const hand = (currency: string, omens: string[] = [], extra: Partial<Hand> = {}): Hand => ({ currency, omens, catalyst: null, quality: 0, ...extra });
/** 画面の pickHand と同じ: 手を付け、新しくできた箱だけ自動でつなぐ */
function pick(d: TreeDoc, id: string, h: Hand, kind: HandKind, aims: Aim[] = []): void {
  const had = new Set(Object.keys(d.boxes));
  setHand(d, id, h, kind, aims);
  linkSameShape(d, Object.values(d.boxes).filter((b) => !had.has(b.id) || (!b.hand && !b.back && !b.done)).map((b) => b.id));
}
const kid = (d: TreeDoc, id: string, out: string, aim?: Aim): string => d.boxes[id]!.outs.find((o) => d.boxes[o]!.out === out && (!aim || d.boxes[o]!.aim?.modId === aim.modId))!;
const name = (d: TreeDoc, id: string | null): string => {
  if (!id) return "—";
  const b = d.boxes[id]!;
  const path: string[] = [];
  for (let x: string | null = id; x; x = d.boxes[x]!.parent) { const c = d.boxes[x]!; path.unshift(c.out === "hit" && c.aim ? c.aim.modId.split("/")[1]!.slice(0, 8) : c.out); }
  return `${id}(${path.join(">")})${b.autoBack ? " [自動]" : ""}`;
};

it("白紙から組んだ時の自動のつなぎ", () => {
  const d = newTree("Gold Ring", 82);
  const PLAIN = hand("exalt_greater", ["OmenofDextralExaltation"]);
  pick(d, "start", hand("chaos", [], { repeat: { until: "hit", max: null } }), "spam", [A.R, A.C, A.A]);
  const sC = kid(d, "start", "hit", A.C), sA = kid(d, "start", "hit", A.A);
  pick(d, sC, PLAIN, "add", [A.R, A.A]);                     // キャスト → 高貴: 当たり R / A・外れ
  const jC = kid(d, sC, "junk");
  pick(d, jC, hand("annul"), "remove");                       // 外れ → 消去: 外れが消えた / 狙いが消えた
  const ca = kid(d, sC, "hit", A.A);
  pick(d, sA, PLAIN, "add", [A.R, A.C]);                      // 全耐性 → 高貴: C が付くと ca と同じ形
  pick(d, ca, PLAIN, "add", [A.R]);                           // 狙い 2 → 高貴: 外れ = 狙い 2 + 外れ
  const jCA = kid(d, ca, "junk");
  pick(d, jCA, hand("annul"), "remove");                      // 狙い 2 + 外れ → 消去: 1 つ消えたら 狙い 1 + 外れ の箱 (jC) へ
  for (const b of Object.values(d.boxes)) if (b.back) console.log(`${name(d, b.id).padEnd(52)} → ${name(d, b.back)}`);
});
