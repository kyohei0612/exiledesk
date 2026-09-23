/**
 * prefix-exalt.ts — サフィが揃った後、プレの普通の狙いを高貴で足す (2026-09-23)
 *
 * [[prefix-finish.ts]] の前段。プレに普通の狙いが 2 つ以上ある指輪 (最大ライフ + 最大マナ など) で、
 * 最後の 1 つを冒涜に残し、**それ以外を左側の高貴 (カタリストあり / なし) で足す**。
 *
 * - 外れは**左側の消去のお告げ**で消す。サフィは揃っているので、素の消去だとサフィの狙いを消しうる
 *   (オーナー:「サフィ失敗したらそのたびに右側消去で…」の左右逆)
 * - 左側の消去が当たるのは、プレの外せる MOD (足した狙い / 外れ / ブリーチの MOD) から一様に 1 つ
 * - 品質 40% はプレにブリーチの MOD が居る (枠を 1 つ使う)。消去で消えたら**付け直さない**:
 *   付け直しの結晶化が足した狙いを食いうるので、以後のカタリストは品質 20% まで (上限が 20% に戻る)
 * - 冒涜で引く狙いと同じ系統が高貴で付いても外れとして数える (控えめ側)
 */
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import { catalysingMultiplier, catalystCountFor, catalystPriceKey } from "./catalysing";
import { CATALYSTS, catalystsFor } from "./quality";
import { mulberry32, type MissPlan, type PathStep } from "./spam-total";

export interface PrefixExaltStep {
  have: string[];
  junk: number;
  /** ブリーチの MOD が消えている */
  breachGone: boolean;
  action: string;
  perTry: number;
}

export interface PrefixExaltPhase {
  /** 高貴で足すプレの狙い */
  modIds: string[];
  expected: number;
  steps: PrefixExaltStep[];
  /** 外れ無しで進んだ時の 1 手ずつ (画面の「1 手ずつ」) */
  path: PathStep[];
  /** 回した 1 回ずつの費用 (並べ替えていない。仕上げと足すため) */
  samples: number[];
}

export interface PrefixExaltInput {
  data: PatchData;
  cls: ItemBase;
  targets: readonly TierTarget[];
  prices: Prices;
  itemLevel: number;
  /** カタリストで上げる品質 (%)。ブリーチの MOD が消えたら 20% まで */
  quality: number;
  breach: boolean;
  /** プレの空き (固定済み・樹 MOD を引いた数) */
  cap: number;
  /** カタリストの使う / 使わない (tag → bool)。無ければ既定 (1 個 0.2 神未満だけ使う) */
  catalystChoice?: Readonly<Record<string, boolean>>;
  pricey: number;
  runs?: number;
}

const EXALT: ReadonlyArray<[string, number, string]> = [
  ["exalt", 0, "高貴なオーブ"], ["exalt_greater", 35, "高貴なオーブ (上級)"], ["exalt_perfect", 50, "高貴なオーブ (完全)"],
];
const BASE_QUALITY = 20;

