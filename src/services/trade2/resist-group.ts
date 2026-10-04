/**
 * resist-group.ts — 単体の耐性 (火・冷気・雷・混沌) は種類を問わない (2026-10-04)
 *
 * オーナー:「別に冷気だろうが雷だろうが火だろうが混沌だろうが、なに付いててもいいからね。火がベースだから火耐性で検索じゃなくて、
 * そこ別に冷気でも良かったりするから。どの検索ルートでも」。耐性は他の装備で埋め合わせられるので、狙いの耐性の数だけ
 * 「どれかの耐性」が付いていればいい。取引所の count グループ (4 種 × 種類) で「N 個以上」にする。値の下限は狙いの中で一番低い物
 */
import { existingKinds, type StatKind } from "./stat-kinds";

/** 火・冷気・雷・混沌の耐性の番号 (取引所の stat、種類の前置き無し) */
export const SINGLE_RESIST: readonly string[] = ["stat_3372524247", "stat_4220027924", "stat_1671376347", "stat_2923486259"];

const bareOf = (id: string): string => id.replace(/^[a-z]+\./, "");
/** 単体の耐性の条件か (どの種類でも) */
export const isSingleResist = (id: string): boolean => SINGLE_RESIST.includes(bareOf(id));

/**
 * 条件の並びから単体の耐性を抜き出し、「どれかの耐性 N 個」の組にする。kinds = 探す種類 (取引所に無い種類は外す)。
 * 耐性が無ければ group = null
 */
export function splitResists<T extends { id: string; min?: number }>(
  filters: readonly T[],
  kinds: readonly StatKind[],
): { rest: T[]; group: { count: number; filters: Array<{ id: string; min?: number }> } | null } {
  const res = filters.filter((f) => isSingleResist(f.id));
  const rest = filters.filter((f) => !isSingleResist(f.id));
  if (!res.length) return { rest, group: null };
  const mins = res.map((f) => f.min).filter((v): v is number => v != null);
  const min = mins.length === res.length ? Math.min(...mins) : undefined;
  return {
    rest,
    group: {
      count: res.length,
      filters: SINGLE_RESIST.flatMap((s) => existingKinds(s, kinds).map((k) => ({ id: `${k}.${s}`, ...(min != null ? { min } : {}) }))),
    },
  };
}
