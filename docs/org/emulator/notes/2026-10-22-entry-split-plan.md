# 入口を「出した側だけ」に分ける案 (2026-10-22 深夜、ジン部長 6 本目。作るのはブラック・オーナーの OK の後)

元: 組織の変更 (38982ef3)。ジン部長 = エンジンの管理者、画面はエミュ部長・シミュ部長。エンジンに足した物は、要望を出した側の画面だけが使える。

## 今 (数えた台本は消した、git ls-files src の import を owners.txt の持ち主で分けた)
- engine.ts の export 85 行。使っている部ごとの名前の数: シミュだけ 59・エミュだけ 9・解析だけ 8・チュートリアルだけ 1、2 つ以上の部 12。
- シミュだけの 59 のうち、今日シミュの要望で足した物 (B1〜B16・C・aimHits の sameText) が約 40、残りは元からの核 (applyCurrency・room・SIDES・kindOf・loadHtcPatch・parseItemText・mulberry32 …)。
- エミュだけの 9: previewUse・omenBlock・catalystOf・stage-tuning の 4 つ (CATALYSING_PER_PCT など)・OVERRIDDEN・SANCTIFY_MIN / MAX。
- エミュの画面 (src/views/craft-stage・src/state/emulator) は入口を通さず中を直に読む行が 137 行 (34 ファイル)。今の見張りの「入口の外」はシミュ・チュートリアル・解析だけを数えている。

## 案
1. 入口を 3 つに
   - `engine.ts` = 核 (どの画面も読んでよい): 形・打つ・アイテムを読む・置き場 / 重み / 段・1 手の確率 (heldOdds・addHitOdds・stepOutcomes)・名簿・文・乱数。今の engine.ts から下の 2 つへ移す物を抜いた残り。
   - `engine-sim.ts` = シミュの要望で足した物 (シミュ・チュートリアル・解析が読む。チュートリアルはシミュ部長の持ち物、解析は順番の計算をシミュから呼ばれる): tier-rank・aim-odds の aimHits / aimHeldOn / isAimMod / junkOf / heldSetOf・aim-reach・hand-effect・can-use・hand-use・start-with・magic-odds・modListForUse・runesFor・modRawText。中身のファイルは今のまま (名前を並べる所だけ移す)。
   - `engine-emu.ts` = エミュの要望で足した物 (エミュだけが読む): 上の 9 と、これから直に読んでいる物を入口に出す分。
2. 見張り check-engine-entry.mjs
   - A (入口の外) の数える側に「エミュ」を足す。今の 137 行は控え (baseline) に入れて、増えたら落ちる・減ったら取り直す (今の A と同じ形)。
   - 新しく C (よその入口): エミュが engine-sim.ts を読む、シミュ・チュートリアル・解析が engine-emu.ts を読むと数える。今は 0 なので控え 0 から (1 行でも落ちる)。
3. 両方が欲しくなった物: 同じ名前を 2 つの入口に並べない。ブラックが決めて engine.ts (核) へ上げる (上げるのはジン部長、使う側の import の直しは同じ commit で、決まり 7)。
4. 入れ方 (OK の後、3 つの commit): ① engine-sim.ts・engine-emu.ts を作り、engine.ts からは消さずに両方に並べる (使う側は落ちない) → ② シミュ部長・エミュ部長が自分の import を付け替える → ③ ジン部長が engine.ts から移した名前を消し、見張りの C を入れて控えを取る。② が終わるまで ③ をしない (main は 1 本、型チェックが落ちる物を先に出さない)。

## 決めてほしい事
- 解析君の要望 (K4 の occupiedFamiliesOf・ANCIENT_BONE_FLOOR・REVEAL_SPEC など) は核のままでよいか、engine-sim.ts へ入れるか (案: 核のまま。解析は数字の確かめで両方の画面の答えを見るため)。
- エミュの直読み 137 行を入口に出す順番 (案: エミュ部長の要望が来た所から。まとめて先にはやらない)。

## 進み (10-22 深夜、オーナー OK)
- ① d4f85275: engine-sim.ts・engine-emu.ts を engine.ts と並べた。② (各部長の付け替え) はブラックが回す、③ (engine.ts から消す + 見張り C) は ② の後。

## 追記: しっかり分ける (オーナー 10-22 深夜「コードが混ざらないようにしっかり分けて、リファクタ含めて管理しやすいように」)

