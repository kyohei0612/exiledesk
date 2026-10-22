/**
 * check-tree-base-cost.mjs — ツリーの始まりの箱の「ベースの値段の自動」(tree-base-cost.ts → start-cost.ts の式) を、字のとおりエンジンで打った N 人と並べる (解析君、2026-10-22)
 *
 *   node scripts/analysis/check-tree-base-cost.mjs [N=2000] [SEED=1]
 *
 * 見本と値段はシミュ部長の台本 scripts/_tree-base-cost-probe.test.ts と同じ (高貴建て、神 696.93。ベース 白 0.07 / 4 MOD 3 / 済み 30 神の仮)。
 * 字のとおりの打ち方 (式の説明の文のとおり):
 *   白から自作・増強の道: 白 (+ ルーン) → 完全の変成 → 狙いの側に狙いでない MOD があれば消去、無ければ完全の増強 (狙いが付くまで) → 王者 → 3 MOD まで高貴 → 骨 → フラクチャー。
 *     狙いが固定されたら消去 × 2、違えば白からやり直し。反対側の狙いがあれば、その後にカオス (無印) で付くまで
 *   白から自作・グレーターの道: 変成 → 上と同じループ (フラクチャーの側だけ見る) → グレーターエッセンス → 3 MOD まで高貴 → 骨 + その側のネクロマンシー → フラクチャー。違えばやり直し (固定の後に消さない)
 *   4 MOD を買ってフラクチャー: 狙い + 2 つ + 骨の壁のレア (オーナーの決め、壁の費用は数えない) にフラクチャー、違えば買い直し (ベース代 + フラクチャー)
 *   フラクチャー済みを買う: ベース代だけ。反対側の狙いは「固定 + 外れ 1 つのレア」にカオス (式 chaosAfterFix の形) で付くまで
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_tree-base-cost-entry.ts");
const N = Number(process.argv[2] ?? 2000);
const SEED = Number(process.argv[3] ?? 1);
const data = M.loadPatch();
const DIV = 696.93;
const PRICES = { divine: DIV, chaos: 71.892, "essence:greater:Boots_dex/Essence_FireResistance": 150, "essence:normal:Boots_dex/Essence_FireResistance": 30, white: 50, transmute_perfect: 40, augment_perfect: 60, annul: 316.796, regal: 1.387, exalt: 1, desecrate: 131.981, fracture: 8166.06, "rune:Kolr's Hunt": 838.48, "rune:Uhtred's Sidereus": 838.48 };
const price = (k) => PRICES[k] ?? 0;
const BASE = { white: 0.07, four: 3, fractured: 30 };
const IL = 82;

const ixOf = (id, tier) => data.mods.get(id).tiers.length - tier;
const all = (x) => [...x.prefixes, ...x.suffixes];
const sideOf = (id) => (data.mods.get(id).type === "suffix" ? "suffix" : "prefix");
const hit = (x, t) => all(x).some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex);

const SAMPLES = [
  { name: "靴 移動スピード T1 だけ", base: "Drakeskin Boots", frac: ["Boots_dex/MovementVelocity", 1] },
  { name: "靴 移動スピード T1 + 火耐性 T1", base: "Drakeskin Boots", frac: ["Boots_dex/MovementVelocity", 1], keep: ["Boots_dex/FireResistance", 1] },
  { name: "手袋 投射物スキル +2 (コルの狩り)", base: "Sirenscale Gloves", frac: ["Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level", 1] },
  { name: "靴 移動スピード T1 + エッセンスの火耐性 (グレーターの道)", base: "Drakeskin Boots", frac: ["Boots_dex/MovementVelocity", 1], ess: ["Boots_dex/Essence_FireResistance", 2] },
];

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const ci = (a) => { const m = mean(a); return 1.96 * Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length / a.length); };

for (const S of SAMPLES) {
  const ft = { modId: S.frac[0], minTierIndex: ixOf(...S.frac) };
  const kt = S.keep ? { modId: S.keep[0], minTierIndex: ixOf(...S.keep) } : null;
  const fs = sideOf(ft.modId);
  // 式 (シミュ部長の台本と同じ呼び方)
  const mods = [{ modId: S.frac[0], tier: S.frac[1], fractured: true }, ...(S.keep ? [{ modId: S.keep[0], tier: S.keep[1] }] : []), ...(S.ess ? [{ modId: S.ess[0], tier: S.ess[1] }] : [])];
  const doc = { ...M.newTree(S.base, IL), start: { rarity: "rare", mods } };
  const f = M.treeBaseCost(data, doc, BASE, price, (k) => k);
  const formula = Object.fromEntries(f.kinds.map((k) => [k.k, k.cost]));
  const runes = [...new Set([data.mods.get(ft.modId)?.rune].filter(Boolean).map((r) => M.runeEnForId(r)).filter(Boolean))];
  const runeCost = runes.reduce((a, r) => a + price(`rune:${r}`), 0);
  const rng = M.mulberry32(SEED);
  const seed = () => Math.floor(rng() * 2 ** 31);
  const use = (st, x, k, omens = []) => { const r = M.applyCurrency(data, x, k, rng, omens); st.c += price(k); st.n[k] = (st.n[k] ?? 0) + 1; for (const o of r.omensUsed ?? []) st.c += price(o); return r.applied ? r.item : x; };

  /** 反対側の狙いを「固定 + 外れ 1 つのレア」にカオスで付ける (式 chaosAfterFix の形)。from が無ければその形を作る */
  function chaosKeep(st, from) {
    let x = from;
    if (!x) {
      do { x = M.applyCurrency(data, M.startFrom(data, S.base, IL, { rarity: "rare", mods: [{ mod: ft.modId, tier: `T${S.frac[1]}`, fractured: true }] }, seed()), "exalt", rng).item; } while (hit(x, kt));
    }
    for (let i = 0; !hit(x, kt) && i < 200000; i++) x = use(st, x, "chaos");
    return x;
  }

  const res = {};
  const extra = {};
  // 白から自作
  {
    const costs = [];
    let tries = 0, fracOk = 0, chaosN = 0, stuck = 0, wallLeft = 0;
    for (let i = 0; i < N; i++) {
      const st = { c: 0, n: {} };
      for (;;) {
        tries++;
        st.c += BASE.white * DIV + runeCost;
        let x = M.startFrom(data, S.base, IL, { rarity: "normal", sockets: runes.length ? 2 : 0, runes }, seed());
        x = use(st, x, "transmute_perfect");
        for (let k = 0; k < 100000 && !hit(x, ft); k++) {
          if ((fs === "prefix" ? x.prefixes : x.suffixes).some((m) => !(m.modId === ft.modId && m.tierIndex >= ft.minTierIndex))) x = use(st, x, "annul");
          else x = use(st, x, "augment_perfect");
        }
        if (S.ess) {
          x = use(st, x, `essence:greater:${S.ess[0]}`);
          while (all(x).length < 3) x = use(st, x, "exalt");
          x = use(st, x, "desecrate", [fs === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy"]);
        } else {
          x = use(st, x, "regal");
          while (all(x).length < 3) x = use(st, x, "exalt");
          x = use(st, x, "desecrate");
        }
        x = use(st, x, "fracture");
        if (!all(x).some((m) => m.fractured && m.modId === ft.modId && m.tierIndex >= ft.minTierIndex)) continue;
        fracOk++;
        if (!S.ess) {
          x = use(st, x, "annul"); x = use(st, x, "annul");
          if (all(x).some((m) => m.unrevealed)) wallLeft++;
          if (kt) { const before = st.n.chaos ?? 0; x = chaosKeep(st, x); chaosN += (st.n.chaos ?? 0) - before; if (!hit(x, kt)) stuck++; }
        }
        break;
      }
      costs.push(st.c / DIV);
    }
    res.white = costs;
    extra.white = `フラクチャーの当たり ${(fracOk / tries).toFixed(3)}${kt ? `・カオス 1 人 ${(chaosN / N).toFixed(1)} 回・消去 2 回の後に壁が残った ${((100 * wallLeft) / N).toFixed(0)}%${stuck ? `・付かず ${stuck}` : ""}` : ""}`;
  }
  if (!S.ess) {
    // 4 MOD を買ってフラクチャー
    const costs = [];
    let tries = 0;
    for (let i = 0; i < N; i++) {
      const st = { c: 0, n: {} };
      for (;;) {
        tries++;
        st.c += BASE.four * DIV;
        let x = M.startFrom(data, S.base, IL, { rarity: "rare", mods: [{ mod: ft.modId, tier: `T${S.frac[1]}` }], sockets: runes.length ? 2 : 0, runes }, seed());
        // オーナーの決め (10-21・10-22): 4 MOD は壁つき (狙い + 2 つ + 骨の壁) で当たり 1/3、壁の費用は数えない
        for (let k = 0; all(x).length < 3 && k < 20; k++) x = M.applyCurrency(data, x, "exalt", rng).item;
        x = M.applyCurrency(data, x, "desecrate", rng).item;
        x = use(st, x, "fracture");
        if (all(x).some((m) => m.fractured && m.modId === ft.modId)) break;
      }
      if (kt) chaosKeep(st, null);
      costs.push(st.c / DIV);
    }
    res.four = costs;
    extra.four = `フラクチャーの当たり ${(N / tries).toFixed(3)} (狙い + 2 つ + 壁)`;
    // フラクチャー済みを買う
    const fc = [];
    for (let i = 0; i < N; i++) { const st = { c: BASE.fractured * DIV, n: {} }; if (kt) chaosKeep(st, null); fc.push(st.c / DIV); }
    res.fractured = fc;
  }
  console.log(`== ${S.name} (式の一番安い: ${f.best ? `${f.best.label} ${f.best.cost.toFixed(2)}` : "無し"})`);
  for (const k of ["fractured", "four", "white"]) {
    if (!res[k]) continue;
    const e = mean(res[k]), fv = formula[k];
    const d = fv != null ? ((fv - e) / e) * 100 : NaN;
    console.log(`  ${k.padEnd(9)} 式 ${fv?.toFixed(2) ?? "—"} 神 / エンジン ${e.toFixed(2)} ±${ci(res[k]).toFixed(2)} 神 (${N} 人) → ずれ ${d.toFixed(1)}% ${Math.abs(d) <= 10 ? "1 割以内" : "1 割を超える"}${extra[k] ? `  [${extra[k]}]` : ""}`);
  }
}
