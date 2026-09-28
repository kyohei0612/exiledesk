#!/usr/bin/env node
/**
 * build-mtx-from-client.mjs — マイクロトランザクション (スキン等) が PoE1 / PoE2 のどちらで使えるか (2026-09-29)
 *
 * オーナー「PoE1 で使えるスキンが PoE2 で使えるスキンなのか表示したい。画像も取り込んで DB のタブを作って」。
 * 載せるのは PoE1 で使える物だけ (PoE2 だけの物は要らない)。確かめ: オニキスの忘却の翼は両方 (オーナーが PoE2 で使えたと確認)、ただの忘却の翼は PoE1 だけ。
 * 出どころは PoE2 のクライアント (アカウント共通の全マイクロトランザクションが入っている):
 *   - MtxTypes: 名前・説明・種類・パック (ShopTag)。**名前の無い列 19 番 = PoE1 で使える / 20 番 = PoE2 で使える** (真偽)
 *     2026-09-29 に確かめた: PoE2 のパック (アーリーアクセス / Dawn of the Hunt / Third Edict) は 20 番が全部 true、
 *     PoE2 だけのクラス (ソーサレス・ドルイド・ハントレス) のスキンは 19 番 false・20 番 true、
 *     PoE2 に無いスキル (サイクロン等) のエフェクトは 20 番 false、PoE2 にあるヘラルド (雷・氷) は true、テスト用・Tencent 専用は両方 false
 *   - MtxTypeGameSpecific: 画像 (DDSFile) と分類 (MicrotransactionCategory、日本語名あり)
 * 画像は ffmpeg で 64px の webp に (RGBA の DDS は赤と青を入れ替える。build-base-art-from-client.mjs と同じ)。
 *   out: src/services/mtx/mtx.json、public/mtx-art/<行番号>.webp
 *   node scripts/build-mtx-from-client.mjs [--no-art]
 * 表の定義は data-cache/client-export/schema.min.json (名前の無い列も読むため、書き出しツールを通さず直接読む)。
 */
import * as loaders from "../node_modules/pathofexile-dat/dist/cli/bundle-loaders.js";
import { getHeaderLength } from "../node_modules/pathofexile-dat/dist/dat/header.js";
import { readDatFile } from "../node_modules/pathofexile-dat/dist/dat/dat-file.js";
import { readColumn } from "../node_modules/pathofexile-dat/dist/dat/reader.js";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STEAM = "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2";
const ART = resolve(ROOT, "public/mtx-art");
const NO_ART = process.argv.includes("--no-art");
const schema = JSON.parse(readFileSync(resolve(ROOT, "data-cache/client-export/schema.min.json"), "utf8"));
const loader = await loaders.FileLoader.create(new loaders.CachingBundleLoader(new loaders.SteamBundleLoader(STEAM)));

/** 表を全部の列で読む (名前の無い列は c<番号>_<型>) */
async function table(name, lang = "") {
  const path = `Data/Balance/${lang ? lang + "/" : ""}${name}.datc64`;
  const dat = readDatFile(".datc64", (await loader.tryGetFileContents(path)) ?? (await loader.getFileContents(`Data/Balance/${name}.datc64`)));
  const sch = schema.tables.filter((s) => s.name === name).find((s) => s.validFor & 2);
  const headers = [];
  let offset = 0;
  sch.columns.forEach((c, i) => {
    const t = c.type;
    const h = { name: c.name || `c${i}_${t}`, offset, type: { array: c.array, interval: c.interval,
      integer: t === "u16" ? { unsigned: true, size: 2 } : t === "u32" ? { unsigned: true, size: 4 } : t === "i16" ? { unsigned: false, size: 2 } : t === "i32" || t === "enumrow" ? { unsigned: false, size: 4 } : undefined,
      decimal: t === "f32" ? { size: 4 } : undefined, string: t === "string" ? {} : undefined, boolean: t === "bool" ? {} : undefined,
      key: t === "row" || t === "foreignrow" ? { foreign: t === "foreignrow" } : undefined } };
    headers.push(h);
    offset += getHeaderLength(h, dat);
  });
  if (offset !== dat.rowLength) throw new Error(`${name}: 表の定義 (${offset} バイト) と実物 (${dat.rowLength}) が合わない。schema を更新する`);
  const cols = headers.map((h) => ({ n: h.name, d: readColumn(h, dat) }));
  return Array.from({ length: dat.rowCount }, (_, i) => Object.fromEntries([["_i", i], ...cols.map((c) => [c.n, c.d[i]])]));
}

