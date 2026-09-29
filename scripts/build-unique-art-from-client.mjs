#!/usr/bin/env node
/**
 * build-unique-art-from-client.mjs — ユニークの見た目 (ゲーム内の絵) をクライアントから取り出す (2026-09-29)
 *
 * オーナー「ステージのベース選びの画像や MOD の仕組みを他でも使いたい。あとユニークの見た目も」。
 * クライアントの UniqueStashLayout (ユニークの収納の並び) が ユニーク名 (Words) → 絵 (ItemVisualIdentity.DDSFile) を持つ。
 * 絵は 128px の webp (RGBA の DDS は赤と青を入れ替える。build-base-art-from-client.mjs と同じ) にして public/unique-art/ に置き、
 * 画像パック (scripts/asset-packs.mjs の PACKS) で配る。対応表は src/services/assets/unique-art.json ({ 英語名: ファイル名 })。
 *   node scripts/build-unique-art-from-client.mjs
 */
import * as loaders from "../node_modules/pathofexile-dat/dist/cli/bundle-loaders.js";
import { getHeaderLength } from "../node_modules/pathofexile-dat/dist/dat/header.js";
import { readDatFile } from "../node_modules/pathofexile-dat/dist/dat/dat-file.js";
import { readColumn } from "../node_modules/pathofexile-dat/dist/dat/reader.js";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STEAM = "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2";
const OUT = resolve(ROOT, "public/unique-art");
const schema = JSON.parse(readFileSync(resolve(ROOT, "data-cache/client-export/schema.min.json"), "utf8"));
const loader = await loaders.FileLoader.create(new loaders.CachingBundleLoader(new loaders.SteamBundleLoader(STEAM)));

async function table(name) {
  const dat = readDatFile(".datc64", await loader.getFileContents(`Data/Balance/${name}.datc64`));
  const sch = schema.tables.filter((s) => s.name === name).find((s) => s.validFor & 2);
  const headers = [];
  let offset = 0;
  sch.columns.forEach((c, i) => {
    const t = c.type;
    const h = { name: c.name || `c${i}`, offset, type: { array: c.array, interval: c.interval,
      integer: t === "u16" ? { unsigned: true, size: 2 } : t === "u32" ? { unsigned: true, size: 4 } : t === "i16" ? { unsigned: false, size: 2 } : t === "i32" || t === "enumrow" ? { unsigned: false, size: 4 } : undefined,
      decimal: t === "f32" ? { size: 4 } : undefined, string: t === "string" ? {} : undefined, boolean: t === "bool" ? {} : undefined,
      key: t === "row" || t === "foreignrow" ? { foreign: t === "foreignrow" } : undefined } };
    headers.push(h);
    offset += getHeaderLength(h, dat);
  });
  // 定義が実物より短いだけ (末尾に列が増えた) なら、先頭の列は読める。長い時はずれているので止める
  if (offset > dat.rowLength) throw new Error(`${name}: 表の定義 (${offset}) が実物 (${dat.rowLength}) より長い`);
  const cols = headers.map((h) => ({ n: h.name, d: readColumn(h, dat) }));
  return Array.from({ length: dat.rowCount }, (_, i) => Object.fromEntries([["_i", i], ...cols.map((c) => [c.n, c.d[i]])]));
}

const L = await table("UniqueStashLayout");
const W = await table("Words");
const V = await table("ItemVisualIdentity");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), "exiledesk-unique-art");
mkdirSync(tmp, { recursive: true });
const map = {};
const done = new Map();
let fail = 0;
for (const row of L) {
  if (row.IsAlternateArt) continue;
  const name = W[row.WordsKey]?.Text;
  const dds = V[row.ItemVisualIdentityKey]?.DDSFile;
  if (!name || !dds || map[name]) continue;
  const id = dds.replace(/^Art\/2DItems\//, "").replace(/\.dds$/, "").replace(/[^A-Za-z0-9]+/g, "_");
  if (!done.has(dds)) {
    try {
      const buf = Buffer.from(await loader.getFileContents(dds));
      const dxgi = buf.toString("latin1", 84, 88) === "DX10" ? buf.readUInt32LE(128) : 0;
      const swap = dxgi >= 27 && dxgi <= 29 ? "colorchannelmixer=rr=0:rb=1:bb=0:br=1," : "";
      writeFileSync(join(tmp, "in.dds"), buf);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(tmp, "in.dds"), "-vf", `${swap}scale=128:128:force_original_aspect_ratio=decrease`, "-c:v", "libwebp", "-quality", "80", join(OUT, `${id}.webp`)]);
      done.set(dds, id);
    } catch {
      fail++;
      continue;
    }
  }
  map[name] = done.get(dds);
}
rmSync(tmp, { recursive: true, force: true });
const keys = Object.keys(map).sort();
writeFileSync(resolve(ROOT, "src/services/assets/unique-art.json"), JSON.stringify(Object.fromEntries(keys.map((k) => [k, map[k]])), null, 1) + "\n");
console.log(`ユニーク ${keys.length} 件、絵 ${done.size} 枚 (失敗 ${fail})`);
