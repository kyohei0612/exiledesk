#!/usr/bin/env node
/**
 * check-coverage-C.mjs
 * --------------------------------------------------------------
 * C 観点: 実ゲームデータ（poe2db/craft-of-exile スクショ）由来の
 *         代表 mod が bundle に実在するかをスポット確認。
 *
 * 画像で確認された "確実に実在する" mod 一覧:
 *  - ULAMAN  : 筋力および器用さ  (Str+Dex hybrid) ← 既知 1 件
 *  - AMANAMU : 筋力および知性    (Str+Int hybrid)
 *  - KURGAL  : 器用さおよび知性  (Dex+Int hybrid)
 *  - AMANAMU : 火および混沌耐性
 *  - KURGAL  : 冷気と混沌耐性
 *  - ULAMAN  : 雷および混沌耐性
 *  - AMANAMU : スキル効果持続時間が増加
 *  - AMANAMU : レムナントは遠くからでも拾える
 *  - AMANAMU : ライフリーチ量
 *  - KURGAL  : クールダウン解消レート
 *  - KURGAL  : 曝露の効果
 *  - KURGAL  : マナリーチ量
 *  - ULAMAN  : スキルスピード
 *  - 殺害時ライフ回復 (kill-restore-life), 殺害時マナ回復
 *  - エッセンス: 筋力、器用さまたは知性 (tri-attribute single)
 *  - エッセンス: マナ自動回復 (50-59)% 高 tier
 * --------------------------------------------------------------
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EN_PATH = resolve(ROOT, "data-cache/mods.en.json");
const JA_PATH = resolve(ROOT, "data-cache/mods.ja.json");
const BUNDLE_PATH = resolve(ROOT, "src/i18n/mods-bundle.json");

const en = JSON.parse(await readFile(EN_PATH, "utf-8"));
const ja = JSON.parse(await readFile(JA_PATH, "utf-8"));
const bundle = JSON.parse(await readFile(BUNDLE_PATH, "utf-8"));

console.log("===== Hybrid attribute mods (Str+Dex / Str+Int / Dex+Int) =====");
const hybridPatterns = [
  ["Str+Dex", /strength.*dexterity|dexterity.*strength/i, /筋力.*器用さ|器用さ.*筋力/],
  ["Str+Int", /strength.*intelligence|intelligence.*strength/i, /筋力.*知性|知性.*筋力/],
  ["Dex+Int", /dexterity.*intelligence|intelligence.*dexterity/i, /器用さ.*知性|知性.*器用さ/],
  ["Tri-attr-single", /strength.*dexterity.*intelligence|to strength.*dexterity.*intelligence/i, /筋力.*器用さ.*知性|筋力、器用さまたは知性/],
];

for (const [label, reEn, reJa] of hybridPatterns) {
  console.log(`\n--- ${label} ---`);
  const upstreamMatches = [];
  const bundleMatches = [];
  for (const [k, v] of Object.entries(en)) {
    const t = typeof v.text === "string" ? v.text : "";
    const tja = typeof ja[k]?.text === "string" ? ja[k].text : "";
    if (reEn.test(t) || reJa.test(tja)) {
      upstreamMatches.push({ key: k, en: t.slice(0, 80), ja: tja.slice(0, 80), domain: v.domain, gt: v.generation_type, ess: !!v.is_essence_only });
    }
  }
  for (const [k, m] of Object.entries(bundle)) {
    const ten = m.text_en ?? "";
    const tja = m.text_ja ?? "";
    if (reEn.test(ten) || reJa.test(tja)) {
      bundleMatches.push({ key: k, en: ten.slice(0, 80), ja: tja.slice(0, 80) });
    }
  }
  console.log(`  upstream hits: ${upstreamMatches.length}, bundle hits: ${bundleMatches.length}`);
  console.log("  upstream samples:");
  for (const u of upstreamMatches.slice(0, 8)) {
    console.log(`    [${u.domain}/${u.gt}${u.ess ? "/ess" : ""}] ${u.key}`);
    console.log(`      EN: "${u.en}"`);
    console.log(`      JA: "${u.ja}"`);
  }
  if (upstreamMatches.length > 8) console.log(`    ... +${upstreamMatches.length - 8} more`);
}

console.log("\n===== Desecrated mod boss tag check (AMANAMU/ULAMAN/KURGAL) =====");
const bosses = ["amanamu", "ulaman", "kurgal"];
for (const boss of bosses) {
  const re = new RegExp(boss, "i");
  let upstream = 0;
  let bundled = 0;
  for (const [k, v] of Object.entries(en)) {
    if (re.test(k)) {
      upstream++;
      if (k in bundle) bundled++;
    }
  }
  console.log(`  ${boss.padEnd(10)} upstream=${upstream} bundle=${bundled}`);
}

console.log("\n===== Specific essence high-tier mods (e.g. mana regen 50-59%) =====");
const essenceTargets = [
  /mana regeneration rate/i,
  /マナ自動回復レート/,
];
for (const re of essenceTargets) {
  console.log(`-- pattern: ${re} --`);
  const hits = [];
  for (const [k, v] of Object.entries(en)) {
    const t = v.text ?? "";
    const tja = ja[k]?.text ?? "";
    if (re.test(t) || re.test(tja)) {
      hits.push({ key: k, ess_only: !!v.is_essence_only, domain: v.domain, gt: v.generation_type, en: t.slice(0, 60), ja: tja.slice(0, 60), inBundle: k in bundle });
    }
  }
  for (const h of hits) {
    console.log(`  ${h.inBundle ? "[B]" : "[ ]"} ${h.key} | dom=${h.domain} gt=${h.gt} ess=${h.ess_only}`);
    console.log(`      EN: "${h.en}"  JA: "${h.ja}"`);
  }
}

console.log("\n===== Cull-strike / Skill duration / Remnant (AMANAMU specific) =====");
const amanamuTargets = [
  ["skill duration", /(skill effect duration|skill duration)/i, /スキル効果持続時間|スキル持続時間/],
  ["remnant pickup", /remnant/i, /レムナント/],
  ["life leech amount", /(life leech|life leeched)/i, /ライフリーチ/],
  ["fire and chaos res", /fire and chaos res/i, /火および混沌耐性|火と混沌耐性/],
];
for (const [name, reEn, reJa] of amanamuTargets) {
  console.log(`-- ${name} --`);
  let upstream = 0, bundled = 0, samples = [];
  for (const [k, v] of Object.entries(en)) {
    const t = v.text ?? "";
    const tja = ja[k]?.text ?? "";
    if (reEn.test(t) || reJa.test(tja)) {
      upstream++;
      if (k in bundle) bundled++;
      if (samples.length < 5) samples.push({ key: k, dom: v.domain, gt: v.generation_type, ess: !!v.is_essence_only, inB: k in bundle, ja: tja.slice(0, 60) });
    }
  }
  console.log(`  upstream=${upstream} bundle=${bundled}`);
  for (const s of samples) {
    console.log(`    ${s.inB ? "[B]" : "[ ]"} ${s.key} dom=${s.dom} gt=${s.gt} ess=${s.ess} ja="${s.ja}"`);
  }
}

console.log("\n=== C coverage check done ===");
