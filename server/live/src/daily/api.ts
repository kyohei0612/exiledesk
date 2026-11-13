/**
 * デイリーの口 (設計図 D-56)。形は src/views/daily/daily-api.ts の関数と同じ (画面は中身を fetch に替えるだけ)。
 * お題の狙いはスタートした人と締めた日にだけ返す (D-32b)。時刻はサーバーの時計 (D-32)。
 * お題は 16:00 の台本 (scripts/daily-roll.mjs → POST /daily/topic) が書く。台本が回らなかった日は、ここで週の予定 (daily_plan) からそのまま出す (D-84 の ③)
 */
import { authNick, hasBadWord, ipHash } from "./nick";
import type { BoxCard, BoxPost } from "./box-notify";
import { viewCounts } from "./views";
import { byScore, rankOrderSql } from "../../../../src/views/daily/daily-score";
import { canStartAt, dayName, dayNoOf, dayNoOfName, idOf, noOfId, seedOfDay, SOLVE_RATE, startAt, SUBMIT_GRACE_MS, TIME_LIMIT_MS, weekdayOf, weekOf } from "./time";

/** 1 日の順位に返す人数 */
const RANK_TOP = 50;
/** 投稿は同じ IP から 1 時間 5 件・item 4KB まで、recipe は 32KB まで (D-56) */
const BOX_PER_HOUR = 5;
const ITEM_MAX = 4096;
const RECIPE_MAX = 32 * 1024;
const NOTE_MAX = 100;
/** 提出の一言 (D-35e) は 40 字まで。悪口・URL は断る (書き直してもらう) */
const SUBMIT_NOTE_MAX = 40;
const submitNoteBad = (s: string): boolean => hasBadWord(s) || /https?:|www\.|\.[a-z]{2,}\//i.test(s.normalize("NFKC"));

type Aim = { modId: string; tier: number; ja: string; en: string };
type TopicRow = { id: string; day: string; week: string; box_id: string | null; sample_id: string | null; slot: number; item_class: string | null; base: string; base_ja: string | null; ilvl: number; aims: string; prices: string | null; seed: number; shown_by: string };
type TryRow = { topic_id: string; nick_id: string; started_at: number; submitted_at: number | null; cost: number | null; rate: number | null; checked: number | null; gave_up_at?: number | null };

/**
 * 台本が回らなかった日 (今日まで) を週の予定から出す。出した後は変えない (INSERT OR IGNORE)。
 * 予定の表に台本の確かめの印 (checked、D-80f) の列がある時は、印のある予定だけを出し、印の無い日は前の日のお題をもう 1 日出す (最後の砦。
 * 台本はフル MOD・段 D-04 を確かめた予定にだけ印を付ける。11-10 に古い予定の MOD 5 の弓がそのまま出た)。前の日のお題も無ければ予定のまま。
 * 列の無い D1 (印の列を足す前) は今までどおり予定のまま
 */
export async function settleFromPlan(db: D1Database, upTo: number, prices: string | null): Promise<void> {
  const from = upTo - weekdayOf(upTo);
  const days = Array.from({ length: upTo - from + 1 }, (_, i) => dayName(from + i));
  const marks = days.map(() => "?").join(",");
  type PlanRow = { day: string; week: string; slot: number; item_class: string | null; base: string; base_ja: string | null; sample_id: string | null; ilvl: number | null; aims: string; checked?: string | null };
  const { results: plan } = await db
    .prepare(`SELECT p.* FROM daily_plan p LEFT JOIN daily_topics t ON t.day = p.day WHERE p.day IN (${marks}) AND t.day IS NULL AND p.aims IS NOT NULL ORDER BY p.day`)
    .bind(...days)
    .all<PlanRow>();
  if (!plan.length) return;
  // 前の日から順に 1 日ずつ (続けて落ちた日は、前の日に出した物をまた繰り返す)
  for (const p of plan) {
    if (!("checked" in p) || p.checked) {
      await db
        .prepare("INSERT OR IGNORE INTO daily_topics (id, day, week, sample_id, slot, item_class, base, base_ja, ilvl, aims, prices, seed, shown_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'plan')")
        .bind(`d${p.day}`, p.day, p.week, p.sample_id, p.slot, p.item_class, p.base, p.base_ja, p.ilvl ?? 82, p.aims, prices, seedOfDay(p.day))
        .run();
      continue;
    }
    const prev = await db.prepare("SELECT * FROM daily_topics WHERE day = ?").bind(dayName(dayNoOfName(p.day) - 1)).first<TopicRow>();
    if (prev)
      await db
        .prepare("INSERT OR IGNORE INTO daily_topics (id, day, week, box_id, sample_id, slot, item_class, base, base_ja, ilvl, aims, prices, seed, shown_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'repeat')")
        .bind(`d${p.day}`, p.day, p.week, prev.box_id, prev.sample_id, prev.slot, prev.item_class, prev.base, prev.base_ja, prev.ilvl ?? 82, prev.aims, prices, seedOfDay(p.day))
        .run();
    else
      await db
        .prepare("INSERT OR IGNORE INTO daily_topics (id, day, week, sample_id, slot, item_class, base, base_ja, ilvl, aims, prices, seed, shown_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'plan')")
        .bind(`d${p.day}`, p.day, p.week, p.sample_id, p.slot, p.item_class, p.base, p.base_ja, p.ilvl ?? 82, p.aims, prices, seedOfDay(p.day))
        .run();
  }
}

