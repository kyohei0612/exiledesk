/**
 * カウンタ → AggregatedAscendancy (スロット / ベース / ユニーク / スキルの確定)
 *
 * finalize.ts から切り出し (2026-09-26)。
 */
import { jaAscendancy, ascendancyIcon } from "../../../i18n/ascendancies-ja";
import { jaCurrency } from "../../../i18n/currencies-ja";
import { jaSkill } from "../../../i18n/skills-ja";
import type {
  AggregatedAscendancy,
  BaseEntry,
  SlotKey,
  SlotMods,
  SkillUsage,
  SkillUsageStatsRaw,
  GemUsageCountRaw,
  NinjaSkillStats,
  UniqueUsage,
} from "../types";
import type { AscendancyCounter, BaseBucket, SlotCounter, UniqueBucket } from "../ingest";
import { displayUniqueNameJa } from "../../mods/dictionaries";
import { tagSetsForSlotWithBases } from "../../mods/item-class-tags";
import { baseClassOf } from "../../trade2/category";
import { finalizeBuckets } from "./mods";
import { GEM_INFO } from "./gems";
import { jaTypeName, jaUniqueName } from "../../trade2/localize";
import passivesJa from "../../../i18n/passives-ja-client.json";
import augmentKinds from "../../../i18n/augment-kinds.json";
import type { AugmentKind, Loadout, LoadoutEntry } from "../types";

const AUGMENT_KINDS = augmentKinds as Record<string, AugmentKind>;
/** オーグメントの種類 (クライアントの BaseItemTypes の Id で分けた表。無ければ名前で) */
const augmentKind = (en: string): AugmentKind =>
  AUGMENT_KINDS[en] ?? (/Idol/.test(en) ? "idol" : /Soul Core/.test(en) ? "soulcore" : /Rune/.test(en) ? "rune" : "other");

