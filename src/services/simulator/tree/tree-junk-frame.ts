/**
 * tree-junk-frame.ts — 箱の見本 (代表の品) の外れ MOD は枠 (側の空き) を埋めるだけ (S-200 ③、スイッチ junkFrameOnly、11-16 オーナー「いい案で色々試しに作って全対応できるようにさせてほしい」)。
 * 外れは木の狙いの族 (完成形の狙い・木の ☑ の狙い、E-11a の系統) を段の足りない形で取らない MOD にする (段を満たす物は狙いがもう付いた形なので残す。
 * 避けると下のフラクチャー ✦ などの当たりの枝が消えた、レビュワー 1 の 8): 代表を選ぶ時に族を取らない枝を先に、同じ枠に無ければ
 * 同じ手のほかの枝に出る族を取らない外れと差し替える。代表の外れが低い段の狙いの族 (筋力 T9 など) を取ると、その箱から先の窓で狙いが付けられず、
 * 次の手の当たりの枝も出なかった (要望 be6a50d0)。外れの族が後の狙いと重なる分は 100 人回し (1 人ずつ本物の品) だけに出る。箱の分け方・枝の数・回す人は変えない
 */
import { ANY_ELE_FAMILIES, familiesOf, isCraftedSource, occupiedFamiliesOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { boxAims, type Aim, type TreeBox, type TreeDoc } from "./tree-model";
import { isMissMod, missAims, type MissAims } from "./tree-miss";

/** 狙い 1 つの族。「いずれかの元素耐性」(S-10h) は札の 1 元素でなく 3 元素 (除いた元素は入れない) */
function aimFams(data: PatchData, a: Aim): readonly string[] {
  const e = a as Aim & { anyEle?: number; eleSkip?: readonly string[] };
  if (e.anyEle) return ANY_ELE_FAMILIES.filter((f) => !e.eleSkip?.includes(f));
  const md = data.mods.get(a.modId);
  return md ? occupiedFamiliesOf(md) : [];
}
/** 外れに取らせない族 (fams) と、段を満たすかの札 (miss = 木の狙いのどれにも当たらない MOD を外れとする式、tree-miss) */
export interface JunkGoal { fams: ReadonlySet<string>; miss: MissAims }
const GOALS = new WeakMap<TreeDoc, { k: string; g: JunkGoal }>();
/** 外れに取らせない族 = 完成形の狙いと木の ☑ の狙い (エッセンスの MOD は入れない = エッセンスで付く物は外れでない) */
export function goalFamilies(data: PatchData, doc: TreeDoc, aims: readonly Aim[]): JunkGoal {
  const all = [...(doc.memoAims ?? []), ...aims], k = [...new Set(all.map((a) => JSON.stringify([a.modId, (a as { anyEle?: number }).anyEle ?? 0, (a as { eleSkip?: readonly string[] }).eleSkip ?? []])))].sort().join(","), had = GOALS.get(doc);
  if (had?.k === k) return had.g;
  const g = { fams: new Set(all.flatMap((a) => aimFams(data, a))), miss: missAims(data, all) };
  GOALS.set(doc, { k, g });
  return g;
}
const famsOf = (data: PatchData, m: StageMod): readonly string[] => { const md = data.mods.get(m.modId); return md ? familiesOf(md) : []; };
/** その手で新しく付いた普通の MOD (前の品に無い・クラフト / エッセンスで付いた物と未発現を除く) */
function freshOf(data: PatchData, before: StageItem, after: StageItem): StageMod[] {
  const had = new Set([...before.prefixes, ...before.suffixes].map((m) => m.modId));
  return [...after.prefixes, ...after.suffixes].filter((m) => { const md = data.mods.get(m.modId); return !had.has(m.modId) && !m.unrevealed && !m.crafted && !!md && !isCraftedSource(md.source); });
}
/**
 * 箱 box の代表 after の外れのうち、木の狙いの族を取った物。当たりの箱はその箱の札の狙いの族は外れでないので許す。
 * 「エッセンスと同じ MOD」の箱 (blocked) は同じ系統を持つのが箱の中身なので見ない
 */
export function junkTaking(data: PatchData, box: TreeBox, before: StageItem, after: StageItem, g: JunkGoal): StageMod[] {
  if (!g.fams.size || box.out === "blocked") return [];
  const mine = new Set(box.out === "hit" ? boxAims(box).flatMap((a) => aimFams(data, a)) : []);
  return freshOf(data, before, after).filter((m) => famsOf(data, m).some((f) => g.fams.has(f) && !mine.has(f)) && isMissMod(m, g.miss));
}
/** 代表の外れが木の狙いの族を全く取らないか (段を満たす物も無い)。代表は先にこれを選ぶ = たまたま完成形を満たした品を代表にしない (王者の窓から抜けた、11-16 の絵) */
export function junkClean(data: PatchData, box: TreeBox, before: StageItem, after: StageItem, g: JunkGoal): boolean {
  if (!g.fams.size || box.out === "blocked") return true;
  const mine = new Set(box.out === "hit" ? boxAims(box).flatMap((a) => aimFams(data, a)) : []);
  return !freshOf(data, before, after).some((m) => famsOf(data, m).some((f) => g.fams.has(f) && !mine.has(f)));
}
/** 品 item に付いている普通の MOD のうち、木の狙いの族を段の足りない形で取った物があるか (↩・ほかの形で埋める代表・保存の例を後回しにする) */
export function itemTaking(data: PatchData, item: StageItem, g: JunkGoal | null): boolean {
  if (!g?.fams.size) return false;
  return freshOf(data, { ...item, prefixes: [], suffixes: [] }, item).some((m) => famsOf(data, m).some((f) => g.fams.has(f)) && isMissMod(m, g.miss));
}
/**
 * 代表 item の外れ bad を、同じ手のほかの枝 (pool) に新しく付いた同じ側の外れのうち、木の狙いの族を取らず品に無い系統の物と差し替えた品 (重い枝の順に選ぶ)。
 * 差し替えられない外れが 1 つでもあれば null
 */
export function swapJunk(data: PatchData, before: StageItem, item: StageItem, bad: readonly StageMod[], pool: readonly StageItem[], g: JunkGoal): StageItem | null {
  const fams = g.fams;
  let pre = [...item.prefixes], suf = [...item.suffixes];
  for (const b of bad) {
    const list = b.side === "prefix" ? pre : suf, held = new Set([...pre, ...suf].filter((m) => m !== b).flatMap((m) => famsOf(data, m)));
    let r: StageMod | undefined;
    for (const it of pool) { r = freshOf(data, before, it).find((m) => m.side === b.side && !famsOf(data, m).some((f) => fams.has(f) || held.has(f))); if (r) break; }
    if (!r) return null;
    const at = list.indexOf(b);
    if (at < 0) return null;
    list[at] = r;
    if (b.side === "prefix") pre = list; else suf = list;
  }
  swaps++;
  return { ...item, prefixes: pre, suffixes: suf };
}
/** 差し替えた数 (確かめの台本が読むだけ) */
let swaps = 0;
export const junkSwaps = (): number => swaps;
