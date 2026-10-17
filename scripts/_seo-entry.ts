/**
 * _seo-entry.ts — build-seo-pages.mjs が束ねる入口 (2026-10-13)。ベースの読み物のページを、アプリと同じエンジン・同じ部品で作るため
 * (MOD の一覧・素の数値・暗黙は画面と同じ関数。別に書き写さない)
 */
export { loadPatchSync } from "./_htc-bridge-entry";
export { baseCatalog, classJa, classEn, CATALOG_ROWS, CATALOG_ROW_EN } from "../src/services/items/base-catalog";
export { setLang } from "../src/i18n/lang";
export { modListFor } from "../src/services/craft-stage/mod-list";
export { freshItem } from "../src/services/craft-stage/run-plan";
export { propRows, implicitRows } from "../src/services/craft-stage/stage-props";
export { htcBaseInfo } from "../src/services/htc/patch";
export { tagLabel } from "../src/services/mods/tag-ja";
