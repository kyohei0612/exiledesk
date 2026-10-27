/**
 * tree-box-shape.ts — 箱の形を 1 つに (10-28 オーナー OK の対策 1、スイッチ boxShape)。
 * 形 = 狙いの組 (held、道の当たりの札 = tree-shape の heldSets) + 体 (body: 外れの側・種類・数、✦ の側、レアリティ)。
 * 自動のつなぎ・↩ 戻り (sameHandReturn・形の合う箱へ・消去の直線の止まり)・まとめる (統合・候補)・精査・回す時の行き先・猿の口 (見張り) が全部これを呼ぶ。
 * 前の別々の比べ (junkSig・boxSig・sigKinds・消去の直線の likeKey / frPart・applyPick の loose / mixed・hitLoose) はここへ寄せて消した
 */
import { craftedKindOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { sampleOf } from "./tree-sample";
import { heldSets, MATCH, RESTART, shapeFits } from "./tree-shape";
import { flag } from "../../../web/release-flags";
import type { TreeDoc } from "./tree-model";

/**
 * アイテムの体の鍵 (狙いの組以外の形)。
 * 側ごとに完成の狙いに無い MOD を 普通.クラフト (エッセンス).冒涜の発現済み.未発現 で数え (✦ は数えない)、✦ は側ごとに 狙いの ✦ / 外れの ✦ の数 (どの MOD かは見ない。
 * 10-28 オーナー「プレ 3 MOD どれがフラクチャーでも同一と扱う、サフィも同様、ただしプレとサフィは明確に別」)、最後にレアリティ。
 * 例 `1.0.0.1|0.0.0.0|✦g1j0.g0j0|rare`。スイッチ boxShape が閉じている間は前の外れの鍵 (`n.c.x|n.c.x`、10-27 夕 goalShape)
 */
export function bodyOf(data: PatchData, d: TreeDoc, it: StageItem): string {
  const goals = new Set((d.memoAims ?? []).map((a) => a.modId));
  const on = flag("boxShape");
  const side = (ms: readonly StageMod[]): string => {
    let n = 0, c = 0, x = 0, u = 0;
    for (const m of ms) { if (m.fractured || goals.has(m.modId)) continue; if (m.unrevealed && on) u++; else if (m.desecrated || m.unrevealed) x++; else if (m.crafted || craftedKindOf(data, m)) c++; else n++; }
    return on ? `${n}.${c}.${x}.${u}` : `${n}.${c}.${x}`;
  };
  if (!on) return `${side(it.prefixes)}|${side(it.suffixes)}`;
  const fr = (ms: readonly StageMod[]): string => { const f = ms.filter((m) => m.fractured); const g = f.filter((m) => goals.has(m.modId)).length; return `g${g}j${f.length - g}`; };
  return `${side(it.prefixes)}|${side(it.suffixes)}|✦${fr(it.prefixes)}.${fr(it.suffixes)}|${it.rarity}`;
}
/** 体の鍵の部分 (側ごとの外れ 2 つ・✦・レアリティ) */
const partsOf = (body: string): { p: number[]; s: number[]; fr: string; rarity: string } => {
  const [p = "", s = "", fr = "", rarity = ""] = body.split("|");
  return { p: p.split(".").map(Number), s: s.split(".").map(Number), fr, rarity };
};
/** 外れの種類があるかだけ (数・側は見ない)。回す時の 2 番目の比べと、見本ごとに種類が違う箱 (mixed) の見分け */
export const bodyKinds = (body: string): string => { if (body.startsWith("mixed")) return body; const { p, s } = partsOf(body); return p.map((v, i) => ((v + (s[i] ?? 0)) > 0 ? 1 : 0)).join(""); };
/** 冒涜 (発現済み・未発現) の外れがあるか (mixed = 見本ごとに種類が違う箱も含める) */
export const hasDesecrated = (body: string | null): boolean => !!body && (body.startsWith("mixed") || [partsOf(body).p, partsOf(body).s].some((x) => (x[2] ?? 0) > 0 || (x[3] ?? 0) > 0));
/** 消去の直線の止まる所で比べる部分 (レアリティ (スイッチ stripRarity) と ✦ の側 (スイッチ boxShape)。外れの数は直線の段で数える、tree-outcome の stripStops) */
export const likeOf = (data: PatchData, d: TreeDoc, it: StageItem): string => `${flag("stripRarity") ? it.rarity : ""}|${flag("boxShape") ? partsOf(bodyOf(data, d, it)).fr : ""}`;

/**
 * 箱の体 (見本から。作れない箱は null = 比べない)。見本 4 つで外れの種類が違う箱 (未発現の箱にカオスの外れ: 未発現が消えた人と残った人が同じ箱) は
 * `mixed:<id>` = どの箱とも同じにならない (片方の形の箱へつなぐと、もう片方の人がその箱の手を打てない。10-28 冒涜まわりの確かめ)。始まりは見本 1 つ
 */
export function boxBody(data: PatchData, d: TreeDoc, id: string): string | null {
  const s = sampleOf(data, d, id, 1);
  if (s.note === "none" || s.note?.startsWith("cant:")) return null;
  const body = bodyOf(data, d, s.item);
  if (!flag("boxShape") || id === "start") return body;
  const kinds = new Set([body, ...[2, 3, 4].flatMap((k) => { const m = sampleOf(data, d, id, k); return m.note === "none" || m.note?.startsWith("cant:") ? [] : [bodyOf(data, d, m.item)]; })].map(bodyKinds));
  return kinds.size > 1 ? `mixed:${id}` : body;
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
  if (to === "start") return !(flag("boneLater") && hasDesecrated(body(from)));
  const x = body(from), y = body(to);
  return x === null || y === null || x === y;
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
