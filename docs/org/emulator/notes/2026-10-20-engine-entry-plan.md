# エンジンの入口と「二重の所」の案 (開発部長、2026-10-20 改。読むだけ・案だけ)

**前提 (オーナー 10-20 決定)**: 新しいエンジン部は作らない。**エンジン部 = エンジンの核**。ジン部長がエンジンとクラフト台の画面の両方を持つ。シミュ・チュートリアル・解析君は自分で計算せず、必ずエンジン部のエンジンの入口を通す。
数え方: 台本は `engine-dept-scripts/` (engine-imports.mjs = 外 → エンジンの import の数、rev.mjs = エンジン → 外・チュートリアルの寄りかかり、names.mjs → names.txt = 外が使う名前)。二重の所は grep (下の「確かめた方法」)。HEAD 42c8a9eb で数えた (main に無い書きかけは別の欄に書いた)。

## 決めてもらう事 (おすすめが先)
1. **③ の「式」(keep-compare・sim-greater・self-craft-dist・use-sim-calc) をどうするか**: おすすめ = **エンジン部の入口に「1 手の当たりの確率」(spec/odds の addOddsBySpec を外に出した物) と「フラクチャーの当たり」を足し、シミュの式はそれを使う形に付け替える**。式そのもの (ループの組み方) はシミュに残してよい。人数で回す形に変えると 2 万人分が遅くなる。
2. **解析君の auto-actions.ts (main に無い書きかけ) の扱い**: おすすめ = **近似の DP は残してよいが、「1 手で何が付く・消える・どの割合か」はエンジン部の入口 (候補 candidates・1 手の確率) から組み立てる**。今は手 (高貴・カオス・消去・骨・エッセンス・お告げ) の効果を自前で書いている。④ の後に付け替える。
3. **チュートリアル部を独り立ちさせるか**: おすすめ = **今はしない (シミュ部の中のまま)、ただし線だけ先に切る** (下の ④)。

---

## ① 二重になっている所 (最優先)

### Web で効いている物 (本番 or 開発版)
| ファイル:行 | 部 | 何が二重か | エンジンの正 | 重さ |
|---|---|---|---|---|
| src/views/simulator/StageTargetSummary.vue:72-74 | シミュ (開発版) | 段の重みを自前で足して当たりの割合を出す。**下限 (CURRENCY_FLOOR・floorKeepIndex)・系統の塞ぎ (familyBlocked) を見ない** ので、エンジンと違う数字になり得る | pool.ts `modTierWeight` / stage-core `candidates` | 高 (数字がずれる) |
| src/services/simulator/keep-compare.ts (全体) ・sim-greater.ts・self-craft-dist.ts・src/views/simulator/use-sim-calc.ts:17-111 | シミュ (開発版) ③ | 重みはエンジン (modTierWeight) を使うが、**カレンシーの効果を式で自前に持つ**: 「増強 1 回で付く確率」「消去 2 回」「フラクチャーは 3 つに 1 つ (× 3)」「両側が空の時に候補の側に付く割合」。打つ処理 (applyCurrency) を回さない (self-craft-dist.ts:9「エンジンは回さない」) | spec/parts.ts の add・remove・fracture と spec/odds.ts `addOddsBySpec` | 高 (カレンシーの決まりが変わると直し漏れる) |
| src/services/simulator/recipe-sim.ts:93-110 | シミュ (開発版) | 打つのは applyCurrency (エンジン) だが、強さ (普通・上級・完全) を選ぶため重みの割合を自前で計算 (modTierWeight + CURRENCY_FLOOR を自分で組む) | spec/odds.ts (1 手の確率) | 中 |
| src/services/simulator/recipe-pattern-run.ts:205 | シミュ (開発版) | `m.family === …` を直に比べて「同じ系統」を判定 (決まり 3 違反) | mods/mod-rules.ts `familyBlocked`・`occupiedKeysOf` | 中 |
| src/views/tutorial/VideoTiers.vue:45-61 | チュートリアル (開発版) | modListFor の行から段の割合を自前で計算 (アイテムレベルだけ、下限なし)・`r.family === m` で探す | modListFor に割合 (share) を持たせる | 低 (説明の絵、白に普通のオーブなら同じ) |
| src/state/emulator/craft-stage-help-mods.ts:35・76、craft-stage-help.ts:208・216 | エミュ (本番) | ヘルプの文で `family` を直に比べる (EssenceAbyss など) | mod-rules | 低 (エンジン部の中、ヘルプの文だけ) |

