/**
 * _d1-shim.mjs — Worker の D1 の口 (prepare・bind・first・all・run・batch) を手元で使う 2 つの形 (設計図 Y-53・D-80e、2026-11-09)
 *   localD1()  … 手元の空の SQLite (node:sqlite、server/live の migrations を当てた物、メモリの中だけ)。週の取得を Worker と同じコードで回す用
 *   remoteD1() … 本番の D1 を `wrangler d1 execute --remote` で読み書きする (オーナーの wrangler のログイン、鍵は使わない Y-90)
 * 両方とも Worker のコード (server/live/src/) に渡せば、そのまま D1 として動く。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = join(ROOT, "server/live");
const DB_NAME = "exiledesk-logs";

const norm = (v) => (v === undefined || v === null ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);

/** 手元の SQLite。migrations を番号順に全部当てる */
export async function localD1() {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  const dir = join(LIVE, "migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
  const exec = (sql, args, how) => {
    const st = db.prepare(sql);
    if (how === "first") return st.get(...args) ?? null;
    if (how === "all") return { results: st.all(...args), success: true };
    const r = st.run(...args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  };
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a.map(norm)),
    first: async () => exec(sql, args, "first"),
    all: async () => exec(sql, args, "all"),
    run: async () => exec(sql, args, "run"),
    _run: () => exec(sql, args, /^\s*select/i.test(sql) ? "all" : "run"),
  });
  return {
    prepare: (sql) => mk(sql, []),
    batch: async (stmts) => {
      db.exec("BEGIN");
      try {
        const out = stmts.map((s) => s._run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    raw: db,
  };
}

/** SQL の文字の値 */
export function lit(v) {
  v = norm(v);
  if (v === null) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** `?` を値で埋める ('…' の中の ? は飛ばす) */
export function inline(sql, args) {
  let i = 0, out = "", q = false;
  for (const c of sql) {
    if (c === "'") q = !q;
    if (c === "?" && !q) {
      if (i >= args.length) throw new Error(`値が足りない: ${sql.slice(0, 80)}`);
      out += lit(args[i++]);
    } else out += c;
  }
  if (i !== args.length) throw new Error(`値が余った: ${sql.slice(0, 80)}`);
  return out;
}

/** server/live の wrangler (この木に無ければ本体の checkout の物) */
function wranglerJs() {
  const cands = [join(LIVE, "node_modules/wrangler/bin/wrangler.js"), resolve(ROOT, "../../../server/live/node_modules/wrangler/bin/wrangler.js")];
  const hit = cands.find((p) => existsSync(p));
  if (!hit) throw new Error("server/live の wrangler が無い (server/live で pnpm install)");
  return hit;
}

/** wrangler を 1 回。shell を通さず node で直に起こす (値の引用で崩れない) */
export function wrangler(args) {
  const r = spawnSync(process.execPath, [wranglerJs(), ...args], { cwd: LIVE, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: "false", FORCE_COLOR: "0" } });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(" ")}: ${(r.stderr || r.stdout || "").trim().split("\n").slice(-4).join(" / ").slice(0, 400)}`);
  return r.stdout;
}

function execJson(args) {
  const out = wrangler(["d1", "execute", DB_NAME, "--remote", "--json", ...args]);
  const j = JSON.parse(out.slice(out.indexOf("[")));
  if (!Array.isArray(j) || j.some((x) => x.success === false)) throw new Error(`d1: ${out.slice(0, 300)}`);
  return j;
}

/** 本番の D1。読みは 1 文ずつ --command、書き (batch) はまとめて 1 つの --file (途中で落ちれば全部戻る) */
export function remoteD1() {
  const read = (sql) => execJson(["--command", sql])[0]?.results ?? [];
  const mk = (sql, args) => ({
    bind: (...a) => mk(sql, a.map(norm)),
    first: async () => read(inline(sql, args))[0] ?? null,
    all: async () => ({ results: read(inline(sql, args)), success: true }),
    run: async () => (writeSql([inline(sql, args)]), { success: true }),
    _sql: () => inline(sql, args),
  });
  return { prepare: (sql) => mk(sql, []), batch: async (stmts) => (writeSql(stmts.map((s) => s._sql())), stmts.map(() => ({ success: true }))) };
}

/** 書く SQL を 1 つのファイルにして --file で流す */
export function writeSql(lines) {
  if (!lines.length) return;
  const dir = mkdtempSync(join(tmpdir(), "exiledesk-d1-"));
  const f = join(dir, "write.sql");
  try {
    writeFileSync(f, lines.map((l) => l.trim().replace(/;$/, "") + ";").join("\n") + "\n");
    execJson(["--file", f, "--yes"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 本番の KV (LIVE) の 1 キー。無ければ null */
export function remoteKv(key) {
  try {
    const out = wrangler(["kv", "key", "get", key, "--binding", "LIVE", "--remote"]);
    return out.trim() ? out.trim() : null;
  } catch (e) {
    if (/not found|404/i.test(String(e))) return null;
    throw e;
  }
}
