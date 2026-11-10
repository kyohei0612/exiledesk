/**
 * tree-whittle-marks.ts — 削減の手前の枠 (S-65c ⑧、11-10 オーナーの選び「案4」) の箱のカードの印:
 * 比べる相手 (外れ以外で一番 MOD レベルの低い消せる MOD) の行に「比べる相手」、外れ MOD (外れのうち一番低い物) の行の後ろに ▼ 低い / ＝ 同じ / ▲ 高い。
 * どの行かは表示する品の MOD レベル (エンジンの whittleLevel) と外れの式 (aimedMiss) で、組の字は箱の鍵 (l:) から
 */
import { whittleLevel, type PatchData, type StageItem, type StageMod } from "../../../services/craft-stage/engine";
import type { RowTag } from "../../../components/for-share/item/stage-item-row-tag";
import { frameOfDoc } from "../../../services/simulator/tree/tree-frame";
import { sampleAimed } from "../../../services/simulator/tree/tree-judge";
import { aimedMiss, isMissMod } from "../../../services/simulator/tree/tree-miss";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { lvPart, type LvClass } from "../../../services/simulator/tree/tree-whittle";
import { tr } from "../../../i18n/lang";

/** 組の色 (r,g,b): 低い = 緑・同じ = 金黄・高い = 紅 (今の外れの赤橙と分ける、見比べ 11-10) と字 */
const LOOK: Record<LvClass, { rgb: string; ja: string; en: string; tja: string; ten: string }> = {
  lo: { rgb: "122,196,132", ja: "▼ 低い", en: "▼ lower", tja: "外れの MOD レベルが比べる相手より低い = 次の削減で外れが消える", ten: "The miss mod level is lower than the compared mod: whittling removes the miss" },
  eq: { rgb: "226,190,96", ja: "＝ 同じ", en: "= same", tja: "外れの MOD レベルが比べる相手と同じ = 次の削減は外れか比べる相手が半々で消える", ten: "Same mod level as the compared mod: whittling removes either, half and half" },
  hi: { rgb: "214,72,110", ja: "▲ 高い", en: "▲ higher", tja: "外れの MOD レベルが比べる相手より高い = 次の削減で比べる相手 (残したい MOD) が消える", ten: "The miss mod level is higher: whittling removes the compared mod (a mod to keep)" },
};

/** 箱 id のカードの札 tags に、削減の手前の枠の印を足した物 (枠の箱でなければ tags のまま) */
export function lvRowTags(data: PatchData, doc: TreeDoc, id: string, item: StageItem | null, tags: Map<string, RowTag>): Map<string, RowTag> {
  const c = lvPart(doc.boxes[id]?.junkKey);
  if (!c || !item) return tags;
  const f = frameOfDoc(data, doc).frames.get(id), aimed = f && !f.note ? f.aimed : sampleAimed(data, doc, id, 1), miss = aimedMiss(data, doc, aimed);
  const loose = [...item.prefixes, ...item.suffixes].filter((m) => !m.fractured);
  const low = (l: StageMod[]): StageMod | undefined => l.reduce<StageMod | undefined>((a, m) => (!a || whittleLevel(m) < whittleLevel(a) ? m : a), undefined);
  const junk = low(loose.filter((m) => isMissMod(m, miss))), want = low(loose.filter((m) => !isMissMod(m, miss)));
  if (!junk || !want) return tags;
  const out = new Map(tags), L = LOOK[c];
  const jt = out.get(junk.modId) ?? { text: tr("外れ MOD", "Miss mod"), tone: "bad" as const, replace: true };
  out.set(junk.modId, { ...jt, after: { text: tr(L.ja, L.en), rgb: L.rgb, title: tr(L.tja, L.ten) } });
  // 比べる相手は名前の行のまま、後ろに小さな札 (今の札があればそれを残す)
  const wantKey = want.modId;
  if (out.get(wantKey) === undefined) out.set(wantKey, { text: tr("比べる相手", "Compared"), tone: "info", title: tr("外れ以外で MOD レベルが一番低い MOD (削減で次に消える物)。外れ MOD の ▼ ＝ ▲ はこれと比べた", "The lowest-level mod other than the miss (the next to go with whittling). The miss's ▼ = ▲ compares with this") });
  return out;
}
