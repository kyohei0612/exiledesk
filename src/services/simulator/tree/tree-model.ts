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

/**
 * any = 狙い無しの手の結果 (何が付いても次へ進む「打った後」、オーナー 10-22 の適当打ち)。
 * pass = 品質だけ上げる手 (カタリスト) の後の通り抜け。画面には箱を描かず、打つ手の札の下に次の手の札 (か＋) をつなぐ
 * (オーナー 10-22「品質だけ上げるくだりがあるでしょ、オーブを打つだけの表示でいいから下に＋」)
 */
export type OutKind = "hit" | "junk" | "junkGone" | "lost" | "any" | "pass";
export type HandKind = "add" | "remove" | "swap" | "spam" | "free" | "quality";
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
/**
 * 段の間 (親の下 → 手の札 → 横の棒 → 子の上。直角の木の線が手の札と重ならない広さ、10-22)。10-22 オーナー「少し詰める」で 210 → 200:
 * 見本の木 (11 行) で 1920 の全体表示が 20 → 25% に乗る一番ゆとりのある値 (201 以下で 25%)。札の下と子の箱の間は 1920 で約 27px・1280 で約 24px
 */
export const GAP_Y = 200;

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
  // 品質だけ上げる (カタリストを最大まで): 結果の箱は無く、通り抜けの 1 つ
  quality: ["pass"],
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
 * aims を渡すと、当たりの箱をその札の数だけ作る (カオススパムの既定 = まだ付いていない狙いを全部)。
 * only = 結果が 1 通りの手 (tree-sample の singleOutOf。光のお告げ + 消去 = 外れが消えただけ など) の時はその箱 1 つだけ
 */
