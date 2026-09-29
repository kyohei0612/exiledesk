# ADR-001: クラフトステージ (craft-stage) — ゲームと同じ挙動で 1 手ずつ見せる実演シミュレーター

- 日付: 2026-09-27
- 状態: 承認 (実装前)
- オーナー指示: 「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」
  「クラフトステージでいこう」
- 関連: POE2Tube 側 `docs/decisions/001-poe2tube-architecture.md` (動画パイプライン全体)
- 注: ExileDesk 初の ADR。これまで設計はファイル先頭コメントと memory に置いてきたが、
  他リポジトリ (POE2Tube) から参照される機能なので文書として独立させる。

## 背景

- ExileDesk のクラフト計算機 (`HtcCraftLab`) は「確率と期待費用を計算する研究室」で、
  画面に出るのは○×ツリーと数字。**実際にカレンシーを 1 個使ってアイテムがどう変わるか** を見せる画面は無い。
- YouTube (POE2Tube) の初心者向けクラフト解説で「実際に作ってみた」パートを、
  実ゲーム画面を録画せずに **ExileDesk の画面で** 見せたい。配信 (OBS) でも同じ画面で手動実演したい。
- 調査結果 (2026-09-27): 既存エンジンに「本物のアイテム状態 + カレンシー 1 個 → 新しい状態」を返す API は **無い**。
  - `sim-route-helpers.ts` の `apply()` は乱数で抽選するが、状態が「狙い MOD か外れ (null)」に畳まれ、
    外れた時にどの MOD が付いたか分からない。rarity / ベース名 / 数値も持たない。
  - vendor `plan.ts` の `applyStep` は完全な `ItemState` を扱うが抽選せず、狙い通り付いた前提で進む (非 export)。
  - Transmute / Augment / Regal / Alchemy / 普通のエッセンス は確率計算のみで抽選が無い。**Vaal は未実装**。
  - 乱数は `rng.ts` の `mulberry32(seed)` で決定論的。`Math.random` は不使用。

## 決定

### 1. 名前と置き場

| 項目 | 値 |
|---|---|
| 表示名 (左メニュー) | **クラフトステージ** |
| コード ID | `craft-stage` |
| サービス | `src/services/craft-stage/` (新設、engine とは分離) |
| 画面 | `src/views/craft-stage/CraftStage.vue` + パネル分割 |
| CLI (動画用) | `scripts/craft-stage-run.mjs` (`_htc-bridge-entry.ts` に export を足す) |
| コミット scope | `feat(craft-stage): ...` |
| 位置づけ | `HtcCraftLab` = 研究室 (計算)、クラフトステージ = 舞台 (実演)。エンジンのデータは共有 |

### 2. 「本物の状態」を持つ型を新設する

vendor の `ItemState { base, level, rarity, prefixes, suffixes }` を拡張し、**表示に必要な全部** を持つ:

```ts
StageItem {
  base: ItemBase; name: string; ilvl: number; rarity: Rarity;
  prefixes: StageMod[]; suffixes: StageMod[];   // 各 { modId, tierName, values: number[], fractured?, desecrated? }
  quality?: number; corrupted?: boolean;
}
StageStep { currency: StageCurrency; omen?: string; seed: number;
            before: StageItem; after: StageItem; changed: { added?: StageMod; removed?: StageMod }; cost: number }
```

- 数値は `Tier.ranges` から抽選して埋める (`fillHashes` で日本語 1 行に)。
- 既存の `SimState` / `Slot` (抽象状態) は触らない。**`sim-route-helpers.ts` (391 行) には足さない**。

### 3. 1 手抽選 `applyCurrency(data, item, currency, rng): StageStep`

- 重みは既存の `modTierWeight` / `poolTotalWeight` / `familiesOf` を使い、
  規則 (側・枠・クラフト MOD 1 つ・冒涜 1 つ・お告げ) は `sim-route-helpers.ts` の `usable` / `apply` の分岐を移植。
