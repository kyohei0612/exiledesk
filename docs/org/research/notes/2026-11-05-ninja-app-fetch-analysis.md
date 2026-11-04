# アプリの poe.ninja の取り方の解析と、週 1 回の自動取得への移し方 (2026-11-05、リサーチ長)

頼み: ブラック 41。オーナー 11-05「アプリの忍者ＡＰＩ取得周り解析していいよ」「忍者ってめっちゃレートゆるいと思うけどな　アプリで結構とれてるけどルール定めて」。
オーナーの決め (ninja の案内の「内部用・第三者不可」を伝えた上で): ① 週 1 回 ② 5 アセ × 10 人 = 一覧 5 回 + キャラ 50 回 ③ 3 秒空け ④ 429・1015・形の変化で即止め、前の週のファイルで回す ⑤ 自前のサーバーから (家の IP を使わない) ⑥ 残すのは型 (部位・ベース・MOD・段) だけ。
読んだ物: `src-tauri/src/poe_ninja_client/` (3,433 行)、`src/services/build-copy`・`pob-check`、`server/live`、アーカイブのメモ `poe-ninja-search-dimensions.md`・`exiledesk-release-flow.md`、Cloudflare の公開の文書。**ninja は 1 本も叩いていない** (形はコードのコメントの実機の記録から)。コードは書いていない。

## 0. 先に結論 (5 行)

1. 口は 4 つ: `index-state` (リーグ → version・snapshotName) → `build-index-state` (アセの割合、無くてもよい) → `search` (アセごとの上位 100 人、protobuf) → `character` (1 人分の装備、JSON)。
2. 装備は `character` の `items[].itemData` (公式の item の JSON の形)。MOD は文、段・接頭/接尾は無い。ilvl・ベース・品質・PoB のコードもここ。
3. アプリは 09-18 に **2.5 秒空けでも 30 本ごとに 429、Retry-After 40〜50 分** を受けた。体感の長い窓は「5 分に 30 本」。**③ の 3 秒空けだと 56 本は 1 回で必ず当たる**。
4. 今のサーバーは Workers の無料の枠 (Y-76) で、1 回の起動の外への取得は **50 本まで**・cron の CPU は **10ms**。56 本を 1 回の cron では回せない。cron の空きは 2 (5 本中 3 本使用)。
5. 足りない決まりは間隔 (10 秒以上か、1 時間に数本ずつ)・リーグの固定・1 アカウント 1 人・名前を残さない・止めのスイッチ・設計図 (Y-52 の例外) の 6 つ (5 章)。

## 1. 叩いている口 (順番・要る値)

ベースは `https://poe.ninja` (`config.rs` の `NINJA_BASE`)。どれも GET、認証なし。

| 順 | 口 | 要る値 | 返り | 得る物 | 出どころ |
|---|---|---|---|---|---|
| 1 | `/poe2/api/data/index-state` | なし | JSON | `economyLeagues[]` (`url`・`name`・`hardcore`・`indexed`) と `snapshotVersions[]` (`url`・`version`・`snapshotName`)。**`url` で 2 つを突き合わせる** (09-07 に `economyLeagues[0]` へ落ちていた不具合を直した記録) | `leagues.rs` |
| 2 | `/poe2/api/data/build-index-state` | なし | JSON | `leagueBuilds[]` の `leagueUrl` が合う物の `total` と `statistics[] {class, percentage}` (アセの割合) | `search.rs` `fetch_build_index_state` |
| 3 | `/poe2/api/builds/{version}/search?overview={snapshotName}&class={アセ}&sort=dps` | 1 の `version`・`snapshotName`、アセの英語名 | **protobuf** (`application/x-protobuf`) | アセの DPS 順の上位 100 人の `account`・`name` の列 (+ そのアセ全体の集計) | `search.rs` `fetch_search_skill` |
| 4 | `/poe2/api/builds/{version}/character?account={account}&name={name}&overview={snapshotName}&timeMachine=` | 1 の値、3 の `account`・`name` | JSON | 1 人分の装備・スキル・キーストーン・ジュエル・フラスコ・`pathOfBuildingExport` | `search.rs` `fetch_character`、`build_copy.rs` |
| (5) | `/poe2/api/builds/dictionary/{hash}` | 3 の中のハッシュ | 独自形式 "NDIC" v2 | スキル名などの辞書。**装備の型には要らない** | メモ `poe-ninja-search-dimensions.md` |

