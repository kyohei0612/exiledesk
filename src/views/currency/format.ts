/**
 * カレンシーランキング画面の表示ヘルパー (数値・時刻・スパークライン・カテゴリ順・効果辞書)
 *
 * CurrencyRanking.vue から切り出し (2026-09-07)。
 */
import type { RankedItem } from "../../api/poe2scout";
import currencyEffectsJa from "../../i18n/currency-effects-ja.json";

// ---------------------------------------------------------------------------
// アイテム効果説明 (日本語, クライアントデータ + poe2db 由来)
// キーは EN 名を正規化 (小文字英数のみ) したもの。e=効果行, s=スタック数, lv=装備条件 (レベル)。
// ---------------------------------------------------------------------------
export interface ItemEffect {
  e: string[];
  s?: string;
  lv?: string;
}
const effectsMap = currencyEffectsJa as Record<string, ItemEffect>;
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function effectFor(p: RankedItem): ItemEffect | null {
  return effectsMap[normName(p.text)] ?? null;
}

// ---------------------------------------------------------------------------
// 数値表示
//  - >=1億: "X.X億" / >=1万: "X.X万" / >=1000: "1,234" (漢字 "千" は使わない、オーナー指示 2026-05-22)
//  - >=1: "X.X" / 小数: 0.1/0.01 帯は桁を潰さない / 0.0001 未満は "<0.0001" 固定
// ---------------------------------------------------------------------------
const numFormat1k = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
export function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return (n / 100_000_000).toFixed(1) + "億";
  if (abs >= 10_000) return (n / 10_000).toFixed(1) + "万";
  if (abs >= 1_000) return numFormat1k.format(n);
  if (abs >= 1) return n.toFixed(1);
  if (abs >= 0.1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(3);
  if (abs >= 0.0001) return n.toFixed(4);
  return "<0.0001";
}

export function formatTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** poe2scout の相場スナップショット実時刻 (Epoch 秒) を「MM/DD HH:MM」で表示。鮮度の可視化。 */
export function formatEpoch(epoch: number | null): string {
  if (!epoch) return "—";
  return new Date(epoch * 1000).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// トレンド (スパークライン + 変化率)
// ---------------------------------------------------------------------------
/** spark 配列を SVG polyline の points 文字列に変換 (古→新, 左→右)。 */
export function sparkPoints(vals: number[], w = 72, h = 20): string {
  if (vals.length < 2) return "";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 1.5; // 線幅ぶん上下に余白
  return vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** 変化率の表示文字列 (+12.3% / −4.5% / 0%)。 */
export function fmtPct(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.05) return "0%";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// カテゴリ表示順 (オーナー指示 2026-06-03): 件数依存だと毎リーグ並びが変わるので固定順にする。
// POE2 公式トレードの並びを参考に「カレンシー → 強化系 → リーグ機構 → ジェム/アイドル系」。
// 未掲載カテゴリはこの後ろに ID 昇順で続ける。
// ---------------------------------------------------------------------------
const CATEGORY_ORDER: string[] = [
  "currency",
  "essences",
  "essence",
  "delirium",
  "breach",
  "abyss",
  "sanctum",
  "fragments",
  "fragment",
  "runes",
  "rune",
  "ritual",
  "soulcore",
  "expedition",
  "ultimatum",
  "incursion",
  "idol",
  "uncutgems",
  "lineagesupportgems",
  "verisium",
  "vaultkeys",
  "vaal",
];
export function categoryOrderIndex(id: string): number {
  const i = CATEGORY_ORDER.indexOf(id);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
