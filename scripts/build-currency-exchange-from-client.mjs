#!/usr/bin/env node
/**
 * build-currency-exchange-from-client.mjs (2026-09-09)
 * --------------------------------------------------------------
 * ゲーム内カレンシー取引所 (Alva) の分類をそのまま辞書化する。カレンシーランキングのサイドバーを
 * ゲームと同じ 14 カテゴリ (カレンシー / エッセンス / デリリウム / ブリーチ / アビス / アッツィリ神殿 /
 * フラグメント / ルーン / リチュアル / ソウルコア / アイドル / ジェムの原石 / エクスペディション / ジェム) にする。
 *
 * 入力: data-cache/client-export/tables/{English,Japanese}/
 *   CurrencyExchange            Item (→ BaseItemTypes 行), Category / SubCategory (→ CurrencyExchangeCategories 行),
 *                               EnabledInChallengeLeague
 *   CurrencyExchangeCategories  Id, Name (JA テーブルは日本語名)
 *   BaseItemTypes               Name
 *
 * 出力: src/i18n/currency-exchange.json
 *   {
 *     categories: [ { id, nameEn, nameJa } ]           … ゲーム UI と同じ並び (テーブルの初出順)
 *     subcategories: { "<id>": { nameEn, nameJa } }
 *     items: { "<EN 名>": { category, sub, enabled } }  … poe2scout の Text (= 英名) で引く
 *   }
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, loadPair, loadTable } from "./client-export-config.mjs";

const OUT = resolve(ROOT, "src/i18n/currency-exchange.json");
const log = (...a) => console.log("[currency-exchange]", ...a);

async function main() {
  const ex = await loadTable("English", "CurrencyExchange");
  const { en: catEn, ja: catJa } = await loadPair("CurrencyExchangeCategories");
  const { en: baseEn } = await loadPair("BaseItemTypes");

  const categoryOrder = [];
  const subcategories = {};
  const items = {};
  let unnamed = 0;
  for (const r of ex) {
    const cat = catEn[r.Category];
    const base = baseEn[r.Item];
    if (!cat || !base?.Name) {
      unnamed++;
      continue;
    }
    if (!categoryOrder.includes(cat.Id)) categoryOrder.push(cat.Id);
    const sub = typeof r.SubCategory === "number" ? catEn[r.SubCategory] : null;
    if (sub && !subcategories[sub.Id]) subcategories[sub.Id] = { nameEn: sub.Name, nameJa: catJa[r.SubCategory]?.Name || sub.Name };
    items[base.Name] = { category: cat.Id, sub: sub?.Id ?? null, enabled: r.EnabledInChallengeLeague !== false };
  }
  const categories = categoryOrder.map((id) => {
    const i = catEn.findIndex((c) => c.Id === id);
    return { id, nameEn: catEn[i].Name, nameJa: catJa[i]?.Name || catEn[i].Name };
  });

  await writeFile(OUT, JSON.stringify({ categories, subcategories, items }, null, 2) + "\n", "utf8");
  log(`categories: ${categories.map((c) => c.nameJa).join(" / ")}`);
  log(`items: ${Object.keys(items).length} (skipped ${unnamed}) → ${OUT}`);
}

main().catch((e) => {
  console.error("[currency-exchange] FAILED:", e);
  process.exit(1);
});
