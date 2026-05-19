#!/usr/bin/env node
/**
 * bump-version.mjs
 * --------------------------------------------------------------
 * tauri.conf.json をバージョン SSoT として patch/minor/major を bump し、
 * Cargo.toml と package.json を同期して、bump 後の値を stdout に返す。
 *
 * Usage:
 *   node scripts/bump-version.mjs              # patch (X.Y.Z+1)
 *   node scripts/bump-version.mjs patch        # patch (X.Y.Z+1)
 *   node scripts/bump-version.mjs minor        # X.Y+1.0
 *   node scripts/bump-version.mjs major        # X+1.0.0
 *   node scripts/bump-version.mjs 1.2.3        # 任意の値に直指定
 *
 * 出力: 新バージョン文字列のみ（release.bat が拾って tag 作る）
 * --------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const TAURI_CONF = resolve(ROOT, "src-tauri/tauri.conf.json");
const CARGO_TOML = resolve(ROOT, "src-tauri/Cargo.toml");
const PACKAGE_JSON = resolve(ROOT, "package.json");

const arg = process.argv[2] ?? "patch";

function bump(version, mode) {
  if (/^\d+\.\d+\.\d+$/.test(mode)) return mode;
  const [maj, min, pat] = version.split(".").map(Number);
  if (mode === "major") return `${maj + 1}.0.0`;
  if (mode === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

async function updateJson(path, version) {
  const txt = await readFile(path, "utf8");
  const updated = txt.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${version}"`);
  await writeFile(path, updated, "utf8");
}

async function updateCargoToml(path, version) {
  const txt = await readFile(path, "utf8");
  // [package] セクションの最初の version = "..." のみ置換
  const updated = txt.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*)"[^"]+"/,
    `$1"${version}"`,
  );
  await writeFile(path, updated, "utf8");
}

const tauriConf = JSON.parse(await readFile(TAURI_CONF, "utf8"));
const oldVersion = tauriConf.version;
const newVersion = bump(oldVersion, arg);

if (oldVersion === newVersion) {
  console.error(`No change (already ${oldVersion})`);
  process.exit(1);
}

tauriConf.version = newVersion;
await writeFile(TAURI_CONF, JSON.stringify(tauriConf, null, 2) + "\n", "utf8");
await updateCargoToml(CARGO_TOML, newVersion);
await updateJson(PACKAGE_JSON, newVersion);

// stdout は新バージョンだけ（release.bat が `for /f` で拾う）
process.stdout.write(newVersion);
