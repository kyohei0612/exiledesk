/**
 * デイリーの口の振り分け (設計図 D-56・D-59)。index.ts の handle から呼ぶ。デイリーの道でなければ null。
 * 相場の写し (お題の prices) は KV の "market" (1 時間おきの cron が書く物) をそのまま使う
 */
import type { Env } from "../types";
import { dailyBox, dailyBoxStatus, dailyGiveup, dailyJson, dailyMine, dailyRecipe, dailyStart, dailySubmit, dailyTitle } from "./api";
import { notifyBox } from "./box-notify";
import { dailyLive, pruneDailyLive } from "./live";
import { nickPost } from "./nick";
import { dailyView } from "./views";
import { dayNoOf, noOfId } from "./time";
import { rollJson, rollPost } from "./roll";

type Json = (body: unknown, status?: number, extra?: Record<string, string>) => Response;
/** GET /daily.json の端のキャッシュ (D-56)。今日の伏せは誰にでも同じなので全員で 1 つ */
const DAILY_TTL = 60;

export async function dailyRoute(req: Request, env: Env, url: URL, ctx: ExecutionContext, json: Json, keyOk: () => boolean, marketKey: string): Promise<Response | null> {
  const p = url.pathname;
  if (!p.startsWith("/daily")) return null;
  if (p === "/daily/fetch.json") return null; // 週の取得の結果 (index.ts、ninja/job.ts)
  const db = env.LOGS;
  if (!db) return json({ error: "置き場が無い" }, 500);
  const now = Date.now();
  const prices = () => env.LIVE.get(marketKey);

  if (req.method === "GET" && p === "/daily.json") {
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    const key = new Request(`${url.origin}/daily.json`, { method: "GET" });
    const hit = cache ? await cache.match(key) : undefined;
    if (hit) return hit;
    const body = (await dailyJson(db, now, await prices())) as { week: Array<{ today: boolean; t: unknown }> };
    // 今日のお題がまだ無い時 (16:00 の台本の前) は覚えない。出た後の形だけ 60 秒覚える
    const ready = body.week.some((d) => d.today && d.t);
    const res = json(body, 200, { "cache-control": ready ? `public, max-age=${DAILY_TTL}` : "no-store" });
    if (cache && ready) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  if (req.method === "GET" && p === "/daily/recipe.json") {
    const out = await dailyRecipe(db, url.searchParams.get("id") ?? "", url.searchParams.get("name") ?? "", now);
    // 締めた日の行は変わらない (称号・検算で外れるのは締めの時だけ) ので 1 日覚えさせる。今日の分は安い提出で替わるので 60 秒、誤りは覚えない
    const closed = (noOfId(url.searchParams.get("id") ?? "") ?? Infinity) < dayNoOf(now);
    return json(out, "error" in out ? 400 : 200, { "cache-control": "error" in out ? "no-store" : `public, max-age=${closed ? 86400 : 60}` });
  }
  if (req.method === "GET" && p === "/daily/box.json") return json(await dailyBoxStatus(db, (url.searchParams.get("ids") ?? "").split(",")), 200, { "cache-control": "no-store" });
  if (req.method === "GET" && p === "/daily/roll.json") {
    if (!keyOk()) return json({ error: "key が違う" }, 403);
    const day = url.searchParams.get("day");
    if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "day=YYYY-MM-DD" }, 400);
    return json(await rollJson(db, now, day), 200, { "cache-control": "no-store" });
  }
  if (req.method !== "POST") return json({ error: "無い道" }, 404);
  // 誰でも書ける口は 64KB まで。鍵つきの /daily/topic は週の型 (300 件ほどで 100KB) を一度に書くので 1MB まで (11-06)
  if (Number(req.headers.get("content-length") ?? 0) > (p === "/daily/topic" ? 1024 : 64) * 1024) return json({ error: "large" }, 413);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    return json({ error: "JSON ではない" }, 400);
  }
  const ip = req.headers.get("cf-connecting-ip") ?? "?";
  switch (p) {
    case "/daily/nick":
      return json(await nickPost(db, body, ip, now));
    case "/daily/start":
      return json(await dailyStart(db, body, now, await prices()));
    case "/daily/mine":
      return json(await dailyMine(db, body));
    case "/daily/submit":
      return json(await dailySubmit(db, body, now));
    case "/daily/giveup":
      return json(await dailyGiveup(db, body, now));
    case "/daily/title":
      return json(await dailyTitle(db, body));
    case "/daily/box": {
      const out = await dailyBox(db, body, ip, now);
      if ("error" in out) return json(out);
      // 届いた投稿を Discord に 1 件 (D-20b)。行き先はクラフト箱のチャンネル (秘密 BOX_WEBHOOK)、無ければ要望と同じ。投稿した人の名前は画面には返さない
      // 絵の元 (card) があれば品の絵を付ける (D-20c)。絵を作る先は配信のサーバー (手元の試しだけ BOX_CARD_ORIGIN で替える)
      const { by, card, ...pub } = out;
      ctx.waitUntil(notifyBox((env as { BOX_WEBHOOK?: string }).BOX_WEBHOOK || env.DISCORD_WEBHOOK, pub, by, fetch, card, (env as { BOX_CARD_ORIGIN?: string }).BOX_CARD_ORIGIN || undefined).then(() => undefined));
      return json(pub);
    }
    case "/daily/live":
      return json(await dailyLive(db, body, now));
    case "/daily/view":
      // 順位のレシピを開いた記録 (D-50e)。表がまだ無いサーバーでは置かずに返す (画面は返りを見ない)
      return json(await dailyView(db, body, ip, now).catch(() => ({ ok: false })));
    case "/daily/topic":
      if (!keyOk()) return json({ error: "key が違う" }, 403);
      {
        const out = await rollPost(db, body, await prices());
        // お題・締めを書いたら、覚えていた GET /daily.json を捨てる (16:00 直後に前の形が 60 秒残らないように)
        const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
        if (cache) ctx.waitUntil(cache.delete(new Request(`${url.origin}/daily.json`, { method: "GET" })).then(() => undefined));
        // 16:00 の台本のついでに、30 日より前の挑戦中の動作の列を空にする (D-57b。表がまだ無いサーバーでは何もしない)
        ctx.waitUntil(pruneDailyLive(db, now).catch(() => undefined));
        return json(out);
      }
  }
  return json({ error: "無い道" }, 404);
}
