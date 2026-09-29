#!/usr/bin/env node
/**
 * build-augment-kinds.mjs — ソケットに入れる物 (オーグメント) の種類 (2026-09-29)
 *
 * 上位プレイヤー MOD 一覧の「持ち物」で、ルーン / ソウルコア / アイドル を色分けするため (オーナー「種類ごとにカテゴリー色分け」)。
 * クライアントの BaseItemTypes は全部 ItemClass = SoulCore なので、Id のパスで分ける:
 *   Metadata/Items/SoulCores/Rune…      → rune (ルーン。ユニーク級の「Uhtred's Sidereus」「Legacy of Lifesprig」も Rune…)
 *   Metadata/Items/SoulCores/SoulCore…  → soulcore (ソウルコア)
 *   Metadata/Items/SoulCores/Talisman…  → idol (アイドル)
 *   それ以外の SoulCores                → other
 * 武器の付与スキルの穴に入れたジェム (The Stars Answer など) は ItemClass が Active Skill Gem → gem。
 * 出力: src/i18n/augment-kinds.json ({ "Perfect Iron Rune": "rune", ... })
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const dir = resolve(ROOT, "data-cache/client-export/tables/English");
const bases = require(resolve(dir, "BaseItemTypes.json"));
const classes = require(resolve(dir, "ItemClasses.json"));
const out = {};
for (const b of bases) {
  const name = (b.Name ?? "").trim();
  if (!name || name in out) continue;
  const id = String(b.Id ?? "");
  const cls = String(classes[b.ItemClass]?.Id ?? "");
  if (id.startsWith("Metadata/Items/SoulCores/")) {
    const rest = id.slice("Metadata/Items/SoulCores/".length);
    out[name] = rest.startsWith("Rune") ? "rune" : rest.startsWith("SoulCore") ? "soulcore" : rest.startsWith("Talisman") ? "idol" : "other";
  } else if (/Skill Gem/.test(cls)) {
    out[name] = "gem";
  }
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(resolve(ROOT, "src/i18n/augment-kinds.json"), JSON.stringify(sorted) + "\n");
const count = {};
for (const k of Object.values(sorted)) count[k] = (count[k] ?? 0) + 1;
console.log("augment-kinds.json:", count);
