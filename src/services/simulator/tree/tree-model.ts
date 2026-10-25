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
import { mayHoldAim } from "./tree-lost";

/**
 * any = 狙い無しの手の結果 (何が付いても次へ進む「打った後」、オーナー 10-22 の適当打ち)。
 * pass = 品質だけ上げる手 (カタリスト) の後の通り抜け。画面には箱を描かず、打つ手の札の下に次の手の札 (か＋) をつなぐ
 * (オーナー 10-22「品質だけ上げるくだりがあるでしょ、オーブを打つだけの表示でいいから下に＋」)
 */
export type OutKind = "hit" | "junk" | "junkGone" | "lost" | "any" | "pass" | "branch";
/** fracture = フラクチャーのオーブ (10-22 オーナー「フラクチャーする所から回す」。結果 = 狙いが ✦ になった / 外れが ✦ になった) */
export type HandKind = "add" | "remove" | "swap" | "spam" | "free" | "quality" | "essence" | "fracture";
/** 狙い: MOD と段 (tier = T 何以上、1 = T1 だけ)。フラクチャーの時は「その段」 */
export interface Aim { modId: string; tier: number; /** フラクチャーの印 (完成の狙いだけ。印の MOD のどれか 1 つが ✦ のレアからスタート、10-23 オーナー) */ fractured?: true }
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
  /** フラクチャーの手で ✦ にする MOD (狙いの modId。10-22 オーナー「設定次第でどの MOD がフラクチャーされるか選べる」)。無ければ乱数 = エンジンどおり。その MOD が付いていない時も乱数 */
  fractureOf?: string;
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
  /** 戻りの矢印を同じ形の箱へ自動でつないだ (tree-run の linkSameShape。手で替えると外す) */
  autoBack?: true;
  /** 分かれ目 (打たずに分ける、10-22 オーナー OK): 行を上から見て最初に合った行の箱へ進む。hand・back・done・outs とは一緒に持たない。最後の行は「それ以外」(when が空) */
  split?: SplitRule[];
  /** 狙いを持って着く人がいないので「狙いが消えた」の結果の箱を作らなかった (tree-lost.ts。持って着く道ができたら healLost が足す) */
  noLost?: true;
}
/** 分かれ目の条件の範囲 [下, 上] (上は 99 で「以上」) */
export type SplitRange = [number, number];
/** 分かれ目の 1 行の条件 (tree-run の splitTo が読む。全部満たした時に合う。空 = それ以外) */
export interface SplitWhen {
  /** 付いている狙いの数 */
  heldCount?: SplitRange;
  /** 全部付いている狙い (aimKey) */
  has?: string[];
  /** どれも付いていない狙い (aimKey) */
  lacks?: string[];
  /** 外れ (固定でも狙いでもない MOD) の数 */
  junk?: { prefix?: SplitRange; suffix?: SplitRange; any?: SplitRange };
  /** 固定でない MOD の数 */
  free?: { prefix?: SplitRange; suffix?: SplitRange; any?: SplitRange };
}
/** 分かれ目の 1 行 (to = 行き先の箱。画面で選ぶまでは null = そこへ来た人は止まる) */
export interface SplitRule { when: SplitWhen; to: string | null }
/** 始まりの MOD 1 つ (段は指名。fractured = フラクチャー済み、1 つまで) */
export interface StartMod { modId: string; tier: number; fractured?: true }
/**
 * 始まりの形。ツリーはフラクチャーの後だけを扱う (オーナー 10-22) ので画面はレアだけ。magic はフラクチャーが要らない別軸で使い回せるよう残す
 * (フラクチャーがあればレア、エンジンの決まり 10-06)。runes = 先に差すルーン (英語名。セールの凱旋・コルの狩りなど)。ルーンの MOD は force がそのルーンも差す
 */
