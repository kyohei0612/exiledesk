/**
 * _htc-client-tables.mjs — クライアントの表を読む口 (2026-09-22)
 *
 * `build-htc-bases-from-client.mjs` から切り出し。場所と読み方だけを持つ。
 * `pathofexile-dat` が吐いた JSON は配列のことも `{rows}` のこともあるので、ここで均す。
 */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const TABLES = resolve(ROOT, "data-cache/client-export/tables/English");
export const OUT = resolve(ROOT, "src/services/htc/extra-bases.json");

/** JSON を 1 本読む */
export const rj = async (p) => JSON.parse(await readFile(p, "utf8"));

/** クライアントの表を 1 枚読む (`BaseItemTypes` など) */
export const rows = async (name) => {
  const j = await rj(resolve(TABLES, `${name}.json`));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
};
