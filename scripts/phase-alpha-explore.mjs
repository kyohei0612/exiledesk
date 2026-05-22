#!/usr/bin/env node
/**
 * phase-alpha-explore.mjs
 * -------------------------------------------------------------------
 * Phase α / engineering-A 探索スクリプト
 *
 * 目的: poe.ninja `/poe2/api/builds/{version}/search` の protobuf
 *      レスポンスバイナリを取得し、wire format を観察する。
 *      これに基づいて proto schema を手動復元する材料を得る。
 *
 * Usage: node scripts/phase-alpha-explore.mjs
 * -------------------------------------------------------------------
 */
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE = resolve(ROOT, "data-cache");

const UA = "ExileDesk-Alpha-PoC/0.0.1 (engineering-A; +github.com/kyohei0612/exiledesk)";

const log = (...a) => console.log("[explore]", ...a);

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.json();
}

async function fetchBytes(url) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/x-protobuf" } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** ---------- protobuf wire format low level ---------- */
function readVarint(buf, off) {
  let val = 0n;
  let shift = 0n;
  let p = off;
  while (true) {
    if (p >= buf.length) throw new Error("varint runs past end");
    const b = buf[p++];
    val |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7n;
    if (shift > 70n) throw new Error("varint too long");
  }
  return [val, p];
}

const WT_NAMES = { 0: "VARINT", 1: "I64", 2: "LEN", 5: "I32" };

/**
 * Scan raw protobuf wire structure with depth-limited recursion.
 * For LEN-typed fields, try interpreting as nested message if it parses
 * cleanly; otherwise fall back to string / bytes.
 */
function scanMessage(buf, off, end, depth = 0, maxDepth = 6) {
  const fields = [];
  let p = off;
  while (p < end) {
    let tag, p2;
    try {
      [tag, p2] = readVarint(buf, p);
    } catch (e) {
      fields.push({ error: "varint", at: p });
      return fields;
    }
    const fieldNo = Number(tag >> 3n);
    const wireType = Number(tag & 0x7n);
    p = p2;
    if (wireType === 0) {
      const [v, np] = readVarint(buf, p);
      fields.push({ field: fieldNo, wt: "VARINT", value: v.toString() });
      p = np;
    } else if (wireType === 1) {
      if (p + 8 > end) return fields;
      const v = buf.subarray(p, p + 8);
      fields.push({ field: fieldNo, wt: "I64", hex: Buffer.from(v).toString("hex") });
      p += 8;
    } else if (wireType === 5) {
      if (p + 4 > end) return fields;
      const v = buf.subarray(p, p + 4);
      const f = new DataView(buf.buffer, buf.byteOffset + p, 4).getFloat32(0, true);
      fields.push({ field: fieldNo, wt: "I32", float: f, hex: Buffer.from(v).toString("hex") });
      p += 4;
    } else if (wireType === 2) {
      const [lenBig, np] = readVarint(buf, p);
      const len = Number(lenBig);
      const start = np;
      const stop = start + len;
      if (stop > end) return fields;
      const sub = buf.subarray(start, stop);

      // Try interpret as UTF-8 printable string
      let asStr = null;
      try {
        const dec = new TextDecoder("utf-8", { fatal: true }).decode(sub);
        // Accept if printable-ish
        if (/^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(dec) && dec.length > 0) {
          asStr = dec;
        }
      } catch {
        /* not utf-8 */
      }

      // Try nested message
      let nested = null;
      if (depth < maxDepth) {
        try {
          const peek = scanMessage(sub, 0, sub.length, depth + 1, maxDepth);
          // Only accept nested if every byte was consumed cleanly (no error)
          const lastErr = peek.find((f) => f.error);
          if (!lastErr && peek.length > 0) nested = peek;
        } catch {
          /* not a message */
        }
      }

      const entry = { field: fieldNo, wt: "LEN", len };
      if (nested && (!asStr || sub.length > 32)) entry.nested = nested;
      if (asStr) entry.string = asStr;
      if (!nested && !asStr) entry.hex = Buffer.from(sub.subarray(0, Math.min(32, sub.length))).toString("hex");
      fields.push(entry);
      p = stop;
    } else {
      fields.push({ field: fieldNo, wt: wireType, error: "unknown wire type" });
      return fields;
    }
  }
  return fields;
}

