# ブログの記事の元 (書き手 = 解析君など)

1. 1 本 = 1 ファイル `src/data/blog/<slug>.ja.md` (英語は同じ slug で `<slug>.en.md`、無ければ日本語だけ)。slug は英小文字・数字・`-` (URL になる: /blog/<slug>/、/en/blog/<slug>/)。
2. 頭に `---` で囲んで 1 行 1 項目: `title` (題)・`description` (検索と OGP の説明、120 字くらい)・`date` (YYYY-MM-DD)・`updated` (直した日、任意)・`tags` (`,` 区切り)・`tree` (「このツリーで試す」の行き先、例 `/?page=sim-tree&base=Gold%20Ring`)・`craft` (「クラフト台で打つ」の行き先、例 `/?base=Gold%20Ring`)・`image` (OGP の絵、img/ の中の名前)・`draft: true` (下書き、開発版だけ)。
3. 本文で使える書き方はこれだけ: `##`〜`####` の見出し、段落、`-` / `1.` の箇条書き、`|` の表 (2 行目は `|---|`、右寄せは `---:`)、`> ` の引用、`**太字**`、`` `コード` ``、`[文](URL)`、`![説明](img/foo.png)` (1 行だけなら図と説明)。
4. 絵は `src/data/blog/img/` に置き、本文では `img/<名前>` と書く (/blog/img/ に写る)。
5. 数字は台本で出し、台本の場所と出どころ (poe2db・CoE・エンジンで何回) を本文に書く。用語は poe2db の名前 (英語は src/i18n/GLOSSARY.md)。
6. 置いたら `node scripts/build-blog-pages.mjs dist-web-dev --drafts` で dist-web-dev/blog/ に出て確かめられる。開発版には `pnpm deploy:web-dev` で入る (本番の build:web には入れていない、オーナーが記事を読んでから)。
7. 一覧 (/blog/)・サイトマップ・OGP (絵は image → 本文の 1 枚目の図 → 題を描いた絵)・記事の構造化データ (Article)・シェア (X・Reddit・コピー)・開いた数とシェアの数の記録 (D1 の screen "blog:<slug>"・blog_share)・クラフト台の右の列の「新しい記事」(新しい順に 3 本) は台本が自動で作る。記事の下のコメント欄は置き場だけ (これから)。
