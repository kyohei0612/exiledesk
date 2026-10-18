/**
 * _audit-poe2db-tags-entry.ts — audit-poe2db-tags.mjs が束ねる入口 (2026-10-18)。画面に出すタグ (shownTags) で比べるため mod-list も入れる
 */
export { loadPatchSync } from "./_htc-bridge-entry";
export { jaOfMod } from "../src/services/htc/mod-text";
export { shownTags } from "../src/services/craft-stage/mod-list";
