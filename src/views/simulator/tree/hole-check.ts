/**
 * hole-check.ts — 「穴チェック」の言葉と、合格まで「100 人回す」を止める理由 (S-70、スイッチ holeCheck。PC・スマホ・チュートリアルで同じ文)。
 * オーナー 10-31「テストボタンやけど次から穴チェックボタンに変えるか」「100人はそれまで灰色やね　ホバー時にテスト合格後みたいな感じでやればええやろ」。
 * 閉じている間は前の「テスト」の文で、「100 人回す」は今までどおり押せる形 (押すと足りない所の一覧)。
 */
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/** 穴チェックに合格するまで「100 人回す」を押せない */
export const HOLE_CHECK = flag("holeCheck");

const say = (now: [string, string], old: [string, string]): string => (HOLE_CHECK ? tr(...now) : tr(...old));

/** ボタンの名前 */
export const holeName = (): string => say(["穴チェック", "Gap check"], ["テストで回す", "Test run"]);
/** 帯が狭い時の名前 */
export const holeShort = (): string => say(["穴チェック", "Gap check"], ["テスト", "Test"]);
/** 回している間 */
export const holeBusy = (): string => say(["穴チェック中…", "Checking…"], ["テスト中…", "Testing…"]);
/** スマホの「もう一度」 */
export const holeAgain = (): string => say(["もう一度穴チェック", "Check again"], ["もう一度テスト", "Test again"]);
/** PC のボタンに乗せた時の説明 */
export const holeTitle = (): string => say(
  ["穴チェック: 5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)。木を変えるたびに必ず自動で回る。足りない所があっても回す", "Gap check: walk 5 runs and play 30 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs). Runs by itself after every change, even with parts missing"],
  ["テストで回す: 5 人をエンジンで辿り 30 人を回して、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)。木を変えるたびに自動でも回る", "Test run: walk 5 runs and play 30 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs). Also runs by itself after each change"],
);
/** 足りない所の札に乗せた時 */
export const holesShowTitle = (): string => say(
  ["足りない所を見る (箱の ! と一覧を出す、直すと次の穴チェックで消える)", "Show what is missing (box marks and list; they clear on the next gap check once fixed)"],
  ["足りない所を見る (箱の ! と一覧を出す、直すと次のテストで消える)", "Show what is missing (box marks and list; they clear on the next test once fixed)"],
);
/** 走行の人数のまとめ (帯) */
export const driveSum = (n: number, done: number): string => say([`穴チェック ${n} 人: 完成 ${done} 人`, `Gap check ${n} runs: ${done} finished`], [`テスト走行 ${n} 人: 完成 ${done} 人`, `Test drive ${n} runs: ${done} finished`]);
/** 走行の結果のまとめの見出し */
export const driveHead = (n: number): string => say([`穴チェック ${n} 人の結果`, `Gap check: ${n} runs`], [`テスト走行 ${n} 人の結果`, `Test drive: ${n} runs`]);
/** 「100 人回す」を押せない理由 (PC は乗せた時、スマホは下の帯の上に文) */
export const runLockedWhy = (busy: boolean, holes: number): string => (busy
  ? tr("穴チェック中。合格すると回せる", "Gap check running. You can run once it passes")
  : holes ? tr(`穴チェックに合格すると回せる。足りない所 ${holes} を直す`, `Pass the gap check to run. Fix the ${holes} missing`)
  : tr("穴チェックに合格すると回せる", "Pass the gap check to run"));
