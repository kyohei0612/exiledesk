/**
 * _bundle-ts.mjs — 検算スクリプトから TypeScript をそのまま呼ぶための束ね (2026-09-22)
 *
 * `check-htc-*.mjs` はアプリの TS (services/htc/*) を直接使いたい。node は TS を読めないので
 * esbuild で 1 ファイルに束ねて import する。その手順をここに 1 つだけ置く
 * (検算が増えるたびに同じ 20 行を写すのを避けるため)。
 *
 *   const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
 */
import { mkdtempSync, readdirSync } from "node:fs";
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

/** 入口の TS を束ねて import し、その module を返す */
export async function bundleEntry(entryPoint) {
  const { build } = await import(pathToFileURL(findEsbuild()).href);
  const out = join(mkdtempSync(join(tmpdir(), "exiledesk-ts-")), "bundle.mjs");
  await build({
    entryPoints: [entryPoint],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "error",
    loader: { ".json": "json" },
    define: { "import.meta.env.DEV": "false" },
  });
  return import(pathToFileURL(out).href);
}
