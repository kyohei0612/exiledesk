#!/usr/bin/env node
/**
 * refresh-client-data.mjs — ゲームのパッチの後に、クライアント由来のデータを順に全部作り直す (2026-09-29)
 *
 * オーナー「全部 8 点に」の保守・引き継ぎ: 作り直しのスクリプトがバラバラ (build:* が 5 本 + 単発が 10 本以上) で、
 * 順番を知っている人しか回せなかった。ここに順番を 1 本にまとめる。最後にテスト (pnpm test) で答えが変わっていないか見る。
 *
 *   pnpm data:client              … 全部 (書き出し → 辞書 → 計算機 → クラフトステージ → 画像 → スキン → 画像パック → テスト)
 *   pnpm data:client --list       … 段の一覧だけ出す
 *   pnpm data:client --from 5     … 5 段目から (途中で落ちた時の続き)
 *   pnpm data:client --no-art     … 画像を作り直さない (時間がかかる。画像が変わらないパッチの時)
 * 前提: Steam の PoE2 が入っている (C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2)、ffmpeg が PATH にある。
 * 画像が変わったら、コミットして push した後に `node scripts/asset-packs.mjs --publish` (CI のリリースでも自動で走る)。
 * 全体の地図は docs/ARCHITECTURE.md。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const LIST = args.includes("--list");
const NO_ART = args.includes("--no-art");
const FROM = Number(args[args.indexOf("--from") + 1] ?? 1) || 1;

/** クライアントの表の書き出し (data-cache/client-export-*\/config.json ごと。client-export 本体は build-dicts が自分で書き出す) */
const exportDirs = readdirSync(resolve(ROOT, "data-cache"))
  .filter((d) => d.startsWith("client-export-") && existsSync(resolve(ROOT, "data-cache", d, "config.json")));

/** 段: [名前, 実行する物 (cwd, コマンド, 引数)[]] */
const STEPS = [
  ["クライアントの表を書き出す", exportDirs.map((d) => [join("data-cache", d), "npx", ["pathofexile-dat"]])],
  ["辞書 (名前・MOD の文面・エッセンス・ジェム)", [[".", "pnpm", ["build:dicts:client"]]]],
  ["パッシブの日本語名 (キーストーン)", [[".", "node", ["scripts/build-passives-ja.mjs"]]]],
  ["計算機のベース (クライアントで補う行・付与スキル)", [[".", "pnpm", ["build:htc-bases"]]]],
  ["ベース → エンジンの行の対応表", [[".", "node", ["scripts/build-htc-base-rows.mjs"]]]],
  ["値段のキー (カレンシー・骨・お告げ・エッセンス・カタリスト)", [[".", "pnpm", ["build:htc-price-keys"]]]],
  ["クラフトステージのベースの数値", [[".", "node", ["scripts/build-craft-stage-bases.mjs"]]]],
  ["ヴァールのエンチャント", [[".", "node", ["scripts/build-vaal-enchants-from-client.mjs"]]]],
  ["生贄のオーブの上がり先", [[".", "node", ["scripts/build-vaal-upgrades.mjs"]]]],
  ["ユニークの効果 (poe2db の保存済みページ)", [[".", "node", ["scripts/build-craft-stage-uniques.mjs"]]]],
  ["ベースの絵", NO_ART ? [] : [[".", "node", ["scripts/build-base-art-from-client.mjs"]]]],
  ["ユニークの絵", NO_ART ? [] : [[".", "node", ["scripts/build-unique-art-from-client.mjs"]]]],
  ["スキン (PoE1 / PoE2 で使えるか + 画像)", [[".", "node", ["scripts/build-mtx-from-client.mjs", ...(NO_ART ? ["--no-art"] : [])]]]],
  ["画像パックの版", [[".", "node", ["scripts/asset-packs.mjs"]]]],
  ["テスト (答えが変わっていないか)", [[".", "pnpm", ["test"]]]],
];

if (LIST) {
  STEPS.forEach(([name, cmds], i) => console.log(`${String(i + 1).padStart(2)}. ${name}${cmds.length ? "" : " (飛ばす)"}`));
  process.exit(0);
}
const t0 = Date.now();
for (let i = FROM - 1; i < STEPS.length; i++) {
  const [name, cmds] = STEPS[i];
  const s0 = Date.now();
  console.log(`\n=== ${i + 1}/${STEPS.length} ${name} ===`);
  for (const [cwd, cmd, a] of cmds) {
    const r = spawnSync(cmd, a, { cwd: resolve(ROOT, cwd), stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) {
      console.error(`\n× ${i + 1} 段目「${name}」で止まった (${cwd} で ${cmd} ${a.join(" ")})。直したら --from ${i + 1} で続きから`);
      process.exit(1);
    }
  }
  console.log(`○ ${name} (${((Date.now() - s0) / 1000).toFixed(0)} 秒)`);
}
console.log(`\n全部済んだ (${((Date.now() - t0) / 60000).toFixed(1)} 分)。git diff で変わった所を見て、画像が変わっていたら push 後に asset-packs.mjs --publish`);
