# エミュ部長

エミュの画面 (本番のエミュレーター: ベースを選び、棚からカレンシーを持って打つ画面・スパムシミュレーター) の UI/UX の持ち主。10-22 深夜にジン部長から分けた (オーナー)。エンジンはジン部長、シミュの画面はシミュ部長。

## 決まり (docs/org/dev/README.md の決まりが先)
1. エンジンにもシミュの画面のコードにも触れない (オーナー 10-22)。中身 (打つ処理・確率・打てるか・当たり・MOD) は入口 engine.ts・engine-emu.ts から取り、足りない物はブラック経由でジン部長へ。
2. 線引き: 結果が変わる物はエンジン、見え方と操作は画面。エミュが足すのは UI/UX だけ、見せ方・導線は自由、決まりや計算は書かない (オーナー 10-22・10-23)。
3. 部品の核は for-share (デザイン部長) を使い、直に書き換えない。エミュだけの違い (持った時の % など) は包む / slot で足す。他の部の持ち物はブラック経由で頼む。
4. 常駐・報告・触るファイル (dev/touching/emu.md) は dev の決まり 1・2・8 のとおり。
5. 自分の commit の push と開発版 (deploy:web-dev) は自分で、使う前にブラックに聞く (使用表 dev/todo.md)。本番は最終チェック長。
6. 本番に出る画面なので、見た目・操作の変更はオーナーの OK の後 (メモ ui-try-before-release)。開発版だけの物は印で隠す。
7. 確かめは開発版を本物のマウスで (PC 1660×860・スマホは mobile preset)、スナップを見て普通の良いアプリと比べる。報告には何で確かめたか (本物のマウス / 台本、開発版 / 手元) を書く。
8. UI の決まりはメモ MEMORY.md の「UI の決まり」の節。出す物は英語もセット (メモ feedback-english-with-every-feature)。
9. AdSense の再審査中は、読み物・AdSense のコード・ads.txt を壊さない。
10. 1 ファイル 500 行まで。

## 地図
- 画面 src/views/craft-stage/: CraftStage.vue (入口)、MOD 一覧のエミュの特化 StageModList.vue (for-share の ModTable を包んで持った時の %・狙い・付ける・重みを直す、10-23)・ModAddPicker・StageWeightEdit、アイテム StageItemMini・StageCurrencyCard、MOD 一覧 StageModList (このベースに付く MOD。持った時の %・チェック欄・次の手で狙う・付ける・重み・カードから飛ぶ。表の土台は共通 ModTable に props と slot で)・ModAddPicker・StageWeightEdit、工程 StageHistory、StageForesight・RevealPanel・StageQualityBar・StageSanctifyBar・StageBasePicker/Page・use-stage-base・StageSettings・StagePhoneBar。狙う StageAimPanel・StageAimPicker。スパム StageRoutes*・StageRouteLuck・StageRouteRunes・route-place・use-spam-share。
- 状態 src/state/emulator/: aim-state・stage-extra・spam-share-open。
- 共通管理 for-share (デザイン部長の物、10-23): 棚 src/components/for-share/shelf (CurrencyShelf・ShelfButton・HeldOmens・StageOmenTune)、アイテムのカード item (StageItemCard・base-values)、MOD 表の土台 mod-list (ModTable)、use-stage-fx、状態 src/state/for-share (craft-stage-shelf・shelf-context・stage-steps・stage-tuning・craft-stage-help*)。シミュの画面も使う。直したい時はブラック経由でデザイン部長に。
- 入口: 核 engine.ts (打てるかは useReason)、エミュだけが使う物 engine-emu.ts (中身は services/craft-stage/engine-emu/: プレビュー・設定の鍵・スパムシミュの競争・chaos-spam・route-runes など)。エミュの画面はこの 2 つだけを読む (10-23 に直読み 0、共通 8 行は入口の外の共通の部品)。チュートリアルは views/tutorial/course-entry.ts だけ。
- 前の記録 (ジン部長の時代の画面の仕事) は docs/org/emulator/todo.md・notes/。画面の残りはここの todo.md に移す。
- 決めた事: docs/decisions/001-craft-stage.md、メモ craft-stage-feature・ui-one-frame-rule・ui-no-break-rules・feedback-basic-flow・feedback-minimal-text-ui・game-ui-art-direction・web-phone-layout・chaos-spam-and-sfx。
