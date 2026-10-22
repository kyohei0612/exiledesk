/**
 * シミュレーターのツリーのレシピの短い URL (2026-10-22 オーナー)。画面 (シミュ部長) は exiledesk.com/?page=sim-tree&r=<id> で開く。
 *   POST /tree/new  … 本文 = 木の JSON (オブジェクト、32KB まで) → { id, name }。同じ中身は同じ id (SHA-256 から 8 文字)
 *   GET  /tree/<id> … { id, name, at, tree } (中身は変わらないので 1 年キャッシュ)
 * 置き場は D1 の tree_shares (migrations/0008)。連打の制限は同じ表で数える (同じ IP から 10 分に 20 本まで、KV は使わない)
 */
import type { Env } from "./types";

export const TREE_MAX_BYTES = 32 * 1024;
const LIMIT_N = 20, LIMIT_MS = 10 * 60 * 1000;
const ID_RE = /^[0-9A-Za-z]{8}$/;
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
type Json = (body: unknown, status?: number, extra?: Record<string, string>) => Response;

const sha = async (s: string): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
/** 中身 → 8 文字の id (SHA-256 の頭 8 バイトを 62 進で) */
export async function treeIdOf(body: string): Promise<string> {
  const h = await sha(body);
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(h[i]!);
  let out = "";
  for (let i = 0; i < 8; i++) { out += B62[Number(n % 62n)]; n /= 62n; }
  return out;
}
const ipKey = async (ip: string): Promise<string> => [...(await sha(`tree:${ip}`)).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
/** 木の名前 (X のカードに出す用)。name / title のどちらか、80 文字まで */
const nameOf = (v: Record<string, unknown>): string | null => { const n = v.name ?? v.title; return typeof n === "string" && n.trim() ? n.trim().slice(0, 80) : null; };

/** /tree/… の入口。当てはまらなければ null */
export async function treeShare(req: Request, env: Env, url: URL, json: Json, now = Date.now()): Promise<Response | null> {
  if (url.pathname === "/tree/new" && req.method === "POST") {
    if (!env.LOGS) return json({ error: "置き場が無い" }, 500);
    const text = await req.text();
    if (new TextEncoder().encode(text).length > TREE_MAX_BYTES) return json({ error: "大きすぎる" }, 413);
    let v: unknown;
    try { v = JSON.parse(text); } catch { return json({ error: "JSON ではない" }, 400); }
    if (!v || typeof v !== "object" || Array.isArray(v)) return json({ error: "形が違う" }, 400);
    // 空白の違いで別の id にならないよう、並べ直した文字で数える
    const body = JSON.stringify(v);
    const id = await treeIdOf(body), name = nameOf(v as Record<string, unknown>);
    // もうある木は数えずに返す (同じ人が何回押しても行は増えない)
    if (await env.LOGS.prepare("SELECT 1 FROM tree_shares WHERE id = ?").bind(id).first()) return json({ id, name });
    const ip = await ipKey(req.headers.get("cf-connecting-ip") ?? "?");
    const r = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM tree_shares WHERE ip = ? AND at > ?").bind(ip, now - LIMIT_MS).first<{ n: number }>();
    if ((r?.n ?? 0) >= LIMIT_N) return json({ error: "少し待ってからもう一度" }, 429);
    await env.LOGS.prepare("INSERT OR IGNORE INTO tree_shares (id, body, name, at, ip) VALUES (?, ?, ?, ?, ?)").bind(id, body, name, now, ip).run();
    return json({ id, name });
  }
  const m = url.pathname.match(/^\/tree\/([^/]+)$/);
  if (m && req.method === "GET") {
    if (!ID_RE.test(m[1]!)) return json({ error: "id の形が違う" }, 400);
    if (!env.LOGS) return json({ error: "置き場が無い" }, 500);
    const row = await env.LOGS.prepare("SELECT body, name, at FROM tree_shares WHERE id = ?").bind(m[1]).first<{ body: string; name: string | null; at: number }>();
    if (!row) return json({ error: "無い" }, 404, { "cache-control": "no-store" });
    // 中身は JSON の文字のまま差し込む (解き直さない)
    return new Response(`{"id":${JSON.stringify(m[1])},"name":${JSON.stringify(row.name)},"at":${row.at},"tree":${row.body}}`, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=31536000, immutable", "access-control-allow-origin": "*" },
    });
  }
  return null;
}
