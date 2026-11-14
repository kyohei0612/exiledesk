/**
 * tree-ele-any.ts — 「いずれかの元素耐性」の狙い (S-10h、スイッチ eleAny、11-15 オーナー「おｋ その形で作って」)。
 *
 * 一般の火・冷気・雷耐性のどれか 1 つが段以上で付けば当たり。2 つ・3 つ置いた時は違う元素で数える = 段の厳しい狙いから 1・2・3 番 (anyEle)、
 * n 番の狙いは段を満たす元素耐性が n 個あれば付いている (段が入れ子なので数えで組が決まる)。元素を決めた狙い (今までの狙い) の元素は数えない (eleSkip)。
 * 当たりの判定はエンジン (aimHits の札の anyEle・eleSkip、ジン)。ここは札を作る・番号を揃える・前の木を読み替えるだけ。
 * 名前の印 (S-60) は modId で持つので、「いずれか」の狙いの modId は火・冷気・雷の modId を 1 つずつ使う (札を分ける。置けるのは元素を決めた物と合わせて 3 つまで)。
 */
import { ANY_ELE_FAMILIES, anyEleIds, anyEleMod, tierIndexOf, type AimTarget, type PatchData } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";
import { tr } from "../../../i18n/lang";
import type { Aim, TreeDoc } from "./tree-model";

/** まとめる系統 (一般の火・冷気・雷耐性。全ての元素耐性・混沌・2 元素・冒涜・エッセンスの耐性は今のまま) = エンジンの物 */
export const ELE_FAMILIES = ANY_ELE_FAMILIES;
export const eleAnyOn = (): boolean => flag("eleAny");

/** 一般の火・冷気・雷耐性の MOD か (エンジンの anyEleMod) */
export const isEleMod = (data: PatchData, modId: string): boolean => anyEleMod(data, modId);
/** 同じ部位の一般の火・冷気・雷の modId (並びは火・冷気・雷、エンジンの anyEleIds) */
export const eleIdsOf = (data: PatchData, modId: string): string[] => anyEleIds(data, modId);

/** 「いずれか」の札 (エンジンの AimTarget に anyEle・eleSkip) */
export type EleTarget = AimTarget & { anyEle?: number; eleSkip?: readonly string[] };
interface EleAimLike { modId: string; tier: number; anyEle?: number; eleSkip?: readonly string[] }
/** 狙い → エンジンの札 (段の番号。「いずれか」なら番号と数えない系統も)。tier を渡すとその段で */
export function aimTargetOf(data: PatchData, a: EleAimLike, tier = a.tier): EleTarget {
  const t: EleTarget = { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, tier) };
  if (!a.anyEle) return t;
  t.anyEle = a.anyEle;
  if (a.eleSkip?.length) t.eleSkip = a.eleSkip;
  return t;
}

const noEle = <A extends EleAimLike>(a: A): A => { if (a.anyEle == null && a.eleSkip == null) return a; const { anyEle: _n, eleSkip: _s, ...r } = a; return r as A; };
/**
 * 完成形の狙いの「いずれか」を揃える: 札の modId (前からの物はそのまま、新しい物は空いた元素へ。空きが無い物は外す)・番号 (段の厳しい順、同じ段は火・冷気・雷の順)・
 * 数えない系統 (元素を決めた狙いの系統)。「いずれか」が無ければそのまま
 */
export function tidyGoals(data: PatchData, goals: readonly Aim[]): Aim[] {
  const any = goals.filter((a) => a.anyEle);
  if (!any.length) return goals.map(noEle);
  const plain = goals.filter((a) => !a.anyEle && a.via !== "desecrated" && isEleMod(data, a.modId));
  const skip = [...new Set(plain.map((a) => data.mods.get(a.modId)!.family))];
  const used = new Set(plain.map((a) => a.modId)), idOf = new Map<Aim, string>();
  for (const a of any) if (isEleMod(data, a.modId) && !used.has(a.modId)) { idOf.set(a, a.modId); used.add(a.modId); }
  for (const a of any) if (!idOf.has(a)) { const free = eleIdsOf(data, a.modId).find((id) => !used.has(id)); if (free) { idOf.set(a, free); used.add(free); } }
  const famIx = (a: Aim): number => ELE_FAMILIES.indexOf(data.mods.get(idOf.get(a)!)?.family ?? "");
  const order = [...idOf.keys()].sort((x, y) => x.tier - y.tier || famIx(x) - famIx(y));
  const rank = new Map(order.map((a, i) => [a, i + 1]));
  return goals.filter((a) => !a.anyEle || idOf.has(a)).map((a) => {
    if (!a.anyEle) return noEle(a);
    const { eleSkip: _s, ...r } = a;
    return { ...r, modId: idOf.get(a)!, anyEle: rank.get(a)!, ...(skip.length ? { eleSkip: skip } : {}) };
  });
}

