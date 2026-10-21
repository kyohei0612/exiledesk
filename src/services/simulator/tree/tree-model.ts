/**
 * tree-model.ts — クラフトの道 (ツリー) の形と組み替え (2026-10-22 オーナー OK「UI の表面だけ作ってやるか」。設計 docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 11)。
 *
 * 箱 = 打った結果 (始まり / 当たり / 外れ / 外れが消えた / 狙いが消えた)。箱の下の矢印 = 次に打つ手 (hand)、矢印の先に結果の箱が横に並ぶ (outs)。
 * 横に並んだ当たりは「どれか 1 つが叶う」。打つ手の種類で必ず付く結果の箱が決まり、消せない (外れの無い手は作れない、オーナー 10-22):
 *   足す手 (高貴) = 当たり + 外れ / 消す手 (消去) = 外れが消えた + 狙いが消えた / 入れ替える手 (カオス) = 当たり + 狙いが消えた + 外れ
 * 戻りの矢印 (back) = 既にある箱を指して、そこの手から続ける。完成 (done) は当たりの箱の印 (完成だけ。妥協は無し、完成か未完成か、オーナー 10-22)。
 * 計算 (100 人回す) はまだ繋がない。ここは形と組み替えだけ (関数は渡した doc を書き換える。1 つ戻すは use-tree.ts が写しで持つ)
 */

import type { TreeTune } from "./tree-tune";

/** any = 狙い無しの手の結果 (何が付いても次へ進む「打った後」、オーナー 10-22 の適当打ち) */
export type OutKind = "hit" | "junk" | "junkGone" | "lost" | "any";
export type HandKind = "add" | "remove" | "swap" | "spam" | "free";
/** 狙い: MOD と段 (tier = T 何以上、1 = T1 だけ)。フラクチャーの時は「その段」 */
export interface Aim { modId: string; tier: number }
/**
 * 繰り返し (2026-10-22 オーナー「外れ・狙いが消えたの行き先に一番使うのがカオススパム」): 当たりのどれかが付くまで同じ手を打ち続ける。
 * max = 打つ回数の上限 (null = 上限なし)。今はカオススパムだけ画面に出すが、高貴をもう一度・消去にも同じ形で付けられる
 */
export interface Repeat { until: "hit"; max: number | null }
/** 札の鍵 (同じ MOD + 同じ段以上 = 同じ札) */
export const aimKey = (a: Aim): string => `${a.modId}|${a.tier}`;
/** 打つ手: カレンシー + お告げ + (触媒の時) カタリストで品質を上げてから。repeat があれば当たるまで繰り返す */
export interface Hand {
  currency: string; omens: string[];
  /** 触媒の高貴の前に入れるカタリスト。品質はいつも今の最大まで (1 押しで)。quality = その箱の見本で入った品質、catalystCount = その時の個数 (費用の目安) */
  catalyst: string | null; quality: number; catalystCount?: number;
  /** 狙い無し (何が付いてもよい、空きを 1 つ埋めるだけ。結果は「打った後」の 1 つ、オーナー 10-22「適当打ちで MOD をただ追加する手」) */
  free?: boolean;
  repeat?: Repeat | null;
}
export interface TreeBox {
  id: string;
  x: number;
  y: number;
  out: OutKind | "start";
  /** 当たりの箱の狙い (選ぶまでは null) */
  aim: Aim | null;
  /** この箱から打つ次の手 (矢印) */
  hand: Hand | null;
  /** 矢印の先の結果の箱 (並び順 = 画面の左から) */
  outs: string[];
  /** 戻りの矢印の先 (hand と一緒には持たない) */
  back: string | null;
  /** 完成の印 (前の版の "compromise" = 妥協は読む時に null = 未完成へ、use-tree の load) */
  done: "main" | null;
  parent: string | null;
  /** 箱ごとの短いメモ (オーナー 10-22、既定は閉じる) */
  note?: string;
  /** × = この箱で付いている MOD のうち要らない物の印 (modId、段は問わない。オーナー 10-22「一度付けた物をバツにする仕組み」) */
  unwanted?: string[];
}
export interface TreeDoc {
  schema: "exiledesk-tree/0";
  base: string;
  itemLevel: number;
  /** 始まりのフラクチャー (選ぶまでは null) */
  fracture: Aim | null;
  /** 始めの形でフラクチャーのほかに付いている乱数の MOD の数 (素の高貴をこの回数打って作る。見本の金の指輪 = 1、無ければ 0。カオスは外せる MOD が要る) */
  startRandom?: number;
  /** エンジンの設定 (触媒の倍率・聖別の倍率・MOD の重み。無い物は既定、tree-tune.ts)。レシピ・共有の URL にも一緒に乗る */
  tune?: TreeTune;
  boxes: Record<string, TreeBox>;
  seq: number;
  /** ツリー全体のメモ */
  note?: string;
  /** メモの窓で自由に足した欲しい MOD (ツリーの当たりとは別。オーナー 10-22「メモでは自由に MOD をメモに入れられる」) */
  memoAims?: Aim[];
  /** メモの窓で自由に足した使うカレンシー (値段のキー: カレンシー・お告げ・カタリスト・骨・エッセンス) */
  memoCurrencies?: string[];
}

