/**
 * ジェム情報 (スピリット / メタ判定) の表
 *
 * finalize.ts から切り出し (2026-09-26)。
 */
import gemsClientRaw from "../../../i18n/gems-client.json";

/** 英名 → ジェム情報 (スピリット / メタ判定)。gems-client.json (GGG クライアント由来) */
export const GEM_INFO: Map<string, { spirit: boolean; meta: boolean }> = (() => {
  const m = new Map<string, { spirit: boolean; meta: boolean }>();
  for (const g of gemsClientRaw as { en: string; kind: string; spirit: boolean }[]) m.set(g.en, { spirit: !!g.spirit, meta: g.kind === "meta" });
  return m;
})();
export const isMetaGem = (nameEn: string): boolean => GEM_INFO.get(nameEn)?.meta === true;
