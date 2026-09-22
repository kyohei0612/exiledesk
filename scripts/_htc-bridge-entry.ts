/**
 * _htc-bridge-entry.ts — check-htc-bridge.mjs が束ねるための入口 (2026-09-22)
 *
 * アプリ側の patch.ts は動的 import なので、検算では同期に読める入口を別に用意する。
 * 束ねるのは esbuild なので JSON はそのまま import できる。
 */
import { indexPatch } from "../src/vendor/poe2htc/engine/indexPatch";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import mods from "../src/vendor/poe2htc/data/mods.json";
import bases from "../src/vendor/poe2htc/data/base_items.json";

export { bridgeMods, classOfBase } from "../src/services/htc/bridge";

export function loadPatchSync(): PatchData {
  return indexPatch(
    mods as unknown as Parameters<typeof indexPatch>[0],
    bases as unknown as Parameters<typeof indexPatch>[1],
  );
}
