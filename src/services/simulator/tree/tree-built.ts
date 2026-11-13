/**
 * tree-built.ts — 保存・共有に組み上がった木も持たせる (S-104b、開く速さの案 E。11-10 オーナー「作ってよい」)。
 * 保存の形は今までどおり打ち方 (S-104) が正で、組み上がった木 (箱・自動の ↩・まとめ) は「同じ組み方の版で、同じ打ち方から組んだ物」の時だけ使う写し。
 * 版 = 木の組み方の版 (scripts/tree-build-hash.mjs の指紋、本番の作りで __TREE_BUILD__ に埋める)。版が違う・打ち方が違う・写しが無い時は
 * 今どおり打ち方から組み直す (S-100 の「今の決まりで組み直す」はそのまま)。開発の画面 (vite dev) とテストは版が空 = 写しを作らず使わない
 */
import type { TreeDoc } from "./tree-model";
import { toRecipeV1 } from "./tree-recipe-v1";
import { DEV_BUILD } from "../../../web/release-flags";

declare const __TREE_BUILD__: string | undefined;
/** 画面の ?off= で切ったスイッチ (開発版の作りだけ効く。名前を並べて版に足す = 切り方が違えば写しを使わない、11-13 最終チェック長 12) */
const offKey = (): string => { if (!DEV_BUILD) return ""; try { const v = new URLSearchParams(location.search).get("off"); return v ? `|off=${v.split(",").filter(Boolean).sort().join(",")}` : ""; } catch { return ""; } };
/** 木の組み方の版 (空 = 写しを作らない・使わない) */
export const TREE_BUILD: string = typeof __TREE_BUILD__ === "string" && __TREE_BUILD__ ? __TREE_BUILD__ + offKey() : "";

/** 組み上がった木の写し: v = 組み方の版、rec = 組んだ打ち方の指紋、doc = 組み上がった木 (例のアイテムは外す = 保存の形の examples を使う) */
export interface TreeBuilt { v: string; rec: string; doc: TreeDoc }

/** 写しを持つ木の大きさの上限 (JSON の字数) */
const BUILT_MAX = 200_000;
/** 鍵の並びに依らない JSON (打ち方の比べ用) */
const stable = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x));
/** 打ち方の指紋 (例のアイテム・写しは入れない) */
const recOf = (d: TreeDoc): string => { const { examples: _e, built: _b, ...r } = toRecipeV1(d); return stable(r); };

/** 組み上がった木 d の写し (版が空・箱の無い保存の形なら作らない) */
export function builtOf(d: TreeDoc): TreeBuilt | undefined {
  if (!TREE_BUILD || !d.boxes?.start || d.schema?.startsWith("exiledesk-recipe/")) return undefined;
  const { examples: _e, built: _b, ...doc } = d, s = JSON.stringify(doc);
  // 大きすぎる木は写しを持たない (保存したレシピは手元の保存の場所に積むので。開く時は今どおり組み直す)
  if (s.length > BUILT_MAX) return undefined;
  return { v: TREE_BUILD, rec: recOf(d), doc: JSON.parse(s) as TreeDoc };
}

/** 保存の形 tree の写しが今の組み方の版・同じ打ち方なら、組み上がった木 (例のアイテムは保存の形の物)。使えなければ null = 組み直す */
export function fromBuilt(tree: TreeDoc): TreeDoc | null {
  const b = tree.built;
  if (!TREE_BUILD || !b || b.v !== TREE_BUILD || !b.doc?.boxes?.start) return null;
  try { if (b.rec !== recOf(tree)) return null; } catch { return null; }
  const doc = JSON.parse(JSON.stringify(b.doc)) as TreeDoc;
  if (tree.examples) doc.examples = JSON.parse(JSON.stringify(tree.examples)) as NonNullable<TreeDoc["examples"]>;
  return doc;
}
