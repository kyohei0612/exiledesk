#!/usr/bin/env node
/**
 * craft-stage-run.mjs — クラフトステージの再生 (手順 JSON → 結果 JSON)。POE2Tube の動画生成から呼ぶ (2026-09-27、ADR-001)
 *
 *   node scripts/craft-stage-run.mjs plan.json result.json [--prices prices.json] [--league "Forbidden Rites"] [--generated-at ISO]
 *
 * 形は POE2Tube の contracts (craft-stage-plan/1 → craft-stage-result/1)。同じ手順 JSON なら同じ結果 JSON
 * (1 手ごとの seed = plan.seed + 手の番号。--generated-at を渡せば時刻も固定できる)。
 * 値段 (高貴建て): --prices の JSON ({ "transmute": 0.05, ... } か { "currency": { ... } }) を使う。無ければ検算用の固定相場
 * (scripts/_htc-test-prices.mjs、2026-09-23 の相場)。アプリの相場 (market-store) は Node から読めないので、最新の値段が
 * 要る時はアプリから相場を書き出して渡す。外部 API は叩かない。
 *
 * PoB (2026-09-29、POE2Tube 要望 ⑰-3 / ⑰-4、同梱のヘッドレス PoB を src-tauri/examples/stage_pob.rs で呼ぶ):
 *   - 手順 JSON に pob ({ class, level, skill, supports?, gem_level?, config? }) があれば、手 0 と各手の後で PoB を計算して
 *     結果 JSON の pob (前提・実際に使った設定・手ごとの DPS / 防御 / 耐性) と steps[i].pob に入れる
 *   - node scripts/craft-stage-run.mjs --resists spec.json out.json … 耐性の画面 (view=resists&r=<out>) 用。
 *     spec: { pob: { class, level, config? }, items: [{ plan, step? }], penalties?: [0, -10, … -60] }
 *     → { version, items, equip (装備だけの合計), rows: [{ penalty, label, resists }] }
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { prices as testPrices } from "./_htc-test-prices.mjs";
import { pobEnemy, pobGems, pobQuests, runStagePob } from "./_pob-stage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
/** 値を取るオプション (その次の引数は位置引数ではない) */
const VALUED = ["--prices", "--league", "--generated-at"];
const [planPath, outPath] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && VALUED.includes(args[i - 1])));
if (!planPath || !outPath) {
  console.error("使い方: node scripts/craft-stage-run.mjs plan.json result.json [--prices prices.json] [--league 名前] [--generated-at ISO]");
  process.exit(2);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const pricesArg = opt("--prices");
const priceFile = pricesArg ? JSON.parse(readFileSync(pricesArg, "utf8")) : null;
const prices = priceFile ? (priceFile.currency ?? priceFile) : testPrices.currency;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const mods = JSON.parse(readFileSync(join(root, "src/vendor/poe2htc/data/mods.json"), "utf8"));

const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();
if (args.includes("--resists")) {
  resists(plan);
  process.exit(0);
}
const result = M.runPlan(data, plan, {
  prices,
  exiledeskVersion: pkg.version,
  patch: mods.patch ?? "unknown",
  league: opt("--league") ?? null,
  ...(opt("--generated-at") ? { generatedAt: opt("--generated-at") } : {}),
});

// ---- PoB (要望 ⑰-3): 手順 JSON に pob があれば、手 0 (始め) と各手の後のアイテムで PoB を計算して結果 JSON の pob と steps[i].pob に入れる ----
const skillJa = new Map(JSON.parse(readFileSync(join(root, "src/services/craft-stage/skill-art.json"), "utf8")).map((s) => [s.en, s.ja]));
/** 前提のキャラ (手順の pob) → stage_pob の入力の頭と、結果に書き戻す character / config */
function pobHead(p) {
  const G = pobGems(root);
  const gem = G.gem(p.skill);
  const gemLevel = p.gem_level ?? G.levelFor(p.skill, p.level);
  const supports = p.supports ?? [];
  const { config: base, ja } = M.pobConfigOf(p);
  // クエストの報酬 (要望 ⑲-6): quests_act (何アクトまで終えたか) より先のアクトの物を外す。無ければ PoB の既定 (全部入り)
  const quests = pobQuests(root).map((q) => ({ ...q, on: p.quests_act == null || q.act <= p.quests_act }));
  const config = { ...base, ...Object.fromEntries(quests.filter((q) => !q.on).map((q) => [q.key, false])) };
  // スキルの段 (要望 ⑱-4): skill_part は番号か名前。段 (parts) かステータスの組 (statSets) を選ぶ。無ければ PoB の既定 (1 つ目)
  const part = G.choose(p.skill, p.skill_part);
  const names = G.partNames(p.skill);
  const partIdx = part.skill_part ?? part.stat_set ?? 1;
  return {
    input: { class: p.class, level: p.level, gem_id: gem.gameId, gem_level: gemLevel, supports: supports.map((s) => G.gem(s).gameId), config, ...part },
    character: {
      class: p.class, level: p.level, skill: p.skill, skill_ja: skillJa.get(p.skill) ?? null, gem_level: gemLevel, supports,
      skill_part: names[partIdx - 1] ?? null, skill_parts: names,
    },
    config,
    config_ja: p.quests_act != null ? `${ja}・アクト ${p.quests_act} までのクエストの報酬` : `${ja}・クエストの報酬は全部 (PoB の既定)`,
    quests: quests.map(({ act, area, stat, on }) => ({ act, area, stat, on })),
  };
}
/** アイテム → PoB の装備 (壊れた・ユニーク・枠の無い物は装備しない) */
function equip(it, ring = 0) {
  const text = M.pobItemText(it);
  let slot = M.pobSlotOf(it.cls.category);
  if (slot === "Ring 1" && ring > 0) slot = "Ring 2";
  return text && slot ? [{ slot, text }] : [];
}
if (plan.pob) {
  const h = pobHead(plan.pob);
  const { steps } = M.playPlan(data, plan, prices);
  const items = [M.startItem(data, plan), ...steps.map((s) => s.after)];
  // 手ごとに 3 通り (全部 / ルーン無し / 素のベース) を回して DPS の層を作る (要望 ⑰-5 の view=dps)。武器でない手は全部だけ
  const isWeapon = (it) => M.pobSlotOf(it.cls.category) === "Weapon 1";
  const runs = items.flatMap((it) => (isWeapon(it) ? [equip(it), equip(M.noRunesOf(it)), equip(M.bareOf(it))] : [equip(it)]));
  const out = runStagePob(root, { ...h.input, steps: runs });
  let k = 0;
  const stats = items.map((it) => {
    const full = M.pobStatOf(out.steps[k++]);
    if (!isWeapon(it)) return full;
    const mods = M.pobStatOf(out.steps[k++]).dps;
    const base = M.pobStatOf(out.steps[k++]).dps;
    return { ...full, layers: { base, mods, full: full.dps } };
  });
  // 敵 (要望 ⑱-5 / ⑲-5): 表の値 + PoB が実際に使ったアーマー・回避・耐性 (enemyArmour 等の設定があればその値)
  const ie = out.steps[0]?.inspect?.enemy;
  const enemy = { ...pobEnemy(root, plan.pob.level, h.config), ...(ie ? { armour: ie.armour, evasion: ie.evasion, resists: { fire: ie.fire, cold: ie.cold, lightning: ie.lightning, chaos: ie.chaos } } : {}) };
  if (ie) enemy.ja = `${enemy.ja}・アーマー ${Math.round(ie.armour)}・回避力 ${Math.round(ie.evasion)}`;
  const off = stats.find((s) => s.skill?.disabled);
  if (off) console.warn(`PoB: ${off.skill.name} が使えない (${off.skill.disabled})。DPS は 0 になる (武器の種類が合っているか)`);
  const bad = [...new Set(stats.flatMap((s) => s.unparsed))];
  if (bad.length) console.warn(`PoB が読めなかった行: ${bad.join(" / ")}`);
  result.pob = { version: out.pob_version, enemy, character: h.character, config: h.config, config_ja: h.config_ja, quests: h.quests, steps: stats };
  result.steps.forEach((s, i) => { s.pob = stats[i + 1] ?? null; });
  const d0 = stats[0]?.dps ?? 0;
  const d1 = stats[stats.length - 1]?.dps ?? 0;
  console.log(`PoB ${out.pob_version}: ${h.character.skill} Lv${h.character.gem_level} / ${h.config_ja} / DPS ${d0.toFixed(1)} → ${d1.toFixed(1)}`);
}
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
const missing = [...new Set(plan.steps.map((s) => s.currency).filter((k) => prices[k] == null))];
if (missing.length) console.warn(`相場に無いカレンシー (費用 0 で数える): ${missing.join(", ")}`);
const ok = result.steps.filter((s) => s.applied).length;
console.log(`${result.steps.length} 手 (打てた ${ok}) / 最後: ${result.final.rarity} ${result.final.prefixes.length + result.final.suffixes.length} MOD / 費用 ${result.total_cost.toFixed(2)} 高貴${priceFile ? "" : " (検算用の固定相場)"} -> ${outPath}`);

/** 耐性の画面の値 (要望 ⑰-4): 装備を全部着けて、ペナルティごとに PoB で。装備だけの合計はアイテム無しとの差 */
function resists(spec) {
  const PEN = spec.penalties ?? [0, -10, -20, -30, -40, -50, -60];
  const PJA = { 0: "アクト 1 (0%)", "-10": "アクト 2 (-10%)", "-20": "アクト 3 (-20%)", "-30": "アクト 4 (-30%)", "-40": "アクト 5 (-40%)", "-50": "アクト 6 (-50%)", "-60": "エンドゲーム (-60%)" };
  let ring = 0;
  const items = spec.items.map((x) => {
    const played = M.playPlan(data, x.plan, prices, x.step ?? Infinity);
    return played.final;
  });
  const equipped = items.flatMap((it) => equip(it, it.cls.category === "Rings" ? ring++ : 0));
  const base = { class: spec.pob?.class ?? "Ranger", level: spec.pob?.level ?? 20, config: { enemyIsBoss: "None", ...(spec.pob?.config ?? {}) } };
  // ペナルティごとに別のビルド (設定) なので 1 本ずつ
  const outs = PEN.map((p) => runStagePob(root, { ...base, config: { ...base.config, resistancePenalty: p }, steps: [equipped, []] }));
  const r = (o, e) => ({ value: o[`${e}Resist`] ?? 0, total: o[`${e}ResistTotal`] ?? 0 });
  const E = { fire: "Fire", cold: "Cold", lightning: "Lightning", chaos: "Chaos" };
  const rows = outs.map((o, i) => ({ penalty: PEN[i], label: PJA[String(PEN[i])] ?? `${PEN[i]}%`, resists: Object.fromEntries(Object.entries(E).map(([k, e]) => [k, r(o.steps[0], e)])) }));
  const o0 = outs[0];
  const equipSum = Object.fromEntries(Object.entries(E).map(([k, e]) => [k, (o0.steps[0][`${e}ResistTotal`] ?? 0) - (o0.steps[1][`${e}ResistTotal`] ?? 0)]));
  // PoB が読めなかった行 (要望 ⑲-3)。空なら全部読めている
  const unparsed = [...new Set(o0.steps[0]?.inspect?.unparsed ?? [])];
  if (unparsed.length) console.warn(`PoB が読めなかった行: ${unparsed.join(" / ")}`);
  const out = { version: o0.pob_version, items: items.map((it) => ({ name: it.baseJa, base: it.base, rarity: it.rarity })), equip: equipSum, rows, unparsed };
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`耐性 (PoB ${out.version}): 装備 ${items.length} 個、ペナルティ ${PEN.length} 通り -> ${outPath}`);
}
