/**
 * スキルジェム / リネージュサポートのホバーの中身 (2026-09-26)
 *
 * src/i18n/gem-hover-ja.json (scripts/build-gem-hover-ja.mjs、クライアントの ActiveSkills / GemEffects / GrantedEffects…) を引く。
 * オーナー:「スキルジェム関連にも同じように名前の下に下線で詳細カード」「リネージュサポはゲーム内表記くらい詳しく」。
 * 使う時に読み込む。
 */
import { shallowRef } from "vue";

/** 1 レベル分 (本体・付随するスキル・別の型で同じ形) */
export interface GemLevelStats {
  /** 必要なキャラのレベル */
  req?: number;
  /** コスト (「8 マナ」) */
  cost?: string;
  /** コスト倍率 (%) */
  mult?: number;
  /** クールダウン (秒) と使える回数 */
  cd?: number;
  uses?: number;
  /** リザーブ (「30 スピリット」) */
  res?: string;
  /** キャストタイム (秒) */
  cast?: number;
  /** アタックタイム (秒) / アタックスピード (基本の %) / アタックダメージ (基本の %) */
  atk?: number;
  as?: number;
  dmg?: number;
  /** クリティカルヒット率 (%) */
  crit?: number;
  /** 表の行 (「項目: 値」) */
  tb?: string[];
  stats?: string[];
}

export interface GemLevelInfo extends GemLevelStats {
  /** ジェムのレベル */
  g: number;
  /** 別の型 (スパークの「コールドインフューズ」など) */
  sets?: Array<GemLevelStats & { l: string }>;
}

export interface GemHover {
  /** 日本語名 */
  n: string;
  /** 説明 ([Tag|表示] の印つき) */
  d: string;
  k: "skill" | "meta" | "support";
  /** スピリットジェム */
  s?: boolean;
  lineage?: boolean;
  /** 必要レベル (最低) */
  lv?: number;
  tags?: string[];
  req?: { lv?: number; str?: number; dex?: number; int?: number };
  /** フレーバーテキスト */
  fl?: string;
  /** レベルごと (1 / 20 / 21 など) */
  at?: GemLevelInfo[];
  /** 品質の効果 */
  q?: string[];
  /** 追加の品質の効果 (GrantedEffectQualityStats の AltStats)。オーナー 2026-09-26「品質と追加品質は分けて」 */
  q2?: string[];
  /** それぞれの見出し (ゲームの文言が取れた時) */
  qh?: string;
  q2h?: string;
  /** 品質の数値を何 % の時で出しているか */
  qq?: number;
  /** 付随するスキル (フォティファイイングクライの「シールドウェーブ」など) */
  sub?: Array<{ n: string; d?: string; at?: GemLevelInfo[] }>;
}

const dict = shallowRef<Record<string, GemHover> | null>(null);
let lower: Map<string, GemHover> | null = null;
let loading: Promise<void> | null = null;

export function loadGemHover(): Promise<void> {
  loading ??= import("../i18n/gem-hover-ja.json").then((m) => {
    dict.value = (m.default ?? m) as unknown as Record<string, GemHover>;
    lower = new Map(Object.entries(dict.value).map(([k, v]) => [k.toLowerCase(), v]));
  });
  return loading;
}

/** 英語名から引く (大文字小文字は問わない)。読み込み前・無い物は null */
export function gemHoverOf(en: string): GemHover | null {
  const d = dict.value;
  if (!d) return null;
  return d[en] ?? lower?.get(en.toLowerCase()) ?? null;
}