/** 解決の順位 (D-50): 解決だけ・検算で外れた物は除く・費用の安い順 (D-02b の日からはスコアの小さい順、並べは daily-score.ts の 1 か所)・同じなら先に出した人 */
const rankSql = (topicId: string): string => `SELECT n.name, t.cost, t.rate, t.submitted_at - t.started_at AS ms, t.note FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id
  WHERE t.topic_id = ? AND t.rate >= ${SOLVE_RATE} AND t.cost IS NOT NULL AND (t.checked IS NULL OR t.checked >= 0) ORDER BY ${rankOrderSql(byScore(topicId))} LIMIT ?`;

function topicOut(t: TopicRow, tries: number, closed: boolean): Record<string, unknown> {
  const aims = JSON.parse(t.aims) as Aim[], no = noOfId(t.id)!;
  return {
    id: t.id, day: t.day.slice(5).replace("-", "/"), dayNo: no, base: t.base, baseJa: t.base_ja ?? t.base, ilvl: t.ilvl, modCount: aims.length, slot: t.slot, tries,
    // sample = 手の辞書の見本の型から出たお題 (週のファイルが無い時の控え、D-80。daily-gen.ts の devSamples の id は dev- で始まる)
    sample: !!t.sample_id?.startsWith("dev-"), fromBox: !!t.box_id, ...(closed ? { aims } : {}),
  };
}

/** GET /daily.json: 今週の棚 (月〜日、来ていない日は t = null)・各日の順位の上位・昨日の上位 3 人・名前の横の札 */
export async function dailyJson(db: D1Database, now: number, prices: string | null): Promise<unknown> {
  const today = dayNoOf(now), monday = today - weekdayOf(today);
  await settleFromPlan(db, today, prices);
  const from = Math.min(monday, today - 1);
  const { results: topics } = await db.prepare("SELECT * FROM daily_topics WHERE day >= ? AND day <= ? ORDER BY day").bind(dayName(from), dayName(today)).all<TopicRow>();
  const counts = new Map<string, number>();
  if (topics.length) {
    const { results } = await db.prepare(`SELECT topic_id, count(*) AS n FROM daily_tries WHERE topic_id IN (${topics.map(() => "?").join(",")}) GROUP BY topic_id`).bind(...topics.map((t) => t.id)).all<{ topic_id: string; n: number }>();
    for (const r of results) counts.set(r.topic_id, r.n);
  }
  const byId = new Map(topics.map((t) => [t.id, t]));
  const out = (no: number) => {
    const t = byId.get(idOf(no));
    return t ? topicOut(t, counts.get(t.id) ?? 0, no < today) : null;
  };
  const week = Array.from({ length: 7 }, (_, i) => ({ id: idOf(monday + i), wd: i, md: dayName(monday + i).slice(5).replace("-", "/"), today: monday + i === today, t: monday + i <= today ? out(monday + i) : null }));
  const ranks: Record<string, unknown[]> = {};
  for (const t of topics) {
    // 一言 (D-35e) の無い行は欄を付けない
    const rows = (await db.prepare(rankSql(t.id)).bind(t.id, RANK_TOP).all<{ name: string; note?: string | null }>()).results.map(({ note, ...r }) => (note ? { ...r, note } : r));
    // レシピを開いた人の数 (D-50e)。1 人も開いていない行には欄を付けない (画面は「—」)
    const views = rows.length ? await viewCounts(db, t.id) : new Map<string, number>();
    ranks[t.id] = views.size ? rows.map((r) => (views.has(r.name) ? { ...r, views: views.get(r.name) } : r)) : rows;
  }
  const yesterday = ranks[idOf(today - 1)]?.slice(0, 3) ?? [];
  const names = [...new Set(Object.values(ranks).flat().map((r) => (r as { name: string }).name))];
  return { now, today: idOf(today), yesterday: idOf(today - 1), week, yesterdayTopic: out(today - 1), ranks, yesterdayTop: yesterday, titles: await titlesOf(db, names) };
}

