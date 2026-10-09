#!/usr/bin/env node
/**
 * deploy-web-dev.mjs — スマホ用の開発版 (公開しない) を置く (2026-10-09)
 *
 * オーナー「公開したらあかんからスマホ開発版も作ってくれ」。今の作業中の src を Web 版としてビルドし (dist-web-dev/、記録は送らない)、
 * 別の Worker (web-dev) に置く。鍵付きの URL で 1 回開いた端末だけが見られる (server/web/dev-gate.js)。
 * 鍵は初回だけ作って wrangler の secret に入れ、手元の .dev-web-key (git に入れない) に覚える。
 *
 *   pnpm deploy:web-dev     … ビルドして置き、開く URL (鍵付き) を出す
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY_FILE = resolve(ROOT, ".dev-web-key");
const run = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });

run("npx vue-tsc --noEmit");
run("npx vite build --config vite.web.config.ts", { env: { ...process.env, WEB_OUT: "dist-web-dev", VITE_DEV_PREVIEW: "1" } });

let key = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8").trim() : "";
const fresh = !key;
if (fresh) key = randomBytes(18).toString("base64url");
run("pnpm --dir server/web exec wrangler deploy -c wrangler.dev.jsonc");
if (fresh) {
  execSync("pnpm --dir server/web exec wrangler secret put DEV_KEY -c wrangler.dev.jsonc", { cwd: ROOT, input: key, stdio: ["pipe", "inherit", "inherit"] });
  writeFileSync(KEY_FILE, key + "\n");
}
console.log(`\n開く URL (この URL を 1 回開いた端末だけ見られる): https://web-dev.exiledesk.workers.dev/?k=${key}`);
