# 設計図 — 全体のシステム (Y-xx)

持ち主: ブラック。型は `docs/spec/README.md` の「3. 書き方の型」。大本 (G-xx) が先。
2026-10-28 に、ARCHITECTURE.md・server/live/README.md・server/web の設定と頭の説明・docs/org/analytics/ (README・notes)・docs/org/dev/README.md・各部の README・メモ (analytics-logs・web-ads-domain-plan・ads-page-model・web-english・feedback-local-first・api-probing-policy・feedback-web-only-for-now・feedback-replies ほか) から集めて書いた (オーナー 10-28「あと全体システム」)。
地図 (どこに何があるか) は `docs/ARCHITECTURE.md`、持ち主は `docs/org/owners.txt`。この紙は「全体がどう動くべきか・部品どうしの境目の決まり」だけを持つ。

## ① この紙の範囲

- 持つ物: 全体の形 (画面・2 つの Worker・D1・KV の役の分け方)、ページの構成と行き来の約束、広告の枠、サーバー (server/web の配信・短いリンク、server/live の /boot.json・/log・/event・/feedback・日報・Discord)、データと相場の流れ、記録と分析、環境 (本番・1460・1461・1440) とスイッチの境目、1 日 10 万リクエストの枠、英語のページと SEO、アプリの扱い、セキュリティ。
- 持たない物 (紙の名前で指す):
  - 結果が変わる物 (付き方・確率・打てるか・名前のデータ)、データの出どころの順 → `engine.md` (E-01〜04)。
  - 各画面の流れ・操作・表示 → `emu.md`・`sim-tree.md` (作成中)・`tutorial.md` (作成中)。
  - 共通の部品・決まった挙動 (ページの移り方 U-27・離れる時の確かめ U-28・英語の画面 U-60〜62・スイッチの書き方 U-70〜73) → `shared-ui.md`。
  - 出し方 (版上げ・更新内容・スイッチの開け方・1461 の立て方・見張り・要望の返事の置き方) → `release.md`。

## ② 状態・用語の表

| 言葉 | 意味 |
|---|---|
| 画面 | `pnpm build:web` が作る静的なファイル (dist-web)。server/web の静的な置き場から配る |
| web の Worker | server/web (`move-gate.js`)。シェアの /s/・/og/・/r/ だけを受ける |
| live の Worker | server/live (`exiledesk-live.exiledesk.workers.dev`)。/boot.json・/log・/event・/feedback・cron |
| D1 | `exiledesk-logs` 1 つ。記録 (logs)・記録しない端末 (nolog)・要望の画像・シェア (shares・recipe_shares)・Discord の写し・AI の評価と見解 |
| KV | `LIVE` 1 つ。配信の状態・相場・本日の訪問者・要望 fb:・返事 fbr:・異常 alertlog:・前の nolog のリスト |
| AE | Analytics Engine `exiledesk_events`。操作の印・画面のエラー (3 か月) |
| 枠 (1 日) | Cloudflare Workers の無料の上限 1 日 10 万リクエスト。アカウント全体、UTC 0:00 (JST 9:00) に戻る |
| 読み物 | JS 無しで読める静的な HTML (/bases/・/blog/・/faq・/craft-basics・/cosmetics/・guide・about・contact・privacy と /en/ の同じ物) |

環境 (細かい立て方は release.md の ② と R-13):

| | 本番 exiledesk.com | 1460 本番の作り | 1461 固定の版 | 1440 dev サーバー |
|---|---|---|---|---|
| スイッチ | RELEASED だけ | RELEASED だけ | 全部 | 全部 |
| 広告の枠 | 出さない (審査中、Y-22) | 出さない | 場所だけ | 場所だけ |
| /boot.json | 本番の live | 手元の Worker (404 → 相場の控え)。`--live` で本番を読む | 本番の live を読むだけ | 本番の live を読むだけ |
| 記録 (/log・/event) | 本番の D1・AE | 手元で捨てる | 送らない | 送らない |
| D1 (シェア) | 本番 | 手元の写し | 手元の写し | — |
| 要望を送る | 本番 | 手元 | 本番に届く (Y-71 の例外) | 本番に届く (Y-71 の例外) |

## ③ 決まり

### A. 全体の形

- **Y-01 計算はブラウザ、サーバーは配る・受けるだけ**: 打つ・確率・100 人・スパムシミュ・シミュのツリー・チュートリアルの計算は全部ブラウザの中でし、サーバーに計算させない。サーバーは静的な画面を配り、相場と配信をまとめて配り、記録・要望・シェアを受けるだけ。
  - 有効。出どころ: オーナー 10-09「サーバー重くならない仕組みで」、棚卸し docs/org/analytics/notes/2026-10-25-request-inventory.md (操作で Worker への取り物が増えない)。確かめ: Y-100。
