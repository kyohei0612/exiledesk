/**
 * redo-cost.ts — やり直しの費用から取り方を決める (2026-09-25)
 *
 * オーナー:「やり直しの費用から先に決めた方がいい気がする、どのパターンでも」。狙い 1 つごとに取り方 (カオス / 高貴 / 冒涜 /
 * エッセンス) を並べ、1 回の値段・当たる確率・**外れた時のやり直し費用** (外れを消す値段 + その時に消えうる物を作り直す費用) から
 * 見込みを出す。冒涜と最初のカオスは 1 つずつしか使えないので、どの狙いに使うかの組み合わせを全部見積もって安い物を採る。
 * 決まり (いつ外れの消し方が確定になるか) は [[RULES]] にまとめる。細かい順番の最終判断は今まで通りシミュレーター ([[auto-pick.ts]])。
 */
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { catalysingMultiplier, catalystCountFor, catalystPriceKey } from "../../services/htc/catalysing";
import { catalystsFor } from "../../services/htc/quality";
import type { Side } from "../../services/htc/step-odds";
import type { ItemBase, Mod } from "../../vendor/poe2htc/engine/types";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { AutoTreeInput } from "./tree-auto";

export type Method = "chaos" | "exalt" | "desecrate" | "essence";
export type Reroll = "light" | "overwrite";
export type Bone = "desecrate" | "desecrate_ancient";

/** 狙い 1 つの取り方 1 つの見積もり */
export interface MethodEstimate {
  modId: string;
  side: Side;
  method: Method;
  /** 冒涜の骨と外れの回し方 */
  bone?: Bone;
  reroll?: Reroll;
  /** 触媒の高貴のお告げを使う (品質の入れ直し代込み) */
  catalyst?: string | null;
  /** 高貴のオーブ (完全 / 上級 / 普通) */
  orb?: "exalt_perfect" | "exalt_greater" | "exalt";
  /** 外れは素の消去 (お告げ無し) の方が安いか */
  plainAnnul?: boolean;
  /** 1 回の値段 (高貴建て) */
  perTry: number;
  /** 1 回で当たる確率 */
  p: number;
  /** 外れ 1 回のやり直し費用 (消す値段 + 消えうる物の作り直し) */
  perMiss: number;
  /** やり直しが確定 (他の物を巻き込まない) か */
  safe: boolean;
  /** 見込み (高貴建て) */
  expected: number;
  /** なぜその取り方が使えないか (使えない物は候補から外す) */
  why?: string;
}

export interface RedoPlan {
  /** 採る取り方 (狙いごと) */
  rows: MethodEstimate[];
  /** 合計の見込み */
  total: number;
  /** autoTree に渡す指定 */
  chaosPick: string | null;
  desecratePick: string | null;
  /** 狙いごとの高貴のオーブ (見積もりで安かった物) */
  exaltTiers: Record<string, "exalt_perfect" | "exalt_greater" | "exalt">;
  /** 側ごとの外れの消し方 (見積もりで安かった物。その側に高貴の狙いが無ければ無し) */
  annulSides: Partial<Record<Side, "plain" | "side">>;
  reroll?: Reroll;
  bone?: "preserved";
}

/** 決まり (画面にも出す) */
export const RULES: readonly string[] = [
  "冒涜の外れをエッセンス (天体) で上書きして回せるのは、その側の残りがフラクチャーだけの時 (結晶化はフラクチャー以外からランダムに消す)",
  "それ以外の冒涜の外れは光のお告げ + 消去 (冒涜の MOD だけ消えるので確定)",
  "高貴の外れは側の消去のお告げで消す。その側に固定でない物が他にあると巻き込む (その分の作り直しをやり直し費用に足す)",
  "触らない MOD (固定していない樹 MOD など) がある側では高貴を使わない (消去で消えるとその回は失敗)",
  "冒涜は 1 アイテム 1 つ、クラフト MOD (エッセンス・ブリーチ) も 1 つ",
  "カオスで引くのは最初の 1 つだけ (何も付いていないうちなら消えるのは外れだけ)",
];