const M = await table("MtxTypes");
const MJ = await table("MtxTypes", "Japanese");
const G = new Map((await table("MtxTypeGameSpecific")).map((g) => [g.Type, g]));
const TAG = await table("ShopTag");
const TAGJ = await table("ShopTag", "Japanese");
const CATJ = await table("MicrotransactionCategory", "Japanese");
// 列の位置の検算 (名前の無い列の番号がずれていないか)
if (!("c19_bool" in M[0]) || !("c20_bool" in M[0])) throw new Error("MtxTypes の 19 / 20 番の列が bool でない。表の定義が変わった");

const SKIP_CAT = new Set([19, 41, 42]); // 消耗品 / [DNT]Emote / アカウント (スキンではない)
const items = [];
for (const m of M) {
  const poe1 = !!m.c19_bool;
  const poe2 = !!m.c20_bool;
  // 2026-09-29 オーナー「PoE2 のスキンで PoE1 で使えるかはいらない。PoE1 で使えるかっこいいやつが PoE2 で使えるか知りたい」→ PoE1 で使える物だけ
  if (!poe1) continue;
  if (!m.Name || /^\[DNT\]|Tencent/i.test(m.Name)) continue;
  const g = G.get(m._i);
  if (g && SKIP_CAT.has(g.Category)) continue;
  const j = MJ[m._i] ?? {};
  const tag = m.ShopTag != null ? (TAGJ[m.ShopTag]?.Name || TAG[m.ShopTag]?.Name || "") : "";
  items.push({
    i: m._i,
    en: m.Name,
    ja: j.Name || m.Name,
    d: (j.Description1 || m.Description1 || "").trim(),
    c: g ? g.Category : -1,
    t: tag,
    p: (poe1 ? 1 : 0) | (poe2 ? 2 : 0),
    dds: g?.DDSFile || "",
  });
}
const cats = Object.fromEntries(CATJ.map((c) => [c._i, c.Name]));

// 画像
let made = 0, fail = 0;
if (!NO_ART) {
  rmSync(ART, { recursive: true, force: true });
  mkdirSync(ART, { recursive: true });
  const tmp = join(tmpdir(), "exiledesk-mtx-art");
  mkdirSync(tmp, { recursive: true });
  const done = new Map();
  for (const it of items) {
    if (!it.dds) continue;
    if (done.has(it.dds)) { it.a = done.get(it.dds); continue; }
    try {
      const buf = Buffer.from(await loader.getFileContents(it.dds));
      const dxgi = buf.toString("latin1", 84, 88) === "DX10" ? buf.readUInt32LE(128) : 0;
      const swap = dxgi >= 27 && dxgi <= 29 ? "colorchannelmixer=rr=0:rb=1:bb=0:br=1," : "";
      writeFileSync(join(tmp, "in.dds"), buf);
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", join(tmp, "in.dds"), "-vf", `${swap}scale=64:64:force_original_aspect_ratio=decrease`, "-c:v", "libwebp", "-quality", "75", join(ART, `${it.i}.webp`)]);
      done.set(it.dds, it.i);
      it.a = it.i;
      made++;
    } catch {
      fail++;
    }
  }
  rmSync(tmp, { recursive: true, force: true });
} else {
  // 画像を作り直さない時は、前に作った物をそのまま使う
  for (const it of items) if (existsSync(join(ART, `${it.i}.webp`))) it.a = it.i;
}
for (const it of items) delete it.dds;
mkdirSync(resolve(ROOT, "src/services/mtx"), { recursive: true });
writeFileSync(resolve(ROOT, "src/services/mtx/mtx.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), cats, items }) + "\n");
const n = (f) => items.filter(f).length;
console.log(`${items.length} 件 (両方 ${n((x) => x.p === 3)} / PoE1 のみ ${n((x) => x.p === 1)} / PoE2 のみ ${n((x) => x.p === 2)})、画像 ${made} 枚 (失敗 ${fail})`);
