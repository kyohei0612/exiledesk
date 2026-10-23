# エミュ部長 のやる事

## 引き継ぎ (10-22 深夜、ジン部長からエミュの画面を分けた)
- 1 本目 (local_e86c6527-e247-441a-bc94-1bb5cfbbd498) が docs/org/emulator/todo.md と docs/pending-release.md から画面の仕事を下に写した (ジン部長の todo からは、ジン部長が消す)。立てた物 (Chrome・dev サーバー) は無し。
- 入口を通らずに読んでいる所の一覧: notes/2026-10-22-engine-direct-imports.md (147 行、入口にもうある名前 46・まだ無い 108。ジン部長が入口に足した後に寄せる)。

## やる事
- モンキーテスト 10-23 (notes/2026-10-23-monkey.md) の残り: 2 (直に開くと / に戻る、page.ts) はジン部長 7 本目、4 (言語の URL)・9 (スマホの音の警告) はデザイン部長に頼んだ。7 (比べるが押せる見た目?)・8 (品質の − が 0% で押せる見た目?) は disabled が付いているので開発版で見た目を確かめる。1 回だけの CSP (google の枠) は広告の枠の物でエミュの外、再現を試す。「回す」で持ったカレンシーが外れるのは枠の外を押すと戻す決まりどおり (直さない)。
- 済み (10-23): 入口だけに寄せた。ジン部長の対応表 (emulator/notes/2026-10-23-emu-import-map.md) で 51 個・14 ファイルを engine.ts / engine-emu.ts に付け替え、見張りの A (入口の外) はエミュ 0 行。残りは入口でない共通 8 行 (share・trade2・market・currency など、決まりの外)。
- 済み (10-23): エミュの画面がチュートリアルを読む 6 行は、シミュ部長の入口 src/views/tutorial/course-entry.ts (bfe9d291) からに付け替えた (ブラック 8 代目の決め: エミュはそこだけを読む)。見張りの D は course-entry も数えるので 4 行残る (入口を例外にするかはジン部長・ブラック)。
- クラフト画面 1440 幅で元からはみ出している 1 件 (DIV.flex flex-col、overflow-guard の判定で見つけた、10-22 ジン部長の記録) を直す。
- 返事待ち (オーナー、スパムシミュ。FROM_ON・ROUTES_MULTI_ON は v0.1.593 で本番に出て、どちらも今は true): 今のアイテムからの時に高貴の道も灰色 (増強だけでよいか)・この形の X のシェア (開いた人は同じアイテムを持っていないので今は出さない)・既定の始めの状態を今のアイテムにするか。複数の当たりのシェアは a に全部入る、両方揃うまでの数字はシェアに入れていない。スナップ 共有メモ routes-from/・multi-aim/。

## OK 待ち (エミュの画面の物。行は docs/pending-release.md、本番の出し方もそこ)
- スパムシミュの猿の結果の直し 4 件 (c069970b、モンキーテスト 10-23 の 1・3・5・6): Esc は運試しの欄だけ閉じる・運試しの間は上の「当たった形でクラフト台に戻る」を出さない・スマホの一番安い札のボタンを折り返す・題を 1 行に・狙いの文を当たりになる幅全部で (例 最大ライフ (10-119) T8 以上)。pending-release への行はブラックに頼む。本番の deploy:web では OK 前は revert して外す。
- お告げの欄を持った札の行の下に + 打てないお告げは灰色 (ff5c6f8c、HeldOmens・棚。シミュの棚・試し打ちも同じ部品)。本番の deploy:web では revert して外す。
- 枠の外・Esc で選ぶ前に戻す (490989fb・30760e05、共通の use-dismiss.ts とクラフト台の小窓・段の表など)。revert して外す。
- 聖別の帯 (e61bb9ab、StageSanctifyBar)。本番は CraftStage.vue で v-show="false" にして出している。
- MOD の数字を素の値で + 盛った値を小さく (afa0b266・86b42bb4・ada62af7・2d301a1a、base-values.ts の BASE_VALUES_ON、開発版だけ)。OK が出たら BASE_VALUES_ON を true。スナップ 共有メモ j11/。
- MOD の重みを直せる (StageWeightEdit、stage-tuning.ts の WEIGHTS_ON、開発版だけ。docs/org/emulator/notes/2026-10-22-mod-weight-edit.md)。OK が出たら印を外す。
- ほかに pending-release にあるクラフト台の物 (ベースの暗黙・紋章・スキルレベルの +・タリスマンの重み・[DNT] ベース・ルーンの明示 MOD の強さ・書体 1bef14b9) は中身がエンジン / 共通なのでジン部長の物。画面で見える変わり方だけ、開発版で一緒に見る。

## 済み (ジン部長の時代、画面の物) は notes/2026-10-23-todo-archive.md に移した