export const BOX_W = 196;
export const BOX_H = 112;
const GAP_X = 220;
/** 段の間 (親の下 → 手の札 → 横の棒 → 子の上。直角の木の線が手の札と重ならない広さ、10-22) */
const GAP_Y = 210;

export function newTree(base: string, itemLevel: number): TreeDoc {
  return {
    schema: "exiledesk-tree/0", base, itemLevel, fracture: null, seq: 0,
    boxes: { start: { id: "start", x: 0, y: 0, out: "start", aim: null, hand: null, outs: [], back: null, done: null, parent: null } },
  };
}

/** 戻りの矢印の「形の合う箱へ」(tree-run の MATCH と同じ文字。tree-run は形を読むので、ここは文字だけ持つ) */
export const MATCH_BACK = "match";

/** 結果の箱の並び (手の種類ごとに必ず付く物) */
export const OUTS_OF: Record<HandKind, OutKind[]> = {
  add: ["hit", "junk"],
  remove: ["junkGone", "lost"],
  swap: ["hit", "lost", "junk"],
  // 繰り返し (カオススパム): 当たるまで打つので、結果は当たりだけ
  spam: ["hit"],
  // 狙い無し: 当たり / 外れに分けず、打ったら必ず次の箱へ
  free: ["any"],
};

function mk(d: TreeDoc, out: OutKind, parent: string): TreeBox {
  const id = `b${++d.seq}`;
  const b: TreeBox = { id, x: 0, y: 0, out, aim: null, hand: null, outs: [], back: null, done: null, parent };
  d.boxes[id] = b;
  return b;
}

/** 箱とその下を全部 (戻りの矢印は辿らない) */
function subtree(d: TreeDoc, id: string): string[] {
  const out: string[] = [];
  const walk = (x: string): void => { out.push(x); for (const c of d.boxes[x]?.outs ?? []) walk(c); };
  walk(id);
  return out;
}

function drop(d: TreeDoc, ids: readonly string[]): void {
  const gone = new Set(ids);
  for (const id of ids) delete d.boxes[id];
  for (const b of Object.values(d.boxes)) if (b.back && gone.has(b.back)) b.back = null;
}

/** 矢印の先の箱を親の下に並べ直す (子の下の箱も一緒に動かす) */
export function spread(d: TreeDoc, parentId: string): void {
  const p = d.boxes[parentId];
  if (!p) return;
  const n = p.outs.length;
  p.outs.forEach((id, i) => {
    const b = d.boxes[id]!;
    const x = p.x + (i - (n - 1) / 2) * GAP_X, y = p.y + GAP_Y;
    shift(d, id, x - b.x, y - b.y);
  });
}

/** 重なりとみなす箱の間 (横の＋が 14px はみ出すので、それより広く) */
const ROOM = 24;
/**
 * 足した結果の箱 (親の下の並び) が既にある箱と重なる時は、足した側の並びだけを横にずらして空いた所へ置く (オーナー 10-22
 * 「箱を追加した時に枠が他の箱とかぶったりするから、都度調整してあげて」)。既にある箱 (手で動かした物も) は動かさない
 */
export function makeRoom(d: TreeDoc, parentId: string): void {
  const p = d.boxes[parentId];
  if (!p?.outs.length) return;
  const mine = new Set(p.outs.flatMap((o) => subtree(d, o)));
  const others = Object.values(d.boxes).filter((b) => !mine.has(b.id));
  const hit = (dx: number): boolean => [...mine].some((id) => {
    const b = d.boxes[id]!;
    return others.some((o) => Math.abs(b.x + dx - o.x) < BOX_W + ROOM && Math.abs(b.y - o.y) < BOX_H + ROOM);
  });
  if (!hit(0)) return;
  for (let k = 1; k <= 200; k++) for (const dx of [k * 20, -k * 20]) if (!hit(dx)) { for (const id of p.outs) shift(d, id, dx, 0); return; }
}

