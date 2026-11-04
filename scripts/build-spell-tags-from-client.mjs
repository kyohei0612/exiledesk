#!/usr/bin/env node
/**
 * build-spell-tags-from-client.mjs — MOD が品に足すタグで、別の MOD が付かなくなる組 (E-11i、2026-11-04)
 *
 * 背景 (要望 9322033b「冷気スペル +5 の決闘のワンドに火ダメージ T1 がつくのはおかしいかも」):
 *   公式トレードで冷気スペルのレベル + 火ダメージ増加のワンドは 0 件、同じ属性どうしは 1 万件以上。
 *   クライアントの Mods 表では、属性ダメージ増加・属性スペルレベル・点火 / 凍結 / 感電の MOD が品に
 *   `no_<他の属性>_spell_mods` を足し (adds_tags)、相手の MOD は spawn_weights の先頭に `no_<自分>_spell_mods: 0` を持つ。
 *   spawn_weights は先頭から見て品のタグに最初に一致した重みを使う (build-htc-bases-from-client.mjs と同じ規則) ので、
 *   足されたタグが先に当たって重み 0 = 付かない。
 *
 * ここでは**ゲームの規則をそのまま 1 本で**読む: 品の MOD が足すタグのうち、どこかの MOD の spawn_weights に重み 0 で
 * (その MOD が出る部位のタグより前に) 出る物だけを取り、MOD の型 (= エンジンの行の group) ごとに
 *   adds    … 付いていると品に足すタグ
 *   blocked … 品にあると付かなくなるタグ
 * を書く。手で表を書かない。
 *
 * 入力: data-cache/mods.en.json (クライアントの Mods、RePoE 形式)
 * 出力: src/services/htc/spell-tags.json (`spell-tags.ts` が patch の読み込みで MOD に載せる)
 *
 * Usage: node scripts/build-spell-tags-from-client.mjs [--cache <data-cache のある所>]
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "src/services/htc/spell-tags.json");

// worktree には data-cache が無いことがあるので、`--cache <dir>` で本体の data-cache を指せる
const ci = process.argv.indexOf("--cache");
const CACHE = ci > 0 ? resolve(process.argv[ci + 1]) : resolve(ROOT, "data-cache");
const C = JSON.parse(await readFile(resolve(CACHE, "mods.en.json"), "utf8"));
const H = JSON.parse(await readFile(resolve(ROOT, "src/vendor/poe2htc/data/mods.json"), "utf8"));
const groups = new Set(H.mods.map((m) => m.group));
const item = Object.values(C).filter((m) => m.domain === "item" && (m.generation_type === "prefix" || m.generation_type === "suffix"));

/** spawn_weights のうち、最初の正の重みより前にある重み 0 のタグ (= 品にあれば先に当たって付かなくなるタグ) */
const zeroBefore = (m) => {
  const out = [];
  for (const s of m.spawn_weights ?? []) {
    if (s.weight > 0) break;
    if (s.tag !== "default") out.push(s.tag);
  }
  return out;
};
const blocking = new Set(item.flatMap(zeroBefore));

const byType = {};
for (const m of item) {
  if (!groups.has(m.type)) continue;
  const adds = (m.adds_tags ?? []).filter((t) => blocking.has(t));
  const blocked = zeroBefore(m).filter((t) => item.some((o) => (o.adds_tags ?? []).includes(t)));
  if (!adds.length && !blocked.length) continue;
  const e = (byType[m.type] ??= { adds: new Set(), blocked: new Set() });
  for (const t of adds) e.adds.add(t);
  for (const t of blocked) e.blocked.add(t);
}

const types = Object.fromEntries(Object.entries(byType).sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => [k, { adds: [...v.adds].sort(), blocked: [...v.blocked].sort() }]));
await writeFile(OUT, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  source: "data-cache/mods.en.json (client Mods: adds_tags + spawn_weights) by scripts/build-spell-tags-from-client.mjs",
  types,
}, null, 1) + "\n", "utf8");
console.log("[build-spell-tags]", Object.keys(types).length, "types");
