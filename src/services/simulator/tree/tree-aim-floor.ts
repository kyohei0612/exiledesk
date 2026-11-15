/**
 * tree-aim-floor.ts — 箱の見本の ☑ の狙い MOD を狙いの段の一番下で出す (S-200 ③、スイッチ aimFloor。11-16 オーナー「狙いMODも乱数でみなくてよくね？
 * 例えばP3以上を完成としてねらうならカードの表示名は狙いたいMODの際下限でいいんじゃねって思うけど…」、ブラック 117 経由)。
 * 代表は重い枝から選ぶので、同じ狙いの当たりでも箱ごとに段が違った (P1 と P3)。代表の品の、その手で新しく付いた狙いの MOD を、狙いの段以上で
 * アイテムレベルで付く一番低い段 (値は段の下限) に替える。箱の鍵は狙いの有無だけで段を見ないので、箱の分け・枠の比べは変わらない。
 * 下に削減 (MOD レベル)・目標を決めた神 (値) の手がある箱は替えない、エッセンス / 合金の手があればその同格以上の比べ (S-33e) の相手の系統の狙いだけ替えない
 * (その手の結果が段で変わる)。
 * 見本の見た目と下の手の数え上げの元だけで、100 人回し (本当の乱数) は frames を読まない
 */
import { familiesOf, isCraftedSource, makeStageMod, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { essenceTarget, isInfiniteEssence } from "../../craft-stage/apply-essence";
import { flag } from "../../../web/release-flags";
import { subtree, type TreeDoc } from "./tree-model";
import { aimTargetOf } from "./tree-ele-any";
import { effectOf } from "./tree-hands";
import { isWhittleHand } from "./tree-whittle";
import { isDivineAim } from "./tree-divine";

/**
 * 箱 id とその下の手で、段で結果が変わる物: 削減 (MOD レベル)・目標を決めた神 (値) があれば all、エッセンス / 合金は同格以上の比べ (S-33e) の相手の系統だけ
 */
function tierSensitiveBelow(data: PatchData, doc: TreeDoc, id: string, item: StageItem): { all: boolean; fams: Set<string> } {
  const fams = new Set<string>();
  for (const x of subtree(doc, id)) {
    const h = doc.boxes[x]?.hand;
    if (!h) continue;
    if (isWhittleHand(h) || isDivineAim(h)) return { all: true, fams };
    if (effectOf(h.currency) !== "essence") continue;
    const t = isInfiniteEssence(h.currency) ? null : essenceTarget(data, item, h.currency);
    if (t) for (const f of familiesOf(t.mod)) fams.add(f);
  }
  return { all: false, fams };
}

/**
 * 箱 o の代表 item (元の箱の代表 from に手を当てた枝) の、☑ の狙い (aimed) の MOD で、その手で新しく付いた物を狙いの段の一番下へ替えた品。
 * 替える物が無い・替えない箱は null。「いずれかの元素耐性」(S-10h) は割り当てで数えるので替えない
 */
export function aimFloorItem(data: PatchData, doc: TreeDoc, o: string, from: StageItem, item: StageItem, aimed: ReadonlySet<string>): StageItem | null {
  if (!flag("aimFloor")) return null;
  const sens = tierSensitiveBelow(data, doc, o, item);
  if (sens.all) return null;
  const goals = (doc.memoAims ?? []).filter((a) => !a.anyEle && aimed.has(a.modId));
  if (!goals.length) return null;
  const had = new Set([...from.prefixes, ...from.suffixes].map((m) => `${m.modId}|${m.tierIndex}`));
  let changed = false;
  const floor = (m: StageMod): StageMod => {
    // ✦ で固めた狙いもそろえる (保存の例の古い段が残った、嘲笑の仮面の木の b13)。固めた印はそのまま
    if (m.crafted || m.unrevealed || m.desecrated || had.has(`${m.modId}|${m.tierIndex}`)) return m;
    const md = data.mods.get(m.modId), g = goals.find((a) => a.modId === m.modId);
    if (!md || !g || isCraftedSource(md.source) || familiesOf(md).some((f) => sens.fams.has(f))) return m;
    const lo = aimTargetOf(data, g).minTierIndex;
    let at = -1;
    for (let i = Math.max(0, lo); i < m.tierIndex; i++) if ((md.tiers[i]?.ilvl ?? Infinity) <= item.itemLevel) { at = i; break; }
    if (at < 0) return m;
    changed = true;
    const nm = makeStageMod(md, m.side, at, () => 0);
    return m.fractured ? { ...nm, fractured: true } : nm;
  };
  const out: StageItem = { ...item, prefixes: item.prefixes.map(floor), suffixes: item.suffixes.map(floor) };
  return changed ? out : null;
}