/**
 * 重なっている箱を右へ押す (押すのは重なった右側の箱とその下だけ、ほかは動かさない)。横に当たりを足した時 (オーナー 10-22「箱を追加した時に枠が他の箱とかぶる」)
 */
export function pushRight(d: TreeDoc): void {
  for (let n = 0; n < 400; n++) {
    const bs = Object.values(d.boxes);
    let moved = false;
    for (const a of bs) {
      const b = bs.find((x) => x !== a && (x.x > a.x || (x.x === a.x && x.id > a.id)) && x.x - a.x < BOX_W + ROOM && Math.abs(x.y - a.y) < BOX_H + ROOM);
      if (b) { shift(d, b.id, a.x + BOX_W + ROOM - b.x, 0); moved = true; break; }
    }
    if (!moved) return;
  }
}

/** 箱とその下を一緒にずらす */
export function shift(d: TreeDoc, id: string, dx: number, dy: number): void {
  if (!dx && !dy) return;
  for (const x of subtree(d, id)) { const b = d.boxes[x]!; b.x += dx; b.y += dy; }
}

/** 手の種類 (繰り返しの手は spam) */
export const kindOfHand = (h: Hand, base: HandKind): HandKind => (h.repeat ? "spam" : h.free ? "free" : base);

/**
 * 箱の次の手を決める。手の種類が同じなら結果の箱はそのまま、違えば作り直す。
 * aims を渡すと、当たりの箱をその札の数だけ作る (カオススパムの既定 = まだ付いていない狙いを全部)
 */
export function setHand(d: TreeDoc, id: string, hand: Hand, kind: HandKind, aims: readonly Aim[] = []): void {
  const b = d.boxes[id];
  if (!b) return;
  const want = OUTS_OF[kind];
  const now = b.outs.map((o) => d.boxes[o]!.out);
  const same = b.hand && want.every((k) => now.includes(k)) && now.every((k) => k !== "start" && want.includes(k));
  b.hand = { ...hand, omens: [...hand.omens], repeat: hand.repeat ? { ...hand.repeat } : null };
  b.back = null;
  if (same) return;
  for (const o of b.outs) drop(d, subtree(d, o));
  b.outs = want.flatMap((k) => (k === "hit" && aims.length ? aims.map((a) => { const h = mk(d, "hit", id); h.aim = { ...a }; return h.id; }) : [mk(d, k, id).id]));
  // 消えた箱は初めから「形の合う箱へ」でつないでおく (オーナー 10-22「狙いが消えた (フラクチャーだけ = 始まりと同じ形) などは自動でつないでおく」。× で外せる)
  for (const o of b.outs) { const c = d.boxes[o]!; if (c.out === "lost" || c.out === "junkGone") c.back = MATCH_BACK; }
  spread(d, id);
  makeRoom(d, id);
}

/** 次の手を消す (結果の箱と、その下も全部) */
export function clearHand(d: TreeDoc, id: string): void {
  const b = d.boxes[id];
  if (!b) return;
  for (const o of b.outs) drop(d, subtree(d, o));
  b.outs = [];
  b.hand = null;
}

/** 当たりの箱を横に足す (after の右、無ければ当たりの並びの最後) */
export function addHit(d: TreeDoc, parentId: string, after?: string): string | null {
  const p = d.boxes[parentId];
  if (!p?.hand) return null;
  const b = mk(d, "hit", parentId);
  const hits = p.outs.filter((o) => d.boxes[o]!.out === "hit");
  const at = after && p.outs.includes(after) ? p.outs.indexOf(after) + 1 : hits.length ? p.outs.indexOf(hits[hits.length - 1]!) + 1 : 0;
  p.outs.splice(at, 0, b.id);
  // 左隣の箱のすぐ右に置き、重なる箱だけ右へ押す (前は兄弟を全部並べ直して、手で動かした箱も動き、下の箱どうしが重なった)
  const left = at > 0 ? d.boxes[p.outs[at - 1]!]! : null;
  if (left) { b.x = left.x + BOX_W + ROOM + 4; b.y = left.y; } else spread(d, parentId);
  pushRight(d);
  return b.id;
}

