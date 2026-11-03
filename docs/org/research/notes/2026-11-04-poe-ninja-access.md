# poe.ninja (PoE2) から何が取れて何が取れないか (2026-11-04、リサーチ長)

頼み: オーナー 11-04「忍者周りも色々わがまま言えるように取り方リサーチして何が出来て何が出来ないのか答えれるようにしてくれ」。
用途: デイリーのお題の型を、週 1 回 5 アセ × 10 人 = 50 人の装備からオーナーが作る (中身はアプリで見せない)。
読んだのは公開の文書と手元のコードだけ。ninja の口・画面 (JS で裏の口が動く) は 1 本も開いていない (Y-52)。前回は [11-01 の調べ](2026-11-01-poe-ninja-daily.md)。

## 1. 即答の表

| 取り方 | できる? | 取れる中身 | 決まり・負荷 |
|---|---|---|---|
| A. オーナーが ninja の画面で見る | **できる** | アセ別の上位 (クラスの絞り)・項目ごとの「使う人の割合」・キャラごとの装備・リーグの切り替え。MOD の全文がホバーで出るかは未確認 (★1) | 人が見る普通の利用。負荷はふつう |
| B. 画面の「Path of Building」の書き出しを押して PoB のコードを ExileDesk に貼る | **できる (おすすめ)** | 部位ごとの装備の全文 (レア度・ベース・暗黙・明示 MOD・ルーン・エンチャント・品質)。段は ExileDesk 側で MOD に当てて出す | ExileDesk は ninja を叩かない。人がボタンを押すだけ。ボタンの有無はガイドと ninja の告知で確認、PoE2 の今の画面は ★2 |
| C. キャラの URL を貼り、手元の道具が ninja から 1 人分取る (アプリの形) | **できない** | (取れる中身は B と同じ + JSON 全部) | ninja の API 案内が character・PoB・builds の口を「内部用・第三者は不可」と明記。オーナーの手元からでも自作の道具が叩けば第三者の利用。間を空けても許可にはならない |
| D. URL を 50 本まとめて貼って順に取る | **できない** | — | C と同じ理由 + 案内に「やりすぎはブロック」「AI で作った利用の急増」の文。IP はオーナーのゲーム・取引所と共用 (09-16 の 25 分止まった件) |
| E. 画面の「Build Planner」の書き出し | **装備には使えない** | パッシブツリーとスキルだけ。告知に "Items are not included yet" | ボタンは人が押す物なので可。お題には使い道なし |
| F. ninja の economy の公開の口 | **できる (中身が違う)** | 値段だけ (Exchange・stash のユニーク等)。PoE2 は約 1 時間ごと | 公開。作法: 連絡先入りの User-Agent・ETag (約 5 分) を守る・数分より速く取らない・**手元の端末からでなく自前のサーバー経由** |
| G. 公式のラダーの画面を見る | **見るだけならできる** | 上位の名前・レベル・クラス。装備が見えるかは未確認 (★3) | 台本で抜くのは規約 7.3・7.6 で不可 |
| H. 公式 API (OAuth) | **できない** | 他人の装備は取れる scope が無い (`account:characters` は認可した本人の分) | 新規の登録は今も停止 "We are currently unable to process new applications." |
| I. ninja の作者に頼む (Discord) | **聞くのは自由・望みは薄い** | — | 出さない理由が負荷とプライバシー (隠したキャラを第三者に出さない) なので |

ninja の中身の項目ごとに言うと:

| 中身 | 取れる道 |
|---|---|
| アセ別の上位 | A (画面の絞り)。上位の数・並びの元は公式ラダー |
| 部位ごとの装備 | A で見る / B で全文 |
| MOD の全文 | B (PoB の item text)。A のホバーは ★1 |
| ベース | B (PoB に入る)。A は ★1 |
| 段 (ティア) | ninja も PoB も段の番号は持たない前提。B の文を ExileDesk の MOD 表に当てて出す (アプリの上位 MOD 一覧はこうしていた) |
| 割合 | A だけ (画面の項目の「何 % が使う」)。50 人分を B で数えれば自分の割合は出せる |
| リーグ | A で選ぶ。B のコードはそのキャラの今の装備 |
| 更新の頻度 | economy は約 1 時間 (案内)。builds は公式の記載なし (★4) |

★ = オーナーが 1 分見れば分かる事 (下の 5 に並べた)。

## 2. 50 人を週 1 回、どこまで楽にできるか

決まりの上で一番楽なのは **B をまとめて貼る形**。

1. オーナーがアセごとの上位の一覧を ninja で開く (絞った URL を 5 本ブックマークしておけば毎週 5 クリック)。
2. 1 人ずつキャラを開いて「Path of Building」の書き出しでコピー → ExileDesk 側の欄に貼る (1 人 20〜30 秒の見込み、50 人で 20〜25 分)。
3. 貼った 50 本を ExileDesk の手元の道具がまとめて読み、部位 × MOD (素の値・段) を数えて控えを出す。ninja への行き来は人が画面を見る分だけ。

| 楽にする案 | 可否 |
|---|---|
| PoB のコードを 50 本まとめて 1 つの欄 / txt に貼る (改行区切り) | **できる** (読むのは手元だけ) |
| 人数を 5 アセ × 5 人に減らす | できる (オーナーの決め) |
| 貼った分を週ごとに残して前の週と比べる | できる (手元の txt。公開はしない) |
| URL を 50 本貼って道具が取る (1 人ずつ間を空けても) | **できない** (上の C・D) |
| 一覧のページから 50 人を自動で拾う | **できない** (内部の口・画面の抜き取り) |
| ninja の割合の数字をそのままお題の画面に出す | 避ける (11-01: 「poe.ninja の集計」と画面で言わない) |

