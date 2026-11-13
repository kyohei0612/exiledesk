/**
 * tree-box-shape.ts — 箱の形を 1 つに (10-28 オーナー OK の対策 1、スイッチ boxShape)。
 * 形 = 狙いの組 (held、道の当たりの札 = tree-shape の heldSets) + 体 (body: 外れの側・種類・数、✦ の側、レアリティ)。
 * 今の箱の判定 (tree-judge の judgeMemo) が使うのは bodyOf だけ。boxBody・bodyMemo・sameBody・bodyKinds・heldOn・heldMiss は猿の口 (sim-monkey の shapeOf・sameShape、
 * 見張り scripts/sim-watch が呼ぶ) の boxShape・sameShape だけが使う。前の世代の形の鍵の判定 (tree-shape の linkSameShape・matchBox) と、それだけが使った
 * bodyFixed・backBody・heldOfKey は 11-07 に消した
 */
import { aimHits, craftedKindOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";
import { sampleOf } from "./tree-sample";
import { heldSets, MATCH, RESTART, shapeFits } from "./tree-shape";
import { aimedMiss, isMissMod, type MissAims } from "./tree-miss";
import type { TreeDoc } from "./tree-model";

/**
 * アイテムの体の鍵 (狙いの組以外の形)。
 * 側ごとに完成の狙いに無い MOD を 普通.クラフト (エッセンス).冒涜の発現済み.未発現 で数え (✦ は数えない)、✦ は側ごとに 狙いの ✦ / 外れの ✦ の数 (どの MOD かは見ない。
 * 10-28 オーナー「プレ 3 MOD どれがフラクチャーでも同一と扱う、サフィも同様、ただしプレとサフィは明確に別」)、最後にレアリティ。
 * 例 `1.0.0.1|0.0.0.0|✦g1j0.g0j0|rare`。スイッチ boxShape が閉じている間は前の外れの鍵 (`n.c.x|n.c.x`、10-27 夕 goalShape)
 */
export function bodyOf(data: PatchData, d: TreeDoc, it: StageItem, aims?: MissAims): string {
  // aims = その箱 (その人) が ☑ で持っている狙い (と ☑ の置き石、S-33) = 当たりに数える札。外れは外れの式 1 本 (tree-miss の isMissMod)。
  // 持っていない完成形の MOD は外れに数える (☑ の無い狙いは外れ、S-22・S-82。数えないと、カオスの外れの見本のうち完成形の MOD を引いた見本だけ体が変わり
  // mixed になって、同じ形の箱へつながらなかった、10-28 夜オーナー「一緒のMODがふくすうあるけど認識されない」)。渡さなければ完成形の狙い全部
  const all = aimedMiss(data, d), miss = aims ?? all;
  const side = (ms: readonly StageMod[]): string => {
    let n = 0, c = 0, x = 0, u = 0;
    for (const m of ms) { if (m.fractured || !isMissMod(m, miss)) continue; if (m.unrevealed) u++; else if (m.desecrated) x++; else if (m.crafted || craftedKindOf(data, m)) c++; else n++; }
    return `${n}.${c}.${x}.${u}`;
  };
  // ✦ は完成形の狙い全部で見る (☑ は見ない、前から)。
  // スイッチ fracSplit: 狙いの ✦ は数でなく「どの狙いが固定されているか」(modId の組) で見る = 固定された MOD が違う人は同じ箱にまとめない
  // (S-11b、11-13 オーナー「イだろうねフラクチャー枠違うわけだし」。前は数だけで、F:冷気・雷は普通の人と F:雷・冷気は普通の人が同じ箱へ合流した = r/G9O1UdeA の b50 → b20)
  const split = flag("fracSplit");
  const gIds = (f: readonly StageMod[]): string => [...new Set(f.flatMap((m) => all.targets.filter((t) => aimHits(m, t, all.opts)).map((t) => t.modId)))].sort().join("+");
  const fr = (ms: readonly StageMod[]): string => { const f = ms.filter((m) => m.fractured); const gf = f.filter((m) => !isMissMod(m, all)), g = gf.length; return `g${split && g ? `[${gIds(gf)}]` : g}j${f.length - g}`; };
  return `${side(it.prefixes)}|${side(it.suffixes)}|✦${fr(it.prefixes)}.${fr(it.suffixes)}|${it.rarity}`;
}
/** 中身の鍵の ✦ の「どの狙いが固定か」(g[modId+modId]、スイッチ fracSplit) を数に戻す = 固定された MOD の違いだけを見ない鍵 (S-11b の写し) */
export const fracCountKey = (k: string): string => k.replace(/g\[([^\]]*)\]/g, (_, s: string) => `g${s.split("+").length}`);
/** 体の鍵の部分 (側ごとの外れ 2 つ・✦・レアリティ) */
const partsOf = (body: string): { p: number[]; s: number[]; fr: string; rarity: string } => {
  const [p = "", s = "", fr = "", rarity = ""] = body.split("|");
  return { p: p.split(".").map(Number), s: s.split(".").map(Number), fr, rarity };
};
/** 外れの種類があるかだけ (数・側は見ない)。回す時の 2 番目の比べと、見本ごとに種類が違う箱 (mixed) の見分け */
export const bodyKinds = (body: string): string => {
  if (body.startsWith("mixed")) return body;
  const { p, s } = partsOf(body), k = p.map((v, i) => ((v + (s[i] ?? 0)) > 0 ? 1 : 0));
  // 外れは種類を見ない (普通・エッセンス・冒涜の発現済みは 1 つ)。種類が違う (mixed) のは未発現が混ざる時だけ (S-63、10-29 深夜オーナー「未発現のみ別枠として全然おｋ」)
  return `${k.slice(0, 3).some(Boolean) ? 1 : 0}${k[3] ?? 0}`;
};

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
/** 道で持っている狙いの MOD (modId の組) を当たりに数える札に (前の世代の形の鍵の体。置き石は数えない = 前のまま) */
export const heldMiss = (data: PatchData, d: TreeDoc, held: ReadonlySet<string>): MissAims => aimedMiss(data, d, held, { stones: false });
export function boxBody(data: PatchData, d: TreeDoc, id: string, one = false): string | null {
  const s = sampleOf(data, d, id, 1);
  if (s.note === "none" || s.note?.startsWith("cant:")) return null;
  const held = heldMiss(data, d, heldOn(d, id));
  const body = bodyOf(data, d, s.item, held);
  if (id === "start" || one) return body;
  const kinds = new Set([body, ...[2, 3, 4].flatMap((k) => { const m = sampleOf(data, d, id, k); return m.note === "none" || m.note?.startsWith("cant:") ? [] : [bodyOf(data, d, m.item, held)]; })].map(bodyKinds));
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
  // 始まりへも体 (レアリティ・外れの数) を比べる (マジックの外れ 1 つの箱が白のスタートへ戻った、10-28 夜オーナー「色々挙動があやしい」。スイッチ boxShape)
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
/** 箱 id で消えた名前の印の MOD が合金か (親の見本より合金の MOD が減り、エッセンスの MOD は減っていない。箱の題「合金の MOD が消えた」、S-65b2) */
export function goneAlloyAt(data: PatchData, d: TreeDoc, id: string): boolean {
  const p = d.boxes[id]?.parent;
  if (!p || !d.boxes[p]) return false;
  const count = (it: StageItem): { alloy: number; essence: number } => {
    const k = [...it.prefixes, ...it.suffixes].map((m) => craftedKindOf(data, m));
    return { alloy: k.filter((x) => x === "alloy").length, essence: k.filter((x) => x === "essence").length };
  };
  const a = count(sampleOf(data, d, p, 1).item), b = count(sampleOf(data, d, id, 1).item);
  return b.alloy < a.alloy && b.essence >= a.essence;
}
