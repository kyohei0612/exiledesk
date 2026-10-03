/**
 * apply-extra.ts — 今の相場にあるのにクラフトステージの棚に無かった物 (2026-09-29 オーナー「全部足して」)
 *
 * 効き目はクライアントの説明文 (src/i18n/currency-hover-ja.json)。**確率が公開されていない物は仮の値**で、*_CONFIRMED = false。
 * 動画の手順では、確率で分かれる物は手の outcome で結果を指定できる (可能性のオーブと同じ)。
 *   - ヴァールのインフューザー 4 種: 品質を上げる。上限を最大 10% 超えられるが、一定確率でコラプトする
 *   - 生贄のオーブ 3 種 (カマサ / コペック / ヤオマック): レアのコラプトエンチャントを上げ (CorruptionUpgrade…、vaal-upgrades.json)、ランダムな MOD を 1 つ消す
 *   - アーキテクトオーブ: コラプトした装備を予測できない形で変えるか、壊す
 *   - ヴァール培養のオーブ: コラプトしたユニークを、同じ種類の別のユニークに変える (ヴァールユニークの「MOD を 2 つ置き換える」は MOD の表が無いので扱わない)
 *   - ヴァールサイフォナー: コラプトしたレアの宝飾品にキル閾値を付ける (数値は非公開、付いたことだけ)
 *   - カランドラの鏡: ミラー化した写し (以後何も打てない)
 *   - ヒネコラの髪束: 次に打つ手の結果を予見できる (アイテムが変わると消える)
 *   - 抽出のオーブ: 装備を壊して、差してあるオーグメントを取り戻す
 * 噛み切られた骨 (アイテムレベル 64 以下) は apply-desecrate、秘術師の彫刻針は apply-act の品質。
 */
import type { StageApply, StageItem, StageMod } from "./types";
import { allMods, maxQualityOf, skip, without } from "./stage-core";
import { ARMOUR, CASTER, MARTIAL, QUALITY_MAX, QUALITY_STEP } from "./apply-act";
import { ENCHANTS, rollEnchantValues, rollText } from "./apply-vaal";
import { uniquesOfSameClass } from "./stage-bases";
import upgradesRaw from "./vaal-upgrades.json";

const UPGRADES = upgradesRaw as Record<string, { id: string; en: string; ja: string; stats: Array<{ id: string; min: number; max: number }> }>;
const JEWELLERY = ["Rings", "Amulets", "Belts"];
const WEAPONS = [...MARTIAL, ...CASTER, "Quivers"];

export const EXTRA_KEYS = [
  "vaal_infuser_jewellery", "vaal_infuser_armour", "vaal_infuser_martial", "vaal_infuser_caster",
  "sacrifice_jewellery", "sacrifice_armour", "sacrifice_weapon",
  "architect", "cultivation", "siphoner", "mirror", "hinekora", "extraction",
] as const;
export const isExtra = (key: string): boolean => (EXTRA_KEYS as readonly string[]).includes(key);
/** コラプトしたアイテムに打つ物 (普通のカレンシーと逆で、コラプトしていないと打てない) */
export const FOR_CORRUPTED = ["sacrifice_jewellery", "sacrifice_armour", "sacrifice_weapon", "architect", "cultivation", "siphoner"];
/** コラプト・聖別・ミラーの後でも打てる物 (アイテムを変えない / 壊すだけ) */
export const ANY_STATE = ["mirror", "extraction"];

/** インフューザーの対象 (説明文の言葉) */
const INFUSER: Record<string, { cats: string[]; ja: string }> = {
  vaal_infuser_jewellery: { cats: ["Rings", "Amulets"], ja: "指輪・アミュレット" },
  vaal_infuser_armour: { cats: ARMOUR, ja: "防具" },
  vaal_infuser_martial: { cats: MARTIAL, ja: "マーシャル武器" },
  vaal_infuser_caster: { cats: CASTER, ja: "ワンド・スタッフ・セプター" },
};
/** インフューザーで上限を超えた時にコラプトする確率。**公開値なし (未確定)**、仮に 25% */
export const INFUSER_CORRUPT_P = 0.25;
/** アーキテクトオーブで壊れる確率。**公開値なし (未確定)**、仮に 50% */
export const ARCHITECT_DESTROY_P = 0.5;
export const EXTRA_P_CONFIRMED = false;