- **Y-02 置き場は D1 1 つと KV 1 つ、新しい物は D1**: 新しく持つデータ (記録・シェア・表) は D1 `exiledesk-logs` に表を足す。KV は今ある物のまま増やさない。
  - 有効。出どころ: オーナー (メモ analytics-logs「KV は絶対に増やさない」)、10-11 KV の一覧で無料枠の 9 割 (forget.ts)。確かめ: server/live/migrations と wrangler.jsonc の kv_namespaces が 1 つ、コードを読む。
- **Y-03 Web だけ、アプリは凍結**: 更新するのは Web だけ (G-07)。アプリの物 (src-tauri・アプリの部品と state・`services/simulator/htc/` ほか) は消さず死蔵の洗い出しにも数えない。Web からは import しない。
  - 有効。出どころ: オーナー 10-16・10-23 (メモ feedback-web-only-for-now)。確かめ: コードを読む (Web の入口から `services/simulator/htc/` への import が無い)。
- **Y-04 持ち主は owners.txt が正**: どのファイルを誰が直すかは `docs/org/owners.txt` (`node scripts/owner-of.mjs <パス>`)。地図・README と食い違えば owners.txt。server/ はサーバー管理人、ページの入口は デザイン部長、エンジンは ジン部長 (G-06)。
  - 有効。出どころ: docs/org/dev/README.md の地図 (10-21〜23)。確かめ: `node scripts/owner-of.mjs --check <部> <パス…>`。

### B. 画面の全体 (ページ)

- **Y-10 クラフト台は `/`、ほかの画面は別のページ**: エミュのクラフト台は `/`、それ以外は `?page=<名前>` (base・routes・feedback・guide・recipes・sim-base / sim-mods / sim-tree・daily・skins)、コースは `?course=<id>`。ページごとに URL と題を変え、履歴に積む (戻るで前のページ)。
  - 有効。出どころ: オーナー 10-18 (メモ ads-page-model)、10-22〜25 (web/page.ts の頭)。確かめ: `src/web/page.ts` の表と画面。
- **Y-17 ジェムコラプトは Web に出さない**: Web 版からジェムコラプトの入口 (スイッチ gemCorrupt・`?page=gem-corrupt`・track の `mode:gem-corrupt`・Web 専用の `GemCorruptWebPanel.vue`・`web-materials.ts`) を外す。開発版にも出さない。アプリと共有のコード (`views/gem-corrupt/` のアプリが使う物・gem-watch) は消さずに残し、Web から読まれないだけにする (Y-03)。
  - 有効 (10-28 に外した: エミュ部長 75151d72b がクラフト台のタブ、デザイン部長が page.ts・track.ts・release-flags.ts の gemCorrupt と Web 専用の `GemCorruptWebPanel.vue`・`web-materials.ts`・`tests/gem-corrupt-web.test.ts` を消した。戻す時は git の 23f1d1d9 の頃から)。出どころ: オーナー 10-28「ジェムコラ一旦コードからも非表示でおｋかなり先になる」(前は 10-16「ジェムコラプトは内緒」でスイッチの下)。確かめ: `grep -rn "gem-corrupt\|gemCorrupt" src/web src/views/craft-stage` が 0、Web の入口から `views/gem-corrupt/` への import が無い。
- **Y-11 新しい機能はページを移る形で作る**: 新しい機能・チュートリアルは「1 つの画面の中の切り替え」でなく、ページを移る形 (URL・題が変わる) で考える。MOD 一覧は重ねる窓のまま (M-17)。
  - 有効。出どころ: オーナー 10-18「チュートリアルも今後の実装もなにかとページ変える形にする」(メモ ads-page-model)。確かめ: 画面。
- **Y-12 ページの入口は page.ts 1 か所**: ページの URL・題・履歴・離れる時の確かめは `src/web/page.ts` (デザイン部長) だけが持つ。各部 (デイリー・スキン・シミュ) はページの中身だけを持ち、入口・タブはデザイン部長に頼む。移り方の決まりは U-27・U-28。
  - 有効。出どころ: 10-23 の線引き (docs/org/daily/README.md 3・docs/org/skins/README.md)。確かめ: コードを読む。
- **Y-13 ページを移ったら 3 つ揃えて動かす**: ページを移るたびに ① 広告の枠の出し直し (`utils/ads.ts` の pageTick) ② 記録の screen (`track("page:…")`) ③ 題 を動かす。新しい `?page=` を足す時は 3 つとも足す。クラフト台へ戻ったのも 1 ページ。
  - 有効。出どころ: 10-19 の PV の点検 (craft の抜けを足した、page.ts)、メモ analytics-logs。確かめ: 窓なしで `__exiledeskLog` を横取りして screen が出るか (メモ analytics-logs の形)。
- **Y-14 本番で開いているページの正は RELEASED**: 開発版だけのページ・機能はスイッチの下 (R-02)。どれが本番で開いているかは `src/web/release-flags.ts` の RELEASED が正で、地図・コメントの「開発版だけ」は正にしない。
  - 有効。出どころ: オーナー 10-24「今本番に出てるやつそっくり出す」(release-flags.ts の頭)。確かめ: 1460 で開けていないページが出ない (R-09)。
