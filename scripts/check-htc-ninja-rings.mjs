#!/usr/bin/env node
/**
 * check-htc-ninja-rings.mjs — 上位プレイヤーの指輪で、判定と自動で組むツリーを回す (2026-09-24)
 *
 * オーナー:「忍者から DPS 順で、各アセンダンシーから 1 つレア指輪取ってもいい」。**通信はしない**: アプリの「上位プレイヤー
 * MOD 一覧」が保存した %APPDATA%/com.kyohei.exiledesk/craft_v2_cache.json を読むだけ (無ければ飛ばす)。
 * 保存に ilvl・品質・固定済み / 冒涜の印は無いので、ilvl 82・印無しとして読む。段は問わない (流れを見る)。
 * 見ること: クラフト非推奨でない物は、完成 95% 以上・触らない MOD (樹 MOD) が消えない
 *   node scripts/check-htc-ninja-rings.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { bundleEntry } from "./_bundle-ts.mjs";
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
const CACHE = (process.env.APPDATA ?? "") + "/com.kyohei.exiledesk/craft_v2_cache.json";
if (!existsSync(CACHE)) { console.log("上位プレイヤーの保存が無いので飛ばします: " + CACHE); process.exit(0); }
const cache = JSON.parse(readFileSync(CACHE, "utf8"));
let failed = 0;
const D = 506;
const src = readFileSync("scripts/check-htc-spam-plan.mjs", "utf8");
const a = src.indexOf("const div = (v)"), b = src.indexOf("const it = M.parseJaItem");
const prices = new Function("D", src.slice(a, b) + "; return prices;")(D);
const NL = String.fromCharCode(10);
const strip = (t) => t.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
const v = (x) => ({ value: x });
for (const asc of cache.ascendancies) {
  const chars = [...asc.characters].sort((x, y) => Math.max(0, ...y.skills.map((s) => s.dps || 0)) - Math.max(0, ...x.skills.map((s) => s.dps || 0)));
  let ring = null, who = null;
  for (const ch of chars) { ring = ch.rare_items.find((r) => /^Ring/.test(r.inventory_id)); if (ring) { who = ch.name; break; } }
  if (!ring) { console.log(`${asc.class}: 指輪なし`); continue; }
  const text = ["Item Class: Rings", "Rarity: Rare", "X", ring.base_type, "--------", "Item Level: 82", "--------", ...ring.explicit_mods.map(strip)].join(NL);
  const it = M.parseJaItem(text);
  const g = M.targetsFor(data, it);
  const cls = M.baseForSolving(data, it.baseType, g.skippedSides);
  const kind = M.startKindOf({ dropOnly: v(g.dropOnly), data: v(data), slotsUsed: v(g.skippedSides), targets: v(g.targets), item: v(it) });
  const cannot = g.skipped.filter((t) => !g.dropOnly.some((d) => d.text === t));
  let sim = "";
  if (cls && kind.kind !== "unsafe" && g.targets.length) {
    const limits = M.sideLimits(data, it.baseType);
    const slots = [];
    let fixedDone = false;
    for (const [side, n, S] of [["prefix", g.skippedSides.prefixes, "P"], ["suffix", g.skippedSides.suffixes, "S"]]) {
      const treeOn = g.dropOnly.filter((x) => x.side === S).length;
      for (let i = 0; i < n; i++) {
        const fix = kind.kind === "fix" && kind.fixSide === S && i < treeOn && !fixedDone;
        if (fix) fixedDone = true;
        slots.push(fix ? { modId: null, side, fixed: true } : { modId: null, side, fixed: false, keep: true });
      }
    }
    const nP = slots.filter((x) => x.side === "prefix").length, nS = slots.filter((x) => x.side === "suffix").length;
    const keepP = slots.some((x) => x.keep && x.side === "prefix"), keepS = slots.some((x) => x.keep && x.side === "suffix");
  const roomP = limits.prefix - nP, roomS = limits.suffix - nS;
  slots.push({ modId: null, side: keepP !== keepS && (keepP ? roomS : roomP) > 0 ? (keepP ? "suffix" : "prefix") : roomS >= roomP ? "suffix" : "prefix", fixed: false });
    const nodes = M.autoTree({ data, prices, targets: g.targets.map((t) => ({ ...t, minTierIndex: 0 })), fixedIds: [], qualityTag: null, chaosOk: !slots.some((x) => x.keep), protectedSides: [...new Set(slots.filter((x) => x.keep).map((x) => x.side))] });
    const r = M.simulateTree({ ctx: { data, cls, prices, itemLevel: 82, limits, catalystOk: () => true, baseQuality: 20 }, start: { slots, breach: false }, nodes, runs: 100 });
    const lost = r.stops.filter((x) => x.reason.includes("消えたら終わり")).reduce((s2, x) => s2 + x.p, 0);
    if (r.pDone < 0.95 || lost > 0) failed++;
    sim = `${r.pDone < 0.95 || lost > 0 ? "NG " : ""}ツリー 手 ${nodes.length} / 完成 ${(r.pDone * 100).toFixed(0)}% / 平均 ${(r.expected / D).toFixed(0)} 神 / 消えた ${(lost * 100).toFixed(0)}%${r.stops[0] && r.pDone < 1 ? " / 止まり: " + r.stops[0].reason : ""}`;
  }
  console.log(`${asc.class} (${who}) ${ring.base_type}: 狙い ${g.targets.length} / 樹 ${g.dropOnly.length} / 作れない ${cannot.length} / 暗黙 ${g.implicits.length} → ${kind.kind}${kind.reasons ? " (" + kind.reasons.join("; ") + ")" : ""}`);
  if (cannot.length) console.log("   作れない:", cannot.join(" / "));
  if (sim) console.log("   " + sim);
}
console.log(failed ? `${NL}NG: ${failed} 件` : `${NL}全部 OK`);
process.exit(failed ? 1 : 0);
