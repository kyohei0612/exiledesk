/**
 * hole-check.ts — 「穴チェック」の言葉と、合格まで「100 人回す」を止める理由 (S-70。PC・スマホ・チュートリアルで同じ文)。
 * オーナー 10-31「テストボタンやけど次から穴チェックボタンに変えるか」「100人はそれまで灰色やね　ホバー時にテスト合格後みたいな感じでやればええやろ」。
 */
import { tr } from "../../../i18n/lang";


/** ボタンの名前 */
export const holeName = (): string => tr("穴チェック", "Gap check");
/** 帯が狭い時の名前 */
export const holeShort = (): string => tr("穴チェック", "Gap check");
/** 回している間 */
export const holeBusy = (): string => tr("穴チェック中…", "Checking…");
/** スマホの「もう一度」 */
export const holeAgain = (): string => tr("もう一度穴チェック", "Check again");
/** PC のボタンに乗せた時の説明 */
export const holeTitle = (): string => tr("穴チェック: 5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)。木を変えるたびに必ず自動で回る。足りない所があっても回す", "Gap check: walk 5 runs and play 30 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs). Runs by itself after every change, even with parts missing");
/** PC の最終チェック (S-70。スマホは穴チェックのまま) */
export const finalName = (): string => tr("最終チェック", "Final check");
export const finalTitle = (): string => tr("最終チェック: ハズレを整理してから、5 人を辿り 30 人を回して止まる所を探す。止まりが 0 で 100 人回せる", "Final check: sort the misses, then walk 5 runs and run 30 to find where runs stop. Zero stops unlocks the 100-run");
export const finalLockedWhy = (): string => tr("最終チェックに合格すると回せる", "Pass the final check to run");
/** 足りない所の件数の見出し (PC の一覧 TreeIssues・スマホの帯と重ね窓 PhoneIssues で同じ文) */
export const holesCount = (n: number): string => tr(`足りない所 ${n} 件`, `${n} missing`);
/** 足りない所の札に乗せた時 */
export const holesShowTitle = (): string => tr("足りない所を見る (箱の ! と一覧を出す、直すと次の穴チェックで消える)", "Show what is missing (box marks and list; they clear on the next gap check once fixed)");
/** 走行の人数のまとめ (帯) */
export const driveSum = (n: number, done: number): string => tr(`穴チェック ${n} 人: 完成 ${done} 人`, `Gap check ${n} runs: ${done} finished`);
/** 走行の結果のまとめの見出し */
export const driveHead = (n: number): string => tr(`穴チェック ${n} 人の結果`, `Gap check: ${n} runs`);
/** 「100 人回す」を押せない理由 (PC は乗せた時、スマホは下の帯の上に文) */
export const runLockedWhy = (busy: boolean, holes: number): string => (busy
  ? tr("穴チェック中。合格すると回せる", "Gap check running. You can run once it passes")
  : holes ? tr(`穴チェックに合格すると回せる。足りない所 ${holes} を直す`, `Pass the gap check to run. Fix the ${holes} missing`)
  : tr("穴チェックに合格すると回せる", "Pass the gap check to run"));
