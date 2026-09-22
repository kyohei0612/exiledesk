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
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** `build-htc-bases-from-client.mjs` の出力 */
interface ExtraBases {
  generated: string;
  source: string;
  /** 同梱の既存クラス id → 足すベース名 (クラスは同じなのでプールは変わらない) */
  addedBases: Record<string, string[]>;
  /**
   * 同梱の既存クラス id → 足すプール。今は**冒涜だけ**。
   * 通常プールは同梱に欠けが無く、逆に足すと上流の元素別の派生 (`Wands_cold` に火の MOD) が壊れる。
   */
  addedPools: Record<string, { desecrated?: { prefixes: string[]; suffixes: string[] } }>;
  /** 同梱に無いクラス (タリスマン、全属性の防具など) */
  items: ItemBase[];
  /** 上の items が指す MOD */
  mods: Mod[];
}

let cached: Promise<PatchData> | null = null;

/** 足した内訳。画面で「クライアントから補った分」を断るために使う */
export interface PatchExtras {
  generated: string;
  /** 既存クラスに足したベースの数 */
  addedBases: number;
  /** 既存クラスの冒涜プールに足した MOD の数 */
  addedDesecratedMods: number;
  /** 足したクラスの id */
  newClasses: string[];
  /** 重みを同梱から借りられず、クライアントの 1 のままにした MOD の id */
  placeholderWeightMods: string[];
}
let extras: PatchExtras | null = null;

/** 直前の `loadHtcPatch()` が何を補ったか。読み込み前は null */
export function htcPatchExtras(): PatchExtras | null {
  return extras;
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

  // 既存クラスの冒涜プールを埋める (同梱は patch 0.5.0 のままで、今リーグの分を知らない)
  let addedMods = 0;
  for (const [classId, pools] of Object.entries(extra.addedPools ?? {})) {
    const cls = bases.get(classId);
    const add = pools.desecrated;
    if (!cls || !add) continue;
    const cur = cls.pools.desecrated ?? { prefixes: [], suffixes: [] };
    const prefixes = [...new Set([...cur.prefixes, ...add.prefixes])];
    const suffixes = [...new Set([...cur.suffixes, ...add.suffixes])];
    addedMods += prefixes.length - cur.prefixes.length + (suffixes.length - cur.suffixes.length);
    bases.set(classId, { ...cls, pools: { ...cls.pools, desecrated: { prefixes, suffixes } } });
  }

  extras = {
    generated: extra.generated,
    addedBases: added,
    addedDesecratedMods: addedMods,
    newClasses: extra.items.map((i) => i.id),
    placeholderWeightMods: placeholder,
  };
  return { patch: data.patch, mods, bases };
}