- 実装するカレンシー (段階):
  - **Phase 1 (1 分テスト用)**: Transmute / Augment / Regal / Exalt / Chaos / Annul / Alchemy (強さ 3 種は Exalt / Chaos / Regal に)
  - **Phase 2**: Essence (普通 / パーフェクト) / Desecrate / お告げ各種 / 触媒 (品質)
  - **Phase 3**: Vaal (結果表を poe2db から確認してから。現状 "corruption is not modelled")
    - 2026-09-27 実装: poe2db は付加 MOD の一覧だけなので、分岐は PoE2 Wiki の Corrupted「Corruption outcomes / Non-unique equipment」(変化なし / 最大 3 つ振り直し / エンチャント / 武器・防具はソケット +1、等分と仮定)。腐食・聖別・コラプトのお告げも同時に (`src/services/craft-stage/apply-vaal.ts`)
- 乱数は `mulberry32(seed)` を **1 手ごとに seed を持つ** (StageStep.seed)。同じ seed 列なら何度でも同じ結果 = 動画の再撮り・検算が可能。

### 4. 2 つの入力、1 つのエンジン

| モード | 入力 | 用途 |
|---|---|---|
| 手動 | 画面のカレンシー棚をクリック | 配信 / 自分の練習 |
| 再生 | 手順 JSON (`{ base, ilvl, steps:[{currency, omen?}], seed }`) | 動画 (POE2Tube が渡す) |

- **操作は Craft of Exile 仕様** (2026-09-27 オーナー指示): カレンシー棚のアイコンをクリック → カーソルにアイコンが付いて持った状態になる →
  アイテム枠をクリックで適用 (例: 冒涜の骨アイコンを持ってアイテムをクリック = 冒涜)。右クリック / Esc で手放す。
  持ったまま連続でクリックすれば連打 (Chaos スパム) になる。
- **カレンシーは計算機 (HtcCraftLab) の物をそのまま使う**: 棚に並ぶ種類・アイコン・日本語名・値段は `price-keys.json` / `labels.ts` /
  `market-store` にリンクし、クラフトステージ側で独自の一覧を持たない。「その状態で使えない物」は計算機と同じ `usable` 判定で灰色にする。
- **クラフトの規則も計算機と同一**: 側・枠・クラフト MOD 上限・冒涜 1 つ・お告げの効き方は HTC の規則を移植し、計算機の確率と実演の抽選が食い違わないこと
  (検算: 同じ状態・同じカレンシーで `stepProbability` の分布と `applyCurrency` を多数回引いた頻度が一致する)。
- 再生モードは 1 手ごとに `StageStep` を配列に積み、**結果 JSON を書き出す** (POE2Tube の台本生成の入力)。
- **JSON の形は POE2Tube が正** (2026-09-27 取り決め、POE2Tube ADR-002):
  `C:\Users\kyohei\POE2Tube\contracts\craft-stage-plan.schema.json` (手順、入力) と
  `craft-stage-result.schema.json` (結果、出力)。見本は `contracts/examples/`、決まりは `contracts/README.md`。
  TS 型は schema から `json-schema-to-typescript` で `src/services/craft-stage/contract.ts` に生成し、手書きしない。
  キーは snake_case、カレンシーは `price-keys.json` のキー、冒涜は `desecrate` / `desecrate_ancient` / `desecrate_altered`、
  使えない手は `applied:false` + `reason` で `before == after`、seed は `plan.seed` から 1 手ごとに派生。
- 画面は「アイテム枠 / カレンシー棚 / 変化ハイライト / 工程履歴 (下に積み上がる)」の 4 パネル。
  積み上がる履歴が POE2Tube の「積み上げ図解」と同じ見え方になるようにする。
- 撮影は POE2Tube 側の責務 (ヘッドレスブラウザで再生モードのページを開き、1 手ごとに PNG)。
  そのため再生モードは **URL / IPC で手順 JSON を受け取り、`?step=N` で任意の手まで進めた静止状態** を出せること。

### 5. 表示は公式日本語のみ

- MOD は `jaOfMod` / `fillHashes`、カレンシー・お告げは `jaOfPriceKey` / `jaOfOmen`。自前で訳さない (labels.ts の決まり)。
- 相場は `market-store` の値を使い、外部 API は叩かない (api-probing-policy)。

