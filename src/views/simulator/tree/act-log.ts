/**
 * act-log.ts — 置いた順の記録 (S-104c、スイッチ actLog、開発版だけ。オーナー 11-14「すすめて」「デイリーのバグで再現がこっちで出来んとあかんやろ」「シミュにも言えるけど」)。
 * シミュの木の画面 (デイリーの挑戦の木も同じ SimTreePage) で木が変わるたびに、保存の形 (S-104) の差分を 1 行ずつ残す。番号でなく道の札 (S-106) で指すので、
 * こちらは白紙の前提から行を順に置き直せば、その人の置いた順どおりに組み直せる (台本 scripts/sim-watch/act-replay.mjs)。
 *   { ms: 時刻, k: "open", app: 版, build: 組み方の版 (S-104b) }   画面を開いた
 *   { ms, k: "snap", r: 保存の形 (前提 + picks) }                         読み込みの後・記録を縮めた時の丸ごとの形 (ここから続きを置ける)
 *   { ms, k: "base", r: 前提 (picks の無い保存の形) }                      ベース・完成形・始め方などが変わった
 *   { ms, k: "p", p: 箱 1 つの決め (RecipePick), boxes }                   決めを足した・替えた (狙い ☑ だけの替えも)
 *   { ms, k: "p-", at: 道の札, boxes }                                     決めが消えた
 * 消去の続きの自動の手は保存の形と同じく出さない (開く時に決まりで作り直る)。端末に 24 時間残し (名前は入れない、Y-62)、要望の窓が actLogNow / actLogCode で読む。
 * デイリーは actLogSubscribe で同じ行を受けて挑戦中の控え (D-57b) へも送る (デイリーの持ち物 daily-live.ts)
 */
import { onBeforeUnmount, watch, type Ref } from "vue";
import pkg from "../../../../package.json";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { toRecipeV1, type RecipePick } from "../../../services/simulator/tree/tree-recipe-v1";
import { TREE_BUILD } from "../../../services/simulator/tree/tree-built";
import { flag } from "../../../web/release-flags";

/** 時刻の無い 1 行 (受け手が時刻・秒を付ける) */
export type ActStepLine = { k: "open" | "snap" | "base" | "p" | "p-" } & Record<string, unknown>;
export type ActLine = ActStepLine & { ms: number };
type Saved = { at: number; lines: ActLine[] };

const KEY = "exiledesk.tree.act-log";
/** 端末に残す長さ (古い記録は要望に付けない) */
const KEEP_MS = 24 * 60 * 60 * 1000;
/** 端末に残す大きさ (JSON の字数)。超えたら古い方を捨て、頭に今の丸ごとの形 (snap) を置き直す */
const MAX_CHARS = 400_000;
/** 書くまでの間 (手を置くたびに端末へ書かない) */
const SAVE_MS = 1000;

let lines: ActLine[] = [];
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<(l: ActLine) => void>();

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    lines = j && Array.isArray(j.lines) && typeof j.at === "number" && Date.now() - j.at <= KEEP_MS ? j.lines : [];
  } catch { lines = []; }
}
function saveSoon(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, SAVE_MS);
}
function saveNow(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), lines } satisfies Saved)); } catch { /* 書けなくても組める */ }
}
function push(l: ActLine): void {
  lines.push(l);
  for (const f of subs) { try { f(l); } catch { /* 受け手の失敗で記録を止めない */ } }
  saveSoon();
}

/** 保存の形から前提 (picks・要確認・写し・名前の無い形) と、道の札 → 決めの表 */
function split(d: TreeDoc): { base: string; picks: Map<string, string>; rec: TreeDoc } {
  const rec = toRecipeV1(d);
  const { picks: _p, orphans: _o, built: _b, name: _n, ...rest } = rec as TreeDoc & { built?: unknown; name?: unknown };
  return { base: JSON.stringify(rest), picks: new Map((rec.picks ?? []).map((p: RecipePick) => [p.at, JSON.stringify(p)])), rec };
}

/** 大きくなりすぎたら古い方を捨て、頭に今の丸ごとの形を置く (そこから続きを置ける) */
function trim(d: TreeDoc): void {
  let n = JSON.stringify(lines).length;
  if (n <= MAX_CHARS) return;
  const snap: ActLine = { ms: Date.now(), k: "snap", r: clone(toRecipeV1(d)) };
  let i = 0;
  while (i < lines.length && n > MAX_CHARS * 0.7) { n -= JSON.stringify(lines[i]).length + 1; i++; }
  lines = [snap, ...lines.slice(i)];
}

