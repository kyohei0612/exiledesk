# ブログの記事の元 (書き手 = 解析君など)

1. 1 本 = 1 ファイル `src/data/blog/<slug>.ja.md` (英語は同じ slug で `<slug>.en.md`、無ければ日本語だけ)。slug は英小文字・数字・`-` (URL になる: /blog/<slug>/、/en/blog/<slug>/)。
2. 頭に `---` で囲んで 1 行 1 項目: `title` (題)・`description` (検索と OGP の説明、120 字くらい)・`date` (YYYY-MM-DD)・`updated` (直した日、任意)・`tags` (`,` 区切り)・`tree` (「このツリーで試す」の行き先、例 `/?page=sim-tree&base=Gold%20Ring`)・`craft` (「クラフト台で打つ」の行き先、例 `/?base=Gold%20Ring`)・`image` (OGP の絵、img/ の中の名前)・`draft: true` (下書き、開発版だけ)。
3. 本文で使える書き方はこれだけ: `##`〜`####` の見出し、段落、`-` / `1.` の箇条書き、`|` の表 (2 行目は `|---|`、右寄せは `---:`)、`> ` の引用、`**太字**`、`` `コード` ``、`[文](URL)`、`![説明](img/foo.png)` (1 行だけなら図と説明)。
4. 絵は `src/data/blog/img/` に置き、本文では `img/<名前>` と書く (/blog/img/ に写る)。スクリーンショットは幅 1,400px くらいまで。目を引く絵 (OGP) は 1200×630 を置いて頭に `image: img/<名前>` (無ければ本文の 1 枚目の図、それも無ければ題を描いた絵を自動で作る)。
4b. 部品 (`:::種類` の行で始めて `:::` だけの行で閉じる。中は普通の書き方。見本は sample.ja.md に全部ある):
   - 箱: `:::summary` (まとめ、金)・`:::note` (注意、赤)・`:::tip` (ヒント、緑)。見出しを変える時は `:::tip 小技`。
   - グラフ (JS 無しの SVG): `:::chart bar 題` か `:::chart line 題`、中は `unit: %`・`labels: a, b, c`・`<系列の名前>: 1, 2, 3` (系列は何本でも、数字は台本の値)。自分で描いた SVG は `<svg …>` から `</svg>` までをそのまま置ける。表は文字のまま (グラフにしない)。
   - 引用の頭でも書ける (同じ部品): `> [!まとめ]`・`> [!ヒント]`・`> [!注意]`・`> [!めたん] happy`・`> [!ずんだもん]` (英語 `> [!SUMMARY]`・`> [!TIP]`・`> [!NOTE]`・`> [!METAN]`・`> [!ZUNDAMON]`)。2 行目からの `> ` の行が中身 (箇条書き可)。
   - キャラの吹き出し: `:::metan <表情>` (左)・`:::zundamon <表情>` (右)、表情は normal・happy・surprised・troubled。絵は video/assets/characters/ の立ち絵から書き出した顔 (src/data/blog/chars/、作り直しは `video/.venv/Scripts/python scripts/build-blog-chars.py`)。使った記事の下にクレジットが自動で付く。
5. 数字は台本で出し、台本の場所と出どころ (poe2db・CoE・エンジンで何回) を本文に書く。用語は poe2db の名前 (英語は src/i18n/GLOSSARY.md)。
6. 置いたら `node scripts/build-blog-pages.mjs dist-web-dev --drafts` で dist-web-dev/blog/ に出て確かめられる。開発版には `pnpm deploy:web-dev` で入る (本番の build:web には入れていない、オーナーが記事を読んでから)。
7. 一覧 (/blog/)・サイトマップ・OGP (絵は image → 本文の 1 枚目の図 → 題を描いた絵)・記事の構造化データ (Article)・シェア (X・Reddit・コピー)・開いた数とシェアの数の記録 (D1 の screen "blog:<slug>"・blog_share)・クラフト台の右の列の「新しい記事」(新しい順に 3 本) は台本が自動で作る。記事の下のコメント欄は置き場だけ (これから)。
8. 色 (記事のページは白い紙面、2026-10-22): 本文 #2b2b2b・補足 #6b6b6b・線 #e6e6e6・リンク #b5651d。箱 まとめ 地 #fbf5e6 縁 #c8922a / 注意 地 #fdeeee 縁 #d9534f / ヒント 地 #ecf6ee 縁 #4e9a5e。図 (SVG) は地を塗らず (白)、系列は #c8922a #2f7fc1 #3c9a4e #c2507e #7b5cc4、軸の字 #8a8a8a、目盛りの線 #ececec。img/ の .svg は `![説明](img/foo.svg)` でそのまま出る。見本 (slug sample) は一覧・関連・サイトマップに出ない。
