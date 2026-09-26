/**
 * patch.ts — 取り込んだクラフトエンジンにデータを渡す (2026-09-22)
 *
 * エンジン本体 (src/vendor/poe2htc) は純粋な計算だけで、読み込みは持っていません
 * (node:fs を使う loader は取り込み時に外しました)。ここが唯一の入口です。
 *
 * MOD 表は 4 MB あるので**動的 import** にしてあります。クラフト計算の画面を開くまで
 * 落ちてこないので、起動と他の画面には効きません。
 *
 * 同梱データは patch 0.5.0 (2026-07-04 生成) なので、今リーグのベースを知りません。
 * `extra-bases.json` (クライアントから生成、`scripts/build-htc-bases-from-client.mjs`) を
 * ここで重ねて埋めます。上流の `data/` は触りません。
 */
import { indexPatch } from "../../vendor/poe2htc/engine/indexPatch";
import { applyWeightOverrides } from "./weight-overrides";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
// 型は 2026-09-26 に patch-types.ts へ分けた
import type { BaseInfo, DropOnlyInfo, ExtraBases, PatchExtras, PoolAdd, ReadonlyPool } from "./patch-types";
export type { BaseInfo, DropOnlyInfo, DropOnlyTier, PatchExtras } from "./patch-types";

let cached: Promise<PatchData> | null = null;

let extras: PatchExtras | null = null;

/** 直前の `loadHtcPatch()` が何を補ったか。読み込み前は null */
export function htcPatchExtras(): PatchExtras | null {
  return extras;
}

let familyTexts: Record<string, Record<string, string[]>> = {};
let modTags: Record<string, string[]> = {};
let modSides: Record<string, "P" | "S" | "?"> = {};
let dropOnly: Record<string, { tag: string; side: "P" | "S"; name: string }> = {};
let familyStats: Record<string, Record<string, string[]>> = {};
let baseLimits: Record<string, { prefixes: number; suffixes: number }> = {};
let baseInfo: Record<string, BaseInfo> = {};

/** ベース名 → 素性。知らないベースは undefined */
export function htcBaseInfo(): Record<string, BaseInfo> {
  return baseInfo;
}

/** ベース名 → 枠。素と同じベースは入っていない */
export function htcBaseLimits(): Record<string, { prefixes: number; suffixes: number }> {
  return baseLimits;
}

/** family → 個数ごとの stat id 並び。stat を持たない MOD に貸す */
export function htcFamilyStats(): Record<string, Record<string, string[]>> {
  return familyStats;
}

/** family → カタリストが見るタグ。`quality.ts` が「この MOD は底上げされるか」に使う */
export function htcModTags(): Record<string, string[]> {
  return modTags;
}

/**
 * 文面 (正規化済み) → どちら側の枠に入るか。
 *
 * **エンジンが知らない MOD でも引けます。**クラフトでは付かない MOD (ブリーチの樹の指輪など)
 * も枠は使うので、これが無いと「まだ空いている」と思い込んで、実際には入らない構成を
 * 「作れます」と言ってしまいます。両側に同じ文面がある物は `?`。
 */
export function htcModSides(): Record<string, "P" | "S" | "?"> {
  return modSides;
}

/**
 * 文面 (正規化済み) → 創生の樹 (ブリーチ) からしか出ない MOD の情報。
 *
 * **クラフトでは付きません。**狙いに入っていたら「買うしかない」と**理由つきで**断れます。
 * `tag` は 4 系統 (`genesis_tree_caster` / `genesis_tree_minion` / `breach_desecration` /
 * `tower_augment_breach`)。通常プールでも出る物は入っていません。
 */
export function htcDropOnly(): Record<string, DropOnlyInfo> {
  return dropOnly;
}

/**
 * クラス id → family → 今の文言。`bridge-index.ts` が同梱の古い文言を補うのに使う。
 *
 * ここに置いてあるのは **`extra-bases.json` を静的 import しないため**です。patch.ts の
 * 動的 import 1 か所だけが読み、他はこの関数越しに受け取る。そうしないと 192 KB が
 * 起動時のバンドルに入ります。
 */
export function htcFamilyTexts(): Record<string, Record<string, string[]>> {
  return familyTexts;
}

/**
 * MOD 表とベース表を読んで索引を作る (1 回だけ。2 回目からは同じ物を返す)。
 * 取り込んだ版は patch 0.5.0 + クライアント由来の追加分。
 */
export function loadHtcPatch(): Promise<PatchData> {
  if (!cached) {
    cached = (async () => {
      const [mods, bases, extraRaw] = await Promise.all([
        import("../../vendor/poe2htc/data/mods.json"),
        import("../../vendor/poe2htc/data/base_items.json"),
        import("./extra-bases.json"),
      ]);
      // JSON は上流の ModsFile / BasesFile の形。indexPatch がそのまま受ける
      const data = indexPatch(
        (mods.default ?? mods) as unknown as Parameters<typeof indexPatch>[0],
        (bases.default ?? bases) as unknown as Parameters<typeof indexPatch>[1],
      );
      const extra = (extraRaw.default ?? extraRaw) as unknown as ExtraBases;
      return applyExtras(data, extra);
    })();
  }
  return cached;
}

