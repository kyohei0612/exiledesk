#!/usr/bin/env node
/**
 * phase-alpha-decode-A.mjs
 * ============================================================================
 * Phase α (engineering-A / 正攻法) - poe.ninja search protobuf decode PoC
 *
 * 目的:
 *   poe.ninja の internal API `/poe2/api/builds/{version}/search` が返す
 *   `application/x-protobuf` バイナリを、自前復元した proto schema で型安全に
 *   decode し、上位プレイヤーの {account, name, level, dps, ehp, life, ...}
 *   を抽出して JSON で stdout に出す。
 *
 * 入力:
 *   - GET https://poe.ninja/poe2/api/data/index-state
 *       → economyLeagues[0], snapshotVersions[0]
 *   - GET https://poe.ninja/poe2/api/builds/{version}/search
 *         ?overview={snapshotName}&class=Blood+Mage&sort=dps
 *       → application/x-protobuf, ~41 KB, 100 rows
 *
 * 復元したスキーマ (手動逆引き, .proto-like notation):
 *   message SearchResponse {
 *     SearchBody body = 1;
 *   }
 *   message SearchBody {
 *     int64 seq = 1;                            // build seq counter
 *     repeated DimensionDescriptor dims = 2;    // 各 sort key の min/max/values (UI フィルタ表示用)
 *     repeated FieldMetadata fields = 3;        // build_index_state-derived
 *     repeated StageTiming stages = 4;          // "Start Search", "ApplyFilters", ...
 *     repeated Column columns = 5;              // ★★ ここがプレイヤーデータ ★★
 *     repeated TooltipFragment fragments = 6;
 *     repeated FilterMeta filterMeta = 7;
 *     repeated DimensionBucket buckets = 8;
 *     repeated IntDimMeta intMeta = 9;
 *     repeated EmptyMarker spacer = 10;
 *     repeated SearchAux aux = 11;              // 211 個ある heatmap 等
 *   }
 *   message Column {
 *     string name = 1;          // "name" / "account" / "class" / "level" / "life" /
 *                               //  "dps" / "ehp" / "energyshield" / "skills" / "keypassives"
 *     repeated Cell values = 2; // 100 rows
 *   }
 *   message Cell {
 *     // どれが入るかは列の型で変わる
 *     string display = 1;       // 表示用 (e.g. "202M", "20k", account/name 文字列)
 *     int64 numeric = 2;        // 整数値 (level, life, mana, etc.) or DPS の正規化指数 ("116")
 *     bytes extra = 3;          // class 列の int サブメッセージや dps の extra 6byte
 *     // Sparse: 多くの列ではどれか1つだけ存在 (energyshield など全空のケースあり)
 *   }
 *
 *   実機検証: snapshot 1623-20260521-21119, Blood Mage, sort=dps, 41089 bytes,
 *   96/100 rows に account-discriminator 出現。
 *
 * 使い方:
 *   node scripts/phase-alpha-decode-A.mjs
 *   node scripts/phase-alpha-decode-A.mjs --class "Oracle"
 *   node scripts/phase-alpha-decode-A.mjs --class "Blood Mage" --sort dps --top 50
 *   node scripts/phase-alpha-decode-A.mjs --raw   # 41KB のバイナリをそのまま .bin 保存
 * ============================================================================
 */
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE = resolve(ROOT, "data-cache");

const UA =
  "ExileDesk-Alpha-PoC/0.0.1 (engineering-A; poe.ninja protobuf decode PoC; contact via github.com/kyohei0612/exiledesk)";

/* ---------- args ---------- */
function parseArgs(argv) {
  const out = { class: "Blood Mage", sort: "dps", top: 50, raw: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--class") out.class = argv[++i];
    else if (a === "--sort") out.sort = argv[++i];
    else if (a === "--top") out.top = Number(argv[++i]);
    else if (a === "--raw") out.raw = true;
  }
  return out;
}