/** 消せる箱 = 当たりの箱で、同じ矢印に当たりがほかにもある時だけ (外れ・消えたの箱は消せない) */
export function canRemove(d: TreeDoc, id: string): boolean {
  const b = d.boxes[id];
  if (!b || b.out !== "hit" || !b.parent) return false;
  return d.boxes[b.parent]!.outs.filter((o) => d.boxes[o]!.out === "hit").length > 1;
}

export function removeHit(d: TreeDoc, id: string): void {
  if (!canRemove(d, id)) return;
  const p = d.boxes[d.boxes[id]!.parent!]!;
  p.outs = p.outs.filter((o) => o !== id);
  drop(d, subtree(d, id));
  spread(d, p.id);
}

export function setAim(d: TreeDoc, id: string, aim: Aim | null): void {
  const b = d.boxes[id];
  if (b && b.out === "hit") b.aim = aim ? { ...aim } : null;
}

/** 戻りの矢印 (to = null で外す)。次の手のある箱・自分自身へは張らない */
export function setBack(d: TreeDoc, id: string, to: string | null): void {
  const b = d.boxes[id];
  if (!b || b.out === "start" || b.hand) return;
  if (to && (to === id || !d.boxes[to])) return;
  b.back = to;
  if (to) b.done = null;
}

/** 完成の印 (当たりの箱だけ。次の手・戻りの矢印とは一緒に持たない) */
export function setDone(d: TreeDoc, id: string, v: TreeBox["done"]): void {
  const b = d.boxes[id];
  if (!b || b.out !== "hit" || b.hand || b.back) return;
  b.done = v;
}

/**
 * 見本を作るのに要る所だけの木 (箱の位置・メモ・× の印・メモの窓の札を除く)。JSON の文字なので、同じなら見本を作り直さない
 * (× を押す・メモを書くたびに試し打ちが見本に戻っていた、10-21 本物のマウス)
 */
export function sampleKeyOf(d: TreeDoc): string {
  const boxes = Object.fromEntries(Object.entries(d.boxes).map(([k, b]) => [k, { ...b, x: 0, y: 0, note: undefined, unwanted: undefined }]));
  return JSON.stringify({ ...d, note: undefined, memoAims: undefined, memoCurrencies: undefined, boxes });
}

/** × の印を付ける / 外す */
export function toggleUnwanted(d: TreeDoc, id: string, modId: string): void {
  const b = d.boxes[id];
  if (!b) return;
  const list = b.unwanted ?? [];
  const next = list.includes(modId) ? list.filter((x) => x !== modId) : [...list, modId];
  if (next.length) b.unwanted = next; else delete b.unwanted;
}

/** メモの窓の札を足す / 消す (同じ物は 1 つ) */
export function toggleMemoAim(d: TreeDoc, a: Aim): void {
  const list = d.memoAims ?? [];
  const has = list.some((x) => aimKey(x) === aimKey(a));
  const next = has ? list.filter((x) => aimKey(x) !== aimKey(a)) : [...list, { ...a }];
  if (next.length) d.memoAims = next; else delete d.memoAims;
}
export function toggleMemoCurrency(d: TreeDoc, key: string): void {
  const list = d.memoCurrencies ?? [];
  const next = list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
  if (next.length) d.memoCurrencies = next; else delete d.memoCurrencies;
}
/** ツリーの手で使っている物 (カレンシー・お告げ・カタリスト)。並びは初めて出た順 */
export function handKeysOf(d: TreeDoc): string[] {
  const out: string[] = [];
  const add = (k: string | null | undefined): void => { if (k && !out.includes(k)) out.push(k); };
  for (const b of Object.values(d.boxes)) if (b.hand) { add(b.hand.currency); b.hand.omens.forEach(add); add(b.hand.catalyst); }
  return out;
}
/** その箱の手がこのキーを使っているか (札を押した時に光らせる) */
export const handUses = (b: TreeBox, key: string): boolean => !!b.hand && (b.hand.currency === key || b.hand.omens.includes(key) || b.hand.catalyst === key);

/** メモ (id = null はツリー全体)。空にすると消す */
export function setNote(d: TreeDoc, id: string | null, text: string): void {
  const v = text.trim() ? text : undefined;
  if (id === null) { if (v) d.note = v; else delete d.note; return; }
  const b = d.boxes[id];
  if (!b) return;
  if (v) b.note = v; else delete b.note;
}

