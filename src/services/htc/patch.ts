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

interface PoolAdd {
  prefixes: string[];
  suffixes: string[];
}

/** エンジン側のプールは readonly。重ねる時はこちらで受ける */
type ReadonlyPool = { readonly prefixes: readonly string[]; readonly suffixes: readonly string[] };

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
  addedPools: Record<string, {
    desecrated?: PoolAdd;
    /** ルーン id → そのルーンを差した時だけ出る MOD */
    rune?: Record<string, PoolAdd>;
  }>;
  /**
   * 既存クラスの family → **今の文言**。同梱の MOD 文言は patch 0.5.0 のままなので、
   * あとで行が増えた MOD が現物と突き合わない。`bridge-index.ts` がここを見て追随する。
   */
  familyTexts: Record<string, Record<string, string[]>>;
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
  /** 既存クラスの冒涜プール / ルーンプールに足した MOD の数 */
  addedPoolMods: number;
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

let familyTexts: Record<string, Record<string, string[]>> = {};

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
  extras = {
    generated: extra.generated,
    addedBases: added,
    addedPoolMods: addedMods,
    newClasses: extra.items.map((i) => i.id),
    placeholderWeightMods: placeholder,
  };
  return { patch: data.patch, mods, bases };
}
