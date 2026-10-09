#!/usr/bin/env node
/**
 * build-desecrated-weights.mjs — 冒涜専用 MOD どうしの重みの実測を表にする (2026-10-09)
 *
 * 元: Reddit r/PathOfExile2「I desecrated more than 500 rings — Part 2」(u/Civil-Bee-f、craftgaz.com の作者)。
 * 指輪・アイテムレベル 65 以上・保存された鎖骨で発現 563 回。表の「MLE draw weight (R_group-corrected)」= 能力値の冒涜 MOD が
 * まとめて出なくなる分を補正した、1 回引いた時の出やすさの推定 (%)。オーナーが表の画像を渡してくれた。
 * 実測があるのは指輪だけ。他の部位はざっくり推定 (2026-10-09 オーナー「これを参考に他の MOD の冒涜 MOD も決めれんかな、ざっくり」):
 *   指輪で「均等なら」の何倍出たか (比率 = 実測 % ÷ (100 / 指輪のその側の数)) を、同じ MOD (系統と文が同じ。無ければ系統が同じ) に当てる。
 *   指輪に無い MOD は比率 1 (平均)。部位・側ごとに合計を仮の値の合計にそろえる。
 *
 * 重みにする時は、側 (プレ / サフィ) の合計を今の仮の値 (1 個 2500) の合計と同じにする。骨がどちらの側に付くかは
 * その側の重みの合計で決めているので、そこを変えない (実測はその側の中の割合だけ)。
 *
 *   node scripts/build-desecrated-weights.mjs
 * 結果: src/services/htc/desecrated-weights.json (patch.ts の applyPoe2dbFixes が当てる)
 */
import { writeFileSync } from "node:fs";
import { bundleEntry } from "./_bundle-ts.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLACEHOLDER = 2500;

/** 表の値 (%)。キーはこちらの MOD の id */
const MEASURED = {
  Rings: {
    prefix: {
      "Rings/Desecrated_RemnantEffect": 19.4, // Increased Remnant Effect
      "Rings/Desecrated_IncreasedMinionDamageIfYouHitEnemy": 16.0, // Minion Damage (hit recently)
      "Rings/Desecrated_IncreasedSpellDamageOnFullEnergyShield": 14.9, // Spell Damage on Full ES
      "Rings/Desecrated_ElementalAilmentEffect_3": 14.0, // Shock Magnitude (Frenzy)
      "Rings/Desecrated_ElementalAilmentEffect_2": 13.6, // Freeze Buildup (Power)
      "Rings/Desecrated_AttackDamage": 12.4, // Attack Damage on Low Life
      "Rings/Desecrated_ElementalAilmentEffect": 9.8, // Ignite Magnitude (Endurance)
    },
    suffix: {
      "Rings/Desecrated_Strength_2": 11.8, // Strength + Dexterity
      "Rings/Desecrated_Dexterity": 10.3, // Dexterity + Intelligence
      "Rings/Desecrated_FireAndChaosDamageResistance": 8.4,
      "Rings/Desecrated_RemnantPickupRadius": 7.9, // Remnant Collection Range
      "Rings/Desecrated_SkillEffectDuration": 7.9,
      "Rings/Desecrated_LightningAndChaosDamageResistance": 7.2,
      "Rings/Desecrated_ColdAndChaosDamageResistance": 6.9,
      "Rings/Desecrated_RecoverPercentMaxLifeOnKill": 6.9,
      "Rings/Desecrated_Strength": 6.5, // Strength + Intelligence
      "Rings/Desecrated_ManaLeechAmount": 6.4,
      "Rings/Desecrated_LifeLeech": 6.2,
      "Rings/Desecrated_ManaGainedOnKillPercentage": 5.9,
      "Rings/Desecrated_IncreasedSpeed": 4.5, // Skill Speed
      "Rings/Desecrated_ExposureEffect": 1.9,
      "Rings/Desecrated_CooldownRecovery": 1.2,
    },
  },
};

const { loadPatchSync } = await bundleEntry("scripts/_audit-poe2db-entry.ts");
const data = loadPatchSync();
const textSig = (m) => (m.text ?? "").replace(/[#\d.+\-()%]/g, "").replace(/\s+/g, " ").trim();
const famSig = (m) => `${m.type}|${(m.families ?? [m.family]).join("+")}`;

// 実測の比率 (均等なら 1)
const byText = new Map();
const byFam = new Map();
for (const sides of Object.values(MEASURED)) {
  for (const table of Object.values(sides)) {
    const ids = Object.keys(table);
    const sum = ids.reduce((a, id) => a + table[id], 0);
    for (const id of ids) {
      const m = data.mods.get(id);
      if (!m) throw new Error(`${id} が無い`);
      const r = (table[id] / sum) * ids.length;
      byText.set(`${famSig(m)}|${textSig(m)}`, r);
      byFam.set(famSig(m), [...(byFam.get(famSig(m)) ?? []), r]);
    }
  }
}
const ratioOf = (m) => byText.get(`${famSig(m)}|${textSig(m)}`) ?? (byFam.get(famSig(m)) ? byFam.get(famSig(m)).reduce((a, x) => a + x, 0) / byFam.get(famSig(m)).length : null);

const weights = {};
let measured = 0;
let estimated = 0;
for (const [cls, b] of data.bases) {
  for (const k of ["prefixes", "suffixes"]) {
    // 1 段の冒涜専用 MOD だけ (キャノン・全能力値の鎧の置き場にある段の多い MOD は本物の重みを持っているので触らない)
    const mods = b.pools.desecrated[k].map((id) => data.mods.get(id)).filter((m) => m && m.tiers.length === 1 && m.tiers[0].weight > 0);
    if (!mods.length) continue;
    const exact = cls in MEASURED;
    const rs = mods.map((m) => (exact ? (MEASURED[cls][k === "prefixes" ? "prefix" : "suffix"][m.id] ?? null) : ratioOf(m)));
    if (rs.every((r) => r == null)) continue;
    const vals = rs.map((r) => r ?? (exact ? 100 / mods.length : 1));
    const sum = vals.reduce((a, x) => a + x, 0);
    mods.forEach((m, i) => {
      const w = Math.round((vals[i] / sum) * mods.length * PLACEHOLDER);
      weights[m.id] = Object.fromEntries(m.tiers.map((t) => [t.ilvl, w]));
      if (exact) measured++; else if (rs[i] != null) estimated++;
    });
  }
}
console.log(`実測 ${measured} / 指輪から推定 ${estimated} (同じ側の他の MOD は比率 1)`);
writeFileSync(resolve(ROOT, "src/services/htc/desecrated-weights.json"), JSON.stringify({
  generated: new Date().toISOString(),
  source: "Reddit r/PathOfExile2 'I desecrated more than 500 rings — Part 2' (u/Civil-Bee-f): MLE draw weight (group-corrected), rings ilvl 65+, 563 reveals. Other bases: the ring ratio applied to the same mod (text, else family), others ratio 1. Side totals kept at the 2500 placeholder × count. scripts/build-desecrated-weights.mjs",
  weights,
}, null, 1));
console.log(`${Object.keys(weights).length} MOD → src/services/htc/desecrated-weights.json`);
