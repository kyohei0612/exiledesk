# コードの点検 (2026-10-22、ジン部長 3 本目。ブラック 4 代目の頼み「組織とコードの整理」、オーナー OK)

読むだけの点検。直すのは後で、下の「直す案」を部ごとに振る。
- 数え方: import の図を作って数えた (静的 import・`import()`・`new URL(…, import.meta.url)`・scripts と server の「ファイル名の文字列」)。根は web (`src/web/main.ts`)・アプリ (`src/main.ts`)・package.json の scripts・workflows と wrangler・tests の `*.test.ts`。使った台本は scratchpad の物で、もう消える。同じ物差しは **`node scripts/org-lint.mjs`** (ホワイト用、10-22) で毎日回せる。
- 数: コード 967 ファイル。web から届く物 509、アプリから届く物 697。アプリからだけ届く src は 230 本・33,225 行。他のファイルに名前が出てこない export は 401 (うち自分のファイルの中でも使われていない物 19)。
- 済み (この日): 500 行超え 4 本を割った。parts.ts → parts-unrevealed.ts (ce37a00e)、stage-core.ts → stage-draw.ts、build-htc-bases-from-client.mjs → _htc-display-tags・_htc-base-info (c820779f)、build-gem-hover-ja.mjs → _gem-csd (76ba9b43)。scripts/_flux-probe.test.ts (未追跡の使い捨て) は消した。

## 1. 使われていない
### 確実 (どのファイルにも名前が無い。video/ も見た)
- src/state/simulator/sim-recipe-store.ts:49,54,64,72,77 — renameRecipe・duplicateRecipe・removeRecipe・restoreRecipe・replaceRecipes (10-20 の移動から呼ばれていない) — 消す [シミュ]
- src/services/craft-stage/apply-flux.ts:20 isFlux、chaos-spam.ts:18,22 SPAM_KEYS・SPAM_PEOPLE — 消す [ジン]
- src/services/simulator/auto/auto-order.ts:200 型 AutoOrderClient — 消す [解析]
- src/services/simulator/tree/tree-samples.ts:15 型 TreeSampleName、src/views/simulator/use-sim-auto.ts:79 型 SimAutoCtx — 消す [シミュ]
- src/vendor/poe2htc/engine/shipMods.ts (全体、元のサイトのビルド用) と vendor の使われていない関数 7 つ (probability.ts:684 desecrationOffered・runes.ts:191 usesAssumedPool・optimizer の orderedSelections・currencyAtPosition・optimizeAddChain・hasAlternatives・expansionCount) — 写しなので残すか決める [ジン]
- web 側で export しているのに自分のファイルの中でしか使わない名前 約 320 — export を外せる。多い所: craft-stage/contract.ts 34 (video/contracts と対なので残す)・simulator/tree/tree-run.ts 9・simulator/pattern.ts 9・simulator/auto/auto-order.ts 7
### 要確認
- テストだけが使う src: simulator/auto-group.ts・simulator/quiz-samples.ts・tutorial/quiz-tutorial-run.ts — 見本として残すか [シミュ]
- vendor/poe2htc/optimizer/markovFromItem.ts (1578 行)・markovRoute・markovStarts・markovSymmetry — 本体から届かず、テストと台本だけ [ジン]
- どこからも呼ばれない scripts (手で回す作り直しと見られる、docs にもメモにも名前が無い): build-flux-conversions・build-inherent-skills・build-stat-order・build-tradeable-bases・check-ja-terms・verify-mods-bundle (2026-05)・build-blog-chars.py (10-21) — 消すならオーナーに一覧を出してから [ジン / 記事]
- server/discord-wake/ (4 本・430 行、README に「まだ動かしていない」) — Bot を作るか判断待ち [分析]

