/**
 * 16:00 の切り替えの口 (設計図 D-59、鍵つき Y-93)。エンジンを使う所は Worker の CPU に入らないので、予定のタスクの台本 (scripts/daily-roll.mjs) が
 * GET /daily/roll.json で材料を読み、エンジンで組んで POST /daily/topic で書く。Worker は書くだけで、決めた物を後から変えない (お題は INSERT OR IGNORE)。
 */
import { dayName, dayNoOf, idOf, seedOfDay, weekOf } from "./time";

type Body = Record<string, unknown>;
const arr = (v: unknown): Body[] => (Array.isArray(v) ? (v as Body[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const js = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

/** GET /daily/roll.json?day=<組む日>: 台本の材料。day を省くと次の 16:00 の日 */
export async function rollJson(db: D1Database, now: number, dayParam: string | null): Promise<unknown> {
  const target = dayParam ?? dayName(dayNoOf(now) + 1);
  const no = Math.round(Date.parse(`${target}T00:00:00Z`) / 86400e3);
  const week = weekOf(no), prevWeek = weekOf(no - 7), closing = dayName(no - 1);
  const all = <T>(sql: string, ...b: unknown[]) => db.prepare(sql).bind(...b).all<T>().then((r) => r.results);
  const [job, items, samples, prevSamples, plan, topics, box, tries, results, awards] = await Promise.all([
    db.prepare("SELECT week, state, people, items, requests FROM ninja_job WHERE week = ?").bind(week).first(),
    all("SELECT slot, sub, base, ilvl, quality, quality_kind, mods, fractured, desecrated, corrupted, sanctified, who FROM daily_fetch_items WHERE week = ? ORDER BY id", week),
    all("SELECT id, base, mods, n FROM daily_samples WHERE week = ?", week),
    all("SELECT id, base, mods, n FROM daily_samples WHERE week = ?", prevWeek),
    all("SELECT * FROM daily_plan WHERE week = ? ORDER BY day", week),
    all("SELECT id, day, slot, item_class, base, box_id, sample_id, seed, prices, ilvl, aims FROM daily_topics ORDER BY day"),
    all("SELECT b.id, b.created, b.note, b.item, b.status, n.name AS nick FROM daily_box b LEFT JOIN daily_nicks n ON n.id = b.nick_id WHERE b.status IN ('wait', 'ok') ORDER BY b.created"),
    all("SELECT t.nick_id, n.name, t.started_at, t.submitted_at, t.cost, t.rate, t.recipe, t.checked FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id WHERE t.topic_id = ?", idOf(no - 1)),
    all("SELECT r.*, n.name FROM daily_results r JOIN daily_nicks n ON n.id = r.nick_id ORDER BY r.day"),
    all("SELECT * FROM daily_awards"),
  ]);
  const closed = await db.prepare("SELECT 1 FROM daily_results WHERE day = ? LIMIT 1").bind(closing).first();
  // 予定の表に確かめの印の列 (checked、D-80f) があるか。その週の予定がまだ無い日曜の組み立てでも分かるよう、どの週でも 1 行見る
  const anyPlan = await db.prepare("SELECT * FROM daily_plan LIMIT 1").first<Record<string, unknown>>();
  const planMarks = !!anyPlan && "checked" in anyPlan;
  return { now, target, targetId: idOf(no), week, prevWeek, closing, closed: !!closed, planMarks, job, items, samples, prevSamples, plan, topics, box, tries, results, awards };
}

/**
 * POST /daily/topic: 台本が組んだ物を書く。どれも省ける。
 *   week   {week, samples: [{id, base, itemClass, mods, n}], plan: [{day, slot, itemClass, base, baseJa, sampleId, ilvl, aims}]} — その週にまだ予定が無い時だけ
 *   box    [{id, status: ok|no, why?, aims?}] — 機械の確かめ (D-20) の結果
 *   close  {day, results: [{nickId, place, cost, rate, usedMs, solvedN, enteredN, slot, itemClass, base, checked, engineVer, facts}], checked: [{nickId, checked}], awards: [{nickId, id, ver, firstDay, count, retired, ja, en, rank}]}
 *   planFix [{day, slot, itemClass, base, baseJa, sampleId, ilvl, aims}] — 今週の残りの予定でフル MOD でない日の差し替え (D-82)。お題が出た日は変えない
 *   topic  {day, boxId?, sampleId?, slot, itemClass, base, baseJa, ilvl, aims, typeSnap?, engineVer, rulesVer} — 出した後は変えない
 */
export async function rollPost(db: D1Database, b: Body, prices: string | null): Promise<unknown> {
  const stmts: D1PreparedStatement[] = [];
  const done: string[] = [];
  const w = b.week as Body | undefined;
  if (w && str(w.week)) {
    const week = str(w.week)!;
    const has = await db.prepare("SELECT 1 FROM daily_plan WHERE week = ? LIMIT 1").bind(week).first();
    if (!has) {
      for (const s of arr(w.samples))
        stmts.push(db.prepare("INSERT OR REPLACE INTO daily_samples (week, id, item_class, base, mods, n) VALUES (?, ?, ?, ?, ?, ?)").bind(week, str(s.id), str(s.itemClass), str(s.base), js(s.mods), num(s.n) ?? 1));
      // checked = 組んだ時に台本がフル MOD・段 (D-04) を確かめた印 (D-80f、11-11)。台本は表に列がある時だけ送る
      for (const p of arr(w.plan))
        stmts.push(
          str(p.checked)
            ? db
                .prepare("INSERT OR IGNORE INTO daily_plan (day, week, slot, item_class, base, base_ja, sample_id, ilvl, aims, checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(str(p.day), week, num(p.slot) ?? 0, str(p.itemClass), str(p.base), str(p.baseJa), str(p.sampleId), num(p.ilvl), js(p.aims), str(p.checked))
            : db
                .prepare("INSERT OR IGNORE INTO daily_plan (day, week, slot, item_class, base, base_ja, sample_id, ilvl, aims) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(str(p.day), week, num(p.slot) ?? 0, str(p.itemClass), str(p.base), str(p.baseJa), str(p.sampleId), num(p.ilvl), js(p.aims)),
        );
      done.push("week");
    }
  }
  for (const x of arr(b.box)) {
    const st = x.status === "ok" || x.status === "no" ? x.status : null;
    if (!str(x.id) || !st) continue;
    stmts.push(
      x.aims
        ? db.prepare("UPDATE daily_box SET status = ?, why = ?, item = json_set(item, '$.aims', json(?)) WHERE id = ? AND status = 'wait'").bind(st, str(x.why), js(x.aims), str(x.id))
        : db.prepare("UPDATE daily_box SET status = ?, why = ? WHERE id = ? AND status = 'wait'").bind(st, str(x.why), str(x.id)),
    );
  }
  if (arr(b.box).length) done.push("box");
  const c = b.close as Body | undefined;
  if (c && str(c.day)) {
    const day = str(c.day)!, topicId = `d${day}`;
    for (const k of arr(c.checked)) stmts.push(db.prepare("UPDATE daily_tries SET checked = ? WHERE topic_id = ? AND nick_id = ?").bind(num(k.checked), topicId, str(k.nickId)));
    for (const r of arr(c.results))
      stmts.push(
        db
          .prepare("INSERT OR REPLACE INTO daily_results (day, topic_id, nick_id, place, cost, rate, used_ms, solved_n, entered_n, slot, item_class, base, checked, engine_ver, facts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(day, topicId, str(r.nickId), num(r.place), num(r.cost), num(r.rate), num(r.usedMs), num(r.solvedN), num(r.enteredN), num(r.slot), str(r.itemClass), str(r.base), num(r.checked), str(r.engineVer), js(r.facts)),
      );
    // 称号は全部の記録から計算し直した写しなので、丸ごと書き替える (D-101)
    if (Array.isArray(c.awards)) {
      stmts.push(db.prepare("DELETE FROM daily_awards"));
      for (const a of arr(c.awards))
        stmts.push(
          db
            .prepare("INSERT OR REPLACE INTO daily_awards (nick_id, title_id, title_ver, first_day, count, retired, ja, en, rank) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(str(a.nickId), str(a.id), num(a.ver), str(a.firstDay), num(a.count), a.retired ? 1 : 0, str(a.ja), str(a.en), num(a.rank) ?? 0),
        );
    }
    done.push("close");
  }
  // 今週の残りの予定の差し替え (D-82: フル MOD でない並びを台本が直した物)。台本が回らなかった日の控え (settleFromPlan) もフルになる。出たお題の日は触らない
  const fix = arr(b.planFix).filter((p) => str(p.day) && str(p.base) && Array.isArray(p.aims));
  // checked = 台本がフル MOD・段 (D-04) で確かめた印 (D-80f)。台本は表に列がある時だけ送る (列の無い D1 に書くと全部が落ちるので、無ければ前の文のまま)
  for (const p of fix)
    stmts.push(
      str(p.checked)
        ? db
            .prepare("UPDATE daily_plan SET slot = ?, item_class = ?, base = ?, base_ja = ?, sample_id = ?, ilvl = ?, aims = ?, checked = ? WHERE day = ? AND NOT EXISTS (SELECT 1 FROM daily_topics t WHERE t.day = daily_plan.day)")
            .bind(num(p.slot) ?? 0, str(p.itemClass), str(p.base), str(p.baseJa), str(p.sampleId), num(p.ilvl), js(p.aims), str(p.checked), str(p.day))
        : db
            .prepare("UPDATE daily_plan SET slot = ?, item_class = ?, base = ?, base_ja = ?, sample_id = ?, ilvl = ?, aims = ? WHERE day = ? AND NOT EXISTS (SELECT 1 FROM daily_topics t WHERE t.day = daily_plan.day)")
            .bind(num(p.slot) ?? 0, str(p.itemClass), str(p.base), str(p.baseJa), str(p.sampleId), num(p.ilvl), js(p.aims), str(p.day)),
    );
  if (fix.length) done.push("planFix");
  const t = b.topic as Body | undefined;
  if (t && str(t.day) && str(t.base) && Array.isArray(t.aims)) {
    const day = str(t.day)!, no = Math.round(Date.parse(`${day}T00:00:00Z`) / 86400e3);
    stmts.push(
      db
        .prepare("INSERT OR IGNORE INTO daily_topics (id, day, week, box_id, sample_id, slot, item_class, base, base_ja, ilvl, type_snap, aims, prices, seed, engine_ver, rules_ver, shown_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'roll')")
        .bind(`d${day}`, day, weekOf(no), str(t.boxId), str(t.sampleId), num(t.slot) ?? 0, str(t.itemClass), str(t.base), str(t.baseJa), num(t.ilvl) ?? 82, js(t.typeSnap), js(t.aims), prices, seedOfDay(day), str(t.engineVer), str(t.rulesVer)),
    );
    if (str(t.boxId)) stmts.push(db.prepare("UPDATE daily_box SET status = 'used' WHERE id = ? AND EXISTS (SELECT 1 FROM daily_topics WHERE id = ? AND box_id = ?)").bind(str(t.boxId), `d${day}`, str(t.boxId)));
    done.push("topic");
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true, done };
}
