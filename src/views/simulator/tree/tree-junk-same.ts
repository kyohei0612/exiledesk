/**
 * tree-junk-same.ts — 「同じ外れは 1 回で」(S-190d、スイッチ junkSameHand。オーナー 11-15「ハズレMODのハズレの仕方の設定がだるい…多すぎてめんどい」→ 案 A)。
 * 同じ外れ = 同じ手 (sameHand) の結果の、同じ種類の箱 (外れ / 外れが消えた / 狙いが消えた / 打った後。プレ・サフィの側は見ない) で、まだ手・↩・完成 / 失敗の無い物。
 * 同じ中身の箱は手を置けば自動でつながる (S-50e) ので、ここが拾うのは中身が側などで少し違う箱 (例: 消去の後の「外れが消えた」プレ / サフィ)。
 * 兄弟枠 (11-16 の名前): 手の無い箱に初めて手を置いたその時に、今ある・まだ決めていない同じ外れの箱へ 1 回だけ同じ手 (と「失敗」の印) を入れる
 * (1 つの組み替えなので 1 つ戻すで丸ごと戻る。☑ は 11-15 にやめた)。つながりは残さない: 後で手を替える・消す・置き直すのはその箱だけ。
 * 手を消した箱 (sameOff) は兄弟枠に入れず、写す元にもしない
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { sameHand, type Aim, type Hand, type HandKind, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { handPickOf } from "../../../services/simulator/tree/tree-recipe-v1";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { useReason } from "../../../services/craft-stage/engine";
import { craftStage } from "../../../state/craft-stage";
import { applyPick, holdLinks, kindOf, onlyOf } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";
import { effectOf } from "../../../services/simulator/tree/tree-hands";

/** 同じ外れに数える結果の種類 (当たり・完成への道・塞がった箱は入れない) */
const KINDS = new Set(["junk", "junkGone", "lost", "any"]);
/** フラクチャーで固定された箱 (フラクチャーの手の当たり = 「〜が固定された」)。兄弟枠に入れる (S-190d、11-16 オーナー「フラクチャー後の消去も兄弟判定になってない」→「おｋ」) */
const fracHit = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; const h = b?.parent ? d.boxes[b.parent]?.hand : null; return !!b && b.out === "hit" && !!h && effectOf(h.currency) === "fracture"; };
/** 兄弟枠に入る・写す元になれる箱 = 手・↩・完成 / 失敗が無く、人が手を消した箱 (sameOff) でもない (11-16 オーナー「自動で置いたやつを編集したり消したりするときはその枠だけで良さそうやね」) */
const open = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; return !!b && (KINDS.has(b.out) || fracHit(d, id)) && !b.hand && !b.back && !b.done && !b.sameOff; };

/** id の箱と同じ外れの種類のほかの箱 (決めの有無は見ない、木の並びの順)。同じ手の親の同じ種類の結果。フラクチャーで固定された箱どうしは固定された狙いも同じ物だけ */
export function frameMates(d: TreeDoc, id: string): TreeBox[] {
  const b = d.boxes[id];
  const ph = b?.parent ? d.boxes[b.parent]?.hand : null;
  if (!b || !ph || !(KINDS.has(b.out) || fracHit(d, id))) return [];
  const aim = b.aim?.modId ?? null;
  const all = Object.values(d.boxes).filter((o) => o.id !== id && o.out === b.out && (b.out !== "hit" || (o.aim?.modId ?? null) === aim) && (KINDS.has(o.out) || fracHit(d, o.id)) && !!o.parent && (() => { const h = d.boxes[o.parent!]?.hand; return !!h && sameHand(h, ph); })());
  // 残っている MOD の数が同じ箱だけ (スイッチ sameModCount、11-16 オーナー「2と3はそれでおｋ」)
  const data = craftStage.data.value;
  if (!flag("sameModCount") || !data || !all.length) return all;
  const n = modCountOf(data, d, id);
  return all.filter((o) => modCountOf(data, d, o.id) === n);
}
/** 箱の見本の品に残っている MOD の数 (見本が作れなければ -1 = どの箱とも別扱いにしない) */
function modCountOf(data: PatchData, d: TreeDoc, id: string): number {
  try { const it = sampleOf(data, d, id, 1)?.item; return it ? it.prefixes.length + it.suffixes.length : -1; } catch { return -1; }
}

