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
  /** family → カタリストが見るタグ ([[quality.ts]])。同梱の MOD はこれを持っていない */
  modTags: Record<string, string[]>;
  /**
   * family → 「stat が何個の時はこの id 並び」。同梱の冒涜 / エッセンス MOD は
   * `tiers[].stats` を持っていないので、取引所の条件を組む時にここから借りる ([[buy-or-craft.ts]])。
   */
  familyStats: Record<string, Record<string, string[]>>;
  /**
   * ベース名 → そのベースでの枠。**同梱はクラス単位でしか枠を持っていない**が、実際は
   * ベースの暗黙 MOD が増減させる (「不在のアミュレット」は 2/2)。`bridge.ts` の `itemBaseFor` が使う。
   */
  baseLimits: Record<string, { prefixes: number; suffixes: number }>;
  /** ベース名 → 素性 (種別 / 日本語名 / 必要レベル / 枠 / 暗黙の効果) */
  baseInfo: Record<string, BaseInfo>;
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
let modTags: Record<string, string[]> = {};
let modSides: Record<string, "P" | "S" | "?"> = {};
let dropOnly: Record<string, { tag: string; side: "P" | "S"; name: string }> = {};
let familyStats: Record<string, Record<string, string[]>> = {};
let baseLimits: Record<string, { prefixes: number; suffixes: number }> = {};
let baseInfo: Record<string, BaseInfo> = {};

/**
 * ベース 1 つの素性。
 *
 * **暗黙の効果はベース選びそのもの**です。アミュレットなら「トリニティ」のような付与スキルが
 * 暗黙に乗っていて、何を作るかで選ぶベースが変わります。枠の増減も暗黙の 1 つ。
 */
export interface BaseInfo {
  /** エンジンのクラス (`Amulets`) */
  cls: string;
  /** ゲーム公式の日本語名 */
  ja: string;
  /** 必要レベル (DropLevel) */
  lvl: number;
  /** 枠。素の 3/3 と同じベースには入っていない */
  limits?: { prefixes: number; suffixes: number };
  /** 暗黙の効果 (無いベースには入っていない) */
  implicits?: { en: string; ja: string }[];
  /**
   * 元から乗っている付与スキル。**クラフトでは変えられない** ── ベースを選ぶ時に決める。
   * 「不在のアミュレット」は 7 種類から 1 つがランダムなので、狙いの物を買うところから。
   * `level` はパーフェクトフラックスで 20 に上げられる (確率なし・1 個で確定)。
   */
  grants?: { en: string; level?: number }[];
  /**
   * 白いベースに元から付いている防御値。**品質はここに効きます** (MOD の値ではなく)。
   *   最終 ES = (素の ES + フラット ES の MOD) × (1 + %ES の MOD 合計 + 品質 + ルーン)
   */
  defence?: { ar?: number; ev?: number; es?: number; ward?: number; ms?: number };
  /**
   * 武器の素の性能。**画面に出せる単位に直してあります** (クライアントの生値は千分率)。
   *   `aps`     … 秒あたりの攻撃回数 (1000 ÷ 生値の Speed)
   *   `critPct` … クリティカル率 % (生値 ÷ 100)
   */
  weapon?: { dmgMin?: number; dmgMax?: number; critPct?: number; aps?: number };
}

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

/** 創生の樹からしか出ない MOD 1 つ */
export interface DropOnlyInfo {
  /** どの樹から出るか (`genesis_tree_caster` など 4 系統) */
  tag: string;
  side: "P" | "S";
  /** MOD の名前 (「Eager」) */
  name: string;
  /**
   * クライアントの stat id。**取引所の条件を組むのはここからだけ**です ── この MOD は
   * エンジンに無いので、普通の経路では stat を引けません ([[tree-buy.ts]])。
   */
  stats?: string[];
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
  return { patch: data.patch, mods, bases };
}
