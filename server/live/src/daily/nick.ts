/**
 * ニックネーム = アカウント (D-51・D-52)。名前の決まりは src/views/daily/daily-api.ts の nickError と同じ (直す時は両方)。
 * 引き継ぎコード (12 字) は決めた時に 1 度だけ返し、サーバーはハッシュだけ持つ。記録は名前でなく nick_id で持つ。
 * スタート・提出・札の選び・投稿は nickId + code で本人を見る (D-56 の「合言葉の控え」)
 */
export const NICK_MAX = 12;
const RESERVED = /exiledesk|運営|admin|公式|official/;
/** 悪口の表 (D-20・D-51)。名前と一言の両方で見る */
const BAD = /死ね|しね|氏ね|殺す|ころす|くそ|クソ|ゴミ|カス|きもい|キモい|fuck|shit|bitch|cunt|nigg|retard/i;
export const hasBadWord = (s: string): boolean => BAD.test(s.normalize("NFKC"));
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 1 つの IP から 1 時間に作れる名前の数 (Y-94) */
const NICK_PER_HOUR = 5;

export type NickError = "empty" | "long" | "url" | "reserved" | "bad" | "taken" | "wrong" | "busy";
export type Nick = { id: string; name: string; code: string };

export const nameKey = (s: string): string => s.normalize("NFKC").trim().toLowerCase();

function nameError(name: string): NickError | null {
  const k = nameKey(name);
  if (!k || !/[\p{L}\p{N}]/u.test(k)) return "empty";
  if ([...name.trim()].length > NICK_MAX) return "long";
  if (/https?:|www\.|\.[a-z]{2,}\//.test(k)) return "url";
  if (RESERVED.test(k)) return "reserved";
  if (hasBadWord(k)) return "bad";
  return null;
}

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha = async (s: string): Promise<string> => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const passHash = (code: string): Promise<string> => sha(`exiledesk-daily-code:${code.trim().toUpperCase()}`);
export const ipHash = async (ip: string): Promise<string> => (await sha(`exiledesk-daily-ip:${ip}`)).slice(0, 16);

function newCode(): string {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(a, (x) => CODE_ABC[x % CODE_ABC.length]).join("");
}

/** POST /daily/nick。code が無ければ決める (コードはここで 1 度だけ)、あれば戻す */
export async function nickPost(db: D1Database, body: { name?: unknown; code?: unknown }, ip: string, now: number): Promise<Nick | { error: NickError }> {
  const name = typeof body.name === "string" ? body.name.slice(0, 64) : "";
  const k = nameKey(name);
  if (typeof body.code === "string") {
    const row = await db.prepare("SELECT id, name, pass_hash FROM daily_nicks WHERE name_key = ?").bind(k).first<{ id: string; name: string; pass_hash: string }>();
    if (!row || row.pass_hash !== (await passHash(body.code))) return { error: "wrong" };
    return { id: row.id, name: row.name, code: body.code.trim().toUpperCase() };
  }
  const e = nameError(name);
  if (e) return { error: e };
  const ih = await ipHash(ip);
  const made = await db.prepare("SELECT count(*) AS n FROM daily_nicks WHERE ip_hash = ? AND created > ?").bind(ih, now - 3600_000).first<{ n: number }>();
  if ((made?.n ?? 0) >= NICK_PER_HOUR) return { error: "busy" };
  const nick: Nick = { id: `n${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`, name: name.trim(), code: newCode() };
  const r = await db
    .prepare("INSERT OR IGNORE INTO daily_nicks (id, name, name_key, pass_hash, created, ip_hash) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(nick.id, nick.name, k, await passHash(nick.code), now, ih)
    .run();
  return r.meta.changes ? nick : { error: "taken" };
}

/** 本人か (nickId + code)。違えば null */
export async function authNick(db: D1Database, nickId: unknown, code: unknown): Promise<{ id: string; name: string; title_pick: string | null } | null> {
  if (typeof nickId !== "string" || typeof code !== "string" || nickId.length > 40 || code.length > 40) return null;
  const row = await db.prepare("SELECT id, name, pass_hash, title_pick FROM daily_nicks WHERE id = ?").bind(nickId).first<{ id: string; name: string; pass_hash: string; title_pick: string | null }>();
  return row && row.pass_hash === (await passHash(code)) ? { id: row.id, name: row.name, title_pick: row.title_pick } : null;
}
