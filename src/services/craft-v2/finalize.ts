/**
 * カウンタ → AggregatedAscendancy (UI 公開形式)、および progress / キャッシュからの集計入口
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 *
 * 2026-09-26: ジェム情報 / MOD バケットの確定 / アセンダンシーの確定は finalize/ 以下に分割 (usageTierFromValues はここから再 export)。
 */

import type {
  AggregatedAscendancy,
  BuildView,
  CachedBuildRaw,
  SkillUsageStatsRaw,
  CachedAscendancy,
  CachedCharacter,
  CharacterItems,
  CraftV2Cache,
  CraftV2Progress,
} from "./types";
import { emptyAscendancyCounter, ingestCharacterItems } from "./ingest";
import { isMetaGem } from "./finalize/gems";
import { finalizeAscendancy } from "./finalize/ascendancy";
import { jaSkill } from "../../i18n/skills-ja";

export { usageTierFromValues } from "./finalize/mods";

// ============================================================================
// 集計の入口: progress payload / ディスクキャッシュ
// ============================================================================

/** キャラの集まり 1 つを集計する (全体・ビルドごと、どちらもこれ 1 本) */
function aggregateOf(
  classEn: string,
  percentage: number,
  chars: readonly CharacterItems[],
  progress: { done: number; total: number },
  skillStats: SkillUsageStatsRaw | null | undefined,
): AggregatedAscendancy {
  const counter = emptyAscendancyCounter();
  for (const ci of chars) ingestCharacterItems(counter, ci, isMetaGem);
  return finalizeAscendancy(classEn, percentage, chars.length, counter, undefined, progress, skillStats);
}

/** トリガーのメタジェム (Cast on Block 等) の DPS は数えられない値 (i32 の上限) で届く */
const UNCOUNTABLE_DPS = 2147483647;

/**
 * 全体 + ビルドごとの集計。ビルド (Rust の builds.rs が DPS 順に組んだ物) があれば、全体はビルドの人の合計、
 * 無ければ (旧キャッシュ・スキルが取れない) 全員を 1 つとして見る
 */
function aggregateWithBuilds(
  classEn: string,
  percentage: number,
  chars: readonly CharacterItems[],
  builds: readonly CachedBuildRaw[] | undefined,
  progress: { done: number; total: number },
  skillStats: SkillUsageStatsRaw | null | undefined,
): AggregatedAscendancy {
  if (!builds?.length) return aggregateOf(classEn, percentage, chars, progress, skillStats);
  const byKey = new Map<string, CharacterItems>(chars.map((c) => [`${c.account}|${c.name}`, c]));
  const pick = (keys: readonly string[]): CharacterItems[] => keys.flatMap((k) => byKey.get(k) ?? []);
  const all = aggregateOf(classEn, percentage, pick(builds.flatMap((b) => b.members)), progress, skillStats);
  all.builds = builds.map((b): BuildView => {
    const members = pick(b.members);
    const skillOf = new Map(b.members.map((k, i) => [k, b.member_skills?.[i] ?? null] as const));
    const mix = new Map<string, number>();
    for (const s of b.member_skills ?? []) mix.set(s, (mix.get(s) ?? 0) + 1);
    return {
      skillEn: b.label ?? b.skill,
      skillJa: jaSkill(b.label ?? b.skill),
      topDps: b.top_dps > 0 && b.top_dps < UNCOUNTABLE_DPS ? b.top_dps : null,
      members: members.map((c) => {
        const s = skillOf.get(`${c.account}|${c.name}`);
        return { account: c.account, name: c.name, skillJa: s ? jaSkill(s) : null };
      }),
      skillMix: [...mix].map(([skillEn, count]) => ({ skillEn, skillJa: jaSkill(skillEn), count })).sort((x, y) => y.count - x.count),
      agg: aggregateOf(classEn, percentage, members, { done: members.length, total: members.length }, skillStats),
    };
  });
  return all;
}

/** Rust から届いた 1 アセンダンシー分の progress payload を集計して返す。 */
export function aggregateFromProgress(payload: CraftV2Progress): AggregatedAscendancy {
  return aggregateWithBuilds(payload.ascendancy, payload.percentage, payload.items, payload.builds, {
    done: payload.characters_done,
    total: payload.characters_total,
  }, payload.skill_stats);
}

