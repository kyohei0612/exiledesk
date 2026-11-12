/**
 * リンクの番号 (設計図 D-52b)。名前を持つ端末が 6 桁の数字を出し (POST /daily/link/new)、もう 1 台がそれを打つと同じ名前になる (POST /daily/link/use)。
 * オーナー 11-12「数字打たすか。PCIDに紐づいた奴で」「おｋ数字オンリーでおｋ」(QR は作らない)。引き継ぎコードの手入力 (D-52) はそのまま。
 * サーバーは引き継ぎコードのハッシュしか持たないので、番号が生きている間 (長くて 10 分) だけコードそのものを置く。使った・切れた・出し直した時に消す。
 * 表がまだ無いサーバーでは { error: "off" } を返す (出す順でどちらが先でも落ちない)
 */
import { authNick, ipHash, type Nick } from "./nick";

/** 番号が生きている時間 */
export const LINK_TTL = 10 * 60_000;
/** 1 つの名前が 1 時間に出せる番号の数 */
const NEW_PER_HOUR = 10;
/** 打ち間違いの止め: 同じ IP から 10 分に 5 回まで、全体で 10 分に 200 回まで (総当たりの止め。6 桁 = 100 万通り) */
const MISS_WINDOW = 10 * 60_000, MISS_PER_IP = 5, MISS_ALL = 200;
const HOUR = 3600_000;

export type LinkError = "nick" | "busy" | "wrong" | "off";
type Body = Record<string, unknown>;

function newNum(): string {
  const a = crypto.getRandomValues(new Uint32Array(1));
  return String(a[0]! % 1_000_000).padStart(6, "0");
}

/** 切れた番号のコードを消し、古い行を片付ける (使う時のついで) */
async function sweep(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("UPDATE daily_links SET dead = 1, code = '' WHERE dead = 0 AND until <= ?").bind(now),
    db.prepare("DELETE FROM daily_links WHERE made_at < ?").bind(now - HOUR),
    db.prepare("DELETE FROM daily_link_miss WHERE at < ?").bind(now - MISS_WINDOW),
  ]);
}

/** POST /daily/link/new: 番号を出す。出せるのはその名前の合言葉を持つ端末だけ。前の番号は消える */
export async function linkNew(db: D1Database, b: Body, ip: string, now: number): Promise<{ num: string; until: number } | { error: LinkError }> {
  try {
    const nick = await authNick(db, b.nickId, b.code);
    if (!nick) return { error: "nick" };
    await sweep(db, now);
    const made = await db.prepare("SELECT count(*) AS n FROM daily_links WHERE nick_id = ? AND made_at > ?").bind(nick.id, now - HOUR).first<{ n: number }>();
    if ((made?.n ?? 0) >= NEW_PER_HOUR) return { error: "busy" };
    await db.prepare("UPDATE daily_links SET dead = 1, code = '' WHERE nick_id = ? AND dead = 0").bind(nick.id).run();
    const code = String(b.code).trim().toUpperCase(), until = now + LINK_TTL, ih = await ipHash(ip);
    for (let i = 0; i < 6; i++) {
      const num = newNum();
      // 生きている同じ番号が無い時だけ置く (ほかの名前の番号と重ならない)
      const r = await db
        .prepare("INSERT INTO daily_links (num, nick_id, code, made_at, until, ip_hash, dead) SELECT ?1, ?2, ?3, ?4, ?5, ?6, 0 WHERE NOT EXISTS (SELECT 1 FROM daily_links WHERE num = ?1 AND dead = 0)")
        .bind(num, nick.id, code, now, until, ih)
        .run();
      if (r.meta.changes) return { num, until };
    }
    return { error: "busy" };
  } catch {
    return { error: "off" };
  }
}

/** POST /daily/link/use: 番号を打つ。当たればその名前 (id・名前・引き継ぎコード) を返し、番号は消える */
export async function linkUse(db: D1Database, b: Body, ip: string, now: number): Promise<Nick | { error: LinkError }> {
  try {
    const num = typeof b.num === "string" ? b.num.normalize("NFKC").replace(/[\s-]/g, "") : "";
    if (!/^\d{6}$/.test(num)) return { error: "wrong" };
    await sweep(db, now);
    const ih = await ipHash(ip);
    const miss = await db.prepare("SELECT count(*) AS n, sum(CASE WHEN ip_hash = ? THEN 1 ELSE 0 END) AS mine FROM daily_link_miss WHERE at > ?").bind(ih, now - MISS_WINDOW).first<{ n: number; mine: number | null }>();
    if ((miss?.mine ?? 0) >= MISS_PER_IP || (miss?.n ?? 0) >= MISS_ALL) return { error: "busy" };
    const row = await db.prepare("SELECT nick_id, code FROM daily_links WHERE num = ? AND dead = 0 AND until > ?").bind(num, now).first<{ nick_id: string; code: string }>();
    const taken = row ? (await db.prepare("UPDATE daily_links SET dead = 1, code = '' WHERE num = ? AND dead = 0 AND nick_id = ?").bind(num, row.nick_id).run()).meta.changes : 0;
    // 置いた後に名前の合言葉が変わっていれば通さない (今は変える口が無いが、置いたコードをそのまま信じない)
    const nick = row && taken ? await authNick(db, row.nick_id, row.code) : null;
    if (!row || !nick) {
      await db.prepare("INSERT INTO daily_link_miss (ip_hash, at) VALUES (?, ?)").bind(ih, now).run();
      return { error: "wrong" };
    }
    return { id: nick.id, name: nick.name, code: row.code };
  } catch {
    return { error: "off" };
  }
}
