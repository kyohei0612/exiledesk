/**
 * ES 兜のクラフト — 当たり率の計算 (poe2db の推定重み × クライアントのティア値、2026-09-14)
 *
 * オーナー指示「DB に載っている重みをそのまま使って期待値をマシに」。
 * 手順 (0.5、int 兜):
 *   1. マジックベース: フラット ES (接頭辞、ティアは買う時に選ぶ)。接尾辞は無い前提
 *   2. 強化のグレーターエッセンス: %ES 68〜79 (接頭辞 2) でレア化
 *   3. 肋骨 + 右手のネクロマンシーのお告げ: 魂の井戸で冒涜の接尾辞 3 択 (兜の冒涜は接尾辞しか無い)。
 *      「X と混沌耐性 +13〜17」があればそれを取る (元素耐性の合計に効く)
 *   4. 高貴なオーブ ×2: 空きの接頭辞 1 / 接尾辞に、重みに比例して MOD が付く
 *      (上級 = MOD レベル 35 以上、完全 + 偉大なる高貴なお告げ = 50 以上を 2 つ)
 *   5. 品質 20% とルーン (ソケット数分) は %ES に足す
 * ES = (ベース ES + フラット ES) × (1 + %ES の合計)。当たり = ES ≥ esHit かつ 元素耐性合計 ≥ resHit。
 *
 * 重みは poe2db の推定 (PoE1 由来、冒涜は全部 1 = 一様)。ロール値は範囲内で一様。
 * 決定的な乱数 (seed 固定) で 20,000 回回して比率を出す (純粋関数、UI 非依存)。
 */
import weightsJson from "../../i18n/mod-weights-poe2db.json";

interface WMod {
  id: string | null;
  family: string;
  families: string[];
  gen: string;
  name: string;
  level: number;
  weight: number;
  tags: string[];
  text: string;
  stats: { id: string; min: number; max: number }[];
}
interface WPage {
  tags: string | null;
  normal: WMod[];
  desecrated: WMod[];
  essence: { essence: string; code: string; level: number; gen: string; family: string; text: string; stats: { id: string; min: number; max: number }[] }[];
}
const PAGES = (weightsJson as unknown as { pages: Record<string, WPage> }).pages;

export type HelmetPage = "Helmets_int" | "Helmets_str_int" | "Helmets_dex_int";

export interface OddsOptions {
  page: HelmetPage;
  /** ベースの ilvl (MOD レベル ≤ ilvl の物だけ付く) */
  ilvl: number;
  /** ベースの素の ES */
  baseEs: number;
  /** 買うベースのフラット ES のティア (1 = 最上位) */
  flatEsTier: number;
  /** ソケット数 (ルーンの本数) */
  sockets: number;
  /** ルーン 1 本の %ES (鉄のグレータールーン 18、パーフェクト 20、なし 0) */
  runePct: number;
  /** 品質 % */
  quality: number;
  /** エグザルトの MOD レベル下限 (通常 1 / 上級 35 / 完全 50) */
  exaltMinLevel: number;
  /** エグザルトで足す MOD の数 (2 = 空きを残す / 3 = 6 MOD まで埋める) */
  exaltCount: number;
  /** 冒涜の候補の MOD レベル下限 (保存 0 / 古代 40) */
  ribMinLevel: number;
  /** 当たり / 中 のしきい値 */
  esHit: number;
  resHit: number;
  esMid: number;
  resMid: number;
  /** 試行回数 (既定 20,000) */
  samples?: number;
}

export interface OddsResult {
  ok: boolean;
  reason?: string;
  pHit: number;
  pMid: number;
  /** 内訳 (診断用) */
  pResHit: number;
  pEsHit: number;
  pHybrid: number;
  pRibRes: number;
  /** ES の平均 */
  meanEs: number;
  meanRes: number;
  /** 平均のフラット ES ティア値と %ES */
  flatEsRange: [number, number] | null;
}

