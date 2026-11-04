/**
 * daily-titles.ts — 称号 (D-100〜D-103・D-54)。1 行 = id・名前 (日英)・格・版・条件。条件は日の結果の全部を受ける純粋な関数。
 * 称号は全部の日から何度でも計算し直す (足した称号は過去の記録にもさかのぼって付く)。行を消した称号は外さず「昔の称号」で残す (11-05)。
 * 札に出すのは本人が選んだ物、選んでいなければ格の一番高い物 (D-54)。中身はまだ決めない (D-103) ので TITLES は空
 */

/** 日の結果 (daily_results)。place = 解決の順位 (1〜)、未解決は null。連続は数えない (D-07) */
export type DayResult = { day: string; nick: string; place: number | null; cost: number; rate: number; ms: number; solvedN: number; enteredN: number; slot: number; base: string };
export type TitleRule = {
  id: string; ja: string; en: string;
  /** 格。大きいほど上 */
  rank: number;
  /** 条件を直したら上げる */
  ver: number;
  /** 持つ人の結果 mine と全員の結果 all を受け、初めて満たした日を返す。満たさなければ null */
  when: (mine: readonly DayResult[], all: readonly DayResult[]) => string | null;
};
/** daily_awards の 1 行 (名前と格は付いた時の写しで、行を消しても残る) */
export type Award = { id: string; ja: string; en: string; rank: number; ver: number; firstDay: string; retired?: true };

export const TITLES: readonly TitleRule[] = [];

/** 1 人分の称号を全部の結果から計算し直す。prior = 前の計算 (昔の称号を残すため) */
export function awardsOf(nick: string, all: readonly DayResult[], prior: readonly Award[] = [], rules: readonly TitleRule[] = TITLES): Award[] {
  const mine = all.filter((r) => r.nick === nick).sort((a, b) => a.day.localeCompare(b.day));
  const out: Award[] = [];
  for (const t of rules) {
    const first = t.when(mine, all);
    if (first) out.push({ id: t.id, ja: t.ja, en: t.en, rank: t.rank, ver: t.ver, firstDay: first });
  }
  for (const a of prior) if (!rules.some((t) => t.id === a.id)) out.push({ ...a, retired: true });
  return out.sort((a, b) => b.rank - a.rank || a.firstDay.localeCompare(b.firstDay));
}

/** 札に出す称号 (D-54)。選んだ物を持っていればそれ、無ければ格の一番高い物 */
export const shownAward = (awards: readonly Award[], pick: string | null | undefined): Award | null => awards.find((a) => a.id === pick) ?? awards[0] ?? null;
