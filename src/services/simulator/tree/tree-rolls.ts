/**
 * tree-rolls.ts — 見本作りの「打つ」と「分ける」を分ける (S-71b ⑱)。
 * 見本は親の見本に親の手を打ち、結果がその箱になるまで引き直す (tree-sample の sampleFrom)。打った結果の並びは 親の見本・手・種・木の設定 だけで決まり、
 * 木の狙い (当たりの箱の ☑ の集まり) が変わっても同じ。分け方 (どの箱の結果か) だけが狙いで変わる。
 * そこで打った結果の並びを覚え、狙いが変わって見本を作り直す時は覚えた並びを分け直すだけにする (前は全部の箱を上の段から打ち直した = 8 MOD ワンドの開きの打ち直しの 6 割)。
 * 見本として返すアイテムは毎回写し (中の物は同じ) にし、写し → 元を覚える。☑ の覚え (tree-judge の AIMED) は見本の物ごとなので、狙いの違う木で同じ物を使い回さない。
 * 覚えるのは親の見本から変わった所だけ (アイテムの物ごと持つと 8 MOD ワンドの開きで heap が 4 倍になった)
 */
import type { StageApply, StageItem, StageMod } from "../../craft-stage/engine";

/** 見本の写し → 元 (打った結果の覚え。子の箱の並びの鍵は元で引く) */
const ORIGIN = new WeakMap<StageItem, object>();
const IDS = new WeakMap<object, number>();
let idSeq = 0;
/** 元の番号 (番号は使い回さない) */
const idOf = (it: StageItem): number => { const o = ORIGIN.get(it) ?? it; let n = IDS.get(o); if (!n) IDS.set(o, (n = ++idSeq)); return n; };
/** 写しの元 (写しでなければそのもの。品ごとに持たせた物を写しからも引く、tree-whittle の下限) */
export const originOf = (it: StageItem): object => ORIGIN.get(it) ?? it;
/** 見本として返す写し (元を覚える) */
export function handOut(it: StageItem): StageItem { const c = { ...it }; ORIGIN.set(c, ORIGIN.get(it) ?? it); return c; }

/** 1 回打った結果 (分けるのに要る物だけ。足した / 消した MOD の並びは持たない) */
export type Roll = Pick<StageApply, "applied" | "item" | "reason">;
/** 覚える形: 親の見本から変わった所 (鍵の並びが親と違う時は物ごと) */
interface Kept { applied: boolean; reason?: string; d: Partial<StageItem>; whole: boolean }
interface Rolls { list: Kept[]; rng: () => number }
/** 中身が同じ物を 1 つにする (MOD の段の範囲・stat・タグ・文は同じ MOD・段・値なら同じ。1 回打つたびに写しを作るので覚えの大半だった) */
const SHARED = new Map<string, unknown>();
/** 同じ鍵で中身が同じ (same) 物があればそれ、無ければ v を覚えて返す */
const shared = <T>(k: string, v: T, same: (a: T, b: T) => boolean): T => { const had = SHARED.get(k) as T | undefined; if (had !== undefined) return same(had, v) ? had : v; if (SHARED.size < 200000) SHARED.set(k, v); return v; };
const flat = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const nested = (a: readonly number[][], b: readonly number[][]): boolean => a.length === b.length && a.every((x, i) => flat(x, b[i]!));
const eq = (a: unknown, b: unknown): boolean => a === b;
const sharedMod = (m: StageMod): StageMod => {
  const t = `${m.modId}|${m.tierIndex}`, o = m as unknown as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    out[k] = k === "ranges" ? shared(`r|${t}`, v as number[][], nested) : k === "stats" || k === "tags" ? shared(`${k}|${t}`, v as unknown[], flat) : k === "values" ? shared(`v|${t}|${(v as number[]).join()}`, v as number[], flat) : (k === "textEn" || k === "textJa") && typeof v === "string" ? shared(`s|${v}`, v, eq) : v;
  }
  return out as unknown as StageMod;
};
/** 親に無い MOD だけ共有の形にした並び */
const sharedSide = (now: StageMod[], was: readonly StageMod[]): StageMod[] => (now === was ? now : now.map((m) => (was.includes(m) ? m : sharedMod(m))));
/** after の鍵の並びが base と同じなら変わった所だけ、違えば物ごと (写しの鍵の並びを打った結果と同じにする) */
function keep(base: StageItem, x: StageApply): Kept {
  const it = { ...x.item, prefixes: sharedSide(x.item.prefixes, base.prefixes), suffixes: sharedSide(x.item.suffixes, base.suffixes) };
  const a = it as unknown as Record<string, unknown>, b = base as unknown as Record<string, unknown>, ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return { applied: x.applied, reason: x.reason, d: it, whole: true };
  const d: Record<string, unknown> = {};
  for (const k of ka) if (a[k] !== b[k]) d[k] = a[k];
  return { applied: x.applied, reason: x.reason, d: d as Partial<StageItem>, whole: false };
}
/** 覚えた形 → 打った結果 (写しは元 = 覚えた形を指す) */
function back(base: StageItem, r: Kept): Roll {
  const item = (r.whole ? { ...r.d } : { ...base, ...r.d }) as StageItem;
  ORIGIN.set(item, r);
  return { applied: r.applied, item, reason: r.reason };
}
/** 鍵 → 打った結果の並び (先頭から順に)。並びの数の合計が上限を超えたら古い並びから捨てる (捨てても打ち直すだけで結果は同じ) */
const ROLLS = new Map<string, Rolls>();
const ROLL_MAX = Number((globalThis as { __ROLL_MAX?: number }).__ROLL_MAX ?? 300000);
let total = 0;
/**
 * 親の見本 base に key (手・種・木の設定。繰り返しの手は当たりの札も) の手を打った i 番目の結果。覚えていなければ続きを打つ。
 * rng = 並びの初めの乱数 (覚えていない時だけ呼ぶ)、play = 1 回打つ
 */
export function rollAt(base: StageItem, key: string, i: number, rng: () => () => number, play: (rng: () => number) => StageApply): Roll {
  const k = `${idOf(base)}|${key}`;
  let r = ROLLS.get(k);
  // 引いた並びは並びの後ろへ (古い物から捨てる時に、使っている上の段の並びを先に捨てると下の箱の鍵が全部外れて打ち直しになる)
  if (r) ROLLS.delete(k); else r = { list: [], rng: rng() };
  ROLLS.set(k, r);
  while (r.list.length <= i) { r.list.push(keep(base, play(r.rng))); total++; }
  if (total > ROLL_MAX) for (const [old, x] of ROLLS) { if (total <= ROLL_MAX * 0.8) break; if (old === k) continue; total -= x.list.length; ROLLS.delete(old); }
  return back(base, r.list[i]!);
}
/** 覚えている並びの数の合計 (測り用) */
export const rollCount = (): number => total;
/** データを替えた時に捨てる */
export function clearRolls(): void { ROLLS.clear(); SHARED.clear(); total = 0; }
