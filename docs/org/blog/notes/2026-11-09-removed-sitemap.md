# 消した住所の一時サイトマップ (案、2026-11-09 記事編集長)

頼み: ブラック 69 経由のオーナー 11-09「レベル低いページ消したいよね濃くしないとあかんでしょ」「たてて」。メモ web-ads-domain-plan の 11-09「早める案 = 消した住所だけの一時サイトマップを出して送る」の下ごしらえ。**本番の deploy はしていない。出すのはブラック経由のオーナーの OK の後。**

## なぜ
- Search Console の登録済み 1,120 のほとんどは 10-31 に 410 で消したベースのページ (/bases/・/en/bases/)。Google の記録が古いまま残っている。
- 10-31 にオーナーが「削除」(接頭辞で隠す) を送ったが、隠すのは約 6 か月の一時の物で、登録済みの数は減らない。410 を Google が見に来た時に初めて落ちる。
- 消した住所を lastmod 付きのサイトマップで渡すと、Googlebot が「変わった」と見て早めに見に来る (よく使われるやり方。公式に早さの約束は無い)。

## 作る物 (サーバーの持ち場、記事編集長は触れない = G-41)
`scripts/build-seo-pages.mjs` (サーバー) の末尾、`console.log(\`sitemap (…` の行の後に下を足す。今の作りと同じ `rows`・`slug` から住所を作る (手で写さない、Y-15)。出力先は `dist-web/sitemap-removed.xml` (生成物なのでリポジトリには入れない)。robots.txt には書かない (送るのはオーナーの手。robots に書くと消えた後も読まれ続ける)。

```js
// 消した住所だけの一時サイトマップ (2026-11-09、Y-84 の追記)。410 のベースのページを lastmod 付きで並べ、Search Console から送って早く見に来させる。
// /bases/ が登録済みから抜けたら (目安 4〜6 週) false に戻し、Search Console からも外す
const REMOVED_SITEMAP = true;
const REMOVED_AT = "2026-10-31"; // ベースのページを 410 にした日 (v0.1.644)
// ほかに消した読み物 (404)。記事 4 本は 10-21 に消した (配信・動画が元)、掲示板の決まりは 10-16 に外した
const REMOVED_OTHER = [
  ...["ai-crafting-odds-vs-feel", "crafting-questions-from-streams", "essence-of-the-abyss-mark", "gold-ring-video-decoded"].flatMap((s) => [`/blog/${s}/`, `/en/blog/${s}/`]),
  "/board-rules",
];
if (REMOVED_SITEMAP) {
  const gone = [...new Set([
    ...["", "/en"].flatMap((p) => [`${p}/bases/`, ...rows.map((b) => `${p}/bases/${slug(b.en)}`)]),
    ...REMOVED_OTHER,
  ])];
  writeFileSync(resolve(OUT, "sitemap-removed.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${gone.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${REMOVED_AT}</lastmod></url>`).join("\n")}
</urlset>
`);
  console.log(`消した住所の一時サイトマップ ${gone.length} URL → ${OUT}/sitemap-removed.xml`);
}
```

設計図は Y-84 の本文の終わりに 1 文足す案: 「消した住所を早く落とすため、build-seo-pages.mjs は一時サイトマップ `/sitemap-removed.xml` (消したベースのページと消した読み物、lastmod は消した日) も書く。robots.txt には書かず、オーナーが Search Console で送る。/bases/ が登録済みから抜けたら外す。」

## 見本 (記事編集長の手元で同じデータから作った)
- 1,585 URL = ベース 787 × 日英 + 一覧 2 (/bases/・/en/bases/) + ほか 9 (消した記事 4 本 × 日英・/board-rules)。10-31 の記録の 1,576 枚より 9 多いのは、その後ベースのデータが増えた分と見る (多い分も 410 になるので害は無い)。
- 抜き取り 10 件 (/bases/ と /en/bases/ の各所) を本番に聞いて全部 410。消した記事・/board-rules は 404。
- ファイルの見本は共有メモ `local_0cfcaf51…/progress/sitemap-removed-sample.xml` (リポジトリには入れない)。
- 拾えなかった物: Search Console の 404 の 390 件は書き出しに URL の一覧が無く、どの住所か分からない。知っている消した住所 (上) のほか、/tree/<id> (10-28 に消した短いリンク、サイトマップに載せた事は無い) は個別の id が分からないので入れない。

## 出した後のオーナーの手順 (Search Console)
前の段: サーバーの持ち場が上を足して出し、`https://exiledesk.com/sitemap-removed.xml` を開くと住所の並んだ字が出る事をブラックが確かめてから。
1. https://search.google.com/search-console を開く。左上の名前が exiledesk.com になっているのを見る (違えば押して選ぶ)。
2. 左の列の「インデックス作成」の下の「サイトマップ」を押す。
3. 上の「新しいサイトマップの追加」の欄に `sitemap-removed.xml` と入れて「送信」を押す (欄の前に `https://exiledesk.com/` が出ていない時は `https://exiledesk.com/sitemap-removed.xml` を全部入れる)。
4. 「サイトマップを送信しました」の窓が出るので「OK」。下の「送信されたサイトマップ」に sitemap-removed.xml の行が増え、状態が「成功しました」、検出されたページが 1,585 前後になる (すぐ「取得できませんでした」と出ても、数時間〜1 日で変わる事がある)。
5. 1〜2 週後: 左の「ページ」を押し、上の「すべての既知のページ」を「sitemap-removed.xml」に変える。「見つかりませんでした (404)」の数が増えて、登録済みが減っていれば効いている (410 も 404 と同じ所に数えられる)。
### 週 1 回の見方 (AdSense の出し直しの合図、ブラック 69 経由のオーナー 11-09「1100薄いなら落ちるやろまた」)
**出し直しの条件: Search Console の登録済みが今の頁数 (77 前後) 近くまで減り、記事を濃くし終えるまで AdSense の審査を出し直さない。**
- 毎週 1 回 (例: 月曜の朝)、左の列の「インデックス作成」の下の「ページ」を押す。
- 上の大きい 2 つの数のうち、緑の「インデックスに登録済み」の数を控える (11-09 は 1,120)。その下の折れ線で、緑の線が下がっていれば効いている。
- 同じ画面の上の「すべての既知のページ」を押して「sitemap-removed.xml」に変えると、消した住所だけの数になる。ここの「インデックスに登録済み」が 0 に近づけば、消した住所の片付けが進んでいる。
- 「すべての既知のページ」に戻して、登録済みが 77 前後 (その時のサイトマップの頁数) 近くになったら、記事の濃くする作業の終わりと合わせて、ブラックに「出し直してよいか」を聞く。

6. 登録済みから /bases/ がほぼ消えたら (目安 4〜6 週): 2 の画面で sitemap-removed.xml の行を押し、右上の「︙」→「サイトマップを削除」。そのあとサーバーの持ち場が REMOVED_SITEMAP を false にして出す。
