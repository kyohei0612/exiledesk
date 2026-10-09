/**
 * essence-key-table.ts — エッセンスの鍵 (どのエッセンスでどの MOD が付くか) の表 (2026-10-09)
 *
 * essence-keys.json (クライアント由来、scripts/build-htc-essence-prices-from-client.mjs) に、poe2db に合わせて写した MOD の鍵
 * (poe2db-pool-fixes.json の essenceKeys、scripts/build-poe2db-fixes.mjs) を足した物。鍵を読む所は全部ここから読む
 * (タリスマン・全能力値の鎧のエッセンスや盾の強化のエッセンスは写した MOD なので、json だけ読むと打てない)
 */
import essenceKeys from "./essence-keys.json";
import poolFixes from "./poe2db-pool-fixes.json";

export type EssenceName = { en: string; ja: string };
export const ESSENCE_KEYS: Readonly<Record<string, EssenceName>> = {
  ...(essenceKeys as unknown as { keys: Record<string, EssenceName> }).keys,
  ...((poolFixes as unknown as { essenceKeys?: Record<string, EssenceName> }).essenceKeys ?? {}),
};