/**
 * 縮小形式の `CachedCharacter` を `ingestCharacterItems` が読める wrapper 形式に復元する。
 * rare_items は「レアのみ」を格納するスキーマなので frameType=2 固定、unique_items は 3。
 */
function cachedCharacterToCharacterItems(c: CachedCharacter): CharacterItems {
  const items: unknown[] = [];
  for (const r of c.rare_items) {
    items.push({
      itemSlot: r.inventory_id,
      itemData: {
        frameType: 2,
        inventoryId: r.inventory_id,
        explicitMods: r.explicit_mods,
        baseType: r.base_type,
        extended: { subcategories: r.subcategories ?? [] },
        // 2026-09-12: 付与スキル / 装着ジェムを poe.ninja の形に戻す (Rust 側 cache_convert と同じ形)
        grantedSkills: (r.granted_skills ?? []).map((s) => ({ name: "Grants Skill", values: [[s, 25]] })),
        socketedItems: [{ socketedItems: (r.socketed_gems ?? []).map((g) => ({ typeLine: g })) }],
        // 2026-09-22: 品質も poe.ninja の形に戻す (Rust 側 cache_convert と同じ形)
        properties: r.quality != null ? [{ name: "[Quality]", values: [[`+${r.quality}%`, 1]] }] : [],
      },
    });
  }
  for (const u of c.unique_items) {
    items.push({
      itemSlot: u.inventory_id,
      itemData: {
        frameType: 3,
        inventoryId: u.inventory_id,
        typeLine: u.type_line,
        baseType: u.base_type,
        name: u.name,
        icon: u.icon,
        implicitMods: u.implicit_mods,
        explicitMods: u.explicit_mods,
        flavourText: u.flavour_text as string | string[] | undefined,
        requirements: Array.isArray(u.requirements) ? u.requirements : undefined,
        properties: Array.isArray(u.properties) ? u.properties : undefined,
        ilvl: u.item_level,
        level: u.level,
        extended: { subcategories: u.subcategories ?? [] },
      },
    });
  }
  const skills: unknown[] = (c.skills ?? []).map((g) => ({
    allGems: [
      // 2026-09-16: poe.ninja と同じ properties の形に戻す (レベル / 品質のランキング用)
      ...g.mains.map((gem) => ({
        name: gem.name,
        itemData: {
          support: false,
          properties: [
            ...(gem.level != null ? [{ name: "Level", values: [[String(gem.level), 0]] }] : []),
            ...(gem.quality != null ? [{ name: "[Quality]", values: [[`+${gem.quality}%`, 1]] }] : []),
          ],
        },
      })),
      ...g.supports.map((n) => ({ name: n, itemData: { support: true } })),
    ],
    dps: [{ dps: g.dps }],
  }));
  return { account: c.account, name: c.name, items, skills };
}

/**
 * 1 アセンダンシー分のキャッシュから AggregatedAscendancy を再構築する。
 * fetchProgress は `{ done: 件数, total: 件数 }` (= 取得済み) を入れる。取得が始まれば progress で置換される。
 */
function aggregateFromCachedAscendancy(cached: CachedAscendancy): AggregatedAscendancy {
  const chars = cached.characters.map(cachedCharacterToCharacterItems);
  const count = cached.builds?.length ? cached.builds.reduce((a, b) => a + b.members.length, 0) : chars.length;
  // 2026-09-16: キャッシュのキャラは取得済み。done=0 だとタブに "0/50" が残り、取得済アセンダンシー数も 0 になる
  return aggregateWithBuilds(cached.class, cached.percentage, chars, cached.builds, { done: count, total: count > 0 ? count : 1 }, cached.skill_stats);
}

/** キャッシュ全体から AggregatedAscendancy[] を構築 (使用率降順)。 */
export function aggregateFromCache(cache: CraftV2Cache): AggregatedAscendancy[] {
  const out = cache.ascendancies.map((a) => aggregateFromCachedAscendancy(a));
  out.sort((a, b) => b.usagePercent - a.usagePercent);
  return out;
}
