// 消したベースのページ (/bases/・/en/bases/ の下) に 410 Gone を返す (2026-10-31、system.md Y-84)。
// 前は build-seo-pages.mjs が作った noindex の自動ページ 1,576 枚 (日英)。「有用性の低いコンテンツ」の見直しで消し、Search Console の削除で接頭辞ごと隠す。
// robots.txt では止めない (止めると Googlebot が 410 を見に来られず、索引から落ちるのが遅れる。リサーチ 10-31)。
// 中身は小さい案内だけ (人が古いリンクから来た時にクラフト台へ戻れるように)。Worker の枠を食うのは Bot の巡回が残っている間だけ
const BASES = /^\/(en\/)?bases(\/|$)/;

export function basesGone(request) {
  const url = new URL(request.url);
  const m = url.pathname.match(BASES);
  if (!m) return null;
  const en = Boolean(m[1]);
  const body = en
    ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page removed | ExileDesk</title></head><body style="margin:0;padding:40px 16px;background:#0e0c09;color:#e8dfcf;font:15px/1.8 system-ui,sans-serif"><main style="max-width:640px;margin:0 auto"><h1 style="font-size:20px;color:#e0b062">This page has been removed</h1><p>The per-base pages are gone. You can still pick any base on the crafting bench.</p><p><a href="/?lang=en" style="color:#f0c878">Open the crafting bench</a> · <a href="/en/blog/" style="color:#f0c878">Blog</a></p></main></body></html>`
    : `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>このページは削除しました | ExileDesk</title></head><body style="margin:0;padding:40px 16px;background:#0e0c09;color:#e8dfcf;font:15px/1.8 system-ui,sans-serif"><main style="max-width:640px;margin:0 auto"><h1 style="font-size:20px;color:#e0b062">このページは削除しました</h1><p>ベースごとのページは無くなりました。ベースはクラフト台でいつでも選べます。</p><p><a href="/" style="color:#f0c878">クラフト台を開く</a> · <a href="/blog/" style="color:#f0c878">ブログ</a></p></main></body></html>`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "public, max-age=86400" },
  });
}

// 記事の整理 (2026-11-09 オーナー「出して」、表は docs/org/blog/notes/2026-11-09-article-review.md)。
// 消した記事は 410、ほかとまとめる記事は受け皿へ 301 (日英とも同じ slug)。一時サイトマップ (build-seo-pages.mjs の sitemap-removed.xml) もこの 2 つを読む。
// ここに足したら wrangler.jsonc の run_worker_first にも /blog/<slug>・/blog/<slug>/*・/en/blog/<slug>・/en/blog/<slug>/* を足す (静的な置き場は 410・301 を返せない)
export const BLOG_GONE = ["crafting-calculator-mistakes", "x-share-bug", "desecration-lords-tag-audit", "crafting-simulator-no-exceptions"];
export const BLOG_MOVED = {
  "chaos-reroll-vs-restart": "are-omens-worth-it",
  "crafting-order-cost": "are-omens-worth-it",
  "optimal-move-vs-intuition": "are-omens-worth-it",
  "coe-desecrate-no-handler": "desecration-weights",
  "catalyst-types": "mana-ring-craft", // 指輪の触媒の記事 (ring-catalyst-order) を出したらそちらへ付け替える
  "quality-rounding-down": "sanctify-quality-order",
  "kolrs-hunt-gloves": "es-gloves-greater-exalt",
  "poe2db-cast-speed-weight": "custom-mod-weights",
};
const BLOG = /^\/(en\/)?blog\/([a-z0-9-]+)\/?$/;

export function blogGone(request) {
  const url = new URL(request.url);
  const m = url.pathname.match(BLOG);
  if (!m) return null;
  const en = Boolean(m[1]);
  const to = BLOG_MOVED[m[2]];
  if (to) return Response.redirect(`${url.origin}${en ? "/en" : ""}/blog/${to}/`, 301);
  if (!BLOG_GONE.includes(m[2])) return null;
  const body = en
    ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Article removed | ExileDesk</title></head><body style="margin:0;padding:40px 16px;background:#fff;color:#2b2b2b;font:16px/1.8 system-ui,sans-serif"><main style="max-width:640px;margin:0 auto"><h1 style="font-size:20px">This article has been removed</h1><p><a href="/en/blog/" style="color:#b5651d">See all articles</a> · <a href="/?lang=en" style="color:#b5651d">Open the crafting bench</a></p></main></body></html>`
    : `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>この記事は削除しました | ExileDesk</title></head><body style="margin:0;padding:40px 16px;background:#fff;color:#2b2b2b;font:16px/1.8 system-ui,sans-serif"><main style="max-width:640px;margin:0 auto"><h1 style="font-size:20px">この記事は削除しました</h1><p><a href="/blog/" style="color:#b5651d">記事の一覧へ</a> · <a href="/" style="color:#b5651d">クラフト台を開く</a></p></main></body></html>`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "public, max-age=86400" },
  });
}