### エンジンの中で 2 本ある物 (同じ部の中、見張りあり)
| ファイル | 何が二重か | 今の守り |
|---|---|---|
| craft-stage/stage-core.ts:370-386 `candidates` と vendor/poe2htc/engine/pool.ts:17 `modTierWeight` | 段の下限・アイテムレベルで重みを足す同じ式を 2 か所に書いている | 無し (式が短いので今は同じ)。candidates が modTierWeight を呼ぶ形に寄せると 1 本 |
| held-odds.ts の冒涜の確率 (vendor/engine/probability.ts `desecrationOfferProbability`) と、打つ処理 (apply-desecrate・spec/parts の addUnrevealed) | 確率の式と打つ処理が別の実装 | tests/held-odds-parity.test.ts (打った結果と突き合わせ) |

### main に無い書きかけ (解析君、今 auto-order-math のセッションが作業中)
| ファイル | 何が二重か |
|---|---|
| src/services/simulator/auto/auto-actions.ts (未 commit、282 行) | **高貴・カオス・消去・完璧なエッセンス・骨・発現・光のお告げ・左右のお告げの効果を、DP の手として自前で書く** (頭のコメントに近似: 外れの系統は置き場を減らさない・発現の 3 つは戻しあり・骨は空きのある側だけ)。重みは working tree の auto-model.ts がエンジンの `candidates` から取る (ここは良い)。HEAD の auto-model.ts はまだ仮 (ok: false を返すだけ) |

### アプリだけの物 (Web から使われていない、当分触らない)
| ファイル | 何が二重か | 使う所 |
|---|---|---|
| src/services/simulator/htc/step-odds.ts:106・155、sim-route-helpers.ts:45・119・129・292・307 | 段の重み・触媒の倍率・下限・系統を自前で組み、手ごとの確率を自分で計算 (カレンシーの効果を丸ごと 2 本目として持つ) | src/views/htc-craft/ (アプリの旧計算機) と tests/htc-*.test.ts・scripts/_htc-bridge-entry.ts だけ |
| src/services/simulator/htc/tree-decide.ts:82-115・self-fracture.ts | フラクチャーの 1/3・1/4、冒涜の当て馬などを定数で持つ | アプリ (useHtcCraft・useTreeSearch) だけ |
| vendor/poe2htc/optimizer/ (markovActions 985 行・markovFromItem 1578 行ほか) | HTC の元の作者のカレンシーの効果のモデル (マルコフ) | Web は型 (TierTarget・Prices) と `essenceLevelOf` だけ読む。打つ処理はアプリだけ |
→ 置き場が simulator/htc/ なのでシミュ部の持ち物に見えるが、Web のシミュは使っていない (使うのは tree-buy.ts の検索だけ)。**「アプリ専用・凍結」と地図に書き、Web から import させない** のが案。

