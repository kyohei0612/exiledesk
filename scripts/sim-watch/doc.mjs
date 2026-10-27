/**
 * doc.mjs — 見張りが木の中身 (TreeDoc) を読む所。画面の文と比べる「木の側の答え」を、木の数字 (箱の高さ・戻り先・手) だけから出す。
 * 段 = 箱の高さ ÷ 段の間 + 1 (tree-fail の stepOf と同じ決め: 画面の段の並び、親をたどる深さではない)。
 * ここは画面の作りを呼ばない (同じ関数で答えを作ると、関数が間違っていても合ってしまう)。
 */
import { inflateRawSync } from "node:zlib";

export const GAP_Y = 360; // src/services/simulator/tree/tree-model.ts の GAP_Y
const SPECIAL = new Set(["restart"]);
export const MATCH_PREFIX = "match"; // 形の合う箱へ (tree-shape の MATCH_BACK)。行き先は回し方が決めるので段は比べない

/** 共有 URL の #recipe= の後ろ → { name, tree } (deflate-raw + base64url、services/craft-stage/share.ts の packJson) */
export function unpackRecipe(code) {
  const p = JSON.parse(inflateRawSync(Buffer.from(code.replace(/-/g, "+").replace(/_/g, "/"), "base64")).toString("utf8"));
  if (p?.v !== 2 || !p.t?.boxes) throw new Error("ツリーのレシピではない");
  return { name: String(p.n ?? ""), tree: p.t };
}

export function stepOf(doc, id) {
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

/** 外れの箱 (外れ・狙いが消えた) で、親の手と同じ手を選べば戻るはずの箱 (見張りの (6) で手を足す所) */
export function missBoxes(doc) {
  return Object.values(doc.boxes).filter((b) => (b.out === "junk" || b.out === "lost") && b.parent && doc.boxes[b.parent]?.hand);
}
