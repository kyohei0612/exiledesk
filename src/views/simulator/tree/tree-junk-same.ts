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
import { frameOfDoc } from "../../../services/simulator/tree/tree-frame";
import { handBlockAt } from "../../../services/simulator/tree/tree-copy-block";
import { fitsAt } from "./tree-copy-fit";
import { craftStage } from "../../../state/craft-stage";
import { applyPick, holdLinks, kindOf, onlyOf } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";
import { effectOf } from "../../../services/simulator/tree/tree-hands";
import { lvPart } from "../../../services/simulator/tree/tree-whittle";

/** 同じ外れに数える結果の種類 (当たり・完成への道・塞がった箱は入れない) */
const KINDS = new Set(["junk", "junkGone", "lost", "any"]);
/** フラクチャーで固定された箱 (フラクチャーの手の当たり = 「〜が固定された」)。兄弟枠に入れる (S-190d、11-16 オーナー「フラクチャー後の消去も兄弟判定になってない」→「おｋ」) */
const fracHit = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; const h = b?.parent ? d.boxes[b.parent]?.hand : null; return !!b && b.out === "hit" && !!h && effectOf(h.currency) === "fracture"; };
/** 兄弟枠に入る・写す元になれる箱 = 手・↩・完成 / 失敗が無く、人が手を消した箱 (sameOff) でもない (11-16 オーナー「自動で置いたやつを編集したり消したりするときはその枠だけで良さそうやね」) */
const open = (d: TreeDoc, id: string): boolean => { const b = d.boxes[id]; return !!b && (KINDS.has(b.out) || fracHit(d, id)) && !b.hand && !b.back && !b.done && !b.sameOff && !lvFrame(b); };
/** 削減の手前の枠 (S-65c、鍵 l:) は兄弟枠に入れない = 写す先にも写す元にもしない (S-190d2、スイッチ whittleNoSame。11-18 オーナー「あと同じと高いは未設定でおｋよデフォ」) */
const lvFrame = (b: TreeBox): boolean => flag("whittleNoSame") && !!lvPart(b.junkKey);

/** id の箱と同じ外れの種類のほかの箱 (決めの有無は見ない、木の並びの順)。同じ手の親の同じ種類の結果。フラクチャーで固定された箱どうしは固定された狙いも同じ物だけ */
export function frameMates(d: TreeDoc, id: string): TreeBox[] {
  const b = d.boxes[id];
  const ph = b?.parent ? d.boxes[b.parent]?.hand : null;
  if (!b || !ph || !(KINDS.has(b.out) || fracHit(d, id)) || lvFrame(b)) return [];
  const aim = b.aim?.modId ?? null;
  const all = Object.values(d.boxes).filter((o) => o.id !== id && !lvFrame(o) &&o.out === b.out && (b.out !== "hit" || (o.aim?.modId ?? null) === aim) && (KINDS.has(o.out) || fracHit(d, o.id)) && !!o.parent && (() => { const h = d.boxes[o.parent!]?.hand; return !!h && sameHand(h, ph); })());
  // 残っている MOD の数が同じ箱だけ (スイッチ sameModCount、11-16 オーナー「2と3はそれでおｋ」)
  const data = craftStage.data.value;
  if (!data || !all.length) return all;
  const n = flag("sameModCount") ? modCountOf(data, d, id) : null;
  const byCount = n === null ? all : all.filter((o) => modCountOf(data, d, o.id) === n);
  // 名前の組 (カードに名前で出る MOD = ☑ の狙い・置き石・残した MOD・✦ で固定された MOD) も同じ箱だけ (S-190d、スイッチ sameNames、11-18 オーナー
  // 「理想MODの手が兄弟枠になぜか設定されるのおかしいね」「フラクチャーの中身が違うぞ」)。代表の品 (配置) から取る (レビュワー 1 の B-r1)。取れない箱は括らない (B-n1)
  if (!flag("sameNames") || !byCount.length) return byCount;
  const frames = frameOfDoc(data, d).frames, nameOf = (x: string): string | null => {
    const f = frames.get(x);
    return f ? JSON.stringify([[...f.aimed].sort(), [...f.item.prefixes, ...f.item.suffixes].filter((m) => m.fractured).map((m) => m.modId).sort()]) : null;
  };
  const mine = nameOf(id);
  // 名前の組が取れない箱は括らない (写さない、レビュワー 1 の B-n1。前は取れない箱を前のまま括り、中身の違う箱へ写りうる)
  return mine === null ? [] : byCount.filter((o) => nameOf(o.id) === mine);
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

/** その箱でこの手を打てるか = 手の窓・棚の灰色・箱の印と同じ 1 本の判定 (tree-copy-block の handBlockAt。見本が作れない箱は写さない)。打てない手は写さない (S-190d ①・③) */
const playable = (data: PatchData, d: TreeDoc, id: string, h: Hand, pre: string | null): boolean => !handBlockAt(data, d, id, h, pre);

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
      const from = frameMates(d, id).filter((o) => o.hand && !o.sameOff && !o.autoAnnul);
      const picks = from.map((o) => handPickOf(d, o)!);
      if (!picks.length) continue;
      const p = picks[0]!;
      if (picks.some((q) => !sameHand(q.hand, p.hand) || pickKey(q) !== pickKey(p))) continue; // 兄弟どうしで手が違う = 写さず空のまま
      if (!playable(data, d, id, p.hand, p.pre) || !fitsAt(data, d, from[0]!.id, id, p.hand, p.aims)) continue; // 設定が写す先で意味を持たない手も写さない
      holdLinks(() => applyPick(d, id, p.hand, kindOf(p.hand), p.aims, p.pre, onlyOf(data, d, id, p.hand, p.pre, p.aims)));
      put++;
    }
    if (!put) break;
    any = true;
  }
  return any;
}

/**
 * (S-28h ④、スイッチ foldFracChaos、11-20 オーナー「1A」) 左の枠へ重ねて畳んだ兄弟の同じ場所の箱 (ids = foldMirrors) にも、替えた手を置く。
 * 手があっても置き替える。打てない・設定が意味を持たない箱へは写さない (その枠は流れが違うので重なりから出る)。呼ぶ側の edit の中で、元の箱 src に置いた後
 */
export function pickFoldMirrors(data: PatchData, d: TreeDoc, src: string, ids: readonly string[], h: Hand, kind: HandKind, aims: Aim[], pre: string | null): void {
  for (const id of ids) {
    if (!d.boxes[id] || d.boxes[id]!.done || !playable(data, d, id, h, pre) || !fitsAt(data, d, src, id, h, aims)) continue;
    holdLinks(() => applyPick(d, id, h, kind, aims, pre, onlyOf(data, d, id, h, pre, aims)));
  }
}

/** 決めた手を同じ外れのほかの箱にも置く (呼ぶ側の edit の中で、元の箱 src に置いた後)。間に自動でつながった箱・設定が意味を持たない箱 (fitsAt) は飛ばす */
export function pickSameJunk(data: PatchData, d: TreeDoc, src: string, ids: string[], h: Hand, kind: HandKind, aims: Aim[], pre: string | null): void {
  for (const id of ids) {
    if (!open(d, id) || !playable(data, d, id, h, pre) || !fitsAt(data, d, src, id, h, aims)) continue;
    holdLinks(() => applyPick(d, id, h, kind, aims, pre, onlyOf(data, d, id, h, pre, aims)));
  }
}
