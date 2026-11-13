/**
 * tree-strip-fold.ts — 消去の続きを畳む (S-28g ③、11-06 オーナー「消去は例のごとく2段以上に消去の枝だけでなるなら省略で書いて展開できるように作りたいね。止まったところは必ず表示させて」)。
 * 消去の続き (tree-annul-chain の自動の消去 autoAnnul) のうち、結果がどれも消去で続くだけの箱が 2 段以上並ぶ所を、一番上の箱 (head) の場所に
 * 「消去 × n 段・止まり m」の札 1 枚で描き、ほかの続くだけの箱は描かない。札の下には札の中から出る箱 (止まった結果のある消去の箱・止まった箱) を並べる (head の描く子)。
 * 結果が 1 つでも止まった消去の箱は畳まず、止まった箱をその消去の下に普通に描く (11-08 オーナー「消去単品で止まった枝は畳む中に置かない」)。
 * 畳むのは描く所だけ (並べ方の段と帯・線・箱)。木の中身・回す・精査・保存・「n 段目」の数え (tree-row-tops の depthRows) は触らない。
 * 開いた / 畳んだは覚えない (木を開くたびに畳んだ形、画面が resetStripFolds を呼ぶ)。前の S-28b (全部消えてよい消去の直線) の札の作りをそのまま使う
 */
