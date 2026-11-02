/**
 * account.ts — 共通アカウント (引き継ぎコード、docs/spec/account.md A-xx、2026-11-03 案)。
 * vars ACCOUNT が "on" の時だけ開く (A-51)。本番の wrangler.jsonc には書かない = 本番では全部 404。
 *
 *   POST /account/new     { name?, label? }               → { id, name, code, token }   作る (コードは 1 度だけ、A-13)
 *   POST /account/link    { code, label? }                → { id, name, token }         コードで別の端末をつなぐ (A-11 の数の制限)
 *   POST /account/code    { t, dropOthers? }              → { code }                    作り直す (前のコードは効かない、A-14)
 *   POST /account/sync    { t, since, put: Item[] }       → { rev, items: Item[] }      上げると下ろすを 1 回で (A-41〜43)
 *   POST /account/name    { t, name }                     → { name }                    名前を決める・替える (デイリー、A-60)
 *   POST /account/devices { t }                           → { devices }                 つないだ端末の一覧 (設定の窓)
 *   POST /account/unlink  { t }                           → { ok }                      この端末を外す
 *   POST /account/reissue { id }  ヘッダー x-exiledesk-key → { code }                    オーナーの復元 (A-72)
 * 本人は端末の札 t で見る。サーバーはコード・札の HMAC だけを持つ (A-12)
 */
import { alert } from "./monitor";
import type { Env } from "./types";

type Json = (body: unknown, status?: number) => Response;
export interface Item { kind: string; id: string; updatedAt: number; deleted?: boolean; name?: string; body?: string }

/** 読み違えやすい 0 O 1 I L U を外した 30 字 (A-10) */
export const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LEN = 12;
const KINDS = new Set(["recipe"]);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const MAX_DEVICES = 10;
const MAX_ITEM = 64 * 1024, MAX_ITEMS = 300, MAX_TOTAL = 2 * 1024 * 1024, MAX_PUT = 50;
const FAIL_PER_IP = 5, FAIL_ALL = 500;
const RESERVED = ["exiledesk", "運営", "admin", "管理", "公式", "official", "moderator"];

function randomFrom(chars: string, n: number): string {
  const out: string[] = [];
  const lim = 256 - (256 % chars.length);
  while (out.length < n) for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) if (b < lim && out.length < n) out.push(chars[b % chars.length]!);
  return out.join("");
}
const newCode = (): string => randomFrom(CODE_CHARS, CODE_LEN);
const newToken = (): string => randomFrom("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", 32);
export const showCode = (c: string): string => c.match(/.{1,4}/g)!.join("-");
/** 入れた字 → 12 字 (空白・- を外し大文字に)。使わない字が混じれば null (A-10) */
export function readCode(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const c = s.replace(/[\s-]/g, "").toUpperCase();
  return c.length === CODE_LEN && [...c].every((ch) => CODE_CHARS.includes(ch)) ? c : null;
}

async function hmac(env: Env, s: string): Promise<string> {
  // 手元の dev は仮の鍵 (本番は wrangler の secret、Y-90)
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ACCOUNT_PEPPER ?? "dev-only-pepper"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const ipHead = async (ip: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip)))].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");