## 2. 重複
### ジン・共通
- share.ts:84-90 の packJson・unpackJson があるのに、use-spam-share.ts:20-26・state/emulator/spam-share-open.ts:21-29・server/web/og-card.js:26 が圧縮と base64url を自前で書く — share.ts の物を使う (og-card.js は実行場所が別なので写しのまま、式の一致を見るテストを 1 本)
- share.ts:113 と views/simulator/recipe-share.ts:109 — X の投稿 URL — recipe-share で xIntentUrl を使う [シミュ]
- GRADE_KEY の同じ表 3 か所 (route-race.ts:56・spam-counts.ts:31・StageRoutesPage.vue:29)、spam-counts.ts は route-race.ts の routeRun と同じ打ち方・乱数の種 (:68 と :148) — 1 つの部品に
- MOD の id → 側 の同じ式 6 か所 (spam-counts.ts:45・simulator/auto/auto-model.ts:164・auto-group.ts:16・quiz-build.ts:85・recipe-sim.ts:49・sim-odds.ts:33) — エンジンの入口に sideOfMod を足す
- htc/prices.ts:82 と state/market-store.ts:103 の CurrentPrice、htc/omens.ts:9 と simulator/recipe-defs.ts:149 の高貴のお告げの表、craft-stage-help-mods.ts:78 と craft-stage-help.ts:207 のエッセンスの段、mods/mod-values-check.ts:102 と mods/tiers.ts:49 の範囲の正規表現、telemetry/log-sender.ts:28 と web/track.ts:32 の rand — それぞれ 1 か所に
- スマホ判定 (innerWidth < 768 + resize) 4 か所 (BaseCatalog.vue:70・CraftStage.vue:166・StageRouteLuck.vue:143・use-sim-run.ts:48)、touchOnly 3 か所 (BaseCardGrid.vue:26・HelpTip.vue:30・ShelfButton.vue:76) — utils/use-phone.ts に
- StageOmenTune.vue:27,30 と StageSanctifyBar.vue:23,27 の聖別の段と select、StageAimPicker.vue:36,47・StageFracturePicker.vue:77・StageModList.vue:41 の rows と idOf — 合成関数に
- % の書き方の残り 1 か所: views/gem-corrupt/SalePanel.vue:148
### シミュ・チュートリアル
- fmtDate 5 か所 (SimRecipeBar.vue:24・StageRecipesPage.vue:24・StageRecipeStart.vue:53・tree/TreeRecipeBar.vue:22・use-sim-recipes.ts:20)
- openUrl・onPaste 3 か所 (StageRecipesPage.vue:99・StageRecipeStart.vue:45・TreeRecipeBar.vue:70) — composable に
- toggleOmen 3 か所 (StageQuizEditor.vue:153・TreeHandShelf.vue:48・TreeTrial.vue:52)、TreeHandShelf と TreeTrial の onHold・onShelfDown・keydown の外し、打てない理由 (state/craft-stage.ts:199 と同じ)
- newId と配列の JSON の読み (sim-recipe-store.ts:26・sim-recipes.ts:75 と tree-recipes.ts:21,24)、members = [本体, ...alts] 3 か所 (auto-model.ts:167・keep-compare.ts:55・quiz-build.ts:109 → recipe-defs の membersOf)
- recipe-pattern-run.ts:107,388 と recipe-sim.ts:236,289 の失敗の判定、tree-run.ts:93 と tree-sample.ts:89 の触媒の判定、use-sim-run.ts:222 と use-sim-search.ts:176 の price、use-sim-search.ts:106 と use-sim-targets.ts:337 の「〜分前に入れた」
- パターンの初期値 3 か所 (StageSettings.vue:112・use-stage-base.ts:51・use-sim-steps.ts:64) — 定数に (craft-stage 側の 2 か所はジンと)
- チュートリアルの H 3 か所 (topic-courses.ts:61・-adv.ts:12・-guide.ts:12)、slot の写し (quiz-samples.ts:22 と quiz-tutorials.ts:392、course-recipes.ts:39,93 と quiz-tutorials.ts:89,165)、Video*.vue の showFormula と s
### サーバー
- server/live/src/index.ts:48,53 と youtube.ts:207・twitch.ts:51 のチャンネルの絞り込み
### scripts
- poe2db の照合の famKey・modsView・sameNums・pageOf が audit-poe2db*.mjs と build-poe2db-fixes.mjs に 3〜5 回ずつ — _poe2db-common.mjs に
- exists・loadTable・exportTables がクライアントからの作り直し 5〜12 本に — client-export-config.mjs に
- scripts/analysis の boots-res-ev・es-gloves-ev・gold-ring-suffix-ev・mana-ring-ev の runOne・nextMove・costOf・isTarget — 解析君の共通部品に

## 3. 持ち場のずれ
### A. owners.txt は「アプリ (凍結)」なのに web から届く (org-lint の「web が使うのに アプリ」)
- views/simulator/use-sim-targets.ts:15 が views/htc-craft/redo-cost を import → htc-craft の tree-auto・tree-auto-input・redo-cost-types と services/simulator/htc の sim-route*・step-odds まで web に入る (ARCHITECTURE.md の「simulator/htc は Web から import しない」に反する)。use-sim-search.ts:7 も simulator/htc/tree-buy の AFFIX_COUNT
- services/trade2 の 11 本 (open-external・localize・query*・stat-kinds・resist-group・league・pricing*)、services/market/legacy-rune.ts、views/gem-corrupt の web の 12〜14 本、views/unique-trend 2・views/currency 3、services/craft-v2/types* 4 (型だけ)
### B. owners.txt は「共通」なのにアプリからしか届かない (約 85 本)
- src/App.vue・main.ts・LeftSidebar・CenterContent・UpdateToast・LoginGate・ConfirmDialog・FetchBusyBar、components/currency・unique-trend・build-copy の一部、state/craft-v2・watch-*・poe-session・trade-lock・update-check、services/trade-history*・market-flow*・mtx・pob-bundle、i18n/mod-tier-and-group.json ほか。ジンの mods/dictionaries.ts・tiers.ts も同じ
### C. 10-20 以降の commit の主と持ち主がずれている (26)
- ジン → 主にシミュ: views/craft-stage の CraftStage.vue (7/10)・StageBasePage.vue (7/7)・use-stage-base.ts (5/5)・StageSettings.vue (3/4)・HeldOmens.vue (2/2)
- 共通 → 主にシミュ: web/page.ts・state/web-page.ts・web/WebApp.vue、scripts/_tree-*-probe (owners.txt に行が無く既定の共通)
- 共通 → 主に記事: scripts/build-blog-pages.mjs (10/17)・_blog-client.js・services/blog/blog-md.ts・src/data/blog/README.md
- 解析 → 主にシミュ: services/simulator/auto/ の 6 本、scripts/analysis/check-tree-run・check-auto-nan
### D. その他
- services/pob-check (持ち主は共通、アプリの機能) が web から 2 本の道で届く: item-text.ts は HoverStack → BuildItemHoverCard、api.ts・breakdown.ts は GemCorruptWebPanel → trade-links — 置き場を決め直す
- server/discord-wake (持ち主は分析) は中身が組織 (ブラック) の物に近い

