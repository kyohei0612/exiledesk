/**
 * デイリーの順位のレシピを開いた記録 (設計図 D-50e)。POST /daily/view: 順位の行を押してレシピが開けた時に、画面が 1 回だけ送る。
 * レシピを返す口 (GET /daily/recipe.json) は端で覚えられて受け口に届かないので、数えるのはこの別の便。
 * 残すのは お題 × 見られた人 × 見た人 の 1 行 (最初と最後の時刻・回数)。見た人 = 名前の合言葉が通ればその名前、無ければ IP の印 (名前なし)。
 * 自分のレシピを自分で開いた分は置かない。画面に返すのは行の数だけ (GET /daily.json の順位の views)。誰が見たかを読む口は無い (scripts/daily-views.mjs が D1 を直に読む)
 */
import { authNick, ipHash, nameKey } from "./nick";
import { dayNoOf, noOfId, SOLVE_RATE } from "./time";

/** 1 人が同じレシピを開き直した回数の上限 (これより先は数えない) */
const OPENS_MAX = 999;

type Body = Record<string, unknown>;

export async function dailyView(db: D1Database, b: Body, ip: string, now: number): Promise<unknown> {
  const id = typeof b.id === "string" ? b.id : "", name = typeof b.name === "string" ? b.name : "";
  const no = noOfId(id);
  if (no == null || no > dayNoOf(now) || !name || name.length > 40) return { error: "id" };
  // 見られた人 = その日の順位に載る提出がある名前だけ (レシピを返す口と同じ条件)
  const owner = await db
    .prepare(`SELECT t.nick_id FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id WHERE t.topic_id = ? AND n.name_key = ? AND t.rate >= ${SOLVE_RATE} AND t.cost IS NOT NULL AND (t.checked IS NULL OR t.checked >= 0)`)
    .bind(id, nameKey(name))
    .first<{ nick_id: string }>();
  if (!owner) return { error: "none" };
  const nick = b.nickId != null ? await authNick(db, b.nickId, b.code) : null;
  if (nick?.id === owner.nick_id) return { ok: false, self: true };
  const viewer = nick ? nick.id : `a${await ipHash(ip)}`;
  await db
    .prepare(
      `INSERT INTO daily_views (topic_id, owner_nick_id, viewer, first_at, at, n) VALUES (?1, ?2, ?3, ?4, ?4, 1)
       ON CONFLICT (topic_id, owner_nick_id, viewer) DO UPDATE SET at = excluded.at, n = daily_views.n + 1 WHERE daily_views.n < ${OPENS_MAX}`,
    )
    .bind(id, owner.nick_id, viewer, now)
    .run();
  return { ok: true };
}

/** その日の順位の人ごとの「開いた人の数」(名前 → 数)。表がまだ無いサーバー・読めない時は空 (順位は今までどおり出す) */
export async function viewCounts(db: D1Database, topicId: string): Promise<Map<string, number>> {
  try {
    const { results } = await db
      .prepare("SELECT n.name, count(*) AS views FROM daily_views v JOIN daily_nicks n ON n.id = v.owner_nick_id WHERE v.topic_id = ? GROUP BY v.owner_nick_id")
      .bind(topicId)
      .all<{ name: string; views: number }>();
    return new Map(results.map((r) => [r.name, r.views]));
  } catch {
    return new Map();
  }
}