/** 前の木の見比べの控え (actLogStep が返し、次に渡す) */
export type ActPrev = ReturnType<typeof split>;

/**
 * 純粋な見比べ: 前の控え (無ければ null) と今の木から、足す行と次の控えを返す。prev が null なら丸ごとの形 (snap) の 1 行。
 * 前提が変われば base、消えた決めを先に p- (上の手を替えて下ごと消えた分を置き直す時に先に外す)、足した・替えた決めは上の段から p (道の札の並び = 親が先)
 */
export function actLogStep(prev: ActPrev | null, d: TreeDoc): { lines: ActStepLine[]; prev: ActPrev } {
  const now = split(d), boxes = Object.keys(d.boxes).length, out: ActStepLine[] = [];
  if (!prev) return { lines: [{ k: "snap", r: clone(now.rec) }], prev: now };
  if (now.base !== prev.base) out.push({ k: "base", r: JSON.parse(now.base) as unknown });
  for (const at of prev.picks.keys()) if (!now.picks.has(at)) out.push({ k: "p-", at, boxes });
  for (const [at, s] of now.picks) if (prev.picks.get(at) !== s) out.push({ k: "p", p: JSON.parse(s) as unknown, boxes });
  return { lines: out, prev: now };
}
/** 開いた行 (版・組み方の版)。デイリーの挑戦中の控えも同じ物を */
export const actLogOpen = (): ActStepLine => ({ k: "open", app: pkg.version, build: TREE_BUILD });

/**
 * 木の画面で呼ぶ (SimTreePage)。開いている間 (loading) は見比べず、開き終わったら丸ごとの形を 1 行。その後は木が変わるたびに前と見比べて行を足す
 */
export function useActLog(doc: Ref<TreeDoc>, loading: Ref<boolean>): void {
  if (!flag("actLog")) return;
  load();
  let prev: ActPrev | null = null;
  push({ ms: Date.now(), ...actLogOpen() });
  const look = (): void => {
    if (loading.value) { prev = null; return; }
    const r = actLogStep(prev, doc.value), ms = Date.now();
    for (const l of r.lines) push({ ms, ...l });
    prev = r.prev;
    trim(doc.value);
  };
  watch([doc, loading], look, { deep: true, immediate: true, flush: "post" });
  onBeforeUnmount(saveNow);
}

/** 行が増えるたびに呼ぶ (デイリーの挑戦中の控え D-57b へ送る口)。戻り値で外す */
export function actLogSubscribe(f: (l: ActLine) => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

/** 要望の窓から: 端末に残っている記録 (無い・古いなら null) */
export function actLogNow(): { at: number; app: string; lines: ActLine[] } | null {
  load();
  if (!lines.length) return null;
  return { at: Date.now(), app: pkg.version, lines: clone(lines) };
}

/**
 * 要望の窓から: 記録を詰めた code (JSON → deflate-raw → base64url、Node の inflateRawSync で開ける)。max を超える時は新しい方を残す (頭に snap があればそこから)。
 * 戻り値 { code, n (入れた行), all (全部の行) }、無ければ null
 */
export async function actLogCode(max = 40_000): Promise<{ code: string; n: number; all: number } | null> {
  const j = actLogNow();
  if (!j || typeof CompressionStream === "undefined") return null;
  const pack = async (ls: ActLine[]): Promise<string> => {
    const s = new Blob([JSON.stringify({ app: j.app, lines: ls })]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    const b = new Uint8Array(await new Response(s).arrayBuffer());
    let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  // 入り切らない時は丸ごとの形 (snap) の所から後ろだけ (snap より後を全部入れれば続きが置ける)。どの snap からも入らなければ後ろの行だけ (前提は木の写しで分かる)
  const snaps = j.lines.map((l, i) => (l.k === "snap" ? i : -1)).filter((i) => i > 0);
  let from = 0, code = await pack(j.lines);
  for (const s of snaps) { if (code.length <= max) break; from = s; code = await pack(j.lines.slice(s)); }
  while (code.length > max && from < j.lines.length - 1) { from = Math.floor(from + (j.lines.length - from) * 0.3) + 1; code = await pack(j.lines.slice(from)); }
  return { code, n: j.lines.length - from, all: j.lines.length };
}
