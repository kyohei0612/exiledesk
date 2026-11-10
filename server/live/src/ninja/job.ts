/**
 * デイリーの週の取得 (設計図 D-80b・D-80c・Y-53)。5 分おきの cron (wrangler.jsonc、UTC の日曜・月曜だけ) から呼ばれ、日曜 16:00〜月曜 16:00 JST の窓の中だけ動く。
 * 1 回の起動で数本だけ取り (Workers の無料の枠 = 外への取得 50 本・CPU 10ms、Y-76)、途中の段は D1 (ninja_job・ninja_memo)。
 * 全部済む (or 窓が閉じる・止めのスイッチ・本数の上限) と、型の材料を daily_fetch_items に書き、名前の入った控えを消す。
 * 足りない週は取れた分 (partial) で、前の週の分と合わせて回すのは 16:00 の生成の側 (D-80b ④)。
 */
import type { Env } from "../types";
import { alert } from "../monitor";
import { readCharacter, type Main, type RareItem } from "./character";
import { getOnce, MIN_REQUEST_INTERVAL_MS, readBuildIndexState, readIndexState, urls, type Gate, type Pending } from "./fetch";
import { searchRefs, type Ref } from "./protobuf";
import { runAll, searchKey, TOP_ASCENDANCIES, type AscResult, type Memo, type Need } from "./select";
export { setBuildSize } from "./select";

/** 1 回の起動で取る本数 (CPU 10ms に収める。vars の NINJA_PER_RUN で変えられる) */
const PER_RUN = 3;
/** 1 週の本数の上限 (見込み 100〜250 本)。超えたらその週は取れた分で締める */
const WEEK_CAP = 400;

interface JobRow {
  week: string;
  state: string;
  league: string | null;
  version: string | null;
  snapshot: string | null;
  ascs: string | null;
  interval_ms: number | null;
  not_before: number | null;
  last_sent: number | null;
  pending: string | null;
  requests: number;
  errors: string | null;
}

const JST = 9 * 3600e3;

