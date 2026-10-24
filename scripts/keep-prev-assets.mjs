#!/usr/bin/env node
/**
 * keep-prev-assets.mjs — 本番を出す時に 1 つ前の版の塊 (assets/) も残して一緒に置く (2026-10-25、最終チェック長。案は docs/org/design/notes/2026-10-23-keep-prev-assets.md)
 * 開いたままのタブ・出した直後に Cloudflare が返す古い web.html (40 秒ほど古い版と新しい版が入れ替わりで返る) が前の版の塊を取っても 404 にならない。
 * 残すのは 1 つ前の版の自分の分だけ (その版が残していたさらに前の分は落とす = 膨らまない)。自分の分の一覧は node_modules/.cache/ (git にも配る物にも入らない)。
 * 一覧が無い時 (初回・出す端末が替わった時) は今ある assets/ を全部前の版と見る。OUT が空なら何も残らない (今までと同じ)。
 *   node scripts/keep-prev-assets.mjs save <OUT> <名前>      … vite build の前 (vite が OUT を空にするので退避)
 *   node scripts/keep-prev-assets.mjs restore <OUT> <名前>   … vite build の後 (今の版の一覧を覚え、前の版にだけある塊を足す)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, out, name] = process.argv.slice(2);
if (!["save", "restore"].includes(cmd) || !out || !name) {
  console.error("使い方: node scripts/keep-prev-assets.mjs save|restore <OUT> <名前>");
  process.exit(1);
}
const ASSETS = resolve(ROOT, out, "assets");
const OWN_FILE = resolve(ROOT, "node_modules", ".cache", `exiledesk-${name}-assets.json`);
const PREV = resolve(tmpdir(), `exiledesk-${name}-prev-assets`);

if (cmd === "save") {
  rmSync(PREV, { recursive: true, force: true });
  if (existsSync(ASSETS)) {
    const own = existsSync(OWN_FILE) ? JSON.parse(readFileSync(OWN_FILE, "utf8")) : readdirSync(ASSETS);
    mkdirSync(PREV, { recursive: true });
    for (const f of own) if (existsSync(resolve(ASSETS, f))) cpSync(resolve(ASSETS, f), resolve(PREV, f));
  }
} else {
  const own = readdirSync(ASSETS);
  mkdirSync(dirname(OWN_FILE), { recursive: true });
  writeFileSync(OWN_FILE, JSON.stringify(own));
  let kept = 0;
  if (existsSync(PREV)) {
    const now = new Set(own);
    for (const f of readdirSync(PREV)) if (!now.has(f)) { cpSync(resolve(PREV, f), resolve(ASSETS, f)); kept++; }
    rmSync(PREV, { recursive: true, force: true });
  }
  console.log(`塊: 今の版 ${own.length} 本 + 1 つ前の版から残した ${kept} 本`);
}