/** UA → 「iPhone Safari」程度 (A-02、UA そのものは持たない) */
export function deviceLabel(ua: string): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "端末";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${os} ${br}` : os;
}

/** そろえた名前 (D-52: 全角半角・大文字小文字) */
export const nameKey = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
/** 名前の決まり (D-51)。通れば null、断る時は理由 */
export function nameError(s: unknown): string | null {
  if (typeof s !== "string" || !s.trim()) return "名前が空";
  const t = s.trim();
  if ([...t].length > 12) return "12 字まで";
  if (/https?:|:\/\/|www\.|\.(com|net|jp|io)\b/i.test(t)) return "URL は使えない";
  if (!/[\p{L}\p{N}]/u.test(t)) return "記号だけは使えない";
  const k = nameKey(t);
  if (RESERVED.some((r) => k.includes(nameKey(r)))) return "運営に見える名前は使えない";
  return null;
}

async function body(req: Request): Promise<Record<string, unknown> | null> {
  try { const b = (await req.json()) as unknown; return b && typeof b === "object" ? (b as Record<string, unknown>) : null; } catch { return null; }
}

/** 端末の札 → account_id。外された端末は null */
async function who(env: Env, db: D1Database, t: unknown, now: number): Promise<string | null> {
  if (typeof t !== "string" || !TOKEN_RE.test(t)) return null;
  const h = await hmac(env, `t:${t}`);
  const row = await db.prepare("SELECT account_id FROM account_devices WHERE token_hash = ?").bind(h).first<{ account_id: string }>();
  if (!row) return null;
  await db.prepare("UPDATE account_devices SET seen = ? WHERE token_hash = ?").bind(now, h).run();
  return row.account_id;
}
async function addDevice(env: Env, db: D1Database, id: string, label: string, now: number): Promise<string> {
  const token = newToken();
  await db.prepare("INSERT INTO account_devices (token_hash, account_id, label, created, seen) VALUES (?, ?, ?, ?, ?)").bind(await hmac(env, `t:${token}`), id, label, now, now).run();
  return token;
}
/** 新しいコードを置いて返す (前のコードはここで効かなくなる、A-14) */
async function putCode(env: Env, db: D1Database, id: string, now: number): Promise<string> {
  const code = newCode();
  await db.prepare("UPDATE accounts SET code_hash = ?, code_at = ? WHERE id = ?").bind(await hmac(env, `c:${code}`), now, id).run();
  return showCode(code);
}

/** 外れの数 (A-11)。止める時は理由、通す時は null */
async function triesBlocked(db: D1Database, ip: string, hour: number): Promise<string | null> {
  const mine = await db.prepare("SELECT n FROM account_tries WHERE ip = ? AND hour = ?").bind(ip, hour).first<{ n: number }>();
  if ((mine?.n ?? 0) >= FAIL_PER_IP) return "コードの外れが多すぎ (1 時間に 5 回まで)";
  const all = await db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM account_tries WHERE hour = ?").bind(hour).first<{ n: number }>();
  if ((all?.n ?? 0) >= FAIL_ALL) return "いまはコードを受け付けていない (少し後で)";
  return null;
}
async function addFail(env: Env, db: D1Database, ip: string, hour: number): Promise<void> {
  await db.batch([
    db.prepare("INSERT INTO account_tries (ip, hour, n) VALUES (?, ?, 1) ON CONFLICT (ip, hour) DO UPDATE SET n = n + 1").bind(ip, hour),
    db.prepare("DELETE FROM account_tries WHERE hour < ?").bind(hour - 24),
  ]);
  const all = await db.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM account_tries WHERE hour = ?").bind(hour).first<{ n: number }>();
  if ((all?.n ?? 0) === FAIL_ALL) await alert(env, "アカウントのコード", `コードの外れが 1 時間に ${FAIL_ALL} 回 (止めた)`);
}

function parseItem(x: unknown): Item | null {
  const i = x as Partial<Item> | null;
  if (!i || typeof i !== "object" || typeof i.kind !== "string" || !KINDS.has(i.kind) || typeof i.id !== "string" || !ID_RE.test(i.id) || typeof i.updatedAt !== "number" || !Number.isFinite(i.updatedAt)) return null;
  if (i.deleted) return { kind: i.kind, id: i.id, updatedAt: i.updatedAt, deleted: true };
  if (typeof i.body !== "string" || i.body.length > MAX_ITEM) return null;
  return { kind: i.kind, id: i.id, updatedAt: i.updatedAt, name: typeof i.name === "string" ? i.name.slice(0, 60) : undefined, body: i.body };
}

async function sync(db: D1Database, id: string, b: Record<string, unknown>, now: number, json: Json): Promise<Response> {
  const put = Array.isArray(b.put) ? b.put : [];
  if (put.length > MAX_PUT) return json({ error: `1 回に上げるのは ${MAX_PUT} 件まで` }, 413);
  const items = put.map(parseItem);
  if (items.some((i) => !i)) return json({ error: "保存物の形が違う" }, 400);
  if (items.length) {
    const size = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(body)), 0) AS bytes FROM account_items WHERE account_id = ? AND deleted = 0").bind(id).first<{ n: number; bytes: number }>();
    const add = (items as Item[]).reduce((s, i) => s + (i.body?.length ?? 0), 0);
    if ((size?.n ?? 0) + items.length > MAX_ITEMS + MAX_PUT || (size?.bytes ?? 0) + add > MAX_TOTAL) return json({ error: "保存物が多すぎ (300 件・2MB まで)。端末の物は消えていない" }, 413);
    // 新しい方が勝つ (A-41)。古い物を上げても置き換わらない
    await db.batch((items as Item[]).map((i) => db.prepare(
      `INSERT INTO account_items (account_id, kind, item_id, updated, rev, deleted, name, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (account_id, kind, item_id) DO UPDATE SET updated = excluded.updated, rev = excluded.rev, deleted = excluded.deleted, name = excluded.name, body = excluded.body
       WHERE excluded.updated > account_items.updated`,
    ).bind(id, i.kind, i.id, i.updatedAt, now, i.deleted ? 1 : 0, i.name ?? null, i.deleted ? null : i.body!)));
  }
  const since = typeof b.since === "number" ? b.since : 0;
  const rows = await db.prepare("SELECT kind, item_id, updated, deleted, name, body FROM account_items WHERE account_id = ? AND rev > ? ORDER BY rev LIMIT 400")
    .bind(id, since).all<{ kind: string; item_id: string; updated: number; deleted: number; name: string | null; body: string | null }>();
  await db.prepare("UPDATE accounts SET synced = ? WHERE id = ?").bind(now, id).run();
  // 同じ時刻に別の端末が書いた物を落とさないよう 1 秒重ねる (同じ物が 2 回来ても端末の側で同じ結果)
  return json({ rev: now - 1000, items: (rows.results ?? []).map((r) => ({ kind: r.kind, id: r.item_id, updatedAt: r.updated, ...(r.deleted ? { deleted: true } : { name: r.name ?? undefined, body: r.body ?? "" }) })) });
}

/** /account/* を受ける。ほかの道なら null (index.ts が続きを見る) */
export async function handleAccount(req: Request, env: Env, url: URL, json: Json, keyOk: (env: Env, req: Request) => boolean, now = Date.now()): Promise<Response | null> {
  if (!url.pathname.startsWith("/account/")) return null;
  if (env.ACCOUNT !== "on" || !env.LOGS) return json({ error: "not found" }, 404);
  if (req.method !== "POST") return json({ error: "POST だけ" }, 405);
  const db = env.LOGS;
  const b = await body(req);
  if (!b) return json({ error: "JSON ではない" }, 400);
  const label = deviceLabel(req.headers.get("user-agent") ?? "");
  switch (url.pathname) {
    case "/account/new": {
      let name: string | null = null;
      if (b.name != null) {
        const e = nameError(b.name);
        if (e) return json({ error: e }, 400);
        name = (b.name as string).trim();
      }
      const id = randomFrom("abcdefghijkmnpqrstuvwxyz23456789", 16), code = newCode();
      try {
        await db.prepare("INSERT INTO accounts (id, name, name_key, code_hash, created, code_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id, name, name ? nameKey(name) : null, await hmac(env, `c:${code}`), now, now).run();
      } catch { return json({ error: "その名前はもう使われている" }, 409); }
      return json({ id, name, code: showCode(code), token: await addDevice(env, db, id, label, now) });
    }
    case "/account/link": {
      const ip = await ipHead(req.headers.get("cf-connecting-ip") ?? "?"), hour = Math.floor(now / 3600e3);
      const blocked = await triesBlocked(db, ip, hour);
      if (blocked) return json({ error: blocked }, 429);
      const code = readCode(b.code);
      const acc = code ? await db.prepare("SELECT id, name FROM accounts WHERE code_hash = ?").bind(await hmac(env, `c:${code}`)).first<{ id: string; name: string | null }>() : null;
      if (!acc) { await addFail(env, db, ip, hour); return json({ error: code ? "そのコードは見つからない" : "コードは 12 字 (0 O 1 I L U は使わない)" }, 404); }
      const n = await db.prepare("SELECT COUNT(*) AS n FROM account_devices WHERE account_id = ?").bind(acc.id).first<{ n: number }>();
      if ((n?.n ?? 0) >= MAX_DEVICES) return json({ error: `つなげる端末は ${MAX_DEVICES} 台まで。つないだ端末を外してから` }, 409);
      return json({ id: acc.id, name: acc.name, token: await addDevice(env, db, acc.id, label, now) });
    }
    case "/account/reissue": {
      if (!keyOk(env, req)) return json({ error: "鍵が違う" }, 401);
      const id = typeof b.id === "string" ? b.id : "";
      if (!(await db.prepare("SELECT id FROM accounts WHERE id = ?").bind(id).first())) return json({ error: "無いアカウント" }, 404);
      return json({ code: await putCode(env, db, id, now) });
    }
  }
  const id = await who(env, db, b.t, now);
  if (!id) return json({ error: "この端末は外されている", gone: true }, 401);
  switch (url.pathname) {
    case "/account/sync": return sync(db, id, b, now, json);
    case "/account/code": {
      if (b.dropOthers === true) await db.prepare("DELETE FROM account_devices WHERE account_id = ? AND token_hash != ?").bind(id, await hmac(env, `t:${b.t as string}`)).run();
      return json({ code: await putCode(env, db, id, now) });
    }
    case "/account/name": {
      const e = nameError(b.name);
      if (e) return json({ error: e }, 400);
      const name = (b.name as string).trim();
      try { await db.prepare("UPDATE accounts SET name = ?, name_key = ? WHERE id = ?").bind(name, nameKey(name), id).run(); } catch { return json({ error: "その名前はもう使われている" }, 409); }
      return json({ name });
    }
    case "/account/devices": {
      const me = await hmac(env, `t:${b.t as string}`);
      const r = await db.prepare("SELECT token_hash, label, created, seen FROM account_devices WHERE account_id = ? ORDER BY created").bind(id).all<{ token_hash: string; label: string; created: number; seen: number }>();
      const acc = await db.prepare("SELECT name, created, code_at FROM accounts WHERE id = ?").bind(id).first<{ name: string | null; created: number; code_at: number }>();
      return json({ name: acc?.name ?? null, created: acc?.created, codeAt: acc?.code_at, devices: (r.results ?? []).map((d) => ({ label: d.label, created: d.created, seen: d.seen, me: d.token_hash === me })) });
    }
    case "/account/unlink": {
      await db.prepare("DELETE FROM account_devices WHERE token_hash = ?").bind(await hmac(env, `t:${b.t as string}`)).run();
      return json({ ok: true });
    }
  }
  return json({ error: "not found" }, 404);
}