/** 生贄のオーブの対象 */
const SACRIFICE: Record<string, { cats: string[]; ja: string }> = {
  sacrifice_jewellery: { cats: JEWELLERY, ja: "アミュレット・指輪・ベルト" },
  sacrifice_armour: { cats: ARMOUR, ja: "防具" },
  sacrifice_weapon: { cats: WEAPONS, ja: "武器・矢筒" },
};

const done = (item: StageItem, added: StageMod[] = [], removed: StageMod[] = []): StageApply => ({ applied: true, item, added, removed });

export function applyExtra(item: StageItem, key: string, rng: () => number, outcome?: string): StageApply {
  if (FOR_CORRUPTED.includes(key) && !item.corrupted) return skip(item, "コラプトしたアイテムにだけ使える");
  const inf = INFUSER[key];
  if (inf) {
    if (!inf.cats.includes(item.cls.category)) return skip(item, `${inf.ja}にだけ使える`);
    const base = JEWELLERY.includes(item.cls.category) ? maxQualityOf(item) : QUALITY_MAX;
    const cap = base + 10;
    if (item.quality >= cap) return skip(item, `品質が上限 (${cap}%)`);
    const quality = Math.min(cap, item.quality + QUALITY_STEP[item.rarity]);
    // 上限を超えた分だけコラプトの危険 (outcome "corrupted" / "safe" で指定できる)
    const over = quality > base;
    const corrupt = over && (outcome === "corrupted" ? true : outcome === "safe" ? false : rng() < INFUSER_CORRUPT_P);
    return done({ ...item, quality, ...(corrupt ? { corrupted: true } : {}) });
  }
  const sac = SACRIFICE[key];
  if (sac) {
    if (!sac.cats.includes(item.cls.category)) return skip(item, `${sac.ja}にだけ使える`);
    if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
    if (!item.enchant) return skip(item, "コラプトエンチャントが無い");
    const up = UPGRADES[item.enchant.id];
    if (!up) return skip(item, "このエンチャントは上がらない");
    const vals = rollEnchantValues(up.stats, rng);
    const pool = allMods(item).filter((m) => !m.fractured);
    const gone = pool.length ? pool[Math.floor(rng() * pool.length)]! : null;
    const next = { ...(gone ? without(item, gone) : item), enchant: { id: up.id, textJa: rollText(up.ja, vals), textEn: rollText(up.en, vals) } };
    return done(next, [], gone ? [gone] : []);
  }
  switch (key) {
    case "architect": {
      if (item.rarity === "unique" || item.rarity === "normal") return skip(item, "マジック・レアの装備にだけ使える");
      const destroy = outcome === "destroyed" ? true : outcome === "changed" ? false : rng() < ARCHITECT_DESTROY_P;
      if (destroy) return done({ ...item, destroyed: true });
      // 変わる: コラプトエンチャントを別の物に (付いていなければ付ける)。どう変わるかは公開されていないので仮
      const ids = Object.entries(ENCHANTS).filter(([id, e]) => e.domain === "item" && id !== item.enchant?.id).map(([id]) => id);
      const id = ids[Math.floor(rng() * ids.length)];
      const e = id ? ENCHANTS[id] : undefined;
      if (!id || !e) return done(item);
      const vals = rollEnchantValues(e.stats, rng);
      return done({ ...item, enchant: { id, textJa: rollText(e.ja, vals), textEn: rollText(e.en, vals) } });
    }
    case "cultivation": {
      if (item.rarity !== "unique" || !item.unique) return skip(item, "ユニークにだけ使える");
      const list = uniquesOfSameClass(item.unique.en);
      if (!list.length) return skip(item, "同じ種類の別のユニークが無い");
      const u = list[Math.floor(rng() * list.length)]!;
      return done({ ...item, unique: u });
    }
    case "siphoner":
      if (item.rarity !== "rare" || !JEWELLERY.includes(item.cls.category)) return skip(item, "レアの宝飾品にだけ使える");
      if (item.siphoner) return skip(item, "もうキル閾値が付いている");
      return done({ ...item, siphoner: true });
    case "mirror":
      if (item.mirrored) return skip(item, "ミラーしたアイテムには使えない");
      return done({ ...item, mirrored: true, foreseen: false });
    case "hinekora":
      if (item.foreseen) return skip(item, "もう予見できる");
      return done({ ...item, foreseen: true });
    case "extraction":
      return done({ ...item, destroyed: true });
  }
  return skip(item, "このカレンシーはまだ入れていない");
}
