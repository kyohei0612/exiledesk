#!/usr/bin/env node
/**
 * build-pob-bundle.mjs
 * --------------------------------------------------------------
 * 目的:
 *   同梱 PoB (Path of Building Community – PoE2) **日本語版** を `src-tauri/resources/pob/` に
 *   組み立てる。Tauri の bundle.resources でインストーラに同梱され、
 *   左ナビ「PoB を開く」から起動する (サブ PC でも別途インストール不要)。
 *
 * 入力:
 *   vendor/PathOfBuilding-PoE2/   公式 PoB (git submodule、master = release ブランチ)
 *     runtime/   Windows 実行体 + DLL + lua/ + SimpleGraphic/
 *     src/       Launch.lua / Modules / Classes / Data / Assets / TreeData ...
 *   <PoB2-JP>/                    日本語化パッチ (ochi3/PoB2-JP、kyohei0612 フォーク)
 *     payload/scripts/Install-PoB2-JP.ps1  … 公式 PoB に当てる冪等インストーラ
 *     payload/runtime/SimpleGraphicExtend.dll … CJK 描画対応の SimpleGraphic (FreeType/HarfBuzz)
 *     payload/Data/Translate/ja-JP/*.csv     … 翻訳辞書
 *     探索順: 環境変数 POB2JP_DIR → vendor/PoB2-JP → C:/Users/kyohei/POE秘書/POBJP (開発機)
 *   vendor/fonts/BIZUDPGothic-*.ttf   日本語 UI フォント (SIL OFL、同梱可)
 *
 * 出力レイアウト (公式インストール版と同じ「フラット」配置):
 *   resources/pob/
 *     Path of Building-PoE2.exe, *.dll (JP 差替済), lua/, SimpleGraphic/Fonts/JpUI*.ttf
 *     Launch.lua (JP フック + ExileDesk フック), Modules/PoeJP/, Data/Translate/ja-JP/
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
 *   node scripts/build-pob-bundle.mjs            # 組み立て (既存出力は削除して作り直す)
 *   node scripts/build-pob-bundle.mjs --no-jp    # 英語版のみ (日本語化パッチを当てない)
 *   node scripts/build-pob-bundle.mjs --check    # 出力の存在確認のみ (exit 1 if missing)
 *
 * CI (release.yml) では tauri-action の前に実行する。ローカルでも
 * `pnpm tauri dev` / `pnpm tauri build` の前に 1 回実行しておくこと。
 */

import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const VENDOR = resolve(ROOT, "vendor/PathOfBuilding-PoE2");
const FONTS = resolve(ROOT, "vendor/fonts");
const OUT = resolve(ROOT, "src-tauri/resources/pob");
const EXE_NAME = "Path of Building-PoE2.exe";
/** リポジトリ内ではスペースを {space} で表現している (公式 release 生成時に置換される) */
const EXE_NAME_IN_REPO = "Path{space}of{space}Building-PoE2.exe";
/**
 * 日本語版で使う公式 runtime (exe / DLL / lua / SimpleGraphic) の基準コミット = PoB 0.22.0 release。
 * PoB2-JP の差替 SimpleGraphic.dll は payload 同梱の古い ANGLE / re2 / fmt / lua51 等とセットで動き、
 * その残り (libEGL.dll 等) は 0.22.0 の公式版と組み合わせた状態でオーナー環境の動作実績がある。
 * master (0.23.1) の libEGL.dll は新しい libGLESv2 の export を要求し、JP 同梱の libGLESv2 と
 * 組み合わせると起動時に「EGL_LockVulkanQueueANGLE が見つからない」で落ちる。
 * Lua 側 (src/) は master の最新を使う。
 */
const JP_RUNTIME_BASE_COMMIT = "860f4268299739ce9df87c4f373abe35824101cf"; // Release 0.22.0 (full SHA: CI の shallow checkout で fetch するため)
const POB2JP_CANDIDATES = [
  process.env.POB2JP_DIR,
  resolve(ROOT, "vendor/PoB2-JP"),
  "C:/Users/kyohei/POE秘書/POBJP",
].filter(Boolean);
/** PoB2-JP の Install-Fonts と同じ: 公式ビットマップフォント定義を JpUI.ttf へ向ける */
const FONT_TARGETS = [
  "Liberation Sans.tgf",
  "Liberation Sans Bold.tgf",
  "Bitstream Vera Sans Mono.tgf",
  "Fontin.tgf",
  "Fontin Italic.tgf",
  "Fontin SmallCaps.tgf",
  "Fontin SmallCaps Italic.tgf",
];

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

