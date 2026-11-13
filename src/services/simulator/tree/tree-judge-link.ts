/**
 * tree-judge-link.ts — 木を組む時・回す時に、判定の 2 つ (tree-judge の箱どうし fitsBox・人と箱 routeOf) を呼ぶ所 (S-50b)。
 * 前の tree-shape の linkSameShape・sameHandReturn・sameHitsOf・linkShapeHit・pruneBacks・joinableShapeOf・settle / matchBox と同じ役で、
 * 比べは全部 Judge に任せる (形の鍵・道の狙いの組・体の比べは持たない)。手ごとの除外 (フラクチャー・カタリストの結果・カオスの外れを親へ) もしない (大本 2)
 */
import { mulberry32, type PatchData, type StageItem } from "../../craft-stage/engine";
import { type Judge } from "./tree-judge";
import { playHand } from "./tree-sample";
import { clearHand, MATCH_BACK, setBack, subtree, type Hand, type TreeBox, type TreeDoc } from "./tree-model";
import { DIVINE_LT, isDivineAim } from "./tree-divine";
import { effectOf, isRuneHand } from "./tree-hands";
import { treeOrder } from "./tree-order";
import { outKey } from "./tree-recipe-v1";
import { flag } from "../../../web/release-flags";

const RESTART = "restart";
/** 作った順 (箱の id は b<番号>、始まりが先) */
export const depthOf = (doc: TreeDoc, id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
/** 同じ中身の候補の決め手 = 木の並び (上の段 → 道の並び、削減の枠は 低い→同じ→高い → 箱の番号、S-50e の足し・tree-order)。前は段と箱の番号で、開き直すと行き先が入れ替わった */
export const shallow = (doc: TreeDoc): ((x: string, y: string) => number) => treeOrder(doc);
const keepSig = (h: Hand): string => (h.keep ?`k:${h.keep.map((a) => a.modId).sort().join()}` : "");
const sameHand = (x: Hand | null | undefined, h: Hand): boolean => !!x && x.currency === h.currency &&[...x.omens].sort().join() === [...h.omens].sort().join() && keepSig(x) === keepSig(h);

/**
 * 人が × で ↩ を外した箱の、結果が 1 通りの手の先の箱で中身が同じ物か (S-50、木 xIH1EiqP の b11 → b13)。
 * 打っても中身の変わらない手 (カタリストなど) の先は × の箱と同じ人なので、× を継いで自動の ↩ を付けない (前は × した行き先へ 1 段下から付き直した)
 */
export function offByParent(doc: TreeDoc, id: string, j: Judge): boolean {
  for (let p = doc.boxes[doc.boxes[id]?.parent ?? ""]; p && p.outs.length <= 1; p = doc.boxes[p.parent ?? ""]) if (p.noAutoBack && j.fitsBox(id, p.id)) return true;
  return false;
}

/** t が id の上で、間の手の結果が全部 1 通りの箱か (自動の ↩ を付けると打っても変わらない手の輪になる、S-50・S-50d が閉じていれば親だけ) */
export function straightUp(doc: TreeDoc, id: string, t: string): boolean {
  for (let p = doc.boxes[doc.boxes[id]?.parent ?? ""]; p && p.outs.length <= 1; p = doc.boxes[p.parent ?? ""]) { if (p.id === t) return true; }
  return false;
}

/**
 * t が id の上 (先祖) で、t から id までの手に品質・ルーンだけを変える手 (カタリスト・ルーン) があるか (S-51d の例外)。品質を枠に入れないので (S-60b)
 * その前後は同じ中身に見えるが、人の品は品質・ルーンが違う。戻すと上の手 (カタリストなど) を打ち直す輪になり、後の箱の人の決めた手が消える
 * (11-08 夜、消去の木 ownerAnnul1: カタリストの後のカオス + 削減の結果を 2 つ上のエッセンスの箱へまとめ、38 → 16 箱・100 人が上限まで回った)
 */
export function qualityBetween(doc: TreeDoc, id: string, t: string): boolean {
  let q = false;
  for (let p = doc.boxes[doc.boxes[id]?.parent ?? ""]; p; p = doc.boxes[p.parent ?? ""]) {
    if (p.hand && (effectOf(p.hand.currency) === "quality" || isRuneHand(p.hand.currency))) q = true;
    if (p.id === t) return q;
  }
  return false;
}

/**
 * id の自動の ↩ を t へ付けると打っても変わらない手の輪になるか (S-50): 結果が 1 通りの手だけで上へ続く箱 (straightUp) か、
 * 親の手の結果が全部親と同じ枠 (神のオーブなど、値しか変えない手) で t が親と同じ手の箱。前は神の結果が全部 ↩ 神の箱になり、人が神を打ち続けて抜けなかった (11-07、100 人中 94 人が打ち止め)
 */
export function idleLoop(doc: TreeDoc, id: string, t: string, j: Judge): boolean {
  if (straightUp(doc, id, t)) return true;
  const p = doc.boxes[doc.boxes[id]?.parent ?? ""];
  // 目標の数値を決めた神の未満の箱 (S-202 ④) は以上の枝で抜けるので輪にしない (以上の箱は今までどおり神の箱へ戻さない)
  if (isDivineAim(p?.hand) && doc.boxes[id]?.junkKey === DIVINE_LT) return false;
  return !!p?.hand && sameHand(doc.boxes[t]?.hand, p.hand) && p.outs.every((o) => j.fitsBox(o, p.id));
}

/**
 * 自動の ↩ の行き先 (S-50e):中身が同じ手のある箱のうち、親 → 浅い段・先に作った箱の順 (親の手と同じ手かは見ない、11-06 オーナー「前カレンシ〜も見てたからな」)。
 * 自分と下、打っても変わらない手の輪になる箱 (idleLoop) は入れない
 */
export function autoTarget(doc: TreeDoc, id: string, j: Judge): string | null {
  // 候補が 2 つ以上でも親 → 浅い段・先に作った箱の 1 つへ (S-52b・S-51d、11-08 夜オーナー「2つ目でたら即もどるような気がするけど」「だったら複数ボタンはいらん気がする」。
  // 同じ中身の手のある箱は木に 1 つにまとまるので、候補が 2 つ以上になるのはまとめの前だけ。前は人が「↩ 戻り先を選ぶ (n 個)」で選んだ)
  return autoTargets(doc, id, j)[0] ?? null;
}
/**
 * 上の段へ戻さない箱なら自分の段 (この段より浅い箱は自動の ↩ の候補にしない)、ほかは 0 (S-50g、スイッチ idealNoBack)。
 * 完成への道の手の結果 = 当たり・狙い無しの結果 (11-13 オーナー「理想手では戻らせないようにしてくれ全部狙い通りなんだから狙い無しも狙い通りだしね」)。外れの側は今のまま
 */
function idealNoUp(doc: TreeDoc, id: string): number {
  const out = doc.boxes[id]?.out;
  return flag("idealNoBack") && (out === "hit" || out === "any") ? depthOf(doc, id) : 0;
}
/** 自動の ↩ の候補 (親 → 浅い段・先に作った箱の順) */
export function autoTargets(doc: TreeDoc, id: string, j: Judge): string[] {
  const below = new Set(subtree(doc, id)), p = doc.boxes[id]?.parent ?? null;
  const rank = (t: string): number => (t === p ? 0 : 1);
  const cmp = shallow(doc);
  // 品質はどこでも見ない (S-60b・S-60c、11-08 オーナー「いやだから品質みないっての」): カタリストの n % に届くかで候補を外さない
  // スイッチ idealNoBack (S-50g): 完成への道の手の結果 (当たり・狙い無しの結果) は上の段へ戻さない。同じ段・下の段への合流は今のまま
  const up = idealNoUp(doc, id);
  const ts = Object.values(doc.boxes).filter((t) => !!t.hand && !below.has(t.id) && !(up && depthOf(doc, t.id) < up) && !straightUp(doc, id, t.id) && !qualityBetween(doc, id, t.id) && j.fitsBox(id, t.id) && j.playsAt(id, t.id) && !idleLoop(doc, id, t.id, j)).map((t) => t.id);
  // 結果が 1 通りの手 (カタリストなど) で上の候補から続くだけの候補は、上の 1 つと数える (S-52b、11-08 オーナーの木の 13 段目 → 10 段目。11 段目はカタリストを打った後)
  return ts.filter((t) => !ts.some((u) => u !== t && straightUp(doc, t, u))).sort((x, y) => rank(x) - rank(y) || cmp(x, y));
}

/**
 * 自動のつなぎ (S-50): 新しくできた結果の箱 (当たりも、手も戻りも無い・人が × で外していない) は、中身が同じ手のある箱 (スタートも) があれば
 * 先に作った箱 (浅い段から) へ自動の ↩。自分と自分の下は除く (当たりは打つ前の箱と中身が違うので再挑戦にはならない)。手の無い当たりの箱どうしは sameHitsByContent
 */
export function linkByContent(doc: TreeDoc, ids: readonly string[], j: Judge): void {
  for (const id of ids) {
    const c = doc.boxes[id];
    if (!c || c.noAutoBack || c.hand || c.done || c.split || c.out === "branch" || c.out === "start") continue;
    // 外れの道も同じ枠なら自動でつなぐ (11-06 オーナー「同じ枠があったらその枠に打つカレンシーって決まってる」。前は人が手を決めた時の同じ枠探しだけ = S-190b)
    // 人が付けた戻り・setHand の既定の戻り (外れが消えた → 外れの前の箱、自動の印つき) は pruneByContent が見直す
    if (c.back && c.back !== MATCH_BACK) continue;
    if (offByParent(doc, id, j)) continue;
    const to = autoTarget(doc, id, j);
    if (!to) continue;
    c.back = to;
    c.autoBack = true;
    delete c.merged;
    c.done = null;
  }
}

/** 当たりの箱で中身が同じ別の当たりの箱 (まとめるの候補・自動の統合。同じ親の横と自分の下は除く、戻りを持つ箱・分かれ目も除く) */
export function sameHitsByContent(doc: TreeDoc, id: string, j: Judge): string[] {
  const b = doc.boxes[id];
  if (!b || b.out !== "hit" || !b.aim || b.back || b.split) return [];
  const down = new Set(subtree(doc, id));
  return Object.values(doc.boxes).filter((c) => c.id !== id && c.out === "hit" && !!c.aim && !c.back && !c.split && c.parent !== b.parent && !down.has(c.id) && j.fitsBox(id, c.id)).map((c) => c.id).sort(shallow(doc));
}

/** 同じ手なら戻る (S-51): 打つ前の箱か木の中の中身が同じ手のある箱 (どの種類の箱でも) と同じ手なら、その箱 (今の戻り先 → 親 → 浅い段の順)。自分と下は除く */
export function sameHandByContent(doc: TreeDoc, id: string, h: Hand, j: Judge): string | null {
  const b = doc.boxes[id];
  if (!b || b.out === "start" || b.split) return null;
  // 結果が 1 通りの手だけで上へ続く箱 (straightUp) へは戻さない = 打っても変わらない手の輪 (自動の ↩・まとめと同じ守り)。品質を枠に入れないので (S-60b、11-08)、
  // カタリストで品質を満たした後の箱に置いた同じカタリスト (触媒の前に足す pre) がすぐ上のカタリストの箱へ戻り、下の手が全部消えて素通りと ↩ の輪になった (FmNY7Wwv、300 人が打ち止め)
  const ok = (t: string): boolean => !straightUp(doc, id, t);
  if (b.back && b.back !== MATCH_BACK && b.back !== RESTART && sameHand(doc.boxes[b.back]?.hand, h) && j.fitsBox(id, b.back) && ok(b.back)) return b.back;
  const p = b.parent;
  if (p && sameHand(doc.boxes[p]?.hand, h) && j.fitsBox(id, p) && ok(p)) return p;
  const below = new Set(subtree(doc, id));
  return Object.values(doc.boxes).filter((t) => !below.has(t.id) && sameHand(t.hand, h) && j.fitsBox(id, t.id) && ok(t.id)).map((t) => t.id).sort(shallow(doc))[0] ?? null;
}

/**
 * 同じ中身は木に 1 箱 (S-51d): 手のある箱 id と中身が同じ手のある箱のうち、id より浅い (同じ段は先に作った) 箱 = 幹。来た手・置いた手が違っても幹へ
 * (11-08 夜オーナー「同じ枠って２つ以上なることあるの？2つ目でたら即もどるような気がするけど」。前の 11-08 の「手が違えば両方残す」は撤回)。
 * 自分の下・打っても変わらない手の輪 (straightUp・idleLoop。カタリスト・ルーンの手の前後 = 品質を枠に入れないので前後が同じ中身になる所) は入れない。
 * 人の × (noAutoBack)・分かれ目・ヒネコラのハズレの箱は幹を探さない
 */
export function trunkOf(doc: TreeDoc, id: string, j: Judge): string | null {
  const b = doc.boxes[id];
  if (!b?.hand || b.out === "start" || b.split || b.noAutoBack || b.seen) return null;
  const below = new Set(subtree(doc, id)), cmp = shallow(doc);
  return Object.values(doc.boxes).filter((t) => t.id !== id && !!t.hand && !t.split && !t.seen && !below.has(t.id) && cmp(t.id, id) < 0 && !straightUp(doc, id, t.id) && !qualityBetween(doc, id, t.id) && j.fitsBox(id, t.id) && j.playsAt(id, t.id) && !idleLoop(doc, id, t.id, j)).map((t) => t.id).sort(cmp)[0] ?? null;
}
/** 人の決めのある箱か (手・完成 / 失敗・人の ↩・分かれ目) */
const decided = (b: TreeBox | undefined): boolean => !!b && (!!b.hand || !!b.done || (!!b.back && !b.autoBack) || !!b.split);
/**
 * まとめられる箱 from の下の人の決めを、幹 to の下の同じ道 (結果の札が同じ) で決めの無い箱へ移す (S-50f、11-10)。決めのある箱は上書きしない。
 * 同じ中身の箱なので下の結果の箱も同じ。前は幹へまとめると from の下の決めが消え、幹の下の同じ箱が未設定で止まった
 * (手袋 r1: 削減の枠「高い」の下の消去の先の決めが「同じ」側へまとめた時に消え、保存して開き直すと 100 人中 86 人が止まった)
 */
export function graftDecided(doc: TreeDoc, from: string, to: string): void {
  const f = doc.boxes[from], t = doc.boxes[to];
  if (!f || !t) return;
  const used = new Set<string>();
  for (const c of [...f.outs]) {
    const cb = doc.boxes[c];
    if (!cb || !decided(cb) && !cb.outs.length) continue;
    const mate = t.outs.find((o) => !used.has(o) && !!doc.boxes[o] && outKey(doc.boxes[o]!) === outKey(cb));
    if (!mate) continue;
    used.add(mate);
    const mb = doc.boxes[mate]!;
    if (!decided(mb) && !mb.outs.length && decided(cb)) {
      // 決めの無い幹の側の箱を、決めのある箱 (下ごと) で差し替える。差し替える箱へ自動でつないでいた箱は移した箱へ
      for (const o of Object.values(doc.boxes)) if (o.back === mate) o.back = c;
      t.outs[t.outs.indexOf(mate)] = c;
      f.outs = f.outs.filter((o) => o !== c);
      cb.parent = to;
      delete doc.boxes[mate];
    } else if (mb.hand && cb.hand && sameHand(mb.hand, cb.hand)) graftDecided(doc, c, mate);
  }
}
/** 箱 x の手と下を消して自動の ↩ to (同じ手なら選んだ手を handBack に持つ = S-51)。x の下の人の決めは幹の同じ道へ移す (graftDecided) */
function foldInto(doc: TreeDoc, x: string, to: string): void {
  const b = doc.boxes[x]!, h = b.hand!, same = sameHand(doc.boxes[to]?.hand, h);
  if (same) graftDecided(doc, x, to);
  clearHand(doc, x);
  setBack(doc, x, to);
  b.autoBack = true;
  if (same) b.handBack = { ...h };
}
/**
 * 木全体で同じ中身の手のある箱を幹へまとめる (S-51d、開いた時の組み直しの終わり): 浅い箱から見て、幹のある箱を foldInto。
 * 1 つまとめるたびに判定を作り直す (下を消すと見本・中身が変わる)。まとめたら true
 */
export function foldToTrunks(doc: TreeDoc, judge: () => Judge): boolean {
  let changed = false;
  for (let n = 0; n < 64; n++) {
    const j = judge(), cmp = shallow(doc);
    const hit = Object.values(doc.boxes).map((b) => b.id).sort(cmp).map((id) => [id, trunkOf(doc, id, j)] as const).find((x) => !!x[1]);
    if (!hit) return changed;
    foldInto(doc, hit[0], hit[1]!);
    changed = true;
  }
  return changed;
}
/** 手を決めた箱 id のまわりだけ (S-51d を手を決めた時に、S-51c と同じ所): id に幹があれば id を、無ければ id を幹にする深い箱をまとめる */
export function foldAround(doc: TreeDoc, id: string, judge: () => Judge): void {
  const tk = trunkOf(doc, id, judge());
  if (tk) { foldInto(doc, id, tk); return; }
  for (let n = 0; n < 64; n++) {
    const j = judge(), x = Object.values(doc.boxes).find((b) => b.id !== id && trunkOf(doc, b.id, j) === id);
    if (!x) return;
    foldInto(doc, x.id, id);
  }
}

/** 手を決めるたびに自動の ↩ を全部「箱どうし」で見直す (合わない物は外して未設定、S-50b)。人が付けた ↩ は触らない。外したら true */
export function pruneByContent(doc: TreeDoc, j: Judge): boolean {
  let changed = false;
  for (const b of Object.values(doc.boxes)) {
    // ヒネコラのハズレのまとめ (S-39、tree-foresee の foldMisses) は中身で見直さない
    if (!b.autoBack || !b.back || b.seen || b.back === MATCH_BACK || b.back === RESTART || !doc.boxes[b.back]) continue;
    // 「エッセンスと同じ MOD (同格以上)」の既定の統合 (S-33e ⑥、tree-hand-plan の linkSameHi) は中身で見直さない (特例でエッセンスとして扱う)
    if (b.out === "blocked" && b.junkKey === "hi") continue;
    // 人が同じ手を選んで戻った箱 (S-51、handBack) は輪でも人の決めなので外さない。同じ枠の候補が 2 つ以上でも外さない (戻り先はいつも 1 つ、S-52b 11-08 夜)
    // 完成への道の結果から上の段への自動の ↩ は外す (S-50g、スイッチ idealNoBack。人が同じ手で戻った handBack は人の決めなので残す)
    const up = b.handBack ? 0 : idealNoUp(doc, b.id);
    if (!(up && depthOf(doc, b.back) < up) && j.fitsBox(b.id, b.back) && (!!b.handBack || !idleLoop(doc, b.id, b.back, j))) continue;
    b.back = null; delete b.autoBack; delete b.merged;
    changed = true;
  }
  return changed;
}

/** 同じ親の横の結果の箱で中身が同じ物 (手で「まとめる」の相手。当たり以外・手も分かれ目も完成も無い物) */
export function joinableByContent(doc: TreeDoc, id: string, j: Judge): string[] {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : undefined;
  const plain = (c: TreeBox | undefined): boolean => !!c && c.out !== "hit" && c.out !== "start" && c.out !== "pass" && c.out !== "branch";
  if (!b || !p || !plain(b)) return [];
  return p.outs.filter((o) => { const c = doc.boxes[o]; return o !== id && plain(c) && !c!.hand && !c!.split && !c!.done && j.fitsBox(id, o); });
}

/** 回す時に手が打てるか (playHand。乱数の当たり所で弾かれる物は打てる扱い) */
export const canPlay = (data: PatchData, item: StageItem, h: Hand): boolean => { const r = playHand(data, item, { ...h, repeat: null }, mulberry32(1)); return r.applied || !!r.random; };

/**
 * 回す時の行き先 (S-64、人と箱): 着いた箱 at の中身がこの人のアイテムと同じならそのまま、違えば中身の同じ箱 (手のある箱・完成 / 失敗の箱、
 * 手が打てる箱を先に、浅い段・先に作った箱から)、無ければ null = その箱で止まる (未設定)。at = null は「どこか中身の同じ箱」(行き先の無い結果)。
 * aimed = この人の ☑ で付いた狙い (tree-judge の startAimed・nextAimed で回した順に)
 */
export function routeOf(data: PatchData, doc: TreeDoc, j: Judge, at: string | null, item: StageItem, aimed: ReadonlySet<string>): string | null {
  // 完成・失敗の箱に着いた人はそのまま (着いた後に数え直さない、S-05)
  // 決め (手・戻り・完成 / 失敗) の無い箱には留めず、中身の同じ決めのある箱があればそこへ (S-64、古いレシピの組み直しで増えた結果の箱 = 10-29 共有の木 ibMlQuAV・A52PouGg・st0SuDWi)
  const unknownOpen = !!at && !doc.boxes[at]?.hand && !doc.boxes[at]?.back && !doc.boxes[at]?.split;
  // 狙いが消えた箱はどの狙いが消えたかを見ない (箱の鍵と同じ、fitsLost)
  const fits = !!at && (j.fitsItem(item, aimed, at) || (doc.boxes[at]?.out === "lost" && j.fitsLost(item, aimed, at)));
  if (at && (doc.boxes[at]?.done || (fits && !unknownOpen))) return at;
  const all = j.boxesOf(item, aimed);
  if (unknownOpen && !all.length) return at;
  const playable = all.find((id) => { const h = doc.boxes[id]?.hand; return !h || canPlay(data, item, h); });
  // 手の打てる箱が無い人は、打てない箱へ流さず中身の同じ未設定の箱で止まる (その箱を決めれば進む、S-64)
  if (!playable) { const open = unknownOpen ? at : j.openOf(item, aimed)[0]; if (open) return open; }
  return playable ?? all[0] ?? null;
}