export function setHand(d: TreeDoc, id: string, hand: Hand, kind: HandKind, aims: readonly Aim[] = [], only: { out: OutKind; aim: Aim | null } | null = null): void {
  const b = d.boxes[id];
  if (!b) return;
  const want = only ? [only.out] : OUTS_OF[kind];
  if (only?.aim) aims = [only.aim];
  const now = b.outs.map((o) => d.boxes[o]!.out);
  const same = b.hand && want.every((k) => now.includes(k)) && now.every((k) => k !== "start" && want.includes(k));
  b.hand = { ...hand, omens: [...hand.omens], repeat: hand.repeat ? { ...hand.repeat } : null };
  b.back = null;
  if (same) return;
  for (const o of b.outs) drop(d, subtree(d, o));
  b.outs = want.flatMap((k) => (k === "hit" && aims.length ? aims.map((a) => { const h = mk(d, "hit", id); h.aim = { ...a }; return h.id; }) : [mk(d, k, id).id]));
  // 消えた箱は初めからつないでおく (オーナー 10-22「狙いが消えた…などは自動でつないでおく」。× で外せる)。行き先は人が選ぶのと同じ具体的な箱
  // (10-22 オーナー「続きからって選択肢選べんでしょ」): 狙いが消えた = 始めに戻る (10-22「選択肢として初めに戻るでいいのでは」)、
  // 外れが消えた = 外れの前の箱 (外れの箱の親。外れだけ消えたので、その箱と同じ形)。外れの箱の下でない時は形の合う箱へ。
  // 親が品質だけ上げた後の通り抜けなら、その上の箱 (カタリストを入れ直す所) まで上がる (通り抜けへ戻ると品質が空のまま触媒の手を打つ)
  let before = b.out === "junk" ? b.parent : null;
  while (before && d.boxes[before]?.out === "pass") before = d.boxes[before]!.parent;
  for (const o of b.outs) {
    const c = d.boxes[o]!;
    if (c.out === "lost") c.back = "start";
    else if (c.out === "junkGone") c.back = before ?? MATCH_BACK;
  }
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
const OUT_ORDER: Record<TreeBox["out"], number> = { start: 0, hit: 0, any: 0, pass: 0, lost: 1, junkGone: 2, junk: 3 };
/** 整列の兄弟の間 (横の＋が 14px はみ出す分 + 戻りの線の縦の通り道 4 本分、オーナー 10-22「整列で箱の間に通り道の分のすき間」) */
const TIDY_GAP = 64;
/** 親から 2 行以上下の子へ降りる縦の線の、輪郭に入れる幅 (箱の真ん中から左右) */
const STEM = 20;
/** 段の高さに収める物: "all" = 間の箱を全部 / "path" = 次の当たりへ続く道だけ (戻るだけの箱は次の段の高さまで下がってよい) */
const BAND: "all" | "path" = "path";
/**
 * 箱の行 (y = 行 × GAP_Y。10-22 オーナー「2 つ目までしか完成していないのに、3 つ目まで完成している箱と同じ段にいる。整列させるなら MOD の段を合わせて。
 * 当たりの場合だけ気にすればいい」): 当たりの箱は道で揃った狙いの数 n の段 (全部の枝で同じ高さ)、ほかの箱 (外れ・消えた・打った後・品質の後) は
 * 直前の当たり (か始まり) の何手下かで、その段と次の段の間に置く。段 n の高さ = 1 + その段の間の箱の一番深い手数 (BAND)。
 * 狙いが消えた後の当たりなど、揃った数が親の段以下の時は親の段の次 (高さは揃わない)
 */
function rowsOf(d: TreeDoc, kids: (id: string) => string[]): Map<string, number> {
  const band = new Map<string, number>(), sub = new Map<string, number>(), held = new Map<string, Set<string>>();
  const walk = (id: string, parent: string | null): void => {
    const b = d.boxes[id]!;
    const h = new Set(parent ? held.get(parent)! : []);
    if (b.out === "hit" && b.aim) h.add(aimKey(b.aim));
    held.set(id, h);
    if (!parent) { band.set(id, 0); sub.set(id, 0); }
    else if (b.out === "hit") { band.set(id, Math.max(h.size, band.get(parent)! + 1)); sub.set(id, 0); }
    else { band.set(id, band.get(parent)!); sub.set(id, sub.get(parent)! + 1); }
    for (const k of kids(id)) walk(k, id);
  };
  walk("start", null);
  // 段ごとの高さ (BAND = "path" の時は、次の段の当たりの親だけ数える)
  const deep = new Map<number, number>();
  for (const [id, n] of band) {
    const b = d.boxes[id]!;
    if (BAND === "path" && !b.outs.some((k) => d.boxes[k]!.out === "hit")) continue;
    deep.set(n, Math.max(deep.get(n) ?? 0, sub.get(id)!));
  }
  const top: number[] = [0];
  const max = Math.max(...band.values());
  for (let n = 1; n <= max; n++) top[n] = top[n - 1]! + 1 + (deep.get(n - 1) ?? 0);
  return new Map([...band].map(([id, n]) => [id, top[n]! + sub.get(id)!]));
}
/**
 * 整列 (2026-10-22 オーナー「ごちゃっとなってるのを整列。2 段目を合わせる、矢印が重ならない」):
 * 行 (rowsOf: 当たりの箱は揃った狙いの数の段) ごとに横一列、兄弟は親の下に OUT_ORDER の順。行ごとの輪郭で寄せるので箱は重ならない。
 * 始まりの箱は x = 0 のまま。線は直角の木の線、戻りの矢印は既定では引かない (画面の側、SimTreePage の edges・backLine。10-22 整列の定義)
 */
export function tidy(d: TreeDoc): void {
  const kids = (id: string): string[] => {
    const b = d.boxes[id]!;
    b.outs = b.outs.map((o, i) => ({ o, i })).sort((a, z) => OUT_ORDER[d.boxes[a.o]!.out] - OUT_ORDER[d.boxes[z.o]!.out] || a.i - z.i).map((x) => x.o);
    return b.outs;
  };
  const row = rowsOf(d, kids);
  /**
   * 部分木の輪郭 (行ごとの左端・右端、部分木の頭の箱の x からの差)。兄弟は左から、同じ行で TIDY_GAP 空く所まで寄せる
   * (部分木の幅ごと足すと、深い枝の横の浅い枝の下が空いたまま木が広がった。10-22 見本で全体表示が 25%)。
   * 親から 2 行以上下の子は、間の行に縦の線の幅 (STEM) も入れる (線が隣の箱を通らない)
   */
  type Contour = Map<number, [number, number]>;
  const put = (c: Contour, r: number, l: number, rr: number): void => { const v = c.get(r); c.set(r, v ? [Math.min(v[0], l), Math.max(v[1], rr)] : [l, rr]); };
  const rel = new Map<string, number>();
  const layout = (id: string): Contour => {
    const ks = kids(id), me = row.get(id)!;
    const acc: Contour = new Map();
    const offs: number[] = [];
    for (const k of ks) {
      const c = layout(k);
      for (let r = me + 1; r < row.get(k)!; r++) put(c, r, BOX_W / 2 - STEM, BOX_W / 2 + STEM);
      let off = 0;
      if (offs.length) {
        off = -Infinity;
        for (const [r, [l]] of c) { const a = acc.get(r); if (a) off = Math.max(off, a[1] + TIDY_GAP - l); }
        if (off === -Infinity) off = 0;
      }
      offs.push(off);
      for (const [r, [l, rr]] of c) put(acc, r, l + off, rr + off);
    }
    // 親は一番左と一番右の子の真ん中 (兄弟の並びの中心が親とそろう、10-22 整列の定義)
    const px = ks.length ? (offs[0]! + offs[offs.length - 1]!) / 2 : 0;
    ks.forEach((k, i) => rel.set(k, offs[i]! - px));
    const out: Contour = new Map([[me, [0, BOX_W]]]);
    for (const [r, [l, rr]] of acc) put(out, r, l - px, rr - px);
    return out;
  };
  const place = (id: string, x: number): void => {
    const b = d.boxes[id]!;
    b.x = Math.round(x);
    b.y = row.get(id)! * GAP_Y;
    for (const k of b.outs) place(k, x + rel.get(k)!);
  };
  layout("start");
  place("start", 0);
  // 始まりの箱は x = 0 に戻す (木ごとずらす)
  const dx = -d.boxes.start!.x;
  for (const b of Object.values(d.boxes)) b.x += dx;
}

/**
 * 段の目印 (10-22 オーナー「段ごとに 1 つ揃った / 2 つ揃った…」): 当たりの箱の揃った狙いの数 n → その段の y (箱の上の辺)。
 * 手で動かして同じ数の当たりの箱の高さが揃っていない段は出さない (整列の後だけ出る)
 */
export function bandsOf(d: TreeDoc): { n: number; y: number }[] {
  const ys = new Map<number, Set<number>>();
  for (const b of Object.values(d.boxes)) {
    if (b.out !== "hit") continue;
    const held = new Set<string>();
    for (let x: TreeBox | undefined = b; x; x = x.parent ? d.boxes[x.parent] : undefined) if (x.out === "hit" && x.aim) held.add(aimKey(x.aim));
    ys.set(held.size, (ys.get(held.size) ?? new Set()).add(b.y));
  }
  return [...ys].filter(([, s]) => s.size === 1).map(([n, s]) => ({ n, y: [...s][0]! })).sort((a, z) => a.n - z.n);
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
