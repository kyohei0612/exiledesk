/**
 * check-tree-patterns.mjs — シミュ部長が白紙から組んだツリー 13 本 (+ 直した版) を、tree-run (木のとおり) と「字のとおり」(説明文の打ち方を形 → 手の決まりにして
 * エンジンの入口 applyCurrency だけで打つ、ツリーのコードを使わない) で同じ人数・同じ種で並べる (解析君、2026-10-22)。
 * 結果は docs/org/math/notes/2026-10-22-tree-patterns-check.md
 *
 *   node scripts/analysis/check-tree-patterns.mjs [N=1000] [SEED=1] [名前,名前]
 *   DIR=<木の JSON の置き場> (既定は下の PAT_DIR)
 *
 * 共通: 狙い = 木の当たりの箱の札 (MOD と段、段は「その段以上」)。当たりの判定は MOD の id (系統では合わせない、tree-patterns の #3)。
 * 外れ = フラクチャーでも狙いでもない MOD (残す MOD = エッセンスで付けた物は外さない)。完成 = 狙いが全部付いている (木の完成の箱ではなく中身で見る、#4)。
 * 始めのアイテムは木と同じ startItemOf (始まりの形 + 乱数の MOD)。打ち止め 2,000 神・20,000 手 (tree-run の既定と同じ)。
 * 値段 = 本番の /boot.json の相場 (BOOT= の写し、既定 data-cache/boot/boot-2026-10-22.json = 2026-10-22T04:00Z) を画面と同じ enOf (キー → 英語名、骨は木のベースの部位で
 * 顎骨・肋骨・鎖骨) で引く。相場に無いキーは 0 にして名前を出す。OLD=1 で前のシミュ部長の EX 表 (7 品目、ほかは 0)
 */
