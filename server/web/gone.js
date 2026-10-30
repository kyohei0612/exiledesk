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
