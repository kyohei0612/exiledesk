/**
 * tree-held-use.ts — ヒネコラで持つ削減を枠ごとに 打つ / 打たない (S-39 ②b、スイッチ whittleBands。11-11 オーナー「削減カオスで色々選んで打つって決めた際に…
 * 打つOR打たないで決めてその決め事に応じた枠をだせばいいんじゃね」)。
 * 予見の箱が削減の手前の枠 (低い・同じ・高い) に分かれた時、枠の箱ごとに持つ削減の手を置き直す: 打つ = 手のまま、打たない = 手に noUse (結果は全部ハズレ、tree-foresee の foldMisses)
 */
import { reactive } from "vue";
import { craftStage } from "../../../state/craft-stage";
import { bandsOn } from "../../../services/simulator/tree/tree-band";
import { holdsAt } from "../../../services/simulator/tree/tree-foresee";
import { boxAims, clearHand, type Aim, type Hand, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { isWhittleHand, LV_ORDER, lvClassesOf, lvPart, type LvClass } from "../../../services/simulator/tree/tree-whittle";
import { sampleAimed } from "../../../services/simulator/tree/tree-judge";
import type { PatchData, StageItem } from "../../../services/craft-stage/engine";
import { frameHandOf, frameSiblings, whittleCompare } from "../../../services/simulator/tree/tree-whittle-scene";
import { applyPick, kindOf, onlyOf } from "./tree-hand-plan";

/** 枠ごとの 打つ / 打たない の欄に出す枠 (予見の箱が枠に分かれ、枠の組のどれかが削減を持つ時)。use = null は手の無い枠 */
export function heldUseRows(d: TreeDoc, id: string): Array<{ id: string; lv: LvClass; use: boolean | null }> {
  if (!bandsOn() || !holdsAt(d, id) || !lvPart(d.boxes[id]?.junkKey) || !isWhittleHand(frameHandOf(d, id))) return [];
  return frameSiblings(d, id).map((b) => ({ id: b.id, lv: lvPart(b.junkKey)!, use: b.hand ? !b.hand.noUse : null })).filter((r) => !!r.lv);
}

/** 枠の箱 id に、組の削減の手を 打つ (use) / 打たない で置き直す */
export function setHeldUse(d: TreeDoc, id: string, use: boolean): void {
  const data = craftStage.data.value, b = d.boxes[id], src = frameHandOf(d, id);
  if (!data || !b || !src) return;
  const h: Hand = JSON.parse(JSON.stringify(isWhittleHand(b.hand) ? b.hand : src)) as Hand;
  if (use) delete h.noUse; else h.noUse = true;
  // 当たりの札は組の削減の手の当たりの箱と同じ (打たない枠は全部ハズレにまとまるので形だけ)
  const holder = frameSiblings(d, id).find((x) => isWhittleHand(x.hand));
  const aims: Aim[] = (holder?.outs ?? []).flatMap((o) => (d.boxes[o]?.out === "hit" ? boxAims(d.boxes[o]!).map((a) => ({ ...a })) : []));
  if (b.hand) clearHand(d, id);
  applyPick(d, id, h, kindOf(h), aims, null, onlyOf(data, d, id, h, null, aims));
}

/** 枠の既定 (11-11 オーナー「同じなら未選択 高いなら打たないをデフォで」「(低いは) うつでおｋ」): 低い = 打つ、高い = 打たない、同じ = 未選択 (決めるまで未設定) */
const DEFAULT_USE: Partial<Record<LvClass, boolean>> = { lo: true, hi: false };
/**
 * 棚で持っている間の選び (神と同じ形、11-11 オーナー「もったらまた神みたいに。持ちながらいろいろチェック付けれたり」)。箱 id → 枠の組ごとの 打つ (true) / 打たない (false) / 未選択 (null)。
 * カードを押して手を置いた時 (fillHeldDefaults) に各枠へ当てて消す
 */
const pending = reactive(new Map<string, Partial<Record<LvClass, boolean | null>>>());
/** 持っている削減の手で、この予見の箱に出る枠の組と今の選び (予見の箱で削減を持つ時だけ。枠に分かれる前もデータで付きうる組を数える = tree-whittle の lvClassesOf) */
export function heldPickRows(data: PatchData, d: TreeDoc, id: string, item: StageItem, h: Hand): Array<{ lv: LvClass; use: boolean | null }> {
  if (!bandsOn() || !holdsAt(d, id) || !isWhittleHand(h)) return [];
  const now = heldUseRows(d, id), mine = pending.get(id) ?? {};
  let cls: LvClass[];
  if (now.length) cls = now.map((r) => r.lv);
  else { const { wanted, side } = whittleCompare(data, d, h, sampleAimed(data, d, id, 1), item); cls = [...(lvClassesOf(data, item, wanted, side) ?? [])]; }
  cls = LV_ORDER.filter((c) => cls.includes(c));
  if (cls.length < 2) return [];
  return cls.map((lv) => ({ lv, use: lv in mine ? mine[lv]! : now.find((r) => r.lv === lv)?.use ?? DEFAULT_USE[lv] ?? null }));
}
/** 持っている間に 打つ / 打たない を選ぶ */
export function setHeldPick(id: string, lv: LvClass, use: boolean): void { pending.set(id, { ...(pending.get(id) ?? {}), [lv]: use }); }
/** 窓を閉じた時: 置かずに閉じた選びは捨てる (置いた時は fillHeldDefaults が先に使う) */
export const dropHeldPick = (id: string): void => void pending.delete(id);
/** 窓を開いた時: もう枠に分かれていれば今の選びを持っている間の選びの始まりに (カードを押し直しても今の選びのまま) */
export function seedHeldPick(d: TreeDoc, id: string): void {
  if (pending.has(id)) return;
  const now = heldUseRows(d, id);
  if (now.length) pending.set(id, Object.fromEntries(now.map((r) => [r.lv, r.use])));
}
/** 削減を持った時: 持っている間の選び (無ければ既定) を各枠に入れる。未選択の枠は手の無いまま (決めるまで未設定) */
export function fillHeldDefaults(d: TreeDoc, id: string): void {
  const mine = pending.get(id) ?? {};
  pending.delete(id);
  for (const r of heldUseRows(d, id)) {
    const set = r.lv in mine, u = set ? mine[r.lv] : DEFAULT_USE[r.lv];
    if (u === undefined || u === null) continue;
    // 選んだ枠は選びどおりに、選んでいない枠は手の無い枠だけ既定 (手を置いた箱は手が付いたばかりなので、既定が打たないなら打たないに)
    if (set ? r.use !== u : r.use === null || (r.id === id && u === false && r.use)) setHeldUse(d, r.id, u);
  }
}
