/**
 * _bundle-ts.mjs — 検算スクリプトから TypeScript をそのまま呼ぶための束ね (2026-09-22)
 *
 * `check-htc-*.mjs` はアプリの TS (services/htc/*) を直接使いたい。node は TS を読めないので
 * esbuild で 1 ファイルに束ねて import する。その手順をここに 1 つだけ置く
 * (検算が増えるたびに同じ 20 行を写すのを避けるため)。
 *
 *   const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
 */
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);

/** pnpm の store 直下にいることがあるので、見つからなければそちらも探す */
function findEsbuild() {
  try {
    return require_.resolve("esbuild");
  } catch {
    const store = "node_modules/.pnpm";
    const dir = readdirSync(store).find((d) => d.startsWith("esbuild@"));
    if (!dir) throw new Error("esbuild が見つかりません (pnpm install を実行してください)");
    return require_.resolve("esbuild", { paths: [join(store, dir, "node_modules")] });
  }
}

/**
 * 前の実行の束ねの残り (1 日以上前) を消す。
 * 2026-09-28: 実行のたびに約 10 MB の一時フォルダを作って消していなかったので、Temp に 2,448 個・24.7 GB 溜まっていた
 */
function sweepOld() {
  const day = 24 * 3600 * 1000;
  try {
    for (const d of readdirSync(tmpdir())) {
      if (!d.startsWith("exiledesk-ts-")) continue;
      const p = join(tmpdir(), d);
      try {
        if (Date.now() - statSync(p).mtimeMs > day) rmSync(p, { recursive: true, force: true });
      } catch {
        /* 使用中などは次の回に */
      }
    }
  } catch {
    /* Temp が読めなければ何もしない */
  }
}

/** 入口の TS を束ねて import し、その module を返す */
export async function bundleEntry(entryPoint) {
  sweepOld();
  const { build } = await import(pathToFileURL(findEsbuild()).href);
  const dir = mkdtempSync(join(tmpdir(), "exiledesk-ts-"));
  const out = join(dir, "bundle.mjs");
  await build({
    entryPoints: [entryPoint],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "error",
    loader: { ".json": "json" },
    // Web 用の設定 (src/web/config.ts の VITE_WEB_API) は検算では使わない。無いと読み込みで落ちる (2026-10-09 audit-poe2db)
    define: { "import.meta.env.DEV": "false", "import.meta.env.VITE_WEB_API": "undefined" },
  });
  const mod = await import(pathToFileURL(out).href);
  // 読み込んだら要らない (module はもうメモリにある)。消し忘れで Temp が膨らんでいた
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 消せなければ次の回の sweepOld に任せる */
  }
  return mod;
}
