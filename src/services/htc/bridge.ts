/**
 * bridge.ts — 上位プレイヤーの MOD を、取り込んだクラフトエンジンの MOD に繋ぐ (2026-09-22)
 *
 * オーナー指示:「今の上位 MOD の検索とかなり組み合わせれる気がする」。
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
 * 実測 2026-09-22 (上位 200 キャラ、アイテムごとに自分のベースで引く):
 *   テンプレート 86.7% / 人数で重み付け 85.2%
 *   エンジンが知っているベースに限れば 94.5% / 94.6%
 * 落ちる主因は 2 つ。(1) 同梱データが patch 0.5.0 なので新しいベース 14 種を知らない
 * (Fists of Stone など)。(2) ミニオン系と Projectile 系がプールに無い。
 */
import { normalizeModTemplate, stripRichTextMarkers } from "../mods/normalize";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** エンジンの MOD は効果ごとに改行で区切られている */
const NEWLINE = String.fromCharCode(10);

/** 突き合わせ用のキー。うちの正規化 + 小文字化 + 空白を 1 つに */
function matchKey(text: string): string {
  return normalizeModTemplate(stripRichTextMarkers(text)).toLowerCase().replace(/\s+/g, " ");
}

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

/**
 * そのクラスで狙える MOD を「文言 → MOD」で引けるようにする。
 *
 * プールは normal / desecrated / essence / rune に分かれています。**rune は外します**:
 * ルーンを差した時だけ出る MOD なので、素のベースから狙う話には入りません。
 * 同じ文言が normal と essence の両方にある時は **normal を優先**します。エッセンスは
 * 確定で乗せる別の作り方なので、狙う対象としては通常プールが素直です。
 */
interface ClassIndex {
  /** MOD 全文で引く */
  full: Map<string, Mod>;
  /** 複数の効果を持つ MOD を 1 行ずつでも引けるようにした物 */
  line: Map<string, Mod>;
}
const modIndexCache = new WeakMap<ItemBase, ClassIndex>();
function modIndexOf(data: PatchData, cls: ItemBase): ClassIndex {
  const hit = modIndexCache.get(cls);
  if (hit) return hit;
  const full = new Map<string, Mod>();
  const line = new Map<string, Mod>();
  const pools = (cls.pools ?? {}) as Record<string, unknown>;
  // normal を最後に入れて上書き勝ちにする
  for (const poolName of ["essence", "desecrated", "normal"]) {
    const pool = pools[poolName] as { prefixes?: string[]; suffixes?: string[] } | undefined;
    if (!pool) continue;
    for (const ids of [pool.prefixes, pool.suffixes]) {
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        const mod = data.mods.get(id);
        if (!mod?.text) continue;
        full.set(matchKey(mod.text), mod);
        // 効果を 2 つ以上持つ MOD (全 2917 件中 166 件) は、エンジンでは 1 件だが
        // poe.ninja は効果ごとに別の行で出す。1 行だけでも引けるようにする。
        // 例: 「回避 + ES」の複合 MOD は、ES の行だけでも引ける (指すのは複合 MOD 1 個)
        const lines = mod.text.split(NEWLINE);
        if (lines.length > 1) for (const l of lines) {
          const k = matchKey(l);
          if (k) line.set(k, mod);
        }
      }
    }
  }
  const idx = { full, line };
  modIndexCache.set(cls, idx);
  return idx;
}

/** ベース名 (「Ancestral Tiara」) からアイテムクラスを引く。知らないベースは null */
export function classOfBase(data: PatchData, baseType: string): ItemBase | null {
  return baseIndex(data).get(baseType) ?? null;
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
}

/**
 * 上位 MOD のテンプレートを、そのベースで狙える MOD に繋ぐ。
 * @param baseType 「Ancestral Tiara」のようなベース名 (poe.ninja の base_type)
 */
export function bridgeMods(data: PatchData, baseType: string, templates: readonly string[]): {
  cls: ItemBase | null;
  mods: BridgedMod[];
} {
  const cls = classOfBase(data, baseType);
  if (!cls) return { cls: null, mods: templates.map((t) => ({ template: t, mod: null, viaAlias: false, viaLine: false })) };
  const index = modIndexOf(data, cls);
  const lookup = (k: string): { mod: Mod; viaLine: boolean } | null => {
    const f = index.full.get(k);
    if (f) return { mod: f, viaLine: false };
    const l = index.line.get(k);
    return l ? { mod: l, viaLine: true } : null;
  };
  const mods = templates.map((template) => {
    const k = matchKey(template);
    const direct = lookup(k);
    if (direct) return { template, mod: direct.mod, viaAlias: false, viaLine: direct.viaLine };
    const alias = ALIAS_BY_KEY.get(k);
    const viaA = alias ? lookup(alias) : null;
    return { template, mod: viaA?.mod ?? null, viaAlias: !!viaA, viaLine: viaA?.viaLine ?? false };
  });
  return { cls, mods };
}