/** 名前 → 札の称号 (D-54): 選んだ物を持っていればそれ、無ければ格の一番高い物 */
async function titlesOf(db: D1Database, names: string[]): Promise<Record<string, { ja: string; en: string; rank: number }>> {
  if (!names.length) return {};
  const { results } = await db
    .prepare(`SELECT n.name, n.title_pick, a.title_id, a.ja, a.en, a.rank FROM daily_nicks n JOIN daily_awards a ON a.nick_id = n.id WHERE n.name IN (${names.map(() => "?").join(",")}) ORDER BY a.rank DESC, a.first_day`)
    .bind(...names)
    .all<{ name: string; title_pick: string | null; title_id: string; ja: string; en: string; rank: number }>();
  const out: Record<string, { ja: string; en: string; rank: number }> = {};
  for (const r of results) if (!out[r.name] || r.title_id === r.title_pick) out[r.name] = { ja: r.ja, en: r.en, rank: r.rank };
  return out;
}

type Body = Record<string, unknown>;
const tryOut = (t: TryRow, topic: TopicRow) => ({
  topicId: t.topic_id, startedAt: t.started_at, ...(t.gave_up_at ? { ended: true, gaveUpAt: t.gave_up_at } : {}), ...(t.submitted_at ? { ended: true, submitted: true } : {}), aims: JSON.parse(topic.aims) as Aim[], base: topic.base, ilvl: topic.ilvl, seed: topic.seed, prices: topic.prices ? JSON.parse(topic.prices) : null,
  ...(t.cost != null ? { best: t.rate! >= SOLVE_RATE ? { cost: t.cost, rate: t.rate, ms: t.submitted_at! - t.started_at, at: t.submitted_at } : undefined, last: { cost: t.cost, rate: t.rate, ms: t.submitted_at! - t.started_at, at: t.submitted_at } } : {}),
});

