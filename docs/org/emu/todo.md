# エミュ部長 のやる事

## 引き継ぎ (10-22 深夜、ジン部長からエミュの画面を分けた)
- 1 本目 (local_e86c6527-e247-441a-bc94-1bb5cfbbd498) が docs/org/emulator/todo.md と docs/pending-release.md から画面の仕事を下に写した (ジン部長の todo からは、ジン部長が消す)。立てた物 (Chrome・dev サーバー) は無し。
- 入口を通らずに読んでいる所の一覧: notes/2026-10-22-engine-direct-imports.md (147 行、入口にもうある名前 46・まだ無い 108。ジン部長が入口に足した後に寄せる)。

## やる事
- 入口だけに寄せる (上の notes)。10-22 深夜に入口にある 46 個を付け替え・エミュの要望の物を engine-emu.ts に (7595cea4・9ba6f47a)。10-23 にジン部長が棚・カード・MOD 一覧を for-share へ移し、9f46ef0b で MOD 一覧がエミュに戻り、残りは 41 行 (ジン 33・共通 8、シミュ 0)。入口にまだ無い名前 61 個はブラック経由でジン部長に入口・for-emu/ への追加を頼んでから付け替える。寄せ終わったら check-engine-entry の WEB_SIDE に「エミュ」を足す (ジン部長の台本)。
- クラフト画面 1440 幅で元からはみ出している 1 件 (DIV.flex flex-col、overflow-guard の判定で見つけた、10-22 ジン部長の記録) を直す。
- 返事待ち (オーナー、スパムシミュ。FROM_ON・ROUTES_MULTI_ON は v0.1.593 で本番に出て、どちらも今は true): 今のアイテムからの時に高貴の道も灰色 (増強だけでよいか)・この形の X のシェア (開いた人は同じアイテムを持っていないので今は出さない)・既定の始めの状態を今のアイテムにするか。複数の当たりのシェアは a に全部入る、両方揃うまでの数字はシェアに入れていない。スナップ 共有メモ routes-from/・multi-aim/。

## OK 待ち (エミュの画面の物。行は docs/pending-release.md、本番の出し方もそこ)
- お告げの欄を持った札の行の下に + 打てないお告げは灰色 (ff5c6f8c、HeldOmens・棚。シミュの棚・試し打ちも同じ部品)。本番の deploy:web では revert して外す。
- 枠の外・Esc で選ぶ前に戻す (490989fb・30760e05、共通の use-dismiss.ts とクラフト台の小窓・段の表など)。revert して外す。
- 聖別の帯 (e61bb9ab、StageSanctifyBar)。本番は CraftStage.vue で v-show="false" にして出している。
- MOD の数字を素の値で + 盛った値を小さく (afa0b266・86b42bb4・ada62af7・2d301a1a、base-values.ts の BASE_VALUES_ON、開発版だけ)。OK が出たら BASE_VALUES_ON を true。スナップ 共有メモ j11/。
- MOD の重みを直せる (StageWeightEdit、stage-tuning.ts の WEIGHTS_ON、開発版だけ。docs/org/emulator/notes/2026-10-22-mod-weight-edit.md)。OK が出たら印を外す。
- ほかに pending-release にあるクラフト台の物 (ベースの暗黙・紋章・スキルレベルの +・タリスマンの重み・[DNT] ベース・ルーンの明示 MOD の強さ・書体 1bef14b9) は中身がエンジン / 共通なのでジン部長の物。画面で見える変わり方だけ、開発版で一緒に見る。

## 済み (ジン部長の時代、画面の物) は notes/2026-10-23-todo-archive.md に移した