- **Y-15 読み物は静的な HTML でビルドが作る**: 読み物はビルドの台本 (`build-seo-pages.mjs`・`build-blog-pages.mjs`・`build-cosmetics-pages.mjs`) と public/ の静的な HTML で、JS 無しで読める。生成物はリポジトリに入れない。中身のゲームのデータはエンジンと同じ関数から作り、手で写さない (G-06)。画面からは `<a href>` で行く。
  - 有効。出どころ: オーナー 10-13 (ベースのページ)・10-22 (ブログ)・10-25 (コスメ)、各台本の頭。確かめ: `pnpm build:web` 後の dist-web。
- **Y-16 外から来る URL の形は変えない**: 外に出た URL の形 (`/?base=<英語名>`・`?lang=`・`?nolog=`・`#recipe=`・`/r/<id>`・`/s/<id>`・`web.exiledesk.workers.dev`) は約束として残す。古い長い `#recipe=` もそのまま開く。`workers_dev: true` を消さない。
  - 有効。出どころ: 10-11 (workers.dev を切って 404 になった、server/web/wrangler.jsonc)、10-26 (recipe-share.js)。確かめ: 本番で古い形の URL を開く。

### C. 広告の枠

- **Y-20 広告ありきで作る**: クラフト台は右の列 (チャンネルの下)、クラフト台以外のページは右の列を外して両脇に縦長の枠 (WebApp の page-left / page-right)。PC は全体で最大 3 つ。開発版に出す物は全部この前提で作る。
  - 有効。出どころ: オーナー 10-12・10-18「広告ありきで今後は開発版は出すように」(メモ web-ads-domain-plan・ads-page-model)。確かめ: 1440 / 1461 で枠の場所 (AD_FRAMES)。
- **Y-21 出し直しはページを移った時だけ**: 時間で入れ替えない。ページを移った時だけ出し直し、同じ枠は 60 秒に 1 回まで。MOD 一覧の窓は広告なし・開け閉めで出し直さない。
  - 有効。出どころ: オーナー 10-12 (utils/ads.ts の頭)。確かめ: `AD_MIN_GAP_S`、開発版の枠の回数の表示。
- **Y-22 審査が通るまで本番に広告を出さない**: AdSense の審査中は本番に枠を出さない (`ADS_LIVE = false`)、自動で作った読み物にも広告のコードを置かない (`ADS_ON_AUTO_PAGES = false`)。開発版だけ場所を見せる。通ったらスイッチ 1 つで出す。
  - 有効。出どころ: オーナー 10-18 (メモ ads-page-model)、10-27 模擬審査 (docs/org/analytics/notes/2026-10-27-adsense-mock-review.md)。確かめ: 1460 で枠 0。
- **Y-23 スマホは上の帯の下に 1 つ、押す物から離す**: スマホは上の帯の下に 1 つ。棚・「ベースを変える」から指 1 本分離す (誤タップは規約違反)。自動のアンカー広告は下の固定の帯とぶつかるので切る。
  - 有効。出どころ: オーナーと決めた形 (メモ web-ads-domain-plan)。確かめ: 画面 (mobile preset)。
- **Y-24 ブログは本文の下に横長 1 つ**: 記事は本文の下に横長のバナー 1 つ、見出し 4 つ以上の長い記事は真ん中の見出しの前にもう 1 つ。本文の横には置かない。
  - 有効。出どころ: オーナー 10-22「記事は note 準拠」(build-blog-pages.mjs の頭)。確かめ: 開発版の見本の箱 (--drafts)。
- **Y-25 アプリには広告を出さない**: AdSense は Web 専用。
  - 有効。出どころ: メモ web-ads-domain-plan。確かめ: コードを読む。

### D. サーバー: 配信 (server/web)

