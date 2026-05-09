#!/usr/bin/env node
/**
 * check-coverage-C2.mjs
 * 画像から特定された desecrated boss mods と essence-only 高 tier mods を狙い撃ち。
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EN = JSON.parse(await readFile(resolve(ROOT, "data-cache/mods.en.json"), "utf-8"));
const JA = JSON.parse(await readFile(resolve(ROOT, "data-cache/mods.ja.json"), "utf-8"));
const BUNDLE = JSON.parse(await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"));

function summarize(filterFn, label) {
  const ups = [];
  for (const [k, v] of Object.entries(EN)) {
    if (filterFn(k, v)) {
      const tja = JA[k]?.text ?? "";
      ups.push({
        key: k,
        domain: v.domain,
        gt: v.generation_type,
        ess_only: !!v.is_essence_only,
        en: (v.text ?? "").slice(0, 70),
        ja: tja.slice(0, 70),
        inBundle: k in BUNDLE,
      });
    }
  }
  console.log(`\n=== ${label}  upstream=${ups.length}  bundle=${ups.filter(u => u.inBundle).length} ===`);
  for (const u of ups) {
    console.log(`  ${u.inBundle ? "[B]" : "[ ]"} ${u.key} | dom=${u.domain} gt=${u.gt} ess=${u.ess_only}`);
    console.log(`      JA: "${u.ja}"`);
  }
}

// 1. AMANAMU / ULAMAN / KURGAL key を持つ mod
for (const boss of ["Amanamu", "Ulaman", "Kurgal"]) {
  summarize((k, v) => k.includes(boss), `Boss key contains "${boss}"`);
}

// 2. essence-only suffix mods (画像3 のサフィックス系)
summarize(
  (k, v) => v.is_essence_only === true && v.generation_type === "suffix",
  "is_essence_only=true & generation_type=suffix"
);

// 3. essence-only prefix mods (画像3 のプレフィックス系)
summarize(
  (k, v) => v.is_essence_only === true && v.generation_type === "prefix",
  "is_essence_only=true & generation_type=prefix"
);

// 4. Tri-attribute single (Str/Dex/Int の3択 mod)
summarize(
  (k, v) => {
    const ja = JA[k]?.text ?? "";
    return /筋力、器用さまたは知性|to strength.*dexterity.*intelligence/i.test((v.text ?? "") + " " + ja)
      || /strength dexterity or intelligence|str.*dex.*or.*int/i.test(v.text ?? "");
  },
  "Tri-attribute single (筋力、器用さまたは知性)"
);