import fs from "node:fs";
import path from "node:path";
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_tree-patterns-entry.ts");
const N = Number(process.argv[2] ?? 1000);
const SEED = Number(process.argv[3] ?? 1);
const ONLY = process.argv[4] ? new Set(process.argv[4].split(",")) : null;
const PAT_DIR = process.env.DIR ?? "C:/Users/kyohei/AppData/Roaming/Claude/side-session-notes/local_ba9fc825-1ab5-43f4-bb22-7d1f6e3bc4f6/tree-merge/patterns";
const data = M.loadPatch();
const EX = { chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.83 };
const BOOT = JSON.parse(fs.readFileSync(process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json", "utf8")).market;
const ROW = new Map(BOOT.items.map((x) => [x.Text, x.CurrentPrice]));
const DIV = process.env.OLD ? 696.929 : ROW.get("Divine Orb");
const missing = new Set();
/** 木ごとの値段 (神)。骨はベースの部位で決まるので、木のベースの白いアイテムで英語名を引く */
function priceFor(doc) {
  const item = M.freshItem(data, doc.base, doc.itemLevel ?? 82, "rare");
  const memo = new Map();
  return (k) => {
    if (memo.has(k)) return memo.get(k);
    let v;
    if (process.env.OLD) v = (EX[k] ?? 0) / DIV;
    else { const p = ROW.get(M.enOf(k, item)); if (!(typeof p === "number" && p > 0)) missing.add(`${k} (${M.enOf(k, item)})`); v = (typeof p === "number" && p > 0 ? p : 0) / DIV; }
    memo.set(k, v);
    return v;
  };
}
let price = () => 0;
const CAP_DIV = 2000, CAP_STEPS = 20000;

const all = (it) => [...it.prefixes, ...it.suffixes];
const tierNo = (m) => Number(/\d+/.exec(m.tierName ?? "")?.[0] ?? 99);
const isAimMod = (m, a) => m.modId === a.modId && tierNo(m) <= a.tier;
const held = (it, a) => all(it).some((m) => isAimMod(m, a));
const sideOf = (id) => (data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");

/**
 * パターンごとの「字のとおり」の決まり: s = { it, aims, n (今まで持った狙いの数), keep (残す MOD の id) } → 手 { cur, omens?, cat?, reveal? } か "restart"。
 * 外れ junk(side) = その側のフラクチャーでも狙いでも残す MOD でもない物
 */
const P = {
  // 右側の高貴 + 上級で 2 つ、外れは消去
  "ring-annul": (s) => (s.junk("suffix") ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] }),
  "gloves-rune-start": (s) => (s.junk("prefix") ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofSinistralExaltation"] }),
  // 木は 58068e9b で完全 → 上級の高貴に組み替えた (名前は前のまま)
  "gloves-perfect": (s) => (s.junk("suffix") ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] }),
  // カタリストは木と同じ (始め・キャストが付いた後 = life、クリ率が付いた後 = caster) を最大まで → 触媒 + 右側 + 完全の高貴、外れは消去
  "amulet-catalyst": (s) => (s.junk("suffix") ? { cur: "annul" } : { cur: "exalt_perfect", omens: ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], cat: s.heldIx(1) && !s.heldIx(0) ? "catalyst_caster" : "catalyst_life" }),
  // 3 耐性: サフィの外れ → 消去、ほかは右側の高貴 + 上級 (始めの 1 回は素の上級の高貴)
  "boots-3res-split": (s) => (s.steps === 0 ? { cur: "exalt_greater" } : s.junk("suffix") ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] }),
  // 4 つ (f1c0cbb2 で v5b に組み直した木、notes/2026-10-22-amulet-4aims.md): サフィ 2 つ = 右側の高貴 + 上級 (サフィの外れ 2 つ以上で、プレが空なら素の消去・あれば右側の消去)
  // → ES = 防御のカタリスト + 触媒 + 左側の高貴 + 上級 (プレの外れは左側の消去) → スピリット = 古代の骨 + 左側の死霊術で発現 (冒涜の外れは光 + 消去)
  "amulet-4aims-split": (s) => {
    // 狙いの並びは木によって違うので、側と MOD で引く
    const it = s.it, has = (id) => s.aims.some((a) => a.modId === id && held(it, a));
    const side = (sd) => s.aims.filter((a) => sideOf(a.modId) === sd && held(it, a)).length;
    const sa = side("suffix"), sj = s.junkN("suffix"), pa = side("prefix"), pj = s.junkN("prefix");
    if (sa < 2) return 3 - sa - sj < 2 - sa ? (pa + pj ? { cur: "annul", omens: ["OmenofDextralAnnulment"] } : { cur: "annul" }) : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] };
    if (s.desJunk()) return { cur: "annul", omens: ["OmenofLight"] };
    if (pj) return sa + sj ? { cur: "annul", omens: ["OmenofSinistralAnnulment"] } : { cur: "annul" };
    if (!has("Amulets/EnergyShield")) return { cur: "exalt_greater", omens: ["OmenofCatalysingExaltation", "OmenofSinistralExaltation"], cat: "catalyst_defences" };
    if (!all(it).some((m) => m.desecrated)) return { cur: "desecrate_ancient", omens: ["OmenofSinistralNecromancy"], reveal: true };
    return { cur: "exalt_greater", omens: ["OmenofSinistralExaltation"] };
  },
  // カオス当たるまで (どちらか) → 2 つで完成・0 ならカオスに戻る・サフィの外れ 2 つ以上は消去・ほかは右側の高貴 + 上級
  "amulet-spam-split": (s) => (s.count === 0 ? { cur: "chaos" } : s.junkN("suffix") >= 2 ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] }),
  // ✦レアリティ: 火・冷気をカオス当たるまで → 右側の高貴で残り (外れは消去) → 左側の高貴 + 上級でライフ (外れは消去 + 左側の消去のお告げ)
  "ring-join-done": (s) => {
    const fc = s.heldIx(0) && s.heldIx(1);
    if (!s.heldIx(0) && !s.heldIx(1)) return { cur: "chaos" };
    if (!fc) return s.junk("suffix") ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] };
    return s.junk("prefix") ? { cur: "annul", omens: ["OmenofSinistralAnnulment"] } : { cur: "exalt_greater", omens: ["OmenofSinistralExaltation"] };
  },
  // ✦移動 + ルーン: カオス → 狙い 1 つなら、足りない狙いの側に空きがあればその側の高貴 + 上級、空きが無ければカオス (2ee37d14 の木と同じく、届かない側の外れは見ない)、2 つで完成
  "boots-chaos-onspam": (s) => {
    if (s.count === 0) return { cur: "chaos" };
    const side = sideOf(s.missing()[0].modId);
    if ((side === "prefix" ? s.it.prefixes : s.it.suffixes).length >= 3) return { cur: "chaos" };
    return { cur: "exalt_greater", omens: [side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation"] };
  },
  // 完全のカオス + 右側の抹消 を当たるまで (木の上限 30 回は 1 本の手の区切りなので、字のとおりは当たるまで続ける)
  "gloves-whittle-spam": () => ({ cur: "chaos_perfect", omens: ["OmenofDextralErasure"] }),
  // 骨 + 右側の死霊術 → 発現で狙いを選ぶ。冒涜の外れは光 + 消去
  "helmet-desecrate": (s) => (s.desJunk() ? { cur: "annul", omens: ["OmenofLight"] } : { cur: "desecrate", omens: ["OmenofDextralNecromancy"], reveal: true }),
  // 左側の高貴 + 上級でライフ・ES% (外れは消去) → 古代の骨 → 発現でスピリット効率 (冒涜の外れは光 + 消去)
  "body-sinistral-desecrate": (s) => {
    if (s.desJunk()) return { cur: "annul", omens: ["OmenofLight"] };
    if (!(s.heldIx(0) && s.heldIx(1))) return s.junk("prefix") ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofSinistralExaltation"] };
    return { cur: "desecrate_ancient", reveal: true };
  },
  // パーフェクトエッセンス (ライフ%) で残す MOD → 右側の高貴 + 上級で冷気・雷、サフィの外れは右側の消去
  "body-essence": (s) => (!s.keepHeld() ? { cur: s.essKey } : s.junk("suffix") ? { cur: "annul", omens: ["OmenofDextralAnnulment"] } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] }),
};
P["body-essence-fixed"] = P["body-essence"];
P["body-essence-path"] = P["body-essence"];
/**
 * 対案 (ALT=1、木と比べて安くなるかを見るだけ): amulet-catalyst = キャストを狙う所はキャスターのカタリスト、クリ率を狙う所は触媒を使わない (クリ率のタグ critical のカタリストは無い)。
 */
