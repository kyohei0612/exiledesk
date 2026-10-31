/**
 * tree-box-shape.ts — 箱の形を 1 つに (10-28 オーナー OK の対策 1、スイッチ boxShape)。
 * 形 = 狙いの組 (held、道の当たりの札 = tree-shape の heldSets) + 体 (body: 外れの側・種類・数、✦ の側、レアリティ)。
 * 自動のつなぎ・↩ 戻り (sameHandReturn・形の合う箱へ・消去の直線の止まり)・まとめる (統合・候補)・精査・回す時の行き先・猿の口 (見張り) が全部これを呼ぶ。
 * 前の別々の比べ (junkSig・boxSig・sigKinds・消去の直線の likeKey / frPart・applyPick の loose / mixed・hitLoose) はここへ寄せて消した
 */
import { craftedKindOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { sampleOf } from "./tree-sample";
import { heldSets, MATCH, RESTART, shapeFits } from "./tree-shape";
import type { TreeDoc } from "./tree-model";

/**
 * アイテムの体の鍵 (狙いの組以外の形)。
 * 側ごとに完成の狙いに無い MOD を 普通.クラフト (エッセンス).冒涜の発現済み.未発現 で数え (✦ は数えない)、✦ は側ごとに 狙いの ✦ / 外れの ✦ の数 (どの MOD かは見ない。
 * 10-28 オーナー「プレ 3 MOD どれがフラクチャーでも同一と扱う、サフィも同様、ただしプレとサフィは明確に別」)、最後にレアリティ。
 * 例 `1.0.0.1|0.0.0.0|✦g1j0.g0j0|rare`。スイッチ boxShape が閉じている間は前の外れの鍵 (`n.c.x|n.c.x`、10-27 夕 goalShape)
 */
export function bodyOf(data: PatchData, d: TreeDoc, it: StageItem, held?: ReadonlySet<string>, placed?: ReadonlySet<string>): string {
  const goals = new Set((d.memoAims ?? []).map((a) => a.modId));
  // held = その箱 (その人) が道で持っている狙いの MOD。渡すと、持っていない完成形の MOD は外れに数える (☑ の無い狙いは外れ、S-22・S-82。
  // 数えないと、カオスの外れの見本のうち完成形の MOD を引いた見本だけ体が変わり mixed になって、同じ形の箱へつながらなかった、10-28 夜オーナー「一緒のMODがふくすうあるけど認識されない」)
  // placed = 付いている置き石の MOD (完成形に無いが外れに数えない、S-33)
  const aim = (id: string): boolean => (goals.has(id) && (!held || held.has(id))) || !!placed?.has(id);
  const side = (ms: readonly StageMod[]): string => {
    let n = 0, c = 0, x = 0, u = 0;
    for (const m of ms) { if (m.fractured || aim(m.modId)) continue; if (m.unrevealed) u++; else if (m.desecrated || m.unrevealed) x++; else if (m.crafted || craftedKindOf(data, m)) c++; else n++; }
    return `${n}.${c}.${x}.${u}`;
  };
  const fr = (ms: readonly StageMod[]): string => { const f = ms.filter((m) => m.fractured); const g = f.filter((m) => goals.has(m.modId)).length; return `g${g}j${f.length - g}`; };
  return `${side(it.prefixes)}|${side(it.suffixes)}|✦${fr(it.prefixes)}.${fr(it.suffixes)}|${it.rarity}`;
}
/** 体の鍵の部分 (側ごとの外れ 2 つ・✦・レアリティ) */
const partsOf = (body: string): { p: number[]; s: number[]; fr: string; rarity: string } => {
  const [p = "", s = "", fr = "", rarity = ""] = body.split("|");
  return { p: p.split(".").map(Number), s: s.split(".").map(Number), fr, rarity };
};
/** ✦ の側とレアリティ (消せない・戻らない所。回す時の形の合う箱へで、これが違う箱へは行かない) */
export const bodyFixed = (body: string): string => { if (body.startsWith("mixed")) return ""; const { fr, rarity } = partsOf(body); return `${fr}|${rarity}`; };
/** 外れの種類があるかだけ (数・側は見ない)。回す時の 2 番目の比べと、見本ごとに種類が違う箱 (mixed) の見分け */
export const bodyKinds = (body: string): string => {
  if (body.startsWith("mixed")) return body;
  const { p, s } = partsOf(body), k = p.map((v, i) => ((v + (s[i] ?? 0)) > 0 ? 1 : 0));
  // スイッチ judgeOne: 外れは種類を見ない (普通・エッセンス・冒涜の発現済みは 1 つ)。種類が違う (mixed) のは未発現が混ざる時だけ (S-63、10-29 深夜オーナー「未発現のみ別枠として全然おｋ」)
  return `${k.slice(0, 3).some(Boolean) ? 1 : 0}${k[3] ?? 0}`;
};
/** 冒涜 (発現済み・未発現) の外れがあるか (mixed = 見本ごとに種類が違う箱も含める) */
export const hasDesecrated = (body: string | null): boolean => !!body && (body.startsWith("mixed") || [partsOf(body).p, partsOf(body).s].some((x) => (x[2] ?? 0) > 0 || (x[3] ?? 0) > 0));
/** 消去の直線の止まる所で比べる部分 (レアリティ (スイッチ stripRarity) と ✦ の側 (スイッチ boxShape)。外れの数は直線の段で数える、tree-outcome の stripStops) */
export const likeOf = (data: PatchData, d: TreeDoc, it: StageItem): string => `${it.rarity}|${partsOf(bodyOf(data, d, it)).fr}`;

/**
 * one = 見本 1 つだけ (回す時の「形の合う箱へ」の並べ替え。前の boxSig と同じで、見本 4 つの mixed にすると行き先が変わった、10-28 見張り)。
 * 箱の体 (見本から。作れない箱は null = 比べない)。見本 4 つで外れの種類が違う箱 (未発現の箱にカオスの外れ: 未発現が消えた人と残った人が同じ箱) は
 * `mixed:<id>` = どの箱とも同じにならない (片方の形の箱へつなぐと、もう片方の人がその箱の手を打てない。10-28 冒涜まわりの確かめ)。始まりは見本 1 つ
 */
/** 箱が道で持っている狙いの MOD (道の当たりの札の組の全部 + 始まりから付いている完成の狙い) */
export function heldOn(d: TreeDoc, id: string): Set<string> {
  const out = new Set<string>(heldSets(d, id).flat().map((k) => k.split("|")[0]!));
  const goals = new Set((d.memoAims ?? []).map((a) => a.modId));
  for (const m of d.start?.mods ?? []) if (goals.has(m.modId)) out.add(m.modId);
  return out;
}
/** 形の鍵 (tree-shape の shapeKey「modId|tier,…#外れ」) から持っている狙いの MOD */
export const heldOfKey = (key: string): Set<string> => new Set(key.split("#")[0]!.split(",").filter(Boolean).map((k) => k.split("|")[0]!));
export function boxBody(data: PatchData, d: TreeDoc, id: string, one = false): string | null {
  const s = sampleOf(data, d, id, 1);
  if (s.note === "none" || s.note?.startsWith("cant:")) return null;
  const held = heldOn(d, id);
  const body = bodyOf(data, d, s.item, held);
  if (id === "start" || one) return body;
  const kinds = new Set([body, ...[2, 3, 4].flatMap((k) => { const m = sampleOf(data, d, id, k); return m.note === "none" || m.note?.startsWith("cant:") ? [] : [bodyOf(data, d, m.item, held)]; })].map(bodyKinds));
  return kinds.size > 1 ? `mixed:${id}` : body;
}
/** 見本 4 つで体が揃わない箱 (外れの付く側・数が乱数で変わる)。精査の戻り先の比べでは分からない扱い (見本 1 つの側で偶然違って見えた、10-28 見本を道だけで決めた後のアミュ B b31・b32) */
export function bodyVaries(data: PatchData, d: TreeDoc, id: string): boolean {
  const held = heldOn(d, id);
  const bs = new Set([1, 2, 3, 4].flatMap((k) => { const m = sampleOf(data, d, id, k); return m.note === "none" || m.note?.startsWith("cant:") ? [] : [bodyOf(data, d, m.item, held)]; }));
  return bs.size > 1;
}
/** 箱の体を引く関数 (1 回の組み替え・精査の中で覚える。木を替えたら作り直す) */
export type BodyOf = (id: string) => string | null;
export function bodyMemo(data: PatchData, d: TreeDoc): BodyOf {
  const m = new Map<string, string | null>();
  return (id) => { if (!m.has(id)) m.set(id, boxBody(data, d, id)); return m.get(id)!; };
}
/**
 * 2 つの箱の体が同じか (分からない箱 = null は同じ扱い)。始まりへは体を比べない (始まりの手が外れも扱う、前から) が、冒涜を持つ箱は始まりへ行かない
 * (始まりに冒涜は無く、戻っても骨が打てない。10-28 冒涜まわりの確かめ)
 */
export function sameBody(body: BodyOf | undefined, from: string, to: string): boolean {
  if (!body) return true;
  // 始まりへも体 (レアリティ・外れの数) を比べる (マジックの外れ 1 つの箱が白のスタートへ戻った、10-28 夜オーナー「色々挙動があやしい」。スイッチ boxShape)
  const x = body(from), y = body(to);
  return x === null || y === null || x === y;
}
/**
 * 自動の ↩ (外れ・消えた・打った後の箱から前の箱へ) をつないでよいか: 体が両方分かって同じ時だけ (スイッチ bodyStrict。閉じている間は sameBody)。
 * 体が分からない箱 (見本が作れない・見本ごとに違う mixed) とはつながない (S-50、10-29 オーナーの木 FmNY7Wwv: 外れを 2 つ持ったまま始めの方のカオスへ戻り、
 * 当たりを経てサフィ満杯の箱で止まった。オーナー「おけ」= ブラック案 (a))。当たりの箱どうしの統合 (同じ MOD 群) は狙いの組で合わせる別の物なので使わない
 */
export function backBody(body: BodyOf | undefined, from: string, to: string): boolean {
  if (!body) return sameBody(body, from, to);
  const x = body(from), y = body(to);
  return x !== null && y !== null && x === y;
}

/** 箱の形 (猿の口・見張り) */
export type BoxShape = { held: string[]; body: string | null };
export function boxShape(data: PatchData, d: TreeDoc, id: string, body: BodyOf = bodyMemo(data, d)): BoxShape | null {
  if (!d.boxes[id]) return null;
  return { held: heldSets(d, id).map((h) => [...h].sort().join(",")).sort(), body: body(id) };
}
/**
 * from の箱の人が to の箱へ行けるか = 狙いの組が全部 to にある (tree-shape の shapeFits) + 体が同じ (sameBody)。
 * 形の合う箱へ・作り直しは行き先を回す時に決めるので true
 */
export function sameShape(data: PatchData, d: TreeDoc, from: string, to: string, body: BodyOf = bodyMemo(data, d)): boolean {
  if (to === MATCH || to === RESTART) return true;
  return shapeFits(d, from, to) && sameBody(body, from, to);
}
