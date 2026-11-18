/**
 * tree-aim-floor.ts — 箱の見本の ☑ の狙い MOD を狙いの段の一番下で出す (S-200 ③、スイッチ aimFloor。11-16 オーナー「狙いMODも乱数でみなくてよくね？
 * 例えばP3以上を完成としてねらうならカードの表示名は狙いたいMODの際下限でいいんじゃねって思うけど…」、ブラック 117 経由)。
 * 代表は重い枝から選ぶので、同じ狙いの当たりでも箱ごとに段が違った (P1 と P3)。代表の品の、その手で新しく付いた狙いの MOD を、狙いの段以上で
 * アイテムレベルで付く一番低い段 (値は段の下限) に替える。箱の鍵は狙いの有無だけで段を見ないので、箱の分け・枠の比べは変わらない。
 * 下に削減 (MOD レベル)・目標を決めた神 (値) の手がある箱は替えない、エッセンス / 合金の手があればその同格以上の比べ (S-33e) の相手の系統の狙いだけ替えない
 * (その手の結果が段で変わる)。
 * (スイッチ aimFloorVeil、11-19 オーナー「狙いMODのティア下限で出すルールを冒涜に適応」) 冒涜で付いた狙いもそろえ、置き石 (S-33h) は道の上の置き石の札の段で出す (削減があっても)。
 * 見本の見た目と下の手の数え上げの元だけで、100 人回し (本当の乱数) は frames を読まない
 */
import { familiesOf, isCraftedSource, makeStageMod, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { essenceTarget, isInfiniteEssence } from "../../craft-stage/apply-essence";
import { flag } from "../../../web/release-flags";
import { subtree, type Aim, type TreeDoc } from "./tree-model";
import { aimTargetOf } from "./tree-ele-any";
import { effectOf } from "./tree-hands";
import { isWhittleHand } from "./tree-whittle";
import { isDivineAim } from "./tree-divine";
import { sameAimMod } from "./tree-hand-core";

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

/** 箱 o から上の道の、置き石 (印 stone) の当たりの箱の札 (近い順) */
function stonesUp(doc: TreeDoc, o: string): Aim[] {
  const out: Aim[] = [];
  for (let x: string | null | undefined = o, n = 0; x && n < 500; x = doc.boxes[x]?.parent, n++) { const a = doc.boxes[x]?.aim; if (a?.stone && !a.anyEle) out.push(a); }
  return out;
}

/**
 * 箱 o の代表 item (元の箱の代表 from に手を当てた枝) の、☑ の狙い (aimed) の MOD で、その手で新しく付いた物を狙いの段の一番下へ替えた品。
 * 替える物が無い・替えない箱は null。「いずれかの元素耐性」(S-10h) は割り当てで数えるので替えない
 */
export function aimFloorItem(data: PatchData, doc: TreeDoc, o: string, from: StageItem, item: StageItem, aimed: ReadonlySet<string>): StageItem | null {
  if (!flag("aimFloor")) return null;
  const veil = flag("aimFloorVeil"), sens = tierSensitiveBelow(data, doc, o, item);
  // (S-200 ③、スイッチ aimFloorVeil) 冒涜・発現の窓で段を選んで置いた MOD (置き石 S-33h、完成形の狙いには数えない) は、道の上の置き石の当たりの箱の札の段の一番下。
  // 段はオーナーが選んだ物なので下に削減があっても替える (100 人回しは本当の乱数のまま)
  const stones = veil ? stonesUp(doc, o) : [];
  const goals = sens.all ? [] : (doc.memoAims ?? []).filter((a) => !a.anyEle && aimed.has(a.modId));
  if (!goals.length && !stones.length) return null;
  const had = new Set([...from.prefixes, ...from.suffixes].map((m) => `${m.modId}|${m.tierIndex}`));
  let changed = false;
  const floor = (m: StageMod): StageMod => {
    // ✦ で固めた狙いもそろえる (保存の例の古い段が残った、嘲笑の仮面の木の b13)。固めた印はそのまま
    if (m.crafted || m.unrevealed || (m.desecrated && !veil) || had.has(`${m.modId}|${m.tierIndex}`)) return m;
    // 冒涜で付いた狙いもそろえる (スイッチ aimFloorVeil)。置き石はその札の段で
    const md = data.mods.get(m.modId), st = m.desecrated ? stones.find((a) => sameAimMod(data, a, { modId: m.modId, tier: a.tier })) : undefined;
    const g = st ?? goals.find((a) => a.modId === m.modId);
    if (!md || !g || isCraftedSource(md.source) || (!st && familiesOf(md).some((f) => sens.fams.has(f)))) return m;
    const lo = aimTargetOf(data, g).minTierIndex;
    let at = -1;
    for (let i = Math.max(0, lo); i < m.tierIndex; i++) if ((md.tiers[i]?.ilvl ?? Infinity) <= item.itemLevel) { at = i; break; }
    if (at < 0) return m;
    changed = true;
    const nm = makeStageMod(md, m.side, at, () => 0);
    // 冒涜で付いた印も残す (落とすと鍵の #a が変わって替えられない)
    return m.fractured || m.desecrated ? { ...nm, ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}) } : nm;
  };
  const out: StageItem = { ...item, prefixes: item.prefixes.map(floor), suffixes: item.suffixes.map(floor) };
  return changed ? out : null;
}
