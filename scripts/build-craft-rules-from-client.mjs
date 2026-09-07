#!/usr/bin/env node
/**
 * build-craft-rules-from-client.mjs
 * --------------------------------------------------------------
 * 目的:
 *   クラフト収支が使う「クラフトの規則」を GGG クライアントから辞書化する (2026-09-08)。
 *     1. Rarity テーブル: レアリティごとの mod 数 / prefix / suffix の上限 (マジック 1+1、レア 3+3)
 *     2. お告げ (Omen): CurrencyItems.Description の効果文から「次の X は prefix / suffix だけ」等を規則化
 *
 * 入力:
 *   data-cache/client-export/tables/English/Rarity.json            (build-dicts-from-client.mjs)
 *   data-cache/client-export-currency/tables/{English,Japanese}/   (build-currency-effects-from-client.mjs)
 *     CurrencyItems (BaseItemType → BaseItemTypes 行, Description)、BaseItemTypes (Id, Name)
 *
 * 出力: src/i18n/craft-rules.json
 *   {
 *     rarity: { Magic: { minMods, maxMods, maxPrefix, maxSuffix }, Rare: {...} },
 *     omens: [ { id, nameEn, nameJa, trigger, effect, descEn, descJa } ]
 *   }
 *   trigger: chaos | regal | exalt | annul | divine | alchemy | vaal | chance | perfectEssence | desecration | other
 *   effect : prefixOnly | suffixOnly | lowestLevel | twoMods | other
 *
 * Usage: node scripts/build-craft-rules-from-client.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, loadTable } from "./client-export-config.mjs";

const CURRENCY_DIR = resolve(ROOT, "data-cache/client-export-currency");
const OUT = resolve(ROOT, "src/i18n/craft-rules.json");

function log(...a) {
  console.log("[craft-rules]", ...a);
}

async function loadCurrencyTable(lang, name) {
  const j = JSON.parse(await readFile(resolve(CURRENCY_DIR, "tables", lang, `${name}.json`), "utf8"));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
}

const stripLinks = (s) => String(s ?? "").replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");

/** 効果文 (英語) → trigger / effect。規則化できないものは other */
function classifyOmen(descEn) {
  const d = stripLinks(descEn).replace(/\s+/g, " ");
  const m = d.match(/your next (.+?) (?:will|used on)/i);
  const subject = (m?.[1] ?? "").toLowerCase();
  let trigger = "other";
  if (/chaos orb/.test(subject)) trigger = "chaos";
  else if (/regal orb/.test(subject)) trigger = "regal";
  else if (/exalted orb/.test(subject)) trigger = "exalt";
  else if (/orb of annulment/.test(subject)) trigger = "annul";
  else if (/divine orb/.test(subject)) trigger = "divine";
  else if (/orb of alchemy/.test(subject)) trigger = "alchemy";
  else if (/vaal orb/.test(subject)) trigger = "vaal";
  else if (/orb of chance/.test(subject)) trigger = "chance";
  else if (/perfect or corrupted essence/.test(subject)) trigger = "perfectEssence";
  else if (/desecration/.test(subject)) trigger = "desecration";

  let effect = "other";
  if (/only prefix modifiers/i.test(d)) effect = "prefixOnly";
  else if (/only suffix modifiers/i.test(d)) effect = "suffixOnly";
  else if (/remove the lowest level modifier/i.test(d)) effect = "lowestLevel";
  else if (/(add|remove) two (random )?modifiers/i.test(d)) effect = "twoMods";
  return { trigger, effect };
}

async function main() {
  // --- 1. Rarity ---
  const rarityRows = await loadTable("English", "Rarity");
  const rarity = {};
  for (const r of rarityRows) {
    if (!r.Id) continue;
    rarity[r.Id] = { minMods: r.MinMods ?? 0, maxMods: r.MaxMods ?? 0, maxPrefix: r.MaxPrefix ?? 0, maxSuffix: r.MaxSuffix ?? 0 };
  }

  // --- 2. Omens ---
  const curEn = await loadCurrencyTable("English", "CurrencyItems");
  const curJa = await loadCurrencyTable("Japanese", "CurrencyItems");
  const baseEn = await loadCurrencyTable("English", "BaseItemTypes");
  const baseJa = await loadCurrencyTable("Japanese", "BaseItemTypes");
  const omens = [];
  for (let i = 0; i < curEn.length; i++) {
    const r = curEn[i];
    const base = baseEn[r.BaseItemType];
    if (!base?.Id || !/\/Omens?\//.test(base.Id) && !/^Omen/.test(base.Id.split("/").pop() ?? "")) continue;
    const descEn = r.Description ?? "";
    if (!/your next/i.test(descEn)) continue;
    const { trigger, effect } = classifyOmen(descEn);
    omens.push({
      id: base.Id.split("/").pop(),
      nameEn: base.Name,
      nameJa: baseJa[r.BaseItemType]?.Name || base.Name,
      trigger,
      effect,
      descEn: stripLinks(descEn).replace(/\s*\n\s*/g, " "),
      descJa: stripLinks(curJa[i]?.Description ?? "").replace(/\s*\n\s*/g, " "),
    });
  }
  omens.sort((a, b) => a.nameEn.localeCompare(b.nameEn));

  await writeFile(OUT, JSON.stringify({ rarity, omens }, null, 2) + "\n", "utf8");
  const usable = omens.filter((o) => o.trigger !== "other" && o.effect !== "other").length;
  log(`rarity: ${Object.keys(rarity).join(", ")}`);
  log(`omens: ${omens.length} (規則化できたもの ${usable}) → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
