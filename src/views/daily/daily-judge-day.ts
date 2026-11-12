/**
 * daily-judge-day.ts — 完成の物差しの日の門 (D-35b ④⑤)。
 * 新しい完成の物差し = 値の下の端で比べる当たり (スイッチ dailyLowHit、無限のエッセンスの能力値も中) と、回す時に完成の箱へ着いた人の品も見る (スイッチ dailyDoneCheck の ④) は、
 * 出した後に始まる日のお題から効かせる。出したお題の途中で当たり外れ・完成率が変わると、同じ日の中で出す前に提出した人と後の人の物差しが違ってしまうため。
 * 前の日のお題は前の物差しのまま (16:00 の検算も同じ)。注意書きの字 (DailyEssNote) も同じ門で言い方を替える。
 * 数えの部品 (daily-cost.ts) と注意書きの部品が同じここを見る (注意書きが数えの部品を丸ごと引き込まないよう、門だけ分けた)
 */
import { DEV_BUILD } from "../../web/release-flags";

/** 新しい完成の物差しが効く最初のお題の日。本番に出す日が替わったら「出した後に最初に始まるお題の日」に直す (11-12 の夜に出す見込み = 11-13 のお題から、ブラック 90 の決め) */
export const NEW_JUDGE_FROM = "2026-11-13";

/**
 * その日 ("YYYY-MM-DD"、お題の id "dYYYY-MM-DD" も可) のお題に新しい完成の物差しが効くか。
 * 開発版はどの日のお題でも効く (オーナーが開発版で今日のお題を触って確かめるため、始め方の fourOnlyHere と同じ扱い)。日が分からない時は効かない
 */
export const newJudgeOn = (day: string | null | undefined): boolean => DEV_BUILD || (!!day && day.replace(/^d/, "") >= NEW_JUDGE_FROM);

/** 今 判定しているお題の日。挑戦の画面 (DailyPlay) がお題を開いた時と、検算 (runCost) が回す前に置く */
let judgeDay: string | null = null;
export const setJudgeDay = (day: string | null | undefined): void => { judgeDay = day ?? null; };
/** 今 判定しているお題に新しい完成の物差しが効くか (当たりの判定 dailyHit と回す時の物差し doneOkOf が呼ぶ) */
export const newJudgeNow = (): boolean => newJudgeOn(judgeDay);