/** id の箱と同じ外れの、まだ決めていないほかの箱 (木の並びの順)。id が決め済み・外れでなければ空 */
export function sameJunkOf(d: TreeDoc, id: string): string[] {
  if (!flag("junkSameHand") || !open(d, id)) return [];
  return frameMates(d, id).filter((o) => open(d, o.id)).map((o) => o.id);
}

/** その箱の見本でこの手を打てるか (棚と同じ useReason。触媒の前のカタリストも)。打てない手は写さない (S-190d ①・③、11-16) */
function playable(data: PatchData, d: TreeDoc, id: string, h: Hand, pre: string | null): boolean {
  let it: ReturnType<typeof sampleOf>["item"] | null = null;
  try { it = sampleOf(data, d, id, 1)?.item ?? null; } catch { return true; }
  if (!it) return true;
  if (pre && useReason(data, it, pre, [])) return false;
  return !useReason(data, it, h.currency, h.omens);
}

/** 写す手を比べる鍵 (手・触媒の前・☑ の狙い) */
const pickKey = (p: { hand: Hand; pre: string | null; aims: Aim[] }): string => `${p.pre ?? ""}|${p.aims.map((a) => `${a.modId}/${a.tier}`).sort().join(",")}`;

/**
 * 後からできた箱にも兄弟枠の手を写す (S-190d ③、スイッチ sameLater)。before = この組み替えの前にあった箱。
 * 新しくできた決めていない外れの箱ごとに、兄弟枠で手を持つ箱 (手を消した印・消去の続きの自動の手は見ない) の手が全部同じならその手を置く。
 * 写した手でまた新しくできた箱にも続けて写す。何か写したら true (呼ぶ側の edit の中で、整理の前に呼ぶ)
 */
export function fillLaterSame(data: PatchData, d: TreeDoc, before: ReadonlySet<string>): boolean {
  if (!flag("junkSameHand") || !flag("sameLater")) return false;
  const tried = new Set<string>();
  let any = false;
  for (let round = 0; round < 50; round++) {
    let put = 0;
    for (const id of Object.keys(d.boxes)) {
      if (before.has(id) || tried.has(id) || !open(d, id)) continue;
      tried.add(id);
      const picks = frameMates(d, id).filter((o) => o.hand && !o.sameOff && !o.autoAnnul).map((o) => handPickOf(d, o)!);
      if (!picks.length) continue;
      const p = picks[0]!;
      if (picks.some((q) => !sameHand(q.hand, p.hand) || pickKey(q) !== pickKey(p))) continue; // 兄弟どうしで手が違う = 写さず空のまま
      if (!playable(data, d, id, p.hand, p.pre)) continue;
      holdLinks(() => applyPick(d, id, p.hand, kindOf(p.hand), p.aims, p.pre, onlyOf(data, d, id, p.hand, p.pre, p.aims)));
      put++;
    }
    if (!put) break;
    any = true;
  }
  return any;
}

/** 決めた手を同じ外れのほかの箱にも置く (呼ぶ側の edit の中で、元の箱に置いた後)。間に自動でつながった箱は飛ばす */
export function pickSameJunk(data: PatchData, d: TreeDoc, ids: string[], h: Hand, kind: HandKind, aims: Aim[], pre: string | null): void {
  for (const id of ids) {
    if (!open(d, id) || !playable(data, d, id, h, pre)) continue;
    holdLinks(() => applyPick(d, id, h, kind, aims, pre, onlyOf(data, d, id, h, pre, aims)));
  }
}