export function prefixExaltPhase(inp: PrefixExaltInput): PrefixExaltPhase | { reason: string } {
  const { data, cls, prices, itemLevel } = inp;
  const cur = (k: string): number => prices.currency[k] ?? prices.omens[k] ?? Infinity;
  const divine = prices.currency.divine ?? 1;
  const mod = (id: string): Mod | undefined => data.mods.get(id);
  const ids = inp.targets.map((t) => t.modId);
  const minTier = new Map(inp.targets.map((t) => [t.modId, t.minTierIndex ?? 0]));
  const n = ids.length;
  if (n === 0) return { modIds: [], expected: 0, steps: [], path: [], samples: [] };
  if (n > 3) return { reason: `高貴で足すプレが ${n} つ (3 つまでしか数えていません)` };
  const B = inp.breach ? 1 : 0;
  if (n + B + 0 > inp.cap) return { reason: "プレの枠が足りません (ブリーチの MOD を含めて)" };

  const sw = (m: Mod, minIdx: number, floor: number): number =>
    m.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= itemLevel && t.ilvl >= floor ? t.weight : 0), 0);
  const tagsEnabled = [...new Set(ids.flatMap((id) => catalystsFor(mod(id)!).map((c) => c.tag)))]
    .filter((tag) => inp.catalystChoice?.[tag] ?? cur(catalystPriceKey(tag)) / divine < inp.pricey);
  interface Act { kind: "exalt" | "annul"; label: string; cost: (bq: number) => number; floor: number; tag: string | null; q: (bq: number) => number }
  const acts: Act[] = [];
  for (const [k, floor, ja] of EXALT) {
    for (const tag of [null, ...tagsEnabled]) {
      const cja = tag ? CATALYSTS.find((c) => c.tag === tag)?.ja ?? tag : "";
      const q = (bq: number): number => (tag ? (inp.breach && bq ? inp.quality : Math.min(inp.quality, BASE_QUALITY)) : 0);
      acts.push({
        kind: "exalt", floor, tag, q,
        label: `${ja} + 左側の高貴なお告げ${tag ? ` + 触媒の高貴のお告げ + ${cja}` : ""}`,
        cost: (bq) => cur(k) + cur("OmenofSinistralExaltation") + (tag ? cur("OmenofCatalysingExaltation") + catalystCountFor(q(bq)) * cur(catalystPriceKey(tag)) : 0),
      });
    }
  }
  const annul: Act = { kind: "annul", label: "消去のオーブ + 左側の消去のお告げ", floor: 0, tag: null, q: () => 0, cost: () => cur("annul") + cur("OmenofSinistralErasure") };
  // 費用はブリーチの有無だけで決まるので先に出しておく (反復のたびに相場を引くと、狙い 4 つで数秒かかった)
  for (const e of [...acts, annul]) { const c0 = e.cost(0), c1 = e.cost(1); e.cost = (bq) => (bq ? c1 : c0); }

  const famW = (id: string, floor: number, tag: string | null, mult: number): number => {
    const m = mod(id); if (!m) return 0;
    return sw(m, 0, floor) * (tag && catalystsFor(m).some((c) => c.tag === tag) ? mult : 1);
  };
  // 手・付いた狙い・ブリーチの有無だけで決まるので覚えておく (狙い 4 つで数十秒かかっていた)
  const memo = new Map<Act, Map<number, number[]>>();
  const outcomes = (e: Act, held: number, bq: number): number[] => {
    let byH = memo.get(e); if (!byH) memo.set(e, byH = new Map());
    const k = held * 2 + bq;
    const got = byH.get(k); if (got) return got;
    const ps = outcomesRaw(e, held, bq);
    byH.set(k, ps);
    return ps;
  };
  const outcomesRaw = (e: Act, held: number, bq: number): number[] => {
    const mult = catalysingMultiplier(e.q(bq));
    const occ = new Set(ids.filter((_, i) => held & (1 << i)));
    const W = cls.pools.normal.prefixes.filter((id) => !occ.has(id)).reduce((s, id) => s + famW(id, e.floor, e.tag, mult), 0);
    return ids.map((id, i) => {
      if (held & (1 << i)) return 0;
      const m = mod(id)!;
      return (sw(m, minTier.get(id) ?? 0, e.floor) * (e.tag && catalystsFor(m).some((c) => c.tag === e.tag) ? mult : 1)) / W;
    });
  };
  const bits = (x: number): number => { let s = 0; for (; x; x &= x - 1) s++; return s; };
  const full = (1 << n) - 1;
  const key = (h: number, j: number, bq: number): number => (h * 8 + j) * 2 + bq;
  const states: Array<[number, number, number]> = [];
  for (let h = 0; h <= full; h++) for (const bq of B ? [0, 1] : [0]) for (let j = 0; bits(h) + j + bq <= inp.cap; j++) states.push([h, j, bq]);

  const V = new Map<number, number>(states.map(([h, j, bq]) => [key(h, j, bq), 0]));
  const pol = new Map<number, Act>();
  for (let it = 0; it < 2000; it++) {
    // その場で書き換える (Gauss-Seidel)。外れ → 消去 → 高貴の輪が長いと、1 反復ずつ写すやり方は 2000 回でも収束しなかった
    let diff = 0;
    for (const [h, j, bq] of states) {
      const k0 = key(h, j, bq);
      // 狙いが揃って**外れも消し切ったら**終わり。外れが残ると後のエッセンス・冒涜の枠が無い
      if (h === full && j === 0) { V.set(k0, 0); continue; }
      let best = Infinity; let bp: Act | null = null;
      if (h !== full && bits(h) + j + bq < inp.cap) for (const e of acts) {
        const ps = outcomes(e, h, bq); const pj = 1 - ps.reduce((a, b) => a + b, 0);
        let v = e.cost(bq) + pj * (V.get(key(h, j + 1, bq)) ?? Infinity);
        ps.forEach((p, i) => { if (p > 0) v += p * V.get(key(h | (1 << i), j, bq))!; });
        if (v < best) { best = v; bp = e; }
      }
      if (j > 0) {
        const m = bits(h) + j + bq;
        let v = annul.cost(bq) + (j / m) * V.get(key(h, j - 1, bq))!;
        ids.forEach((_, i) => { if (h & (1 << i)) v += V.get(key(h & ~(1 << i), j, bq))! / m; });
        if (bq) v += V.get(key(h, j, 0))! / m;
        if (v < best) { best = v; bp = annul; }
      }
      const old = V.get(k0)!;
      if (Number.isFinite(best) && Number.isFinite(old)) diff = Math.max(diff, Math.abs(best - old));
      else if (Number.isFinite(best) !== Number.isFinite(old)) diff = Infinity;
      V.set(k0, best);
      if (bp) pol.set(k0, bp);
    }
    if (it > 0 && diff < 1e-6) break;   // 収束したら止める (高貴換算で 100 万分の 1)
  }
  const start = key(0, 0, B);
  if (!Number.isFinite(V.get(start)!)) return { reason: "プレを高貴で揃えられません (枠か段が足りない)" };

  const rnd = mulberry32(20260924);
  const samples: number[] = [];
  for (let r = 0; r < (inp.runs ?? 20000); r++) {
    let cost = 0; let h = 0; let j = 0; let bq = B;
    for (let g = 0; g < 100000 && !(h === full && j === 0); g++) {
      const e = pol.get(key(h, j, bq)); if (!e) break;
      cost += e.cost(bq);
      if (e.kind === "exalt") {
        const ps = outcomes(e, h, bq); let u = rnd(); let hit = -1;
        for (let i = 0; i < ps.length; i++) { if (u < ps[i]!) { hit = i; break; } u -= ps[i]!; }
        if (hit >= 0) h |= 1 << hit; else j++;
      } else {
        const heldIdx = ids.map((_, i) => i).filter((i) => h & (1 << i));
        const u = Math.floor(rnd() * (bits(h) + j + bq));
        if (u < j) j--; else if (u - j < heldIdx.length) h &= ~(1 << heldIdx[u - j]!); else bq = 0;
      }
    }
    samples.push(cost);
  }
  const steps: PrefixExaltStep[] = [];
  for (const [h, j, bq] of states) {
    const e = pol.get(key(h, j, bq)); if (!e) continue;
    steps.push({ have: ids.filter((_, i) => h & (1 << i)), junk: j, breachGone: !!B && !bq, action: e.label, perTry: e.cost(bq) });
  }
  /** 外れが 1 つ付いた状態で次に打つ手と、左側の消去が何に当たるか */
  const missAt = (h: number, p: number): MissPlan | null => {
    const e = pol.get(key(h, 1, B));
    if (!e || !(p > 0)) return null;
    const loss = V.get(key(h, 1, B))! - V.get(key(h, 0, B))!;
    if (e.kind === "exalt") return { p, action: `外れは残して ${e.label} (枠が空いている)`, outcomes: [], loss };
    const m = bits(h) + 1 + B;
    const outcomes: MissPlan["outcomes"] = [{ kind: "junk", p: 1 / m }];
    ids.forEach((id, i) => { if (h & (1 << i)) outcomes.push({ kind: "target", modId: id, p: 1 / m }); });
    if (B) outcomes.push({ kind: "breach", p: 1 / m });
    return { p, action: e.label, outcomes, loss };
  };
  const path: PathStep[] = [];
  for (let h = 0; h !== full;) {
    const e = pol.get(key(h, 0, B)); if (!e || e.kind !== "exalt") break;
    const ps = outcomes(e, h, B);
    const h2 = h | (1 << ps.indexOf(Math.max(...ps)));
    const odds = ps.reduce((a, b) => a + b, 0);
    path.push({ want: ids.filter((_, i) => !(h & (1 << i))), action: e.label, odds, perTry: e.cost(B),
      spend: V.get(key(h, 0, B))! - V.get(key(h2, 0, B))!, miss: missAt(h, 1 - odds) });
    h = h2;
  }
  return { modIds: ids, expected: V.get(start)!, steps, path, samples };
}
