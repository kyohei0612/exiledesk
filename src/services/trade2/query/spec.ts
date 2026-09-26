/**
 * レアクラフト用の「条件で絞る」検索クエリ (純関数)
 *
 * query.ts から切り出し (2026-09-26)。
 */
import { SecurityStatus } from "../../../constants/trade2";
import trade2Skills from "../../../i18n/trade2-skills.json";

/**
 * レアクラフト用の「条件で絞る」検索 (2026-09-14、ES 兜のクラフトから)。ベース (ノーマル / マジック) と完成品 (レア) の両方に使う。
 *   category: trade2 の type_filters.category (armour.helmet 等)
 *   rarity: normal / magic / nonunique (レア = ユニーク以外)
 *   ilvlMin / esMin / socketsMin: type_filters.ilvl / equipment_filters.es / equipment_filters.rune_sockets
 *   stats: stat id と下限 (pseudo.* も可)
 */
export interface SpecQueryOptions {
  /**
   * trade2 の type_filters.category (armour.helmet 等)。
   * **`baseType` を渡す時は不要** (ベース名のほうが厳しく、カテゴリは冗長になる)。
   */
  category?: string;
  /**
   * ベース名で完全一致させる (英語名。JP サイトなら localizeQueryForSite が日本語に直す)。
   * クラフトの試算は必ず 1 つのベースを狙うので、こちらを使うほうが正確。
   * カテゴリの内部値が未確認なクラス (武器 / 帯 / 盾) でも引けるのが効く。
   */
  baseType?: string;
  rarity: "normal" | "magic" | "nonunique";
  ilvlMin?: number;
  /** 品質の下限 (%)。type_filters.quality (data-cache/trade2-filters-jp.json で確認) */
  qualityMin?: number;
  esMin?: number;
  /** 防御タイプで絞る (回避 / アーマー) 2026-09-14 */
  evMin?: number;
  arMin?: number;
  socketsMin?: number;
  /** `max` は「プレフィックスモッド #個」のような数の上限に使う (2026-09-23)。無ければ送らない */
  stats?: { id: string; min?: number; max?: number }[];
  /**
   * 取引所の「フラクチャー」(misc_filters.fractured_item、data/filters で確認 2026-09-23)。
   * `false` = いいえ。省略時は送らない (指定なし)。
   *
   * **stat を `explicit.` にしただけでは足りません。**別の MOD が固定された物は普通に返り、
   * そういう物は固定がもう埋まっているので狙いの MOD を固定できない (オーナー指摘 2026-09-23)。
   */
  fracturedItem?: boolean;
  /**
   * 「どれか 1 つ」の条件 (取引所の count グループ、1 つ以上)。グループごとに AND。
   * 完成品を探す時に、同じ MOD を固定済み (`fractured.`) でも普通 (`explicit.`) でも拾う用 (2026-09-24)
   */
  anyOf?: { filters: { id: string; min?: number }[] }[];
  /**
   * ベースの付与スキル (「Grants Skill: Level 20 Cast on Critical」の名前)。不在のアミュレットは付与スキルで値段が別物なので、
   * 完成品も素材も同じ付与スキルで探す (オーナー 2026-09-25)。取引所の `skill.` の stat (i18n/trade2-skills.json、
   * data-cache/trade2-stats-en.json の skill グループから作る)。表に無い名前なら送らない
   */
  grantedSkill?: string | null;
}
/** 付与スキルの名前 → 取引所の stat id (無ければ null) */
export function grantedSkillStatId(name: string | null | undefined): string | null {
  return name ? (trade2Skills as Record<string, string>)[name] ?? null : null;
}
export function buildSpecQuery(o: SpecQueryOptions) {
  // ベース名を指定した時はカテゴリを送らない。同じ物を 2 通りで絞ることになるうえ、
  // カテゴリの内部値が未確認のクラスでは間違った値を送りかねない
  const type: Record<string, unknown> = { rarity: { option: o.rarity } };
  if (!o.baseType && o.category) type.category = { option: o.category };
  if (o.ilvlMin != null) type.ilvl = { min: o.ilvlMin };
  if (o.qualityMin != null) type.quality = { min: o.qualityMin };
  const equipment: Record<string, unknown> = {};
  if (o.esMin != null) equipment.es = { min: o.esMin };
  if (o.evMin != null) equipment.ev = { min: o.evMin };
  if (o.arMin != null) equipment.ar = { min: o.arMin };
  if (o.socketsMin != null) equipment.rune_sockets = { min: o.socketsMin };
  const skillId = grantedSkillStatId(o.grantedSkill);
  type StatFilter = { id: string; disabled: boolean; value?: { min?: number; max?: number } };
  const andFilters: StatFilter[] = [
    ...(o.stats ?? []).map((s) => ({
      id: s.id,
      disabled: false,
      value: { ...(s.min != null ? { min: s.min } : {}), ...(s.max != null ? { max: s.max } : {}) },
    })),
    ...(skillId ? [{ id: skillId, disabled: false }] : []),
  ];
  const stats: Array<{ type: string; value?: { min: number }; filters: StatFilter[] }> = andFilters.length > 0 ? [{ type: "and", filters: andFilters }] : [];
  for (const g of o.anyOf ?? []) {
    stats.push({
      type: "count",
      value: { min: 1 },
      filters: g.filters.map((f) => ({ id: f.id, disabled: false, value: f.min != null ? { min: f.min } : {} })),
    } as (typeof stats)[number]);
  }
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      ...(o.baseType ? { type: { discriminator: null, option: o.baseType } } : {}),
      stats,
      filters: {
        type_filters: { filters: type },
        equipment_filters: { filters: equipment },
        misc_filters: {
          filters: {
            corrupted: { option: "false" },
            ...(o.fracturedItem != null ? { fractured_item: { option: String(o.fracturedItem) } } : {}),
          },
        },
      },
    },
    sort: { price: "asc" },
  };
}
