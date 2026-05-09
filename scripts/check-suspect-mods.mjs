#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EN = JSON.parse(await readFile(resolve(ROOT, "data-cache/mods.en.json"), "utf-8"));
const JA = JSON.parse(await readFile(resolve(ROOT, "data-cache/mods.ja.json"), "utf-8"));
const BUNDLE = JSON.parse(await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"));

function dump(label, predicate, maxShow = 30) {
  console.log(`\n##### ${label} #####`);
  let upstream = 0, bundled = 0, samples = [];
  for (const [k, v] of Object.entries(EN)) {
    if (!predicate(k, v)) continue;
    upstream++;
    const inB = k in BUNDLE;
    if (inB) bundled++;
    if (samples.length < maxShow) {
      samples.push({ key: k, dom: v.domain, gt: v.generation_type, ess: !!v.is_essence_only, inB, ja: (JA[k]?.text ?? "").slice(0, 70) });
    }
  }
  console.log(`upstream=${upstream}  bundle=${bundled}  missing=${upstream - bundled}`);
  for (const s of samples) {
    console.log(`  ${s.inB ? "[B]" : "[ ]"} ${s.key} | dom=${s.dom} gt=${s.gt} ess=${s.ess} | "${s.ja}"`);
  }
  if (upstream > maxShow) console.log(`  ... (showing ${maxShow}/${upstream})`);
}

// 1. Rarity of Items Found - 厳密に「Increased Rarity of Items Found」「Items found in" を持つ prefix/suffix
dump("Rarity of Items found (strict, prefix/suffix only)", (k, v) =>
  (v.generation_type === "prefix" || v.generation_type === "suffix") &&
  /increased rarity of items found/i.test(v.text ?? "")
);

// 2. Rarity 関連 key starts with
dump("Key starts with 'IncreasedItemFound' or 'ItemFound' or 'ItemRarity'", (k, v) =>
  /^IncreasedItemFound|^ItemFound|^ItemRarity|Rarity.*Item|Items.*Rarity/i.test(k)
);

// 3. ChaosResist 系
dump("Chaos Resistance keys", (k, v) =>
  /^ChaosResist\d|^IncreasedChaos|JewelChaosResist|^ToAllElementalAndChaosResistances/.test(k)
);

// 4. Chaos Resistance via JA text
dump("Chaos Resistance JA (suffix, single, not hybrid)", (k, v) => {
  const ja = JA[k]?.text ?? "";
  return v.generation_type === "suffix" &&
    /混沌.*耐性|混沌\]耐性/.test(ja) &&
    !/および|火.*混沌|混沌.*火|冷気.*混沌|混沌.*冷気|雷.*混沌|混沌.*雷|全ての/.test(ja);
});

// 5. POE2 で Magic Find のようなレアリティ mod のためにキー直接探索
dump("Keys ending with Rarity[N] or starting Rarity", (k, v) =>
  /Rarity\d+$|^Rarity[A-Z]/.test(k)
);
