/**
 * _mod-values-entry.ts — check-mod-values.mjs が束ねるための入口 (2026-10-03)
 *
 * 点検の中身は src/services/mods/mod-values-check.ts (純粋な関数、tests/mod-values.test.ts と同じ物)。
 * ここはデータの JSON と、点検が使う正規化・単位の決まりをまとめて出すだけ。
 */
export { checkModValues, checkBundle, checkHtc, checkDropOnly, checkTierSources } from "../src/services/mods/mod-values-check";
export { scaleOf, displayValue, tierDisplayRanges, rangeLabel } from "../src/services/mods/stat-scale";
export { sourceRanges } from "../src/services/mods/tiers";
export { normalizeModTemplate, stripRichTextMarkers } from "../src/services/mods/normalize";
export { default as bundle } from "../src/i18n/mods-bundle.json";
export { default as hidden } from "../src/services/mods/stat-hidden.json";
export { default as scaleTable } from "../src/services/mods/stat-scale.json";
export { default as htc } from "../src/vendor/poe2htc/data/mods.json";
export { default as extra } from "../src/services/htc/extra-bases.json";