/* ---------- network ---------- */
async function fetchJSON(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} for ${url}`);
  return r.json();
}

async function fetchBytes(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/x-protobuf, application/octet-stream",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} for ${url}`);
  const ab = await r.arrayBuffer();
  return new Uint8Array(ab);
}

/* ---------- proto schema (in-memory, protobufjs dynamic) ----------
   フィールド ID とワイヤ型は phase-alpha-explore / find-players2 で実機バイナリから逆引き。
   wt=LEN の string か message かは、ペイロード次第で protobufjs の挙動が決まる:
   - "string" として定義した場合: UTF-8 文字列でデコードされる
   - "bytes" として定義した場合: そのまま Uint8Array で返る
   - メッセージ型として定義した場合: 再帰デコード
   Cell は同じフィールド ID が「列によって型が違う」(sparse oneof 風) なので
   ここでは bytes + 後段で手動アンパックする、という割り切り。
------------------------------------------------------------------- */
const PROTO_SOURCE = `
syntax = "proto3";

message SearchResponse {
  SearchBody body = 1;
}

message SearchBody {
  int64 seq = 1;
  repeated DimensionDescriptor dims = 2;
  repeated bytes f3 = 3;
  repeated StageTiming stages = 4;
  repeated Column columns = 5;
  repeated bytes f6 = 6;
  repeated bytes f7 = 7;
  repeated bytes f8 = 8;
  repeated bytes f9 = 9;
  repeated bytes f10 = 10;
  repeated bytes f11 = 11;
}

message DimensionDescriptor {
  string key = 1;
  string label = 2;
  repeated DimensionEntry entries = 3;
}

message DimensionEntry {
  int64 idx = 1;
  int64 count = 2;
}

message StageTiming {
  string name = 1;
  double seconds = 2;
}

message Column {
  string name = 1;
  repeated Cell values = 2;
}

message Cell {
  string display = 1;
  int64 numeric = 2;
  bytes extra = 3;
}
`;

const root = protobuf.parse(PROTO_SOURCE, { keepCase: true }).root;
const SearchResponse = root.lookupType("SearchResponse");

/* ---------- helpers ---------- */
const log = (...a) => console.error("[phase-alpha-A]", ...a);

/** Convert dps display strings like "202M", "1.4B", "30k" to a sortable number. */
function dpsDisplayToNumber(s) {
  if (typeof s !== "string" || s.length === 0) return null;
  const m = s.match(/^([\d.]+)\s*([kKmMbBtT]?)$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { "": 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12 }[unit];
  return v * mult;
}

/** Long → number when safely representable. */
function asNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v.toNumber === "function") return v.toNumber(); // protobufjs Long
  if (typeof v === "object" && "low" in v && "high" in v) {
    return v.high * 2 ** 32 + (v.low >>> 0);
  }
  return null;
}

