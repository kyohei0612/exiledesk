/**
 * release-flags.ts — 本番に出していない物を隠すスイッチ (1 か所。2026-10-24 オーナー「今本番に出てるやつそっくり出す」、段取り docs/org/dev/notes/2026-10-24-main-release.md)。
 * 本番のビルドでは切れていて、開発版 (preview:prod -- --dev の VITE_DEV_PREVIEW)・手元の dev サーバー (vite) では入る。
 * オーナーの OK が出た物は RELEASED に名前を足す 1 行で本番にも入る (revert で抜かない)。名前と中身の対応・commit は下の FLAGS の説明に。
 *   import { flag } from "../web/release-flags";   if (flag("tierClose")) { … 新しい動き … } else { … 本番の動き … }
 */

/** スイッチの名前 → 中身 (本番に出す時に更新内容へ写す物の見出し。commit は docs/pending-release.md の表) */
export const FLAGS = {
  sim: "シミュレーター (ツリー) のタブ・ページ・先読み",
  daily: "デイリークラフトチャレンジ (ヘッダーのボタン・ページ)",
  dismiss: "枠の外を押す・Esc で選ぶ前に戻す (use-dismiss、490989fb・30760e05・994b95b8)",
  tierClose: "段の表で 1 つ選び終えたら段の表を閉じる (ModTable の closeAfter、b6b7fea2)",
  modeTabs: "上の切り替えタブの帯をベースのページにも出す (ModeTabs、ad68e08b・0d19fb26)",
  fitZoom: "拡大率をスクロールバーがある時の幅でいつも決める (a23050a4)",
  monkey1023: "モンキーテスト 10-23 の共通の直し (窓を閉じた直後の守り・列の見出しを留める・名前を 1 行・押せないボタンを薄く・開く畳むの揃え ほか)",
  // ここから下はエミュ部長の物 (エミュの画面の OK 待ち)
  sanctifyBar: "クラフト台の聖別の帯 (e61bb9ab)",
  monkeyEmu1023: "クラフト台・スパムシミュのモンキーテスト 10-23 の直し (c069970b・5ff2778a・9eae3311)",
  baseChosen: "ベースのページで人が選んだベースだけ選んだ見た目 (2aa2d268・7cde43ad・b1b22818・3cbda7e4)",
} as const;
export type Flag = keyof typeof FLAGS;

/** OK が出て本番にも入れた物 (ここに 1 行足す) */
const RELEASED: ReadonlySet<Flag> = new Set<Flag>([]);

/** 開発版・手元の dev サーバー (OK 待ちの物も全部入る) */
export const DEV_BUILD: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_PREVIEW === "1";

/** そのスイッチが入っているか */
export const flag = (f: Flag): boolean => DEV_BUILD || RELEASED.has(f);

/** 入っているスイッチを <html data-flag-名前> に書く (CSS だけの直しはこの印の下に書く。main.ts が最初に 1 回) */
export function markFlags(): void {
  for (const f of Object.keys(FLAGS) as Flag[]) if (flag(f)) document.documentElement.setAttribute(`data-flag-${f.toLowerCase()}`, "");
}
