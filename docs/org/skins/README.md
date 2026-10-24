# スキン部長

PoE2 で使える PoE1 のスキン (コスメティック) の一覧のページの持ち主 (オーナー 10-25「スキン部長で」)。持ち物はページの中身・データ・絵。入口 (上のタブ「コスメティック」)・page.ts・ヘッダー・共通の部品はデザイン部長に頼む。

## 決まり (docs/org/dev/README.md の決まりが先)
1. 一覧は poe2db を元にし、頭に「ゲームでの動作は保証しない」を出す (オーナー「DB 調べって話と責任持てませんって話で」)。
2. データは src/data/mtx-poe1-in-poe2.json だけを読む。作り直しは `node scripts/build-mtx-web.mjs` (poe2db の取り直しは --fetch、1 日 1 回まで。メモ api-probing-policy)。
3. 名前・種類の英語は poe2db の表記だけ。英語名の無い種類は英語の画面で「Other」にまとめる (推測で訳さない、メモ feedback-no-guessed-terms)。
4. 絵は public/mtx-art/<a>.webp を 1 枚ずつ、遅れて読む (loading=lazy)。Web のビルドには一覧に出す分だけ残す (vite.web.config.ts)。
5. 1 日 10 万の枠: 静的な絵は数えない (サーバー管理人 10-25)。ページで Worker を通る取り物を足さない。入口を /web.html 以外の新しい道にする時はサーバー管理人に聞く。
6. 開発版だけ (release-flags の skins)。本番はオーナーの OK の後。広告ありきの別ページ・両脇に縦長の枠 (メモ ads-page-model)。
7. 日英セット (?lang=en)。確かめは手元 1440 で PC 1660×860・スマホ・英語を撮る。

## 地図
- ページ src/views/skins/ (SkinsPage.vue = 一覧・検索・種類の絞り込み、skins.ts = データの読み込みと poe2db の道)。WebApp.vue が読む (デザイン部長)。
- 入口・道: src/web/page.ts の skinsPage・openSkinsPage・?page=skins、ヘッダーのタブ (WebApp.vue)、スイッチ src/web/release-flags.ts の skins、記録 track.ts の page:skins。どれもデザイン部長の持ち物。
- データ src/data/mtx-poe1-in-poe2.json (1,966 件、poe2db で裏の取れた ok 1,942。形 kinds{id:{ja,en|null}}・items[{en,ja,k,slug|null,ok,a?}])、作り直し scripts/build-mtx-web.mjs (元はアプリの src/services/mtx/mtx.json、poe2db の写し data-cache/poe2db-mtx)。10-25 にジン部長 9 本目から受け取った。
- 絵 public/mtx-art/ (アプリの物 6,316 枚、使うのは 1,930 枚・約 8 MB)。SW は mtx-art を取っておく (public/sw.js の FILE_RE)。
- SEO の静的なページ scripts/build-cosmetics-pages.mjs → /cosmetics/・/en/cosmetics/ (子ページは 20 件以上の種類、英語は poe2db に種類の英語名がある物だけ。既定 noindex、--index で index + サイトマップ)。見た目は build-seo-pages.mjs (共通) の写し。
- 確かめの台本: 共有メモ side-session-notes/local_b4352604-…/skins1/ (skins-check.mjs = ?page=skins、cosmetics-check.mjs = 静的なページを配って撮る)。
- アプリのスキン画面 src/views/mtx/ (凍結、触らない)。
