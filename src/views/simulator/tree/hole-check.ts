/**
 * hole-check.ts — 「穴チェック」の言葉と、合格まで「100 人回す」を止める理由 (S-70。PC・スマホ・チュートリアルで同じ文)。
 * オーナー 10-31「テストボタンやけど次から穴チェックボタンに変えるか」「100人はそれまで灰色やね　ホバー時にテスト合格後みたいな感じでやればええやろ」。
 */
import { tr } from "../../../i18n/lang";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";


/** ボタンの名前 */
export const holeName = (): string => tr("穴チェック", "Gap check");
/** 帯が狭い時の名前 */
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
/**
 * 未設定の数 (左上の札・赤い札・一覧の見出し・下の帯・スマホで同じ文と同じ数、11-08 オーナー「足りない所と下の未設定の数字が合わない。未設定に合わせて」)。
 * 数は困り事の出た箱の数 (1 つの箱に 2 行あっても 1)。数えは issueGroups の長さ
 */
export const holesCount = (n: number): string => tr(`未設定 ${n} つ`, `${n} unset`);
/**
 * スマホの見るだけの画面で、未設定のあるレシピ。「10 人回す」のボタンの所に押せない形で出す (S-94e、11-10 オーナー「未完成なら未完成って書いとけばいいんじゃね回せないだろうし」
 * 「未完成のは未完成のレシピですって10人回すところのボタンにかいとけばおｋ」)。完成までの道が無い時の道の画面も同じ文
 */
export const unfinishedText = (): string => tr("未完成のレシピです", "Unfinished recipe");
/** 一覧の上の説明 (11-08 オーナー OK の文) */
export const holesWhat = (): string => tr("!の付いた箱です。全部直すと100人回せます。行を押すとその箱へ移ります", "Boxes marked !. Fix them all to run 100. Click a row to go to the box");
/** 箱ごとにまとめた困り事 (boxId "" = 箱の無い物、木の側の不具合など。1 つにまとめて最後に置く) */
export type IssueGroup<T extends { boxId: string }> = { boxId: string; rows: T[] };
/** 困り事を箱ごとにまとめる (上の段から、同じ段は左から)。今の木に無い箱の物は箱の無い組へ */
export function issueGroups<T extends { boxId: string }>(issues: readonly T[] | null | undefined, doc: TreeDoc): IssueGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const x of issues ?? []) { const k = doc.boxes[x.boxId] ? x.boxId : ""; by.set(k, [...(by.get(k) ?? []), x]); }
  const at = (id: string): [number, number] => { const b = doc.boxes[id]; return b ? [b.y, b.x] : [Infinity, Infinity]; };
  return [...by].map(([boxId, rows]) => ({ boxId, rows })).sort((a, z) => at(a.boxId)[0] - at(z.boxId)[0] || at(a.boxId)[1] - at(z.boxId)[1]);
}
/** 足りない所の札に乗せた時 */
export const holesShowTitle = (): string => tr("未設定の一覧を開く (行を押すとその箱へ移る。直すと次の穴チェックで消える)", "Open the list of unset boxes (click a row to go there; fixed ones clear on the next gap check)");
/** 走行の人数のまとめ (帯) */
export const driveSum = (n: number, done: number): string => tr(`穴チェック ${n} 人: 完成 ${done} 人`, `Gap check ${n} runs: ${done} finished`);
/** 走行の結果のまとめの見出し */
export const driveHead = (n: number): string => tr(`穴チェック ${n} 人の結果`, `Gap check: ${n} runs`);
/** 「100 人回す」を押せない理由 (PC は乗せた時、スマホは下の帯の上に文) */
export const runLockedWhy = (busy: boolean, holes: number): string => (busy
  ? tr("穴チェック中。合格すると回せる", "Gap check running. You can run once it passes")
  : holes ? tr(`穴チェックに合格すると回せる。未設定 ${holes} つを直す`, `Pass the gap check to run. Fix the ${holes} unset`)
  : tr("穴チェックに合格すると回せる", "Pass the gap check to run"));
