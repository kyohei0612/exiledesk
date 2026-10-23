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
  omenRow: "お告げの欄を持った札の行の下に差し込む・掛けると打てない / 意味が無いお告げは灰色で掛けられない (ff5c6f8c、判定はジン部長の omenBlock)",
  monkey1023: "モンキーテスト 10-23 の共通の直し (窓を閉じた直後の守り・列の見出しを留める・名前を 1 行・押せないボタンを薄く・開く畳むの揃え ほか)",
  // ここから下はエミュ部長の物 (エミュの画面の OK 待ち)
  sanctifyBar: "クラフト台の聖別の帯 (e61bb9ab)",
  monkeyEmu1023: "モンキーテスト 10-23 のエミュの直し (スパムシミュの Esc・運試しの間の戻る・札の折り返し・狙いの文 c069970b、品質の帯のカーソル 5ff2778a・9eae3311・0beb110a、狙いの窓の一言 f261b842)",
  baseChosen: "ベースのページは人が選んだベースだけ選んだ見た目・帯とすぐ試す・入口の行き先を同じ印で (2aa2d268・3cbda7e4)",
  // ここから下はシミュ部長の物 (使い方・コツの OK 待ち。段 5 のクラフト手順のコース 04ad4147・d1e7c664 は course-release.ts の REVIEW で開発版の印の時だけ)
  tutorialUi: "使い方・コツ: コース一覧の説明は既定で閉じる・段 5 で次に押す物を光らせ説明は 1 文 + 詳しく・進み n / m (d1c97969)",
  // ここから下はジン部長の物 (エンジンとデータの OK 待ち。お告げの欄の画面はエミュの views、フォントは web.html などの HTML)
  omenPanel: "お告げの欄を持った札の行の下に差し込む・掛けられないお告げは灰色 (ff5c6f8c。判定の omenBlock はツリーも使うのでエンジンはそのまま)",
  abyssSuffix: "アビサルロードの紋章のサフィックスを置き場に足す (5d585458)",
  skillPlus: "スキルのレベルの MOD の日本語に + (「レベル +#」26 行、e82ef1a5)",
  talismanWeight: "タリスマンのアタックスピード 30 段目の重みを poe2db の 1000 に (ef57fece)",
  dntBases: "ゲームに無い [DNT] のベース 3 つを一覧から外す (c3a915a8)",
  runeMagnitude: "ルーンの「明示 MOD の強さが N% 増加」を MOD の値に掛ける (dc3e219a)",
  fonts: "Google Fonts の CSS を描きを止めない読み方に (1bef14b9、HTML)",
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