- `timeMachine=` が空 = 最新。画面のタイムマシン (3 時間目〜8 週目) の値をここに入れる作りと見られるが、値の書き方は記録に無い。
- `skills=` を足すとスキルで絞る・`!` で外す (`&skills=Arc&skills=!Dark%20Consequences`、口では条件ごとに `skills=` を並べる。画面の URL の `,` 区切りを口に渡すと別の結果、09-29 の記録 `builds.rs`)。
- `class` を空にするとリーグ全体の DPS 上位。
- 週 1 回の数: 1 + (2) + 5 + 50 = **56〜57 本**。

## 2. 返りの形

### search (protobuf、スキーマ無しで番号を辿る)

`protobuf.rs`・`protobuf/summary.rs` (09-07・09-13 の実機の記録):

```text
f1 {
  f1 : varint 総数
  f2 : Dimension × 9 (f1 ID = class / items / skills / spiritgems / allskills / keypassives / anointed / weaponmode / traits、f2 辞書 ID、f3 {キー, 人数} × N)
  f6 : 辞書参照 × 7
  f12: Column × 28 (f1 = 列 ID "name" / "account" / "dps.total" …、f2 = 表示名、f7 = 値 × 行数。行の順は全列で同じ)
}
```

- 上位 N 人は `name` 列と `account` 列の i 番目どうし。
- **09 月のリーグ替わりでフィールドの番号が変わって 0 件になった** 記録あり (今の作りは番号を辿る形に直した後)。④ の「形の変化で止める」はここが一番当たりやすい。
- アカウント名は `名前-4桁` (`is_valid_account`、中国語・韓国語の名前も通す)。

### character (JSON)

`search.rs` `fetch_character`・`cache_convert/to_cached.rs` が読んでいた欄:

| 欄 | 中身 |
|---|---|
| `items[].itemData.inventoryId` | 部位 (`Helm`・`BodyArmour`・`Gloves`・`Boots`・`Amulet`・`Ring`・`Ring2`・`Belt`・`Weapon`・`Weapon2`・`Offhand`・`Offhand2` …) |
| `itemData.frameType` | 2 = レア、3 = ユニーク |
| `itemData.baseType`・`typeLine`・`name` | ベース・名前 |
| `itemData.explicitMods[]`・`implicitMods[]` | MOD の文 (`[EnergyShield\|Energy Shield]` の印つき、段は無い) |
| `itemData.ilvl` | アイテムレベル |
| `itemData.properties` | 品質 (`[Quality]` など、カタリストの種類もここ) |
| `itemData.socketedItems[]` | ルーン・オーグメント |
| `itemData.extended.subcategories` | 武器・盾などの細かい種別 |
| `pathOfBuildingExport` | PoB のコード (11-05 に画面で見た通り、印 `{fractured}` `{crafted}` は落ちている) |
| `skills[]`・`keystones[]`・`jewels[]`・`flasks[]` | 型には要らない |

**印 (フラクチャー・冒涜・クラフト) と段について**: アプリは `explicitMods`・`implicitMods` しか読んでいなかった。公式の item の JSON の形では `fracturedMods`・`desecratedMods`・`runeMods`・`enchantMods` などが別の配列になり、`extended` に MOD の段の情報が入る事があるが、**ninja の応答にそれがあるかはコードにも記録にも無い**。1 回目の取得で欄の名前を見て決める事 (無ければ段は ExileDesk の S-08 で文から当てる、今の PoB の道と同じ)。

