/**
 * check-data-fixes.mjs — 見張り: データの直しが当たらずに飛ばされていないか (E-06、2026-11-12)
 *
 * 読み込み (src/services/htc/patch.ts の applyExtras) は、土台の MOD の表の上に直しを何段も重ねる。直しは MOD の id・部位の行・段の必要レベルで
 * 当てるので、ゲームが変わって id や行が変わると黙って外れる。読み込みは外れを src/services/htc/fix-misses.ts に 1 件ずつ残すので、ここで数える。
 *   - 今ある外れは控え (check-data-fixes.baseline.json) に持ち、**控えに無い外れが 1 件でもあれば落ちる**
 *   - 控えにあって今は無い外れ (直った・直しを消した) は知らせるだけ。`--write` で控えを取り直す
 * 使い方: node scripts/check-data-fixes.mjs [--write] [--list]   (pnpm check:data-fixes)
 * データを作り直した後 (build-poe2db-fixes・build-htc-bases-from-client ほか) と、出す前に回す
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = resolve(ROOT, "scripts/check-data-fixes.baseline.json");
const args = new Set(process.argv.slice(2));

const M = await bundleEntry("scripts/_data-fixes-entry.ts");
const d = M.loadPatchSync();
const now = [...new Set(M.fixMisses().map((m) => `${m.step}\t${m.what}`))].sort();
const bySte = {};
for (const k of now) bySte[k.split("\t")[0]] = (bySte[k.split("\t")[0]] ?? 0) + 1;
console.log(`データの直しの外れ: ${now.length} 件 (MOD ${d.mods.size}・部位の行 ${d.bases.size})` + (now.length ? " — " + Object.entries(bySte).map(([s, n]) => `${s} ${n}`).join("・") : ""));
if (args.has("--list")) for (const k of now) console.log("  " + k);

if (args.has("--write")) {
  writeFileSync(BASE, JSON.stringify({ note: "今ある外れの控え (check-data-fixes.mjs --write)。増えたら落ちる", misses: now }, null, 1) + "\n");
  console.log(`控えを書いた: ${BASE}`);
  process.exit(0);
}
const base = new Set(existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")).misses : []);
const fresh = now.filter((k) => !base.has(k));
const gone = [...base].filter((k) => !now.includes(k));
if (gone.length) console.log(`控えより減った ${gone.length} 件 (直った・直しを消した): \`node scripts/check-data-fixes.mjs --write\` で控えを取り直す`);
if (fresh.length) {
  for (const k of fresh.slice(0, 40)) console.error(`✗ 当たらない直し: ${k.replace("\t", " — ")}`);
  if (fresh.length > 40) console.error(`  … ほか ${fresh.length - 40} 件 (--list で全部)`);
  console.error("→ ゲームのデータが変わって、直しの当て先 (MOD の id・部位の行・段) が無くなった。直しを今のデータに合わせて作り直す (poe2db-pool-fixes・poe2db-tag-fixes は台本、weight-overrides・poe2db-value-fixes は手)。要らなくなった直しなら消して --write (E-06)");
  process.exit(1);
}
console.log("OK: 控えに無い外れは 0");