### 1. エンジンの中も置き場で分ける (済み 3d… の次、下の commit)
- `services/craft-stage/for-sim/` = シミュの要望で足した物: aim-reach・aim-held (aim-odds から分けた aimHeldOn・isAimMod・junkOf・heldSetOf)・hand-effect・can-use・hand-use・start-with・magic-odds・rune-choice・mod-list-use (mod-list から)・raw-text (item-text から、シミュの貼り付けが消えたら消す)。
- `services/craft-stage/for-emu/` = エミュだけの物: preview (旧 spec/preview)。これからのエミュの要望もここ。
- 核 = 今の services/craft-stage/ の残り。核が読む物は核に置く (tier-rank は aim-odds が、omen-block は for-sim/can-use も読むので核。stage-tuning は打つ処理が読むので核)。
- 決まり: 核は for-sim / for-emu を読まない。for-sim と for-emu は互いを読まない (読んでよいのは核だけ)。窓口 engine.ts (核)・engine-sim.ts (for-sim)・engine-emu.ts (for-emu) は名前を並べるだけ。③ で engine.ts から for-sim / for-emu の名前を消す。見張りでこの向きも数える (③ で入れる C に足す)。
- owners.txt は今の `src/services/craft-stage/** ジン` のままで足りる (行の追加は要らない)。

### 2. 画面どうしの混ざり (見張り D、今 41 行。4a317823 で控えに入れた)
シミュ→エミュ 27 行・エミュ→シミュ 14 行 (チュートリアルはシミュの側で数える)。移し先の案:
| 今の物 (エミュ) | 読んでいるシミュ側 | 移し先 |
|---|---|---|
| 棚一式: CurrencyShelf・ShelfButton・HeldOmens (+ held-omens.ts)・StageOmenTune・sanctify-steps・state/emulator の shelf-context・craft-stage-shelf・craft-stage-help (+ -text・-mods)・stage-tuning | TreeHandShelf・TreeMemoFloat・use-sim-shelf・tree-names・use-tree・use-tree-tune・topic-courses・StageTopicGuide・VideoStage・VideoTray | 共通 `src/components/stage/shelf/`・`src/state/stage/` (棚はクラフト台とシミュの棚・チュートリアルで同じ部品。連れてくる物は全部この一式の中だけ) |
| アイテムのカード: StageItemCard・base-values・stage-item-row-tag | TreeGoalPage・TreeHandShelf・TreeHoverCard・TreeStartPage・tree-row-tags・VideoCompare・VideoStage | 共通 `src/components/stage/item/` |
| state/emulator/stage-steps | チュートリアル craft-course・craft-lesson | 共通 `src/state/stage/` |
| use-spam-share・use-stage-base・use-stage-fx | recipe-share・SimBaseExtras・VideoStage | 共通 `src/components/stage/` (中身は小さい合成の関数) |
| StageModList (エミュ→シミュ sim-methods・quiz-build・SimMethodPop も読む) | TreeGoalPage | 共通へ移し、シミュの「作り方」の窓は slot にしてシミュ側から差す (StageModList はシミュの物を読まなくなる) |

| 今の物 (シミュ・チュートリアル) | 読んでいるエミュ側 | 移し先 |
|---|---|---|
| チュートリアル (CourseHost・course-host・craft-course・craft-lesson・craft-topic) | CraftStage・use-stage-base・StageSettings・RevealPanel | クラフト台の上でチュートリアルが動く形は残し、共通の差し込み口 (`src/state/stage/stage-hooks.ts`: 差す部品・手を打つ時の見張り・設定の行) を作ってチュートリアル側から登録。エミュは差し込み口だけを読む |
| シミュへの入口のボタン: recipe-share・StageRecipeStart・use-tree・SimBaseExtras・sim-recipe-store | CraftStage・StageSettings・StageBasePage・use-stage-base | 同じ差し込み口にシミュ側から登録 (ページの移動は共通の web-page.ts) |

### 3. 見張り
- D (エミュ ⇄ シミュ・チュートリアル) は 4a317823 で入れた。控え 41 行から減らす (減ったら `--head --write`)。
- ③ の時に C (よその窓口を読む・for-sim ⇄ for-emu・核が for-* を読む) を足す。

### 4. 移し方 (画面のファイルはエミュ部長・シミュ部長の持ち物なので順番が要る)
- .vue は元の場所に中継ぎを置けないので、移す物 1 組ずつ「ジン部長がファイルを移し、両側の import の行だけ同じ commit で直す」。その間その組のファイルを他の部長が触らないよう、ブラックが順番を決めて dev/touching に書く。中身の直し (slot・差し込み口への登録) は移した後に各部長。
- 順番の案: ① 棚一式 → ② アイテムのカード → ③ 小さい物 (stage-steps・use-*) → ④ StageModList (slot) → ⑤ 差し込み口 (チュートリアル・シミュへの入口)。1 組ごとに型チェック・見張り D の控えを取り直す・開発版でクラフト台とシミュの棚を見る。