/** 今が窓の中か と、仕える週 (月曜の JST の日付)。日曜・月曜 (JST) 以外は week = null */
export function windowOf(now: Date): { week: string | null; open: boolean } {
  const j = new Date(now.getTime() + JST);
  const dow = j.getUTCDay(), h = j.getUTCHours();
  if (dow !== 0 && dow !== 1) return { week: null, open: false };
  const monday = new Date(j.getTime() + (dow === 0 ? 86400e3 : 0));
  return { week: monday.toISOString().slice(0, 10), open: dow === 0 ? h >= 16 : h < 16 };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function stopped(db: D1Database): Promise<boolean> {
  const r = await db.prepare("SELECT v FROM ninja_ctl WHERE k = 'stop'").first<{ v: string }>();
  return r?.v === "1";
}

async function loadMemo(db: D1Database, week: string): Promise<Memo> {
  const { results } = await db.prepare("SELECT kind, k, v FROM ninja_memo WHERE week = ?").bind(week).all<{ kind: string; k: string; v: string | null }>();
  const memo: Memo = { search: new Map(), chars: new Map() };
  for (const r of results) {
    const v = r.v === null ? null : JSON.parse(r.v);
    if (r.kind === "search") memo.search.set(r.k, v as Ref[] | null);
    else memo.chars.set(r.k, v as Main | null);
  }
  return memo;
}

async function saveJob(db: D1Database, job: JobRow, gate: Gate): Promise<void> {
  await db
    .prepare("UPDATE ninja_job SET state = ?, league = ?, version = ?, snapshot = ?, ascs = ?, interval_ms = ?, not_before = ?, last_sent = ?, pending = ?, requests = ?, errors = ? WHERE week = ?")
    .bind(job.state, job.league, job.version, job.snapshot, job.ascs, gate.intervalMs, gate.notBefore, job.last_sent, gate.pending ? JSON.stringify(gate.pending) : null, job.requests, job.errors, job.week)
    .run();
}

function pushError(job: JobRow, msg: string): void {
  const list = (job.errors ? JSON.parse(job.errors) : []) as string[];
  list.push(msg.slice(0, 200));
  job.errors = JSON.stringify(list.slice(-20));
}

/** 次に取る物の URL。済んでいれば null */
function nextOf(job: JobRow, memo: Memo | null): { url: string; need: Need | "index" | "build-index" } | { done: AscResult[] } {
  if (!job.version || !job.snapshot) return { url: urls.indexState(), need: "index" };
  if (!job.ascs) return { url: urls.buildIndexState(), need: "build-index" };
  const r = runAll(JSON.parse(job.ascs) as string[], memo!);
  if ("done" in r) return r;
  const n = r.need;
  return { url: n.kind === "search" ? urls.search(job.version, job.snapshot, n.asc, n.skills) : urls.character(job.version, job.snapshot, n.ref), need: n };
}

/** 5 分おきの cron から。窓の外・止め・待ちの間は何もしない */
export async function ninjaTick(env: Env, now = new Date(), fetchFn: typeof fetch = fetch): Promise<void> {
  const db = env.LOGS;
  if (!db) return;
  const { week, open } = windowOf(now);
  if (!week) return;
  let job = await db.prepare("SELECT * FROM ninja_job WHERE week = ?").bind(week).first<JobRow>();
  if (!open) {
    if (job?.state === "running") await finalize(env, job, "partial", "月曜 16:00 までに済まなかった");
    return;
  }
  if (await stopped(db)) {
    if (job?.state === "running") await finalize(env, job, "stopped", "止めのスイッチ");
    return;
  }
  if (!job) {
    await db.prepare("INSERT OR IGNORE INTO ninja_job (week, state, interval_ms, not_before, requests, started_at) VALUES (?, 'running', ?, 0, 0, ?)").bind(week, MIN_REQUEST_INTERVAL_MS, now.toISOString()).run();
    job = await db.prepare("SELECT * FROM ninja_job WHERE week = ?").bind(week).first<JobRow>();
    if (!job) return;
  }
  if (job.state !== "running") return;
  const gate: Gate = { intervalMs: job.interval_ms ?? MIN_REQUEST_INTERVAL_MS, notBefore: job.not_before ?? 0, pending: job.pending ? (JSON.parse(job.pending) as Pending) : null };
  if (Date.now() < gate.notBefore) return;
  const perRun = Math.max(1, Math.min(10, Number(env.NINJA_PER_RUN) || PER_RUN));
  let memo: Memo | null = job.ascs ? await loadMemo(db, week) : null;

  for (let i = 0; i < perRun; i++) {
    const next = nextOf(job, memo);
    if ("done" in next) return void (await finalize(env, job, "done", null, next.done));
    if (job.requests >= WEEK_CAP) return void (await finalize(env, job, "partial", `1 週の本数の上限 ${WEEK_CAP} 本`));
    // 送る間隔 (アプリのレートゲート)。前の起動の分も last_sent で数える
    const wait = (job.last_sent ?? 0) + gate.intervalMs - Date.now();
    if (wait > 0) await sleep(Math.min(wait, gate.intervalMs));
    const got = await getOnce(next.url, gate, Date.now(), fetchFn);
    job.requests++;
    job.last_sent = Date.now();
    if ("retry" in got) {
      await saveJob(db, job, gate);
      return;
    }
    let body: unknown = null, err = "fail" in got ? got.fail : null;
    if ("ok" in got) {
      try {
        body = next.need !== "index" && next.need !== "build-index" && next.need.kind === "search" ? searchRefs(new Uint8Array(await got.ok.arrayBuffer())) : await got.ok.json();
      } catch (e) {
        err = `${next.url.slice(0, 120)}: ${String(e).slice(0, 160)}`;
      }
    }
    if (err) pushError(job, err);

    if (next.need === "index" || next.need === "build-index") {
      // リーグとアセが取れないと何も始まらない = その週は失敗 (アプリも全体を Err で返していた)
      try {
        if (err) throw new Error(err);
        if (next.need === "index") Object.assign(job, readIndexState(body, env.NINJA_LEAGUE || null));
        else {
          job.ascs = JSON.stringify(readBuildIndexState(body, job.league!).slice(0, TOP_ASCENDANCIES));
          memo = { search: new Map(), chars: new Map() };
        }
      } catch (e) {
        pushError(job, String(e));
        await saveJob(db, job, gate);
        return void (await finalize(env, job, "failed", String(e).slice(0, 120)));
      }
    } else if (next.need.kind === "search") {
      // 絞らない search の失敗はそのアセを諦める、スキルで絞った search の失敗は 0 人 (ascendancy_fetch.rs)
      const key = searchKey(next.need.asc, next.need.skills);
      const v: Ref[] | null = err ? (next.need.skills.length ? [] : null) : (body as Ref[]);
      memo!.search.set(key, v);
      await db.prepare("INSERT OR REPLACE INTO ninja_memo (week, kind, k, v) VALUES (?, 'search', ?, ?)").bind(week, key, JSON.stringify(v)).run();
    } else {
      const key = `${next.need.ref.account}|${next.need.ref.name}`;
      let main: Main | null = null, items: RareItem[] = [];
      if (!err) {
        try {
          ({ main, items } = readCharacter(body));
        } catch (e) {
          pushError(job, String(e));
        }
      }
      memo!.chars.set(key, main);
      await db.prepare("INSERT OR REPLACE INTO ninja_memo (week, kind, k, v, items) VALUES (?, 'char', ?, ?, ?)").bind(week, key, JSON.stringify(main), JSON.stringify(items)).run();
    }
    await saveJob(db, job, gate);
  }
}

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
/** アカウントのハッシュ (名前は残さない。同じアカウントの別キャラを 1 人に数える用) */
const whoOf = async (account: string): Promise<string> => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`exiledesk-daily:${account}`))).slice(0, 16);

