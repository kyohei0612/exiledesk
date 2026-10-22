# ジン部長 が触っているファイル

始める時に下に行を書き、自分の commit で消す (このファイルは ジン部長 だけが書く)。

| 誰 | ファイル |
|---|---|
| ジン部長 6 本目 | src/services/craft-stage/ (for-sim/・for-emu/ へ移す、engine*.ts・aim-odds・mod-list・item-text)・scripts/check-engine-entry.mjs (+ 控え)、10-22 深夜 |
| ジン部長 6 本目 | 画面の移し ① 棚一式: src/views/craft-stage/{CurrencyShelf,ShelfButton,HeldOmens,StageOmenTune}.vue・held-omens.ts・sanctify-steps.ts・src/state/emulator/{shelf-context,craft-stage-shelf,craft-stage-help,craft-stage-help-text,craft-stage-help-mods,stage-tuning}.ts → src/components/stage/shelf/・src/state/stage/、読む側の import の行 (エミュ・シミュ)、10-22 深夜 |
| ジン部長 6 本目 | 画面の移し ② アイテムのカード: src/views/craft-stage/StageItemCard.vue・base-values.ts・stage-item-row-tag.ts → src/components/stage/item/、読む側の import の行、10-22 深夜 |
| ジン部長 6 本目 | 画面の移し ③: src/state/emulator/stage-steps.ts → src/state/stage/、src/views/craft-stage/use-stage-fx.ts → src/components/stage/、読む側の import の行、10-22 深夜 |
| ジン部長 6 本目 | クラフト台の中のシミュの形 (死蔵 A2・A3・B・C のエミュ) を消す: src/state/craft-stage.ts・stage-session.ts・web-page.ts・src/web/page.ts・track.ts・FeedbackDialog.vue・feedback-summary.ts・src/views/craft-stage/ (CraftStage・StageSettings・StageModList・StageBasePage・use-stage-base・StageFracturePicker)・src/views/simulator/ (SimBaseExtras・StageRecipeStart・SimMethodPop)・src/state/simulator/ (sim-state・sim-recipes・sim-recipe-store)・使い手 0 の services/simulator、10-23 |
| ジン部長 6 本目 | 画面の移し ④ MOD 一覧: src/views/craft-stage/{StageModList,StageWeightEdit,ModAddPicker}.vue・stage-mod-list-look.ts → src/components/stage/mod-list/、読む側の import、10-23 |