async function findPob2Jp() {
  for (const d of POB2JP_CANDIDATES) {
    if (await exists(join(d, "payload/scripts/Install-PoB2-JP.ps1"))) return d;
  }
  return null;
}

const OVERLAY_LUA = `-- ExileDeskOverlay.lua — ExileDesk 同梱 PoB 用の起動フック
-- Launch.lua から main:Init() 後に PLoadModule される (build-pob-bundle.mjs が挿入)。
--
-- 1) 自動更新の無効化: 同梱版は ExileDesk のリリースで丸ごと更新されるため、
--    PoB 自身の UpdateCheck (公式 manifest 取得 → ファイル上書き) を止める。
--    devMode は使わない (devMode だとユーザーデータがインストール先に書かれる)。
launch.CheckForUpdate = function() end
launch.ApplyUpdate = function() end
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

/** PoB2-JP の Install-PoB2-JP.ps1 を組み立て先に対して実行 (フック + CJK ランタイム + 辞書) */
function applyPob2Jp(pob2jpDir) {
  const ps1 = join(pob2jpDir, "payload/scripts/Install-PoB2-JP.ps1");
  log(`applying PoB2-JP from ${pob2jpDir}`);
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-PoBRoot", OUT, "-NoUpdate", "-Force"],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" },
  );
  const out = (r.stdout || "") + (r.stderr || "");
  for (const line of out.split(/\r?\n/).filter((l) => l.trim())) console.log("  [PoB2-JP] " + line);
  if (r.status !== 0) throw new Error(`Install-PoB2-JP.ps1 failed (exit ${r.status})`);
  if (!/tier: full/.test(out)) {
    throw new Error("PoB2-JP が data-only に縮退した (フック用アンカーが PoB 側で変わった可能性)。ログを確認すること");
  }
}

/**
 * 公式 runtime ディレクトリの取り出し元を返す。
 * 日本語版は JP_RUNTIME_BASE_COMMIT の runtime/ を git archive で一時展開して使う。
 */
async function resolveRuntimeDir(withJp) {
  if (!withJp) return join(VENDOR, "runtime");
  const tmp = join(ROOT, "data-cache", "pob-runtime-" + JP_RUNTIME_BASE_COMMIT);
  if (await exists(join(tmp, "runtime", EXE_NAME_IN_REPO))) return join(tmp, "runtime");
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const tar = join(tmp, "runtime.tar");
  // CI (actions/checkout) は submodule を shallow に取るので、基準コミットが無ければ SHA 指定で fetch する
  const has = spawnSync("git", ["-C", VENDOR, "cat-file", "-e", `${JP_RUNTIME_BASE_COMMIT}^{commit}`], { encoding: "utf-8" });
  if (has.status !== 0) {
    log(`fetching runtime base commit ${JP_RUNTIME_BASE_COMMIT.slice(0, 9)} (shallow checkout)`);
    const f = spawnSync("git", ["-C", VENDOR, "fetch", "--depth=1", "origin", JP_RUNTIME_BASE_COMMIT], { encoding: "utf-8" });
    if (f.status !== 0) throw new Error(`git fetch ${JP_RUNTIME_BASE_COMMIT} failed: ${f.stderr}`);
  }
  const a = spawnSync("git", ["-C", VENDOR, "archive", "--format=tar", "-o", tar, JP_RUNTIME_BASE_COMMIT, "runtime"], {
    encoding: "utf-8",
  });
  if (a.status !== 0) throw new Error(`git archive ${JP_RUNTIME_BASE_COMMIT} failed: ${a.stderr}`);
  const x = spawnSync("tar", ["-xf", tar, "-C", tmp], { encoding: "utf-8" });
  if (x.status !== 0) throw new Error(`tar extract failed: ${x.stderr}`);
  await unlink(tar);
  log(`exported official runtime @${JP_RUNTIME_BASE_COMMIT} → ${tmp}`);
  return join(tmp, "runtime");
}

/**
 * 日本語 UI フォントを同梱 (BIZ UDPGothic, SIL OFL)。
 * PoB2-JP の Install-Fonts は Windows の游ゴシックをコピーするが、再配布不可 + CI に無い可能性が
 * あるため、必ず同梱フォントで上書きして環境非依存にする。.tgf の JpUI.ttf 向け定義も念のため書く。
 */
async function installFonts() {
  const fontDir = join(OUT, "SimpleGraphic/Fonts");
  await mkdir(fontDir, { recursive: true });
  await cp(join(FONTS, "BIZUDPGothic-Regular.ttf"), join(fontDir, "JpUI.ttf"));
  await cp(join(FONTS, "BIZUDPGothic-Bold.ttf"), join(fontDir, "JpUI-Bold.ttf"));
  await cp(join(FONTS, "OFL.txt"), join(fontDir, "OFL-BIZUDPGothic.txt"));
  const tgf = '{\n  "fonts": [\n    {"file": "JpUI.ttf", "scale": 1.0}\n  ]\n}\n';
  for (const name of FONT_TARGETS) await writeFile(join(fontDir, name), tgf);
}

/** PoB2-JP インストーラが作る *.pob2jp.bak (差替前 DLL 等 ~30MB) を同梱物から除く */
async function removeBackups(dir) {
  let n = 0;
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) n += await removeBackups(p);
    else if (ent.name.endsWith(".pob2jp.bak")) {
      await unlink(p);
      n++;
    }
  }
  return n;
}

async function main() {
  if (ARGS.has("--check")) {
    const ok = (await exists(join(OUT, EXE_NAME))) && (await exists(join(OUT, "Launch.lua")));
    log(ok ? `OK: ${OUT}` : `MISSING: ${OUT} (run: node scripts/build-pob-bundle.mjs)`);
    process.exit(ok ? 0 : 1);
  }
  if (!(await exists(join(VENDOR, "runtime", EXE_NAME_IN_REPO)))) {
    throw new Error(`${VENDOR}/runtime が無い。git submodule update --init --recursive を実行すること`);
  }
  const withJp = !ARGS.has("--no-jp");
  const runtimeDir = await resolveRuntimeDir(withJp);
  const exeSrc = join(runtimeDir, EXE_NAME_IN_REPO);
  const pob2jp = withJp ? await findPob2Jp() : null;
  if (withJp && !pob2jp) {
    throw new Error(`PoB2-JP が見つからない (候補: ${POB2JP_CANDIDATES.join(", ")})。--no-jp で英語版のみ組み立て可`);
  }

  const { versions, latest } = await readLatestTreeVersion();
  const version = await readVendorVersion();
  log(`vendor PoB ${version}, tree versions ${versions.join(",")} (bundle: ${latest} + legion)`);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  // 1) runtime (exe / dll / lua / SimpleGraphic) をフラットにコピー。exe は {space} を実スペースに戻す
  await cp(runtimeDir, OUT, {
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

  // 3) インストール版形式の manifest.xml (branch/platform 付き → devMode に入らない)。
  //    <File> を持たないので PoB2-JP の keep-list 生成 (sha1 総当たり) も一瞬で済む。
  await writeFile(
    join(OUT, "manifest.xml"),
    `<?xml version='1.0' encoding='UTF-8'?>\n<PoBVersion>\n\t<Version number="${version}" branch="release" platform="win32" />\n</PoBVersion>\n`,
  );

  // 4) 日本語化 (PoB2-JP) → 同梱フォントで上書き → バックアップ除去
  let jpVersion = null;
  if (pob2jp) {
    applyPob2Jp(pob2jp);
    await installFonts();
    const removed = await removeBackups(OUT);
    log(`removed ${removed} *.pob2jp.bak`);
    jpVersion = (await readFile(join(pob2jp, "VERSION"), "utf-8")).trim();
  }

  // 5) Launch.lua に ExileDesk overlay 読み込みを挿入 (JP フックの後ろ、別アンカーなので共存可)
  const launchPath = join(OUT, "Launch.lua");
  await writeFile(launchPath, patchLaunchLua(await readFile(launchPath, "utf-8")));
  await writeFile(join(OUT, "Modules/ExileDeskOverlay.lua"), OVERLAY_LUA);

  // 6) installedMode → ユーザーデータは Documents/Path of Building (PoE2)/
  await writeFile(join(OUT, "installed.cfg"), "ExileDesk bundled PoB\n");
  // 7) 同梱版メタ (Rust 側 pob_launcher_status が読む)
  await writeFile(
    join(OUT, "exiledesk-pob.json"),
    JSON.stringify({ version, tree: latest, jp: jpVersion, builtAt: new Date().toISOString() }, null, 2),
  );

  log(`done → ${OUT} (PoB ${version}${jpVersion ? `, PoB2-JP ${jpVersion}` : ", English only"})`);
}

main().catch((e) => {
  console.error("[pob-bundle] FAILED:", e);
  process.exit(1);
});