const PASSIVES_JA = passivesJa as Record<string, string>;
/** 持ち物の日本語 (公式の名前。ユニークのジュエルはユニーク名、キーストーンはパッシブの名前) */
function entries(m: Map<string, number>, ja: (en: string) => string): LoadoutEntry[] {
  return [...m].map(([nameEn, count]) => ({ nameEn, name: ja(nameEn), count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
function finalizeLoadout(counter: AscendancyCounter): Loadout {
  const l = counter.loadout;
  const item = (en: string): string => {
    const u = jaUniqueName(en);
    return u !== en ? u : jaTypeName(en);
  };
  return {
    // 盾・武器の付与スキルの穴に入れたジェム (Sigil of Power など) はオーグメントではないので外す (2026-09-29 オーナー)
    augments: entries(l.augments, item).map((e) => ({ ...e, kind: augmentKind(e.nameEn) })).filter((e) => e.kind !== "gem"),
    lineage: entries(l.lineage, jaSkill),
    keystones: entries(l.keystones, (en) => PASSIVES_JA[en] ?? en),
    flasks: entries(l.flasks, item),
    jewels: entries(l.jewels, item),
  };
}

function finalizeBases(buckets: Map<string, BaseBucket>): BaseEntry[] {
  const list: BaseEntry[] = [];
  for (const b of buckets.values()) {
    const skills = [...b.skills.values()]
      .map((s) => ({
        name: jaSkill(s.nameEn),
        nameEn: s.nameEn,
        levelMin: s.levelMin,
        levelMax: s.levelMax,
        count: s.count,
        gems: [...s.gems.entries()]
          .map(([nameEn, count]) => ({ name: jaSkill(nameEn), nameEn, count }))
          .sort((x, y) => y.count - x.count),
      }))
      .sort((x, y) => y.count - x.count);
    list.push({ name: jaCurrency(b.nameEn), nameEn: b.nameEn, count: b.count, skills });
  }
  list.sort((a, b) => b.count - a.count);
  return list;
}

/**
 * スロットの MOD 一覧を確定する。ティア表は「そのスロットで実際に使われていたベースの種別」の spawn タグで絞る
 * (武器スロットなら弓 / 杖 / メイス … の和集合)。ベースが取れていない古いキャッシュはスロット既定タグ。
 */
function finalizeSlot(slot: SlotCounter, slotKey: SlotKey): SlotMods {
  // 防具・盾は計算機のエンジンの行 (Gloves_str 等) の属性で絞る (2026-09-29、属性違いの段が混ざっていた)
  const tagSets = tagSetsForSlotWithBases(slotKey, [...slot.bases.values()].map((b) => ({ nameEn: b.nameEn, cls: baseClassOf(b.nameEn)?.cls })));
  return {
    prefix: finalizeBuckets(slot.prefix, "P", tagSets),
    suffix: finalizeBuckets(slot.suffix, "S", tagSets),
    bases: finalizeBases(slot.bases),
  };
}

function finalizeUniques(buckets: Map<string, UniqueBucket>, sampleSize: number): UniqueUsage[] {
  const list: UniqueUsage[] = [];
  for (const b of buckets.values()) {
    list.push({
      name: displayUniqueNameJa(b.representative?.name, b.nameEn),
      nameEn: b.nameEn,
      count: b.count,
      percentage: sampleSize > 0 ? b.count / sampleSize : 0,
      icon: b.icon,
      representative: b.representative,
    });
  }
  list.sort((a, b) => b.count - a.count);
  return list;
}

function finalizeSkills(buckets: Map<string, import("../ingest").SkillBucket2>, sampleSize: number): SkillUsage[] {
  const list: SkillUsage[] = [];
  for (const b of buckets.values()) {
    const info = GEM_INFO.get(b.nameEn);
    list.push({
      name: jaSkill(b.nameEn),
      nameEn: b.nameEn,
      spirit: info?.spirit ?? false,
      meta: info?.meta ?? false,
      count: b.count,
      percentage: sampleSize > 0 ? b.count / sampleSize : 0,
      mainCount: b.mainCount,
      supports: [...b.supports.entries()]
        .map(([nameEn, count]) => ({ name: jaSkill(nameEn), nameEn, count }))
        .sort((x, y) => y.count - x.count),
      lvl21: b.lvl21,
      q23: b.q23,
      both: b.both,
      maxLevel: b.maxLevel,
      maxQuality: b.maxQuality,
    });
  }
  list.sort((a, b) => b.count - a.count || b.mainCount - a.mainCount);
  return list;
}

/** Rust のスキル使用率 (英語名 + 人数) を表示用に (日本語名 + 割合)。人数 0 / 総数 0 は出さない */
function toNinjaSkills(raw: SkillUsageStatsRaw | null | undefined): NinjaSkillStats | null {
  if (!raw || !(raw.total > 0)) return null;
  const total = raw.total;
  const map = (list: GemUsageCountRaw[] | undefined) =>
    (list ?? []).filter((g) => g.count > 0).map((g) => ({ name: jaSkill(g.name), nameEn: g.name, count: g.count, percentage: g.count / total }));
  const main0 = map(raw.main);
  const spirit0 = map(raw.spirit);
  // poe.ninja の区分はスピリットジェムをメインスキル側にも入れてくる (例: ヘラルドオブアイス)。
  // クライアントのスピリットタグを正として振り分け直す (2026-09-16 オーナー指示: タグがあれば問答無用でスピリット、無ければスキル)
  const isSpirit = (nameEn: string): boolean => GEM_INFO.get(nameEn)?.spirit === true;
  const inSpirit = new Set(spirit0.map((s) => s.nameEn));
  const moved = main0.filter((s) => isSpirit(s.nameEn) && !inSpirit.has(s.nameEn));
  return {
    total,
    main: main0.filter((s) => !isSpirit(s.nameEn)),
    spirit: [...spirit0, ...moved].sort((a, b) => b.count - a.count),
    all: map(raw.all),
  };
}

export function finalizeAscendancy(
  classEn: string,
  usagePercent: number,
  sampleSize: number,
  counter: AscendancyCounter,
  error?: string,
  fetchProgress?: { done: number; total: number },
  ninjaRaw?: SkillUsageStatsRaw | null,
): AggregatedAscendancy {
  const uniquesBySlot: { [K in SlotKey]: UniqueUsage[] } = {
    ring: finalizeUniques(counter.uniquesBySlot.ring, sampleSize),
    amulet: finalizeUniques(counter.uniquesBySlot.amulet, sampleSize),
    weapon: finalizeUniques(counter.uniquesBySlot.weapon, sampleSize),
    weapon2: finalizeUniques(counter.uniquesBySlot.weapon2, sampleSize),
    helm: finalizeUniques(counter.uniquesBySlot.helm, sampleSize),
    gloves: finalizeUniques(counter.uniquesBySlot.gloves, sampleSize),
    body: finalizeUniques(counter.uniquesBySlot.body, sampleSize),
    boots: finalizeUniques(counter.uniquesBySlot.boots, sampleSize),
  };
  return {
    id: classEn.toLowerCase().replace(/\s+/g, "-"),
    classEn,
    name: jaAscendancy(classEn),
    usagePercent,
    sampleSize,
    icon: ascendancyIcon(classEn),
    ring: finalizeSlot(counter.slots.ring, "ring"),
    amulet: finalizeSlot(counter.slots.amulet, "amulet"),
    weapon: finalizeSlot(counter.slots.weapon, "weapon"),
    weapon2: finalizeSlot(counter.slots.weapon2, "weapon2"),
    helm: finalizeSlot(counter.slots.helm, "helm"),
    gloves: finalizeSlot(counter.slots.gloves, "gloves"),
    body: finalizeSlot(counter.slots.body, "body"),
    boots: finalizeSlot(counter.slots.boots, "boots"),
    uniques: finalizeUniques(counter.uniques, sampleSize),
    uniquesBySlot,
    skills: finalizeSkills(counter.skills, sampleSize),
    ninjaSkills: toNinjaSkills(ninjaRaw),
    error,
    fetchProgress,
    loadout: finalizeLoadout(counter),
  };
}