### 6. 守る決まり

- 1 ファイル 500 行まで (目標 300)。Vue は `views/craft-stage/` にパネルを切り出し、composable は親で 1 回だけ呼ぶ。
- Pinia 不要、`src/state/` に `reactive` シングルトン。scoped style 禁止、`src/style.css` の `@layer components`。
- 検算は `scripts/check-craft-stage.mjs` (`bundleEntry` → `loadPatchSync` → seed 固定で 1 手ずつ → 期待の rarity / 枠数 / 段の下限を `NG:` で数える)。
- 実装後は `pnpm dev` + アプリ本体で一度動かしてからリリース。

## 影響

- HTC (AGPL-3.0) のデータ・重み計算を使うので、クラフトステージも AGPL の範囲内 (ExileDesk 全体が既に AGPL)。
- `_htc-bridge-entry.ts` の export が増える。`extra-bases.json` / `weight-overrides.ts` の仮重み (冒涜 2500 等) は
  実演結果にもそのまま反映されるため、動画では「重みは poe2db 由来の推定」と一言添える。
- 既存の `HtcCraftLab` / `sim-route*` / vendor には手を入れない (回帰リスクゼロ)。

## 却下した案

- `sim-route-helpers.ts` の `apply()` を拡張して本物の MOD を返す: 抽象状態が前提の 391 行を壊す。別ファイルが安全。
- vendor の `applyStep` を export して使う: 抽選しないので「実際に使ったらどうなるか」にならない。
- 画面録画 (実ゲーム): POE2Tube ADR-001 で却下済み (尺が声と合わない、自動化できない)。

## 次の一手

1. `src/services/craft-stage/types.ts` + `apply-currency.ts` (Phase 1 の 7 種) + `check-craft-stage.mjs`
2. `views/craft-stage/` の 4 パネルと左メニュー登録、再生モード (`?step=N`)
3. POE2Tube から `scripts/craft-stage-run.mjs` を叩いて結果 JSON を受け取る疎通

## 追記 2026-09-28: アクト中に落ちるカレンシー (POE2Tube 要望 ⑧)

実装: `src/services/craft-stage/apply-act.ts` (+ `stage-bases.ts` / `stage-bases.json`)。数値の出典:

| 物 | 決まり | 出典 |
|---|---|---|
| 鑑定の巻物 | 未鑑定を鑑定 | クライアント「Identifies an item」 |
| シャード 4 種 | **10 個**で 1 個のオーブ (アイテムには使えない) | クライアント「A stack of 10 shards becomes …」(stack_size 10) |
| 宝飾職人 (見習い / 上級) | スキルジェムのサポート枠を 3 / 4 に (未満の時だけ) | クライアント「Sets a Skill Gem to have 3 / 4 Support Gem Sockets」 |
| 可能性のオーブ | ノーマル → ユニークか破壊 | クライアント「Unpredictably either upgrades a Normal item to Unique rarity or destroys it」 |
| 砥石 / 端材 / 飾り玉 / プリズム | 物理武器 / 防具 / フラスコ / スキルジェムの品質。上限 20% | クライアントの説明文、poe2db の Quality |
| 品質の効果 | 武器は物理 1% more / 防具は防御 1% more / フラスコは回復量 1% more (品質 1% ごと) | poe2db の Quality |
| ベースの数値 | 防御力・物理ダメージ・速度・クリティカル・フラスコの回復量 | クライアント (data-cache/base_items.json) |

**未確定 (一次ソースなし。確かめたら apply-act.ts の定数だけ直す)**:
- 品質の 1 回の上がり幅: ノーマル 5 / マジック 2 / レア・ユニーク 1 (攻略サイト aoeah のみ。PoE1 と同じ)。プリズムは 1% と 5% の記述が食い違う (仮に 5)
- 可能性のオーブのユニークになる確率 (公開値なし、仮に 10%)。動画は手順の `outcome` で結果を指定する。なるユニークはベースのユニークから等分 (重みは公開値なし)
- スキルジェムの最初のサポート枠 (宝飾職人の「3 未満にだけ」から 2 と置いた)