/** レアリティ (ノーマルの始まり = MOD 無しの白いベース、10-22 オーナー「ノーマルからも始められるように」) */
export type TreeRarity = "normal" | "magic" | "rare";
/** price = この始め方のベースを取引所で買う値段 (神、手入力。結果のまとめで入れる、10-22 オーナー「どの始め方が安いかは結果のまとめで」)。prices は前の版の始め方ごとの値段 */
/** フラクチャーの始め方 (10-24 夜オーナー): fractured = フラクチャー済みを買う、four = フラクチャー前 (4 MOD のレア) から。必ず成功として 1/3 で素材とオーブ ×3 (tree-base-cost の four) */
export type StartFrom = "fractured" | "four";
export interface TreeStart { rarity: TreeRarity; mods: StartMod[]; runes?: string[]; prices?: TreeBasePrices; price?: number; from?: StartFrom }
/** 始め方ごとのベースの値段 (神、手入力。入れていない物は無い)。始まりの箱のベースの値段を比べる tree-base-cost.ts で使う */
export interface TreeBasePrices { white?: number; four?: number; fractured?: number }
export interface TreeDoc {
  schema: "exiledesk-tree/0";
  base: string;
  itemLevel: number;
  /** 完成形のレアリティ (0 完成形の設定の箱。無ければレア。スタートの箱の start.rarity とは別、10-22 オーナー) */
  goal?: { rarity: TreeRarity };
  /** アイテムレベルの「適正」(狙いの段が全部付く一番低いレベルに自動で合わせる、オーナー 10-22)。手で数を入れたら外れる。新しい木は既定で入り */
  ilvlFit?: boolean;
  /** ベースを選んだ (完成形の設定でベースを押した・2 へ進んだ・エミュから来た)。白紙の木でも、これがあれば開いた時にベース選びを出さない (10-23) */
  baseChosen?: true;
  /** 前の版の始まりのフラクチャー (読み込みで start へ移す。startOf は両方読む) */
  fracture?: Aim | null;
  /** 始まりの形 (レアリティと付いている MOD。10-22 オーナー「始まりの MOD を決めさせる、ほかは自由」)。無ければ fracture から (startOf) */
  start?: TreeStart;
  /** 始めの形で start の MOD のほかに付いている乱数の MOD の数 (レアは素の高貴、マジックは増強をこの回数打って作る。見本の金の指輪 = 1、無ければ 0。カオスは外せる MOD が要る) */
  startRandom?: number;
  /** エンジンの設定 (触媒の倍率・聖別の倍率・MOD の重み。無い物は既定、tree-tune.ts)。レシピ・共有の URL にも一緒に乗る */
  tune?: TreeTune;
  /** タブの番号 (ツリー①…、空いている一番小さい番号) と人が付けた名前 (タブのダブルクリック、10-24 夜オーナー)。use-tree の tabLabel */ tabNo?: number; tabName?: string;
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

/** 始まりの形 (前の版の fracture だけの木はフラクチャー 1 つのレア) */
export const startOf = (d: TreeDoc): TreeStart => d.start ?? { rarity: "rare", mods: d.fracture ? [{ ...d.fracture, fractured: true }] : [] };
/** フラクチャーの印 (完成の狙いのうち ✦ の候補。どれか 1 つが固定されればよい、10-23 オーナー) */
export const fractureMarks = (d: TreeDoc): Aim[] => (d.memoAims ?? []).filter((a) => a.fractured);
/** 印があってもフラクチャー前から (start.from four) は白 (ノーマル) から始める (10-24 夜オーナー「後者選んだ場合必ず白からはじまる」)。true = ✦ の付いたレアから */
export const startsFractured = (d: TreeDoc): boolean => fractureMarks(d).length > 0 && d.start?.from !== "four";
/**
 * 印ありのスタートの外れの数 (10-25 オーナー「フラクチャーから開始ってのはそのフラクチャーしかない状態で始めて欲しい、外れは自分で付ける」で 3 → 0。
 * 前は ✦ 1 + 外れ 3 = フラクチャーのオーブを打てる MOD 4 つのレア、10-23)。＋で足した MOD はそのまま付く
 */
export const START_JUNK = 0;
/**
 * スタートのレアリティ (10-23 オーナー「切り替えのボタンは置かず印で決まる」): 印あり = レア (✦ + 外れ)、
 * 印なし = ＋ で足した MOD が無ければノーマル (白)、あればレア (完成形がマジックならマジック)
 */
export function startRarity(d: TreeDoc): TreeRarity {
  if (startsFractured(d)) return "rare";
  if (fractureMarks(d).length) return "normal";
  if (!startOf(d).mods.length) return "normal";
  return d.goal?.rarity === "magic" ? "magic" : "rare";
}
/**
 * 前の版の形を今の形へ (読み込み・開く時): fracture → start、始まりの MOD の ✦ → 完成の狙いの印 (無ければ狙いに足す)。
 * 乱数の MOD の数 (startRandom) はやめた (印あり = 外れ 3、印なし = 白、10-23 オーナー)
 */
export function migrateStart(d: TreeDoc): void {
  const st = startOf(d);
  const fr = st.mods.filter((m) => m.fractured);
  if (fr.length) {
    const list = d.memoAims ?? [];
    for (const m of fr) { const g = list.find((a) => a.modId === m.modId); if (g) { g.tier = m.tier; g.fractured = true; } else list.push({ modId: m.modId, tier: m.tier, fractured: true }); }
    d.memoAims = list;
  }
  d.start = { ...st, mods: st.mods.filter((m) => !m.fractured) };
  delete d.fracture;
  delete d.startRandom;
  d.start.rarity = startRarity(d);
}
export function newTree(base: string, itemLevel: number): TreeDoc {
  return {
    schema: "exiledesk-tree/0", base, itemLevel, ilvlFit: true, start: { rarity: "rare", mods: [] }, seq: 0,
    boxes: { start: { id: "start", x: 0, y: 0, out: "start", aim: null, hand: null, outs: [], back: null, done: null, parent: null } },
  };
}

/** 戻りの矢印の「形の合う箱へ」(tree-run の MATCH と同じ文字。tree-run は形を読むので、ここは文字だけ持つ) */
export const MATCH_BACK = "match";

/** 結果の箱の並び (手の種類ごとに必ず付く物) */
const OUTS_OF: Record<HandKind, OutKind[]> = {
  add: ["hit", "junk"],
  // フラクチャー: 狙いが ✦ になった (当たり、札 = その狙い) だけ。必ず選んだ狙いを固定し、外れは費用で数える (10-24 オーナー「2 回外れて 1 回当たり」、tree-run の FRACTURE_MISS)
  fracture: ["hit"],
  remove: ["junkGone", "lost"],
  swap: ["hit", "lost", "junk"],
  // 繰り返し (カオススパム): 当たるまで打つので、結果は当たりだけ
  spam: ["hit"],
  // 狙い無し: 当たり / 外れに分けず、打ったら必ず次の箱へ
  free: ["any"],
  // 品質だけ上げる (カタリストを最大まで): 結果の箱は無く、通り抜けの 1 つ
  quality: ["pass"],
  // エッセンス (10-22 オーナー「エッセンスの道」): 付く MOD は必ず付く (当たりの箱の札 = その MOD)。分けるのは何が消えたか =
  // 付いた (何も消えない・外れが消えた) / 狙いが消えた (付いた MOD はある)。消えない種類は 1 通りの判定で箱 1 つ
  essence: ["hit", "lost"],
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
  for (const b of Object.values(d.boxes)) {
    if (b.back && gone.has(b.back)) b.back = null;
    for (const r of b.split ?? []) if (r.to && gone.has(r.to)) r.to = null;
  }
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
function makeRoom(d: TreeDoc, parentId: string): void {
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
function pushRight(d: TreeDoc): void {
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
  const now = b.outs.map((o) => d.boxes[o]!.out);
  // 消せる狙いを持って着く人がいなければ「狙いが消えた」は起きない (10-24 モンキー初めての人の回 6)。前から箱がある木は替えない (同じ手を選び直して下が消えないように)
  const kept = !!b.hand && now.includes("lost") && now.every((k) => k !== "start" && OUTS_OF[kind].includes(k));
  const noLost = !only && OUTS_OF[kind].includes("lost") && OUTS_OF[kind].length > 1 && !kept && !mayHoldAim(d, id);
  const want = only ? [only.out] : noLost ? OUTS_OF[kind].filter((k) => k !== "lost") : OUTS_OF[kind];
  if (only?.aim) aims = [only.aim];
  if (noLost) b.noLost = true; else delete b.noLost;
  const same = b.hand && want.every((k) => now.includes(k)) && now.every((k) => k !== "start" && want.includes(k));
  b.hand = { ...hand, omens: [...hand.omens], repeat: hand.repeat ? { ...hand.repeat } : null };
  b.back = null;
  delete b.split;
  delete b.autoBack;
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
  healLost(d);
}

/** 「狙いが消えた」を作らなかった箱に、狙いを持って着く道ができたら足す (外れの箱の前・始めに戻る。足した箱が始めへ戻るので、増えなくなるまで) */
export function healLost(d: TreeDoc): void {
  for (let more = true, n = 0; more && n < 20; n++) {
    more = false;
    for (const b of Object.values(d.boxes)) {
      if (!b.noLost || !b.hand || !mayHoldAim(d, b.id)) continue;
      delete b.noLost;
      const c = mk(d, "lost", b.id);
      c.back = "start";
      const j = b.outs.findIndex((o) => d.boxes[o]?.out === "junk");
      b.outs.splice(j < 0 ? b.outs.length : j, 0, c.id);
      spread(d, b.id);
      makeRoom(d, b.id);
      more = true;
    }
  }
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
  delete b.autoBack;
  if (to) { b.done = null; delete b.split; healLost(d); }
}

/** 完成の印 (当たりの箱だけ。次の手・戻りの矢印とは一緒に持たない) */
export function setDone(d: TreeDoc, id: string, v: TreeBox["done"]): void {
  const b = d.boxes[id];
  // 分かれ目の行の箱 (branch) も完成にできる (「狙いが 2 つ以上 → 完成」)
  if (!b || (b.out !== "hit" && b.out !== "branch") || b.hand || b.back || b.split) return;
  b.done = v;
}

/**
 * 分かれ目にする (打たずに分ける、10-22 オーナー OK)。次の手・戻り・完成は外し、下の箱は消す。行ごとに下の箱 (branch) を 1 つ持ち、
 * その箱に次の手か戻りの矢印を付ける (既にある箱へ行くのは、その箱の「↩ 戻り先」で)。行は「それ以外」の 1 行から。始まりの箱は分かれ目にしない
 */
export function setSplit(d: TreeDoc, id: string): void {
  const b = d.boxes[id];
  if (!b || b.out === "start" || b.split) return;
  for (const o of b.outs) drop(d, subtree(d, o));
  b.hand = null;
  b.back = null;
  delete b.autoBack;
  b.done = null;
  const c = mk(d, "branch", id);
  b.outs = [c.id];
  b.split = [{ when: {}, to: c.id }];
  spread(d, id);
  makeRoom(d, id);
}
/** 分かれ目をやめる (行の箱とその下を消して、ふつうの箱に戻す) */
export function clearSplit(d: TreeDoc, id: string): void {
  const b = d.boxes[id];
  if (!b?.split) return;
  for (const o of b.outs) drop(d, subtree(d, o));
  b.outs = [];
  delete b.split;
}
/** 分かれ目に行を足す (「それ以外」の前。行の箱も 1 つ作る) */
export function addSplitRow(d: TreeDoc, id: string, when: SplitWhen): void {
  const b = d.boxes[id];
  if (!b?.split) return;
  const c = mk(d, "branch", id);
  b.split.splice(b.split.length - 1, 0, { when: JSON.parse(JSON.stringify(when)) as SplitWhen, to: c.id });
  b.outs = b.split.map((r) => r.to!).filter((x) => !!d.boxes[x]);
  spread(d, id);
  makeRoom(d, id);
}
/** 分かれ目の i 行目の条件を替える (「それ以外」の行は替えない) */
export function setSplitWhen(d: TreeDoc, id: string, i: number, when: SplitWhen): void {
  const b = d.boxes[id];
  if (!b?.split || i >= b.split.length - 1) return;
  b.split[i]!.when = JSON.parse(JSON.stringify(when)) as SplitWhen;
}
/** 分かれ目の i 行目を消す (行の箱とその下も。「それ以外」の行は消さない) */
export function removeSplitRow(d: TreeDoc, id: string, i: number): void {
  const b = d.boxes[id];
  if (!b?.split || i >= b.split.length - 1) return;
  const [r] = b.split.splice(i, 1);
  if (r?.to && b.outs.includes(r.to)) drop(d, subtree(d, r.to));
  b.outs = b.outs.filter((o) => o !== r?.to);
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
