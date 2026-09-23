/**
 * prefix-finish.ts — サフィが揃った後、プレを仕上げる (2026-09-23)
 *
 * オーナーの流れ (品質 40%):「成功サフィの場合だけどあとは簡単で削減のお告げ、カオスオーブ後、
 * エッセンス結晶化でつけて冒涜でマナ最大を引く」
 *   1. 最後の品質まで上げる (上限 40% のうち = ブリーチの MOD があるうちに。1 個 {@link QUALITY_PER_CATALYST}%)
 *   2. **削減のお告げ + カオスオーブ**: 一番レベルの低い MOD (ブリーチの MOD、レベル 0) を確定で消し、
 *      代わりに 1 つ付く。サフィは満杯なのでプレに付く (外れ扱い)
 *   3. **パーフェクトエッセンス + 左側の結晶化のお告げ**: 今のプレの外れを食わせて確定で付ける
 *   4. **冒涜 (左手のネクロマンシーのお告げ)** で残りのプレを引く。3 択から選び、外れたら反響のお告げで
 *      1 回引き直し、それでも外れなら**光のお告げ**で冒涜だけ消してやり直す (光ガチャ)
 * 品質 20% (ブリーチ無し) は 2 の代わりに「高貴 + 左側の高貴なお告げでプレに外れを 1 つ」。
 *
 * 数えるのは**プレの狙いがエッセンス (確定) と冒涜 1 つ**の形だけ。冒涜で引くプレが 2 つ以上なら
 * 組めない理由を返す (後回し。オーナー「プレと高額コースは後回し」)。
 */
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import { catalystCountFor, catalystPriceKey, QUALITY_PER_CATALYST } from "./catalysing";
import { CATALYSTS } from "./quality";

/** 3 択 (冒涜の骨は候補を 3 つ見せる) */
const OFFERS = 3;
/** 古代の骨の段の下限 */
const ANCIENT_FLOOR = 40;

export interface FinishStep {
  label: string;
  /** その手で付ける狙い (画面で文面に直す) */
  modId?: string;
  /** 1 回の値段 (高貴換算) */
  cost: number;
}

export interface FinishPlan {
  /** 決まった手 (上から順に 1 回ずつ) */
  steps: FinishStep[];
  /** 冒涜のガチャ。無ければ null (冒涜で引く狙いが無い) */
  desecrate: {
    modId: string;
    bone: string;
    echoes: boolean;
    /** 1 回 (骨 1 本) で当たる確率 */
    odds: number;
    /** 1 回の値段 (骨 + お告げ + 反響を使った時の分の平均) */
    perTry: number;
    /** 外れた時の消去のオーブ + 光のお告げ */
    light: number;
  } | null;
  /** 仕上げの平均 (高貴換算) */
  expected: number;
  /** 仕上げの費用を 1 回ぶん引く (分布を足し合わせるため) */
  sample: (rnd: () => number) => number;
  reason: string | null;
}

export interface FinishInput {
  data: PatchData;
  cls: ItemBase;
  /** プレの狙い (固定済み・樹 MOD を除く) */
  targets: readonly TierTarget[];
  prices: Prices;
  itemLevel: number;
  /** 完成品の品質 (%) と種類 */
  quality: number;
  qualityTag: string | null;
  /** 品質 40% (プレにブリーチの MOD が居る) */
  breach: boolean;
  /** プレの空き (固定済み・樹 MOD を引いた数) */
  prefixCap: number;
}