### 二重が無かった物 (確かめた方法つき)
- **MOD の置き場・重み・段のデータを自前の表で持つ所: 無し**。item-classes.json・stat-scale.json・mod-stats.json・base_items.json・stage-bases.json・removed-bases.json を services/mods・htc・items・craft-stage の外から読む所を grep → 0 件。
- **チュートリアルの仕組み (services/tutorial/) に自前の計算: 無し**。打つのは applyCurrency・revealOffers・quiz-recipe (import の一覧で確認)。`modId:`・`values:` の手書きも 0 件 (grep)。0.78〜1.22・1/3 は説明の文の中だけ (topic-courses*.ts)。
- **品質・触媒の倍率の式**: 品質は stage-props.ts:87・147 と htc/quality.ts:145、触媒は catalysing-multiplier.ts の 1 か所 (Web の外では step-odds・sim-route-helpers = アプリだけ)。聖別の倍率は apply-vaal.ts と画面の帯 StageSanctifyBar.vue (帯は 0.78・1.22 を文と選択肢に持つ、計算は apply-vaal)。
- **確率の表 held-odds・aim-odds・route-race・chaos-spam・route-runes**: 全部 applyCurrency (打つ処理) を回すか spec/odds を使う (import の一覧で確認)。
- 確かめた方法: grep `modTierWeight|tierWeight\(|\.weight\b|weightOf|sumW` / `\.family\s*===` / `0\.78|1\.22|1 ?/ ?[2346]` / `quality ... [*/+]` を src の Web の部 (views/craft-stage・simulator・tutorial、services/simulator・tutorial、state/*) で、+ 各ファイルの import の一覧。grep は名前・形の違う自前の計算 (例: 別名の変数で重みを足す) を取りこぼし得る。

---

## ② エンジンの入口 (エンジン部が外に出す物)

### 持ち物 (エンジン部 = エンジンの核に集める物)
| 物 | 今の置き場 | 判定 |
|---|---|---|
| カレンシー・お告げの効果 | craft-stage/spec/・apply-*.ts・omens.ts・essence-parts.ts、htc/omens.ts | エンジン (今もエンジン部) |
| アイテムの形・打つ処理の土台 | craft-stage/types.ts・run-plan.ts・contract.ts・stage-core.ts・stage-props.ts | **エンジンへ統合** (今は dev/README.md で「境目 = 開発部」。中身はエンジンの事実なので持ち主をエンジン部に) |
| MOD の置き場・重み・段・文 | vendor/poe2htc/engine、htc/patch・bridge*・weight-overrides・poe2db-*・mod-stats.json・mod-text・rune-weights・essence-key*、mods/ 全部、craft-stage/mod-list.ts | エンジン (今もエンジン部) |
| 部位の種別・ベースの一覧 | mods/item-classes.ts (+ .json)、items/base-catalog.ts・removed-bases・tradeable-bases、craft-stage/stage-bases・stage-uniques | エンジン (今もエンジン部) |
| stat の単位 | mods/stat-scale.ts (+ .json) | エンジン (今もエンジン部) |
| 品質・触媒・聖別の計算式 | htc/quality.ts・catalysing*.ts、stage-props.ts、apply-vaal.ts | エンジン (今もエンジン部) |
| ルーン・ソケット | craft-stage/stage-runes.ts、htc/sockets.ts・rune-split.ts、vendor/engine/runes.ts | エンジン (今もエンジン部) |
| 確率の表 | craft-stage/held-odds.ts・aim-odds.ts・spec/odds.ts | エンジン (今もエンジン部) |
| スパムシミュレーターの計算 | craft-stage/route-race.ts・chaos-spam.ts・route-runes.ts | エンジン部の画面の機能 (エンジンの外、入口を使う側)。持ち主は同じエンジン部なので線だけ |
| 乱数 | htc/rng.ts `mulberry32` | **エンジンへ** (どの部も同じ乱数を使う決まり) |
| 防御・DPS の計算 (チュートリアルの絵が使う) | craft-stage/defence.ts・stage-pob.ts・skill-quality.ts | エンジン (エンジン部のまま) |
| 値段の表 | htc/prices.ts・price-keys.json、money.ts | **今の持ち主のまま (開発部の境目)**。クラフトの決まりではない。ただし htc/labels.ts が値段とお告げの名前を 1 枚に混ぜているので、名前の分をエンジン側へ分ける |
| 表示・英語 | i18n/ (lang.ts・*-client.json・mod-text-ja*.json)、display-currency.ts | **今のまま (開発部)**。エンジンが読んでよい側 |
| 取引所の検索・貼り付け | htc/buy-or-craft.ts・paste*.ts、craft-stage/trade-search.ts | **今のまま (開発部)**。クラフトの決まりではない |
| アプリの旧計算機の木 | simulator/htc/ (step-odds・sim-route*・tree-*)・vendor/poe2htc/optimizer | **凍結 (アプリ専用)**。Web から import しない |

エンジン → 外の寄りかかりで切る物: mods/dictionaries・engine-mods・tiers → `services/craft-v2/types.ts` (アプリの型)、apply-currency・run-plan・items/base-catalog → `services/trade2/localize.ts`、apply-extra・stage-runes・htc/sockets → `services/augment-rules.ts`、skill-quality → `services/gem-hover.ts`。状態 (src/state) への import は 0 (良い所)。

### 入口の一覧の案 (`src/services/craft-stage/engine.ts` 1 枚。外はここだけを読む)
- **形 (型)**: StageItem・StageMod・StageSide・PlayedStep・CraftStagePlan・PatchData・ItemBase・Mod・Force・PobBlock・Candidate
- **アイテムを作る・打つ**: freshItem・startFrom・applyCurrency・kindOf・omensFor・revealOffers・unrevealedOf・run-plan の打つ関数
- **アイテムの今を読む**: allMods・listOf・room・limitOf・effectiveCls・maxQualityOf・socketCapOf・catalystOf・SIDES・dpsText・DEF
- **置き場・重み・段**: loadHtcPatch・htcBaseInfo・htcBaseLimits・classOfBase・candidates・modTierWeight・CURRENCY_FLOOR・floorKeepIndex・CRAFTED_SOURCES・familiesOf・familyBlocked・occupiedKeysOf・modListFor・tierDisplayRanges・inGroup・isRemovedBase
- **1 手の確率 (新しく外に出す)**: addOddsBySpec / addCands (spec/odds)、フラクチャーの当たり (spec/parts の fracture から)、held-odds・aim-odds の公開関数、DESECRATION_EXCLUSIVE_COUNT・bossOmenAllowed・desecrationOmenForMod
- **名簿**: OMEN_FOR・RUNES・runeOf・isRune・runeEffectFor・withRunes・runeIdByName・ESSENCE_KEYS・essenceLevelOf・CATALYSTS・isEmotion・isShard・isGem
- **文**: fillModText・jaUniqueText・tagLabel・classLabel
- **乱数**: mulberry32
- 合わせて 70 名ほど。今 Web の各部が使う名前は 231 種 (names.txt)。残りは画面の飾り (TAG_STYLE・aimLabel など、エンジン部の画面の物) か、vendor の中を直に読んでいる物 (シミュの 19 ファイルが poe2htc/engine/types・pool・probability を直に読む)。手 2 で入口に足すか、エンジン部の画面の物として外すかを決める。
- 置き場は新しいフォルダーを作らず craft-stage/engine.ts に (エンジン部の持ち場のまま、移動の手間 0)。入口は型を `export type` で、関数は名前を並べるだけ (ワーカーが重くならないよう、束ねの連鎖を作らない)。

---

## ③ 二重の所を入口に付け替える手順 (1 手 = 1 commit、各手で vue-tsc・`pnpm build:web`・相対 import の解決の台本)

| 手 | やる事 | 触るファイル | どの部の仕事 |
|---|---|---|---|
| 0 | 地図と決まり: docs/org の決まりの 1 行 (⑤)、dev/README.md の「境目」から types・run-plan・contract を外してエンジン部の地図へ、simulator/README.md に「htc/ はアプリ専用・凍結」、ARCHITECTURE.md | docs/ だけ | 開発部長 |
| 1 | 入口 craft-stage/engine.ts を作る (並べるだけ) + 1 手の確率 (addOddsBySpec・フラクチャーの当たり) を外に出す | craft-stage/engine.ts (新)・spec/odds.ts | ジン部長 |
| 2 | エンジンの中の二重を 1 本に: candidates が modTierWeight を呼ぶ形に。エンジン → アプリの寄りかかり (craft-v2/types・trade2/localize・augment-rules・gem-hover) を切る。htc/labels を名前と値段に分ける | stage-core.ts・mods/dictionaries・engine-mods・tiers・apply-currency・run-plan・items/base-catalog・apply-extra・stage-runes・htc/sockets・skill-quality・htc/labels | ジン部長 (labels の値段の分は開発部長と) |
| 3 | シミュの二重を付け替え (重い順): StageTargetSummary.vue の自前の重み → 入口の確率。recipe-pattern-run:205 の family → familyBlocked。recipe-sim の強さ選び → 入口の確率 | views/simulator/StageTargetSummary.vue・services/simulator/recipe-pattern-run.ts・recipe-sim.ts | シミュ部長 |
| 4 | ③ の式 (決めてもらう事 1): keep-compare・sim-greater・self-craft-dist・use-sim-calc の「1 手の確率・フラクチャー 1/3」を入口から取る。式の組み方は残す。数字が変わったら解析君がエンジンと並べる | 上の 4 ファイル | シミュ部長 + 解析君 (数字) |
| 5 | 解析君の auto (決めてもらう事 2): auto-actions の手の効果を入口の候補・1 手の確率から組む。**④ の solveOrder が入ってから** | services/simulator/auto/auto-actions.ts・auto-model.ts | 解析君 |
| 6 | チュートリアル・エミュのヘルプの小さい二重: VideoTiers の割合 → modListFor に share を持たせる、ヘルプの family 比べ → mod-rules | views/tutorial/VideoTiers.vue、state/emulator/craft-stage-help*.ts、craft-stage/mod-list.ts | ジン部長 (mod-list・ヘルプ)・シミュ部長 (VideoTiers) |
| 7 | 付け替え (import の書き換えだけ): シミュ・チュートリアルの残りの直の import を入口へ。シミュ 31 ファイル 113 行、チュートリアル 27 ファイル 62 行 (engine-imports.mjs) | views・services・state の simulator/・tutorial/ | 各部長 (auto/ は解析君) |
| 8 | 見張り: 「入口の外から craft-stage/ のエンジンの中・vendor/poe2htc を読んでいないか」「Web から simulator/htc/ を読んでいないか」の台本 scripts/check-engine-entry.mjs を CI に | scripts/・.github/workflows/tests.yml | 開発部長 |

### 今の仕事との順番
- **ジン部長の聖別の帯**: e61bb9ab で commit 済み、sanctify-edit のセッションは今 idle。手 1・2 は聖別の仕事が閉じてから (apply-vaal・types を同時に触らない)。
- **解析君の auto/ (auto-model・auto-solve・auto-actions が書きかけ)**: 手 5 と auto/ の手 7 は、④ の solveOrder が入って OK が出てから。手 1 の入口は先に作っておけるので、解析君には「新しく書く所は入口の名前で読む」とだけ先に伝える。
- **シミュ部長の ④ (ワーカー 800KB の直し)**: 入口は並べるだけで再輸出の連鎖を作らない。手 3・4 は ④ と別のファイルなので並べてよい (StageTargetSummary・keep-compare 系は auto/ と重ならない)。
- 順番の案: 手 0 (今すぐ) → 1 → 3 (一番ずれの出る StageTargetSummary を先に) → 2 → 4 → 6 → ④ の後に 5 → 7 → 8。

---

## ④ チュートリアル部の独り立ち (オーナーにまだ聞いていない)

今の寄りかかり (rev.mjs): チュートリアル → state/craft-stage.ts 13 か所 (craftStage・iconOf・nameOf)・simulator/quiz-recipe.ts 6 (applyQuizAction・buyStart・routeOf・型)・state/emulator/craft-stage-shelf 4・views/craft-stage/StageItemCard.vue 2・use-stage-fx 1。逆向きは CraftStage.vue 7 (コースの画面を中に置く)・use-stage-base 2・web/page.ts 5・WebApp.vue 1。

する得
- シミュ部長の荷が軽くなる (今は ①〜⑥・自動・チュートリアルの 3 つ)。コースの文の直し・OK 待ちが別の列で回る。
- チュートリアルが quiz-recipe (シミュの打ち方) に頼っている線が見えるようになり、シミュの変更でコースが壊れる事故を「貸す口」1 枚で止められる。

する損
- 寄りかかりが濃い: 自分の物でない所に 27 か所以上 (状態・シミュ・エミュの画面)。独り立ちしても、ほぼ全部の直しがエンジン部かシミュ部との受け渡しになる。
- CraftStage.vue の中にコースの画面が 7 か所入っていて、分けるにはエンジン部の画面に差し込み口を作る直しが要る (UI の変更 = オーナーの OK 待ち)。
- 今はコースの数が落ち着いていて (入門〜上級 11 本、本番)、別の部長を常に立てるほどの仕事量が無い。

→ おすすめは「今はしない。quiz-recipe の貸す口 (simulator/for-tutorial.ts) と、二重の所の付け替え (手 6・7) だけ先にやり、コースが増える時 (クラフトチャレンジを始める時) にもう一度決める」。

---

## ⑤ docs/org の md に入れる決まりの 1 行の案
- dev/README.md の決まり (全部の部) に 1 行:
  **「MOD の置き場・重み・段・文、カレンシーとお告げの効果、確率、品質・聖別の式はエンジン部のエンジンの入口 (services/craft-stage/engine.ts) から取る。自前の表・式・重みの足し算を作らない。足りない物はジン部長に入口へ足してもらう。」**
- simulator/README.md の地図に: 「services/simulator/htc/ はアプリの旧計算機専用 (凍結)。Web から import しない。」
- math/README.md の決まりに: 「DP・式の近似で使う 1 手の確率・候補はエンジンの入口から組む (手の効果を自分で書かない)。近似した所はコメントに書く (今の決まり 2 のまま)。」
- emulator/README.md の頭: 「エンジン部 = エンジンの核。入口 craft-stage/engine.ts の形を変える時は使っている部 (シミュ・チュートリアル・解析君) に知らせる (開発部の決まり 7)。」

---

## 付録: 外 → エンジンの import の数 (engine-imports.mjs、HEAD 42c8a9eb)
| 使う側 | import の行 | ファイル |
|---|---|---|
| tests/ | 379 | 69 |
| アプリの画面 (views/ の他) | 109 | 25 |
| シミュ services/simulator/ | 81 | 19 |
| エミュ views/craft-stage/ | 74 | 20 |
| scripts/ | 54 | 6 |
| エミュ state/emulator/ | 46 | 8 |
| src のその他 | 37 | 15 |
| チュートリアル views/tutorial/ | 37 | 18 |
| シミュ views/simulator/ | 30 | 10 |
| htc/ に残る物 | 20 | 5 |
| チュートリアル services/tutorial/ | 15 | 6 |
| components/ | 13 | 7 |
| state/craft-stage.ts | 11 | 1 |
| チュートリアル state/tutorial/ | 10 | 3 |
| エミュ craft-stage/ の残り | 6 | 2 |
| web/ | 4 | 2 |
| シミュ state/simulator/ | 2 | 2 |
Web の各部が使う名前 231 種 (エミュ 141・シミュ 77・チュートリアル 46・state/craft-stage 21・components 19・web 5、重なりあり)。よく使われる物: run-plan 81 行・craft-stage/types 66・poe2htc/engine/types 60・apply-currency 56・stage-core 54・htc/rng 54・htc/patch 30。

## 得と損 (入口と付け替え全体)
得
- MOD・カレンシーの決まりを変えた時に直す所がエンジン 1 か所 + 入口になり、シミュの式・解析君の DP がずれたまま残る事故 (StageTargetSummary のような物) が無くなる。
- 見張りの台本 (手 8) で、新しく自前の計算を書いたらすぐ分かる。
- 新しい部を作らないので、移動・フォルダー替えの手間が 0。
損
- ③ の式・auto の DP を入口に寄せると、数字が少し変わる (今の近似とエンジンの差、メモ optimal-craft-dp で 1 割以内)。変わるたびに解析君の突き合わせが要る。
- 入口に名前を並べる 1 枚が、ワーカー (auto-order.worker) のバンドルを重くしやすい (型は export type、関数は個別に)。
- ジン部長の荷が重くなる (エンジン + 画面 + 入口の管理 + 他の部からの「入口に足して」の依頼)。
