/**
 * tree-recipe-z.ts — 木のレシピの保存をこの端末に詰めて置く (S-101b ④、スイッチ saveCap15)。
 * 詰め方は共有 URL と同じ (木の JSON → deflate-raw → base64url)。大きい木 1 つ 25 万字が 1.4 万字ほどになり、15 個でも保存の枠に当たらない。
 * 読み込みの瞬間に一覧がそろうよう同期で詰めて戻す (fflate)。置き場は今の鍵と別の鍵 Z: 古い版のタブは今の鍵を今どおり読み書きし、こちらを読まない (壊さない)
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";
import { parseList } from "./recipe-store-util";

/** 詰めた一覧 (並び = { id, name, savedAt, updatedAt, v, z }。z = 木の詰めた文字) */
export const Z_KEY = "exiledesk.tree.recipes.z";
/** 直前の詰めた一覧の控え */
const Z_BAK = "exiledesk.tree.recipes.z.bak";
/** 今の鍵から Z へ移した時刻 (それより後に古い版のタブが今の鍵へ保存した物だけ、次に開いた時に Z へ足す) */
export const Z_AT = "exiledesk.tree.recipes.zAt";

const toB64url = (u8: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
/** 木 → 詰めた文字 (同じ木の物は覚えて詰め直さない = 保存の時に詰めるのは変わった 1 つだけ) */
const memo = new WeakMap<object, string>();
const zOf = (tree: unknown): string => {
  const o = tree as object, had = memo.get(o);
  if (had) return had;
  const z = toB64url(deflateSync(strToU8(JSON.stringify(tree))));
  memo.set(o, z);
  return z;
};

/** Z の一覧を読む (鍵が無ければ null。戻せない行は木の無い行のまま返す = 呼ぶ側の読み替えで「読めない物」に回る) */
export function readZ(): unknown[] | null {
  const raw = localStorage.getItem(Z_KEY);
  const list = parseList(raw) ?? (raw != null ? parseList(localStorage.getItem(Z_BAK)) : null);
  if (!list) return null;
  return list.map((x) => {
    const r = x as { z?: unknown } | null;
    if (!r || typeof r !== "object" || typeof r.z !== "string") return x;
    const { z, ...rest } = r;
    try {
      const tree = JSON.parse(strFromU8(inflateSync(fromB64url(z)))) as object;
      return { ...rest, tree };
    } catch { return x; }
  });
}
/** Z へ書く (先に本体、入らなければ控えを空けて書き直す。控えは前の本体) */
export function writeZ(list: readonly { tree: unknown }[]): void {
  const prev = localStorage.getItem(Z_KEY);
  const s = JSON.stringify(list.map(({ tree, ...rest }) => ({ ...rest, z: zOf(tree) })));
  try { localStorage.setItem(Z_KEY, s); } catch { localStorage.removeItem(Z_BAK); localStorage.setItem(Z_KEY, s); }
  if (prev != null) try { localStorage.setItem(Z_BAK, prev); } catch { /* 控えが入らなくても本体は残る */ }
}