export function prefixFinish(inp: FinishInput): FinishPlan {
  const { data, cls, prices, itemLevel } = inp;
  const cur = (k: string): number => prices.currency[k] ?? prices.omens[k] ?? Infinity;
  const mod = (id: string): Mod | undefined => data.mods.get(id);
  const none = (reason: string): FinishPlan => ({ steps: [], desecrate: null, expected: 0, sample: () => 0, reason });

  const essences = inp.targets.filter((t) => mod(t.modId)?.source === "perfect_essence");
  const rolls = inp.targets.filter((t) => mod(t.modId)?.source === "normal");
  const others = inp.targets.filter((t) => !essences.includes(t) && !rolls.includes(t));
  if (others.length) return none("プレに作り方の分からない狙いがあります");
  if (rolls.length > 1) return none(`冒涜で引くプレが ${rolls.length} つ (1 つまでしか数えていません)`);
  if (essences.length + rolls.length > inp.prefixCap) return none("プレの枠が足りません");

  const steps: FinishStep[] = [];
  // 1. 最後の品質 (ブリーチの MOD があるうちに上げ切る)
  if (inp.quality > 0 && inp.qualityTag) {
    const n = catalystCountFor(inp.quality);
    const ja = CATALYSTS.find((c) => c.tag === inp.qualityTag)?.ja ?? inp.qualityTag;
    steps.push({ label: `${ja} × ${n} (品質 ${inp.quality}%、1 個 ${QUALITY_PER_CATALYST}%)`, cost: n * cur(catalystPriceKey(inp.qualityTag)) });
  }
  // 2〜3. エッセンスごとに「プレに外れを 1 つ → 結晶化で食わせて付ける」
  essences.forEach((t, i) => {
    if (i === 0 && inp.breach) {
      steps.push({ label: "カオスオーブ + 削減のお告げ (ブリーチの MOD を消してプレに外れ)", cost: cur("chaos") + cur("OmenofWhittling") });
    } else {
      steps.push({ label: "高貴なオーブ + 左側の高貴なお告げ (プレに外れ)", cost: cur("exalt") + cur("OmenofSinistralExaltation") });
    }
    steps.push({ label: "パーフェクトエッセンス + 左側の結晶化のお告げ", modId: t.modId, cost: cur(`essence:perfect:${t.modId}`) + cur("OmenofSinistralCrystallisation") });
  });
  const fixed = steps.reduce((a, s) => a + s.cost, 0);

  // 4. 冒涜の光ガチャ
  const roll = rolls[0];
  if (!roll) return { steps, desecrate: null, expected: fixed, sample: () => fixed, reason: null };
  const target = mod(roll.modId)!;
  const occupied = new Set(essences.map((t) => mod(t.modId)?.family).filter(Boolean));
  const sw = (m: Mod, minIdx: number, floor: number): number =>
    m.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= itemLevel && t.ilvl >= floor ? t.weight : 0), 0);
  const pool = [...cls.pools.normal.prefixes, ...cls.pools.desecrated.prefixes];
  // 光のお告げは消去のオーブに付けて使う (冒涜の MOD だけを消す)。お告げ代 + 消去 1 個
  const light = cur("OmenofLight") + cur("annul");
  const necro = cur("OmenofSinistralNecromancy");
  const echoes = cur("OmenofAbyssalEchoes");
  let best: NonNullable<FinishPlan["desecrate"]> & { perSuccess: number } | null = null;
  for (const [bone, key, floor] of [["保存された鎖骨", "desecrate", 0], ["古代の鎖骨", "desecrate_ancient", ANCIENT_FLOOR]] as const) {
    const W = pool.reduce((a, id) => { const m = mod(id); return m && !occupied.has(m.family) ? a + sw(m, 0, floor) : a; }, 0);
    const p1 = sw(target, roll.minTierIndex ?? 0, floor) / W;
    if (!(p1 > 0) || !Number.isFinite(cur(key))) continue;
    for (const useEchoes of [false, true]) {
      const miss3 = (1 - p1) ** OFFERS;
      const odds = useEchoes ? 1 - miss3 * miss3 : 1 - miss3;
      const perTry = cur(key) + necro + (useEchoes ? miss3 * echoes : 0);
      // 当たるまで: perTry × 回数 + 光 × (回数 - 1)
      const perSuccess = perTry / odds + light * (1 / odds - 1);
      if (!best || perSuccess < best.perSuccess) best = { modId: roll.modId, bone, echoes: useEchoes, odds, perTry, light, perSuccess };
    }
  }
  if (!best) return none("冒涜で狙いが出ません (段が高すぎる / 相場が無い)");
  const d = best;
  return {
    steps,
    desecrate: { modId: d.modId, bone: d.bone, echoes: d.echoes, odds: d.odds, perTry: d.perTry, light: d.light },
    expected: fixed + d.perSuccess,
    sample: (rnd) => {
      const k = Math.max(1, Math.ceil(Math.log(1 - rnd()) / Math.log(1 - d.odds)));
      return fixed + k * d.perTry + (k - 1) * d.light;
    },
    reason: null,
  };
}