/* ---------- main ---------- */
async function main() {
  const args = parseArgs(process.argv);
  log("args:", args);

  await mkdir(CACHE, { recursive: true });

  log("Step 1: GET /poe2/api/data/index-state (dynamic resolution)");
  const idx = await fetchJSON("https://poe.ninja/poe2/api/data/index-state");
  const league = idx.economyLeagues?.[0];
  const snap = idx.snapshotVersions?.[0];
  if (!league || !snap) throw new Error("index-state shape unexpected");
  log(`  league: ${league.name} (slug=${league.url})`);
  log(`  snapshot: version=${snap.version}, snapshotName=${snap.snapshotName}`);
  log(`  passive tree: ${snap.passiveTree ?? "(none)"}`);

  const klassEnc = encodeURIComponent(args.class).replace(/%20/g, "+");
  const url =
    `https://poe.ninja/poe2/api/builds/${snap.version}/search?` +
    `overview=${snap.snapshotName}` +
    `&class=${klassEnc}` +
    `&sort=${encodeURIComponent(args.sort)}`;
  log("Step 2: GET search protobuf");
  log(`  url: ${url}`);
  const bin = await fetchBytes(url);
  log(`  received ${bin.length} bytes (Content-Type: application/x-protobuf)`);

  if (args.raw) {
    const p = resolve(CACHE, `phase-alpha-${args.class.replace(/\s+/g, "_")}.bin`);
    await writeFile(p, bin);
    log(`  raw saved -> ${p}`);
  }

  log("Step 3: decode with restored proto schema (protobufjs dynamic)");
  let msg;
  try {
    msg = SearchResponse.decode(bin);
  } catch (e) {
    throw new Error("Protobuf decode failed: " + e.message);
  }
  const body = msg.body;
  if (!body || !body.columns) throw new Error("decoded message has no body.columns");
  log(`  decoded SearchBody.seq = ${asNumber(body.seq)}`);
  log(`  decoded ${body.columns.length} columns, ${body.stages?.length ?? 0} stages`);

  log("Step 4: extract player rows from column-major to row-major");
  // Build a lookup by column name
  const cols = Object.fromEntries(body.columns.map((c) => [c.name, c.values]));
  const knownColumns = Object.keys(cols);
  log(`  columns present: ${knownColumns.join(", ")}`);

  const rowCount = Math.max(...body.columns.map((c) => c.values.length));
  log(`  row count: ${rowCount}`);

  /** Pull a single field from a Cell, with type coercion. */
  function cellValue(cell, fieldName) {
    if (!cell) return null;
    const raw = cell[fieldName];
    if (raw === undefined || raw === null) return null;
    if (fieldName === "numeric") {
      const n = asNumber(raw);
      // proto3 default: missing numeric = 0. We can't distinguish "0" from "missing"
      // here, so the caller must know whether 0 is plausible.
      return n;
    }
    if (fieldName === "display") {
      return typeof raw === "string" && raw.length > 0 ? raw : null;
    }
    if (fieldName === "extra") {
      if (raw instanceof Uint8Array && raw.length > 0) return raw;
      return null;
    }
    return raw;
  }

  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    const account = cellValue(cols.account?.[i], "display");
    const name = cellValue(cols.name?.[i], "display");
    if (!account || !name) continue; // skip rows missing identifiers
    const level = cellValue(cols.level?.[i], "numeric");
    const life = cellValue(cols.life?.[i], "numeric");
    const energyshield = cellValue(cols.energyshield?.[i], "numeric");
    const dpsDisplay = cellValue(cols.dps?.[i], "display");
    const ehpDisplay = cellValue(cols.ehp?.[i], "display");

    rows.push({
      rank: i + 1,
      account,
      name,
      level: level || null,
      life: life || null,
      energyshield: energyshield || null,
      dps: dpsDisplay,
      dpsNumeric: dpsDisplayToNumber(dpsDisplay),
      ehp: ehpDisplay,
    });
  }

  log(`  valid (account+name present) rows: ${rows.length}`);

  const topN = rows.slice(0, args.top);
  const output = {
    source: "poe.ninja /poe2/api/builds/{version}/search (protobuf)",
    fetchedAt: new Date().toISOString(),
    league: { name: league.name, slug: league.url },
    snapshot: { version: snap.version, snapshotName: snap.snapshotName },
    query: { class: args.class, sort: args.sort },
    decoder: "phase-alpha-decode-A (protobufjs dynamic + restored schema)",
    bytes: bin.length,
    totalRows: rowCount,
    validRows: rows.length,
    topN: topN.length,
    rows: topN,
  };

  process.stdout.write(JSON.stringify(output, null, 2));
  process.stdout.write("\n");

  log(`DONE. wrote top ${topN.length} rows to stdout.`);
}

main().catch((e) => {
  console.error("[phase-alpha-A] FATAL:", e.stack || e.message);
  process.exit(1);
});
