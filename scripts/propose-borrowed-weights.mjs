#!/usr/bin/env node
/**
 * propose-borrowed-weights.mjs — 重みが公開されていない MOD に「似た普通の MOD」の重みを借りる案を出す (2026-10-09)
 *
 * オーナー「特殊 MOD 及び冒涜 MOD に関しては似た MOD と同じ重さで。本当に同じような種類が無い奴は別途相談。出力してくれ、最後にこれは決める」。
 * 対象: 冒涜 (desecrated) と、ルーンで付く MOD (rune pools)。poe2db でも重みは 1 (非公開)。
 * 借り方 (上から順に当たった物):
 *   1. 同じ部位の普通の置き場に同じ系統 → その MOD の段のうち、レベルが一番近い段の重み
 *   2. 他の部位の普通の置き場に同じ系統 → 同じく (部位の名前を書く)
 *   3. 無し → 「相談」
 * 結果: docs/reviews/2026-10-09-borrowed-weights.md (オーナーが決める用の一覧)
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { loadPatchSync, jaOfMod } = await bundleEntry("scripts/_audit-poe2db-entry.ts");
const data = loadPatchSync();

/** ルーンの MOD は系統に Rune_<種類>_ が付いていることがある */
const bareFam = (f) => f.replace(/^Rune_[a-z]+_/, "").replace(/^Desecrated_/, "");
const famsOf = (m) => (m.families ?? [m.family]).map(bareFam);
const sideOf = (b, id) => (b.pools.normal.prefixes.includes(id) || b.pools.desecrated.prefixes.includes(id) || Object.values(b.pools.rune ?? {}).some((p) => p.prefixes.includes(id)) ? "P" : "S");

/** 普通の置き場: 部位 → 系統 → MOD */
const normalByCls = new Map();
for (const [cls, b] of data.bases) {
  const map = new Map();
  for (const id of [...b.pools.normal.prefixes, ...b.pools.normal.suffixes]) {
    const m = data.mods.get(id);
    if (!m || m.rune || !m.tiers.some((t) => t.weight > 0)) continue;
    for (const f of famsOf(m)) if (!map.has(f)) map.set(f, m);
  }
  normalByCls.set(cls, map);
}
const nearest = (m, lvl) => {
  const ts = m.tiers.filter((t) => t.weight > 0);
  return ts.reduce((a, t) => (Math.abs(t.ilvl - lvl) < Math.abs(a.ilvl - lvl) ? t : a), ts[0]);
};
/** 文の形 (数字と # を外す) */
const textSig = (m) => jaOfMod(m).replace(/[#\d.+\-()%]/g, "").replace(/\s+/g, "");
const group = (cls) => cls.replace(/_(str|dex|int|str_dex|str_int|dex_int|str_dex_int|fire|cold|lightning|chaos|physical|cannon)$/, "");

/** 系統 + 種類 (冒涜 / ルーン名) ごとにまとめる */
const rows = new Map();
for (const [cls, b] of data.bases) {
  const lists = [["冒涜", [...b.pools.desecrated.prefixes, ...b.pools.desecrated.suffixes]]];
  for (const [rid, p] of Object.entries(b.pools.rune ?? {})) lists.push([`ルーン ${rid}`, [...p.prefixes, ...p.suffixes]]);
  for (const [kind, ids] of lists) for (const id of ids) {
    const m = data.mods.get(id);
    if (!m) continue;
    const fams = famsOf(m);
    const lvl = Math.max(...m.tiers.map((t) => t.ilvl));
    // 優先: 同じ文 (同じ部位 → 他の部位) → 系統だけ同じ (同じ部位 → 他の部位)
    const sig = textSig(m);
    let src = null;
    for (const sameText of [true, false]) {
      for (const c2 of [cls, ...normalByCls.keys()]) {
        const hit = fams.map((f) => normalByCls.get(c2).get(f)).find((n) => n && (!sameText || textSig(n) === sig));
        if (hit) { src = { how: sameText ? "同じ文" : "系統だけ同じ", cls: c2, m: hit }; break; }
      }
      if (src) break;
    }
    const key = `${kind}|${sideOf(b, id)}|${fams.join("+")}|${jaOfMod(m)}`;
    const r = rows.get(key) ?? { kind, side: sideOf(b, id), fams, text: jaOfMod(m), lvl, classes: new Set(), borrow: new Map(), now: new Set() };
    r.classes.add(group(cls));
    m.tiers.forEach((t) => r.now.add(t.weight));
    if (src) {
      const t = nearest(src.m, lvl);
      r.how = src.how;
      r.borrow.set(`${group(src.cls) === group(cls) ? "" : `${group(src.cls)} の `}${jaOfMod(src.m)} Lv${t.ilvl} = ${t.weight}`, src.how);
    }
    rows.set(key, r);
  }
}

const all = [...rows.values()];
const ok = all.filter((r) => r.how === "同じ文");
const near = all.filter((r) => r.how === "系統だけ同じ");
const ask = all.filter((r) => !r.borrow.size);
const line = (r) => `| ${r.kind} | ${r.side} | ${r.text.replace(/\|/g, "/")} | ${[...r.classes].join("・")} | ${[...r.now].join("/")} | ${[...r.borrow.keys()].join("<br>").replace(/\|/g, "/") || "—"} |`;
const head = "| 種類 | 側 | MOD | 部位 | 今の重み | 借りる案 (似た普通の MOD と段) |\n|---|---|---|---|---|---|";
const md = `# 重みの借り先の案 (冒涜・ルーンの特殊 MOD) — 2026-10-09

poe2db でも重みは非公開 (1 表示)。今はどれも同じ重み (冒涜 = 等倍、ルーン = 1000) で引いている。
借り方: 同じ系統・同じ文の普通の MOD (同じ部位 → 他の部位) の、レベルが一番近い段の重み。文が違う物は「要確認」、
同じ系統がどこにも無い物は「相談」に分けた。**決めるのはオーナー** (この表は案)。

- 借りられる (同じ文の普通の MOD がある): ${ok.length} 種
- 要確認 (系統は同じだが文が違う。例: 呪印スキルのレベル ← 近接スキルのレベル): ${near.length} 種
- 相談 (似た普通の MOD が無い): ${ask.length} 種

## 相談 (似た普通の MOD が無い)

${head}
${ask.sort((a, b) => a.kind.localeCompare(b.kind) || a.text.localeCompare(b.text)).map(line).join("\n")}

## 要確認 (系統だけ同じ)

${head}
${near.sort((a, b) => a.kind.localeCompare(b.kind) || a.text.localeCompare(b.text)).map(line).join("\n")}

## 借りられる (同じ文)

${head}
${ok.sort((a, b) => a.kind.localeCompare(b.kind) || a.text.localeCompare(b.text)).map(line).join("\n")}
`;
const out = resolve(ROOT, "docs/reviews/2026-10-09-borrowed-weights.md");
writeFileSync(out, md);
console.log(`借りられる ${ok.length} / 要確認 ${near.length} / 相談 ${ask.length} → ${out}`);