/**
 * 追加分を PatchData に重ねる。同梱側の id とぶつかった時は**同梱を残す** (上流が正)。
 * 検算 (`scripts/_htc-bridge-entry.ts`) も同じ関数を通す。重ね方を 2 か所に書かないため。
 */
export function applyExtras(data: PatchData, extra: ExtraBases): PatchData {
  const mods = new Map(data.mods);
  const bases = new Map(data.bases);
  const placeholder: string[] = [];

  for (const m of extra.mods) {
    if (mods.has(m.id)) continue;
    mods.set(m.id, m);
    if ((m as { weightSource?: string }).weightSource === "client-placeholder") placeholder.push(m.id);
  }
  for (const it of extra.items) {
    if (bases.has(it.id)) continue;
    bases.set(it.id, it);
  }

  // 既存クラスへのベース追加。クラスが同じならプールは同じなので、名前を足すだけでよい
  let added = 0;
  for (const [classId, names] of Object.entries(extra.addedBases ?? {})) {
    const cls = bases.get(classId);
    if (!cls) continue;
    const merged = new Set([...(cls.bases ?? []), ...names]);
    if (merged.size === (cls.bases ?? []).length) continue;
    added += merged.size - (cls.bases ?? []).length;
    bases.set(classId, { ...cls, bases: [...merged].sort() });
  }

  // 既存クラスの冒涜プールとルーンプールを埋める (同梱は patch 0.5.0 のままで、今リーグの分を知らない)
  let addedMods = 0;
  const merge = (cur: ReadonlyPool | undefined, add: PoolAdd): PoolAdd => {
    const base = cur ?? { prefixes: [], suffixes: [] };
    const prefixes = [...new Set([...base.prefixes, ...add.prefixes])];
    const suffixes = [...new Set([...base.suffixes, ...add.suffixes])];
    addedMods += prefixes.length - base.prefixes.length + (suffixes.length - base.suffixes.length);
    return { prefixes, suffixes };
  };
  for (const [classId, add] of Object.entries(extra.addedPools ?? {})) {
    const cls = bases.get(classId);
    if (!cls) continue;
    const pools = { ...cls.pools };
    if (add.desecrated) pools.desecrated = merge(cls.pools.desecrated, add.desecrated);
    if (add.rune) {
      const rune: Record<string, ReadonlyPool> = { ...(cls.pools.rune ?? {}) };
      for (const [runeId, p] of Object.entries(add.rune)) rune[runeId] = merge(rune[runeId], p);
      pools.rune = rune;
    }
    bases.set(classId, { ...cls, pools });
  }

  familyTexts = extra.familyTexts ?? {};
  modTags = extra.modTags ?? {};
  modSides = (extra as { modSides?: Record<string, "P" | "S" | "?"> }).modSides ?? {};
  dropOnly = (extra as { dropOnly?: typeof dropOnly }).dropOnly ?? {};
  familyStats = extra.familyStats ?? {};
  baseLimits = extra.baseLimits ?? {};
  baseInfo = extra.baseInfo ?? {};
  extras = {
    generated: extra.generated,
    addedBases: added,
    addedPoolMods: addedMods,
    newClasses: extra.items.map((i) => i.id),
    placeholderWeightMods: placeholder,
  };
  fillJewelleryTags(mods);
  // 重みが仮置きの 1 のままの MOD を埋める (キャストスピードなど)。**ここで掛けるのは、アプリと検算が
  // 同じ applyExtras を通るから**。別の場所で掛けると片方だけ直ることになる ([[weight-overrides.ts]])
  return applyWeightOverrides({ patch: data.patch, mods, bases }).data;
}

/**
 * 指輪・首飾りの**エッセンス / 冒涜の MOD にタグを付ける** (2026-09-23)。
 *
 * カタリストと装飾品の品質は MOD のタグで効く相手が決まる ([[quality.ts]])。同梱の普通 MOD は
 * 自分のタグを正しく持っているが、エッセンスと冒涜の MOD は空 (上流の穴)。以前は family ごとの表で
 * 補っていたが、family には別物 (アビス MOD・ライフとマナの複合・別部位の MOD) が同居していて
 * タグが混ざった (キャスピに `mana`、最大ライフに `mana` など)。
 *
 * 補い方: **同じクラスの同じ family の普通 MOD のタグ**を借りる。普通 MOD が無い時だけ family の表。
 */
function fillJewelleryTags(mods: Map<string, Mod>): void {
  const normalTags = new Map<string, readonly string[]>();
  for (const m of mods.values()) {
    const cls = m.id.split("/")[0];
    if ((cls === "Rings" || cls === "Amulets") && m.source === "normal") normalTags.set(`${cls}|${m.family}`, m.tags ?? []);
  }
  for (const [id, m] of mods) {
    const cls = id.split("/")[0];
    if ((cls !== "Rings" && cls !== "Amulets") || m.source === "normal" || (m.tags ?? []).length) continue;
    const tags = normalTags.get(`${cls}|${m.family}`) ?? modTags[m.family] ?? [];
    if (tags.length) mods.set(id, { ...m, tags: [...tags] });
  }
}
