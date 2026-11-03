# poe.ninja (PoE2) から何が取れて何が取れないか (2026-11-04、リサーチ長)

頼み: オーナー 11-04「忍者周りも色々わがまま言えるように取り方リサーチして何が出来て何が出来ないのか答えれるようにしてくれ」「時間かかってもおｋ」。
用途: デイリーのお題の型を、週 1 回 5 アセ × 10 人 = 50 人の装備からオーナーが作る (中身はアプリで見せない)。
読んだ物: 公開の文書・ページ、手元のコード、手元に残っていた昔のアプリの写し。ninja の口・画面 (JS で裏の口が動く) は 1 本も開いていない (Y-52)。前回は [11-01 の調べ](2026-11-01-poe-ninja-daily.md)。

記号: ○ できる / △ 条件つき / × できない / ★ オーナーが 1 分見れば分かる (6 に並べた)。

## 0. 朝の即答の表 (「〇〇は取れる？」)

### 中身

| 聞かれる事 | 答え | どうやって | 根拠 |
|---|---|---|---|
| アセ別の上位 10 人 | ○ | 画面でクラス (アセ) を絞り、DPS 順に並べる | ninja の告知 (絞り・列の選び)、アプリの 09-29 の観察 (`class=`・`sort=dps`) |
| 50 人の装備の全文 | ○ | 1 人ずつ PoB の書き出しを押してコードを貼る (下の「取り方」B) | PoB のコードに部位ごとの item text が入る (`pob.ts`) |
| ベース | ○ | PoB / 画面 | PoB の 3 行目、写しの `base_type` |
| MOD の段 (T1 など) | △ | ninja も PoB も段の番号は持たない。ExileDesk が文と数値から当てる (S-08 `item-text.ts`) | 写しは MOD の文だけ。アプリも文から段を当てていた |
| 接頭 / 接尾 | △ | 同上、ExileDesk が当てる | 同上 |
| アイテムレベル (ilvl) | ○ | PoB の `Item Level:` | `pob.ts` が読む。写しのレアには無い |
| 品質・カタリストの種類 | ○ | PoB の `Quality:`・`Catalyst` の行。素の値に戻すのは S-08 の `unboost` | `pob.ts`・`pob-check/to-craft.ts` |
| フラクチャー・冒涜・クラフト (エッセンス等) の印 | ○ | PoB の行頭の `{fractured}` `{desecrated}` `{crafted}` | `pob-check/to-craft.ts` (10-03 に相手の装備を読んだ記録) |
| 汚染・聖別 | ○ | PoB の `Corrupted` / `Sanctified` | `pob.ts` |
| ルーン・ソケット・暗黙・エンチャント (塗油) | ○ | PoB の `Rune:`・`Sockets:`・`Implicits:`・`{enchant}` | `pob.ts` |
| ユニークの使用率 | ○ | 画面の items の欄の % | ninja の告知、アプリ 09-13 の観察 (% = 人数 ÷ 総数) |
| レア MOD の使用率 | × ninja には無い → ○ 自分で数える | 50 人分の PoB を数えれば出る | アプリ 09-13 の観察で絞りの軸は class・items・skills・spiritgems・allskills 等で、MOD の軸は記録に無い (全 9 軸の名前は残っていない → ★5) |
| スキル・サポート・ツリー・キーストーン | ○ | 画面 / PoB | ninja の告知、アプリの写し |
| DPS | ○ | 画面 (ninja が PoB で計算した値) | ninja の告知・FAQ |
| リーグ・HC・SSF の切り替え | ○ | 画面 | ninja の画面 (アプリの `leagues.rs` が読んでいた一覧) |
| 過去の時点の上位 (先週など) | △ | ninja に Time Machine の仕組みがある。画面で選べるか ★4 | アプリの記録の内部の口の引数 `timeMachine=` |
| 更新の頻度 | ? | 公式の記載なし。第三者のガイドは「継続」 | ★3 |
| 上位の範囲 | 上位 1000 | 公式ラダーは PoE2 で上位 1000 件まで。非公開・装備を外した・HC で死んだキャラは出ない | 公式 API の文書、ninja の告知 |
| 日本語で見る | △ | ninja 本体は英語だけ。第三者の Chrome 拡張「Poe2 Ninja 日本語化 機能追加」(v1.7.31・6-08・2K+ 人・poe2tools.net)。PoB の文は英語のまま貼れば ExileDesk が日本語にする | chromeboard の掲載、`pob-check/item-text.ts` の辞書 |
| 値段 | ○ (用途外) | economy の公開の口 | ninja の API 案内 |

