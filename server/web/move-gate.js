// 旧 URL (web.exiledesk.workers.dev) の検索エンジン向けの引っ越しの知らせ (2026-10-11)。
// 人は web.html の頭の script で、作業中のデータごと exiledesk.com へ移る (localStorage はページを開かないと読めないので 301 にはできない)。
// 検索エンジンのクローラーにだけ 301 を返して「住所が変わった」と伝える (行き先は人と同じ)。
// ここを通るのは HTML のページだけ (wrangler.jsonc の run_worker_first)。絵や JS は通さないので、問い合わせは増えない
const OLD_HOST = "web.exiledesk.workers.dev";
const NEW_ORIGIN = "https://exiledesk.com";
const BOT = /bot|crawl|spider|slurp|googlebot|bingbot|duckduckbot|yandex|baidu|facebookexternalhit|twitterbot|discordbot|linkedinbot|embedly|preview/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === OLD_HOST && BOT.test(request.headers.get("user-agent") ?? "")) {
      return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
    }
    return env.ASSETS.fetch(request);
  },
};