## 3. 11-01 から変わった事・新しく分かった事

- ninja の API 案内に、builds の口を閉じている理由として「AI を使った開発に結びつく利用の急増」の文がある (11-01 の要約には無かった。前から有ったかは不明)。手元の端末から直接叩かず自前のサーバー経由で、の文も明記。
- PoE2 用の「Build Planner」の書き出しが ninja にある (告知 5-29、年の記載なし)。ツリーとスキルだけで装備は入らない。
- 日本語: ninja 本体の日本語対応は見つからない。第三者の Chrome 拡張「POE2 ninja 日本語化 + 機能追加」がある ([chromeboard](https://chromeboard.com/extension/poe2-ninja-日本語化-%20-機能追加-akeoalhljdgppjfcgcnglmdingpmhefm))。拡張は ninja の画面を書き換えるだけで、上の可否は変わらない。B で貼る PoB の文は英語のままで ExileDesk 側が日本語にする。
- 公式 API の新規の登録は 11-04 も停止のまま。
- poe2.ninja は poe.ninja に統合済み ([告知](https://poe.ninja/posts/merging-poe2ninja-into-poeninja))。古い poe2.ninja の URL は転送。

## 4. アプリの元の作り (コードを読んだだけ)

| 物 | 今も使えるか |
|---|---|
| `src/services/build-copy/ninja-url.ts` (URL → リーグ / アカウント / キャラ名) | 形を読むだけの関数なので動く。ただし行き先の取り方 (C) が使えないので、Web に入れる意味は無い |
| `src/services/pob-check/api.ts` の `toPobCode` | **Web では動かない** (Tauri の `invoke` 頼み)。PoB のコードが貼られた時はそのまま返すので、その半分だけは B と同じ |
| Rust `src-tauri/src/poe_ninja_client/build_copy.rs` の `ninja_build_character` | **使わない**。`/poe2/api/data/index-state` と `/poe2/api/builds/{version}/character` = 案内の言う内部の口 |
| Rust の「上位プレイヤー MOD 一覧」(`builds.rs`・`ascendancy_fetch.rs`・`search`、280ms 間隔のゲート) | **戻さない**。内部の search の口をアセごとに何十本も叩く作りで、D そのもの |
| `src/services/build-copy/pob.ts` の `decodePobCode`・`parseBuild` | **B の読みにそのまま使える**。純 TS (atob・`DecompressionStream`・`DOMParser`) でブラウザで動く。Node の台本で回すなら `DOMParser` の代わりが要る |
| `src/services/craft-v2/deboost.ts` (装飾品のカタリストの底上げを素の値に戻す) | 使える。上位の装備は品質で数値が上がっているので、数える前に通す (アプリの上位 MOD 一覧と同じ決まり) |
| `src/services/simulator/paste/item-text.ts` (S-08、item text → ExileDesk の MOD) | 使える。PoB の item text の行を MOD・段に当てる入口 |

## 5. オーナーが 1 分見れば分かる事

| ★ | 見る所 | 分かる事 |
|---|---|---|
| ★1 | ninja の PoE2 のキャラのページで装備にマウスを乗せる | MOD の全文・ベースが画面で読めるか (A だけで済むか) |
| ★2 | 同じページの上の方 | 「Path of Building」の書き出しのボタンが今もあるか・押すとコピーされるか (B の前提) |
| ★3 | pathofexile2.com/ladders で 1 人押す | 公式ラダーで装備が見えるか (ninja の代わりになるか) |
| ★4 | ninja の builds の一覧の上の「更新」の時刻 | builds の更新の頻度 |
| ★5 | builds の一覧の絞り | アセンダンシーで絞れるか (クラスだけか) |

## 出どころ

- [poe.ninja の API の案内](https://poe.ninja/docs/api) — 公開は economy だけ、builds / profiles・character・PoB は内部用、作法 (User-Agent・ETag・数分・自前のサーバー経由・ブロック)、PoE2 は約 1 時間。日付の記載なし。
- [PoE2 のキャラが載らない時](https://poe.ninja/docs/character-not-listed-poe2) — 元は公式のラダー API の上位。人数・頻度の記載なし。
- [Build Planner の書き出し (告知)](https://poe.ninja/posts/poe2-build-planner-prototype) — ツリーとスキルのみ、ボタンは PoB の書き出しの横。
- [poe2.ninja の統合](https://poe.ninja/posts/merging-poe2ninja-into-poeninja)
- [GGG の開発者の文書](https://www.pathofexile.com/developer/docs/index) — 新規の登録を停止。
- 前回: [2026-11-01-poe-ninja-daily.md](2026-11-01-poe-ninja-daily.md) (GGG の規約 7.3・7.6・7.9、ninja の窓口、robots.txt)。
- 手元のコード: 上の 4 の表のファイル (11-04 のこの worktree で読んだ)。
- 引用は取得の道具の要約を通した物。決める前に原文を一度見る事。

## どの部に何が効くか

| 部 | 効く事 |
|---|---|
| デイリー部長 | 控えの入口は「PoB のコードを貼る (まとめて可)」。URL で取る形・アプリの上位 MOD 一覧を戻す形は不可。読みは `pob.ts`・`item-text.ts`・`deboost.ts` |
| ブラック / オーナー | ★1〜5 を見るか。人数 (50 / 25) の決め |
