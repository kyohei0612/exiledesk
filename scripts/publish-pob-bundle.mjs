#!/usr/bin/env node
/**
 * publish-pob-bundle.mjs (2026-09-08)
 * --------------------------------------------------------------
 * build-pob-bundle.mjs が組み立てた `src-tauri/resources/pob/` を zip にして、GitHub Release の
 * 固定タグ `pob-bundle` (rolling) に manifest と一緒に置く。アプリはこれを別途ダウンロードする
 * (インストーラには同梱しない → 更新のたびに 120 MB 落とさなくて済む)。
 *
 *   - contentHash: 同梱物の内容ハッシュ (exiledesk-pob.json の builtAt は除く)。既存 manifest と同じなら
 *     アップロードしない (PoB / PoB2-JP が変わったときだけ差し替わる)
 *   - zipSha256 / zipSize: アプリ側のダウンロード検証用
 *
 * Usage: node scripts/publish-pob-bundle.mjs [--dry-run]
 *   要 gh CLI (CI では GITHUB_TOKEN → GH_TOKEN)。zip は PowerShell Compress-Archive (Windows 前提)。
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(ROOT, "src-tauri/resources/pob");
const OUT_DIR = resolve(ROOT, "data-cache/pob-bundle");
const ZIP = join(OUT_DIR, "pob-bundle.zip");
const MANIFEST = join(OUT_DIR, "pob-bundle.json");
const TAG = "pob-bundle";
const REPO = "kyohei0612/ExileDesk";
const DRY = process.argv.includes("--dry-run");

const log = (...a) => console.log("[publish-pob-bundle]", ...a);

async function* walk(dir) {
  for (const ent of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** 内容ハッシュ: 相対パス + 中身 (exiledesk-pob.json は builtAt が毎回変わるので除外し、version 等だけ混ぜる) */
async function contentHash(meta) {
  const h = createHash("sha256");
  h.update(JSON.stringify({ version: meta.version, tree: meta.tree, jp: meta.jp }));
  for await (const p of walk(SRC)) {
    const rel = relative(SRC, p).replace(/\\/g, "/");
    if (rel === "exiledesk-pob.json") continue;
    h.update(rel);
    h.update(await readFile(p));
  }
  return h.digest("hex");
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
  return { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

async function main() {
  const meta = JSON.parse(await readFile(join(SRC, "exiledesk-pob.json"), "utf8"));
  const hash = await contentHash(meta);
  log(`content hash ${hash.slice(0, 12)}… (PoB ${meta.version}, JP ${meta.jp ?? "-"})`);

  // 既存 manifest (無ければ初回)
  let current = null;
  const cur = sh("gh", ["release", "download", TAG, "-R", REPO, "-p", "pob-bundle.json", "-O", "-"]);
  if (cur.ok) {
    try {
      current = JSON.parse(cur.out);
    } catch {
      current = null;
    }
  }
  if (current?.contentHash === hash) {
    log("unchanged → upload skipped");
    return;
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await import("node:fs/promises").then((m) => m.mkdir(OUT_DIR, { recursive: true }));
  log("zipping (Compress-Archive)…");
  const z = sh("powershell", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${SRC.replace(/'/g, "''")}\\*' -DestinationPath '${ZIP.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`,
  ]);
  if (!z.ok) throw new Error(`Compress-Archive failed: ${z.out}`);
  const zipBuf = await readFile(ZIP);
  const zipSha = createHash("sha256").update(zipBuf).digest("hex");
  const size = (await stat(ZIP)).size;
  const manifest = {
    version: meta.version,
    tree: meta.tree,
    jp: meta.jp ?? null,
    contentHash: hash,
    zipSha256: zipSha,
    zipSize: size,
    builtAt: meta.builtAt,
    url: `https://github.com/${REPO}/releases/download/${TAG}/pob-bundle.zip`,
  };
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  log(`zip ${(size / 1048576).toFixed(1)} MB, sha256 ${zipSha.slice(0, 12)}…`);
  if (DRY) {
    log("dry-run → not uploaded");
    return;
  }

  // release が無ければ作る
  const view = sh("gh", ["release", "view", TAG, "-R", REPO]);
  if (!view.ok) {
    const c = sh("gh", [
      "release",
      "create",
      TAG,
      "-R",
      REPO,
      "--title",
      "PoB bundle (rolling)",
      "--notes",
      "ExileDesk が別途ダウンロードする同梱 PoB (公式 PoB + PoB2-JP)。このタグは内容が変わるたびに上書きされます。",
    ]);
    if (!c.ok) throw new Error(`gh release create failed: ${c.out}`);
  }
  const up = sh("gh", ["release", "upload", TAG, ZIP, MANIFEST, "-R", REPO, "--clobber"]);
  if (!up.ok) throw new Error(`gh release upload failed: ${up.out}`);
  log("uploaded → " + manifest.url);
}

main().catch((e) => {
  console.error("[publish-pob-bundle] FAILED:", e);
  process.exit(1);
});
