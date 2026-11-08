#!/usr/bin/env node
/**
 * build-runeforged.mjs — ベース → ルーンフォージ版 (Runeforged ○○) の一覧とワードの値 (E-78、2026-11-08 深夜)
 *
 * 正は poe2db (E-01、オーナー 11-08「dbで」): 防具の部位ページ (https://poe2db.tw/us/Body_Armours など) に並ぶ Runeforged ○○ の
 * 性質の行 (Armour / Evasion Rating / Energy Shield / Runic Ward) をそのまま取る。元のベースはレシピのページ (https://poe2db.tw/us/Runeforging) の Cost で決め、
 * ユニークから作る物は入れない (11-09)。同じ元から作る版が幾つもある物は poe2db に並ぶ数だけ版として持つ。
 * PoB の Data/Bases/*.lua は食い違いを数えるだけ (POB_BASES があれば)。ルーンマスター版は入れない (11-08 ブラック 65)。ワードの無い版は入れない。
 *
 *   取った写し: data-cache/poe2db-runeforged-<日付>/<部位>.html・Runeforging.html (--cache で替える。あれば取り直さない)
 *   出力: src/services/craft-stage/stage-runeforged.json
 *         { generated, source, bases: { "<元のベースの英語名>": [{ name, ward, armour?, evasion?, es? }] } }
 *
 *   node scripts/build-runeforged.mjs --cache C:/Users/kyohei/ExileDesk/data-cache/poe2db-runeforged-2026-11-08 \
 *     [POB_BASES=C:/Users/kyohei/ExileDesk/vendor/PathOfBuilding-PoE2/src/Data/Bases]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { argOf } from "./_poe2db-common.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = new Date().toISOString().slice(0, 10);
const CACHE = argOf("cache", resolve(ROOT, `data-cache/poe2db-runeforged-${DAY}`));
const OUT = resolve(ROOT, "src/services/craft-stage/stage-runeforged.json");
const PAGES = ["Body_Armours", "Helmets", "Gloves", "Boots", "Shields", "Bucklers", "Foci"];
const PROP = { Armour: "armour", "Evasion Rating": "evasion", "Energy Shield": "es", "Runic Ward": "ward" };

mkdirSync(CACHE, { recursive: true });
async function page(p) {
  const file = join(CACHE, `${p}.html`);
  if (!existsSync(file)) {
    const res = await fetch(`https://poe2db.tw/us/${p}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`${p}: ${res.status}`);
    writeFileSync(file, await res.text());
    await new Promise((r) => setTimeout(r, 1500));
  }
  return readFileSync(file, "utf8");
}
// 元のベースは名前でなくレシピの Cost で決める (11-09): https://poe2db.tw/us/Runeforging の「結果 ← Cost: 元の品」。
// 名前が同じでも元が別 (Runeforged Gladiatorial Helm の 1 つは Cassis Helm から) や、ユニークから作る物 (Blackbraid Fur Plate → Runeforged Fur Plate、
// Cost の頭が UniqueItems の <span>・<a>) がある。Cost の頭が普通のベース (whiteitem) の物はその元へ、ユニークからだけの物は入れない。
// poe2db にレシピの載っていない版 (88 件、Runeforged Glorious Plate など) は今までどおり名前で元を決める。ただし同じ元にレシピのある版があればそちらだけ
const from = new Map();
const uniqueOnly = new Set();
for (const m of (await page("Runeforging")).matchAll(/BaseItemTypes_hover\/([0-9a-f]+)" href="Runeforged_[^"]*">Runeforged [^<]*<\/a><\/div><div>Cost: (<(?:span|a) class="UniqueItems|<a class="whiteitem[^"]*" data-hover="[^"]*" href="[^"]*">([^<]+)<\/a>)/g)) {
  if (m[3] && !/^Rune(forged|mastered) /.test(m[3])) from.set(m[1], m[3]);
  else uniqueOnly.add(m[1]);
}
const byName = {};
const bases = {};
const seen = new Set();
const noRecipe = new Set();
const skipped = new Set();
for (const p of PAGES) {
  const html = await page(p);
  // 1 品 = 名前のリンクから次の品のリンクまで
  const parts = html.split(/<a class="whiteitem[^"]*"/).slice(1);
  for (const part of parts) {
    const name = />(Runeforged [^<]+)<\/a>/.exec(part)?.[1];
    if (!name) continue;
    const o = { name };
    for (const m of part.matchAll(/>(Armour|Evasion Rating|Energy Shield|Runic Ward)<\/a>: <span[^>]*>(\d+)<\/span>/g)) if (Number(m[2]) > 0) o[PROP[m[1]]] ??= Number(m[2]);
    if (!o.ward) continue;
    // 部位ページは同じ品を 2 回 (表と一覧) 載せるので、項目 (BaseItemTypes の hover の id) が同じ物は 1 つに。id の違う物は値が同じでも別の版
    const id = /BaseItemTypes_hover\/([0-9a-f]+)"/.exec(part)?.[1] ?? JSON.stringify(o);
    if (seen.has(id)) continue;
    seen.add(id);
    const base = from.get(id);
    if (!base) {
      if (uniqueOnly.has(id)) skipped.add(name);
      else { noRecipe.add(name); const l = (byName[name.slice("Runeforged ".length)] ??= []); if (!l.some((x) => JSON.stringify(x) === JSON.stringify(o))) l.push(o); }
      continue;
    }
    // 値が全部同じ別の項目 (Runeforged Shrouded Mail・Tournament Mail は 3 つずつ) は画面で見分けが付かないので 1 つに
    const list = (bases[base] ??= []);
    if (!list.some((x) => JSON.stringify(x) === JSON.stringify(o))) list.push(o);
  }
}
for (const [b, list] of Object.entries(byName)) if (!bases[b]) bases[b] = list; else for (const o of list) skipped.add(`${o.name} (${b} はレシピのある版だけ)`);
const names = Object.keys(bases).sort();
writeFileSync(OUT, [
  "{",
  `"generated": ${JSON.stringify(DAY)},`,
  `"source": "poe2db の防具の部位ページ (https://poe2db.tw/us/${PAGES.join(" ・ ")}) の Runeforged ○○ の性質の行、元のベースは https://poe2db.tw/us/Runeforging の Cost (E-01)",`,
  `"bases": {`,
  names.map((n, i) => `${JSON.stringify(n)}: ${JSON.stringify(bases[n])}${i < names.length - 1 ? "," : ""}`).join("\n"),
  "}}",
  "",
].join("\n"));
const many = names.filter((n) => bases[n].length > 1);
console.log(`入れない (ユニークからだけ・同じ元にレシピのある版がある) ${skipped.size}: ${[...skipped].join(", ")}`);
console.log(`poe2db にレシピが無く名前で元を決めた ${noRecipe.size}`);
console.log(`poe2db: ベース ${names.length} / 版 ${names.reduce((a, n) => a + bases[n].length, 0)} / 版が 2 つ以上 ${many.length}: ${many.map((n) => `${n} (${bases[n].map((x) => x.ward).join("/")})`).join(", ")}`);

// PoB との食い違い (参考。正は poe2db)
if (process.env.POB_BASES) {
  const pob = {};
  for (const f of readdirSync(process.env.POB_BASES).filter((x) => x.endsWith(".lua"))) {
    const t = readFileSync(join(process.env.POB_BASES, f), "utf8").replace(/\r\n/g, "\n");
    for (const m of t.matchAll(/itemBases\["Runeforged ([^"]+)"\] = \{([\s\S]*?)\n\}/g)) {
      const a = /\n\tarmour = \{([^}]*)\}/.exec(m[2])?.[1] ?? "";
      const o = { name: `Runeforged ${m[1]}` };
      for (const [k, s] of [["ward", "Ward"], ["armour", "Armour"], ["evasion", "Evasion"], ["es", "EnergyShield"]]) { const v = new RegExp("\\b" + s + " = (\\d+)").exec(a); if (v && Number(v[1]) > 0) o[k] = Number(v[1]); }
      if (o.ward) (pob[m[1]] ??= []).push(o);
    }
  }
  const key = (xs) => xs.map((x) => JSON.stringify(Object.fromEntries(Object.entries(x).sort()))).sort().join("|");
  const all = [...new Set([...names, ...Object.keys(pob)])].sort();
  const diff = all.filter((n) => key(bases[n] ?? []) !== key(pob[n] ?? []));
  console.log(`PoB と食い違い ${diff.length} / ${all.length}`);
  for (const n of diff.slice(0, 30)) console.log(`  ${n}: db ${JSON.stringify(bases[n] ?? [])} / PoB ${JSON.stringify(pob[n] ?? [])}`);
}