/** 整列で兄弟を並べる順 (当たり → 狙いが消えた → 外れが消えた → 外れ。外れは一番右) */
const OUT_ORDER: Record<TreeBox["out"], number> = { start: 0, hit: 0, any: 0, lost: 1, junkGone: 2, junk: 3 };
/** 整列の兄弟の間 (横の＋が 14px はみ出す分 + 戻りの線の縦の通り道 4 本分、オーナー 10-22「整列で箱の間に通り道の分のすき間」) */
const TIDY_GAP = 64;
/** まとめて見せる箱の札 (tidy の pill。画面 TreeMergeLayer と同じ大きさ) */
export const PILL_W = 150, PILL_H = 28;
/**
 * 整列 (2026-10-22 オーナー「ごちゃっとなってるのを整列。2 段目を合わせる、矢印が重ならない」):
 * 段 (始まりからの深さ) ごとに横一列、兄弟は親の下に等間隔 (OUT_ORDER の順)。部分木の幅を先に測ってから並べるので箱は重ならない。
 * 始まりの箱は x = 0 のまま。線は直角の木の線、戻りの矢印は既定では引かない (画面の側、SimTreePage の edges・backLine。10-22 整列の定義)
 * o.pill = まとめて見せる箱 (箱を出さず、子の段の小さな札にする。画面の見え方だけ、10-22 オーナー「やってる事が同じ枠は統合」)。
 * 札は箱より細い幅しか取らないので、段の幅が縮む (x・y は札の左上)
 */
export function tidy(d: TreeDoc, o: { pill?: (id: string) => boolean } = {}): void {
  const isPill = o.pill ?? ((): boolean => false);
  const kids = (id: string): string[] => {
    const b = d.boxes[id]!;
    b.outs = b.outs.map((o, i) => ({ o, i })).sort((a, z) => OUT_ORDER[d.boxes[a.o]!.out] - OUT_ORDER[d.boxes[z.o]!.out] || a.i - z.i).map((x) => x.o);
    return b.outs;
  };
  /** 箱 (か札) の幅 */
  const own = (id: string): number => (isPill(id) ? PILL_W : BOX_W);
  const width = new Map<string, number>();
  const measure = (id: string): number => {
    const ks = isPill(id) ? [] : kids(id);
    const inner = ks.reduce((a, k) => a + measure(k), 0) + TIDY_GAP * Math.max(0, ks.length - 1);
    const w = Math.max(own(id), inner);
    width.set(id, w);
    return w;
  };
  // 親は一番左と一番右の子の真ん中 (兄弟の並びの中心が親とそろう、10-22 整列の定義)。子の部分木の幅の中に収まるので隣とは重ならない
  const mid = (id: string): number => d.boxes[id]!.x + own(id) / 2;
  const place = (id: string, left: number, depth: number): void => {
    const b = d.boxes[id]!, w = width.get(id)!;
    b.y = depth * GAP_Y;
    const ks = isPill(id) ? [] : b.outs;
    const inner = ks.reduce((a, k) => a + width.get(k)!, 0) + TIDY_GAP * Math.max(0, ks.length - 1);
    let l = left + (w - inner) / 2;
    for (const k of ks) { place(k, l, depth + 1); l += width.get(k)! + TIDY_GAP; }
    b.x = ks.length ? Math.round((mid(ks[0]!) + mid(ks[ks.length - 1]!)) / 2 - own(id) / 2) : Math.round(left + w / 2 - own(id) / 2);
  };
  measure("start");
  place("start", 0, 0);
  // 始まりの箱は x = 0 に戻す (木ごとずらす)
  const dx = -d.boxes.start!.x;
  for (const b of Object.values(d.boxes)) b.x += dx;
}

export function moveBox(d: TreeDoc, id: string, x: number, y: number): void {
  const b = d.boxes[id];
  if (b) { b.x = Math.round(x); b.y = Math.round(y); }
}

/** 箱の並びの外枠 (画面の広さ・一望の縮め方) */
export function boundsOf(d: TreeDoc): { x: number; y: number; w: number; h: number } {
  const bs = Object.values(d.boxes);
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + BOX_W)), y1 = Math.max(...bs.map((b) => b.y + BOX_H));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 読み込んだ物が形として使えるか (localStorage の古い物・壊れた物は捨てる) */
export function isTreeDoc(v: unknown): v is TreeDoc {
  const d = v as TreeDoc;
  return !!d && d.schema === "exiledesk-tree/0" && typeof d.boxes === "object" && !!d.boxes?.start && typeof d.seq === "number";
}
