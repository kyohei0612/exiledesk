# デザイン部長 のやる事

## 10 本目の今 (10-28、ブラック 15 の下)
- 本番待ち (スナップでオーナー OK 済み 10-28、絵は共有メモ local_c6a769ac…/ok-snaps/design-*.png。出すのは最終チェック長): armAll (2 回押しは外・Esc で戻す)・emuRedo (エミュのやり直し)・noCut (… で切らない)・backPlace (戻るで前の位置・タブは一番上)・phoneHelp (エミュのスマホの説明は閉じる)・tierWord (段 → ティア、MOD 表の列は 1 行で入る幅 4702d255c)。commit 047c82462・be79a05e5・2914a46f1・410d84e1f・8c1dd25e2・4702d255c。ジェムコラプトを Web から外した 87ea44cb0。
- 残り: shared-ui.md ⑦ の 2 (ホットキーの見せ方、案 A+B をオーナーが選ぶ)・3 (品質の帯を共有へ、シミュ部長と分担)・6 (重ね窓の印 data-overlay、下の宿題)。タブで状態も最初からはエミュ部長・シミュ部長の state。
- 確かめの台本: 共有メモ local_a9a41698…/design10/ (u7-check・phone-help-check・tier-word-check・gem-off-check・ok-snaps・tier-fix.mjs、窓なし Chrome 9340〜9345)。

## 9 本目の今 (10-26 夜)
- 済み (どれも hash はブラック 13 へ): 箱の中の MOD の表をアイテムの形に b4d64779・686a7ac2・3a3c08b7・02a8aa75、題の帯の印 withTitle 4d8d8d79、段の札を細く tightTier 3c14f97a、入らなければ縮めて 1 行 utils/fit-text.ts 61f7c1e0 (箱の中は縮めずに折る 02a8aa75)、シミュの記録 7a263e0b・web/sim-trail.ts c6328eb5、スマホの上へ戻るを重ね窓の間は隠す 333f51a7、今日のユニーク 58872a72 (スイッチ todayUnique、オーナーの OK 待ち)。
- 宿題 (急がない、ブラック 13): ToTop.vue の重ね窓の印が増えるたびに OVERLAY に足している (10-26 夜に [data-phone-issues-sheet] が抜けて最終チェック長が足した)。重ね窓が共通の印 1 つ (例 data-overlay、ModalShell と各窓に付ける) を付ければ ToTop が拾える形に寄せる。窓はシミュの持ち物が多いので、印の名前を決めてシミュに 1 行ずつ頼む。
- 確かめの台本: 共有メモ local_526b63a7…/design9/ (box-card-shot・goal-shot・sim-track-check・totop-check・today-unique.mjs、窓なし Chrome 9339)。

## AdSense の審査の間だけコスメの入口を隠す (10-27、スイッチ adReview) — 戻す段取り
- 隠したのは上の切り替えタブの「コスメティック」だけ (ModeTabs.vue の SKINS_TAB_HIDDEN)。静的なページ (build-seo・build-blog・public) にコスメへのリンクは元から無く、コスメのページは noindex・sitemap 外。?page=skins と /cosmetics/ は直に開ける。
- 審査が通ったら: ModeTabs.vue の `const SKINS_TAB_HIDDEN = flag("adReview");` を `false` に (説明の 2〜3 行はそのまま残す)。オーナーの OK の後で。

