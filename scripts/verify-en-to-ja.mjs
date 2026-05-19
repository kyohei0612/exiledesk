#!/usr/bin/env node
import { readFileSync } from "node:fs";

const itemsJa = JSON.parse(
  readFileSync("src/i18n/items-ja.json", "utf-8"),
);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SORTED = Object.keys(itemsJa)
  .filter((en) => en !== itemsJa[en])
  .filter((en) => en.length >= 3)
  .sort((a, b) => b.length - a.length);

const RE = new RegExp(SORTED.map(escapeRegExp).join("|"), "g");

function translate(s) {
  return s.replace(RE, (m) => itemsJa[m] ?? m);
}

const samples = [
  "Use Perfect Essence of Ice on Normal Pearl Ring of Whirling",
  "1. Apply Neural Catalyst then Orb of Augmentation",
  "Sinistral Coronation + Regal Orb to add prefix",
  "Use Greater Exalted Orb with Omen of Sinistral Exaltation",
  "Ancient Jawbone, Preserved Collarbone, Amanamu's Gaze",
  "Apply Tempering Catalyst then Vaal Orb",
];
for (const s of samples) {
  console.log("IN :", s);
  console.log("OUT:", translate(s));
  console.log();
}
console.log(`(${SORTED.length} 件の英→日 マップで置換)`);
