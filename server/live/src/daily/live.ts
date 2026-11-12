/**
 * デイリーの挑戦中の控え (設計図 D-57b)。POST /daily/live: 挑戦中の人の最新の木と動作の列を置く (本人の合言葉つき)。
 * 木 = 提出の recipe と同じ形 (exiledesk-recipe/1) を上書き、動作 = 1 行 1 つの JSON を後ろへ足す。読む口は無い (見るのはこちらだけ = scripts/daily-live.mjs が D1 を直に読む)。
 * 受けるのは挑戦の間だけ (スタートの後、提出・諦め・時間切れ + 30 秒の前)。画面は 15 秒まとめて 1 回 + 離れる時に 1 回 (Y-100 の例外 D-57)
 */
import { authNick } from "./nick";
import { SUBMIT_GRACE_MS, TIME_LIMIT_MS } from "./time";

/** 木は提出と同じ 32KB まで。動作は 1 回 16KB・200 個まで、1 人 1 日の合計 256KB まで (超えた分は捨てる)。1 人 1 日 600 回まで */
const TREE_MAX = 32 * 1024;
const ACTS_BATCH_MAX = 16 * 1024;
const ACTS_BATCH_N = 200;
const ACTS_TOTAL_MAX = 256 * 1024;
const SENDS_MAX = 600;
/** 動作の列を残す日数 (過ぎたら毎朝の cron が空にする。木は残す) */
const ACTS_KEEP_DAYS = 30;

type Body = Record<string, unknown>;

/** 動作の 1 つを 1 行の JSON に (物でない・大きすぎる物は捨てる) */
function actLines(acts: unknown): string {
  if (!Array.isArray(acts)) return "";
  let out = "";
  for (const a of acts.slice(0, ACTS_BATCH_N)) {
    if (!a || typeof a !== "object") continue;
    const line = JSON.stringify(a);
    if (line.length > 2048 || out.length + line.length + 1 > ACTS_BATCH_MAX) continue;
    out += line + "\n";
  }
  return out;
}

export async function dailyLive(db: D1Database, b: Body, now: number): Promise<unknown> {
  const nick = await authNick(db, b.nickId, b.code);
  if (!nick) return { error: "nick" };
  const id = typeof b.id === "string" ? b.id : "";
  const t = await db.prepare("SELECT started_at, submitted_at, gave_up_at FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(id, nick.id).first<{ started_at: number; submitted_at: number | null; gave_up_at: number | null }>();
  if (!t) return { error: "notStarted" };
  // 終わった挑戦は受けない (画面は ended を見て送るのをやめる)
  if (t.submitted_at || t.gave_up_at || now > t.started_at + TIME_LIMIT_MS + SUBMIT_GRACE_MS) return { ok: false, ended: true };
  const tree = typeof b.tree === "string" && b.tree.length <= TREE_MAX ? b.tree : null;
  const acts = actLines(b.acts);
  if (!tree && !acts) return { ok: false };
  const w = await db
    .prepare(
      `INSERT INTO daily_live (topic_id, nick_id, first_at, at, n, tree, acts) VALUES (?1, ?2, ?3, ?3, 1, ?4, ?5)
       ON CONFLICT (topic_id, nick_id) DO UPDATE SET at = excluded.at, n = daily_live.n + 1, tree = COALESCE(excluded.tree, daily_live.tree),
         acts = CASE WHEN length(daily_live.acts) + length(excluded.acts) <= ${ACTS_TOTAL_MAX} THEN daily_live.acts || excluded.acts ELSE daily_live.acts END
       WHERE daily_live.n < ${SENDS_MAX}`,
    )
    .bind(id, nick.id, now, tree, acts)
    .run();
  return { ok: !!w.meta.changes };
}

/** 毎朝の片付け: 30 日より前の動作の列を空にする (木は残す、D-100) */
export async function pruneDailyLive(db: D1Database, now = Date.now()): Promise<void> {
  await db.prepare("UPDATE daily_live SET acts = '' WHERE at < ? AND acts != ''").bind(now - ACTS_KEEP_DAYS * 86400e3).run();
}