## 3. アプリで 429・1015 が出た時の記録

| 日 | 間隔・並列 | 何が起きたか | 出どころ |
|---|---|---|---|
| 05-22 | 180ms → 220ms → 280ms、並列 4 | Cloudflare 1015 が続く | `config.rs` のコメント |
| 05-23 | 380ms・並列 2 → 500ms・並列 1 | それでも 1015。15 秒送って 10 秒休む形も秒の単位で 1015 | 同 |
| 05-23 | 2,500ms・並列 1 (「GGG の窓 12 秒 5 回 / 62 秒 15 回 / 302 秒 30 回」を当てはめた) | 512 本で約 21 分の作り | 同 |
| 09 月 | 並列で叩く | 429 が 25 分以上続く | メモ `exiledesk-release-flow.md` |
| 09-18 | 2,500ms 固定・直列 | **30 本ごとに必ず 429、Retry-After 40〜50 分**。体感の長い窓は「5 分に 30 本 (≒ 10 秒に 1 本)」。対策: 429 で間隔を倍に (上限 10 秒)・キャッシュで取り直しを 0 に・再取得は既定 3 日 | メモ `poe-ninja-search-dimensions.md`、`rate_gate.rs` `slow_down` |

- アプリの最後の作り: 2.5 秒から始め、429 を受けるたびに倍 (最大 10 秒)。429 は 3 秒から倍々で最大 120 秒・8 回まで再試、5xx は再試だけ、ほかの 4xx は即止め (`http.rs`)。1 アセ 10 分で打ち切り。
- User-Agent は `ExileDesk/0.1.4 (POE2 craft discovery; contact: …)` (連絡先入り、版は 0.1.4 のまま古い)。
- **「レートがゆるい」の読み**: 短い間隔の連打 (1 秒に数本) は 05 月に何度も 1015、長い窓 (5 分 30 本) を超えると 40〜50 分止まる。アプリで「結構取れていた」のは、09-18 以後キャッシュで取り直しを減らし、429 の度に 10 秒まで伸ばしていたから、と読める。
- 1015 は Cloudflare の「この IP からの量が多い」の止め。429 は ninja 側の Retry-After 付き。どちらも IP 単位で、アプリの時はオーナーの家の IP だった (ゲーム・取引所と共用)。

## 4. 自前のサーバーに移す時に要る物と詰まり所

### 今のサーバーの枠 (`server/live`、Workers の無料、Y-76)

