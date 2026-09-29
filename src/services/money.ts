/**
 * money.ts — 通貨の換算と丸めの決まりはここだけ (2026-09-29 統一)
 *
 * 前は「神・カオス → 高貴」が 3 か所 (レートが 0 の時に 0 を返す所と null を返す所があった)、
 * 丸めの誤差の逃げ (1e-4) が表示の丸めにしか無く、取引所の「実際に払う量」の切り上げは 3.00001 → 4 になり得た。
 * 画面に出すお金は state/display-currency.ts の roundMoney、その中身の決まりはここ。
 */

/** 通貨 → 高貴 (Exalted) 換算レート。exalted=1、divine / chaos は poe2scout のリーグ情報、他は poe2scout の価格表 */
export interface ExaltedRates {
  /** 1 神 = ? 高貴 */
  divine: number;
  /** 1 カオス = ? 高貴 */
  chaos: number;
  /** その他通貨 (trade2 の currency id = poe2scout の ApiId) → 高貴 */
  others?: Record<string, number>;
}

/** trade2 の通貨 id の値段を高貴建てに。レートが分からない (0 や未取得) なら null */
export function toExalted(amount: number, currency: string, rates: ExaltedRates): number | null {
  if (currency === "exalted") return amount;
  const r = currency === "divine" ? rates.divine : currency === "chaos" ? rates.chaos : rates.others?.[currency];
  return r != null && r > 0 ? amount * r : null;
}

/**
 * 丸める前に寄せる幅 (通貨換算の往復で生じる誤差より大きく、実際の値段の差より小さい)。
 * 取引所の値段は高貴建てで小数 2 桁に丸めて保存されるので、神に戻すと 60 神が 59.99999 神になる
 * (オーナー報告 2026-09-20「完成品の値段がズレてる」)。2 桁の丸めの誤差は最大 0.005 高貴 ÷ 約 490 ≈ 1e-5
 */
export const ROUND_EPS = 1e-4;
/** 切り上げ (費用・払う量) */
export const ceilMoney = (v: number): number => Math.ceil(v - ROUND_EPS);
/** 切り下げ (収入) */
export const floorMoney = (v: number): number => Math.floor(v + ROUND_EPS);
