/**
 * doc.mjs — 見張りが木の中身 (TreeDoc) を読む所。画面の文と比べる「木の側の答え」を、木の数字 (箱の高さ・戻り先・手) だけから出す。
 * 段 = 箱の高さ ÷ 段の間 + 1 (tree-fail の stepOf と同じ決め: 画面の段の並び、親をたどる深さではない)。スイッチ lineShort の作りは親をたどる深さ (S-68)。
 * ここは画面の作りを呼ばない (同じ関数で答えを作ると、関数が間違っていても合ってしまう)。
 */
import { inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

export const GAP_Y = 360; // src/services/simulator/tree/tree-model.ts の GAP_Y
const SPECIAL = new Set(["restart"]);
export const MATCH_PREFIX = "match"; // 形の合う箱へ (tree-shape の MATCH_BACK)。行き先は回し方が決めるので段は比べない

/** 共有 URL の #recipe= の後ろ → { name, tree } (deflate-raw + base64url、services/craft-stage/share.ts の packJson) */
export function unpackRecipe(code) {
  const p = JSON.parse(inflateRawSync(Buffer.from(code.replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8"));
  if (p?.v !== 2 || !p.t?.boxes) throw new Error("ツリーのレシピではない");
  return { name: String(p.n ?? ""), tree: p.t };
}

/** スイッチ lineShort の入った作り (画面の <html data-flag-lineshort>) は「n 段目」を親からの深さで数える (S-68)。watch.mjs が木を開くたびに入れる */
let byDepth = false;
export const setDepthSteps = (on) => { byDepth = !!on; };

export function stepOf(doc, id) {
  if (byDepth) {
    let n = 1, b = doc.boxes[id];
    for (const seen = new Set(); b?.parent && doc.boxes[b.parent] && !seen.has(b.id); b = doc.boxes[b.parent]) { seen.add(b.id); n++; }
    return n;
  }
  const b = doc.boxes[id], s = doc.boxes.start;
  return b && s ? Math.max(1, Math.round((b.y - s.y) / GAP_Y) + 1) : 1;
}

/** 手が同じか (カレンシーとお告げ。狙いの ☑ は比べない、PhoneTreePage の sameHand と同じ範囲) */
export const sameHand = (a, b) => !!a && !!b && a.currency === b.currency && [...(a.omens ?? [])].sort().join(",") === [...(b.omens ?? [])].sort().join(",");

/**
 * 戻りがある箱の、札の文の答え。null = 戻りが無い。
 * { kind: "merge" | "back" | "match" | "restart", steps: [n], retry } (match は行き先が回し方しだいなので steps を見ない)
 */
export function expectBack(doc, id) {
  const b = doc.boxes[id];
  if (!b?.back) return null;
  if (SPECIAL.has(b.back)) return { kind: "restart", steps: [], retry: false };
  if (String(b.back).startsWith(MATCH_PREFIX) && !doc.boxes[b.back]) return { kind: "match", steps: [], retry: null };
  const to = doc.boxes[b.back];
  if (!to) return { kind: "broken", steps: [], retry: false, to: b.back };
  const p = b.parent ? doc.boxes[b.parent] : null;
  const retry = !!p?.hand && !!to.hand && to.hand.currency === p.hand.currency;
  if (b.out === "hit" && to.out === "hit") return { kind: "merge", steps: [stepOf(doc, b.back)], retry: false, to: b.back };
  return { kind: "back", steps: [stepOf(doc, b.back)], retry, to: b.back };
}

/** 札の文から段の数を取り出す (「↩ 再度挑戦 · 3 段目へ戻る」「→ 同じ MOD 群のため統合 (3 段目)」「↩ 2・4 段目へ戻る」) */
export function stepsInText(s) {
  const m = /([\d・, ]+)\s*段目/.exec(s ?? "");
  return m ? m[1].split(/[・,\s]+/).filter(Boolean).map(Number) : [];
}

/** 全部消えてよい消去の手の箱 (消去の直線の箱。消去の手だけが keep を持つ、tree-model の keepCut) */
export const isStrip = (b) => Array.isArray(b?.hand?.keep) && b.hand.keep.length === 0;
/** 外れの側の箱 (tree-row-tags の MISS_OUTS) */
export const MISS_OUTS = ["junk", "lost", "junkGone", "any"];
/** 消去の直線の途中の箱 = 直線の箱で、自分に戻りが無く、どの箱も自分へ戻らない (乗せても線が出ないはず) */
export const stripMiddles = (doc) => Object.values(doc.boxes).filter((b) => isStrip(b) && !b.back && !Object.values(doc.boxes).some((x) => x.back === b.id));
// 道の上の狙いの数え pathAims・pathMids は 11-07 にやめた: 外れ MOD でない行は配置の ☑ の印 + 完成形に無いエッセンスの MOD とちょうど同じ (R-34) = 猿の口の aimedRows と下の midEssences で見る (watch.mjs の checkCards)
/** 無限のエッセンスの鍵 (付く MOD が 1 つに決まらないので外す、tree-veil の essenceModOf と同じ)。表はクライアント由来の src/services/htc/essence-keys.json */
const INFINITE = new Set(Object.entries(JSON.parse(readFileSync(new URL("../../src/services/htc/essence-keys.json", import.meta.url), "utf8")).keys).filter(([, v]) => / of the Infinite$/.test(v?.en ?? "")).map(([k]) => k));
/**
 * 完成形に無いエッセンスの MOD の modId (木の手で打つエッセンスの MOD のうち完成形に無い物、S-33c)。判定では外れでもカードは MOD の文のまま (11-07 オーナー
 * 「つけたエッセンスはそのままカードに表示させよう」) = R-34 の「外れ MOD でない行」に入る。木の手の鍵だけから出す (画面の tree-veil の midAims は呼ばない)
 */
export function midEssences(doc) {
  const goals = new Set((doc.memoAims ?? []).map((a) => a.modId)), out = new Set();
  for (const b of Object.values(doc.boxes)) {
    const k = b.hand?.currency ?? "", m = /^essence:(?:lesser|normal|greater|perfect):(.+)$/.exec(k);
    if (m && !INFINITE.has(k) && !goals.has(m[1])) out.add(m[1]);
  }
  return out;
}
/** 外れの箱 (外れ・狙いが消えた) で、親の手と同じ手を選べば戻るはずの箱 (見張りの (6) で手を足す所) */
export function missBoxes(doc) {
  return Object.values(doc.boxes).filter((b) => (b.out === "junk" || b.out === "lost") && b.parent && doc.boxes[b.parent]?.hand);
}
