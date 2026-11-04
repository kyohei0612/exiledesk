/**
 * デイリーの口の振り分け (設計図 D-56・D-59)。index.ts の handle から呼ぶ。デイリーの道でなければ null。
 * 相場の写し (お題の prices) は KV の "market" (1 時間おきの cron が書く物) をそのまま使う
 */
import type { Env } from "../types";
import { dailyBox, dailyBoxStatus, dailyJson, dailyStart, dailySubmit, dailyTitle } from "./api";
import { nickPost } from "./nick";
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
    const res = json(await dailyJson(db, now, await prices()), 200, { "cache-control": `public, max-age=${DAILY_TTL}` });
    if (cache) ctx.waitUntil(cache.put(key, res.clone()));
    return res;
  }
  if (req.method === "GET" && p === "/daily/box.json") return json(await dailyBoxStatus(db, (url.searchParams.get("ids") ?? "").split(",")), 200, { "cache-control": "no-store" });
  if (req.method === "GET" && p === "/daily/roll.json") {
    if (!keyOk()) return json({ error: "key が違う" }, 403);
    const day = url.searchParams.get("day");
    if (day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "day=YYYY-MM-DD" }, 400);
    return json(await rollJson(db, now, day), 200, { "cache-control": "no-store" });
  }
  if (req.method !== "POST") return json({ error: "無い道" }, 404);
  if (Number(req.headers.get("content-length") ?? 0) > 64 * 1024) return json({ error: "large" }, 413);
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
    case "/daily/submit":
      return json(await dailySubmit(db, body, now));
    case "/daily/title":
      return json(await dailyTitle(db, body));
    case "/daily/box":
      return json(await dailyBox(db, body, ip, now));
    case "/daily/topic":
      if (!keyOk()) return json({ error: "key が違う" }, 403);
      return json(await rollPost(db, body, await prices()));
  }
  return json({ error: "無い道" }, 404);
}
