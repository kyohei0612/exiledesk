#!/usr/bin/env node
/**
 * asset-packs.mjs — 画像を「画像のビルド」としてアプリ本体 (コードのビルド) から分ける (2026-09-29)
 *
 * オーナー「画像ビルドとコードビルドで完全に分けたら」「1 発目だけ配って、画像は 1 回配ったら再配布なし」。
 * 画像のフォルダ (public/<pack>) ごとに中身のハッシュ = 版を作り、アプリはその版の画像パックを 1 回だけ落として
 * <app_local_data_dir>/assets/<pack> に展開して使う (src-tauri/src/asset_packs.rs)。インストーラーには画像を入れない
 * (vite.config.ts が本番ビルドの dist から消す)。仕組みは PoB の別配布 (publish-pob-bundle.mjs) と同じ。
 *
 *   node scripts/asset-packs.mjs            … 版を計算して src/services/assets/asset-packs.json に書く (pnpm build の前に自動)
 *   node scripts/asset-packs.mjs --publish  … 版が公開済みと違うパックだけ zip にして GitHub Release の固定タグ asset-packs に上げる
 *                                             (CI の release.yml が本体のビルドの前に呼ぶ。要 gh CLI、zip は PowerShell)
 * 画像を増やす時は PACKS に 1 行足すだけ。
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 画像パック: 名前 = public/ の下のフォルダ名 = 画面から読む時の先頭 (/base-art/…) */
export const PACKS = ["base-art", "mtx-art"];
const TAG = "asset-packs";
const REPO = "kyohei0612/ExileDesk";
const OUT_DIR = resolve(ROOT, "data-cache/asset-packs");
const HASHES = resolve(ROOT, "src/services/assets/asset-packs.json");
const PUBLISH = process.argv.includes("--publish");
const log = (...a) => console.log("[asset-packs]", ...a);
const sh = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }); return { ok: r.status === 0, out: (r.stdout ?? "") + (r.stderr ?? "") }; };

async function hashOf(dir) {
  const h = createHash("sha256");
  for (const name of (await readdir(dir)).sort()) {
    h.update(name);
    h.update(await readFile(join(dir, name)));
  }
  return h.digest("hex").slice(0, 16);
}

const hashes = {};
for (const pack of PACKS) hashes[pack] = await hashOf(resolve(ROOT, "public", pack));
await mkdir(dirname(HASHES), { recursive: true });
const next = JSON.stringify({ packs: Object.fromEntries(PACKS.map((p) => [p, { hash: hashes[p] }])) }, null, 1) + "\n";
const prev = await readFile(HASHES, "utf8").catch(() => "");
if (prev.replace(/\r\n/g, "\n") !== next) await writeFile(HASHES, next);
log(PACKS.map((p) => `${p} ${hashes[p]}`).join(" / "));

if (PUBLISH) {
  if (!sh("gh", ["release", "view", TAG, "-R", REPO]).ok) {
    const c = sh("gh", ["release", "create", TAG, "-R", REPO, "--title", "Image packs (rolling)", "--prerelease", "--latest=false",
      "--notes", "ExileDesk の画像パック (ベースの絵・スキンの画像)。アプリが初回と、画像が変わった時だけ落とす。自動で上書きされる"]);
    if (!c.ok) throw new Error(`gh release create: ${c.out}`);
  }
  await mkdir(OUT_DIR, { recursive: true });
  for (const pack of PACKS) {
    const cur = sh("gh", ["release", "download", TAG, "-R", REPO, "-p", `${pack}.json`, "-O", "-"]);
    let published = null;
    try { published = cur.ok ? JSON.parse(cur.out) : null; } catch { published = null; }
    if (published?.contentHash === hashes[pack]) { log(`${pack}: 公開済みと同じ → 上げない`); continue; }
    const zip = join(OUT_DIR, `${pack}.zip`);
    await rm(zip, { force: true });
    const src = resolve(ROOT, "public", pack);
    const z = sh("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${src.replace(/'/g, "''")}/*' -DestinationPath '${zip.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`]);
    if (!z.ok) throw new Error(`Compress-Archive: ${z.out}`);
    const buf = await readFile(zip);
    const manifest = { pack, contentHash: hashes[pack], zipSha256: createHash("sha256").update(buf).digest("hex"), zipSize: (await stat(zip)).size, url: `https://github.com/${REPO}/releases/download/${TAG}/${pack}.zip` };
    const mf = join(OUT_DIR, `${pack}.json`);
    await writeFile(mf, JSON.stringify(manifest, null, 2) + "\n");
    // zip → manifest の順 (manifest が先に変わると、古い zip を新しい版として入れてしまう)
    for (const f of [zip, mf]) { const up = sh("gh", ["release", "upload", TAG, f, "-R", REPO, "--clobber"]); if (!up.ok) throw new Error(`gh release upload ${f}: ${up.out}`); }
    log(`${pack}: ${(manifest.zipSize / 1048576).toFixed(1)} MB を上げた (${hashes[pack]})`);
  }
}
