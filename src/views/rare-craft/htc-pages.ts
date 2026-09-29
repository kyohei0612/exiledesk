/**
 * htc-pages.ts — 規格外の賭けの重み表を、計算機のエンジン (HTC) から作る (2026-09-29)
 *
 * オーナー「複数の MOD 計算機を使ってるなら 1 つにして管理しやすい形に」。前は poe2db の重み表
 * (src/i18n/mod-weights-poe2db.json、scripts/build-mod-weights-poe2db.mjs。どちらも 2026-09-29 に消した) を別に持っていた。
 * 今は計算機と同じ PatchData (同梱 + クライアントで補ったベース + 重みの上書き weight-overrides.ts) から、
 * sim.ts が読む形 (WPage: 段ごとの MOD 1 行) に並べ直すだけ。シミュレーターの中身は変えていない。
 *   - 行 (page) はエンジンの行 id (Helmets_int 等) そのまま
 *   - stat id は段の stats。持たない MOD (エッセンス・冒涜) は、同じ行・同じ系統の普通の MOD から借り、
 *     それも無ければ系統 → 値の数ごとの stat (familyStats、extra-bases.json。buy-or-craft.ts と同じ借り方)
 */
import type { Mod, PatchData, Tier } from "../../vendor/poe2htc/engine/types";
import { fillHashes } from "../../services/htc/mod-text";
import type { WEssence, WMod, WPage, WStat } from "./sim-data";

type TierWithStats = Tier & { stats?: readonly string[] };

function statsOf(tier: TierWithStats, lend: readonly string[] | undefined, byCount: Record<string, string[]> | undefined): WStat[] {
  const ids = tier.stats?.length ? tier.stats : lend ?? byCount?.[String(tier.ranges.length)] ?? [];
  return tier.ranges.map((r, i) => ({ id: ids[i] ?? "", min: r[0] ?? 0, max: r[1] ?? r[0] ?? 0 })).filter((s) => s.id);
}
/** 数値を段の幅で埋めた文面 ("+#" → "+(5-8)") */
const textOf = (mod: Mod, tier: Tier): string => fillHashes(mod.text ?? mod.family, tier.ranges);

export function pageFromHtc(data: PatchData, rowId: string, familyStats: Record<string, Record<string, string[]>> = {}): WPage | null {
  const row = data.bases.get(rowId);
  if (!row) return null;
  const mods = (ids: readonly string[]) => ids.map((id) => data.mods.get(id)).filter((m): m is Mod => !!m);
  const normal = mods([...row.pools.normal.prefixes, ...row.pools.normal.suffixes]);
  // 同じ行の普通の MOD の stat (系統 → stat id の並び)。stat を持たない MOD に貸す
  const lend = new Map<string, readonly string[]>();
  for (const m of normal) {
    const t = (m.tiers as readonly TierWithStats[]).find((x) => x.stats?.length);
    if (t && !lend.has(m.family)) lend.set(m.family, t.stats!);
  }
  const rows = (list: Mod[]): WMod[] =>
    list.flatMap((m) =>
      (m.tiers as readonly TierWithStats[]).map((t, i): WMod => ({
        id: `${m.id}#${i}`,
        family: m.family,
        families: [...(m.families ?? [m.family])],
        gen: m.type,
        name: t.name,
        level: t.ilvl,
        weight: t.weight,
        tags: [...m.tags],
        text: textOf(m, t),
        stats: statsOf(t, lend.get(m.family), familyStats[m.family]),
      })),
    );
  const essence: WEssence[] = mods([...row.pools.essence.prefixes, ...row.pools.essence.suffixes]).flatMap((m) =>
    (m.tiers as readonly (TierWithStats & { codes?: readonly string[] })[]).map((t) => ({
      essence: t.name,
      code: t.codes?.[0] ?? "",
      level: t.ilvl,
      gen: m.type,
      family: m.family,
      text: textOf(m, t),
      stats: statsOf(t, lend.get(m.family), familyStats[m.family]),
    })),
  );
  return { tags: null, normal: rows(normal), desecrated: rows(mods([...row.pools.desecrated.prefixes, ...row.pools.desecrated.suffixes])), essence };
}
