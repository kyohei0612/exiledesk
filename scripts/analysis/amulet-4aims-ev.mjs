/**
 * amulet-4aims-ev.mjs — パターン amulet-4aims-split (ステラーアミュレット、✦スペルダメージ T1、狙い ES T3・スピリット T2 (プレ)・スペルスキルのレベル T3・キャスト T3 (サフィ))
 * を安く揃える打ち方を、形 → 手の決まり (方策) で何通りかエンジンの入口だけで回して比べる (解析君、2026-10-22、シミュ部長 10 本目の頼み)。
 * 結果は docs/org/math/notes/2026-10-22-amulet-4aims.md。一番安いのは v5b (サフィ先 → プレの ES は防御のカタリスト + 触媒 → スピリットは古代の骨)。
 *
 *   node scripts/analysis/amulet-4aims-ev.mjs [N=500] [SEED=1] [方策,…]
 *
 * 値段 = check-tree-patterns と同じ /boot.json の写し (画面と同じ enOf、骨はベースの部位)。打ち止め 2,000 神・20,000 手。始めは木と同じ startItemOf
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";
const M = await bundleEntry("scripts/analysis/_tree-patterns-entry.ts");
const data = M.loadPatch();
const N = Number(process.argv[2] ?? 500), SEED = Number(process.argv[3] ?? 1);
const ONLY = process.argv[4]?.split(",");
const PAT_DIR = process.env.DIR ?? "C:/Users/kyohei/AppData/Roaming/Claude/side-session-notes/local_ba9fc825-1ab5-43f4-bb22-7d1f6e3bc4f6/tree-merge/patterns";
const doc = JSON.parse(fs.readFileSync(`${PAT_DIR}/amulet-4aims-split.json`, "utf8")).tree;
const ROW = new Map(JSON.parse(fs.readFileSync(`${process.env.BOOT ?? "data-cache/boot/boot-2026-10-22.json"}`, "utf8")).market.items.map((x) => [x.Text, x.CurrentPrice]));
const DIV = ROW.get("Divine Orb");
const item0 = M.freshItem(data, doc.base, 82, "rare");
const price = (k) => (ROW.get(M.enOf(k, item0)) ?? 0) / DIV;
const AIMS = [{ modId: "Amulets/EnergyShield", tier: 3 }, { modId: "Amulets/BaseSpirit", tier: 2 }, { modId: "Amulets/GlobalIncreaseSpellSkillGemLevel", tier: 3 }, { modId: "Amulets/IncreasedCastSpeed", tier: 3 }];
const tierNo = (m) => Number(/\d+/.exec(m.tierName ?? "")?.[0] ?? 99);
const isAim = (m) => AIMS.some((a) => m.modId === a.modId && tierNo(m) <= a.tier);
const st = (it) => {
  const fp = it.prefixes.filter((m) => !m.fractured), fs_ = it.suffixes;
  const dj = (arr) => arr.filter((m) => m.desecrated && !m.unrevealed && !isAim(m)).length;
  return { esHeld: hasES(it), des: [...it.prefixes, ...it.suffixes].some((m) => m.desecrated), dpj: dj(fp), dsj: dj(fs_), pa: fp.filter(isAim).length, pj: fp.filter((m) => !isAim(m)).length, sa: fs_.filter(isAim).length, sj: fs_.filter((m) => !isAim(m)).length };
};
const EL = (cur = "exalt_greater") => ({ cur, omens: ["OmenofSinistralExaltation"] });
const ER = (cur = "exalt_greater") => ({ cur, omens: ["OmenofDextralExaltation"] });
const LT = { cur: "annul", omens: ["OmenofLight"] };
const DL = (bone = "desecrate") => ({ cur: bone, omens: ["OmenofSinistralNecromancy"], reveal: true }), DR = (bone = "desecrate") => ({ cur: bone, omens: ["OmenofDextralNecromancy"], reveal: true });
const AN = { cur: "annul" }, AL = { cur: "annul", omens: ["OmenofSinistralAnnulment"] }, AR = { cur: "annul", omens: ["OmenofDextralAnnulment"] };
/** 方策: 形 → 手 */
const CAT = (cat, side, cur = "exalt_greater") => ({ cur, omens: ["OmenofCatalysingExaltation", side === "L" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation"], cat });
const hasES = (it) => it.prefixes.some((m) => m.modId === "Amulets/EnergyShield" && tierNo(m) <= 3);
const preStage = (s) => (s.dpj ? LT : s.pj ? (s.sa + s.sj ? AL : AN) : !s.esHeld ? CAT("catalyst_defences", "L") : !s.des ? DL("desecrate_ancient") : EL());
const sufStage = (s, h) => (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : h);
const preStage2 = (s, o) => (s.dpj ? LT : s.pj ? (s.sa + s.sj ? AL : AN) : o.spiritFirst ? (!s.des ? DL(o.bone) : !s.esHeld ? (o.cat ? CAT("catalyst_defences", "L") : EL()) : EL()) : (!s.esHeld ? (o.cat ? CAT("catalyst_defences", "L") : EL()) : !s.des ? DL(o.bone) : EL()));
const POL = {
  v5c: (s) => (s.sa < 2 ? sufStage(s, ER()) : preStage2(s, { bone: "desecrate", cat: true })),
  v5d: (s) => (s.sa < 2 ? sufStage(s, ER()) : preStage2(s, { bone: "desecrate_ancient", cat: true, spiritFirst: true })),
  v5e: (s) => (s.sa < 2 ? sufStage(s, ER()) : preStage2(s, { bone: "desecrate_ancient", cat: false })),
  v5f: (s) => (s.sa < 2 ? sufStage(s, ER()) : preStage2(s, { bone: "desecrate", cat: true, spiritFirst: true })),
  // プレ先 (ES = 防御 + 触媒、スピリット = 古代の骨) → サフィ (キャスター + 触媒 / 素の右側)
  v4a: (s) => (s.pa < 2 ? preStage(s) : sufStage(s, CAT("catalyst_caster", "R"))),
  v4b: (s) => (s.pa < 2 ? preStage(s) : sufStage(s, ER())),
  // サフィ先 (キャスター / 素) → プレ (ES = 防御 + 触媒、スピリット = 古代の骨)
  v5a: (s) => (s.sa < 2 ? sufStage(s, CAT("catalyst_caster", "R")) : preStage(s)),
  v5b: (s) => (s.sa < 2 ? sufStage(s, ER()) : preStage(s)),
  // 骨 1 回 (古代) + プレの ES は防御のカタリスト + 触媒
  v1: (s) => (s.sa < 2 ? (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : ER()) : s.dpj ? LT : s.pj ? AL : s.des ? (s.esHeld ? EL() : CAT("catalyst_defences", "L")) : DL("desecrate_ancient")),
  v2: (s) => (s.sa < 2 ? (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : CAT("catalyst_caster", "R")) : s.dpj ? LT : s.pj ? AL : s.des ? (s.esHeld ? EL() : CAT("catalyst_defences", "L")) : DL("desecrate_ancient")),
  v3: (s) => (s.sa < 2 ? (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : CAT("catalyst_speed", "R")) : s.dpj ? LT : s.pj ? AL : s.des ? (s.esHeld ? EL() : CAT("catalyst_defences", "L")) : DL("desecrate_ancient")),
  // サフィ先 (プレが空なので外れは素の消去) → プレは骨 + 左側の死霊術で発現 (狙いを選ぶ)、冒涜の外れは光 + 消去、普通の外れは左側の消去
  sufFirstDes: (s) => (s.sa < 2 ? (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : ER()) : s.dpj ? LT : s.pj ? AL : s.des ? EL() : DL()),
  sufFirstDesAnc: (s) => (s.sa < 2 ? (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : ER()) : s.dpj ? LT : s.pj ? AL : s.des ? EL() : DL("desecrate_ancient")),
  // 両側とも骨: サフィから骨 + 右側の死霊術 (冒涜の外れは光 + 消去)、プレも骨 + 左側の死霊術
  desBoth: (s) => (s.dsj + s.dpj ? LT : s.sa < 2 ? (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : s.des ? ER() : DR()) : s.pj ? AL : s.des ? EL() : DL()),
  // プレ先を骨で (サフィが空のうち。冒涜の外れは光 + 消去) → サフィは右側の高貴 (外れ 2 つで右側の消去)
  preDesSufEx: (s) => (s.dpj + s.dsj ? LT : s.pa < 2 ? (s.pj ? (s.sa + s.sj ? AL : AN) : s.des ? EL() : DL()) : (3 - s.sa - s.sj < 2 - s.sa ? AR : ER())),
  // 今の木: 外れがあれば消去、ほかは上級の高貴 (お告げ無し)
  tree: (s) => (s.pj + s.sj ? AN : { cur: "exalt_greater" }),
  // プレ先: プレ 2 つまで左側の高貴 (外れは、サフィが空なら素の消去、あれば左側の消去) → サフィは右側の高貴、外れ 2 つで右側の消去
  preFirst: (s) => (s.pa < 2 ? (s.pj ? (s.sa + s.sj ? AL : AN) : EL()) : (3 - s.sa - s.sj < 2 - s.sa ? AR : ER())),
  // 上と同じでサフィの外れを素の消去で (プレの狙いも消える賭け)
  preFirstPlain: (s) => (s.pa < 2 ? (s.pj ? (s.sa + s.sj ? AL : AN) : EL()) : (3 - s.sa - s.sj < 2 - s.sa ? AN : ER())),
  // サフィ先: サフィ 2 つまで右側の高貴 (外れ 2 つでプレが空なら素の消去、あれば右側の消去) → プレは左側の高貴、外れは左側の消去
  sufFirst: (s) => (s.sa < 2 ? (3 - s.sa - s.sj < 2 - s.sa ? (s.pa + s.pj ? AR : AN) : ER()) : (s.pj ? AL : EL())),
  // プレ先で、サフィ段階の外れが 2 つになったら、サフィの狙いが 0 なら素の消去で全部消すまで (右側の消去は狙いがある時だけ)
  preFirstMix: (s) => (s.pa < 2 ? (s.pj ? (s.sa + s.sj ? AL : AN) : EL()) : (3 - s.sa - s.sj < 2 - s.sa ? (s.sa ? AR : AR) : ER())),
  // プレ先、素の高貴 (段の下限が低いので外れが増えるか見る)
  preFirstBase: (s) => (s.pa < 2 ? (s.pj ? (s.sa + s.sj ? AL : AN) : EL("exalt")) : (3 - s.sa - s.sj < 2 - s.sa ? AR : ER("exalt"))),
  // プレ先、完全の高貴
  preFirstPerfect: (s) => (s.pa < 2 ? (s.pj ? (s.sa + s.sj ? AL : AN) : EL("exalt_perfect")) : (3 - s.sa - s.sj < 2 - s.sa ? AR : ER("exalt_perfect"))),
};
for (const [name, pol] of Object.entries(POL)) {
  if (ONLY && !ONLY.includes(name)) continue;
  const rng = M.mulberry32(SEED);
  let tot = 0, fin = 0, capped = 0, stuck = 0;
  const U = {};
  for (let i = 0; i < N; i++) {
    let it = M.startItemOf(data, doc, rng).item, c = 0, steps = 0;
    for (;;) {
      const s = st(it);
      if (s.pa === 2 && s.sa === 2) { fin++; break; }
      if (c > 2000 || ++steps > 20000) { capped++; break; }
      const h = pol(s);
      if (h.cat) {
        for (let k = 0; k < 40 && !(it.qualityTag === h.cat.slice(9) && it.quality >= 20); k++) {
          const q = M.applyCurrency(data, it, h.cat, rng, [], { oneCatalyst: true });
          if (!q.applied) break;
          c += price(h.cat); U[h.cat] = (U[h.cat] ?? 0) + 1; it = q.item;
        }
      }
      const r = M.applyCurrency(data, it, h.cur, rng, h.omens ?? []);
      if (!r.applied) { stuck++; break; }
      c += price(h.cur); U[h.cur] = (U[h.cur] ?? 0) + 1;
      for (const o of r.omensUsed ?? []) { c += price(o); U[o] = (U[o] ?? 0) + 1; }
      it = r.item;
      if (h.reveal && M.unrevealedOf(it)) {
        const sd = Math.floor(rng() * 2 ** 31);
        const offers = M.revealOffers(data, it, M.mulberry32(sd)).first;
        const k = Math.max(0, offers.findIndex(isAim));
        const x = M.applyCurrency(data, it, `reveal:${k + 1}`, M.mulberry32(sd));
        if (x.applied) it = x.item;
      }
    }
    tot += c;
  }
  console.log(`${name.padEnd(16)} 1 個 ${(tot / Math.max(1, fin)).toFixed(1)} 神  完成 ${((100 * fin) / N).toFixed(0)}%  打ち止め ${capped}  止まり ${stuck}  1 人 ${Object.entries(U).map(([k, v]) => `${k} ${(v / N).toFixed(1)}`).join(" ")}`);
}