### 取り方

| 聞かれる事 | 答え | 理由 |
|---|---|---|
| A. 画面で見る | ○ | 人が見る普通の利用 |
| B. PoB の書き出しを押してコードを貼る (1 人ずつ押す・50 本まとめて貼る) | ○ **おすすめ** | ExileDesk は ninja を叩かない。ninja への行き来は画面を見る分だけ。ボタンが今もあるか ★1 |
| C. キャラの URL を貼って手元の道具が取る (アプリの形、1 人分でも) | × | ninja の API 案内が character・PoB・builds の口を「内部用・第三者は不可」と明記。オーナーの手元から自作の道具が叩けば第三者の利用 |
| D. URL 50 本をまとめて・間を空けて順に取る | × | C と同じ。間を空けるのは負荷の作法で、許可にはならない。案内に「やりすぎはブロック」「AI を使った開発に結びつく利用の急増」 |
| E. 一覧から 50 人を自動で拾う | × | 内部の search の口 (アプリの「上位プレイヤー MOD 一覧」がこれ) |
| F. 拡張機能・ブックマークレットで画面から抜く | × (勧めない) | 負荷は増えないかもしれないが、人の押しを道具が代わる抜き取り。ninja に規約のページは無いが、案内の趣旨 (負荷・隠したキャラを第三者に出さない) に反する。GGG の規約 7.6 (抽出の道具) は GGG のサイトの話 |
| G. Build Planner の書き出し | △ 装備なし | ツリーとスキルだけ。告知に "Items are not included yet" |
| H. economy の公開の口 | ○ (値段だけ) | 作法: 連絡先入りの User-Agent・ETag (約 5 分) を守る・数分より速く取らない・手元の端末からでなく自前のサーバー経由 |
| I. 公式ラダーの画面を見る | ○ 見るだけ | 装備が見えるかは ★2。台本で抜くのは規約 7.3・7.6 で × |
| J. 公式 API (OAuth) | × | 新規の登録は停止 ("We are currently unable to process new applications.")。ラダーの口に装備は無く、装備の口は認可した本人の分だけ |
| K. 手元に残っている 10-09 の写しを使う | △ オーナーの判断 | 追加の取得 0 で今すぐ使える (下の 4)。ただし取った口は今の案内で第三者不可の物で、4 週前のリーグの頭の装備 |
| L. ninja の作者に頼む (Discord) | 聞くのは自由・望みは薄い | 出さない理由が負荷とプライバシーなので |
| M. お題の画面に ninja の名前・数字を出す | 避ける | 11-01 と同じ。参考にするだけ |

## 1. 50 人を週 1 回、どこまで楽にできるか

決まりの上で一番楽なのは **B をまとめて貼る形**。

1. アセごとに絞った一覧を ninja で開く (絞った URL を 5 本ブックマークしておけば毎週 5 クリック)。
2. 1 人ずつキャラを開いて PoB の書き出しでコピー → 1 つの欄 / txt に改行区切りで貼っていく (1 人 20〜30 秒の見込み、50 人で 20〜25 分。押した後の動き (すぐコピーか、窓が出るか) は ★1)。
3. 貼った 50 本を ExileDesk の手元の道具がまとめて読み、部位 × MOD (素の値・段・接頭/接尾・印) を数えて控えを出す。

| 楽にする案 | 可否 |
|---|---|
| PoB を 50 本まとめて 1 つの欄 / txt に貼る | ○ (読むのは手元だけ) |
| 人数を 5 アセ × 5 人に減らす (10〜13 分) | ○ (オーナーの決め) |
| 貼った分を週ごとに残して前の週と比べる | ○ (手元の txt、公開しない) |
| 同じ人が先週と同じなら貼らない | ○ (道具が名前で重ねを見る。名前は PoB の中に無いので、貼る時に 1 行目に名前を添えるか ★1 で確かめる) |
| URL を 50 本貼って道具が取る (間を空けても) | × (上の C・D) |
| 一覧から 50 人を自動で拾う・押す | × (E・F) |

