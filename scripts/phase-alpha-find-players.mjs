#!/usr/bin/env node
/**
 * phase-alpha-find-players.mjs
 * -------------------------------------------------------------------
 * data-cache/phase-alpha-search.bin の構造を再走査し、
 * account-discriminator 文字列が出現する LEN サブメッセージのパスと
 * 兄弟フィールドを列挙する。これで「プレイヤーレコード」の構造を確定する。
 * -------------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

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

function tryDecodeUtf8(sub) {
  try {
    const dec = new TextDecoder("utf-8", { fatal: true }).decode(sub);
    // Allow most characters (POE2 has unicode chars in names)
    // Reject if any control char other than tab/newline
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(dec)) return null;
    return dec;
  } catch {
    return null;
  }
}

function scan(buf, off, end, depth = 0, maxDepth = 8) {
  const fields = [];
  let p = off;
  while (p < end) {
    let tag, p2;
    try {
      [tag, p2] = readVarint(buf, p);
    } catch {
      return { fields, ok: false };
    }
    const fieldNo = Number(tag >> 3n);
    const wireType = Number(tag & 0x7n);
    p = p2;
    if (wireType === 0) {
      let v, np;
      try {
        [v, np] = readVarint(buf, p);
      } catch {
        return { fields, ok: false };
      }
      fields.push({ f: fieldNo, wt: "V", v: v.toString() });
      p = np;
    } else if (wireType === 1) {
      if (p + 8 > end) return { fields, ok: false };
      const dv = new DataView(buf.buffer, buf.byteOffset + p, 8);
      fields.push({ f: fieldNo, wt: "I64", d64: dv.getFloat64(0, true) });
      p += 8;
    } else if (wireType === 5) {
      if (p + 4 > end) return { fields, ok: false };
      const dv = new DataView(buf.buffer, buf.byteOffset + p, 4);
      fields.push({ f: fieldNo, wt: "I32", f32: dv.getFloat32(0, true), i32: dv.getInt32(0, true) });
      p += 4;
    } else if (wireType === 2) {
      let lenBig, np;
      try {
        [lenBig, np] = readVarint(buf, p);
      } catch {
        return { fields, ok: false };
      }
      const len = Number(lenBig);
      const start = np;
      const stop = start + len;
      if (stop > end) return { fields, ok: false };
      const sub = buf.subarray(start, stop);

      const asStr = tryDecodeUtf8(sub);
      let nested = null;
      if (depth < maxDepth && len > 0) {
        const r = scan(sub, 0, sub.length, depth + 1, maxDepth);
        if (r.ok) nested = r.fields;
      }
      const entry = { f: fieldNo, wt: "L", len };
      if (asStr !== null && /^[\w\s\-_./%():'+぀-ヿ一-鿿À-ɏ]+$/.test(asStr)) {
        entry.str = asStr;
      }
      if (nested) entry.n = nested;
      if (!nested && entry.str === undefined) entry.hex = Buffer.from(sub.subarray(0, Math.min(16, sub.length))).toString("hex");
      fields.push(entry);
      p = stop;
    } else {
      return { fields, ok: false };
    }
  }
  return { fields, ok: true };
}

async function main() {
  const bin = await readFile(resolve(ROOT, "data-cache/phase-alpha-search.bin"));
  const u8 = new Uint8Array(bin.buffer, bin.byteOffset, bin.length);
  const { fields: top } = scan(u8, 0, u8.length);

  // Unwrap: field 1 of top is the Search message
  const outer = top.find((f) => f.f === 1 && f.n);
  if (!outer) throw new Error("no outer field");

  // The outer.n contains fields:
  // - field 1 (VARINT): some seq/timestamp (21174 etc)
  // - field 2 (LEN, repeated): dimension descriptor (class/weaponmode/items/skills/...)
  // - field 3 (LEN, ??): another set
  // - field 4 (LEN, repeated): processing-stage timing
  //
  // We need to find where players are. They might be in field 5+ or further down.

  // List all top-level field numbers inside outer with counts and sizes
  const stats = new Map();
  for (const f of outer.n) {
    const e = stats.get(f.f) || { count: 0, sizes: [] };
    e.count++;
    if (f.wt === "L") e.sizes.push(f.len);
    stats.set(f.f, e);
  }
  console.log("Outer.field counts:");
  for (const [k, v] of [...stats.entries()].sort((a, b) => a[0] - b[0])) {
    const sizes = v.sizes;
    const sum = sizes.reduce((s, x) => s + x, 0);
    const min = sizes.length ? Math.min(...sizes) : null;
    const max = sizes.length ? Math.max(...sizes) : null;
    console.log(`  field ${k}: count=${v.count}, sumBytes=${sum}, minLen=${min}, maxLen=${max}`);
  }

  // Helper: traverse and find sub-messages that contain account-discriminator strings
  const acctRx = /^[\w]+-\d{3,5}$/;
  const hits = [];
  function walk(fields, path) {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const here = `${path}/${f.f}[${i}]`;
      if (f.str && acctRx.test(f.str)) {
        hits.push({ path: here, value: f.str });
      }
      if (f.n) walk(f.n, here);
    }
  }
  walk(outer.n, "outer");
  console.log(`\nAccount-discriminator hits: ${hits.length}`);
  for (const h of hits.slice(0, 5)) console.log(" ", h);

  // For each hit, find its enclosing message — track parent stack
  console.log("\nFinding parent record structure of first hit...");
  function findRecord(fields, path, depthLimit = 12) {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const here = `${path}/${f.f}[${i}]`;
      // If this LEN's nested contains a string matching account-discriminator,
      // then `f` itself is the player-record envelope.
      if (f.n) {
        for (const child of f.n) {
          if (child.str && acctRx.test(child.str)) {
            return { record: f, path: here };
          }
        }
        const found = findRecord(f.n, here, depthLimit - 1);
        if (found) return found;
      }
    }
    return null;
  }
  const rec = findRecord(outer.n, "outer");
  if (rec) {
    console.log(`\nPlayer record envelope at path: ${rec.path}`);
    console.log(`  field number: ${rec.record.f}, byte length: ${rec.record.len}`);
    console.log("  inner field signature:");
    for (const c of rec.record.n) {
      const v = c.str !== undefined ? `"${c.str}"` : c.v !== undefined ? c.v : c.d64 ?? c.f32 ?? c.i32 ?? c.hex ?? `nested(${c.n?.length} fields)`;
      console.log(`    f${c.f} ${c.wt} : ${typeof v === "string" ? v.substring(0, 120) : v}`);
    }

    // Now find ALL player records (siblings with same field number + same shape)
    // i.e. find the parent container that holds many of these.
    // Strategy: find the parent whose direct children include many entries
    // matching the same shape (containing account-discriminator string).
    console.log("\nFinding all player records...");
    function findContainer(fields, parentPath) {
      // direct children matching
      const childrenWithAcct = fields.filter((f) =>
        f.n?.some((c) => c.str && acctRx.test(c.str)),
      );
      if (childrenWithAcct.length >= 5) {
        return { parentPath, records: fields.filter((f) => f.f === childrenWithAcct[0].f) };
      }
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        if (f.n) {
          const r = findContainer(f.n, `${parentPath}/${f.f}[${i}]`);
          if (r) return r;
        }
      }
      return null;
    }
    const container = findContainer(outer.n, "outer");
    if (container) {
      console.log(`  Container at ${container.parentPath}, total records (same field-no): ${container.records.length}`);
      const playerRecords = container.records.filter((r) =>
        r.n?.some((c) => c.str && acctRx.test(c.str)),
      );
      console.log(`  Records actually containing account-discriminator: ${playerRecords.length}`);

      // Inspect the *first 3* player records to determine field schema
      console.log("\nInspecting first 3 player record inner fields:");
      for (let i = 0; i < Math.min(3, playerRecords.length); i++) {
        const r = playerRecords[i];
        console.log(`\n--- player ${i} (record length=${r.len}) ---`);
        for (const c of r.n) {
          let val;
          if (c.str !== undefined) val = `"${c.str.substring(0, 60)}"`;
          else if (c.v !== undefined) val = `varint ${c.v}`;
          else if (c.d64 !== undefined) val = `f64 ${c.d64}`;
          else if (c.f32 !== undefined) val = `f32 ${c.f32}`;
          else if (c.i32 !== undefined) val = `i32 ${c.i32}`;
          else if (c.n) val = `nested(${c.n.length})`;
          else if (c.hex) val = `bytes ${c.hex}`;
          else val = "?";
          console.log(`  f${c.f} ${c.wt} ${val}`);
        }
      }

      // Build a "schema" by taking the union of (field-no, wire-type) seen across players
      const schema = new Map();
      for (const r of playerRecords) {
        for (const c of r.n) {
          const k = `${c.f}|${c.wt}`;
          const s = schema.get(k) || {
            field: c.f,
            wt: c.wt,
            count: 0,
            samples: [],
            stringValues: new Set(),
            numericRange: null,
          };
          s.count++;
          if (s.samples.length < 4) s.samples.push(c);
          if (c.str !== undefined) s.stringValues.add(c.str);
          if (c.v !== undefined) {
            const n = Number(c.v);
            if (!s.numericRange) s.numericRange = { min: n, max: n };
            else {
              s.numericRange.min = Math.min(s.numericRange.min, n);
              s.numericRange.max = Math.max(s.numericRange.max, n);
            }
          }
          if (c.f32 !== undefined) {
            const n = c.f32;
            if (!s.numericRange) s.numericRange = { min: n, max: n };
            else {
              s.numericRange.min = Math.min(s.numericRange.min, n);
              s.numericRange.max = Math.max(s.numericRange.max, n);
            }
          }
          schema.set(k, s);
        }
      }
      console.log("\nPlayer record schema (union across all records):");
      const schemaArr = [...schema.values()].sort((a, b) => a.field - b.field);
      for (const s of schemaArr) {
        const stringSamples = [...s.stringValues].slice(0, 4).join(" | ");
        const range = s.numericRange ? `range[${s.numericRange.min}..${s.numericRange.max}]` : "";
        console.log(
          `  f${s.field} ${s.wt}: count=${s.count} ${range} ${stringSamples ? `strings={${stringSamples}}` : ""}`,
        );
      }

      // Save full first 3 records to JSON for offline review
      await writeFile(
        resolve(ROOT, "data-cache/phase-alpha-players-sample.json"),
        JSON.stringify(playerRecords.slice(0, 3), (_, v) => (typeof v === "bigint" ? v.toString() : v), 2),
      );
      console.log("\nSaved sample to data-cache/phase-alpha-players-sample.json");
    } else {
      console.log("  ERROR: container with multiple records not found");
    }
  } else {
    console.log("  ERROR: player record not found");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