## 4. 500 行超え (アプリと vendor を除いた物)
- src/style.css 982 [共通] — 部品ごとの css に
- src/services/pob-check/item-text.ts 704・breakdown.ts 671 [共通] — web から外すか割るか (3-D と一緒に決める)
- tests/engine-emulator-parity.test.ts 512 [ジン] — 2 本に
- vendor の写し (残す): markovFromItem 1578・probability 1059・markovActions 985・optimize 625・cost 597

## 5. 触らない (アプリ側だけ、場所と大きさ)
- src のうちアプリからだけ届く物 230 本・33,225 行。うち views/htc-craft 27 本 4,407 行・views/pob-check 12 本 3,602 行 (usePobCheck.ts 888・BuildDiff.vue 630・PobCheck.vue 585・TreeView.vue 560)・i18n/mod-tier-and-group.json 2,709 行・services/craft-v2 15 本 1,672 行・views/gem-corrupt のアプリ側 9 本 1,600 行・views/gem-watch 15 本 1,282 行・components/craft-v2 11 本 1,208 行
- services/simulator/htc 11 本 2,088 行 (7 本は 3-A のとおり web から届く)
- src-tauri/src (Rust) 12,742 行
- scripts の check-htc-*.mjs 18 本 2,156 行、PoB・pob-check-live 7 本 1,221 行、trade2・mtx・ninja 4 本 629 行、check-gem-math・check-flow・export-flow-seed 3 本 500 行

## 直す案 (部ごと、ブラックが振る)
### ジン部長 (エンジン・共通)
1. owners.txt を直す: 3-A の web から届く物 → 共通 (simulator/htc と htc-craft はシミュ部長が import を外すなら不要)、3-B のアプリからだけの物 → アプリ、scripts/_tree-* → シミュ。3-C の持ち主を変えるかはブラックが決める
2. share.ts の packJson・unpackJson・xIntentUrl を use-spam-share.ts・spam-share-open.ts で使う
3. route-race と spam-counts の重複 (GRADE_KEY・打ち方・種) を 1 つに (StageRoutesPage.vue:29 も)
4. エンジンの入口に sideOfMod を足す (シミュ 5 か所・解析 1 か所が使う)
5. 小さい物: use-phone・touchOnly、prices と market-store、craft-stage-help の 2 か所、mod-values-check と tiers、log-sender と track の rand、StageOmenTune と StageSanctifyBar、StageAimPicker・StageFracturePicker・StageModList
6. 消す: isFlux・SPAM_KEYS・SPAM_PEOPLE。vendor の shipMods.ts と使われていない 7 つは残すか決める
7. 500 行超え: style.css を割る、engine-emulator-parity.test.ts を 2 本に、pob-check は 3-D と一緒に
8. scripts: _poe2db-common.mjs・client-export-config.mjs に寄せる。使わない台本 7 本はオーナーに一覧を出してから
### シミュ部長
1. use-sim-targets.ts:15・use-sim-search.ts:7 の凍結の物への import を外す (要るならエンジンの入口か共通へ移すようブラック経由でジンに)
2. 2 節の「シミュ・チュートリアル」の重複をまとめる (recipe-share.ts は xIntentUrl を使う)
3. 消す: sim-recipe-store.ts の 5 関数・TreeSampleName・SimAutoCtx。テストだけの 3 本を残すか決める
4. views/craft-stage の 5 本と web/page.ts・state/web-page.ts の持ち主をどうするかブラックに 1 行
### 解析君
1. simulator/auto/ の 6 本の持ち主 (解析) と実際の手 (シミュ) を合わせるか (ブラックへ)
2. sideOfMod が入ったら auto-model.ts:164 を替える。AutoOrderClient を消す
3. scripts/analysis の 4 本の写しを共通の部品に
### 分析君
1. server/live/src/index.ts の絞り込みを youtube.ts・twitch.ts にまとめる
2. og-card.js の unpack・shortIdOf の式の一致を見るテストを 1 本
3. server/discord-wake と live-panel.js (src/web/LivePanel.vue と役が被るか) の持ち主と要否
### 記事・動画
- 記事: build-blog-pages.mjs・_blog-client.js・blog-md.ts・src/data/blog/README.md を owners.txt で「記事」にするか (ブラックへ)
- 動画: craft-stage/contract.ts の型は video/contracts と対なので今のまま
