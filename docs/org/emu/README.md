# エミュ部長

エミュの画面 (本番のエミュレーター: ベースを選び、棚からカレンシーを持って打つ画面・スパムシミュレーター) の UI/UX の持ち主。10-22 深夜にジン部長から分けた (オーナー)。エンジンはジン部長、シミュの画面はシミュ部長。

## 決まり (docs/org/dev/README.md の決まりが先。画面の決まりの正は docs/spec/emu.md の M-xx、ここは番号を指すだけ)
1. 中身はエンジンの関数を直に呼ぶ、自作しない・無ければジンへ (G-06、emu.md ①・M-01)。
2. 線引き: 結果が変わる物は engine.md、見え方と操作は emu.md、エミュだけの扱いは services/emulator/emu-engine (emu.md ①)。
3. 部品の核は for-share (デザイン部長) を使い、違いは包む / slot で (shared-ui.md)。
4. シミュの画面のコードは import しない (M-92、見張り D)。他の部の持ち物は持ち主に直接頼み、結果はブラックへ 1 行。
5. 見た目・操作の変更はオーナーの OK の後、出していない物はスイッチの下 (G-08、shared-ui.md)。
6. 足す手順と確かめは emu.md ⑥ (手元 1440 を本物のマウスで、報告に何で確かめたか)。合格の基準は G-22。
7. スマホはエミュでの当て方が M-70〜72、省略しない・並びの土台は shared-ui.md。
8. UI の決まり・英語のセットは shared-ui.md。決まりが変わったら同じ commit で emu.md を直す (G-20)。
9. 広告の審査の間は Y-22b (読み物・AdSense のコード・ads.txt を壊さない)。

## 地図
- データとエンジンの答え (呼び方・使っている部) は docs/org/emulator/data-catalog.md から。JSON を直に読まずエンジンの関数で (直に読んでよい表は目録に書いてある物だけ)。
- 画面 src/views/craft-stage/: CraftStage.vue (入口)、アイテム StageCurrencyCard (スマホの上に貼るのはカードそのもの [data-item-pin]、11-10 に StageItemMini を消した)、MOD 一覧 StageModList (このベースに付く MOD。持った時の %・チェック欄・次の手で狙う・付ける・重み・カードから飛ぶ。表の土台は for-share の ModTable を包み props と slot で、10-23)・ModAddPicker・StageWeightEdit、工程 StageHistory、StageForesight・RevealPanel・StageSanctifyBar・StageBasePicker/Page・use-stage-base・StageSettings・StagePhoneBar。狙う StageAimPanel・StageAimPicker。スパム StageRoutes*・StageRouteLuck・StageRouteRunes・route-place・use-spam-share。
- 状態 src/state/emulator/: aim-state・stage-extra・spam-share-open。
- エミュだけの扱い (10-26 にエンジンから出した置き場。emu-engine/ の持ち主は 11-07 からジン = owners.txt、emu-engine.ts はエミュ部長): src/services/emulator/emu-engine.ts・emu-engine/。
- 共通の部品 for-share (棚・アイテムのカード・MOD 表の土台) はデザイン部長の物。地図は docs/org/design/README.md。
- エンジン: 核 src/services/craft-stage/ (よく使う名前の束 engine.ts、打てるかは useReason)。チュートリアルの差し込み口は views/tutorial/course-entry.ts だけ。
- 共有と各画面の線は U-01。エミュの流れにしか無い物 (持つ・次の手で狙う・スパムの計算) はここ。
- 決めた事: 画面の決まりは docs/spec/emu.md (M-xx、残っている仮は ⑦)。経緯は docs/decisions/001-craft-stage.md・notes/。
