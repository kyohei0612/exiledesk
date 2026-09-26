/**
 * gem-list.ts — ジェムコラプト収支のジェム一覧と売値の 3 条件 (定数と型だけ)
 *
 * useGemCorrupt.ts から切り出し (2026-09-26)。呼ぶ側は今まで通り useGemCorrupt から取れる。
 *   ジェム一覧: i18n/gems-client.json (GGG クライアント SkillGems + BaseItemTypes + GemTags)
 */
import gemsRaw from "../../i18n/gems-client.json";
import type { SalePrices } from "./model";

export interface GemInfo {
  en: string;
  ja: string;
  kind: "skill" | "meta";
  spirit: boolean;
  minLevel: number;
  /** 原石から作れない (クライアントの CraftingLevel が 0)。元のジェムはトレードで現物を買う */
  buyOnly?: boolean;
}

export const GEMS: readonly GemInfo[] = gemsRaw as GemInfo[];

export type SaleKey = keyof SalePrices;

export interface SaleRow {
  key: SaleKey;
  label: string;
  /** 検索条件の説明 */
  condition: string;
}

export const SALE_ROWS: readonly SaleRow[] = [
  { key: "level21", label: "レベル 21 (品質 20%)", condition: "レベル 21 · 品質 20% · コラプト済 · 2 重コラプトなし" },
  { key: "quality23", label: "品質 23%", condition: "品質 23% · コラプト済 · 2 重コラプトなし (レベル不問)" },
  { key: "finished", label: "完成品 (21 · 23%)", condition: "レベル 21 · 品質 23% · 2 重コラプト済" },
];
