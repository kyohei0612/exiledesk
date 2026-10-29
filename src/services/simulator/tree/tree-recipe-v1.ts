/**
 * tree-recipe-v1.ts — 保存の形 v1 = 打ち方だけ (S-104〜S-109、スイッチ recipeV1。10-29 オーナー「そしたら古いレシピでも使えるもんな。新旧システム導入しよう」)。
 * 保存するのは木の前提 (TreeDoc の箱以外の欄) と、決めた箱ごとの「人の決め」(picks) だけ。結果の箱・自動の ↩・まとめ・位置は持たず、開くたびに
 * 今の決まりで組み直す (画面側 views/simulator/tree/tree-rebuild.ts)。決めは道の札 (S-106、⑦18 案 A) で箱に結ぶ。
 * 今の木 (schema 0〜2 の TreeDoc) から v1 への口は toRecipeV1 の 1 つだけ (S-108、⑦21 案 A。位置の読み替えは要らない)
 */
import { boxAims, kindOfHand, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";
import { CATALYSING, effectOf } from "./tree-hands";
import { isStripKey } from "./tree-junk-side";
import { flag } from "../../../web/release-flags";

export const RECIPE_V1 = "exiledesk-recipe/1";
/** 箱 1 つの人の決め。at = 道の札、hand = 打つ手 (☑ は aims、触媒の前のカタリストは pre)、ほかは箱の印 */
/** back = 前の版で人が選んだ ↩ の行き先 (道の札、または形の合う箱へ match・作り直し restart。S-52b の「読めてそのまま回る」、組み直しで付け直す) */
export interface RecipePick { at: string; hand?: Hand; aims?: Aim[]; pre?: string; done?: "main" | "fail"; note?: string; unwanted?: string[]; noAutoBack?: true; back?: string }
/** 要確認の一覧 (S-107、⑦20 案 A): 組み直した木に札が無い決め (gone)・前の版の人の ↩ (back)・分かれ目 (split)・読めなかった箱 (check)。保存し直しても持ち越す */
export interface RecipeOrphan { at: string; why: "gone" | "back" | "split" | "check"; raw: unknown }

export const isRecipeV1 = (d: { schema?: unknown } | null | undefined): boolean => d?.schema === RECIPE_V1;

/** 結果の箱の札 (親の中で): 結果の種類 + 当たりの MOD + 側の鍵 */
const outKey = (b: TreeBox): string => `${b.out}${b.aim ? `:${b.aim.modId}#${b.aim.tier}` : ""}${b.junkKey ? `[${b.junkKey}]` : ""}`;
/** 子の箱と道の札 (同じ札が 2 つ以上なら 2 つ目から ~n) */
export function childKeysOf(d: TreeDoc, id: string, key: string): Array<[string, string]> {
  const seen = new Map<string, number>();
  return (d.boxes[id]?.outs ?? []).flatMap((o): Array<[string, string]> => {
    const c = d.boxes[o];
    if (!c) return [];
    const k = `${key}/${outKey(c)}`, n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return [[o, n > 1 ? `${k}~${n}` : k]];
  });
}
/** 箱 1 つの道の札 (親をたどる。見本の種にも使う = S-74、箱の id が組み直しで変わっても同じ見本) */
export function pathKeyOf(d: TreeDoc, id: string): string {
  const b = d.boxes[id];
  if (!b || !b.parent || id === "start") return id === "start" ? "s" : `?${id}`;
  const pk = pathKeyOf(d, b.parent);
  return childKeysOf(d, b.parent, pk).find(([c]) => c === id)?.[1] ?? `${pk}/?${id}`;
}
/** 木の全部の箱の道の札 (スタート = s、上の段から) */
export function pathKeysOf(d: TreeDoc): Map<string, string> {
  const m = new Map<string, string>();
  const q: Array<[string, string]> = d.boxes.start ? [["start", "s"]] : [];
  while (q.length) { const [id, k] = q.shift()!; m.set(id, k); q.push(...childKeysOf(d, id, k)); }
  return m;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** 当たりの箱の ☑ (前の「どれか」は MOD ごとに分ける、⑦21) */
const hitAimsOf = (d: TreeDoc, b: TreeBox): Aim[] => b.outs.flatMap((o) => (d.boxes[o]?.out === "hit" ? boxAims(d.boxes[o]!).map((a) => ({ ...a })) : []));
const kind = (h: Hand) => kindOfHand(h, effectOf(h.currency));
/** 触媒の前に足したカタリスト (品質 0 の通り抜け) の箱なら、その通り抜けの箱 (手は 1 つの決めにまとめる = applyPick の pre) */
function preChildOf(d: TreeDoc, b: TreeBox): TreeBox | null {
  const c = b.outs.length === 1 ? d.boxes[b.outs[0]!] : null;
  return b.hand && kind(b.hand) === "quality" && !b.hand.quality && c?.out === "pass" && c.hand?.omens.includes(CATALYSING) ? c : null;
}
/** 全部消えてよい消去の直線の続きの箱 (手は組み直しで付くので決めではない、S-109 の 10) */
function chainOf(d: TreeDoc, b: TreeBox): boolean {
  const p = b.parent ? d.boxes[b.parent] : null;
  if (!b.hand || !p?.hand || p.hand.currency !== b.hand.currency) return false;
  // 残したい MOD の消去の「狙いが消えた」に付けた全部消えてよい消去・「外れが消えた」に付けた同じ残したい MOD の消去も組み直しで付く (S-28e、スイッチ judgeOne)
  const sameKeep = (x: Hand, y: Hand): boolean => JSON.stringify(x.keep ?? []) === JSON.stringify(y.keep ?? []) && x.omens.join("+") === y.omens.join("+");
  const keepAuto = flag("judgeOne") && !!p.hand.keep?.length && ((b.out === "lost" && isStripKey(b.junkKey) && kind(b.hand) === "strip") || (b.out === "junkGone" && sameKeep(p.hand, b.hand)));
  return (kind(p.hand) === "strip" && b.out === "junkGone") || keepAuto;
}
/** 保存しない欄 (箱・番号・形の印・画面だけの物) */
const NOT_KEPT = new Set(["schema", "boxes", "seq", "picks", "orphans", "startRarity"]);

/** 木 (どの版でも) → 保存の形 v1。v1 ならそのまま (欄を揃えるだけ) */
export function toRecipeV1(d: TreeDoc): TreeDoc {
  if (isRecipeV1(d)) return { ...clone(d), boxes: {}, picks: d.picks ?? [], ...(d.orphans?.length ? { orphans: d.orphans } : {}) };
  const out: Record<string, unknown> = { schema: RECIPE_V1 };
  for (const [k, v] of Object.entries(d)) if (!NOT_KEPT.has(k) && v !== undefined) out[k] = clone(v);
  const picks: RecipePick[] = [], orphans: RecipeOrphan[] = clone(d.orphans ?? []);
  const keys = pathKeysOf(d);
  for (const [id, at] of keys) {
    const b = d.boxes[id]!, p: RecipePick = { at };
    const viaPre = b.out === "pass" && !!b.parent && preChildOf(d, d.boxes[b.parent]!) === b;
    const h = b.hand ?? b.handBack ?? null;
    if (h && !viaPre && !chainOf(d, b)) {
      const pass = b.hand ? preChildOf(d, b) : null;
      if (pass) { p.hand = clone(pass.hand!); p.pre = b.hand!.currency; p.aims = hitAimsOf(d, pass); } else { p.hand = clone(h); p.aims = b.hand ? hitAimsOf(d, b) : []; }
    }
    if (b.done) p.done = b.done;
    if (b.note) p.note = b.note;
    if (b.unwanted?.length) p.unwanted = [...b.unwanted];
    if (b.noAutoBack) p.noAutoBack = true;
    if (b.back && !b.autoBack && !b.handBack) { const to = b.back === "match" || b.back === "restart" ? b.back : keys.get(b.back); if (to) p.back = to; else orphans.push({ at, why: "back", raw: { back: b.back } }); }
    if (b.split) orphans.push({ at, why: "split", raw: { split: clone(b.split) } });
    if (b.check) orphans.push({ at, why: "check", raw: clone(b.checkRaw ?? null) });
    if (Object.keys(p).length > 1) picks.push(p);
  }
  return { ...(out as unknown as TreeDoc), boxes: {}, seq: 0, picks, ...(orphans.length ? { orphans } : {}) };
}

/** 保存の形 → 組み直す前の木 (前提とスタートの箱だけ、今の形の番号) */
export function premiseOf(rec: TreeDoc, schema: TreeDoc["schema"]): TreeDoc {
  const d = clone(rec) as TreeDoc;
  delete d.picks; delete d.orphans;
  return { ...d, schema, seq: 0, boxes: { start: { id: "start", x: 0, y: 0, out: "start", aim: null, hand: null, outs: [], back: null, done: null, parent: null } } };
}

/** 読んだ v1 の形を直す (picks の読めない物は要確認へ、捨てない) */
export function healRecipeV1(raw: Record<string, unknown>): TreeDoc {
  const d = clone(raw) as unknown as TreeDoc;
  const ok = (p: unknown): p is RecipePick => !!p && typeof p === "object" && typeof (p as RecipePick).at === "string";
  const list = Array.isArray(d.picks) ? d.picks : [];
  const bad = list.filter((p) => !ok(p)).map((p): RecipeOrphan => ({ at: "?", why: "check", raw: p }));
  return { ...d, base: typeof d.base === "string" ? d.base : "", itemLevel: typeof d.itemLevel === "number" ? d.itemLevel : 82, boxes: {}, seq: 0, picks: list.filter(ok), ...(bad.length || d.orphans?.length ? { orphans: [...(d.orphans ?? []), ...bad] } : {}) };
}
