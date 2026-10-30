/**
 * socket-as-gear-probe.mjs — 「はめた物が手袋 / 兜 / 靴として効く」宝飾品 (グラスピングリング・コロナアミュレット・ストーキングベルト) に
 * ルーンをはめた時、エンジンで何が変わるかを見る (解析係、2026-10-31。記事編集長のブログ候補 7 の書けるかの確かめ)。
 * 結果は docs/org/math/notes/2026-10-31-socket-as-gear.md。
 *
 *   node scripts/analysis/socket-as-gear-probe.mjs [N=3000] [SEED=1]
 *
 * 見る物:
 *   1. ベースの部位・暗黙・白の時のソケット数 (baseSocketsOf)・ルーンを見る部位 (runeCategoryOf)・pools.rune に何があるか
 *   2. コルの狩り (グラスピングリング・手袋)、ヴォラナの虐殺 (コロナアミュレット・兜)、ウートレドの星読み (ストーキングベルト・靴) をはめ、
 *      はめた後の高貴・カオスの候補 (candidates) に特殊 MOD (mod.rune) が混ざるか、混ざるなら重みの割合
 *   3. 高貴を N 回打って、特殊 MOD が付く回数 (候補の割合と合うか)
 *   4. 兜・手袋・靴で効き目を持つルーン・魂の核 (stage-runes.json) のうち、抽選を変える物 (エンジンの RUNES = pool / crafted / suffix / convert)
 *
 * 入口は台本の中で一時フォルダに書いて束ねる (リポジトリに入口のファイルを増やさないため)。打つのはエンジンの入口 (engine.ts) の手
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bundleEntry } from "../_bundle-ts.mjs";

const ROOT = resolve(".").replace(/\\/g, "/");
const dir = mkdtempSync(join(tmpdir(), "exiledesk-probe-"));
const entry = join(dir, "entry.ts");
writeFileSync(entry, [
  `export { loadPatch } from "${ROOT}/tests/helpers/patch";`,
  `export { startFrom, applyCurrency, candidates, effectiveCls, stageRuneIds, baseSocketsOf, htcBaseInfo, RUNES, runeEffectFor, RUNE_BY_ID, mulberry32, limitOf } from "${ROOT}/src/services/craft-stage/engine";`,
  `export { runeCategoryOf } from "${ROOT}/src/services/craft-stage/stage-runes";`,
].join("\n"));
const M = await bundleEntry(entry);
const N = Number(process.argv[2] ?? 3000);
const SEED = Number(process.argv[3] ?? 1);
const data = M.loadPatch();
const info = M.htcBaseInfo();
const pct = (x) => `${(x * 100).toFixed(2)}%`;

const CASES = [
  { base: "Grasping Ring", rune: "Kolr's Hunt", ref: "Sirenscale Gloves" },
  { base: "Corona Amulet", rune: "Vorana's Carnage", ref: null },
  { base: "Stalking Belt", rune: "Uhtred's Sidereus", ref: null },
];

function describeBase(base) {
  const it = M.startFrom(data, base, 82, {}, 1);
  const cls = it.cls;
  console.log(`\n## ${base}`);
  console.log(`  部位 (cls.category) = ${cls.category} / 置き場の行 = ${cls.id ?? cls.name ?? "?"}`);
  console.log(`  暗黙 = ${(info[base]?.implicits ?? []).map((l) => l.en).join(" | ")}`);
  console.log(`  白の時のソケット (baseSocketsOf) = ${M.baseSocketsOf(base, cls.category)} / ルーンを見る部位 (runeCategoryOf) = ${M.runeCategoryOf(it)}`);
  console.log(`  pools.rune のルーン = ${Object.keys(cls.pools.rune ?? {}).join(", ") || "(無し)"}`);
  console.log(`  上限 (limits) = ${JSON.stringify(cls.limits ?? "既定")}`);
  return it;
}

/** 候補のうち特殊 MOD (mod.rune) の割合 (側ごと、重み) */
function runeShare(it) {
  const out = {};
  for (const side of ["prefix", "suffix"]) {
    const cs = M.candidates(data, it, [side], 0);
    const tot = cs.reduce((a, c) => a + c.w, 0);
    const rs = cs.filter((c) => c.mod.rune);
    const rw = rs.reduce((a, c) => a + c.w, 0);
    out[side] = { n: cs.length, tot, rn: rs.length, rw, list: rs.map((c) => `${c.mod.id} (${c.w})`) };
  }
  return out;
}

function printShare(label, s) {
  for (const side of ["prefix", "suffix"]) {
    const x = s[side];
    console.log(`  ${label} ${side}: 候補 ${x.n} 系統・重み ${x.tot} / 特殊 MOD ${x.rn} 系統・重み ${x.rw} (${x.tot ? pct(x.rw / x.tot) : "-"})`);
    for (const l of x.list) console.log(`      ${l}`);
  }
}

