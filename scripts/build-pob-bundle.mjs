#!/usr/bin/env node
/**
 * build-pob-bundle.mjs
 * --------------------------------------------------------------
 * 目的:
 *   同梱 PoB (Path of Building Community – PoE2) を `src-tauri/resources/pob/` に
 *   組み立てる。Tauri の bundle.resources でインストーラに同梱され、
 *   左ナビ「PoB」から起動する (サブ PC でも別途インストール不要)。
 *
 * 入力 (git submodule `vendor/PathOfBuilding-PoE2`):
 *   runtime/   Windows 実行体 + DLL + lua/ + SimpleGraphic/ (公式 release と同じ配布物)
 *   src/       Launch.lua / Modules / Classes / Data / Assets / TreeData ...
 *
 * 出力レイアウト (公式インストール版と同じ「フラット」配置):
 *   resources/pob/
 *     Path of Building-PoE2.exe, *.dll, lua/, SimpleGraphic/
 *     Launch.lua, Modules/, Classes/, Data/, Assets/, TreeData/<latest>/ ...
 *     manifest.xml     ← Version に branch/platform を付けた「インストール版」形式
 *                         (repo の manifest は remote 形式なので PoB が dev mode に入り
 *                          ユーザーデータをインストール先に書いてしまう)
 *     installed.cfg    ← installedMode: ビルド保存先を Documents/Path of Building (PoE2)/ に
 *                         する (公式 PoB と共有、アプリ更新で消えない)
 *     Modules/ExileDeskOverlay.lua ← 自動更新 (UpdateCheck) の無効化 (同梱版を上書きさせない)
 *
 * TreeData は最新バージョン + legion のみ同梱 (旧 4 バージョンで 260MB あり、
 * PoB は必要になったツリーを遅延ロードするので新規ビルドには不要)。
 *
 * Usage:
 *   node scripts/build-pob-bundle.mjs          # 組み立て (既存出力は削除して作り直す)
 *   node scripts/build-pob-bundle.mjs --check  # 出力の存在確認のみ (exit 1 if missing)
 *
 * CI (release.yml) では tauri-action の前に実行する。ローカルでも
 * `pnpm tauri dev` / `pnpm tauri build` の前に 1 回実行しておくこと。
 */

import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const VENDOR = resolve(ROOT, "vendor/PathOfBuilding-PoE2");
const OUT = resolve(ROOT, "src-tauri/resources/pob");
const EXE_NAME = "Path of Building-PoE2.exe";
/** リポジトリ内ではスペースを {space} で表現している (公式 release 生成時に置換される) */
const EXE_NAME_IN_REPO = "Path{space}of{space}Building-PoE2.exe";

const ARGS = new Set(process.argv.slice(2));

function log(...a) {
  console.log("[pob-bundle]", ...a);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** src/GameVersions.lua の treeVersionList から最新ツリーバージョンを読む */
async function readLatestTreeVersion() {
  const lua = await readFile(join(VENDOR, "src/GameVersions.lua"), "utf-8");
  const m = lua.match(/treeVersionList\s*=\s*\{([^}]*)\}/);
  if (!m) throw new Error("treeVersionList not found in GameVersions.lua");
  const versions = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (versions.length === 0) throw new Error("treeVersionList is empty");
  return { versions, latest: versions[versions.length - 1] };
}

/** repo の manifest.xml から Version number を読む */
async function readVendorVersion() {
  const xml = await readFile(join(VENDOR, "manifest.xml"), "utf-8");
  const m = xml.match(/<Version\s+number="([^"]+)"/);
  return m ? m[1] : "0.0.0";
}

const OVERLAY_LUA = `-- ExileDeskOverlay.lua — ExileDesk 同梱 PoB 用の起動フック
-- Launch.lua から main:Init() 後に PLoadModule される (build-pob-bundle.mjs が挿入)。
--
-- 1) 自動更新の無効化: 同梱版は ExileDesk のリリースで丸ごと更新されるため、
--    PoB 自身の UpdateCheck (公式 manifest 取得 → ファイル上書き) を止める。
--    devMode は使わない (devMode だとユーザーデータがインストール先に書かれる)。
launch.CheckForUpdate = function() end
launch.ApplyUpdate = function() end
if main and main.SetWindowTitleSubtext then
  -- タイトルに同梱版であることを表示 (無い版もあるので存在確認)
  pcall(function() main:SetWindowTitleSubtext("ExileDesk 同梱版") end)
end
return true
`;

