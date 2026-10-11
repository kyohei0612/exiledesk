#!/usr/bin/env node
/**
 * build-popular-bases.mjs — ベース選びの「人気のベース」(2026-10-11 オーナー「人気のベースいいかもね各部位で」)
 *   node scripts/build-popular-bases.mjs   (先に node scripts/pull-logs.mjs で data-cache/logs/<日付>.jsonl を取っておく)
 * 分析用の記録 (emu_use) から、そのベースで 5 手以上打った人の数を数えて src/data/popular-bases.json に書く。
 * 既定の金の指輪のまま少し触って帰った人を数えないための 5 手。部位ごとの並びは画面 (BaseCatalog.vue) がこの数で決める
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "data-cache/logs");
const MIN_STEPS = 5;
const files = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
if (!files.length) { console.error("data-cache/logs に日付の記録が無い (pull-logs.mjs で取る)"); process.exit(1); }
/** ベース → 人 → 手の数 */
const steps = new Map();
for (const f of files) {
  for (const line of readFileSync(resolve(DIR, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const b = JSON.parse(line).b ?? {};
    for (const r of b.recs ?? []) {
      if (r.k !== "emu_use" || !r.d?.base || !b.uid) continue;
      const m = steps.get(r.d.base) ?? new Map();
      m.set(b.uid, (m.get(b.uid) ?? 0) + 1);
      steps.set(r.d.base, m);
    }
  }
}
const users = Object.fromEntries([...steps].map(([base, m]) => [base, [...m.values()].filter((n) => n >= MIN_STEPS).length]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]));
const out = { from: files[0].slice(0, 10), to: files.at(-1).slice(0, 10), minSteps: MIN_STEPS, users };
writeFileSync(resolve(ROOT, "src/data/popular-bases.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${files.length} 日分 → ${Object.keys(users).length} ベース (上位: ${Object.entries(users).slice(0, 8).map(([b, n]) => `${b} ${n}`).join(", ")})`);
