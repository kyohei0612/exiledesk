/**
 * tree-whittle-marks.ts — 削減の手前の枠 (S-65c ⑧、11-10 オーナーの選び「案4」) の箱のカードの印:
 * 比べる相手 (外れ以外で一番 MOD レベルの低い消せる MOD) の行に「比べる相手」、外れ MOD (外れのうち一番低い物) の行の後ろに ▼ MOD レベルが低い / ＝ 同じ / ▲ 高い。
 * どの行かは表示する品の MOD レベル (エンジンの whittleLevel) と外れの式 (aimedMiss) で、組の字は箱の鍵 (l:) から
 */
import { whittleLevel, type PatchData, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { frameOfDoc } from "../../../services/simulator/tree/tree-frame";
import { sampleAimed } from "../../../services/simulator/tree/tree-judge";
import { isMissMod } from "../../../services/simulator/tree/tree-miss";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { lvPart, type LvClass } from "../../../services/simulator/tree/tree-whittle";
import { headBands } from "../../../services/simulator/tree/tree-band";
import { frameHandOf, whittleCompare } from "../../../services/simulator/tree/tree-whittle-scene";
import { tr } from "../../../i18n/lang";

/** 組の色 (r,g,b): 低い = 緑・同じ = 金黄・高い = 紅 (今の外れの赤橙と分ける、見比べ 11-10) と字 */
const LOOK: Record<LvClass, { rgb: string; ja: string; en: string; tja: string; ten: string }> = {
  // 字は「MOD レベルが」を付ける (11-10 オーナー「中の高い低いはMODレベル高いとか低いって出してあげたいね」。枠の上の題はそのまま)
  lo: { rgb: "122,196,132", ja: "▼ MOD レベルが低い", en: "▼ lower mod level", tja: "外れの MOD レベルが比べる相手より低い = 次の削減で外れが消える", ten: "The miss mod level is lower than the compared mod: whittling removes the miss" },
  eq: { rgb: "226,190,96", ja: "＝ 同じ MOD レベル", en: "= same mod level", tja: "外れの MOD レベルが比べる相手と同じ = 次の削減は外れか比べる相手が半々で消える", ten: "Same mod level as the compared mod: whittling removes either, half and half" },
  hi: { rgb: "214,72,110", ja: "▲ 残す MOD より高い MOD レベル", en: "▲ higher mod level", tja: "外れの MOD レベルが比べる相手より高い = 次の削減で比べる相手 (残したい MOD) が消える", ten: "The miss mod level is higher: whittling removes the compared mod (a mod to keep)" },
};

/** 組の色と字 (箱の下の帯も同じ色、S-65c ⑫) */
export const lvLook = (c: LvClass): (typeof LOOK)[LvClass] => LOOK[c];

/** 箱 id のカードの札 tags に、削減の手前の枠の印を足した物 (枠の箱でなければ tags のまま) */
export function lvRowTags(data: PatchData, doc: TreeDoc, id: string, item: StageItem | null, tags: Map<string, RowTag>, viaSeen = false): Map<string, RowTag> {
  const c = lvPart(doc.boxes[id]?.junkKey);
  // 打たない枠のハズレ (S-39 ②b): 品は枠の箱のまま (手を使わない) なので、枠の箱の札をそのまま出す (帯の頭の「枝へ」ではなく組の札)
  const up = doc.boxes[id]?.parent;
  if (!c && doc.boxes[id]?.seen && up && lvPart(doc.boxes[up]?.junkKey)) return lvRowTags(data, doc, up, item, tags, true);
  if (!c || !item) return tags;
  // 削減の手は枠の組の手 (手の無い兄弟の枠も)、比べるのはその手で消える側だけ = 枠を作る・回す時と同じ (tree-whittle-scene)
  const f = frameOfDoc(data, doc).frames.get(id), aimed = f && !f.note ? f.aimed : sampleAimed(data, doc, id, 1), { miss, side } = whittleCompare(data, doc, frameHandOf(doc, id), aimed, item);
  const loose = [...item.prefixes, ...item.suffixes].filter((m) => !m.fractured && (!side || m.side === side));
  const low = (l: StageMod[]): StageMod | undefined => l.reduce<StageMod | undefined>((a, m) => (!a || whittleLevel(m) < whittleLevel(a) ? m : a), undefined);
  const junk = low(loose.filter((m) => isMissMod(m, miss))), want = low(loose.filter((m) => !isMissMod(m, miss)));
  if (!junk || !want) return tags;
  const out = new Map(tags), L = LOOK[c];
  const jt = out.get(junk.modId) ?? { text: tr("外れ MOD", "Miss mod"), tone: "bad" as const, replace: true };
  // 帯で見せる「MOD レベルごとの設定」の箱 (S-65c ⑫) は、外れの MOD レベルが帯ごとに分かれるので組の字でなく「MOD レベルごとの枝へ」
  // (11-11 オーナー「今カオス削減打つ枠に低いレベルってなってるけどここはMODLv事の枝へって表記でおｋ」。結果の箱・打たない枠のハズレの札はそのまま)
  const head = !viaSeen && headBands(doc, id).length > 1;
  out.set(junk.modId, { ...jt, after: head
    ? { text: tr("MOD レベルごとの枝へ", "Split by mod level"), rgb: "214,190,140", title: tr("この外れの MOD レベルは人ごとに違うので、下の帯 (低い・同じ・高い) ごとの枝へ分かれる", "This miss's mod level differs per run, so it splits into the bands below (lower / same / higher)") }
    : { text: tr(L.ja, L.en), rgb: L.rgb, title: tr(L.tja, L.ten) } });
  // 比べる相手は名前の行のまま、後ろに小さな札 (今の札があればそれを残す)
  const wantKey = want.modId;
  if (out.get(wantKey) === undefined) out.set(wantKey, { text: tr("比べる相手", "Compared"), tone: "info", title: tr("外れ以外で MOD レベルが一番低い MOD (削減で次に消える物)。外れ MOD の ▼ ＝ ▲ はこれと比べた", "The lowest-level mod other than the miss (the next to go with whittling). The miss's ▼ = ▲ compares with this") });
  return out;
}