/** POST /daily/start: 今日のお題だけ、14:50 まで、1 日 1 回 (もう始めていれば同じ挑戦を返し、始め直せない)。ここで初めて MOD を返す */
export async function dailyStart(db: D1Database, b: Body, now: number, prices: string | null): Promise<unknown> {
  const nick = await authNick(db, b.nickId, b.code);
  if (!nick) return { error: "nick" };
  const id = typeof b.id === "string" ? b.id : "";
  const topic = await db.prepare("SELECT * FROM daily_topics WHERE id = ?").bind(id).first<TopicRow>();
  const had = await db.prepare("SELECT * FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(id, nick.id).first<TryRow>();
  if (had && topic) return tryOut(had, topic);
  if (id !== idOf(dayNoOf(now))) return { error: "notToday" };
  if (!canStartAt(now)) return { error: "closed" };
  if (!topic) {
    await settleFromPlan(db, dayNoOf(now), prices);
    if (!(await db.prepare("SELECT 1 FROM daily_topics WHERE id = ?").bind(id).first())) return { error: "notToday" };
    return dailyStart(db, b, now, prices);
  }
  await db.prepare("INSERT OR IGNORE INTO daily_tries (topic_id, nick_id, started_at) VALUES (?, ?, ?)").bind(id, nick.id, now).run();
  const t = await db.prepare("SELECT * FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(id, nick.id).first<TryRow>();
  return tryOut(t!, topic);
}

/**
 * POST /daily/mine: 自分の挑戦の行があるかだけを返す (読むだけ、始めない。11-10)。
 * 置き場で挑戦をリセットした人の端末の控え (時間切れ・終わった印) を捨てさせる用。始める口 (/daily/start) は行が無いと新しく始めるので一覧からは呼べない
 */
export async function dailyMine(db: D1Database, b: Body): Promise<unknown> {
  const nick = await authNick(db, b.nickId, b.code);
  if (!nick) return { error: "nick" };
  const id = typeof b.id === "string" ? b.id : "";
  const had = await db.prepare("SELECT 1 FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(id, nick.id).first();
  return { has: !!had };
}

/** POST /daily/submit: 1 回だけ (出したら挑戦は終わり、D-35c。11-09 まで何回でも出せて一番安い解決を残した)。サーバーの始めた時刻から 1 時間 + 30 秒を過ぎたら受けない (D-32・D-56) */
export async function dailySubmit(db: D1Database, b: Body, now: number): Promise<unknown> {
  const nick = await authNick(db, b.nickId, b.code);
  if (!nick) return { error: "nick" };
  const id = typeof b.id === "string" ? b.id : "";
  const cost = Number(b.cost), rate = Number(b.rate);
  const recipe = typeof b.recipe === "string" ? b.recipe : b.recipe == null ? null : JSON.stringify(b.recipe);
  if (!Number.isFinite(cost) || cost < 0 || cost > 1e9 || !Number.isFinite(rate) || rate < 0 || rate > 100) return { error: "value" };
  if (recipe && recipe.length > RECIPE_MAX) return { error: "large" };
  // 一言 (D-35e): 任意・40 字まで。悪口・URL は提出させずに断る (画面が訳を出して書き直してもらう)
  const note = typeof b.note === "string" ? [...b.note.replace(/\s+/g, " ").trim()].slice(0, SUBMIT_NOTE_MAX).join("") || null : null;
  if (note && submitNoteBad(note)) return { ok: false, error: "note" };
  const t = await db.prepare("SELECT * FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(id, nick.id).first<TryRow>();
  const best = (r: TryRow | null) => (r && r.cost != null && r.rate! >= SOLVE_RATE ? { cost: r.cost, rate: r.rate, ms: r.submitted_at! - r.started_at, at: r.submitted_at } : null);
  if (!t || t.gave_up_at || now > t.started_at + TIME_LIMIT_MS + SUBMIT_GRACE_MS) return { ok: false, best: best(t) };
  // 出した後は受けない (D-35c)。同時に 2 回押されても 1 回目だけが書く (submitted_at IS NULL の時だけ書き替える)
  if (t.submitted_at) return { ok: false, done: true, best: best(t) };
  const w = await db.prepare("UPDATE daily_tries SET submitted_at = ?, cost = ?, rate = ?, recipe = ?, note = ? WHERE topic_id = ? AND nick_id = ? AND submitted_at IS NULL").bind(now, cost, rate, recipe, note, id, nick.id).run();
  if (!w.meta.changes) return { ok: false, done: true, best: best(t) };
  return { ok: true, best: best({ ...t, submitted_at: now, cost, rate }) };
}

/**
 * POST /daily/giveup: 挑戦を提出なしで終える (D-37b)。今日のお題で、まだ終えていない時だけ。始め直しはできない (D-33 のまま)。
 * 始める前でも効く (D-50c、今日のレシピを見る前の諦め): 行が無ければ started_at = gave_up_at = 今 の行を入れる。14:50 の締めは見ない。
 * 前に出した提出の記録は消さない (諦めた後の提出は受けない)。返りは start と同じ形 + ended
 */
export async function dailyGiveup(db: D1Database, b: Body, now: number): Promise<unknown> {
  const nick = await authNick(db, b.nickId, b.code);
  if (!nick) return { error: "nick" };
  const id = typeof b.id === "string" ? b.id : "";
  if (id !== idOf(dayNoOf(now))) return { error: "notToday" };
  if (!(await db.prepare("SELECT 1 FROM daily_topics WHERE id = ?").bind(id).first())) return { error: "notToday" };
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO daily_tries (topic_id, nick_id, started_at, gave_up_at) VALUES (?, ?, ?, ?)").bind(id, nick.id, now, now),
    db.prepare("UPDATE daily_tries SET gave_up_at = ? WHERE topic_id = ? AND nick_id = ? AND gave_up_at IS NULL").bind(now, id, nick.id),
  ]);
  const [t, topic] = await Promise.all([
    db.prepare("SELECT * FROM daily_tries WHERE topic_id = ? AND nick_id = ?").bind(id, nick.id).first<TryRow>(),
    db.prepare("SELECT * FROM daily_topics WHERE id = ?").bind(id).first<TopicRow>(),
  ]);
  if (!t || !topic) return { error: "notStarted" };
  return tryOut(t, topic);
}

/** POST /daily/title: 持っている称号だけ選べる。null で「一番格上」に戻す (D-54) */
export async function dailyTitle(db: D1Database, b: Body): Promise<unknown> {
  const nick = await authNick(db, b.nickId, b.code);
  if (!nick) return { error: "nick" };
  const titleId = typeof b.titleId === "string" ? b.titleId : null;
  if (titleId && !(await db.prepare("SELECT 1 FROM daily_awards WHERE nick_id = ? AND title_id = ?").bind(nick.id, titleId).first())) return { ok: false };
  await db.prepare("UPDATE daily_nicks SET title_pick = ? WHERE id = ?").bind(titleId, nick.id).run();
  return { ok: true };
}

const SRC_MAX = 3000, READ_MAX = 6000;
/**
 * 投稿に添えられた元の形 (D-14c): 貼った文 (@ で始まる行 = トレードのささやきは落とし、上限で切る) と読んだ結果 (揃え直す前の段。中身は解かず、大きすぎれば捨てる) か、
 * エミュから来た印。形が違えば無し
 */
function srcOf(v: unknown): { from: "paste"; text: string; read?: unknown } | { from: "emu" } | null {
  const s = v as { from?: unknown; text?: unknown; read?: unknown } | null;
  if (!s || typeof s !== "object") return null;
  if (s.from === "emu") return { from: "emu" };
  if (s.from !== "paste" || typeof s.text !== "string") return null;
  const text = s.text.replace(/\r\n?/g, "\n").split("\n").filter((l) => !l.trimStart().startsWith("@")).join("\n").trim().slice(0, SRC_MAX);
  if (!text) return null;
  const read = s.read && typeof s.read === "object" && !Array.isArray(s.read) && JSON.stringify(s.read).length <= READ_MAX ? s.read : null;
  return read ? { from: "paste", text, read } : { from: "paste", text };
}

/**
 * 投稿に添えられた絵の元 (D-20c): 確かめの画面のカードの字。Discord の知らせの絵にだけ使う (確かめ・お題には使わない)。
 * 字は長さで切り、行は 12 行まで。名前か MOD の行が無ければ無し (知らせは字だけ)
 */
function cardOf(v: unknown): BoxCard | null {
  const c = v as { n?: unknown; a?: unknown; h?: unknown; r?: unknown; l?: unknown } | null;
  if (!c || typeof c !== "object") return null;
  const str = (x: unknown, n: number): string => (typeof x === "string" ? x : "").replace(/\s+/g, " ").trim().slice(0, n);
  const n = str(c.n, 60);
  const r = (Array.isArray(c.r) ? c.r : []).slice(0, 12).map((x) => {
    const o = (x ?? {}) as { s?: unknown; g?: unknown; t?: unknown; f?: unknown };
    return { s: o.s === "S" ? ("S" as const) : ("P" as const), g: str(o.g, 12), t: str(o.t, 120), ...(o.f ? { f: 1 as const } : {}) };
  }).filter((x) => x.t);
  if (!n || !r.length) return null;
  return { n, a: typeof c.a === "string" && /^[A-Za-z0-9_]{1,80}$/.test(c.a) ? c.a : null, h: (Array.isArray(c.h) ? c.h : []).slice(0, 8).map((x) => str(x, 60)).filter(Boolean), r, l: c.l === "en" ? "en" : "ja" };
}

/** POST /daily/box: 投稿は待ち (wait) で受け、機械の確かめ (D-20、エンジン) は 16:00 の台本が ok / no にする。名前を決めていなくても投稿できる */
export async function dailyBox(db: D1Database, b: Body, ip: string, now: number): Promise<{ error: string } | (BoxPost & { /** 投稿した人の名前 (Discord の通知だけに使う、画面には返さない。routes.ts が外す) */ by: string | null; /** 絵の元 (Discord の知らせの絵だけに使う、画面には返さない。routes.ts が外す) */ card: BoxCard | null })> {
  const nick = b.nickId ? await authNick(db, b.nickId, b.code) : null;
  const note = typeof b.note === "string" ? b.note.slice(0, NOTE_MAX) : "";
  const aims = Array.isArray(b.aims) ? b.aims : [];
  const core = { base: b.base, baseJa: b.baseJa, ilvl: b.ilvl, aims };
  if (typeof b.base !== "string" || !b.base || !Number.isInteger(b.ilvl) || !aims.length) return { error: "item" };
  if (JSON.stringify(core).length > ITEM_MAX) return { error: "large" };
  // 貼った元の文と読んだ結果かエミュから来た印 (D-14c)・絵の元 (D-20c)。品の欄の中に足して残すだけで、確かめ・お題には使わない。上限は品の上限と別に切る
  const src = srcOf(b.src), card = cardOf(b.card);
  const item = JSON.stringify({ ...core, ...(src ? { src } : {}), ...(card ? { card } : {}) });
  const ih = await ipHash(ip);
  const n = await db.prepare("SELECT count(*) AS n FROM daily_box WHERE ip_hash = ? AND created > ?").bind(ih, now - 3600_000).first<{ n: number }>();
  if ((n?.n ?? 0) >= BOX_PER_HOUR) return { error: "busy" };
  // 悪口は受けた時に落とす (エンジンが要らない所だけ先に)
  const bad = hasBadWord(note) || (nick ? hasBadWord(nick.name) : false);
  const id = `p${now.toString(36)}${crypto.randomUUID().slice(0, 4)}`;
  await db.prepare("INSERT INTO daily_box (id, created, ip_hash, nick_id, note, item, status, why) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, now, ih, nick?.id ?? null, note, item, bad ? "no" : "wait", bad ? "bad-word" : null).run();
  return { id, at: now, note, base: b.base, baseJa: b.baseJa, ilvl: b.ilvl, aims, status: bad ? "no" : "wait", ...(bad ? { why: "bad-word" } : {}), by: nick?.name ?? null, card };
}

/** 自分の投稿の状態 (GET /daily/box.json?ids=、このブラウザが覚えた id だけ。D-15) */
export async function dailyBoxStatus(db: D1Database, ids: string[]): Promise<unknown> {
  const list = ids.filter((x) => /^p[0-9a-z-]{4,24}$/.test(x)).slice(0, 50);
  if (!list.length) return { box: [] };
  const { results } = await db.prepare(`SELECT id, status, why FROM daily_box WHERE id IN (${list.map(() => "?").join(",")})`).bind(...list).all();
  return { box: results };
}

/**
 * GET /daily/recipe.json?id=&name=: 順位の行のレシピ (D-50b、オーナー 11-05「ランキングーはレシピ見れるようにできるよね」)。
 * 締めた日と今日 (今日は見る前に画面が「見たら諦めた扱い」の窓を出す、D-50c)。順位と同じ条件 = 解決・検算で外れていない行だけ
 */
export async function dailyRecipe(db: D1Database, id: string, name: string, now: number): Promise<{ recipe: string | null } | { error: string }> {
  const no = noOfId(id);
  if (no == null || !name || name.length > 40) return { error: "id" };
  // 今日のお題も返す (D-50c、カンニングの窓は画面が出す)。来ていない日は無い
  if (no > dayNoOf(now)) return { error: "open" };
  const r = await db
    .prepare(`SELECT t.recipe FROM daily_tries t JOIN daily_nicks n ON n.id = t.nick_id WHERE t.topic_id = ? AND n.name = ? AND t.rate >= ${SOLVE_RATE} AND t.cost IS NOT NULL AND (t.checked IS NULL OR t.checked >= 0)`)
    .bind(id, name)
    .first<{ recipe: string | null }>();
  return { recipe: r?.recipe ?? null };
}

/** その日の始まり (16:00) より前の投稿だけ候補 (D-84)。台本が使う */
export const boxCutoff = (no: number): number => startAt(no);
export { weekOf };