/* ---------- main ---------- */
async function main() {
  log("Step 1: fetch index-state");
  const idx = await fetchJSON("https://poe.ninja/poe2/api/data/index-state");
  const league = idx.economyLeagues?.[0];
  const snap = idx.snapshotVersions?.[0];
  if (!league || !snap) throw new Error("index-state shape unexpected");
  log(`  league: ${league.name} (${league.url})`);
  log(`  snapshot: version=${snap.version} snapshotName=${snap.snapshotName}`);

  const version = snap.version;
  const snapshotName = snap.snapshotName;
  const klass = "Blood+Mage";

  log("Step 2: fetch search protobuf");
  const url = `https://poe.ninja/poe2/api/builds/${version}/search?overview=${snapshotName}&class=${klass}&sort=dps`;
  log(`  GET ${url}`);
  const bin = await fetchBytes(url);
  log(`  ${bin.length} bytes`);

  await writeFile(resolve(CACHE, "phase-alpha-search.bin"), bin);
  log(`  saved -> data-cache/phase-alpha-search.bin`);

  log("Step 3: raw wire scan (top level)");
  const top = scanMessage(bin, 0, bin.length);

  // Field-no histogram + sizes
  const hist = new Map();
  for (const f of top) {
    const k = `${f.field}|${f.wt}`;
    const e = hist.get(k) || { count: 0, sample: null };
    e.count++;
    if (!e.sample) e.sample = f;
    hist.set(k, e);
  }
  const histArr = [...hist.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([k, v]) => ({ key: k, count: v.count }));
  log("Top-level field-no histogram:");
  console.table(histArr.slice(0, 30));

  // Dump first ~5 of each LEN-typed field with nested structure
  log("Step 4: structure preview (first 3 occurrences of each LEN field)");
  const lenSeen = new Map();
  for (const f of top) {
    if (f.wt !== "LEN") continue;
    const k = `${f.field}`;
    const cnt = lenSeen.get(k) || 0;
    if (cnt >= 3) continue;
    lenSeen.set(k, cnt + 1);
    console.log(`-- field ${f.field} occurrence #${cnt} (len=${f.len}) --`);
    console.dir(f, { depth: 6, maxArrayLength: 50 });
  }

  // Save full structure for offline study
  await writeFile(
    resolve(CACHE, "phase-alpha-search.structure.json"),
    JSON.stringify(top, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  );
  log("Full structure saved -> data-cache/phase-alpha-search.structure.json");

  log("Step 5: account-discriminator string harvest (any LEN field containing '-####')");
  const accountRx = /^[A-Za-z0-9_]+-\d{3,5}$/;
  function harvest(fields, hits, path = "") {
    for (const f of fields) {
      const here = path ? `${path}.${f.field}` : `${f.field}`;
      if (f.string && accountRx.test(f.string)) {
        hits.push({ at: here, value: f.string });
      }
      if (f.nested) harvest(f.nested, hits, here);
    }
    return hits;
  }
  const acctHits = harvest(top, []);
  log(`  account-discriminator string hits: ${acctHits.length}`);
  console.log(acctHits.slice(0, 8));

  // Strings that look like player names (printable, 2-30 chars, no whitespace, mixed)
  log("Step 6: candidate name strings (per top-level group)");
  // Find the field that contains the most entries (likely the repeated 'players' field)
  const lenGroups = new Map();
  for (const f of top) {
    if (f.wt !== "LEN" || !f.nested) continue;
    const k = `${f.field}`;
    lenGroups.set(k, (lenGroups.get(k) ?? 0) + 1);
  }
  const sortedGroups = [...lenGroups.entries()].sort((a, b) => b[1] - a[1]);
  console.log("Top repeated LEN field-nos:", sortedGroups.slice(0, 8));

  // For the most repeated group, inspect inner field signature for first 3 entries
  if (sortedGroups.length > 0) {
    const [topField] = sortedGroups[0];
    const matches = top.filter((f) => `${f.field}` === topField && f.nested);
    log(`Step 7: inner field signature of top repeated field #${topField} (${matches.length} occurrences)`);
    for (let i = 0; i < Math.min(3, matches.length); i++) {
      console.log(`--- entry ${i} ---`);
      console.dir(matches[i].nested, { depth: 4, maxArrayLength: 50 });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
