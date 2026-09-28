#!/usr/bin/env node
/**
 * build-base-art-from-client.mjs — ベースの絵 (ゲーム内と同じ画像) をクライアントから取り出す (2026-09-29)
 *
 * オーナー「優しさでゲーム内と同じ画像使ってやりたいね。文字の横とかクラフトステージ上とか」。
 * 通信無しで出せる (POE2Tube の撮影でも確実) ように、アプリに同梱する。
 *   1. data-cache/client-export-art/tables (npx pathofexile-dat、config.json は BaseItemTypes と ItemVisualIdentity) で
 *      ベース名 → DDSFile を引く
 *   2. pathofexile-dat の読み込み部分でクライアントから DDS を取り出す (付属の書き出しは ImageMagick が要るので使わない)
 *   3. ffmpeg で高さ 128px の webp にする。**RGBA 並びの DDS (DXGI 27〜29) は ffmpeg が BGRA として読むので赤と青を入れ替える**
 *      (2026-09-29 オーナー「色が全体的に淡い」: 金の指輪が青く出ていた) → public/base-art/<ファイル名>.webp と src/services/craft-stage/base-art.json (英語名 → ファイル名)
 * フラスコの DDS は 3 枚横並び (枠 / 暗いガラス / 液体)。ゲームの見た目は「液体の上に枠を重ねる」(枠のガラスの所は透けている) なので、そう合成して 1 枚にする
 * (2026-09-29 オーナー「フラスコとか画像ちょっとおかしい奴」: 3 つ並んで出ていた)。
 * 対象は計算機のベース (ルーンフォージ等・[DNT] を除く) とフラスコ。
 *   (cd data-cache/client-export-art && npx pathofexile-dat) && node scripts/build-base-art-from-client.mjs
 */
import * as loaders from "../node_modules/pathofexile-dat/dist/cli/bundle-loaders.js";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = (n) => JSON.parse(readFileSync(resolve(ROOT, `data-cache/client-export-art/tables/English/${n}.json`), "utf8"));
const B = T("BaseItemTypes");
const V = T("ItemVisualIdentity");
const STEAM = "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2";
const OUT = resolve(ROOT, "public/base-art");
const HEIGHT = 128;

const extra = JSON.parse(readFileSync(resolve(ROOT, "src/services/htc/extra-bases.json"), "utf8"));
const stage = JSON.parse(readFileSync(resolve(ROOT, "src/services/craft-stage/stage-bases.json"), "utf8")).bases;
const want = new Set([
  ...Object.keys(extra.baseInfo).filter((n) => !/^(Runeforged|Runemastered|Runefather's) /.test(n) && !n.startsWith("[DNT]")),
  ...Object.entries(stage).filter(([, v]) => v.cls === "LifeFlask" || v.cls === "ManaFlask").map(([n]) => n),
]);
// 同じ名前の行が複数ある (旧版・イベント品) ので、先に見つけた絵のある行を使う
const dds = new Map();
for (const b of B) {
  if (!want.has(b.Name) || dds.has(b.Name)) continue;
  const f = V[b.ItemVisualIdentity]?.DDSFile;
  if (f) dds.set(b.Name, f);
}
const loader = await loaders.FileLoader.create(new loaders.CachingBundleLoader(new loaders.SteamBundleLoader(STEAM)));
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), "exiledesk-base-art");
mkdirSync(tmp, { recursive: true });
const map = {};
const done = new Map();
/** DDS の形式 (DXGI) ごとの枚数 (確認用) */
const formats = new Map();
let fail = 0;
/** フラスコ: 3 枚 (枠 / 暗いガラス / 液体) のうち、液体の上に枠を重ねて 1 枚にする (枠のガラスの所は透けている) */
function flask(src, vf, out) {
  const [w] = execFileSync("ffprobe", ["-loglevel", "error", "-show_entries", "stream=width", "-of", "csv=p=0", src]).toString().trim().split(",").map(Number);
  const cw = Math.floor(w / 3);
  const pre = vf ? `${vf},` : "";
  const graph = `[0]${pre}split=2[x][z];[z]crop=${cw}:ih:${2 * cw}:0[liq];[x]crop=${cw}:ih:0:0[frame];[liq][frame]overlay=0:0,scale=-1:${HEIGHT}`;
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", src, "-filter_complex", graph, "-c:v", "libwebp", "-quality", "85", out]);
}
for (const [name, file] of [...dds.entries()].sort()) {
  const id = file.replace(/^Art\/2DItems\//, "").replace(/\.dds$/, "").replace(/[^A-Za-z0-9]+/g, "_");
  if (!done.has(file)) {
    try {
      const src = join(tmp, "in.dds");
      const buf = Buffer.from(await loader.getFileContents(file));
      writeFileSync(src, buf);
      const dx10 = buf.toString("latin1", 84, 88) === "DX10";
      const dxgi = dx10 ? buf.readUInt32LE(128) : 0;
      formats.set(dxgi, (formats.get(dxgi) ?? 0) + 1);
      const swap = dxgi >= 27 && dxgi <= 29 ? "colorchannelmixer=rr=0:rb=1:bb=0:br=1," : "";
      if (/^Art\/2DItems\/Flasks\//.test(file)) {
        flask(src, swap.replace(/,$/, ""), join(OUT, `${id}.webp`));
        done.set(file, id);
        map[name] = id;
        continue;
      }
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", src, "-vf", `${swap}scale=-1:${HEIGHT}`, "-c:v", "libwebp", "-quality", "85", join(OUT, `${id}.webp`)]);
      done.set(file, id);
    } catch (e) {
      fail++;
      console.log(`取れない: ${name} (${file}) ${e.message.split("\n")[0]}`);
      continue;
    }
  }
  map[name] = done.get(file);
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(resolve(ROOT, "src/services/craft-stage/base-art.json"), JSON.stringify(map, null, 1) + "\n");
const missing = [...want].filter((n) => !map[n]);
console.log(`DDS の形式: ${[...formats].map(([k, v]) => `${k || "旧形式"}=${v}`).join(" ")}`);
console.log(`ベース ${Object.keys(map).length} / ${want.size} 件、絵 ${done.size} 枚 (失敗 ${fail}、絵の無いベース ${missing.length}${missing.length ? ": " + missing.slice(0, 8).join(", ") : ""})`);