## 2. 読みの道具の作り (コードを読んだだけ、Web で動くか)

PoB のコード → 数えた表、の道筋は**今ある部品で全部つながる**。新しく作るのは「50 本を割って回し、数える」所だけ。

| 段 | 部品 | Web で動くか |
|---|---|---|
| コード → XML | `src/services/build-copy/pob.ts` の `decodePobCode` | ○ (atob・`DecompressionStream`、末尾の崩れたコードの救済つき) |
| XML → 部位ごとの文 | 同 `parseBuild` | ○ (`DOMParser`。Node の台本で回すなら代わりが要る) |
| PoB の文 → ゲームのコピーの形 | `src/services/pob-check/to-craft.ts` の `pobRawToCopy` | ○ (import 無し) |
| コピーの形 → ExileDesk の MOD・段・素の値 | `src/services/simulator/paste/item-text.ts` の `parseItemText` (S-08、カタリストの `unboost` 込み) | ○ (シミュの貼り付けで使っている) |
| 日本語の名前 | `src/services/pob-check/item-text.ts` | △ `./api` (Tauri の `invoke`) を引く。Web に持つなら `gemJa` の所を外す |
| 品質の底上げを戻す (別の道) | `src/services/craft-v2/deboost.ts` | ○ (アプリの上位 MOD 一覧が使っていた) |

使えない物:

| 物 | 理由 |
|---|---|
| `src/services/build-copy/ninja-url.ts` (URL → リーグ / アカウント / キャラ名) | 関数は動くが、行き先 (C) が × なので使い道が無い |
| `src/services/pob-check/api.ts` の `toPobCode` | Tauri 頼みで Web では動かない。中身は C |
| Rust `src-tauri/src/poe_ninja_client/build_copy.rs` の `ninja_build_character` | `/poe2/api/data/index-state` と `/poe2/api/builds/{version}/character` = 内部の口 |
| Rust の「上位プレイヤー MOD 一覧」(`mod.rs`・`ascendancy_fetch.rs`・`search.rs`・`builds.rs`) | 内部の search と character を 1 回に最大 512 本 (5 月の作り)。5-23 に Cloudflare の 1015 (レート制限) を何度も受けて 2.5 秒間隔まで落とした記録 (`config.rs`)。IP はオーナーのゲーム・取引所と共用 |

## 3. 11-01 から変わった事・新しく分かった事

- ninja の API 案内に、builds の口を閉じる理由として「AI を使った開発に結びつく利用の急増」の文。手元の端末から直接叩かず自前のサーバー経由で、も明記 (11-01 の要約には無かった。前から有ったかは不明)。
- PoE2 用の Build Planner の書き出し (告知 5-29、年の記載なし)。装備は入らない。
- 日本語: ninja 本体は未対応。第三者の拡張は 6-08 版で、ninja・pobb.in の画面を訳す・お気に入り・日本語で探す。書き出しの機能は書かれていない。上の可否は変わらない。
- 公式 API の新規の登録は 11-04 も停止。PoE2 のラダーは上位 1000 件・装備なし (公式の文書で確認、11-01 と同じ)。
- poe2.ninja は poe.ninja に統合済み (古い URL は転送)。
- 手元に 10-09 の写しが残っていた (下の 4)。

## 4. 手元に残っている昔の写し (追加の取得 0)

`%APPDATA%/com.kyohei.exiledesk/craft_v2_cache.json` (1.9 MB、10-09 19:35 に昔のアプリが保存)。

| 項目 | 中身 |
|---|---|
| リーグ | Forbidden Rites (`forbiddenrites`) |
| 人数 | 7 アセ × 30 人 = 210 人 (Gemling Legionnaire 35%・Martial Artist 10%・Disciple of Varashta 8%・Spirit Walker 7%・Oracle 7%・Deadeye 6%・Infernalist 4%、% は ninja の画面のアセの割合) |
| レア | 1,386 個 (アミュ 208・靴 189・兜 185・手袋 172・指輪 159 + 88・武器 121 + 92・胴 100・盾等 60 + 12)、1 個あたり明示 MOD 3.75 行 |
| レアの欄 | 部位・明示 MOD の文 (`[Tag\|表示]` の印つき)・ベース・品質と種類・オーグメント |
| レアに無い物 | ilvl・暗黙・段・接頭 / 接尾・フラクチャー等の印 |
| ユニーク | 名前・ベース・暗黙・明示・ilvl など |

