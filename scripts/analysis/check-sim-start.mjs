/**
 * check-sim-start.mjs — ③ の「白から作る」1 個 (フラクチャー済みまで) の式 (use-sim-calc の calc) を、字のとおりの打ち方 (applyCurrency) で 1 人ずつ N 人回した結果と並べる (解析君)
 *
 *   node scripts/analysis/check-sim-start.mjs [N=1000]
 *
 * 式 (2026-10-20 S1c の直しの後、use-sim-calc の lines を同じ部品で組み直した物):
 *   1 回分 = 白 + ルーン + 完全の変成 × lc.変成 + 完全の増強 × lc.増強 + 消去 × lc.消去 + 王者 + 高貴 × (1 − p) + 骨 + フラクチャー
 *   1 個 = 1 回分 ÷ フラクチャーの当たり (fractureOdds) + 消去 × 2
 *   lc = 候補 1 つは入口の spamCounts (増強の道、300 人、種 20261020。増強・消去は着いた割合で割る)、2 つ以上は magicLoopCounts(p, null, 側の割合)
 * エンジン (字のとおり、route-race / spamCounts の増強の道と同じ決まり):
 *   白 (ルーンを差す) → 完全の変成 → 狙いが付くまで [狙いの側に狙いでない MOD があれば消去、無ければ完全の増強] →
 *   王者 → 3 MOD 未満なら高貴 → 骨 (保存) → フラクチャー → 固定が狙いなら 消去 × 2 で終わり、違えば白からやり直し
 * 前の版 (11cbb873) の「(増強 + 消去 × 2) × 1 ÷ p」と、その字のとおりの打ち方の行も残す (S1c の前の数字)。
 * 見本は check-auto-order.mjs と同じ手袋・靴。値段は下の固定値 (式とエンジンで同じ値段なので、ずれは確率と手順の違いだけ)
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_sim-start-entry.ts");
const N = Number(process.argv[2] ?? 1000);
const data = M.loadPatch();
const PRICES = { white: 50, transmute_perfect: 40, augment_perfect: 60, annul: 316.796, regal: 1.387, exalt: 1, desecrate: 131.981, fracture: 8166.06, "rune:Kolr's Hunt": 838.48, "rune:Uhtred's Sidereus": 838.48 };
const price = (k) => PRICES[k] ?? 0;
const top = (id) => data.mods.get(id).tiers.length - 1;
const sideOf = (id) => (data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");

function gloves() {
  const ID = (s) => `Gloves_int/${s}`;
  const MN = ID("IncreasedMana");
  return { name: "手袋 (マナ T1)", base: "Intricate Gloves", frac: [{ modId: MN, minTierIndex: top(MN) }] };
}
function boots() {
  const MS = "Boots_str/Rune_chronomancy_MovementVelocity";
  return { name: "靴 (移動速度 T3 以上)", base: "Vaal Greaves", frac: [{ modId: MS, minTierIndex: 2 }] };
}
const hits = (m, ts) => ts.some((t) => t.modId === m.modId && m.tierIndex >= t.minTierIndex);
const all = (x) => [...x.prefixes, ...x.suffixes];

for (const S of [gloves(), boots()]) {
  const IL = 82;
  const runes = [...new Set(S.frac.map((t) => data.mods.get(t.modId)?.rune).filter(Boolean).map((r) => M.runeEnForId(r)).filter(Boolean))];
  const white = M.startFrom(data, S.base, IL, { rarity: "normal", sockets: 2, runes }, 1);
  const runeCost = runes.reduce((a, r) => a + price(`rune:${r}`), 0);
  // 式
  const blank = M.blankWith(data, white, IL, "magic", S.frac);
  const odds = M.magicAugOdds(data, blank, "augment_perfect");
  const fs = sideOf(S.frac[0].modId);
  const p = Math.min(1, S.frac.reduce((a, r) => a + odds.hit(sideOf(r.modId), [r]), 0));
  const fracP = M.fractureOdds(data, blank, S.frac);
  const once = price("white") + runeCost + price("transmute_perfect") + (price("augment_perfect") + 2 * price("annul")) / p + price("regal") + price("exalt") * (1 - p) + price("desecrate") + price("fracture");
  const total = once / fracP + 2 * price("annul");
  // S1c の後の式
  const sc = S.frac.length === 1 ? M.spamCounts(data, { ...blank, rarity: "normal" }, "augment", "perfect", [S.frac[0]], { seed: 20261020 }) : null;
  const lcN = sc && !sc.off && sc.hitRate > 0
    ? { transmute: sc.uses.transmute_perfect ?? 1, augment: (sc.uses.augment_perfect ?? 0) / sc.hitRate, annul: (sc.uses.annul ?? 0) / sc.hitRate }
    : { transmute: 1, ...M.magicLoopCounts(p, null, odds.share[fs]) };
  const onceN = price("white") + runeCost + price("transmute_perfect") * lcN.transmute + price("augment_perfect") * lcN.augment + price("annul") * lcN.annul + price("regal") + price("exalt") * (1 - p) + price("desecrate") + price("fracture");
  const totalN = onceN / fracP + 2 * price("annul");
  // エンジン
  const rng = M.mulberry32(20261020);
  const use = (st, x, k) => { st.c += price(k); const r = M.applyCurrency(data, x, k, rng); st.n[k] = (st.n[k] ?? 0) + 1; return r.item; };
  let tot = 0, augs = 0, tries = 0, hitAug = 0, onSide = 0;
  const cnt = {};
  for (let i = 0; i < N; i++) {
    const st = { c: 0, n: cnt };
    for (;;) {
      tries++;
      st.c += price("white") + runeCost;
      let x = use(st, white, "transmute_perfect");
      while (!all(x).some((m) => hits(m, S.frac))) {
        for (let k = 0; k < 2; k++) x = all(x).length ? use(st, x, "annul") : (st.c += price("annul"), x);
        x = use(st, x, "augment_perfect");
        augs++;
        const a = all(x)[0];
        if (a && a.side === fs) { onSide++; if (hits(a, S.frac)) hitAug++; }
      }
      x = use(st, x, "regal");
      while (all(x).length < 3) x = use(st, x, "exalt");
      x = use(st, x, "desecrate");
      x = use(st, x, "fracture");
      if (all(x).some((m) => m.fractured && hits(m, S.frac))) { st.c += 2 * price("annul"); break; }
    }
    tot += st.c;
  }
  const eng = tot / N;
  // 字のとおり (S1c の後の打ち方 = スパムシミュの増強の道)
  let totN = 0, augN = 0, annN = 0, traN = 0, triesN = 0;
  for (let i = 0; i < N; i++) {
    const st = { c: 0, n: cnt };
    for (;;) {
      triesN++;
      st.c += price("white") + runeCost;
      let x = use(st, white, "transmute_perfect"); traN++;
      for (let k = 0; k < 100000 && !all(x).some((m) => hits(m, S.frac)); k++) {
        if ((fs === "prefix" ? x.prefixes : x.suffixes).some((m) => !hits(m, S.frac))) { x = use(st, x, "annul"); annN++; }
        else { x = use(st, x, "augment_perfect"); augN++; }
      }
      x = use(st, x, "regal");
      while (all(x).length < 3) x = use(st, x, "exalt");
      x = use(st, x, "desecrate");
      x = use(st, x, "fracture");
      if (all(x).some((m) => m.fractured && hits(m, S.frac))) { st.c += 2 * price("annul"); break; }
    }
    totN += st.c;
  }
  const engN = totN / N;
  // magicLoopCounts の打ち方 (変成の後から狙いが付くまで)
  const lc = M.magicLoopCounts(p, null, odds.share[fs]);
  let la = 0, ln = 0;
  for (let i = 0; i < N; i++) {
    let x = M.applyCurrency(data, white, "transmute_perfect", rng).item;
    for (let step = 0; step < 100000 && !all(x).some((m) => hits(m, S.frac)); step++) {
      if (all(x).some((m) => m.side === fs)) { x = M.applyCurrency(data, x, "annul", rng).item; ln++; }
      else { x = M.applyCurrency(data, x, "augment_perfect", rng).item; la++; }
    }
  }
  const pct = (a, b) => `${(((a - b) / b) * 100).toFixed(1)}%`;
  console.log(`== ${S.name}`);
  console.log(`  増強 1 回の当たり: 式 p ${p.toFixed(4)} (候補の側の中)・候補の側に付く割合 ${odds.share[fs].toFixed(4)} → 空のマジックで当たる割合 ${(p * odds.share[fs]).toFixed(4)} / エンジン ${(hitAug / augs).toFixed(4)} (${hitAug}/${augs})・候補の側の中 ${(hitAug / onSide).toFixed(4)}`);
  console.log(`  リロールの回数 (1 回分あたり): 式 ${(1 / p).toFixed(2)} / エンジン ${(augs / tries).toFixed(2)}`);
  console.log(`  magicLoopCounts の打ち方 (変成の後、1 本あたり): 増強 式 ${lc.augment.toFixed(2)} / エンジン ${(la / N).toFixed(2)}・消去 式 ${lc.annul.toFixed(2)} / エンジン ${(ln / N).toFixed(2)}`);
  console.log(`  フラクチャーの当たり: 式 ${fracP.toFixed(4)} / エンジン ${(N / tries).toFixed(4)} (${N}/${tries})`);
  console.log(`  [前の式 11cbb873] 1 個 (高貴建て): 式 ${total.toFixed(0)} / 字のとおり (消去 × 2 → 増強) ${eng.toFixed(0)} → ずれ ${pct(total, eng)}`);
  console.log(`  [S1c の後] 1 回分のループ: 変成 式 ${lcN.transmute.toFixed(2)} / エンジン ${(traN / triesN).toFixed(2)}・増強 ${lcN.augment.toFixed(2)} / ${(augN / triesN).toFixed(2)}・消去 ${lcN.annul.toFixed(2)} / ${(annN / triesN).toFixed(2)}${sc ? "  (spamCounts 着いた割合 " + sc.hitRate.toFixed(3) + ")" : ""}`);
  console.log(`  [S1c の後] フラクチャーの当たり 式 ${fracP.toFixed(4)} / エンジン ${(N / triesN).toFixed(4)}`);
  console.log(`  [S1c の後] 1 個 (高貴建て): 式 ${totalN.toFixed(0)} / エンジン ${engN.toFixed(0)} (${N} 人) → ずれ (式 − エンジン) ${pct(totalN, engN)} → 1 割以内: ${Math.abs(totalN - engN) <= 0.1 * engN ? "はい" : "いいえ"}`);
}