/** 締め: 型の材料を書き、名前の入った控えを消す。done = 全部済み、partial = 取れた分 (済んだアセだけ)、stopped・failed も取れた分を残す */
export async function finalize(env: Env, job: JobRow, state: "done" | "partial" | "stopped" | "failed", why: string | null, done?: AscResult[]): Promise<void> {
  const db = env.LOGS!;
  let results = done;
  if (!results && job.ascs) {
    const ascs = JSON.parse(job.ascs) as string[], memo = await loadMemo(db, job.week);
    const r = runAll(ascs, memo);
    results = "done" in r ? r.done : partialOf(ascs, memo);
  }
  const want = new Map<string, { asc: string; skill: string | null }>();
  for (const a of results ?? []) for (const p of a.people) if (!want.has(p.key)) want.set(p.key, { asc: a.asc, skill: p.skill });
  const { results: rows } = await db.prepare("SELECT k, items FROM ninja_memo WHERE week = ? AND kind = 'char'").bind(job.week).all<{ k: string; items: string | null }>();
  const itemsOf = new Map(rows.filter((r) => want.has(r.k)).map((r) => [r.k, r.items]));
  const seenWho = new Set<string>();
  const stmts: D1PreparedStatement[] = [db.prepare("DELETE FROM daily_fetch_items WHERE week = ?").bind(job.week)];
  let people = 0;
  for (const [key, meta] of want) {
    const who = await whoOf(key.slice(0, key.indexOf("|")));
    if (seenWho.has(who)) continue; // 同じアカウントの別キャラは 1 人に数える (D-80b、アプリの挙動の外)
    seenWho.add(who);
    const items = JSON.parse(itemsOf.get(key) ?? "[]") as RareItem[];
    if (!items.length) continue;
    people++;
    for (const it of items)
      stmts.push(
        db
          .prepare("INSERT INTO daily_fetch_items (week, slot, sub, base, ilvl, quality, quality_kind, mods, fractured, desecrated, corrupted, sanctified, who, asc, skill) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(job.week, it.slot, JSON.stringify(it.sub), it.base, it.ilvl, it.quality, it.qualityKind, JSON.stringify(it.mods), it.fractured ? JSON.stringify(it.fractured) : null, it.desecrated ? JSON.stringify(it.desecrated) : null, it.corrupted ? 1 : 0, it.sanctified ? 1 : 0, who, meta.asc, meta.skill),
      );
  }
  const nItems = stmts.length - 1;
  stmts.push(db.prepare("DELETE FROM ninja_memo WHERE week = ?").bind(job.week));
  stmts.push(db.prepare("UPDATE ninja_job SET state = ?, pending = NULL, finished_at = ?, people = ?, items = ? WHERE week = ?").bind(state, new Date().toISOString(), people, nItems, job.week));
  await db.batch(stmts);
  await alert(env, `デイリーの週の取得 ${job.week}`, `${state}${why ? ` (${why})` : ""}: ${people} 人・${nItems} 品・${job.requests} 本`);
}

/** 窓が閉じた時の取れた分 = 途中で止まったアセより前の、済んだアセ */
function partialOf(ascs: string[], memo: Memo): AscResult[] {
  const out: AscResult[] = [];
  for (let i = 1; i <= ascs.length; i++) {
    const r = runAll(ascs.slice(0, i), memo);
    if (!("done" in r)) break;
    out.splice(0, out.length, ...r.done);
  }
  return out;
}

/** GET /daily/fetch.json?week= (鍵つき Y-93)。週を省くと一番新しい週。16:00 の生成の側が読む */
export async function fetchItemsJson(env: Env, week: string | null): Promise<unknown> {
  const db = env.LOGS;
  if (!db) return { error: "D1 が無い" };
  const job = week
    ? await db.prepare("SELECT week, state, requests, people, items, errors, started_at, finished_at FROM ninja_job WHERE week = ?").bind(week).first()
    : await db.prepare("SELECT week, state, requests, people, items, errors, started_at, finished_at FROM ninja_job ORDER BY week DESC LIMIT 1").first();
  if (!job) return { job: null, items: [] };
  const { results } = await db.prepare("SELECT slot, sub, base, ilvl, quality, quality_kind, mods, fractured, desecrated, corrupted, sanctified, who, asc, skill FROM daily_fetch_items WHERE week = ? ORDER BY id").bind((job as { week: string }).week).all();
  return { job, items: results };
}