| 枠 | 値 | 56 本への効き | 出どころ |
|---|---|---|---|
| 1 回の起動の外への取得 | 無料 **50 本** (有料 1 万) | **1 回の cron に入らない** | [Cloudflare の上限](https://developers.cloudflare.com/workers/platform/limits/) |
| cron の CPU | 無料 **10ms** (待ちは数えない) | character の JSON を読むのに足りるかは 1 回目で見る。相場の毎時の cron と同じ起動に乗せない方がよい | 同 |
| cron の長さ | 15 分 (無料も同じ) | 10 秒空けで 56 本 = 約 10 分なら長さは入るが、50 本の枠に当たる | 同 |
| cron の数 | アカウントで **5** | 今 3 (`0 * * * *`・`0 0 * * *`・`3 0 * * *`)、空き 2 | 同、`server/live/wrangler.jsonc` |
| KV | 増やさない (メモ analytics-logs「KV は絶対に増やさない」) | 置き場は D1 (今ある `exiledesk-logs`) か、今の KV `LIVE` の 1 キー | `docs/spec/system.md` |
| 外への問い合わせ | サーバーの cron だけ (Y-42)、回数を先に決める (Y-52) | 合う。Y-52 は「Claude・部長は叩かない」なので、この取得は**設計図に例外として書く** (G-20) | `docs/spec/system.md` |

**おすすめの形 (枠に収まり、間隔も広い)**: 週 1 回の曜日に、空いている cron を 1 本使って **10 分おき**に起動し、1 回の起動で数本だけ取る。途中の段 (どのアセの何人目まで) は D1 に置く。

- 例: 月曜 JST 朝に `*/10 * * * 1` のような cron。1 回目 = index-state + search 5 本、2 回目以後 = character 5 本ずつ × 10 回。約 2 時間で終わり、1 回の起動は 6 本以下 (50 本の枠・CPU に余裕)、ninja から見ると 10 分に 5 本 = 長い窓 (5 分 30 本) の 1/12。
- 1 回の cron で全部回す形 (10 秒空けで 10 分) は、50 本の枠を超えるので無料のままでは不可。

### 詰まり所

| 詰まり所 | 中身 | 見込み / 手当て |
|---|---|---|
| Workers から ninja が弾かれるか | Workers の外への取得には **`CF-Worker: <うちのゾーン>` が必ず付く** (Cloudflare の文書)。受け手はこれでうちの Worker からの通信と分かり、絞る・止めるができる。IP は Cloudflare の共用 | 「Cloudflare 同士だから弾かれる」決まりは無いが、ninja が Worker の通信を止める設定なら即止まる。止められたら**やめる** (回り道を探さない)。1 回目は 1 本だけで見る |
| ボット避けの確かめ | 11-05 に公式のプロフィール (pathofexile.com) は窓なしの Chrome で確かめの画面になった。ninja の画面は通った | 口が HTML (「Just a moment」) や 403 を返したら④の「形の変化」として止める。確かめを解こうとしない |
| protobuf を読む所 | アプリは Rust。Worker は TS なので `protobuf.rs` の `PbReader`・`parse_search_column` を移す (読むのは `name`・`account` の 2 列だけ) | 100 行ほどの見込み。辞書 (NDIC) は要らない |
| 段を付ける所 | 段は ExileDesk の MOD の表 (`src/services/simulator/paste/item-text.ts` S-08) で当てる。表は大きく、Worker に入れると重い・CPU 10ms に入らない見込み | Worker は「部位・ベース・MOD の文・ilvl・品質・印」までを D1 に置き、**段は作り直しの台本 (`scripts/`) か画面の側で当てる** (Y-50 の作り直しの形) |
| リーグ | 11-05 は Forbidden Rites と Runes of Aldur が並ぶ。`economyLeagues[0]` 頼みは替わり目で別のリーグを取る | リーグの `url` を設定で固定し、無ければ止める |
| 前の週で回す | 止まった週は前の週の型を使う (④) | D1 に週ごとの型を残し、「今週分が揃った時だけ入れ替える」 |
| 試し | 作る時の試しも同じ IP (Cloudflare) から同じ数え方 | 試しは 1〜2 本、`wrangler dev` から叩かない (手元で走らせると家の IP、⑤ に反する) |

## 5. ①〜⑥ で足りない決まり

| # | 足す決まり | 理由 |
|---|---|---|
| 1 | **③ の 3 秒を 10 秒以上にするか、上の「10 分おきに 5 本」に** | 09-18 の実測は 2.5 秒で 30 本ごとに 429 (40〜50 分止まり)。3 秒 × 56 本は 5 分に 56 本で、長い窓 30 本を確実に超える |
| 2 | 429・1015・HTML の応答は**再試なしでその週はやめる**、Retry-After を記録し次の週まで触らない | アプリの「8 回まで再試」は止まる時間を延ばしただけ (05-23 の 16 分のハング) |
| 3 | 5xx は 1 回だけ取り直し、2 回目で止める | 一時の不調と量の止めを分ける |
| 4 | **1 アカウント 1 人** (上位に同じ人の別キャラが並ぶ。11-05 の公式ラダーは 1 位と 7 位が同じアカウント) | 型が 1 人に寄らない |
| 5 | **名前 (アカウント・キャラ) を残さない**。続きの段に要る間だけ D1 に置き、週の終わりに消す。前の週と比べるならハッシュ | ⑥ の「型だけ」の裏付け。ninja が builds を出さない理由の 1 つが「隠したキャラを第三者に出さない」 |
| 6 | User-Agent は `ExileDesk/<版> (+連絡先)` の今の版で、`CF-Worker` と合わせて身元を隠さない | ninja の案内の作法 (分かる User-Agent) |
| 7 | 止めのスイッチ (D1 か KV `LIVE` の 1 キーで「取らない」) と、ninja から連絡・ブロックがあれば取得をやめる決まり | ninja の案内に「行儀の悪い利用者はブロック」 |
| 8 | 形の検査: index-state の `economyLeagues`・`snapshotVersions`、search の `name`・`account` の列、character の `items` が無い・0 件なら止める (アプリと同じ) | ④ の「形の変化」を具体に |
| 9 | 取る曜日・時刻を決める (混む時間を避ける。例: 平日の JST 朝) | 長い窓を他の利用者と分けて使う |
| 10 | お題の画面に ninja の名前・数字・キャラ名を出さない (11-01 の M と同じ) | 外に出すのは型だけ |
| 11 | 設計図に新しい Y の番号で書く (Y-52 の例外: 「サーバーの cron が週 1 回、56 本まで、上の止め方で」) | G-20。今の Y-52 は「Claude・部長は ninja を叩かない」なので、書かないと決まりが食い違う |

## 6. 手元の部品で使える物 (前のメモの続き)

| 物 | 使い道 |
|---|---|
| `leagues.rs` `fetch_index_state` の突き合わせ (`url` で join) | Worker に移す時の正解 (09-07 の不具合を避ける) |
| `protobuf.rs` `PbReader`・`parse_search_column`・`search.rs` `is_valid_account` | search の読み。TS に移す |
| `cache_convert/to_cached.rs` | `itemData` から部位・ベース・MOD・品質を抜く正解。`is_target_inventory_id` の除外の一覧も |
| `src/services/simulator/paste/item-text.ts` (S-08) | 段・接頭/接尾・素の値。台本か画面の側で |
| `src/services/craft-v2/deboost.ts` | カタリストの底上げを素の値に (S-08 の `unboost` と同じ決まり) |
| `rate_gate.rs`・`http.rs` | 間隔・止め方の参考。ただし「8 回まで再試」は持ってこない (5 章の 2) |

## 出どころ

- 手元のコード: `src-tauri/src/poe_ninja_client/` (`config.rs`・`http.rs`・`rate_gate.rs`・`leagues.rs`・`search.rs`・`protobuf.rs`・`protobuf/summary.rs`・`orchestrate.rs`・`ascendancy_fetch.rs`・`builds.rs`・`build_copy.rs`・`cache_convert/to_cached.rs`)、`src/services/pob-check/api.ts`、`server/live/wrangler.jsonc`・`server/live/src/index.ts`、`docs/spec/system.md` (Y-42・Y-50・Y-52・Y-76)。
- アーカイブのメモ: `memory-archive-1029/poe-ninja-search-dimensions.md` (09-13〜09-18 の実機)、`exiledesk-release-flow.md`、`api-probing-policy.md`。
- [Cloudflare Workers の上限](https://developers.cloudflare.com/workers/platform/limits/) — cron の CPU (無料 10ms)・長さ 15 分・外への取得 50 本・cron 5 本。
- [Cloudflare の HTTP ヘッダの文書](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/) — `CF-Worker` は Worker の外への取得に必ず付き、受け手が見分けて絞れる。
- [poe.ninja の API の案内](https://poe.ninja/docs/api) — builds / character は内部用 (オーナーは承知の上で決めた)。前のメモ [2026-11-04-poe-ninja-access.md](2026-11-04-poe-ninja-access.md)。
