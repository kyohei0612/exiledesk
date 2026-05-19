#!/usr/bin/env node
/**
 * Stage A: 上流データ追従（auto extract）
 *
 * オーナー指示 (2026-05-09 「推奨で」) で採用した運用:
 *   - vendor/PathOfBuilding-PoE2 を git submodule で最新化
 *   - RePoE データ (data-cache/mods.{en,ja}.json) を refresh
 *   - bundle (mods-bundle.json) を再抽出
 *   - essence-mods.json を再抽出（PoB Essence.lua + manual-patches.json）
 *   - item-bases.json を再抽出
 *   - verify (guardrails、件数 sanity check)
 *
 * オーナーが「データ古いかも」と感じたら:
 *   node scripts/update-data.mjs
 *
 * git submodule の更新は破壊的でなく、commit はしないので任意のタイミングで実行可能。
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: true, cwd: ROOT, ...opts });
    p.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} exited ${code}`)),
    );
  });
}

async function step(label, fn) {
  console.log(`\n━━━ ${label} ━━━`);
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    console.log(`  ✓ ${label}  (${ms}ms)`);
  } catch (e) {
    console.error(`  ✗ ${label}  failed:`, e.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const skipPob = args.includes("--no-pob-update");
const skipRefresh = args.includes("--no-refresh");

console.log("ExileDesk data update — Stage A 自動追従");
console.log(`  flags: skipPob=${skipPob}  skipRefresh=${skipRefresh}`);

if (!skipPob) {
  await step("PoB-PoE2 submodule を upstream 最新版に更新", async () => {
    await run("git", [
      "submodule",
      "update",
      "--remote",
      "vendor/PathOfBuilding-PoE2",
    ]);
  });
} else {
  console.log("\n  (skipped: PoB submodule update)");
}

await step(
  `bundle を再抽出${skipRefresh ? "（cache 利用）" : "（RePoE re-fetch）"}`,
  async () => {
    const extra = skipRefresh ? [] : ["--refresh"];
    await run("node", ["scripts/extract-mods-bundle.mjs", ...extra]);
  },
);

await step("essence-mods.json を再抽出（PoB Essence.lua + manual patches）", async () => {
  await run("node", ["scripts/extract-essence-mods.mjs"]);
});

await step("item-bases.json を再抽出（PoB Data/Bases/）", async () => {
  await run("node", ["scripts/extract-item-bases.mjs"]);
});

await step(
  "trade2-static.json を取得（POE2 公式 trade API、craft-icons の image URL ソース）",
  async () => {
    // PowerShell の Invoke-WebRequest 使用（Windows でも curl 不要・依存最小）
    // 失敗時は警告のみ（既存の data-cache を使い続けてアイコン抽出に進める）
    try {
      await run("powershell", [
        "-Command",
        `Invoke-WebRequest -UseBasicParsing -Uri 'https://www.pathofexile.com/api/trade2/data/static' -OutFile 'data-cache/trade2-static.json'`,
      ]);
    } catch (e) {
      console.warn(`  ⚠ trade2 fetch 失敗: ${e.message} — 既存 cache を使用`);
    }
  },
);

await step(
  "craft-icons.json を再抽出（trade2-static + items-ja + alias 生成）",
  async () => {
    await run("node", ["scripts/extract-craft-icons.mjs"]);
  },
);

await step("verify-mods-bundle (guardrails)", async () => {
  await run("node", ["exiledesk/scripts/verify-mods-bundle.mjs"], { cwd: HERE.replace(/scripts$/, "..") }).catch(async () => {
    // 上のパス指定が間違ってたら fallback で直接呼ぶ
    await run("node", ["scripts/verify-mods-bundle.mjs"]);
  });
});

console.log("\n✓ Stage A 完了。pnpm tauri dev で動作確認してください。");
