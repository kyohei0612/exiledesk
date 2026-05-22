#!/usr/bin/env node
/**
 * Deep dive into the "dps" column to understand exactly which inner field
 * carries the numeric sort value vs the display string.
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function readVarint(buf, off) {
  let val = 0n;
  let shift = 0n;
  let p = off;
  while (true) {
    if (p >= buf.length) throw new Error("varint");
    const b = buf[p++];
    val |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7n;
  }
  return [val, p];
}

function tryStr(sub) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(sub);
  } catch {
    return null;
  }
}

function scan(buf, off, end, depth = 0, maxDepth = 12) {
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
      fields.push({ f: fieldNo, wt: "I32", f32: dv.getFloat32(0, true) });
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
      let nested = null;
      if (depth < maxDepth && len > 0) {
        const r = scan(sub, 0, sub.length, depth + 1, maxDepth);
        if (r.ok) nested = r.fields;
      }
      const str = tryStr(sub);
      const entry = { f: fieldNo, wt: "L", len };
      if (str !== null) entry.str = str;
      if (nested) entry.n = nested;
      if (!nested && entry.str === undefined) entry.hex = Buffer.from(sub).toString("hex");
      fields.push(entry);
      p = stop;
    } else {
      return { fields, ok: false };
    }
  }
  return { fields, ok: true };
}

const bin = await readFile(resolve(ROOT, "data-cache/phase-alpha-search.bin"));
const { fields: top } = scan(new Uint8Array(bin.buffer, bin.byteOffset, bin.length), 0, bin.length);
const outer = top.find((f) => f.f === 1 && f.n);
const f5s = outer.n.filter((f) => f.f === 5);

// Show full first 3 rows for level, life, dps, ehp, name
for (const colName of ["name", "account", "level", "life", "dps", "ehp", "energyshield"]) {
  const col = f5s.find((e) => e.n?.[0]?.str === colName);
  if (!col) { console.log(`(no col '${colName}')`); continue; }
  console.log(`\n=== column '${colName}' (len=${col.len}) ===`);
  const values = col.n.filter((c) => c.f === 2);
  console.log(`  values count: ${values.length}`);
  for (let i = 0; i < Math.min(5, values.length); i++) {
    console.log(`  [${i}]:`, JSON.stringify(values[i], (_, v) => typeof v === "bigint" ? v.toString() : v, 0).slice(0, 200));
  }
}
