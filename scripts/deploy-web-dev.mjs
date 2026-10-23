#!/usr/bin/env node
/**
 * deploy-web-dev.mjs — スマホ用の開発版 (公開しない) を置く (2026-10-09)
 *
 * オーナー「公開したらあかんからスマホ開発版も作ってくれ」。Web 版としてビルドし (dist-web-dev/、記録は送らない)、
 * 別の Worker (web-dev) に置く。鍵付きの URL で 1 回開いた端末だけが見られる (server/web/dev-gate.js)。
 * 鍵は初回だけ作って wrangler の secret に入れ、手元の .dev-web-key (git に入れない) に覚える。
 *
 * 2026-10-20: ビルドするのは commit 済みの HEAD だけ。同じフォルダーで何本ものセッションが書きかけを持つので、
 * HEAD を隣の作業場所 ../ExileDesk-devbuild (git worktree、detached) に出してそこで型チェックとビルドをする。
 * node_modules はリポジトリの物をつなぐだけ (junction)。書きかけ・他人の型エラーで止まらず、開発版にも出ない。
 *
 *   pnpm deploy:web-dev           … HEAD をビルドして置き、開く URL (鍵付き) を出す
 *   pnpm deploy:web-dev -- --wip  … 前の形: 今の作業中の src をそのままビルド (自分の確かめだけ)
 *
 * 2026-10-23: 1 つ前の版の塊 (assets/) も残して一緒に置く。開いたままのタブ・出した直後に Cloudflare が返す古い index.html
 * (40 秒ほど古い版と新しい版が入れ替わりで返る) が前の版の塊を取っても 404 にならない。残すのは 1 つ前の版の自分の分だけ
 * (その版が残していたさらに前の分は落とす)。自分の分の一覧は node_modules/.cache/ (git にも配る物にも入らない)
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEY_FILE = resolve(ROOT, ".dev-web-key");
const OUT = resolve(ROOT, "dist-web-dev");
const run = (cmd, opts = {}) => execSync(cmd, { windowsHide: true, cwd: ROOT, stdio: "inherit", ...opts });
const git = (args, cwd = ROOT) => execSync(`git ${args}`, { windowsHide: true, cwd, encoding: "utf8" }).trim();

const wip = process.argv.includes("--wip");
let src = ROOT;
let label = "作業中の src (--wip)";
if (!wip) {
  const sha = git("rev-parse HEAD");
  src = resolve(ROOT, "..", "ExileDesk-devbuild");
  if (!existsSync(resolve(src, ".git"))) run(`git worktree add --detach "${src}" ${sha}`);
  else {
    git(`checkout -q --detach --force ${sha}`, src);
    git("clean -fdq", src); // 前のビルドの残り (git に無い物) を消す。node_modules・dist は .gitignore なので残る
  }
  const nm = resolve(src, "node_modules");
  if (!existsSync(nm)) symlinkSync(resolve(ROOT, "node_modules"), nm, "junction");
  label = `HEAD ${sha.slice(0, 8)} ${git("log -1 --format=%s", src).slice(0, 60)}`;
}
console.log(`\nビルドする物: ${label}\n`);

run("npx vue-tsc --noEmit", { cwd: src });
// 1 つ前の版の自分の塊を退避 (vite が OUT を空にするので)。一覧が無い時 (初回) は今ある assets/ を全部前の版と見る
const ASSETS = resolve(OUT, "assets");
const OWN_FILE = resolve(ROOT, "node_modules", ".cache", "exiledesk-dev-web-assets.json");
const PREV = resolve(tmpdir(), "exiledesk-dev-web-prev-assets");
rmSync(PREV, { recursive: true, force: true });
if (existsSync(ASSETS)) {
  const own = existsSync(OWN_FILE) ? JSON.parse(readFileSync(OWN_FILE, "utf8")) : readdirSync(ASSETS);
  mkdirSync(PREV, { recursive: true });
  for (const f of own) if (existsSync(resolve(ASSETS, f))) cpSync(resolve(ASSETS, f), resolve(PREV, f));
}
run("npx vite build --config vite.web.config.ts", { cwd: src, env: { ...process.env, WEB_OUT: OUT, VITE_DEV_PREVIEW: "1" } });
// 今の版の自分の塊の一覧を覚え、前の版の塊のうち今の版に無い物を足す
const own = readdirSync(ASSETS);
mkdirSync(dirname(OWN_FILE), { recursive: true });
writeFileSync(OWN_FILE, JSON.stringify(own));
let kept = 0;
if (existsSync(PREV)) {
  const now = new Set(own);
  for (const f of readdirSync(PREV)) if (!now.has(f)) { cpSync(resolve(PREV, f), resolve(ASSETS, f)); kept++; }
  rmSync(PREV, { recursive: true, force: true });
}
console.log(`\n塊: 今の版 ${own.length} 本 + 1 つ前の版から残した ${kept} 本\n`);
// 読み物のページ (ベース一覧・サイトマップ。本番の build:web と同じ、2026-10-22 から開発版でも)
run(`node scripts/build-seo-pages.mjs "${OUT}"`, { cwd: src });
// ブログ (2026-10-22、開発版だけ。下書きも出す)。記事の元は src/data/blog/、作りは scripts/build-blog-pages.mjs
run(`node scripts/build-blog-pages.mjs "${OUT}" --drafts`, { cwd: src });

let key = existsSync(KEY_FILE) ? readFileSync(KEY_FILE, "utf8").trim() : "";
const fresh = !key;
if (fresh) key = randomBytes(18).toString("base64url");
run("pnpm --dir server/web exec wrangler deploy -c wrangler.dev.jsonc");
if (fresh) {
  execSync("pnpm --dir server/web exec wrangler secret put DEV_KEY -c wrangler.dev.jsonc", { windowsHide: true, cwd: ROOT, input: key, stdio: ["pipe", "inherit", "inherit"] });
  writeFileSync(KEY_FILE, key + "\n");
}
console.log(`\n置いた物: ${label}`);
console.log(`開く URL (この URL を 1 回開いた端末だけ見られる): https://web-dev.exiledesk.workers.dev/?k=${key}`);