/** 木の中の狙いの形の物 (modId と段の T を持つ物。アイテムの MOD は tierIndex なので入らない) を全部 */
function eachAim(x: unknown, f: (a: EleAimLike & Record<string, unknown>) => void, seen = new Set<unknown>()): void {
  if (!x || typeof x !== "object" || seen.has(x)) return;
  seen.add(x);
  if (Array.isArray(x)) { for (const v of x) eachAim(v, f, seen); return; }
  const o = x as Record<string, unknown>;
  if (typeof o.modId === "string" && typeof o.tier === "number") f(o as EleAimLike & Record<string, unknown>);
  for (const [k, v] of Object.entries(o)) if (k !== "examples" && k !== "built") eachAim(v, f, seen);
}
/** 完成形の「いずれか」の番号・数えない系統を木の中の同じ札 (手の ☑・残したい MOD・当たりの箱) へ写す。完成形の「いずれか」で無くなった元素の札は印を外す */
function syncAims(data: PatchData, d: TreeDoc): void {
  const goals = d.memoAims ?? [], byId = new Map(goals.filter((a) => a.anyEle).map((a) => [a.modId, a]));
  const { memoAims: _m, ...rest } = d;
  eachAim(rest, (a) => {
    const g = byId.get(a.modId);
    if (g) { a.anyEle = g.anyEle; if (g.eleSkip?.length) a.eleSkip = [...g.eleSkip]; else delete a.eleSkip; return; }
    if (a.anyEle != null || a.eleSkip != null) { delete a.anyEle; delete a.eleSkip; }
  });
  void data;
}

/** 開いている所がデイリーか (お題の木は読み替えない、S-10h ④。お題の狙いはデイリー部長と決める) */
let dailyNow: () => boolean = () => false;
export const setEleAnyDaily = (f: () => boolean): void => { dailyNow = f; };

/**
 * 前の木の読み替え (S-10h ④ = オーナー「Aだね」): 印 eleAny の無い木の、完成形の一般の火・冷気・雷の狙い (✦ と冒涜で付ける物は除く) と、
 * 木の中の同じ札を「いずれかの元素耐性」にする (段はそのまま、数は元素の数)。印を付けて返す (渡した物は書き換えない)。スイッチ・デイリーの時はそのまま
 */
export function readEleAny<D extends TreeDoc>(data: PatchData, src: D): D {
  if (!eleAnyOn() || src.eleAny || dailyNow()) return src;
  const d = JSON.parse(JSON.stringify(src)) as D;
  d.eleAny = 1;
  const conv = new Set((d.memoAims ?? []).filter((a) => !a.fractured && a.via !== "desecrated" && isEleMod(data, a.modId)).map((a) => a.modId));
  if (!conv.size) return d;
  eachAim(d, (a) => { if (conv.has(a.modId)) a.anyEle = 1; });
  d.memoAims = tidyGoals(data, d.memoAims ?? []);
  syncAims(data, d);
  return d;
}
/**
 * 木を変えた後に揃える (use-tree の edit): 印の無い木は読み替え (新しい木は狙いが無いので印だけ付く)、印のある木は完成形の「いずれか」を揃えて木の中へ写す。
 * 書き換えるのは d そのもの
 */
export function tidyEleAny(data: PatchData, d: TreeDoc): void {
  if (!eleAnyOn() || dailyNow()) return;
  if (!d.eleAny) { const r = readEleAny(data, d); for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k]; Object.assign(d, r); return; }
  if (!(d.memoAims ?? []).some((a) => a.anyEle) && !JSON.stringify(d.boxes).includes("\"anyEle\"")) return;
  d.memoAims = tidyGoals(data, d.memoAims ?? []);
  syncAims(data, d);
}

/** 狙いの文の元素の語を「いずれかの元素耐性」に (「火耐性 (41-45)%」→「いずれかの元素耐性 (41-45)%」、英語は "to Fire Resistance" → "to any Elemental Resistance")。S-10h ③ */
export const eleAnyText = (text: string, n = 1): string =>
  text.replace(/(火|冷気|雷)耐性/, "いずれかの元素耐性").replace(/(Fire|Cold|Lightning) Resistance/, "any Elemental Resistance") + (n > 1 ? tr(` (${n} つ目)`, ` (#${n})`) : "");

/**
 * 手の窓の ☑ の候補の「いずれか」は、まだ付いていない一番小さい番号から、その手で付く数まで (S-10h ②。偉大な高貴なら 2 つ目まで、置いた本数が上限)。
 * n 番は n−1 番の後でしか付かないので、それより上の番号の箱は見本が作れない (白からの錬金で 2 番だけの当たりの箱が「MOD なし」になった)。
 * 2 つとも付いた人は「2 つとも付いた」の箱 (S-22d)
 */
export function nextEleOnly<A extends { anyEle?: number }>(open: readonly A[], adds = 1): A[] {
  const ns = open.filter((a) => a.anyEle).map((a) => a.anyEle!);
  if (!ns.length) return [...open];
  const lo = Math.min(...ns), hi = lo + Math.max(1, adds) - 1;
  return open.filter((a) => !a.anyEle || a.anyEle <= hi);
}
