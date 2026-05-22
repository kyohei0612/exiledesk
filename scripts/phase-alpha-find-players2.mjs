#!/usr/bin/env node
/**
 * Inspect each outer.field-5 occurrence to determine which is accounts/names/etc.
 * Strategy: outer.field 5 appears to be a column/dimension descriptor.
 * Look at the FIRST inner field of each occurrence (usually a string label).
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
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(dec)) return null;
    return dec;
  } catch {
    return null;
  }
}

function scan(buf, off, end, depth = 0, maxDepth = 10) {
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
      if (asStr !== null) entry.str = asStr;
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
  const outer = top.find((f) => f.f === 1 && f.n);

  // All field-5 occurrences inside outer
  const f5 = outer.n.filter((f) => f.f === 5);
  console.log(`Number of outer.field-5: ${f5.length}`);

  for (let i = 0; i < f5.length; i++) {
    const e = f5[i];
    console.log(`\n=== outer.5[${i}] (len=${e.len}) ===`);
    // Show inner structure summary
    if (!e.n) {
      console.log("  (no nested)");
      continue;
    }
    // Field-no histogram inside this entry
    const inner = new Map();
    for (const c of e.n) {
      const e2 = inner.get(c.f) || { count: 0, sampleStr: null, sampleNum: null };
      e2.count++;
      if (c.str && !e2.sampleStr) e2.sampleStr = c.str.substring(0, 50);
      if (c.v !== undefined && e2.sampleNum === null) e2.sampleNum = c.v;
      inner.set(c.f, e2);
    }
    console.log("  inner field summary:");
    for (const [k, v] of [...inner.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    f${k}: count=${v.count} str=${v.sampleStr ?? "-"} num=${v.sampleNum ?? "-"}`);
    }
    // Display first 5 first-level entries
    console.log("  first 3 elements:");
    for (let j = 0; j < Math.min(3, e.n.length); j++) {
      const c = e.n[j];
      let val;
      if (c.str !== undefined) val = `"${c.str.substring(0, 80)}"`;
      else if (c.v !== undefined) val = `v${c.v}`;
      else if (c.n) {
        const childStrs = c.n.filter((x) => x.str !== undefined).map((x) => `f${x.f}=${JSON.stringify(x.str.substring(0, 40))}`).slice(0, 4).join(" ");
        const childNums = c.n.filter((x) => x.v !== undefined).map((x) => `f${x.f}=${x.v}`).slice(0, 4).join(" ");
        const childF = c.n.filter((x) => x.f32 !== undefined).map((x) => `f${x.f}=${x.f32?.toFixed?.(2) ?? x.f32}`).slice(0, 4).join(" ");
        val = `nested(${c.n.length}) {${childStrs} ${childNums} ${childF}}`;
      } else val = "?";
      console.log(`    [${j}] f${c.f}/${c.wt} ${val}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