- **Y-30 web の Worker を通るのは /s/*・/og/*・/r/* だけ**: トップ・読み物・絵・JS・CSS・ads.txt は静的な置き場から直接配る (枠に数えず、上限を越えても止まらない)。Worker を通す道を足す時はサーバー管理人に聞き、オーナーの OK の後。
  - 有効。出どころ: オーナー OK 10-25 (docs/org/analytics/notes/2026-10-25-www-redirect-rule.md、Bot の巡回が web の Worker の 6〜8 割)、docs/org/skins/README.md 5。確かめ: server/web/wrangler.jsonc の run_worker_first、Y-101。
- **Y-31 www の Bot 向けの 301 は Redirect Rules**: www.exiledesk.com → exiledesk.com の Bot 向けの 301 は Cloudflare の Redirect Rules (オーナーのダッシュボード) が返す。人は www でも 200 のまま、web.html の script でデータごと移る。workers.dev の 301 はやめた。
  - 有効。出どころ: オーナー OK 10-25 (同上)。確かめ: `node scripts/check-www-redirect.mjs` (本番を見るだけ)。
- **Y-32 シェアの短いリンクは D1 に置き、押した時だけサーバーへ**: スパムの運試しは `/s/<id>` (カード絵 `/og/`、表 shares)、シミュのレシピは `/r/<id>` (og:title の小さなページ、人は `/#recipe=` へ、表 recipe_shares)。同じ中身は同じ id、連打の制限は同じ表で数える (/r/ は同じ IP から 10 分に 20 本・全体 1 日 2,000 本)。KV は使わない。シミュの組み立ての共有そのものは `#recipe=` の URL でサーバーに置かない。
  - 有効。出どころ: 10-18 (0007_shares)・オーナー 10-26「シェア URL なっがい」(recipe-share.js)。確かめ: 本番で /r/<id>・/s/<id>・/og/ が 200。
- **Y-33 1 つ前の版の塊も一緒に置く**: 出す時は 1 つ前の版の /assets/ の塊も残して置く (`keep-prev-assets.mjs`)。開いたままのタブ・出した直後の古い web.html が前の塊を取っても 404 にしない。
  - 有効。出どころ: 10-25 最終チェック長 (案 docs/org/design/notes/2026-10-23-keep-prev-assets.md)。確かめ: 出した直後に前の版の塊を 1 つ取って 200 (Y-104)。
- **Y-34 サービスワーカーは送り物とシェアに触らない**: HTML は通信を先に (つながらない時は前の物)、/assets/・絵・音・フォントは一度使った物を取っておく、/boot.json は通信を先に (つながらない時は最後の値)。記録・要望の送り物と /s/・/og/ には触らない。
  - 有効。出どころ: オーナー 10-17「ホーム画面に追加」「オフラインでも動く」(public/sw.js)。確かめ: コードを読む。

### E. サーバー: 受け口 (server/live)

- **Y-40 開いた時にサーバーへ聞くのは /boot.json 1 回**: 画面が開いた時に live へ聞くのは /boot.json 1 回 (配信 + 相場 + 本日の訪問者)。ブラウザは次の相場の取り直し (毎時 0 分) の少し後まで覚える。45 分放置して戻った時だけ読み直す。
  - 有効。出どころ: 10-10 (前は開くたびに 3 回)、src/web/boot.ts・server/live/src/index.ts。確かめ: 棚卸しの数え方 (1 人 1 訪問 2〜4 回)。覚える時間の書き方の食い違いは「直す所」。
- **Y-41 /boot.json が取れなくても画面は動く**: /boot.json が取れない (枠を使い切った・落ちた) 時は、ビルドで画面と一緒に置いた相場の控え `/market-fallback.json` で動く。
  - 有効。出どころ: 10-10 (boot.ts)。確かめ: 1460 (手元の Worker は /boot.json が 404 → 控えで開く)、Y-103。
- **Y-42 外への問い合わせはサーバーの cron だけ**: 相場 (poe2scout) は 1 時間おき、配信 (YouTube / Twitch) は 8 時間おき、アイコンは 1 日 1 回、Discord の読みは毎朝 9:03。見る人の数で外への問い合わせを増やさない。ブラウザは poe2scout を直に叩かず、要る時は `/api/poe2scout/…` の中継 (端のキャッシュ 10 分)。
  - 有効。出どころ: オーナー 10-10「8 時間に 1 回でええな」「相場も 1 時間に 1 回」、10-24・10-26 (Discord)。確かめ: server/live/wrangler.jsonc の triggers、index.ts の scheduled。
- **Y-43 要望・バグは KV と D1 に期限付きで置く**: `POST /feedback` は KV `fb:` に 90 日 (同じ IP から 1 時間 10 件、bot よけの欄)、画像は D1 `fb_images` に 90 日 (毎朝の cron が消す、後から足せるのは送った端末だけ)、返事は KV `fbr:` に 180 日 (置き方は R-20)。送った端末は id を覚え、開いた時と 45 分後に `/feedback/replies` で聞く。
  - 有効。出どころ: オーナー 10-11・10-14 (メモ feedback-replies)。確かめ: `https://exiledesk-live.exiledesk.workers.dev/feedback/replies?ids=<id>`。
- **Y-44 異常は控えるだけ、すぐ Discord に送らない**: 相場の中継が落ちた・サーバーのエラーは KV `alertlog:` に控える (同じ物は 6 時間に 1 回、2 日残す)。毎朝の AI の評価と見解の材料にする。
  - 有効。出どころ: 10-26 (server/live/README.md)。確かめ: `scripts/pull-server-notes.mjs <日>`。
- **Y-45 #日報 は毎朝の AI の評価と見解の全文だけ**: 毎朝 9 時に予定のタスクが D1 の記録と異常・要望・Discord を読んで `docs/org/analytics/daily/<日>-ai.md` を書き、D1 `ai_review` に置き、Worker が #日報 へ流す (同じ日は 1 回)。数字だけの日報・記録の件数は流さない。
  - 有効。出どころ: オーナー 10-26「既定の報告はいらなくなった」。確かめ: `node scripts/post-ai-review.mjs <日> --dry`。
- **Y-46 Discord の Bot は読むだけ**: 毎朝 9:03 にサーバー (DISCORD_GUILD_ID) の見られるチャンネルの前回より後の書き込みを D1 `discord_daily` に 1 日 1 行。Bot は何も書かない。1 回 45 回まで叩く。
  - 有効。出どころ: オーナー 10-24 (10-21 の「作らない」を決め直し)・10-26「全部読んで」。確かめ: D1 の discord_daily。
- **Y-47 24 時間見張らない**: サーバーの見張りは毎朝 (使用量・異常・要望) と大きな確かめの前後だけ。常に回す見張り役は置かない。
  - 有効。出どころ: docs/org/analytics/README.md 5 (10-26)。確かめ: —。

### F. データの流れ

- **Y-50 出どころの順は E-01、作り直しは台本で**: ゲームのデータの出どころの順と食い違いの決め方は E-01〜04。同梱のデータは `scripts/` の作り直しの台本で作り (表は ARCHITECTURE.md「データの出どころ」)、手で直す値は直しのファイルに出どころ付きで置く (E-04)。データの直しの持ち主はジン部長。
  - 有効。出どころ: E-01〜04、ARCHITECTURE.md。確かめ: engine.md の確かめ方。
- **Y-51 相場はサーバーが取って全員に同じ物を配る**: poe2scout → live の cron (毎時) → KV `market` → /boot.json → 画面 (表示の通貨は `state/display-currency.ts`)。ビルドの時に控え `market-fallback.json` を作る。
  - 有効。出どころ: 10-07・10-10 (boot.ts・market.ts)。確かめ: /boot.json の market.at が 1 時間以内。
- **Y-52 外の API を試しに叩かない**: Claude・部長は調べ物で外の API (poe2scout・公式の取引所・poe.ninja) を叩かない。仕様の確かめで 1〜2 本だけなら先に断ってから。読むだけのページ (poe2db・wiki・ドキュメント) はよい。スキンの poe2db 取り直しは 1 日 1 回まで。
  - 有効。出どころ: 09-16 (取引所のレート制限が 25 分続きオーナーのアプリが止まった、メモ api-probing-policy)、docs/org/skins/README.md 2。確かめ: —。

### G. 記録と分析

- **Y-60 画面は logRecord を呼ぶだけ**: 記録は画面から `logRecord(kind, data)` (`src/utils/log-record.ts`) を呼ぶだけ。送るのは `log-sender.ts` が画面を離れる時にまとめて 1 回 (1 時間に 1 回まで)。操作の印 (`src/web/track.ts`) も同じ便。新しい画面・機能には分析に使える物を残す。
  - 有効。出どころ: オーナー 10-09「分析に使えるやつは全てログに、サーバー重くならない仕組みで」「アクセス最低限に」(メモ analytics-logs)。確かめ: 窓なしで `__exiledeskLog` を横取り。
- **Y-61 記録は D1、印は AE**: 記録は D1 `logs` に 1 まとまり 1 行 (中身はサーバーで解かない)、操作の印と画面のエラーは AE (3 か月)。本日の訪問者は Cloudflare の集計を 1 時間に 1 回数えて KV に置き、/boot.json に乗せる (来た人ごとに数えない)。
  - 有効。出どころ: 10-09・10-11・10-15 (index.ts の updateVisitors)。確かめ: `scripts/pull-logs.mjs <日>`、D1 は `wrangler d1 execute exiledesk-logs --remote`。
- **Y-62 人が分かる物を記録しない**: 記録に名前・IP・ログイン情報を入れない。cookie は使わない。端末の印 (uid) は端末の乱数。
  - 有効。出どころ: メモ analytics-logs の How to apply、server/live/README.md「cookie なし、名前や IP は無い」。確かめ: コードを読む (logRecord を呼ぶ所)。
- **Y-63 記録しない端末**: 端末で「記録しない」(Web の下の行・`?nolog=1`) をオンにすると `/forget` が D1 の今までの記録を消し、以後その端末の /log・/event を捨て、AE の集計からも外す。オーナーの端末は付け済み。
  - 有効。出どころ: オーナー 10-10「完全に消したい、情報としていらん」(forget.ts)。確かめ: `?nolog=1` で開いた時の 1 行の表示。
- **Y-64 確かめの記録を本番に混ぜない**: 開発版 (1440・1461) は記録を送らず、1460 は手元の Worker で捨てる。窓なしの Chrome (UA に HeadlessChrome) の /log・/event はサーバーが置かない。数え始めは `STATS_SINCE` (2026-10-09T11:15:51Z、前の分は消さずに数えない)。
  - 有効。出どころ: 10-09 (STATS_SINCE)・10-24 (窓なしを外す、preview-prod.mjs)。確かめ: index.ts の HeadlessChrome の行、Y-102。
- **Y-65 チュートリアルの手は記録しない**: チュートリアルの手は emu_use・履歴に入れず、`tutorial` {c: コース, e: start | clear} だけ残す。
  - 有効。出どころ: オーナー 10-18「チュートリアルの手はいらない」。確かめ: 窓なしで横取り。
- **Y-66 D1 は 3 GB で古い記録から整理する**: D1 の記録 (`logs`) は期間でなく大きさで持つ。毎朝 9:00 (JST、cron `0 0 * * *`) に `server/live/src/logs-prune.ts` が ① D1 の大きさ (問い合わせの `meta.size_after`) が 3 GB 以下なら何もしない ② 超えていたら中身 (logs の body + 要望の画像) を数え、3 GB 以下なら消さない (SQLite は消しても入れ物が縮まないため) ③ 中身も超えていたら logs を古い日から日ごと消して 2.7 GB まで下げる (今日の分は残す、5,000 行ずつ)。消したら異常の控え `記録の整理` に残す。シェア・記録しない端末の表は消さない。今の大きさは毎朝の材料 (`pull-server-notes.mjs` の `d1`) に出し、AI の評価と見解の終わりに 1 行。
  - 有効。出どころ: オーナー 10-28「ギガで管理だな３ＧＢ上限で設定あふっれたら古い奴から整理」(D1 の無料の上限は 5 GB)。10-28 の大きさは 79 MB。確かめ: 手元の SQLite で 4 つの場合 (入れ物が以下・入れ物だけ超え・中身も超え・今日だけ残る) を回した (サーバー管理人 10-28)。本番で消えた事はまだ無い。

### H. 環境・スイッチ・1 日の枠

- **Y-70 開発版は手元だけ**: 環境は 本番・1460・1461・1440 の 4 つ (② の表)。Cloudflare の上に開発版を置かない (web-dev は 10-24 に消した、作り直さない)。作る・確かめる・モンキーは 1440、ビルドに関わる物 (部品の分け方・先読み・古い塊・SW) と出す前は 1460 / 1461、オーナーが触るのは R-13。
  - 有効。出どころ: オーナー 10-23「開発版は絶対ローカル」・10-24 (メモ feedback-local-first)。確かめ: —。
- **Y-71 手元の環境は本番に書かない**: 1460 / 1461 は本番の wrangler.jsonc のまま workerd で立てるが、D1 は手元の写し、記録は捨てるか送らない。dist-web (本番に出す物) を触らない。
  - 有効。出どころ: 10-24 (docs/org/analytics/notes/2026-10-24-local-prod-env.md、scripts/preview-prod.mjs)。確かめ: Y-102。
  - 例外: 開発版 (1440・1461) から要望を送ると本番に届く (preview-prod.mjs「本番の /boot.json を読むだけ。要望を送ると本番に届く」)。有効。出どころ: オーナー 10-28「おｋ」(今のまま)。
- **Y-72 本番と開発版の分け目はスイッチ 1 か所**: 本番に出していない物の出し分けは `src/web/release-flags.ts` (FLAGS・RELEASED・`flag()`) 1 か所で、開発版の印は `DEV_BUILD` (`import.meta.env.DEV` か `VITE_DEV_PREVIEW=1`)。書き方は U-70〜73、開け方は R-02。
  - 有効。出どころ: オーナー 10-24「今本番に出てるやつそっくり出す」。確かめ: 1460 と 1461 の照らし (R-09)。広告の枠 (`utils/ads.ts` の AD_FRAMES) も DEV_BUILD を使う (10-28)。
- **Y-73 1 日の枠は Worker の回数で数え、操作で増やさない**: 枠に数えるのは Worker が動いた回数だけ (静的なファイルは数えない)。どの画面でも操作で Worker への取り物を増やさない (Y-01・Y-30・Y-40)。普段は枠の 1 割以下に収める。
  - 有効。出どころ: 10-23 (開発版だけで 11.9 万回、docs/org/analytics/notes/2026-10-23-workers-limit.md)・10-25 棚卸し (1 人 1 訪問 2〜4 回、月 10 万 PV でも 1 日 1 万弱)。確かめ: Cloudflare の集計 (毎朝、サーバー管理人)。
- **Y-74 枠の 5 割で先に知らせる**: Cloudflare の使用量 (Worker ごと・KV・D1) を毎朝と大きな確かめの前後に見て、上限の 5 割を超えそうならブラックへ先に知らせる。
  - 有効。出どころ: docs/org/analytics/README.md 2 (10-23 の 75% の知らせに誰も先に気付けなかった)。確かめ: —。
- **Y-75 本番の設定・お金の掛かる物はオーナーの OK の後**: 本番の Worker の設定・Cloudflare のダッシュボードの設定 (Redirect Rules など)・お金の掛かる設定は、オーナーの OK の後にだけ変える。
  - 有効。出どころ: docs/org/analytics/README.md 3。確かめ: —。

- **Y-76 Workers は無料のまま**: Workers の有料プラン (月 5 ドル) にしない。枠は作り (Y-30・Y-73) で守る。
  - 有効。出どころ: オーナー 10-28「無料で頑張る」(10-23 の案 2、docs/org/analytics/notes/2026-10-23-workers-limit.md)。確かめ: —。

### I. 英語・SEO

- **Y-80 言語は ?lang= で選んで覚える**: 言語は `?lang=en` / `?lang=ja` で選んで端末に覚える (`exiledesk.lang`)。初めての時はブラウザの言語 (ja 以外は英語)。アプリは日本語だけ。画面の言葉の決まりは U-60〜62。
  - 有効。出どころ: オーナー 10-10 (メモ web-english)、10-17 (?lang=)。確かめ: `src/i18n/lang.ts`、英語の画面で日本語 0 (U-83)。
- **Y-81 読み物の英語は /en/ の同じ道**: 読み物の英語は `/en/<同じ道>` に置き、hreflang で日英を結ぶ。英語のページからツールへは `/?lang=en&…`。canonical は exiledesk.com。
  - 有効。出どころ: 10-17 (/en/bases/)、10-22 (ブログ、docs/org/blog/README.md 6)。確かめ: dist-web の head。
- **Y-82 自動で作った一覧は noindex**: データから自動で作った一覧 (/bases/・/cosmetics/) は noindex (follow) にしてサイトマップから外す。ページとリンクは人が使う一覧として残す。index に戻すのはオーナーの OK の後。
  - 有効。出どころ: オーナー OK 10-22 (「有用性の低いコンテンツ」対策、build-seo-pages.mjs)、10-25 (コスメも同じ)。確かめ: dist-web の meta robots と sitemap.xml。
- **Y-83 検索の入口は人が書いた記事**: 検索に出すページはブログ・FAQ など人が書いて独自の数字のある物 (書き方は docs/org/blog/README.md)。巡回だけの Bot (SemrushBot) は robots.txt で止める。
  - 有効。出どころ: オーナー 10-22 (AdSense 不合格への答え)、10-25 (robots.txt)。確かめ: public/robots.txt、Search Console。

### J. セキュリティ

- **Y-90 鍵は wrangler の secret だけに置く**: 鍵・トークン (REFRESH_KEY・YOUTUBE_API_KEY・TWITCH_*・DISCORD_WEBHOOK・DISCORD_BOT_TOKEN・REPORT_WEBHOOK・CF_ANALYTICS_TOKEN) は wrangler の secret だけに置き、リポジトリ・手元のファイル・ログ・報告に書かない。手元に鍵を置かない。
  - 有効。出どころ: docs/org/analytics/README.md 4、メモ feedback-replies (鍵は手元に無い)。確かめ: —。見張りは無い (⑦ の 7)。
- **Y-91 鍵の要る作業は wrangler の login か一時の合言葉で**: 要望の一覧・返事・D1 の読み出しは `wrangler kv` / `wrangler d1 execute --remote` (オーナーの login) で行う。鍵の口を手元で使う時は一時の合言葉で `wrangler dev --remote` を立て、終わったら PID で止めて .dev.vars を消す。
  - 有効。出どころ: 10-12・10-17 (メモ feedback-replies)、メモ stop-processes-by-pid。確かめ: 8799 などの LISTEN が 0。
- **Y-92 CI に Cloudflare の鍵を置かない**: GitHub (CI) には Cloudflare の鍵を置かない。出すのは手元の `pnpm deploy:web` と server/live の deploy。
  - 有効。出どころ: 10-10 (静的なファイルで相場を配る案を鍵の要る所でやめた、boot.ts の頭)。確かめ: .github/workflows に Cloudflare の鍵が無い。
- **Y-93 鍵の口はヘッダーだけで受ける**: 鍵の要る口 (/feedback.json・/feedback/<id>.json・/feedback/image/・/feedback/reply・/logs/day・/refresh・/errors.json・/kv-usage.json) は `x-exiledesk-key` のヘッダーだけで受け、URL に鍵を載せない。
  - 有効。出どころ: 10-16 (`?key=` からヘッダーへ、メモ feedback-replies)。確かめ: index.ts の keyOk。
- **Y-94 人が書ける口は数と大きさを絞る**: 誰でも書ける口 (/feedback・画像・/r/new・/s/new) は IP ごとの数の制限と大きさの上限を持ち、bot よけを置く。
  - 有効。出どころ: 各ファイルの頭 (feedback 10-07〜14、recipe-share.js 10-26)。確かめ: コードを読む、tests/live-worker.test.ts。
- **Y-95 秘密でない設定は書いてよい**: アカウント id・Web Analytics のサイト・Discord のサーバー id・KV / D1 の id は秘密ではなく wrangler.jsonc の vars に書く。
  - 有効。出どころ: server/live/wrangler.jsonc の説明。確かめ: —。

## ④ 表示の決まり

- 画面の見た目・言葉は shared-ui.md (U-xx)、各画面は emu.md・sim-tree.md・tutorial.md。この紙が画面に出す物は無い。
- 外に出る物の文: 更新内容は R-11・R-12、要望の返事は R-20、シェアのカード (/s/・/og/・/r/ の og:title) は名前を G-05 で。

## ⑤ 不変条件 (どんな時も成り立つ事)

- **Y-100** 画面の操作 (打つ・回す・スパムシミュ・シミュ・チュートリアル) の間、Worker への取り物は 0 (共有を押した・要望を送った・離れる時の /log を除く)。
  - 確かめ: 窓なし Chrome でネットワークを数える (棚卸し 10-25、シミュ部長 23 本目の数え方)。常の見張りは無い (⑦ の 7)。
- **Y-101** トップ (/)・読み物・ads.txt・/assets/・絵は Worker を通らない (上限を越えても止まらない)。
  - 確かめ: server/web/wrangler.jsonc の run_worker_first、本番で叩いて Worker の回数が増えない (棚卸し 10-25 の数え方)。
- **Y-102** 1460・1461・1440 から本番の D1 (logs・shares)・AE に記録が届かない。
  - 確かめ: preview-prod.mjs の送り先、本番の D1 に手元の版の記録が無い。
- **Y-103** /boot.json が取れなくても画面は相場の控えで開いて動く。
  - 確かめ: 1460 (既定は /boot.json が 404)。
- **Y-104** 出した直後も、1 つ前の版の /assets/ の塊が 200。
  - 確かめ: 出した直後の確かめ (docs/org/analytics/notes/2026-10-24-local-prod-env.md の (4))。
- **Y-105** 本番のページを移るたびに screen の記録が 1 つ出る (Y-13)。
  - 確かめ: 窓なしで `__exiledeskLog` を横取り。

## ⑥ 新しい物を足す手順

- **新しいページ**: この紙と画面の紙に番号を足す (G-20) → `page.ts` に `?page=` と題・履歴 (デザイン部長) → 広告の枠・screen の記録・題の 3 つ (Y-13) → 枠の場所 (Y-20) → 英語 (U-60) → スイッチの下 (R-02)。
- **新しいサーバーの口**: 計算をサーバーに持たせない (Y-01)。Worker を通る道を足すならサーバー管理人に聞き、1 人あたりの回数を棚卸しの表で見積もる (Y-73) → 置き場は D1 の表 (migrations に足す、Y-02) → 誰でも書ける口なら数と大きさの制限 (Y-94)、鍵の口はヘッダー (Y-93) → tests/live-worker.test.ts → 本番の設定はオーナーの OK (Y-75)。
- **新しい記録**: 画面から `logRecord` を呼ぶだけ (Y-60)。人が分かる物を入れない (Y-62)。名前 (kind) をメモ analytics-logs と分析の台本 (`scripts/analyze-logs.py`) に足す。
- **新しい読み物**: ビルドの台本で作る (Y-15)、日英 (Y-81)、自動で作る一覧なら noindex (Y-82)、広告のコードは審査が通るまで置かない (Y-22)。
- **新しい外のデータ**: 取りに行くのはサーバーの cron か作り直しの台本だけ (Y-42・Y-50)、取りに行く回数を先に決める (Y-52)。

## ⑦ 残っている仮・未決 (オーナー確認待ち)

1. ~~/tree/ の短いリンク~~ — 決着 10-28 オーナー「消す」。live の `tree-share.ts`・`TREE_SHARE` を消し、D1 の表は `migrations/0012_drop_tree_shares.sql` で落とす (当てるのは次の server/live の出しの時)。短いリンクは web の `/r/` (Y-32)。
2. ~~D1 の記録を残す期間~~ — 決着 → Y-66 (10-28 オーナー「ギガで管理」、期間でなく 3 GB)。
3. ~~Workers の有料プラン~~ — 決着 → Y-76 (10-28 オーナー「無料で頑張る」)。
4. ~~ジェムコラプトのページの記録~~ — 決着 → Y-17 (10-28 オーナー、Web から外すので記録の形も要らない)。
5. (決着 10-28) **開発版の印の式が 2 か所** → `utils/ads.ts` の AD_FRAMES は `DEV_BUILD` を import して使い、自前の式は消した (デザイン部長、オーナーはブラック任せ)。Y-72。
6. ~~開発版から要望を送ると本番に届く~~ — 決着 → Y-71 の例外 (10-28 オーナー「おｋ」、今のまま)。
7. **見張りの無い不変条件** — 未決。Y-100・Y-102・Y-105 と鍵がリポジトリに無い事 (Y-90) を確かめる常の見張りが無い。作るかは最終チェック長・サーバー管理人と相談 (release.md)。10-28 オーナーはブラック任せ、後で最終チェック長と相談。