// ALT=plain: body-essence-path の外れを素の消去で (エッセンスの MOD が消えたら打ち直す)。ALT=plain1: それに外れ 1 つを置く形
if (process.env.ALT === "plain") P["body-essence-path"] = (s) => (!s.keepHeld() ? { cur: s.essKey } : s.junk("suffix") ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] });
if (process.env.ALT === "plain1") P["body-essence-path"] = (s) => (!s.keepHeld() ? { cur: s.essKey } : 3 - s.count - s.junkN("suffix") < 2 - s.count ? { cur: "annul" } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] });
if (process.env.ALT === "1") {
  // body-essence-path: サフィは空き 3 つに狙い 2 つなので外れ 1 つは置いたまま、サフィが埋まって狙いが揃わない時だけ右側の消去
  P["body-essence-path"] = (s) => (!s.keepHeld() ? { cur: s.essKey } : 3 - s.count - s.junkN("suffix") < 2 - s.count ? { cur: "annul", omens: ["OmenofDextralAnnulment"] } : { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] });
  P["amulet-catalyst"] = (s) => (s.junk("suffix") ? { cur: "annul" } : s.heldIx(0) ? { cur: "exalt_perfect", omens: ["OmenofDextralExaltation"] } : { cur: "exalt_perfect", omens: ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], cat: "catalyst_caster" });
}
/** 木の真似 (MIMIC=1): 狙い 0 の形は始まりの箱と同じなので、外れが残っていても高貴。直前の高貴で外れが付いた時だけ消去を 1 回 (start → b2 → b4 → start) */
const mimic0 = (s, h) => (s.count === 0 ? (s.last?.cur.startsWith("exalt") && s.last.junkUp ? { cur: "annul" } : h) : null);
/** boots-chaos-onspam の木の真似: 狙い 1 つで側の高貴が外れたら、持っている狙いの組が変わるまでカオスを当たるまで (b8・b11 のカオススパム) */
if (process.env.MIMIC) {
  const base = P["boots-chaos-onspam"];
  P["boots-chaos-onspam"] = (s) => {
    const key = s.aims.map((a, k) => (s.heldIx(k) ? 1 : 0)).join("");
    if (s.mem.key !== key) { s.mem.key = key; s.mem.spam = false; }
    if (s.count === 1 && s.last?.cur === "exalt_greater" && s.last.junkUp) s.mem.spam = true;
    return s.count === 1 && s.mem.spam ? { cur: "chaos" } : base(s);
  };
}
if (process.env.MIMIC) for (const [nm, h] of [["ring-annul", { cur: "exalt_greater", omens: ["OmenofDextralExaltation"] }], ["gloves-rune-start", { cur: "exalt_greater", omens: ["OmenofSinistralExaltation"] }], ["body-sinistral-desecrate", { cur: "exalt_greater", omens: ["OmenofSinistralExaltation"] }], ["gloves-perfect", { cur: "exalt_perfect", omens: ["OmenofDextralExaltation"] }], ["amulet-catalyst", { cur: "exalt_perfect", omens: ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], cat: "catalyst_life" }]]) { const base = P[nm]; P[nm] = (s) => mimic0(s, h) ?? base(s); }