import { ref, type Ref } from "vue";
import { effectOf } from "./tree-hands";
import type { TreeBox, TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

/** 札の高さ (TreeStripFold。線は札の下の縁から下りる) */
export const FOLD_H = 64;
/** 畳んだ続き: head = 札に描く箱 (根の最初の自動の消去の箱)、mids = 自動の消去の箱全部 (head 込み)、stops = 札の下に並べる止まった箱、steps = 消去の段の数 (根を含む) */
export interface StripFold { head: string; mids: string[]; stops: string[]; steps: number; /** 札の中の箱へまとめた箱 (S-66)。止まった箱に数えず、スイッチ treeFoldMerged の下は畳んでいる間描かない */ tucked: string[];
  /** (S-142j ③、スイッチ hitsSide) 行き先が同じ段か先 (→ 同じ枠へ・→ 同じ中身の箱の続きへ) の畳み: 札も描かず、親の手の札から行き先の箱へ直に線 */ link?: true;
  /** 行き先を指すだけの兄弟をまとめた 1 行 (S-142j ②、スイッチ hitsSide)。mids = まとめた箱 (head = 1 つ目の場所に札)、stops は無し */ ends?: true }

/** 開いた続き (head の id)。保存しない */
const ownOpen = ref<ReadonlySet<string>>(new Set());
let openNow: Ref<ReadonlySet<string>> = ownOpen;
/**
 * 今出ている木の印を指す。スイッチ tabKeep (S-09c) の間は描き面ごとに印を持ち、出ている面の物へ差し替える (useStripOpen)。
 * 読んだ面の印だけを追うので、隠れた面の畳みの数えはほかのタブの開け閉めで作り直されない
 */
export const stripOpen = { get value(): ReadonlySet<string> { return openNow.value; }, set value(s: ReadonlySet<string>) { openNow.value = s; } };
/** 出ている描き面の印へ差し替える (null = ページに 1 つの印) */
export const useStripOpen = (r: Ref<ReadonlySet<string>> | null): void => { openNow = r ?? ownOpen; };
export const resetStripFolds = (): void => { if (stripOpen.value.size) stripOpen.value = new Set(); };
export function toggleStripFold(head: string): void {
  const s = new Set(stripOpen.value);
  if (!s.delete(head)) s.add(head);
  stripOpen.value = s;
}

const isAnnul = (b: TreeBox | undefined): boolean => !!b?.hand && effectOf(b.hand.currency) === "remove";
/** 消去の続きの自動の手の箱 */
const inner = (b: TreeBox | undefined): boolean => !!b?.autoAnnul && isAnnul(b);

/**
 * 止まらずに続くだけの自動の消去の箱 (結果がどれも自動の消去かまとめの箱)。消去 1 回で止まった結果がある箱は畳まず普通に描き、
 * 止まった箱をその消去の下に出す (11-08 オーナー「消去単品で止まった枝は畳む中に置かない」)
 */
const through = (d: TreeDoc, b: TreeBox | undefined): boolean => inner(b) && (oneBranch() || b!.outs.every((o) => inner(d.boxes[o]) || !!d.boxes[o]?.merged));
/**
 * (S-28g ⑤、スイッチ treeNoAnnulAuto、開発版だけ) 自動の消去の続きは 1 段でも・1 回で止まった枝も札 1 枚に畳み、止まった箱だけ下に並べる
 * (11-12 オーナー「止まるところまでその際止まるところまで1枝でいいんじゃねって思うけど。」。このスイッチの下では上の 11-08 の「消去単品で止まった枝は畳まない」と「2 段以上」を変える)
 */
const oneBranch = (): boolean => flag("treeNoAnnulAuto");

/** 畳める続きを全部 (開いた物も)。head → 畳み */
export function stripChains(d: TreeDoc): Map<string, StripFold> {
  const out = new Map<string, StripFold>();
  for (const h of Object.values(d.boxes)) {
    // head = 止まらずに続く箱の並びの一番上 (親は続くだけの箱でない)。続くだけの箱が 2 段以上の時だけ畳む (S-28g ③)
    if (!through(d, h) || through(d, d.boxes[h.parent ?? ""])) continue;
    const mids: string[] = [], stops: string[] = [];
    let steps = 0;
    const walk = (id: string, n: number): void => {
      const b = d.boxes[id];
      if (!b) return;
      if (!through(d, b)) { stops.push(id); return; }
      mids.push(id); steps = Math.max(steps, n);
      for (const o of b.outs) walk(o, n + 1);
    };
    walk(h.id, 1);
    // 1 段だけの続きは畳まず箱をそのまま並べる (スイッチ annulFoldTwo、11-13 オーナー「ここまできたら省略とかいらんだろうな」。閉じている間は treeNoAnnulAuto の下で 1 段も畳む)
    if (steps < 2 && (!oneBranch() || flag("annulFoldTwo"))) continue;
    // 畳んだ中の箱へまとめた箱 (同じ段のまとめ S-66) は札の中 = 止まった箱にしない。線の先に描かない箱が混ざると札の線ごと消えた (11-06 MISV6HZL、オーナー「普通に線が消えてね」)
    const inside = new Set(mids);
    const tuck = (id: string): boolean => { const b = d.boxes[id]!; return !!(b.merged && b.back && inside.has(b.back)); };
    out.set(h.id, { head: h.id, mids, stops: stops.filter((id) => !tuck(id)), steps, tucked: stops.filter(tuck) });
  }
  // (S-142j ②、スイッチ hitsSide。前のスイッチ foldEnds は 11-14 にここへまとめた) 行き先を指すだけの箱は 1 つでも 1 行の札に畳む
  // (11-14 オーナー「2段以上ならまとめたるか」「もはや1段も同じ枠あるから非表示でいいだろうし」)
  if (flag("hitsSide")) for (const b of Object.values(d.boxes)) {
    const ends = b.outs.filter((o) => backOnly(d.boxes[o]));
    // その手の子に未設定 (手も行き先も無い・完成でない) が 1 つでもあれば畳まない (11-14 オーナー「そもそも未設定あるならたたまないけど」)
    if (b.outs.some((o) => unset(d.boxes[o]))) continue;
    if (!ends.length || ends.some((id) => out.has(id))) continue;
    // 行き先が同じ段か先の箱は札も出さず直に線 (11-14 オーナー「表示せず枠を」「同じ枠系はそのごの枠へつなげばいいのでは」)、前の段へ戻る (↩) は段の右端の札
    const links = ends.filter((id) => ahead(d, id)), backs = ends.filter((id) => !ahead(d, id));
    if (links.length) out.set(links[0]!, { head: links[0]!, mids: links, stops: [], steps: 0, tucked: [], ends: true, link: true });
    if (backs.length) out.set(backs[0]!, { head: backs[0]!, mids: backs, stops: [], steps: 0, tucked: [], ends: true });
  }
  return out;
}
/**
 * (S-142j ②、スイッチ hitsSide) 畳む箱 = 行き先を指すだけで下に何も無い箱 (当たりの → 同じ中身の箱の続きへ・同じ枠へ・↩、完成でない・手も下も無い)。
 * 自分の下に続きを持つ当たりは畳まない (11-14 オーナー「これもたたむし」)
 */
const backOnly = (c: TreeBox | undefined): boolean => !!c && !!c.back && !c.done && !c.hand && !c.outs.length && c.out !== "pass";
const depthOf = (d: TreeDoc, id: string): number => { let n = 0; for (let b = d.boxes[id]; b?.parent; b = d.boxes[b.parent]) n++; return n; };
/** 行き先が同じ段か先の箱 (→ 同じ枠へ・→ 同じ中身の箱の続きへ。tree-fail の isForward と同じ見方、↩ は前の段) */
const ahead = (d: TreeDoc, id: string): boolean => { const c = d.boxes[id], t = d.boxes[c?.back ?? ""]; return !!t && t.id !== "start" && depthOf(d, t.id) >= depthOf(d, id); };
/** (S-142j ③) 札を描かず直に線を引く畳み: 親の箱 → 行き先の箱 (重なりは 1 つ) */
export function linkTargets(d: TreeDoc, folds = stripFolds(d)): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of folds.values()) if (f.link) for (const id of f.mids) { const c = d.boxes[id]; if (!c?.parent || !c.back || !d.boxes[c.back]) continue; const l = m.get(c.parent) ?? []; if (!l.includes(c.back)) l.push(c.back); m.set(c.parent, l); }
  return m;
}
/** 未設定の子 (手も行き先も無い・完成でない・通り抜けでない) */
const unset = (c: TreeBox | undefined): boolean => !!c && !c.hand && !c.back && !c.done && c.out !== "pass" && !c.outs.length;
/** 今畳んでいる続き (開いた物を除く) */
export const stripFolds = (d: TreeDoc): Map<string, StripFold> => {
  const all = stripChains(d), open = stripOpen.value;
  for (const k of [...all.keys()]) if (open.has(k)) all.delete(k);
  return all;
};
/** 描かない箱 (畳んだ続きの head 以外の自動の消去の箱) */
export function stripHidden(d: TreeDoc, folds = stripFolds(d)): Set<string> {
  const s = new Set<string>();
  for (const f of folds.values()) for (const id of f.mids) if (id !== f.head || f.link) s.add(id); // 直に線の畳みは札も描かない
  // 札の中の箱へまとめた箱は、親も行き先も描かないので一緒に描かない (前は親子の線なしで札の横に浮いた。S-28g ③、11-12)
  if (flag("treeFoldMerged")) for (const f of folds.values()) for (const id of f.tucked) s.add(id);
  return s;
}
/** 描く子 (札は止まった箱全部、描かない箱は子無し。札の親はそのまま = 札は親の子の箱の場所) */
export function foldOuts(d: TreeDoc, b: TreeBox, folds = stripFolds(d), hidden = stripHidden(d, folds)): string[] {
  if (hidden.has(b.id)) return [];
  return (folds.get(b.id)?.stops ?? b.outs).filter((o) => !hidden.has(o)); // まとめた兄弟 (S-142j ②) は親の子から外す
}
/** 止まった箱 → 札 (線を札から引く。スマホの全体図) */
export const stopToHead = (folds: ReadonlyMap<string, StripFold>): Map<string, string> => new Map([...folds.values()].flatMap((f) => f.stops.map((s) => [s, f.head] as const)));
/** その箱を隠している畳んだ続き (寄る前に開く用) */
export const foldOf = (d: TreeDoc, id: string): StripFold | null => [...stripFolds(d).values()].find((f) => (f.mids.includes(id) && f.head !== id) || (flag("treeFoldMerged") && f.tucked.includes(id))) ?? null;
/** 並べ方の変わる時に掛け直す鍵 (開いた / 畳んだを含む) */
export const stripFoldKey = (d: TreeDoc): string => [...stripFolds(d).keys()].join("+");
