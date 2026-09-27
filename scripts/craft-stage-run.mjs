#!/usr/bin/env node
/**
 * craft-stage-run.mjs — クラフトステージの再生 (手順 JSON → 結果 JSON)。POE2Tube の動画生成から呼ぶ (2026-09-27、ADR-001)
 *
 *   node scripts/craft-stage-run.mjs plan.json result.json [--prices prices.json] [--league "Forbidden Rites"] [--generated-at ISO]
 *
 * 形は POE2Tube の contracts (craft-stage-plan/1 → craft-stage-result/1)。同じ手順 JSON なら同じ結果 JSON
 * (1 手ごとの seed = plan.seed + 手の番号。--generated-at を渡せば時刻も固定できる)。
 * 値段 (高貴建て): --prices の JSON ({ "transmute": 0.05, ... } か { "currency": { ... } }) を使う。無ければ検算用の固定相場
 * (scripts/_htc-test-prices.mjs、2026-09-23 の相場)。アプリの相場 (market-store) は Node から読めないので、最新の値段が
 * 要る時はアプリから相場を書き出して渡す。外部 API は叩かない。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { prices as testPrices } from "./_htc-test-prices.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const [planPath, outPath] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!planPath || !outPath) {
  console.error("使い方: node scripts/craft-stage-run.mjs plan.json result.json [--prices prices.json] [--league 名前] [--generated-at ISO]");
  process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const pricesArg = opt("--prices");
const priceFile = pricesArg ? JSON.parse(readFileSync(pricesArg, "utf8")) : null;
const prices = priceFile ? (priceFile.currency ?? priceFile) : testPrices.currency;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const mods = JSON.parse(readFileSync(join(root, "src/vendor/poe2htc/data/mods.json"), "utf8"));

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const result = M.runPlan(data, plan, {
  prices,
  exiledeskVersion: pkg.version,
  patch: mods.patch ?? "unknown",
  league: opt("--league") ?? null,
  ...(opt("--generated-at") ? { generatedAt: opt("--generated-at") } : {}),
});
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
const missing = [...new Set(plan.steps.map((s) => s.currency).filter((k) => prices[k] == null))];
if (missing.length) console.warn(`相場に無いカレンシー (費用 0 で数える): ${missing.join(", ")}`);
const ok = result.steps.filter((s) => s.applied).length;
console.log(`${result.steps.length} 手 (打てた ${ok}) / 最後: ${result.final.rarity} ${result.final.prefixes.length + result.final.suffixes.length} MOD / 費用 ${result.total_cost.toFixed(2)} 高貴${priceFile ? "" : " (検算用の固定相場)"} -> ${outPath}`);