function aimsOfDoc(doc) {
  const out = [];
  for (const b of Object.values(doc.boxes)) if (b.out === "hit" && b.aim && !out.some((a) => a.modId === b.aim.modId)) out.push(b.aim);
  return out;
}

function literal(doc, rule, n, seed) {
  const aims = aimsOfDoc(doc);
  const essKey = Object.values(doc.boxes).map((b) => b.hand?.currency).find((c) => c?.startsWith("essence:"));
  const keepId = essKey ? `${essKey.split(":")[2]}` : null;
  const rng = M.mulberry32(seed);
  let tot = 0, fin = 0, capped = 0, stuck = 0, capDiv = 0;
  const U = {};
  const costs = [];
  for (let i = 0; i < n; i++) {
    let it = M.startItemOf(data, doc, rng).item;
    let c = 0, steps = 0, ok = false, last = null;
    const mem = {};
    const use = (k, x = 1) => { c += price(k) * x; U[k] = (U[k] ?? 0) + x; };
    for (;;) {
      if (aims.every((a) => held(it, a))) { ok = true; break; }
      if (c > CAP_DIV || steps > CAP_STEPS) { capped++; if (c > CAP_DIV) capDiv++; break; }
      const isKeep = (m) => keepId && m.modId === keepId;
      const junkMods = (side) => (side === "any" ? all(it) : side === "prefix" ? it.prefixes : it.suffixes).filter((m) => !m.fractured && !aims.some((a) => isAimMod(m, a)) && !isKeep(m));
      const s = {
        it, aims, steps, essKey, last, mem,
        count: aims.filter((a) => held(it, a)).length,
        heldIx: (k) => held(it, aims[k]),
        missing: () => aims.filter((a) => !held(it, a)),
        junk: (side) => junkMods(side).length > 0,
        junkN: (side) => junkMods(side).length,
        desJunk: () => all(it).some((m) => m.desecrated && !m.unrevealed && !aims.some((a) => isAimMod(m, a))),
        keepHeld: () => !keepId || all(it).some(isKeep),
      };
      const h = rule(s);
      steps++;
      if (h.cat) {
        for (let k = 0; k < 40 && !(it.qualityTag === h.cat.slice(9) && it.quality >= 20); k++) {
          const r = M.applyCurrency(data, it, h.cat, rng, [], { oneCatalyst: true });
          if (!r.applied) break;
          use(h.cat); it = r.item;
        }
      }
      const before = junkMods("any").length;
      const r = M.applyCurrency(data, it, h.cur, rng, h.omens ?? []);
      if (!r.applied) { stuck++; break; }
      use(h.cur);
      for (const o of r.omensUsed ?? []) use(o);
      it = r.item;
      last = { cur: h.cur, junkUp: junkMods("any").length > before };
      if (h.reveal && M.unrevealedOf(it)) {
        const sd = Math.floor(rng() * 2 ** 31);
        const offers = M.revealOffers(data, it, M.mulberry32(sd)).first;
        const k = Math.max(0, offers.findIndex((m) => aims.some((a) => m.modId === a.modId)));
        const x = M.applyCurrency(data, it, `reveal:${k + 1}`, M.mulberry32(sd));
        if (x.applied) it = x.item;
      }
    }
    tot += c;
    if (ok) { fin++; costs.push(c); }
  }
  costs.sort((a, b) => a - b);
  return { capDiv: capDiv / n, uses: Object.fromEntries(Object.entries(U).map(([k, v]) => [k, +(v / n).toFixed(2)])), perItem: fin ? tot / fin : NaN, fin: fin / n, capped: capped / n, stuck: stuck / n, med: costs[Math.floor(costs.length / 2)] ?? NaN };
}

