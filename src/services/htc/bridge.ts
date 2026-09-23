/**
 * bridge.ts — 上位プレイヤーの MOD を、取り込んだクラフトエンジンの MOD に繋ぐ (2026-09-22)
 *
 * 上位プレイヤーMOD一覧は poe.ninja の実装備から集めた**英語のテンプレート** (`rawTemplate`、
 * 例 `+# to maximum Energy Shield`) で MOD を持っています。エンジン側は
 * `Helmets_int/LocalEnergyShield` のようなクラス込みの id で持っています。ここが橋です。
 *
 * ## 繋ぎ方
 *   1. ベース名 (`Ancestral Tiara`) → エンジンのアイテムクラス (`Helmets_int`)
 *   2. そのクラスが持つ MOD の文言 → テンプレートに正規化して引く
 *
 * 文言だけだと決まりません (「+# to maximum Mana」はアミュレットにも帯にもブーツにもある)。
 * クラスで絞って初めて 1 つになります。だから入口はベース名です。
 *
 * ## ルーンを入れるか外すかは**用途で変わる**
 * ルーンを差して初めて出る MOD があります。用途が 2 つあって、答えが逆になります。
 *   - **読む** (上位プレイヤーが何を着けているか) … 入れる。上位はルーンを差すので、外すと読めない
 *   - **狙う** (素のベースから作る) … 外す。ルーンを差さない限り出ないので、素の確率に混ぜてはいけない
 * 既定は「読む」(`runes: "include"`)。狙う側は明示的に `"exclude"` を渡してください。
 *
 * 実測 2026-09-22 (上位 200 キャラ、アイテムごとに自分のベースで引く。`check-htc-bridge.mjs`):
 *   クライアント由来のベース追加前 86.7% → 追加後 90.3% → ルーンと文言の追随を入れて
 *   **テンプレート 91.8% / 人数 90.4%** (エンジンが知っているベースに限った数字)。
 *
 * 残っているのは主に手袋の `Gloves_dex_int` で、`+#% to Quality of all Skills` や
 * `Attacks Gain #% of Damage as Extra <元素> Damage` が引けません。同梱の spawn_weights が
 * `default: 0` で、そのクラスで出ない扱いになっているためです (上流のデータが古い)。
 */
import { modIndexOf, matchKey, type IndexHit, type RuneMode } from "./bridge-index";
import { htcBaseLimits } from "./patch";
import { DEFAULT_LIMITS } from "../../vendor/poe2htc/engine/item";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";

export type { RuneMode } from "./bridge-index";

/**
 * 上流と ExileDesk で言い回しが違う MOD の対応表 (2026-09-22 の実測で出た分)。
 * 左 = うちのテンプレート / 右 = エンジン側のテンプレート。どちらも正規化前の書き方で置く。
 */
const ALIASES: ReadonlyArray<readonly [string, string]> = [
  // 手袋の「Attacks Gain」はエンジン側では「Gain」
  ["Attacks Gain #% of Damage as Extra Fire Damage", "Gain #% of Damage as Extra Fire Damage"],
  ["Attacks Gain #% of Damage as Extra Cold Damage", "Gain #% of Damage as Extra Cold Damage"],
  ["Attacks Gain #% of Damage as Extra Lightning Damage", "Gain #% of Damage as Extra Lightning Damage"],
  ["Attacks Gain #% of Damage as Extra Physical Damage", "Gain #% of Damage as Extra Physical Damage"],
  // 呪文限定の言い回しが落ちている
  ["#% increased Mana Cost Efficiency of Spells", "#% increased Mana Cost Efficiency"],
];
const ALIAS_BY_KEY = new Map(ALIASES.map(([ours, theirs]) => [matchKey(ours), matchKey(theirs)]));

/** ベース名 → アイテムクラス。索引は 1 度だけ作る */
const baseIndexCache = new WeakMap<PatchData, Map<string, ItemBase>>();
function baseIndex(data: PatchData): Map<string, ItemBase> {
  let m = baseIndexCache.get(data);
  if (!m) {
    m = new Map<string, ItemBase>();
    for (const cls of data.bases.values()) for (const name of cls.bases ?? []) m.set(name, cls);
    baseIndexCache.set(data, m);
  }
  return m;
}

/** ベース名 (「Ancestral Tiara」) からアイテムクラスを引く。知らないベースは null */
export function classOfBase(data: PatchData, baseType: string): ItemBase | null {
  return baseIndex(data).get(baseType) ?? null;
}

/**
 * **解く時に渡すベース。**`classOfBase` と違い、そのベース固有の**枠**を織り込みます。
 *
 * 同梱エンジンは枠をクラス単位でしか持っていませんが、実際は**ベースの暗黙 MOD が枠を増減させます**。
 * 「不在のアミュレット」は -1 プレフィックス / -1 サフィックスで **2/2** ── 4 MOD で満杯です。
 * アミュレットだけで 9 種類あり +2/-2 まで振れるので、ここを見ないと解が丸ごと変わります。
 *
 * **ソルバに渡すのは必ずこちら**にしてください。`classOfBase` は MOD を引くための物です。
 */
