#!/usr/bin/env node
/**
 * _daily-quality-probe.mjs — 読むだけ (D-03d の確かめ、デイリー部長 25)。本番 D1 の今週の忍者の品から、型ごとの品質 (samplesOf の quality) を出す。書かない
 *   node scripts/_daily-quality-probe.mjs [--day YYYY-MM-DD]
 */
import { bundleEntry } from "./_bundle-ts.mjs";
import { remoteD1 } from "./_d1-shim.mjs";

globalThis.location ??= { hostname: "", href: "", search: "", hash: "", pathname: "/" };
globalThis.history ??= { state: null, replaceState() {}, pushState() {}, back() {} };
const args = process.argv.slice(2);
const day = args.includes("--day") ? args[args.indexOf("--day") + 1] : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const M = await bundleEntry("scripts/_daily-roll-entry.ts");
const R = await bundleEntry("server/live/src/daily/roll.ts");
const data = M.loadPatchSync();
const inp = await R.rollJson(remoteD1(), Date.now(), day);
const withQ = inp.items.filter((it) => it.quality);
console.log(`週 ${inp.week}: 品 ${inp.items.length}・品質の値のある品 ${withQ.length}`);
const kinds = new Map();
for (const it of withQ) kinds.set(`${it.slot}|${it.quality_kind}`, (kinds.get(`${it.slot}|${it.quality_kind}`) ?? 0) + 1);
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  品質の種類 ${k} × ${n}`);
const r = M.samplesOf(data, inp.items);
console.log(`型 ${r.samples.length} (読めた品 ${r.read}・外した品 ${r.skipped})・品質つきの型 ${r.quality.size}`);
for (const s of r.samples) { const q = r.quality.get(s.id); if (q) console.log(`  ${s.id} ${s.base} (${s.n} 人): ${q.tag} ${q.value}%`); }
for (const t of inp.topics.slice(-3)) console.log(`お題 ${t.day} ${t.base} type_snap=${t.type_snap ?? "なし"}`);
console.log("済み");