### ユニークの効果 (2026-09-28、POE2Tube 要望 ⑨ の続き)

- クライアントの表には「どのユニークがどの MOD」の対応が無いので、保存済みの poe2db のユニークのページ (日本語、`data-cache/poe2db-unique-pages`、2026-05-22) の explicitMod を使う。`node scripts/build-craft-stage-uniques.mjs` → `src/services/craft-stage/stage-uniques.json`
- ステージでなり得るユニーク 429 件のうち 363 件。ページの無い 66 件 (保存後に増えた物) は名前だけ出す
- 値の幅はユニークの名前から決めた 1 つの値にする (何度なっても同じ。結果 JSON には入れない、表示だけ)。ユニークの効果はベースの数値 (物理ダメージ等) には足さない

## 追記 2026-09-29: アクト中の火力と防御 (POE2Tube 要望 ⑰)
- **ルーン** (`rune:<英語名>`、stage-runes.ts): 表はクライアントの SoulCores / SoulCoreStats (scripts/build-stage-runes.mjs → stage-runes.json、123 件)。
  効き目は SoulCoreStatCategories (マーシャル武器 / ワンドまたはスタッフ / 防具 …) で部位ごとに違い、当てはまる部位が一番狭い行を使う。
  「一度ソケットすると取り外せないが、他のオーグメントで置き換えられる」はクライアントの ClientStrings (ItemDescriptionSoulCore / RuneSocketConfirmWarning)。
  置き換えの手は未対応 (空きが無ければ打てない)。**コラプト後にはめられるかは出典なし** → 打てない扱い。アクト中に拾える下位は base_items のタグ rune_lesser (14 種、drop_level 5)
- **上の数値** (stage-props.ts): 物理 = (素 + 追加) × (1 + 増加%) × (1 + 品質)、防御 = (素 + 固定) × (1 + %合計) × (1 + 品質) (ES は規格外の賭けの ladder.ts がゲーム内の実測で確かめた形)。
  丸めは出典なし (四捨五入)。数値の正は PoB
- **PoB** (stage-pob.ts / src-tauri/examples/stage_pob.rs / scripts/_pob-stage.mjs): 同梱の PoB 0.23.1 に素のキャラ (パッシブ無し・他の装備無し) を作り、手ごとのアイテムだけ入れ替える。
  設定は PoB の Configuration の Input (resistancePenalty / enemyIsBoss / enemyLevel)。指定が無ければ PoB の既定 (Pinnacle / -60%) を明示して結果に書き戻す。
  ジェムレベルの既定はキャラのレベルで使える一番高い物 (PoB のスキルの levelRequirement)。撮影はブラウザで PoB を呼べないので、Node の再生で計算して URL (`stage-pob=` / `a_pob=` / `r=`) で渡す
- **耐性の画面** (`view=resists`): 装備だけの合計はアイテム無しとの差 (素のキャラの耐性を混ぜない)。PoB の素のキャラは各元素 +10% を持っている (ペナルティ -20 で -10 になるのはそのため)
- **解呪・サルベージ** (apply-dispose.ts): 名前はクライアントの ClientStrings (SellWindowTitle「解呪」、AdvancedCraftingBenchSalvageButton「サルベージ」)。
  出る物: 解呪 = マジック → 変成 / レア → 王者 / ユニーク → 可能性のシャード (攻略の定番)、サルベージ = ソケット → 熟練工のシャード / 品質 → その装備の品質カレンシー (クライアントの説明文)。**個数は出典なし、1 個と仮定** (DISPOSE_COUNT_CONFIRMED = false)
- **スキル・ジェムの絵** (scripts/build-skill-art-from-client.mjs): スキルのアイコンは PoB の Data/Skills の icon、ジェムの絵はクライアントの BaseItemTypes → ItemVisualIdentity
  (PoB のゲーム内 ID は綴りが違う物があるので、無ければジェムの名前で引く)。画像パック skill-art / rune-art
