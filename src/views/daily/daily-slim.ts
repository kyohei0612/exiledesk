/**
 * daily-slim.ts — デイリーの端末の控え (exiledesk.daily.v4) を「今日の 1 枠」だけ大きく持つ形に縮める (D-32c、11-18)。
 * 挑戦の行は始めた時にお題の相場の写し (prices、1 件 ≒ 56 万字) を持ち、前は日ごとに足し続けたので 6 日で 330 万字になり、
 * 端末の置き場 (5,242,880 字) を埋めてシミュのレシピの保存が黙って落ちた (11-18、オーナーの本番)。
 * オーナー 11-18「デイリーの記録保存はデイリーの保存枠１つで上書きし続けたら？」→ 大きい中身は続けている挑戦 (今日の 1 枠) だけが持ち、
 * 終わった前の日の挑戦は成績・提出の印・一言・狙いだけの小さい行にする。捨てる物は挑戦の画面 (続けている挑戦) だけが読む
 */
import type { DailyTry } from "./daily-api";

/** 終わった前の日の挑戦から外す物: 相場の写し・種・木・木を書いた時刻・組み上がりの写し・レシピに保存した時の打ち方 */
const BIG = ["prices", "seed", "tree", "treeAt", "builtZ", "saved"] as const;

/** 縮めてよい挑戦 = 今日のお題でなく、終わっている (諦め・提出の印、または 1 時間が過ぎた) */
export const slimmable = (t: DailyTry, today: string, limitMs: number, now: number): boolean =>
  t.topicId !== today && (!!t.ended || t.startedAt + limitMs <= now);

/** 縮めた写しを返す (元は触らない)。外す物が無ければ同じ物 */
export function slimTry(t: DailyTry): DailyTry {
  if (!BIG.some((k) => k in t)) return t;
  const x = { ...t } as Record<string, unknown>;
  for (const k of BIG) delete x[k];
  return x as DailyTry;
}

/** 挑戦の表を縮める。縮めた行があれば changed */
export function slimTries(tries: Record<string, DailyTry>, today: string, limitMs: number, now = Date.now()): { tries: Record<string, DailyTry>; changed: boolean } {
  let changed = false;
  const out: Record<string, DailyTry> = {};
  for (const [id, t] of Object.entries(tries)) {
    const s = slimmable(t, today, limitMs, now) ? slimTry(t) : t;
    if (s !== t) changed = true;
    out[id] = s;
  }
  return { tries: out, changed };
}