/** 木のとおり (tree-run) + 完成の中身: 完成に数えた人のうち狙いが全部付いていた割合は tree-run の結果に無いので、ここでは perItem・完成・打ち止め・止まりだけ */
const files = fs.readdirSync(PAT_DIR).filter((f) => f.endsWith(".json")).sort();
/** SAMPLES=1: 見本の木 (tree-samples) も木だけ回す (字のとおりの決まりは無い)。始めの費用 (ベース代) は入れない */
const samples = process.env.SAMPLES ? M.TREE_SAMPLES.map((nm) => ({ pattern: `見本 ${nm}`, tree: M.treeSample(nm) })) : [];
const pct = (x) => `${(100 * x).toFixed(0)}%`;
console.log(`${N} 人・種 ${SEED}。1 個あたり (神) / 完成 / 打ち止め / 止まり`);
for (const f of [...files, ...samples]) {
  const j = typeof f === "string" ? JSON.parse(fs.readFileSync(path.join(PAT_DIR, f), "utf8")) : f;
  const name = j.pattern ?? f.replace(/\.json$/, "");
  if (ONLY && !ONLY.has(name)) continue;
  const doc = j.tree;
  price = priceFor(doc);
  // FIX=lost: 狙いが消えた・外れが消えた (lost・junkGone) の戻りが「始め」の所を「形の合う箱へ」に替えた木も回す (戻り先の違いだけで差が出るかを見る)
  if (process.env.FIX === "lost") for (const b of Object.values(doc.boxes)) if ((b.out === "lost" || b.out === "junkGone") && b.back === "start") b.back = "match";
  const t = M.runTree(data, doc, { n: N, seed: SEED, price });
  const rule = P[name];
  const l = rule ? literal(doc, rule, N, SEED) : null;
  const d = l && Number.isFinite(t.perItem) && Number.isFinite(l.perItem) ? ((t.perItem - l.perItem) / l.perItem) * 100 : NaN;
  console.log(`${name.padEnd(26)} 木 ${Number.isFinite(t.perItem) ? t.perItem.toFixed(2) : "—"} / ${pct(t.finished / N)} / ${pct(t.capped / N)} / ${pct(t.stuck / N)}`
    + `   字のとおり ${l ? `${Number.isFinite(l.perItem) ? l.perItem.toFixed(2) : "—"} / ${pct(l.fin)} / ${pct(l.capped)} / ${pct(l.stuck)}` : "(決まり無し)"}`
    + `   ずれ ${Number.isFinite(d) ? `${d.toFixed(1)}%${Math.abs(d) > 10 ? " ★" : ""}` : "—"}`);
  if (process.env.USES) console.log(`    木の 1 人 ${JSON.stringify(Object.fromEntries(Object.entries(t.uses).map(([k, v]) => [k, +v.toFixed(2)])))}
    字の 1 人 ${JSON.stringify(l?.uses)}  (字の打ち止めのうちお金の上限 ${pct(l?.capDiv ?? 0)})`);
}
if (missing.size) console.log(`相場に無く 0 にしたキー: ${[...missing].join("、")}`);
