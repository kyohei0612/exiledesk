#!/usr/bin/env node
/**
 * build-legacy-rune-art.mjs — 遺産のルーンの絵に元のユニークの絵を重ねる (2026-10-05、POE2Tube 要望 ㉛)
 *
 * 遺産のルーン (Legacy of ○○) 63 種は、ゲームのデータでも全部同じ絵 (Currency_Expedition2_GameWarpRuneUniqueFragment)。
 * 並べると見分けられないので、ルーンの絵の右下に元のユニークの絵を小さく重ねた絵をルーンごとに作る。
 *   - 元のユニーク = クライアントの Expedition2OlrothsLegacyRuneClient (UniqueName → Words)。名前は「Legacy of <ユニーク名>」で
 *     1 つだけ違う (Legacy of A Worthy Foe = Eyes of the Runefather、表に残る 1 つ)
 *   - 絵: public/rune-art/<ルーンの絵>.webp + public/unique-art/<ユニーク>.webp → public/rune-art/<ルーンの絵>__<ユニーク>.webp
 *   - src/services/craft-stage/rune-art.json の遺産のルーンを、その絵に差し替える (棚の札・ソケットの丸・書き出しの全部がこれを読む)
 * build-skill-art-from-client.mjs の後に呼ばれる (単体でも動く)。通信しない。要 ffmpeg
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rows = (p) => { const j = JSON.parse(readFileSync(resolve(ROOT, p), "utf8")); return Array.isArray(j) ? j : j.rows; };
const W = rows("data-cache/client-export-expedition/tables/English/Words.json");
const table = rows("data-cache/client-export-expedition/tables/English/Expedition2OlrothsLegacyRuneClient.json")[0];
const uniques = table.UniqueName.map((i) => W[i]?.Text).filter(Boolean);

const ART_JSON = resolve(ROOT, "src/services/craft-stage/rune-art.json");
const runeArt = JSON.parse(readFileSync(ART_JSON, "utf8"));
const uniqueArt = JSON.parse(readFileSync(resolve(ROOT, "src/services/assets/unique-art.json"), "utf8"));
const legacy = Object.keys(runeArt).filter((en) => /^Legacy of /.test(en));

// ルーンの名前 → 元のユニーク (名前どおりが無い物は、表に残ったユニークと 1 対 1 で合わせる)
const byName = new Map(legacy.map((en) => [en, uniques.includes(en.slice(10)) ? en.slice(10) : null]));
const leftRunes = legacy.filter((en) => !byName.get(en));
const leftUniques = uniques.filter((u) => ![...byName.values()].includes(u));
if (leftRunes.length !== leftUniques.length) throw new Error(`対応が合わない: ${leftRunes.join(", ")} / ${leftUniques.join(", ")}`);
leftRunes.forEach((en, i) => byName.set(en, leftUniques[i]));

const safe = (s) => s.replace(/[^A-Za-z0-9]+/g, "");
let made = 0;
const miss = [];
for (const en of legacy) {
  const u = byName.get(en);
  const base = String(runeArt[en]).split("__")[0];
  const src = resolve(ROOT, `public/rune-art/${base}.webp`);
  const uf = uniqueArt[u] ? resolve(ROOT, `public/unique-art/${uniqueArt[u]}.webp`) : null;
  if (!existsSync(src) || !uf || !existsSync(uf)) { miss.push(`${en} (${u})`); continue; }
  const id = `${base}__${safe(u)}`;
  // 128 × 128 のルーンの右下に、高さ 84 のユニーク (暗い影で縁取り)
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-i", uf, "-filter_complex",
    "[1:v]scale=-1:84,format=rgba,split[u][s];[s]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.8,boxblur=3[sh];[0:v]format=rgba[b];[b][sh]overlay=W-w-2:H-h+2[t];[t][u]overlay=W-w-4:H-h",
    "-frames:v", "1", "-c:v", "libwebp", "-lossless", "1", resolve(ROOT, `public/rune-art/${id}.webp`)]);
  runeArt[en] = id;
  made++;
}
writeFileSync(ART_JSON, JSON.stringify(runeArt, null, 1) + "\n");
console.log(`遺産のルーン ${made} / ${legacy.length} 枚${miss.length ? ` (作れない: ${miss.join(", ")})` : ""}`);