function exaltSample(it, n, seed) {
  const rng = M.mulberry32(seed);
  let hit = 0, ok = 0;
  for (let i = 0; i < n; i++) {
    // 魔法 → 王者の代わりに、レアの白 (MOD 0) に高貴 1 回
    const r = M.applyCurrency(data, { ...it, rarity: "rare" }, "exalt", rng);
    if (!r.applied) continue;
    ok++;
    if (r.added?.some((m) => data.mods.get(m.modId)?.rune)) hit++;
  }
  return { ok, hit };
}

for (const c of CASES) {
  const plain = describeBase(c.base);
  printShare("はめる前", runeShare(plain));
  let socketed;
  try {
    socketed = M.startFrom(data, c.base, 82, { sockets: 1, runes: [c.rune] }, 1);
  } catch (e) {
    console.log(`  ${c.rune} をはめる: 断られた — ${e.message}`);
    continue;
  }
  const aug = socketed.augments?.[0];
  console.log(`  ${c.rune} をはめる: 通った。効き目の部位 = ${aug?.cat} / 文 = ${aug?.textEn}`);
  console.log(`  stageRuneIds = ${JSON.stringify(M.stageRuneIds(socketed))} / effectiveCls の pools は元と同じ物 = ${M.effectiveCls(socketed).pools === socketed.cls.pools}`);
  printShare("はめた後", runeShare(socketed));
  const ex = exaltSample(socketed, N, SEED);
  console.log(`  高貴 ${ex.ok} 回 (白のレアに 1 つ): 特殊 MOD が付いた ${ex.hit} 回 (${ex.ok ? pct(ex.hit / ex.ok) : "-"})`);
  if (c.ref) {
    const g = M.startFrom(data, c.ref, 82, { sockets: 1, runes: [c.rune] }, 1);
    console.log(`  比べ: ${c.ref} に ${c.rune} (部位 ${g.cls.category}、pools.rune = ${Object.keys(g.cls.pools.rune ?? {}).join(", ")})`);
    printShare(`${c.ref}`, runeShare(g));
    const eg = exaltSample(g, N, SEED);
    console.log(`  高貴 ${eg.ok} 回: 特殊 MOD ${eg.hit} 回 (${eg.ok ? pct(eg.hit / eg.ok) : "-"})`);
  }
}

// セールの凱旋 (どの装備にも) を指輪にはめた時の枠
for (const base of ["Grasping Ring", "Corona Amulet"]) {
  try {
    const it = M.startFrom(data, base, 82, { rarity: "rare", sockets: 1, runes: ["Serle's Triumph"] }, 1);
    console.log(`\n${base} にセールの凱旋: サフィックスの枠 = ${M.limitOf(it, "suffix")} (元 ${M.limitOf({ ...it, augments: [] }, "suffix")})`);
  } catch (e) { console.log(`\n${base} にセールの凱旋: 断られた — ${e.message}`); }
  try {
    const it = M.startFrom(data, base, 82, { rarity: "rare", sockets: 1, runes: ["Astrid's Creativity"] }, 1);
    console.log(`${base} にアストリッドの創造性: はまった (効き目 ${it.augments?.[0]?.textEn})`);
  } catch (e) { console.log(`${base} にアストリッドの創造性: 断られた — ${e.message}`); }
}

// 4. 兜・手袋・靴で効き目を持つ物のうち、クラフトの決まりを変える物 (エンジンの RUNES) の洗い出し
console.log("\n## 兜 / 手袋 / 靴で効き目を持ち、抽選・枠を変える物 (stage-runes.json ∩ エンジンの RUNES)");
const byName = new Map([...M.RUNE_BY_ID.values()].map((r) => [r.name.replace(/[’']/g, "'"), r]));
for (const cat of ["Helmets", "Gloves", "Boots"]) {
  const rows = Object.entries(M.RUNES).filter(([, r]) => r.available !== false && M.runeEffectFor(r, cat));
  const rule = rows.filter(([en]) => byName.has(en.replace(/[’']/g, "'")));
  console.log(`  ${cat}: 効き目のある物 ${rows.length} 個 (ルーン ${rows.filter(([, r]) => r.kind === "rune").length}・魂の核 ${rows.filter(([, r]) => r.kind === "soulcore").length}・アイドル ${rows.filter(([, r]) => r.kind === "talisman").length})、決まりを変える物 = ${rule.map(([en]) => `${en} (${JSON.stringify(byName.get(en.replace(/[’']/g, "'")).effect)})`).join(" / ") || "無し"}`);
}
