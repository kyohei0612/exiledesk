import { exchangeGroupOrder } from "../../i18n/currency-exchange";
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
//  - >=1億: "X.X億" / >=1万: "X.X万" / >=100: "1,234" の整数 (漢字 "千" は使わない、オーナー指示 2026-05-22)
//  - >=1: "X.X" / 小数: 0.1/0.01 帯は桁を潰さない / 0.0001 未満は "<0.0001" 固定
//  - 2026-09-26 オーナー「表示がぶれる、統一させて」: 1,000 以上だけ小数 1 桁が付くことがあり (4,303.2 と 1,066 が並ぶ)、
//    100 以上は整数に揃えた
// ---------------------------------------------------------------------------
const numFormat1k = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return (n / 100_000_000).toFixed(1) + "億";
  if (abs >= 10_000) return (n / 10_000).toFixed(1) + "万";
  if (abs >= 100) return numFormat1k.format(n);
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
/**
 * なだらかな折れ線の path (2026-10-09 オーナー「チカチカして見づらい」: 細かいギザギザが全部の行に並んでうるさかった)。
 * 点が多い時は前後 1 つずつで均してから、点を通る曲線 (Catmull-Rom → 3 次ベジェ) でつなぐ。上下は線幅ぶん余白を空ける
 */
export function sparkPath(vals: number[], w = 72, h = 20): string {
  if (vals.length < 2) return "";
  const v = vals.length > 8 ? vals.map((_, i) => { const a = vals.slice(Math.max(0, i - 1), i + 2); return a.reduce((x, y) => x + y, 0) / a.length; }) : vals;
  const min = Math.min(...v), range = Math.max(...v) - min || 1, pad = 1.5;
  const p = v.map((y, i) => [(i / (v.length - 1)) * w, h - pad - ((y - min) / range) * (h - pad * 2)] as const);
  const f = (n: number): string => n.toFixed(1);
  let d = `M${f(p[0]![0])},${f(p[0]![1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]!, p1 = p[i]!, p2 = p[i + 1]!, p3 = p[Math.min(p.length - 1, i + 2)]!;
    // 曲がりすぎて枠からはみ出さないよう、控えの点は上下の端で止める
    const cy = (y: number): number => Math.min(h - pad, Math.max(pad, y));
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(cy(p1[1] + (p2[1] - p0[1]) / 6))} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(cy(p2[1] - (p3[1] - p1[1]) / 6))} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** 変化率の表示文字列 (+12.3% / −4.5% / 0%)。 */
/**
 * 変化率 (%) を倍率で出す (オーナー 2026-09-26「% より倍数のがイイかもね、1.2 倍とか」。「+38047%」が枠からはみ出してもいた)。
 * +16% → 1.16倍、−29% → 0.71倍、+38047% → 381倍。10 倍未満は小数 2 桁、100 倍未満は 1 桁、それ以上は整数
 */
export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const r = Math.max(0, 1 + n / 100);
  if (r < 10) return `${r.toFixed(2)}倍`;
  if (r < 100) return `${r.toFixed(1)}倍`;
  return `${Math.round(r).toLocaleString("en-US")}倍`;
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
  // 2026-09-09: ゲーム内取引所の 14 分類 (`x:…`) をゲームと同じ順で先頭に、取引所に無い poe2scout カテゴリを後ろに
  const ex = exchangeGroupOrder(id);
  if (ex >= 0) return ex;
  const i = CATEGORY_ORDER.indexOf(id);
  return 1000 + (i === -1 ? CATEGORY_ORDER.length : i);
}