使い方の見込み: 1 週目のお題の型を試しに作る・B の数え方を作る時の見本。使うかはオーナーの判断 (上の K)。

## 5. 公式・ninja の上位の数え方の注意

- ninja の上位 = 公式ラダーの上位 1000 から。非公開のキャラ・装備を外したキャラ・HC で死んだキャラは出ない (ninja の告知・PoE2 の案内)。
- 割合は人気で、強さではない。Gemling Legionnaire が 35% のように偏る (写しの 10-09)。5 アセを選ぶ時は「上位 5 アセ」か「部位が散る 5 アセ」かをオーナーが決める。

## 6. オーナーが 1 分見れば分かる事

| ★ | 見る所 | 分かる事 |
|---|---|---|
| ★1 | ninja の PoE2 のキャラのページの上の方で PoB の書き出しを押す | ボタンが今もあるか・すぐコピーされるか窓が出るか (B の前提と 1 人の秒数) |
| ★2 | pathofexile2.com/ladders で 1 人押す | 公式ラダーから装備が見えるか (ninja の代わりになるか) |
| ★3 | ninja の builds の一覧の上の更新の時刻 | builds の更新の頻度 |
| ★4 | 同じ一覧の上の時点の選び (Time Machine) | 先週の時点に戻して見られるか |
| ★5 | 同じ一覧の左の絞りの欄 | アセで絞れるか・レア MOD の絞りがあるか |
| ★6 | キャラのページで装備にマウスを乗せる | MOD の全文・ベースが画面だけで読めるか (B を使わず A だけで済むか) |

## 出どころ

- [poe.ninja の API の案内](https://poe.ninja/docs/api) — 公開は economy だけ、builds / profiles・character・PoB は内部用、理由 (負荷・プライバシー・AI の利用の急増)、作法、PoE2 は約 1 時間。日付の記載なし。
- [PoE2 のキャラが載らない時](https://poe.ninja/docs/character-not-listed-poe2) — 元は公式のラダー API の上位。
- [ninja のビルドの始まりの告知](https://poe.ninja/posts/launching-builds) — 絞り・除外・列の選び、装備を外した・HC で死んだキャラは更新しない。
- [Build Planner の書き出しの告知](https://poe.ninja/posts/poe2-build-planner-prototype) — ツリーとスキルのみ。
- [poe2.ninja の統合](https://poe.ninja/posts/merging-poe2ninja-into-poeninja)・[ninja の FAQ](https://poe.ninja/faq)
- [GGG の開発者の文書](https://www.pathofexile.com/developer/docs/index) — 新規の登録を停止。[リファレンス](https://www.pathofexile.com/developer/docs/reference) — PoE2 のラダーは上位 1000・装備なし、`account:characters` は本人の分。
- [第三者のガイド (poetrades)](https://poetrades.net/poe-ninja-guide-2026/) — 「Copy PoB Code」、builds の更新は「継続」(主に PoE1 の話)。
- [日本語化の拡張 (chromeboard)](https://chromeboard.com/extension/poe2-ninja-日本語化-%20-機能追加-akeoalhljdgppjfcgcnglmdingpmhefm)
- 前回: [2026-11-01-poe-ninja-daily.md](2026-11-01-poe-ninja-daily.md) (GGG の規約 7.3・7.6・7.9、ninja の窓口、robots.txt)。
- 手元: 2 の表のファイル、`src-tauri/src/poe_ninja_client/` のコメント (05-22〜09-29 の実機の観察)、4 の写し (中身は数えただけで写していない)。
- 引用は取得の道具の要約を通した物。決める前に原文を一度見る事。

## どの部に何が効くか

| 部 | 効く事 |
|---|---|
| デイリー部長 | 控えの入口は「PoB を貼る (まとめて可)」。読みは 2 の道筋 (`decodePobCode` → `parseBuild` → `pobRawToCopy` → S-08 `parseItemText`) で全部ある。URL で取る形・上位 MOD 一覧を戻す形は不可。試しの見本に 10-09 の写しがある (使うかはオーナー) |
| ブラック / オーナー | ★1〜6 を見るか。人数 (50 / 25)・アセの選び方・10-09 の写しを使うか |
