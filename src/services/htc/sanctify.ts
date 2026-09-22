/**
 * sanctify.ts — 聖別 (Omen of Sanctification + 神のオーブ) (2026-09-22)
 *
 * オーナー指示:「聖別の挙動、検索してリサーチしてきて」→「実装して」。
 *
 * ## 何が起きるか (poe2db の記述)
 *   アイテムの MOD の数値に **78% 〜 122%** のランダムな倍率がかかる。**MOD ごとに独立**。
 *   聖別されたアイテムには、ほとんどのクラフトが使えなくなる。
 *
 * つまり**最後の一手**で、**やり直しが効かない**。外したらそのアイテムは終わりで、
 * もう一度やるには**完成品をもう 1 個作り直す**ところからになります。
 * だからレシピ側も「unsanctified のベースを用意しろ」「聖別前チェックリスト」と言っています。
 *
 * ## 何に使うか
 * アミュレットのスペルスキルレベルは MOD プールの上限が **+3**。キャスターのカタリスト 34% で
 * **+4** まで来ますが、そこから先は聖別しかありません ([[quality.ts]] / [[lingering.ts]])。
 *
 * ## 丸めは仮置き (**確認できていません**)
 * 品質の倍率は実物で**切り捨て**と確認しました (3 × 1.34 = 4.02 → +4、8 × 1.2 = 9.6 → 9)。
 * 聖別の倍率も同じ扱いなら、表示 +4 は `4 × 1.22 = 4.88` で**どう転んでも +5 になりません**。
 * 実際には +5 になるという話なので、**四捨五入を既定**にしています。
 *   切り捨て → +5 は不可能
 *   四捨五入 → 1.12 倍以上で +5 (実測すれば確定します)
 * `rounding` で切り替えられるので、実機で確かめたら既定を直してください。
 */
import { jaOfPriceKey } from "./labels";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";

/** 倍率の下限 (poe2db) */
export const SANCTIFY_MIN = 0.78;
/** 倍率の上限 (poe2db) */
export const SANCTIFY_MAX = 1.22;

/** 丸め方。品質は切り捨てだが、聖別は未確認 (冒頭の説明を参照) */
export type SanctifyRounding = "round" | "floor";

export interface SanctifyTarget {
  modId: string;
  /** 今の**素の**値 (カタリストの底上げを戻した後) */
  raw: number;
  /** 届いてほしい**表示**値 */
  want: number;
  /** その MOD に乗っている品質 (%)。カタリストの対象でなければ 0 */
  qualityPct?: number;
}

export interface SanctifyModResult {
  modId: string;
  /** 目標に届く確率 (0-1) */
  pReach: number;
  /** 今の表示値より下がる確率 (0-1) */
  pWorse: number;
  /** 届くのに要る最小の倍率 */
  needed: number;
  /** 倍率の上限を超えていて、どう転んでも届かない */
  impossible: boolean;
}

export interface SanctifyResult {
  mods: SanctifyModResult[];
  /** 狙った MOD が**全部**届く確率。MOD ごとに独立なので掛け算 */
  pAll: number;
  /** どれか 1 つでも今より下がる確率 */
  pAnyWorse: number;
  /** 1 回の費用 (神のオーブ + 聖別のお告げ)。値段が無ければ null */
  cost: number | null;
  /**
   * 当てるまでに要る**完成品の数** (期待値)。
   * 聖別はやり直せないので、外すたびに完成品を 1 個作り直すことになります。
   */
  expectedItems: number | null;
  /** 聖別そのものにかかる費用の合計 (完成品の作成費は含みません) */
  expectedCost: number | null;
  /** 使う物の日本語名 */
  uses: string[];
  caveats: string[];
}

const RANGE = SANCTIFY_MAX - SANCTIFY_MIN;

/** 倍率が `k` 以上になる確率 (一様分布) */
function pAtLeast(k: number): number {
  if (k <= SANCTIFY_MIN) return 1;
  if (k > SANCTIFY_MAX) return 0;
  return (SANCTIFY_MAX - k) / RANGE;
}

/** `want` に届くのに要る最小の倍率 */
function neededFor(t: SanctifyTarget, rounding: SanctifyRounding): number {
  const withQuality = t.raw * (1 + (t.qualityPct ?? 0) / 100);
  if (withQuality <= 0) return Infinity;
  // 切り捨てなら want ちょうど、四捨五入なら want - 0.5 まで届けばよい
  const floorTo = rounding === "round" ? t.want - 0.5 : t.want;
  return floorTo / withQuality;
}

export const SANCTIFY_CAVEAT_ROUNDING =
  "聖別の倍率をどう丸めるかは未確認です。四捨五入で計算しています (切り捨てだと届かない目標があります)。";
export const SANCTIFY_CAVEAT_ONESHOT =
  "聖別はやり直せません。外したらそのアイテムは終わりで、もう一度やるには完成品を作り直すところからになります。";

/**
 * 聖別の見込みを出す。
 *
 * @param targets 今の素の値と、届いてほしい表示値
 */
export function sanctifyOutlook(
  prices: Prices,
  targets: readonly SanctifyTarget[],
  opts: { rounding?: SanctifyRounding } = {},
): SanctifyResult {
  const rounding = opts.rounding ?? "round";
  const mods = targets.map((t): SanctifyModResult => {
    const needed = neededFor(t, rounding);
    // 今の表示値。ここより下がったら「悪くなった」
    const now = t.raw * (1 + (t.qualityPct ?? 0) / 100);
    const keepAt = rounding === "round" ? (Math.round(now) - 0.5) / now : Math.floor(now) / now;
    return {
      modId: t.modId,
      pReach: pAtLeast(needed),
      // 今の表示値を保てない確率
      pWorse: 1 - pAtLeast(keepAt),
      needed,
      impossible: needed > SANCTIFY_MAX,
    };
  });

  const pAll = mods.reduce((a, m) => a * m.pReach, 1);
  const pAnyWorse = 1 - mods.reduce((a, m) => a * (1 - m.pWorse), 1);

  const divine = prices.currency.divine ?? null;
  const omen = prices.omens.OmenofSanctification ?? null;
  const cost = divine != null && omen != null ? divine + omen : null;
  const expectedItems = pAll > 0 ? 1 / pAll : null;

  return {
    mods,
    pAll,
    pAnyWorse,
    cost,
    expectedItems,
    expectedCost: cost != null && expectedItems != null ? cost * expectedItems : null,
    uses: [jaOfPriceKey("divine") ?? "Divine Orb", "聖別のお告げ"],
    caveats: [SANCTIFY_CAVEAT_ONESHOT, SANCTIFY_CAVEAT_ROUNDING],
  };
}