## 次の部長へ (8 本目 → 9 本目、10-26 夜、ブラック 13 の下に揃える入れ替え)
- 8 本目の仕事は 1 つ: 320 幅のスマホでヘッダーの右がはみ出す件 (オーナー 10-26 夜、ブラック 13 経由)。src/web/WebApp.vue の書き換えは済み、オーナーの OK も出た。**commit とリリースは最終チェック長が v0.1.611 で出す** (8 本目は WebApp.vue を commit していない)。9 本目は手を出さず、出た後に本番の 320 で帯を見るだけでよい。
- 直した形: 375 未満の幅 (`max-[374px]:`) だけ、隠さずに詰める。帯の余白 px-2→1・すき間 gap-1→0.5、ロゴの絵 size-6→5・字 12→11px、言語の切り替えのボタンの余白 px-2→1.5、3 つのボタン (ブログ・使い方・要望) 36→32px (g-btn sm の左右の枠の絵が 18px ずつで 36 より細くならないので、枠を 16px ずつに)、本日の人数は足りない時だけ「本日」/「48 人」の 2 行に折れる (数と人の間は ` `)。375 以上は前のまま (375 の日本語は元から帯の中身が 1px 多く、375 で縮めると人数が折れるので 375 未満だけにした)。
- 確かめた事 (dev 1440・窓なし Chrome 9338、画面の数字): 320 はエミュ・シミュ・使い方・要望・スパム × ja・en の全部で帯の中身 320/320・切れた文字 0・横 320/320 (前は 368/320、英語 361、「使い方」の半分と「要望」が帯の外)。375 と 1660 は帯の中の物の幅・位置が前と同じ (1px も違わない)。エラー 0、型 OK。320 の余りは右 4px + 人数の縮む分 12px ほど。
- 台本と絵: 共有メモ local_feea72b4…/design8/ (hd320-check.mjs、[置き場] を渡すと前 / 後の 320・375 を並べた 1 枚を作る。前は before/、後は after/hd-320-375-before-after.png と result.txt)。スパムのページは `?base=Gold%20Ring` で白を置いてから data-routes-open を押す。
- 立てっぱなしの物は無し (9338 は台本の中で止めた)。使用表の窓なし Chrome の行はブラック 13 が書き換える。
- 残り (頼まれていない): 相場のエラーの文の折り返しは画面で見ていない (7 本目から)。開く・畳むの揃えはオーナーの言葉待ち。

## 7 本目 → 8 本目 (10-26 夜) は notes/2026-10-26-design7-handover.md と git の履歴に (決め: スマホは省略しない・タップで別のページへ飛ばさない、メモ feedback-phone-no-truncate)

## 済んだ節 (前の版の塊を残す・404 が 3 回・入口の塊の 404・古い塊の読み直し・StageItemCard の D1・D2・エミュ部長の頼み) は notes/2026-10-23-todo-archive.md にそのまま移した。各節の「見ていない」もそこ (10-23 夜 ホワイト)。10-23 夜に 3 本目が fitZoom・先読み・シミュの初手・BasePickBody・ModeTabs・モンキー 4・14・15・モンキー 3・2・9 も移した (OK 待ちは上の引き継ぎに commit で並べてある)

## 10-24 の済んだ節 (アイテムの枠の取り下げ・段の表の行のボタン b6b7fea2・高速のタブ替え 2affeeeb) は notes/2026-10-24-todo-archive.md にそのまま移した

## 本番で隠すスイッチ (オーナー 10-24「今本番に出てるやつそっくり出す」) — 3d616bd1・338c1c25
- src/web/release-flags.ts。使い方・入れた物・確かめは docs/org/dev/notes/2026-10-24-main-release.md の「スイッチの使い方」と「進み」。OK が出たら RELEASED に 1 行。
- 残り: TREE_ON・DAILY_ON・SIM_LOCKED のスイッチ寄せは済み (18e66905、craft-stage.ts・web-page.ts)。見えない裏の直し (履歴・音・?lang=) を隠すかはブラックの判断。

## 開く・畳むの揃え (オーナー 10-23) — 994b95b8・6d535cbd・fb69342b + エミュ 1d6fa62b・シミュ 990f12ad、済み
- スイッチ dismiss・monkey1023 ごと 10-25 にオーナーの OK で本番に出た (「全部一緒に出して OK」)。表と確かめは notes/2026-10-23-expand-collapse.md。

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。
