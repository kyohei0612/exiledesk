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