/** mulberry32 (決定的) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const uni = (r: () => number, lo: number, hi: number): number => lo + (hi - lo) * r();

const RES_FAMILIES = new Set(["FireResistance", "ColdResistance", "LightningResistance"]);
const HYBRID_FAMILIES = new Set(["BaseLocalDefencesAndLife", "BaseLocalDefencesAndMana"]);
const USED_PREFIX_FAMILIES = new Set(["BaseLocalDefences", "DefencesPercent"]);

export function computeEsHelmetOdds(o: OddsOptions): OddsResult {
  const page = PAGES[o.page];
  const fail = (reason: string): OddsResult => ({ ok: false, reason, pHit: 0, pMid: 0, pResHit: 0, pEsHit: 0, pHybrid: 0, pRibRes: 0, meanEs: 0, meanRes: 0, flatEsRange: null });
  if (!page) return fail(`重み表に ${o.page} が無い`);

  // ---- フラット ES のティア (レベル降順で T1, T2, …) ----
  const flatTiers = page.normal
    .filter((m) => m.gen === "prefix" && m.family === "BaseLocalDefences" && m.stats.some((s) => s.id === "local_energy_shield") && m.level <= o.ilvl)
    .sort((a, b) => b.level - a.level);
  const flat = flatTiers[Math.min(Math.max(1, o.flatEsTier), flatTiers.length) - 1];
  if (!flat) return fail("フラット ES のティアが無い");
  const flatStat = flat.stats.find((s) => s.id === "local_energy_shield")!;

  // ---- エッセンスの %ES ----
  const ess = page.essence.find((e) => e.essence === "Greater Essence of Enhancement" && e.stats.some((s) => s.id === "local_energy_shield_+%"));
  if (!ess) return fail("強化のグレーターエッセンスの値が無い");
  const essStat = ess.stats.find((s) => s.id === "local_energy_shield_+%")!;

  // ---- 冒涜 (接尾辞) の候補 ----
  const desec = page.desecrated.filter((m) => m.gen === "suffix" && m.level <= o.ilvl && m.level >= o.ribMinLevel);
  if (desec.length < 3) return fail("冒涜の候補が 3 未満");
  const isRibRes = (m: WMod): boolean => m.stats.some((s) => /_(and_chaos|chaos)_damage_resistance_%$/.test(s.id) && /^(fire|cold|lightning)_/.test(s.id));

  // ---- エグザルトの候補 (接頭辞 / 接尾辞) ----
  const eligible = page.normal.filter((m) => m.weight > 0 && m.level <= o.ilvl && m.level >= o.exaltMinLevel);
  const prefixPool = eligible.filter((m) => m.gen === "prefix" && !USED_PREFIX_FAMILIES.has(m.family));
  const suffixPool = eligible.filter((m) => m.gen === "suffix");
  if (prefixPool.length === 0 && suffixPool.length === 0) return fail("エグザルトの候補が無い");

  const N = Math.max(1000, o.samples ?? 20000);
  const r = rng(0x5eed1234);
  let hits = 0;
  let mids = 0;
  let resOk = 0;
  let esOk = 0;
  let hybrids = 0;
  let ribRes = 0;
  let sumEs = 0;
  let sumRes = 0;
  const pctBase = o.quality + o.runePct * o.sockets;

  for (let i = 0; i < N; i++) {
    let esPct = uni(r, essStat.min, essStat.max) + pctBase;
    const flatEs = uni(r, flatStat.min, flatStat.max);
    let res = 0;
    const usedFamilies = new Set<string>(USED_PREFIX_FAMILIES);
    let prefixOpen = 1;
    let suffixOpen = 3;

    // 冒涜: 3 択 (重複なし、一様)
    const picks: WMod[] = [];
    const bag = desec.slice();
    for (let k = 0; k < 3; k++) {
      const idx = Math.floor(r() * bag.length);
      picks.push(bag[idx]);
      bag.splice(idx, 1);
    }
    const resPick = picks.find(isRibRes);
    const chosen = resPick ?? picks[0];
    if (resPick) {
      const s = resPick.stats.find((x) => /_damage_resistance_%$/.test(x.id))!;
      res += uni(r, s.min, s.max);
      ribRes++;
    }
    for (const f of chosen.families) usedFamilies.add(f);
    suffixOpen--;

    // エグザルト × exaltCount
    let hybrid = false;
    for (let k = 0; k < o.exaltCount; k++) {
      const cands: WMod[] = [];
      if (prefixOpen > 0) for (const m of prefixPool) if (!usedFamilies.has(m.family)) cands.push(m);
      if (suffixOpen > 0) for (const m of suffixPool) if (!usedFamilies.has(m.family)) cands.push(m);
      if (cands.length === 0) break;
      let total = 0;
      for (const m of cands) total += m.weight;
      let x = r() * total;
      let pick = cands[cands.length - 1];
      for (const m of cands) {
        x -= m.weight;
        if (x <= 0) {
          pick = m;
          break;
        }
      }
      for (const f of pick.families) usedFamilies.add(f);
      if (pick.gen === "prefix") prefixOpen--;
      else suffixOpen--;
      if (HYBRID_FAMILIES.has(pick.family)) {
        const s = pick.stats.find((x2) => x2.id === "local_energy_shield_+%");
        if (s) {
          esPct += uni(r, s.min, s.max);
          hybrid = true;
        }
      } else if (RES_FAMILIES.has(pick.family)) {
        const s = pick.stats[0];
        res += uni(r, s.min, s.max);
      }
    }
    if (hybrid) hybrids++;

    const es = (o.baseEs + flatEs) * (1 + esPct / 100);
    sumEs += es;
    sumRes += res;
    const resHitOk = res >= o.resHit;
    const esHitOk = es >= o.esHit;
    if (resHitOk) resOk++;
    if (esHitOk) esOk++;
    if (resHitOk && esHitOk) hits++;
    else if (res >= o.resMid && es >= o.esMid) mids++;
  }
  return {
    ok: true,
    pHit: hits / N,
    pMid: mids / N,
    pResHit: resOk / N,
    pEsHit: esOk / N,
    pHybrid: hybrids / N,
    pRibRes: ribRes / N,
    meanEs: sumEs / N,
    meanRes: sumRes / N,
    flatEsRange: [flatStat.min, flatStat.max],
  };
}

/** 兜の属性ページ → 表示名 */
export const HELMET_PAGES: { id: HelmetPage; label: string }[] = [
  { id: "Helmets_int", label: "知性 (ES) 兜" },
  { id: "Helmets_str_int", label: "筋力 / 知性 (アーマー + ES) 兜" },
  { id: "Helmets_dex_int", label: "器用さ / 知性 (回避 + ES) 兜" },
];