- **2026-09-29 夕方の全面更新 (要望 ⑰ の 21 項目)**: 動きの共通の決まり (use-anim.ts: `&play=1` / `data-anim-ms` / `data-anim-done` / `&reveal=1`、時間だけで決まり乱数なし)。
  DPS の内訳 (PoB の MainHand の <種類>HitAverage の割合。PoB の取り出し口 call_get_stats_all に MainHand / OffHand の中を `MainHand.<キー>` で足した)、
  DPS の層 (素のベース / MOD まで / 全部 を PoB で 3 回)、敵 (PoB の Data/Misc.lua の monsterLifeTable・monsterDamageTable、倍率は Modules/Data.lua、敵のレベルは CalcSetup と同じ)。
  新しい画面: view=ttk (倒すまでの時間 = 敵のライフ ÷ DPS)、view=hit (受けるダメージ = 一撃 × (1 − 耐性))、view=dps (内訳)。
  見送り: view=skill (スキルの札)、view=pool / roll と段の重みの数字 (次のクラフト回まで)
- **2026-09-29 夜の見直し (オーナー「現行のバージョンでシステム正しいかデータ見ながら。ベースによって挿せるルーンの数、あるルーン、お告げ」)**:
  - 有る無しの正は相場 (カレンシーランキング、poe2scout の Forbidden Rites、data-cache/market-snapshot-2026-09-29.json)。値段 0 = 今のゲームに無い。
    お告げ 6 種 (左右の戴冠・左右の錬金・大いなる消去・コラプト) を外した (omens.ts の REMOVED_OMENS、掛けたら打てない)。オーブ・骨・エッセンス・カタリストは全部値段あり
  - ルーンの表は手元のクライアントから列を足して書き出し直し (data-cache/client-export-stage: SoulCores の Limit / IsSocketBound / CanSocketInCorruptedSanctified、BaseItemTypes の DropLevel)。
    前は 5 月の RePoE のベース一覧で絞っていてパーフェクト・Ward・Charging のルーンが落ちていた。相場に無い物 (Tempered、Lesser Charging、Legacy 系) は available: false
  - 普通のルーンはコラプト・聖別の後でもはめられる (CanSocketInCorruptedSanctified、前の「打てない扱い」は誤り)。1 つのアイテムにはめられる数 (Limit) を効かせる
  - 熟練工の上限はベースごと: PoB の Data/Bases の socketLimit (胴・両手 4 / ほか 3、手で書かれた値) − 2 = 胴・両手 2 / ほか 1。規格外 +1・コラプト +1 の読み (規格外は扱わない)。
    **クライアントに上限の列は無い** (ItemClasses / BaseItemTypes / ArmourTypes / WeaponTypes に無い) ので、読みが違えばここを直す

## 追記 2026-09-29: 指名 (POE2Tube 要望 ⑱ kyohei「MOD を自分で選んで組み合わせる機能いるんじゃね？」)
- 付く MOD の指名 `pick` ({ mod: id か系統, tier?: "T6", values? }、錬金・大いなる高貴は配列)、カオスの消える MOD `remove`。候補は乱数の時と同じ (空き枠・同系統・アイテムレベル・強さの下限・重み > 0) で、
  外れた指名は「手 N: 指名できない (理由)」で再生を止める。結果の手に picked / pick_chance (その段の重み ÷ その手で付きうる全部の重み、段を指名しなければその MOD の重み)
- 始めの状態 `start` ({ rarity?, mods: [pick と同じ形], quality?, sockets? })。MOD は 1 つずつ付きうる物だけ (強さの下限なし)、rarity を書かなければ 3 つ以上でレア。
  手で打つ画面は MOD 一覧の段の表の「付ける」(まだ打っていない間だけ、「1 手戻す」で外す)、手順 JSON の書き出しに start が入る
- 要求 (装備に必要なレベル・能力値): PoB の Data/Bases の req (stage-bases-pob.json)。要求レベルはドロップレベルと同じ値。結果のアイテムの requirements とアイテム枠の「要求 Lv …」

