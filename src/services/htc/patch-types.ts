/** patch.ts から切り出し (2026-09-26): 追加データ (extra-bases.json) の形と、ベースの素性・創生の樹の MOD の型 */
import type { ItemBase, Mod } from "../../vendor/poe2htc/engine/types";

export interface PoolAdd {
  prefixes: string[];
  suffixes: string[];
}

/** エンジン側のプールは readonly。重ねる時はこちらで受ける */
export type ReadonlyPool = { readonly prefixes: readonly string[]; readonly suffixes: readonly string[] };

/** `build-htc-bases-from-client.mjs` の出力 */
export interface ExtraBases {
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
  /** カタリストで底上げされるタグ (`mana` など)。**品質を外してから段を決める**のに使う */
  qualityTags?: string[];
  /** 段。**低い方から**並ぶ (エンジンの `mod.tiers` と同じ向き) */
  tiers?: DropOnlyTier[];
  /** 樹が生む指輪などの「異界の MOD」。取引所では冒涜 (desecrated.) の種類で持つ */
  domain?: "desecrated";
}

/** 創生の樹の MOD の 1 段 */
export interface DropOnlyTier {
  /** 段の名前 (「Sagacious」) */
  name: string;
  min: number;
  max: number;
  /** 必要レベル (段が出始める ilvl の目安) */
  level: number;
}
