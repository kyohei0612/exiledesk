/**
 * _tree-autolink-probe.test.ts — 白紙から手を付けた時の「同じ中身の箱へ自動でつなぐ」の行き先を並べる台本 (2026-10-22 シミュ部長 8 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-autolink-probe.config.ts
 *
 * 金の指輪のサフィックス (見本と同じ狙い) を、画面の pickHand と同じ口 (tree-hand-plan の onlyOf → applyPick) で組み、結果の箱ごとの戻り先と印を出す。並べるだけ (見張りではない)。
 * 11-07 に今の判定へ直した: 前は setHand → tree-shape の linkSameShape (形の鍵 = 道の狙いの組 + 外れの有無) を呼んでいたが、形の鍵の判定は旧い判定と一緒に消えた (11-07)。
 * 今のつなぎは applyPick の中 (箱どうしの判定 tree-judge の judgeMemo で linkByContent・mergeOpenSame・pruneByContent・foldAround) なので、それをそのまま通す。
 * 今の木は完成形 (memoAims) から組むので、白紙の後に完成形の 3 つを入れる (前は完成形の無い木で、狙いでない MOD を外れに数える式が無かった)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { craftStage } from "../src/state/craft-stage";
import { kindOfHand, newTree, startRarity, type Aim, type Hand, type HandKind, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { toggleMemoAim } from "../src/services/simulator/tree/tree-memo";
import { effectOf } from "../src/services/simulator/tree/tree-hands";
import { applyPick, onlyOf } from "../src/views/simulator/tree/tree-hand-plan";
import { judgeMemo } from "../src/services/simulator/tree/tree-judge";
import { frameOfDoc } from "../src/services/simulator/tree/tree-frame";

const A = { R: { modId: "Rings/ItemFoundRarityIncrease", tier: 1 }, C: { modId: "Rings/IncreasedCastSpeed", tier: 2 }, A: { modId: "Rings/AllResistances", tier: 2 } };
const hand = (currency: string, omens: string[] = [], extra: Partial<Hand> = {}): Hand => ({ currency, omens, catalyst: null, quality: 0, ...extra });
/** 画面の pickHand と同じ: 起こりうる結果 (onlyOf) を出して applyPick (つなぎ・まとめ・見直しは中で回る) */
function pick(d: TreeDoc, id: string, h: Hand, _kind: HandKind, aims: Aim[] = []): void {
  const data = craftStage.data.value!;
  applyPick(d, id, h, kindOfHand(h, effectOf(h.currency)), aims, null, onlyOf(data, d, id, h, null, aims));
}
const kid = (d: TreeDoc, id: string, out: string, aim?: Aim): string | undefined => d.boxes[id]?.outs.find((o) => d.boxes[o]!.out === out && (!aim || d.boxes[o]!.aim?.modId === aim.modId));
const name = (d: TreeDoc, id: string | null | undefined): string => {
  if (!id) return "—";
  const b = d.boxes[id];
  if (!b) return id;
  const path: string[] = [];
  for (let x: string | null = id; x; x = d.boxes[x]!.parent) { const c = d.boxes[x]!; path.unshift(c.out === "hit" && c.aim ? c.aim.modId.split("/")[1]!.slice(0, 8) : c.out); }
  return `${id}(${path.join(">")})${b.autoBack ? " [自動]" : ""}`;
};

it("白紙から組んだ時の自動のつなぎ", () => {
  craftStage.data.value = loadPatch();
  const d = newTree("Gold Ring", 82);
  for (const a of [A.R, A.C, A.A]) toggleMemoAim(d, a);
  const PLAIN = hand("exalt_greater", ["OmenofDextralExaltation"]);
  const step = (label: string, id: string | undefined, h: Hand, kind: HandKind, aims: Aim[] = []): void => {
    if (!id || !d.boxes[id]) { console.log(`${label}: 箱が無い (前の手の結果に無かった) ので飛ばした`); return; }
    if (d.boxes[id]!.back) { console.log(`${label}: ${name(d, id)} は自動で ${name(d, d.boxes[id]!.back)} へつながったので手を置かない`); return; }
    pick(d, id, h, kind, aims);
  };
  // 今の白紙のスタートは白 (印も足した MOD も無い木、tree-model の startRarity。前の白紙はレアで、そのままカオスを打てた)。
  // 始まりの形 (TreeStartPick の＋) で外れ 2 つ (ライフ T5・火耐性 T5) を足したレアにする (錬金から始めると、錬金の枝が多すぎて配置が出ず、下の箱の中身が全部「分からない」になる)
  d.start = { rarity: "rare", mods: [{ modId: "Rings/IncreasedLife", tier: 5 }, { modId: "Rings/FireResistance", tier: 5 }] };
  d.start.rarity = startRarity(d);
  const s0 = "start";
  step("スタート → カオス当たるまで", s0, hand("chaos", [], { repeat: { until: "hit", max: null } }), "spam", [A.R, A.C, A.A]);
  const sC = kid(d, s0, "hit", A.C), sA = kid(d, s0, "hit", A.A);
  step("キャスト → 高貴", sC, PLAIN, "add", [A.R, A.A]);              // 当たり R / A・外れ
  const jC = sC ? kid(d, sC, "junk") : undefined;
  step("外れ → 消去", jC, hand("annul"), "remove");                    // 外れが消えた / 狙いが消えた
  const ca = sC ? kid(d, sC, "hit", A.A) : undefined;
  step("全耐性 → 高貴", sA, PLAIN, "add", [A.R, A.C]);                 // C が付くと ca と同じ中身
  step("狙い 2 → 高貴", ca, PLAIN, "add", [A.R]);                      // 外れ = 狙い 2 + 外れ
  const jCA = ca ? kid(d, ca, "junk") : undefined;
  step("狙い 2 + 外れ → 消去", jCA, hand("annul"), "remove");          // 1 つ消えたら 狙い 1 + 外れ の箱 (jC) へ
  // 結果の箱ごとに: 戻り先 (無ければ 手 / 未設定) と、判定 (judgeMemo) が比べる中身の鍵。同じ鍵の箱どうしが自動でつながる・まとまる相手
  // 中身が分からない箱は配置 (tree-frame) の訳も (tooMany = 枝が多すぎる手の下、nobranch = 行く枝が無い、split = 分かれ目の下)。分からない箱どうしはつながらない
  const j = judgeMemo(craftStage.data.value!, d), fr = frameOfDoc(craftStage.data.value!, d).frames;
  for (const b of Object.values(d.boxes)) {
    const to = b.back ? `→ ${name(d, b.back)}` : b.hand ? `手 ${b.hand.currency}` : "未設定";
    const c = j.contents(b.id);
    console.log(`${name(d, b.id).padEnd(52)} ${to.padEnd(40)} 中身 ${c ? [...c].join(" / ") : `(分からない: 配置 ${fr.get(b.id)?.note ?? "無し"})`}`);
  }
});
