// Web 版の Worker。ここを通るのはシェアの /s/*・/og/*・レシピの短い URL /r/*・消したベースのページ /bases/* (410) だけ (wrangler.jsonc の run_worker_first)。ページ・絵・JS は静的な置き場から直接
// 2026-10-25 トップ (/・/index.html・/web.html) を外した (Bot の巡回が 1 日の枠の大半を食っていた。notes/2026-10-25-www-redirect-rule.md)。
// 前はここで旧 URL (web.exiledesk.workers.dev)・www のクローラーにだけ 301 を返していた。www の 301 は Cloudflare の Redirect Rules (ダッシュボード) へ、
// workers.dev の 301 はやめた (アドレス変更は 10-11 に済み、canonical は exiledesk.com)。人は今までどおり web.html の script でデータごと移る
import { ogCard } from "./og-card.js";
import { recipeShare } from "./recipe-share.js";
import { basesGone } from "./gone.js";

export default {
  async fetch(request, env, ctx) {
    // カオススパムの自慢のカード (/s/spam・/og/spam.png。og-card.js)
    const og = await ogCard(request, env, ctx);
    if (og) return og;
    // シミュのレシピの短い URL (/r/new・/r/<id>。recipe-share.js、2026-10-26)
    const recipe = await recipeShare(request, env, ctx);
    if (recipe) return recipe;
    // 消したベースのページ (/bases/・/en/bases/ の下、2026-10-31) は 410 (gone.js)
    const gone = basesGone(request);
    if (gone) return gone;
    return env.ASSETS.fetch(request);
  },
};
