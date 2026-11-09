# デザイン部長 のやる事

済んだ節・引き継ぎは git の履歴 (10-29 の md の整理で消した): 2026-10-23-todo-archive.md・2026-10-24-todo-archive.md と notes/2026-10-26-design7-handover.md (決め: スマホは省略しない・タップで別のページへ飛ばさない、U-51)。10-23〜28 の記録は 11-10 の棚卸しで下の「閉じた物」に 1 行ずつ (全文は git の履歴)。

## やる事
- **重ね窓の共通の印 1 つ (U-15・shared-ui.md ⑦6)**: ModalShell には data-overlay を付けた (1efcc573c)。src/web/ToTop.vue の OVERLAY は今も 4 つの印を並べて拾っている (10-26 夜に [data-phone-issues-sheet] が抜けて最終チェック長が足した)。シミュの窓にも data-overlay を付けて ToTop が 1 つの印で拾う形に寄せる。窓はシミュの持ち物が多いので、シミュ部長の手が空いた時に 1 行ずつ頼む

## AdSense の審査の間だけコスメの入口を隠す (10-27、スイッチ adReview) — 戻す段取り
- 隠したのは上の切り替えタブの「コスメティック」だけ (ModeTabs.vue の SKINS_TAB_HIDDEN)。静的なページ (build-seo・build-blog・public) にコスメへのリンクは元から無く、コスメのページは noindex・sitemap 外。?page=skins と /cosmetics/ は直に開ける。
- 審査が通ったら: ModeTabs.vue の `const SKINS_TAB_HIDDEN = flag("adReview");` を `false` に (説明の 2〜3 行はそのまま残す)。オーナーの OK の後で。

## 本番で隠すスイッチ (オーナー 10-24「今本番に出てるやつそっくり出す」) — 3d616bd1・338c1c25
- src/web/release-flags.ts。使い方・入れた物・確かめは docs/org/dev/notes/2026-10-24-main-release.md の「スイッチの使い方」と「進み」。OK が出たら RELEASED に 1 行。

## 覚え (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。

## 閉じた物 (11-10 棚卸し)
- 10 本目 (10-28) の本番待ち armAll・emuRedo・noCut・backPlace・phoneHelp・tierWord — v0.1.637 で本番 (fc7f1578b)
- shared-ui.md ⑦2 ホットキーの見せ方 (案 A / A + B をオーナーが選ぶ、U-31) — オーナー 11-10「一旦完了でおｋ無視」
- shared-ui.md ⑦3 品質の帯を共有へ (シミュ部長と分担) — 済み (11-10 棚卸しで spec ⑦3 は片付いた)
- 9 本目 (10-26 夜) の済み (箱の中の MOD の表・withTitle・tightTier・fit-text・シミュの記録・スマホの上へ戻る) と今日のユニーク (todayUnique、OK 待ち) — 本番 (todayUnique は RELEASED に入っている)
- 8 → 9 本目の引き継ぎ (320 幅のスマホでヘッダーの右がはみ出す件、WebApp.vue) — v0.1.611 で本番
- 相場のエラーの文の折り返しを画面で見ていない・開く畳むの揃えはオーナーの言葉待ち (7 本目から) — 古い (開く畳むは済み)
- 見えない裏の直し (履歴・音・?lang=) を隠すか (ブラックの判断、10-24) — 古い
- 開く・畳むの揃え (オーナー 10-23、スイッチ dismiss・monkey1023) — 10-25 に本番 (notes/2026-10-23-expand-collapse.md)
- ModTable の見立て (シミュ = % 無しの問い) — 閉じた (ブラック 8 代目 10-23、ModTable は今のまま)
- MOD の表の列の見出し (出やすさ・段・Lv) に差し込み口が無い (要望待ち) — 古い
- 共通の部品がエンジンの入口 engine.ts を通さず核の中 (apply-*・stage-runes ほか 20 本ほど) を直に読む所 — 古い (11-07「全ての画面・機能はエンジンを参照する」作り直し、v0.1.679 で本番)