export function itemBaseFor(data: PatchData, baseType: string): ItemBase | null {
  const cls = classOfBase(data, baseType);
  if (!cls) return null;
  const lim = htcBaseLimits()[baseType];
  if (!lim) return cls;
  const base = cls.limits ?? DEFAULT_LIMITS;
  return { ...cls, limits: { ...base, prefixes: lim.prefixes, suffixes: lim.suffixes } };
}

/** ベースの枠を側ごとに (固定済みを引く前)。ベースが分からなければ 3 / 3 */
export function sideLimits(data: PatchData, baseType: string | null | undefined): { prefix: number; suffix: number } {
  const lim = (baseType ? itemBaseFor(data, baseType)?.limits : null) ?? DEFAULT_LIMITS;
  return { prefix: lim.prefixes, suffix: lim.suffixes };
}

/** 1 件の橋渡しの結果 */
export interface BridgedMod {
  /** うちのテンプレート (そのまま) */
  template: string;
  /** エンジン側の MOD。繋がらなければ null */
  mod: Mod | null;
  /** 別名表を通したか (通した物は文言が違うので、画面で断る時に使う) */
  viaAlias: boolean;
  /**
   * 効果を 2 つ以上持つ MOD の 1 行として引いたか。
   * true の時、狙うと**同じ MOD の他の効果も一緒に乗ります** (回避 + ES の複合 MOD など)。
   */
  viaLine: boolean;
  /**
   * ルーンを差して初めて出る MOD なら、そのルーンの id。
   * **素のベースからは出ません。**画面では「このルーンが要る」と断ること。
   */
  viaRune?: string;
}

const EMPTY: Omit<BridgedMod, "template"> = { mod: null, viaAlias: false, viaLine: false };

/**
 * 上位 MOD のテンプレートを、そのベースで出る MOD に繋ぐ。
 * @param baseType 「Ancestral Tiara」のようなベース名 (poe.ninja の base_type)
 * @param runes ルーン由来の MOD を含めるか。既定は「読む」用途の `"include"`
 */
export function bridgeMods(
  data: PatchData,
  baseType: string,
  templates: readonly string[],
  runes: RuneMode = "include",
): { cls: ItemBase | null; mods: BridgedMod[] } {
  const cls = classOfBase(data, baseType);
  if (!cls) return { cls: null, mods: templates.map((t) => ({ template: t, ...EMPTY })) };
  const index = modIndexOf(data, cls, runes);

  const lookup = (k: string): { hit: IndexHit; viaLine: boolean } | null => {
    const f = index.full.get(k);
    if (f) return { hit: f, viaLine: false };
    const l = index.line.get(k);
    return l ? { hit: l, viaLine: true } : null;
  };

  const mods = templates.map((template): BridgedMod => {
    const k = matchKey(template);
    const direct = lookup(k);
    if (direct) {
      return { template, mod: direct.hit.mod, viaAlias: false, viaLine: direct.viaLine, viaRune: direct.hit.rune };
    }
    const alias = ALIAS_BY_KEY.get(k);
    const viaA = alias ? lookup(alias) : null;
    if (!viaA) return { template, ...EMPTY };
    return { template, mod: viaA.hit.mod, viaAlias: true, viaLine: viaA.viaLine, viaRune: viaA.hit.rune };
  });
  return { cls, mods };
}


/**
 * **解く時に渡すベース (枠を引いた版)。**
 *
 * `itemBaseFor` はそのベース固有の枠を返しますが、**乗ることが決まっている物の分は引いていません**。
 * クラフトでは付かない MOD (ブリーチの樹の指輪など) も枠は使うので、引かずに解くと
 * 「まだ空いている」と思い込んで、実際には入らない構成を「作れます」と言います。
 *
 * 実例 2026-09-23 (ニーモニックリング): ブリーチの「スペルのマナコスト効率」がプレフィックスを
 * 1 つ使っているので、作れるプレフィックスは **3 ではなく 2**。
 *
 * `either` は側が決まらなかった分です。**両側から引きます** ── どちらに入るか分からない以上、
 * 入らない構成を「作れる」と言うより、作れる構成を「作れない」と言うほうが安全だからです。
 */
export function baseForSolving(
  data: PatchData,
  baseType: string,
  used: { prefixes: number; suffixes: number; either: number },
): ItemBase | null {
  const cls = itemBaseFor(data, baseType);
  if (!cls) return null;
  const lim = cls.limits ?? DEFAULT_LIMITS;
  const p = Math.max(0, lim.prefixes - used.prefixes - used.either);
  const s = Math.max(0, lim.suffixes - used.suffixes - used.either);
  if (p === lim.prefixes && s === lim.suffixes) return cls;
  return { ...cls, limits: { ...lim, prefixes: p, suffixes: s } };
}
