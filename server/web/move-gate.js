// 旧 URL (web.exiledesk.workers.dev) の検索エンジン向けの引っ越しの知らせ (2026-10-11)。
// 人は web.html の頭の script で、作業中のデータごと exiledesk.com へ移る (localStorage はページを開かないと読めないので 301 にはできない)。
// 検索エンジンのクローラーにだけ 301 を返して「住所が変わった」と伝える (行き先は人と同じ)。
// ここを通るのは HTML のページだけ (wrangler.jsonc の run_worker_first)。絵や JS は通さないので、問い合わせは増えない
import { ogCard } from "./og-card.js";

const OLD_HOST = "web.exiledesk.workers.dev";
const NEW_ORIGIN = "https://exiledesk.com";
// Search Console の確かめは Googlebot 以外の名前 (Google-InspectionTool / Google-Site-Verification / GoogleOther) で来るので google も (2026-10-11 アドレス変更が「取得できません」で落ちた)
const BOT = /google|bot|crawl|spider|slurp|bingbot|duckduckbot|yandex|baidu|facebookexternalhit|twitterbot|discordbot|linkedinbot|embedly|preview/i;

export default {
  async fetch(request, env, ctx) {
    // カオススパムの自慢のカード (/s/spam・/og/spam.png。og-card.js)
    const og = await ogCard(request, env, ctx);
    if (og) return og;
    const url = new URL(request.url);
    // 今のブラウザはページを開く時に必ず Sec-Fetch-Mode を付ける。付いていない = プログラムからの取得 (名前を名乗らないクローラーも) なので 301
    const program = !request.headers.get("sec-fetch-mode");
    if (url.hostname === OLD_HOST && (program || BOT.test(request.headers.get("user-agent") ?? ""))) {
      return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
    }
    return env.ASSETS.fetch(request);
  },
};
