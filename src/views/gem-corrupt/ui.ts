/**
 * ui.ts — ジェムコラプトの画面で使う小物 (2026-09-19 に GemCorrupt.vue 1033 行から切り出し)
 *
 * 画面を 6 つに割ったので、どの札からも使う短い書式と定数をここに集める。
 */
import { displayCurrency } from "../../state/display-currency";

/** 表示通貨で書く (符号付きにもできる) */
export const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });

/**
 * 費用は切り上げ / 収入は切り下げで書く (オーナー指示 2026-09-20:
 * 「基本経費は多く、収入は厳しくのスタンス」)。1 未満は 1 つ下の通貨に落としてから丸める。
 */
export const cost = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed, round: "up" });
export const income = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed, round: "down" });
/** 今の表示通貨の名前 (神 / カオス / 高貴) */
export const unit = displayCurrency.label;

/**
 * 合計用の書式。**選んだ表示通貨で固定**して出す (1 未満でも 1 つ下の通貨に落とさない)。
 * オーナー指示 2026-09-20:「素材の行は取引所の 神 / カオス で見るけど、最終の合計だけは指定カレンシーで」。
 */
export const moneyFixed = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed, fixed: true });

/** 確率を % で (10% 未満は小数 1 桁) */
export function pct(p: number): string {
  return `${(p * 100).toFixed(p * 100 >= 10 ? 0 : 1)}%`;
}

/** 損益の色 (プラス = 緑 / マイナス = 赤 / 不明 = 灰) */
export function evClass(v: number | null): string {
  if (v == null) return "text-[var(--exile-color-text-tertiary)]";
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-red-300" : "";
}

/** 取引所の単価 (桁に合わせて小数を減らす) */
export const fmtBuy = (n: number): string => (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(3));

/** 取得時刻 (ミリ秒) を 09/19 22:04 の形に */
export const fmtStamp = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 「N 回やった場合」の N (5 刻み)。アドニアと同じ (オーナー指示 2026-09-13) */
/**
 * 回数のプルダウン。5 ずつ 100 まで (オーナー指示 2026-09-20:
 * 「回数は 5 ずつプルダウンに出して 100 まで出せるように」)。
 * 一覧に無い数 (収支で手入力した 37 や 120) は AttemptsSelect が足して出す。
 */
export const ATTEMPT_OPTIONS = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);

/** 素材の説明 (GGG クライアント CurrencyItems.Description の日本語、2026-09-12 書き出し) */
export const MATERIAL_DESC: Record<string, string> = {
  gcp: "スキルジェムの品質を向上させる。",
  perfectJeweller: "スキルジェムに5個のサポートジェムソケットをセットする。",
  vaal: "アイテムをコラプトし、予測不能な変化を与える。",
  crystal: "コラプト状態のスキルジェムを予測不可能に変化させるか、または破壊する。",
  uncut20: "ジェムを生成するか既存のジェムのレベルをレベル20に上げる",
  baseGem: "そのジェムを作る原石。レベル 15〜20 のうち一番安い物を使う",
};