/** Launch.lua に overlay の読み込み行を挿入 (main:Init 成功直後) */
function patchLaunchLua(src) {
  const anchor = "errMsg = PCall(self.main.Init, self.main)";
  const idx = src.indexOf(anchor);
  if (idx < 0) throw new Error("Launch.lua anchor not found (PoB 側の構造変更?)");
  // anchor の後に続く `if errMsg then ... end` ブロックの閉じ `end` (タブ 2 個) の直後に挿入。
  // checkout 環境によって LF / CRLF どちらもあり得るので両対応。
  const m = /\r?\n\t\tend[ \t]*(\r?\n)/.exec(src.slice(idx));
  if (!m) throw new Error("Launch.lua end-of-Init block not found");
  const nl = m[1];
  const insertAt = idx + m.index + m[0].length - nl.length;
  const insert =
    `${nl}\t\t-- ExileDesk: 同梱版フック (自動更新の無効化など)${nl}` +
    '\t\tPLoadModule("Modules/ExileDeskOverlay")';
  return src.slice(0, insertAt) + insert + src.slice(insertAt);
}

async function main() {
  const exeSrc = join(VENDOR, "runtime", EXE_NAME_IN_REPO);
  if (ARGS.has("--check")) {
    const ok = (await exists(join(OUT, EXE_NAME))) && (await exists(join(OUT, "Launch.lua")));
    log(ok ? `OK: ${OUT}` : `MISSING: ${OUT} (run: node scripts/build-pob-bundle.mjs)`);
    process.exit(ok ? 0 : 1);
  }
  if (!(await exists(exeSrc))) {
    throw new Error(`${exeSrc} が無い。git submodule update --init --recursive を実行すること`);
  }

  const { versions, latest } = await readLatestTreeVersion();
  const version = await readVendorVersion();
  log(`vendor PoB ${version}, tree versions ${versions.join(",")} (bundle: ${latest} + legion)`);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // 1) runtime (exe / dll / lua / SimpleGraphic) をフラットにコピー。exe は {space} を実スペースに戻す
  await cp(join(VENDOR, "runtime"), OUT, {
    recursive: true,
    filter: (p) => !p.endsWith(EXE_NAME_IN_REPO),
  });
  await cp(exeSrc, join(OUT, EXE_NAME));

  // 2) src の中身をフラットにコピー (TreeData と Export は除外して後で選別)
  const SKIP_TOP = new Set(["TreeData", "Export"]);
  await cp(join(VENDOR, "src"), OUT, {
    recursive: true,
    filter: (p) => {
      const rel = p.slice(join(VENDOR, "src").length + 1);
      const top = rel.split(/[\\/]/)[0];
      return rel === "" || !SKIP_TOP.has(top);
    },
  });
  for (const tree of [latest, "legion"]) {
    const from = join(VENDOR, "src/TreeData", tree);
    if (await exists(from)) await cp(from, join(OUT, "TreeData", tree), { recursive: true });
  }

  // 3) Launch.lua に overlay 読み込みを挿入
  const launchPath = join(OUT, "Launch.lua");
  await writeFile(launchPath, patchLaunchLua(await readFile(launchPath, "utf-8")));
  await writeFile(join(OUT, "Modules/ExileDeskOverlay.lua"), OVERLAY_LUA);

  // 4) インストール版形式の manifest.xml (branch/platform 付き → devMode に入らない)
  await writeFile(
    join(OUT, "manifest.xml"),
    `<?xml version='1.0' encoding='UTF-8'?>\n<PoBVersion>\n\t<Version number="${version}" branch="release" platform="win32" />\n</PoBVersion>\n`,
  );
  // 5) installedMode → ユーザーデータは Documents/Path of Building (PoE2)/
  await writeFile(join(OUT, "installed.cfg"), "ExileDesk bundled PoB\n");
  // 6) 同梱版メタ (Rust 側 pob_launcher_status が読む)
  await writeFile(
    join(OUT, "exiledesk-pob.json"),
    JSON.stringify({ version, tree: latest, builtAt: new Date().toISOString() }, null, 2),
  );

  log(`done → ${OUT}`);
}

main().catch((e) => {
  console.error("[pob-bundle] FAILED:", e);
  process.exit(1);
});