const OMEN_EX: Record<Side, string> = { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" };
const OMEN_AN: Record<Side, string> = { prefix: "OmenofSinistralAnnulment", suffix: "OmenofDextralAnnulment" };
const OMEN_CR: Record<Side, string> = { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" };
const OMEN_NE: Record<Side, string> = { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" };
const BREACH_FAMILY = "LocalMaximumQuality";

export function planByRedoCost(inp: AutoTreeInput, cls: ItemBase, itemLevel: number): RedoPlan | null {
  const { data: d, prices: p } = inp;
  const cur = (k: string): number => p.currency[k] ?? p.omens[k] ?? Infinity;
  const fixed = new Set(inp.fixedIds);
  const ts = inp.targets.filter((t) => !fixed.has(t.modId) && d.mods.has(t.modId));
  if (!ts.length) return null;
  const mod = (id: string): Mod => d.mods.get(id)!;
  const sideOf = (id: string): Side => (mod(id).type === "prefix" ? "prefix" : "suffix");
  const key = (s: Side): "prefixes" | "suffixes" => (s === "prefix" ? "prefixes" : "suffixes");
  const w = (m: Mod, minIdx: number, floor: number): number =>
    m.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= itemLevel && t.ilvl >= floor ? t.weight : 0), 0);
  const poolW = (s: Side, floor: number, desec: boolean, tag: string | null, mult: number): number =>
    [...cls.pools.normal[key(s)], ...(desec ? cls.pools.desecrated[key(s)] : [])].reduce((a, id) => {
      const m = d.mods.get(id);
      if (!m) return a;
      const k = tag && catalystsFor(m).some((c) => c.tag === tag) ? mult : 1;
      return a + w(m, 0, floor) * k;
    }, 0);
  const shielded = new Set(inp.protectedSides ?? []);
  const fixedSides = new Set(inp.fixedSides ?? []);
  const limits = inp.limits ?? { prefix: 3, suffix: 3 };
  const loose = (s: Side): number => inp.startLoose?.[s] ?? 0;
  const breach = ts.some((t) => mod(t.modId).family === BREACH_FAMILY) || (inp.qualityPct != null && inp.qualityPct > (inp.baseQuality ?? 20));
  const qualityMax = (inp.baseQuality ?? 20) + (breach ? 20 : 0);

  /** 狙いの段が届く一番高い下限 (完全の高貴は段 50 未満を出さない) */
  const reach = (t: TierTarget): number => Math.max(...mod(t.modId).tiers.filter((_, i) => i >= (t.minTierIndex ?? 0)).map((x) => x.ilvl), 0);
  const finish = (e: Omit<MethodEstimate, "expected">): MethodEstimate => {
    const tries = e.p > 0 ? 1 / e.p : Infinity;
    return { ...e, expected: e.why ? Infinity : e.perTry * tries + e.perMiss * Math.max(0, tries - 1) };
  };

  /** 高貴で取る (k = その側に先に置いた固定でない狙いの数、redoPrior = それらの作り直し費用の平均) */
  /**
   * 高貴で取る (k = その側に先に置いた固定でない狙いの数、redoPrior = それらの作り直し費用の平均)。
   * オーブ (完全 / 上級 / 普通) と触媒 (無し / 効くカタリストの一番安い物) を全部見積もって安い物 (2026-09-25 実測:
   * 合格の下限がレベル 50 以上なら完全、それ未満なら上級が安い。触媒はカタリストが安ければ 3〜5 倍安く、アタックのように
   * 高い物でも触媒無しよりは安いが、同じ MOD に安い物が効くならそちら)
   */
  function exaltEst(t: TierTarget, k: number, redoPrior: number, kOther = 0, redoOther = 0): MethodEstimate {
    const s = sideOf(t.modId), m = mod(t.modId);
    // 貼り付けに品質の種類があるなら、その種類が効く狙いだけ触媒を使う (種類を替えると品質が 0 からになり、側が埋まった後は
    // 元の種類に戻せない)。品質の種類が無ければ効くカタリストの一番安い物。
    // ブリーチの MOD を先に外す組み方 (両側 2 枠以下) では入れ直しが 20% までしか戻らないので触媒は使わない
    const narrow = limits.prefix <= 2 && limits.suffix <= 2;
    const cats = breach && narrow ? [] : catalystsFor(m).map((c) => c.tag).sort((a, b) => cur(catalystPriceKey(a)) - cur(catalystPriceKey(b)));
    const tag = inp.qualityTag ? (cats.includes(inp.qualityTag) ? inp.qualityTag : null) : cats[0] ?? null;
    const others = k + (shielded.has(s) ? loose(s) : 0);
    const risky = shielded.has(s);
    // 外れの消し方は 2 通りを見積もって安い方 (オーナー 2026-09-25:「お告げ使って消去回す時も決めなあかん」):
    //   側の消去のお告げ … 消えるのはその側の物だけ。同じ側の狙いは巻き込む (お告げ代 10〜18 神)
    //   素の消去 … 両側の固定でない物から 1 つ (6 カオス)。反対側の狙いも巻き込む
    // 巻き込む分 = (巻き込む確率) × (作り直しの費用)。守りたい物が反対側にしか無ければお告げは要らず、同じ側にあるなら
    // お告げを払っても守れない (2026-09-25 金の指輪: 素の消去 523 神 / 右側のお告げ 1,162 神)
    const otherSide = kOther + (shielded.has(s === "prefix" ? "suffix" : "prefix") ? loose(s === "prefix" ? "suffix" : "prefix") : 0);
    const missSide = cur("annul") + cur(OMEN_AN[s]) + (others > 0 ? (others / (others + 1)) * redoPrior : 0);
    const nAll = others + otherSide + 1;
    const missPlain = cur("annul") + (others > 0 ? (others / nAll) * redoPrior : 0) + (otherSide > 0 ? (otherSide / nAll) * redoOther : 0);
    const perMiss = Math.min(missSide, missPlain);
    const plainAnnul = missPlain <= missSide;
    const r = reach(t);
    let best: MethodEstimate | null = null;
    for (const [orb, floor] of [["exalt_perfect", 50], ["exalt_greater", 35], ["exalt", 0]] as const) {
      if (r < floor) continue;
      for (const useTag of tag ? [tag, null] : [null]) {
        const mult = useTag ? catalysingMultiplier(qualityMax) : 1;
        const refill = useTag ? catalystCountFor(qualityMax) * cur(catalystPriceKey(useTag)) + cur("OmenofCatalysingExaltation") : 0;
        const pHit = (w(m, t.minTierIndex ?? 0, floor) * mult) / poolW(s, floor, false, useTag, mult);
        const e = finish({ modId: t.modId, side: s, method: "exalt", catalyst: useTag, orb, plainAnnul, perTry: cur(orb) + cur(OMEN_EX[s]) + refill, p: pHit, perMiss, safe: plainAnnul ? others + otherSide === 0 : others === 0,
          ...(risky ? { why: "触らない MOD がある側 (消去で巻き込む)" } : {}) });
        if (!best || e.expected < best.expected) best = e;
      }
    }
    return best!;
  }
  /** 冒涜で取る (その側に固定でない物が k 個ある = 満杯なら置き換えで巻き込む) */
  function desecrateEst(t: TierTarget, k: number, bone: Bone, reroll: Reroll): MethodEstimate {
    const s = sideOf(t.modId), m = mod(t.modId);
    const floor = bone === "desecrate_ancient" ? 40 : 0;
    const p1 = w(m, t.minTierIndex ?? 0, floor) / poolW(s, floor, true, null, 1);
    const pHit = 1 - (1 - p1) ** 6;
    const perTry = cur(bone) + cur(OMEN_NE[s]) + cur("OmenofAbyssalEchoes");
    let why: string | undefined;
    if (inp.desecratedTaken) why = "冒涜の MOD がもう付いている";
    if (reach(t) < floor) why = "古代の骨では段が届かない";
    // 上書き: 枠 2 つの側で残りがフラクチャーだけ
    const canOw = limits[s] === 2 && fixedSides.has(s) && k === 0 && !(shielded.has(s) && loose(s) > 0);
    const ess = [...d.mods.values()].filter((x) => x.id.startsWith(m.id.split("/")[0] + "/") && CRAFTED_SOURCES.has(x.source) && x.type === s && x.family !== BREACH_FAMILY)
      .map((x) => cur(`essence:perfect:${x.id}`)).filter((v) => Number.isFinite(v)).sort((a, b) => a - b)[0];
    if (reroll === "overwrite" && (!canOw || ess == null)) why = why ?? "上書きは残りがフラクチャーの枠 2 つの側だけ";
    const perMiss = reroll === "overwrite" ? cur(OMEN_CR[s]) + (ess ?? Infinity) : cur("OmenofLight") + cur("annul");
    // 満杯の側への冒涜は固定でない物を 1 つ置き換える (光で回す時)。上書きの形 (k = 0) は確定
    const full = limits[s] - (inp.startCount?.[s] ?? 0) - k <= 0;
    const risk = reroll === "light" && full && k > 0 ? k / (k + 1) : 0;
    return finish({ modId: t.modId, side: s, method: "desecrate", bone, reroll, perTry, p: pHit, perMiss: perMiss + risk * 0, safe: risk === 0, ...(why ? { why } : {}) });
  }
  function chaosEst(t: TierTarget): MethodEstimate {
    const s = sideOf(t.modId), m = mod(t.modId);
    const pHit = w(m, t.minTierIndex ?? 0, 0) / (poolW("prefix", 0, false, null, 1) + poolW("suffix", 0, false, null, 1));
    const ok = inp.chaosOk || (inp.chaosSide && inp.chaosSide === s);
    return finish({ modId: t.modId, side: s, method: "chaos", perTry: cur("chaos") + (inp.chaosOk ? 0 : cur(s === "prefix" ? "OmenofSinistralErasure" : "OmenofDextralErasure")), p: pHit, perMiss: 0, safe: true, ...(ok ? {} : { why: "触らない MOD があるのでカオスは使えない" }) });
  }
  function essenceEst(t: TierTarget): MethodEstimate {
    const s = sideOf(t.modId);
    return finish({ modId: t.modId, side: s, method: "essence", perTry: cur(`essence:perfect:${t.modId}`) + cur(OMEN_CR[s]), p: 1, perMiss: 0, safe: true });
  }

  const normals = ts.filter((t) => mod(t.modId).source === "normal");
  const essences = ts.filter((t) => CRAFTED_SOURCES.has(mod(t.modId).source) && mod(t.modId).family !== BREACH_FAMILY);
  const desecOnly = ts.filter((t) => mod(t.modId).source === "desecrated");
  if (desecOnly.length > 1) return null;
  const bestDesec = (t: TierTarget, k: number): MethodEstimate => {
    const cands: MethodEstimate[] = [];
    for (const bone of ["desecrate", "desecrate_ancient"] as const) for (const rr of ["overwrite", "light"] as const) cands.push(desecrateEst(t, k, bone, rr));
    return cands.reduce((a, b) => (b.expected < a.expected ? b : a));
  };

  // 組み合わせ: カオスで引く 1 つ (無しも) × 冒涜に回す 1 つ (無しも)。残りの普通の狙いは高貴 (側ごとに、当たりやすい順に置く)
  const desecCands: Array<TierTarget | null> = desecOnly.length ? [desecOnly[0]!] : [null, ...normals];
  // フラクチャーの後の 1 発目はカオススパム (オーナー 2026-09-25、確率実験場: 守る物が無い間は素のカオスが最安)。
  // ただし「カオスで付けた物と同じ側に、後で高貴を何度も打つ」形だと、外れの消去で巻き込んでカオスからやり直しになり、
  // 高貴を先に揃えて一番出にくい物を最後に冒涜で取る方が安い (金の指輪 サフィにキャスピ T1 + 耐性 2 つ: カオス先 523 神 /
  // 耐性の高貴 → キャスピ冒涜 365 神)。なので「使わない」も候補に残し、見積もりと回した結果で決める
  const chaosCands: Array<TierTarget | null> = [null, ...(inp.chaosOk || inp.chaosSide ? normals : [])];
  let best: RedoPlan | null = null;
  for (const dc of desecCands) for (const cc of chaosCands) {
    if (dc && cc && dc.modId === cc.modId) continue;
    const rows: MethodEstimate[] = essences.map(essenceEst);
    if (cc) rows.push(chaosEst(cc));
    const placed: Record<Side, number> = { prefix: 0, suffix: 0 };
    const redoSum: Record<Side, number> = { prefix: 0, suffix: 0 };
    if (cc) { placed[sideOf(cc.modId)] += 1; redoSum[sideOf(cc.modId)] += rows[rows.length - 1]!.expected; }
    const rest = normals.filter((t) => t.modId !== dc?.modId && t.modId !== cc?.modId)
      .sort((a, b) => exaltEst(b, 0, 0).p - exaltEst(a, 0, 0).p);
    for (const t of rest) {
      const s = sideOf(t.modId);
      const o: Side = s === "prefix" ? "suffix" : "prefix";
      const e = exaltEst(t, placed[s], placed[s] ? redoSum[s] / placed[s] : 0, placed[o], placed[o] ? redoSum[o] / placed[o] : 0);
      rows.push(e); placed[s] += 1; redoSum[s] += e.expected;
    }
    if (dc) rows.push(bestDesec(dc, placed[sideOf(dc.modId)]));
    const total = rows.reduce((a, r) => a + r.expected, 0);
    if (!Number.isFinite(total)) continue;
    if (!best || total < best.total) {
      const dr = rows.find((r) => r.method === "desecrate");
      const exaltTiers = Object.fromEntries(rows.filter((r) => r.method === "exalt" && r.orb).map((r) => [r.modId, r.orb!]));
      // 側ごと: その側の高貴の狙いのうち、外れの多い (見込みの大きい) 物の消し方に合わせる
      const annulSides: Partial<Record<Side, "plain" | "side">> = {};
      for (const sd of ["prefix", "suffix"] as Side[]) {
        const ex = rows.filter((r) => r.method === "exalt" && r.side === sd).sort((x, y) => y.expected - x.expected)[0];
        if (ex) annulSides[sd] = ex.plainAnnul ? "plain" : "side";
      }
      best = { rows, total, chaosPick: cc?.modId ?? null, desecratePick: dc && mod(dc.modId).source === "normal" ? dc.modId : null, exaltTiers, annulSides,
        ...(dr?.reroll ? { reroll: dr.reroll } : {}), ...(dr?.bone === "desecrate" ? { bone: "preserved" as const } : {}) };
    }
  }
  return best;
}
