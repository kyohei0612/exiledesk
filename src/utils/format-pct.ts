/**
 * format-pct.ts — 確率・割合の % の書き方を 1 つに (2026-10-10 動きの揃え 5)。
 * 原点はエミュレーターの「狙う」(StageAimPanel、オーナーが一番見た物) と「このベースに付く MOD」(StageModList):
 *   0 (以下)          → "0%"   (opts.zero で "" / "—" などに替えられる)
 *   0 より大 〜 0.1% 未満 → "<0.1%"
 *   0.1% 〜 10% 未満   → 小数 1 桁 ("3.4%")。丸めて 10.0 になる物は "10%"
 *   10% 以上          → 整数 ("42%")。99.5% 以上は丸めて "100%" (StageAimPanel と同じ)
 * 値の変化 (+12% / 1.16倍) や小数 2 桁が要る賭け (アドニア) は別。null / 数でない物は opts.none ("")
 */
export interface PctOpts {
  /** 0 の時 (既定 "0%") */
  zero?: string;
  /** null / NaN の時 (既定 "") */
  none?: string;
}

export function fmtPct(p: number | null | undefined, opts: PctOpts = {}): string {
  if (p == null || !Number.isFinite(p)) return opts.none ?? "";
  if (p <= 0) return opts.zero ?? "0%";
  const v = p * 100;
  if (v < 0.1) return "<0.1%";
  if (v < 10) {
    const s = v.toFixed(1);
    return Number(s) >= 10 ? "10%" : `${s}%`;
  }
  return `${v.toFixed(0)}%`;
}

/**
 * 付いた瞬間の確率 (工程・直前の変化)。珍しい物ほど細かく: 10% 以上は整数、1% 以上は小数 1 桁、それ未満は小数 2 桁 ("0.71%")、0.01% 未満は "<0.01%"
 * (2026-10-10 オーナー「1% 未満で付いた MOD は MOD 名 プレ● ●% って黄色で」。前は StageHistory の chancePct)
 */
export function fmtChance(p: number): string {
  const v = p * 100;
  if (v >= 10) return `${v.toFixed(0)}%`;
  if (v >= 1) return `${v.toFixed(1)}%`;
  if (v >= 0.01) return `${v.toFixed(2)}%`;
  return "<0.01%";
}
/**
 * 珍しい = 付いた瞬間の確率が 0.3% 未満 (黄色で出す)。ふつうの段は 0.64% 前後 (金の指輪 iLv82 の高貴で 203 段の半分以上) なので、その半分以下。
 * 2026-10-10 オーナー「0.3% 未満で黄色」(1% 未満だとほとんど全部が当たった)
 */
export const RARE_CHANCE = 0.003;
