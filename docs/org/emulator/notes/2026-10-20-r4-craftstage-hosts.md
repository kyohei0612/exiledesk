# R4 案: CraftStage.vue に部ごとの差し込み口 (SimHost・CourseHost) を作る (ジン部長 2026-10-20、案だけ・直さない)

元: docs/org/dev/notes/2026-10-20-agent-friendly.md の 2。実際に割るのはシミュ部長の自動 / 手動が開発版に出た後 (S4 の後)。
今の CraftStage.vue は 495 行。行番号は 2026-10-20 夜の HEAD の物 (割る前に引き直す)。

## 1. 今どこに部の物があるか
### シミュ (→ SimHost、置き場 views/simulator/SimHost.vue)
| 行 | 中身 | 口のどこ |
|---|---|---|
| 45 | `StageSimPanel` の後から読み (defineAsyncComponent) | main |
| 74-78 | `#recipe=` の URL からレシピで始める (openRecipeUrl、hashchange) | main の onMounted へ |
| 105 | Tab で MOD 一覧: `s.mode === 'sim' && !simNoBase` | CraftStage に残す (条件は `simNoBase` を use-stage-base から読むまま) |
| 244 | `useStageBase()` の simNoBase・preRecipeOpen・startFromRecipe | preRecipeOpen・startFromRecipe は tools へ。simNoBase は CraftStage にも残す (ページの移り・Tab) |
| 282-287 | 題の下の説明「ベースと狙う MOD を決めて…」+ HelpTip | header |
| 315-326 | ベースを選ぶ前の帯 (表示通貨・レシピ・リセット・1 つ戻す の灰色) | tools (`#sim-tools` の中) |
| 364 | `<StageSimPanel v-if="simPicked" v-show="mode==='sim'">` | main (v-if + v-show の残し方をそのまま) |
| 463 | MOD 一覧の窓の条件 `(mode==='sim' && !simNoBase)` | CraftStage に残す |

### チュートリアル (→ CourseHost、置き場 views/tutorial/CourseHost.vue)
| 行 | 中身 | 口のどこ |
|---|---|---|
| 40 | `endLesson`・`inLesson`・`inTopic` | 状態は state/tutorial のまま。CraftStage は「隠す」の判定だけ読む (下の 3) |
| 43・482 | `VideoStage` (動画モード) | overlay |
| 46・366 | `StageCourses` (コース一覧) | main |
| 47・365 | `GuideVideoCard` (使い方の動画) | main |
| 48・402 | `StageCourseGuide` (コースの案内、アイテムの下) | under-item |
| 49・402・426 | `StageTopicGuide` (今の手、スマホはアイテムの下・PC は棚の上) | under-item / above-shelf |
| 50・484 | `VideoExtra` (動画用の別の画面) | overlay |
| 242 | guidePage (Web の使い方・コツのページ) | header (題の文の切り替え) |
| 288 | 題の下の説明 (コース) | header |
| 304 | 「← クラフトへ戻る」 | back |
| 310 | チュートリアルのタブ (アプリだけ) | tabs |
※ 依頼の「7 か所」= 365・366・402 (2 つ)・426・482・484。

## 2. 口の形
- `<SimHost part="header|tools|main" :phone="phone" />`、`<CourseHost part="header|back|tabs|main|under-item|above-shelf|overlay" :phone="phone" :guide-page="guidePage" />`。
- 部品 1 つで part ごとに中身を出し分ける (CraftStage の並び = 置き場所は CraftStage が持つ。中身は各部)。
- 状態の渡し方: props は `phone` と CraftStage だけが知る物 (`guidePage`) だけ。craftStage (`s`)・inLesson・simPicked などのモジュールの状態は、口の中で各部が自分で読む (今も module の ref なので渡さなくてよい)。
- 口から CraftStage へ返す物は emit にしない (モードの切り替えは `s.mode` を書くだけ、今の作りのまま)。
- 後から読み (defineAsyncComponent) は口の中に移す (最初に読む JS を増やさない。口そのものは同期で読み、中身を非同期に)。

## 3. CraftStage に残す物 (動かすと壊れやすい所)
- **広告の数え方・ページの移り**: 246-247 (`baseUnpicked`・`subPage`) と 264-267 (`pickMode` の openBasePage) は web/page.ts の pageTick とつながる。CraftStage に残す。シミュの「ベース未選択」も同じ watch を通る (シミュも広告を出す想定、10-18)。
- **Ctrl+Z / R・Tab**: 94-109 の onKey は全部の部をまたぐ (コースの間は戻さない・シミュは StageSimPanel が自分の 1 つ戻すを持つ・MOD 一覧の Tab)。CraftStage に残し、部の判定は `inLesson`・`simNoBase` を読むだけ。
- **Teleport の置き場**: `#sim-tools` (313) と StageSettings の `#sim-auto-slot` は、シミュの中身が Teleport で置く先。口に入れても `v-show` で残す (v-if にすると Teleport 先が消えて警告・消失)。
- **隠す判定**: 373・378・388・403・427・429・458 の `!inLesson`・`!inTopic` はエミュの部品を隠す物。CraftStage に残す (CourseHost から「今はコース中」を出す関数 `courseHidesEmulator()` を state/tutorial に 1 つ作って読む形にすると、条件が散らない)。
- **録画の目印**: `data-rec-part`・`data-rec` は POE2Tube の撮影が見る (メモ poe2tube-handoff)。動かす物は同じ属性のまま。
- **StageSimPanel の残し方**: `v-if="simPicked"` + `v-show="mode==='sim'"` で、手打ちと行き来しても中身が残る (10-05 オーナー)。口に入れても同じ形。

## 4. 手 (1 手 = 1 commit、移動と中身の直しは分ける)
1. (ジン部長) 空の口を作る: SimHost.vue・CourseHost.vue (part ごとに今の中身をそのまま写す) と CraftStage の差し替え。見た目を変えない。型チェック・`pnpm build:web`・開発版の画面のスナップ (エミュ・シミュ・使い方・コース 1 つ、PC 1660×860 とスマホ 375)。
2. (ジン部長) `courseHidesEmulator()` を state/tutorial に作り、CraftStage の `!inLesson`・`!inTopic` をそれに。
3. (シミュ部長) SimHost の中身を自分の部の物として整理 (openRecipeUrl・preRecipeOpen を口の中へ)。CraftStage は触らない。
4. (シミュ部長 = チュートリアル) CourseHost の中身を同じく。
- 何手か: 4 手 (エンジン部 2・シミュ部 2)。CraftStage は 495 → 約 400 行の見込み。

## 5. シミュ部長が中身を移す時の順番
1. S4 (自動 / 手動) が開発版に出た後に、ジン部長の手 1・2 を待つ (口ができるまで CraftStage を触らない)。
2. SimHost の main → tools → header の順 (main が一番大きく、Teleport の置き場を使うのは tools)。
3. CourseHost は main・overlay (動画) を先に、header・back・tabs を最後 (Web とアプリで出し分けがあるので画面で確かめる)。
4. どの手も、開発版のスナップで「見た目が変わらない」を確かめてから次へ。
