#!/usr/bin/env node
/**
 * build-pob-item-bases.mjs — PoB が知っているベースの一覧 (2026-10-02 火力チェックの装備の差し替え)
 *
 * 日本語のアイテムの文面からベース名を引く時 (src/services/pob-check/item-text.ts) の決まり:
 *   - 辞書 (items-ja-client.json / items-ja.json) は通貨・ジェム・マップも混ざっているので、**PoB の itemBases にある物だけ** に限る
 *     (「ゴールドアミュレット」の中の「ゴールド」= 通貨を拾っていた)
 *   - 日本語が同じベースが 13 組ある (神秘の装束 = Arcane Raiment / Mystic Raiment など)。アイテムクラス・要求レベル・防御値で絞るので、
 *     それぞれの種類 (type)・要求レベル (req.level)・素の防御値 (armour) をここに持つ
 *
 *   入力: vendor/PathOfBuilding-PoE2/src/Data/Bases/*.lua (`itemBases["..."] = { type = "...", armour = {...}, req = {...} }`)
 *         data-cache/client-export/tables/{English,Japanese}/ItemClasses.json (文面の「アイテムクラス: 鎧」→ PoB の type)
 *   出力: src/data/pob-item-bases.json
 *         { classes: { "<日本語のクラス名>": "<PoB の type>" }, bases: { "<英語名>": { type, level?, armour?, evasion?, es?, ward?, implicits? } } }
 *         implicits = ベースの固有 MOD の型 (PoB の implicit。区切り線の無い文面で暗黙と明示を分けるのに使う)
 *
 *   node scripts/build-pob-item-bases.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASES = resolve(ROOT, "vendor/PathOfBuilding-PoE2/src/Data/Bases");
const CLASSES = resolve(ROOT, "data-cache/client-export/tables");
const OUT = resolve(ROOT, "src/data/pob-item-bases.json");

/** ゲームのクラス Id → PoB の type (名前が違う物だけ。それ以外は Id がそのまま type) */
const TYPE_BY_CLASS_ID = {
  Warstaff: "Staff",
  Buckler: "Shield",
  LifeFlask: "Flask",
  ManaFlask: "Flask",
  UtilityFlask: "Charm",
  IncursionArm: "Transcendent Limb",
  IncursionLeg: "Transcendent Limb",
};

const rows = (j) => (Array.isArray(j) ? j : j.rows || Object.values(j));
const load = (p) => rows(JSON.parse(readFileSync(p, "utf8")));

// ---- PoB の itemBases ----
const bases = {};
const types = new Set();
for (const f of readdirSync(BASES).filter((x) => x.endsWith(".lua"))) {
  // ファイルは CRLF
  const t = readFileSync(join(BASES, f), "utf8").replace(/\r\n/g, "\n");
  for (const m of t.matchAll(/itemBases\["([^"]+)"\] = \{([\s\S]*?)\n\}/g)) {
    const body = m[2];
    const type = /\n\ttype = "([^"]+)"/.exec(body)?.[1];
    if (!type) continue;
    types.add(type);
    const o = { type };
    const level = /\n\treq = \{[^}]*\blevel = (\d+)/.exec(body);
    if (level) o.level = Number(level[1]);
    const armour = /\n\tarmour = \{([^}]*)\}/.exec(body)?.[1] ?? "";
    for (const [key, name] of [["armour", "Armour"], ["evasion", "Evasion"], ["es", "EnergyShield"], ["ward", "Ward"]]) {
      const v = new RegExp("\\b" + name + " = (\\d+)").exec(armour);
      if (v && Number(v[1]) > 0) o[key] = Number(v[1]);
    }
    // ベースの固有 MOD (暗黙) の型 (「+(20-30)% to Fire Resistance」「Grants Skill: Level (1-20) Chaos Bolt」)。
    // 区切り線の無い文面 (取引所のコピー) で暗黙と明示を分けるのに使う (item-text.ts)。
    // Lua の文字列は複数行を "\n" で、変種を {variant:N} で持つ。同じ名前のベースが複数ある (Runemastered … の変種) ので合わせて持つ
    const implicitRaw = /\n\timplicit = "((?:[^"\\]|\\.)*)"/.exec(body)?.[1];
    const implicits = implicitRaw
      ? implicitRaw.split("\\n").map((s) => s.replace(/^\{variant:[\d,]+\}/, "").trim()).filter(Boolean)
      : [];
    const prev = bases[m[1]];
    if (prev?.implicits) for (const s of prev.implicits) if (!implicits.includes(s)) implicits.push(s);
    if (implicits.length) o.implicits = implicits;
    bases[m[1]] = o;
  }
}

// ---- 文面の「アイテムクラス」(日本語) → PoB の type ----
const classes = {};
const cEn = load(`${CLASSES}/English/ItemClasses.json`);
const cJa = load(`${CLASSES}/Japanese/ItemClasses.json`);
for (let i = 0; i < cEn.length; i++) {
  const id = cEn[i].Id;
  const ja = String(cJa[i]?.Name ?? "").trim();
  const type = TYPE_BY_CLASS_ID[id] ?? id;
  if (!ja || !types.has(type)) continue;
  classes[ja] = type;
}

const names = Object.keys(bases).sort();
const text = [
  "{",
  `"generated": ${JSON.stringify(new Date().toISOString().slice(0, 10))},`,
  `"source": "vendor の PoB の Data/Bases/*.lua (type / req.level / armour) と GGG クライアント ItemClasses (日本語のクラス名)",`,
  `"classes": ${JSON.stringify(classes)},`,
  '"bases": {',
  names.map((n, i) => `${JSON.stringify(n)}: ${JSON.stringify(bases[n])}${i < names.length - 1 ? "," : ""}`).join("\n"),
  "}",
  "}",
  "",
].join("\n");
writeFileSync(OUT, text);
console.log(`[build-pob-item-bases] ベース ${names.length} 件 / クラス ${Object.keys(classes).length} 件 -> ${OUT}`);
