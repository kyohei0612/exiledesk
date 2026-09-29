/**
 * ビルドの持ち物の集計 (2026-09-29): オーグメント (ソケットに入れた物)・リネージュサポート・キーストーン・チャーム / フラスコ・ジュエル
 *
 * オーナー「取れる情報全部出したい。各ビルドのスキル構成や装備構成を全部表示して、何が多いのか知りたい」。
 * どれも「その物を使っていた人数」(同じ人が 2 つ持っていても 1)。スキル構成 (メイン・サポート) は ingest/skills.ts。
 */
import type { CharacterItems } from "../types";

export interface LoadoutCounter {
  augments: Map<string, number>;
  lineage: Map<string, number>;
  keystones: Map<string, number>;
  flasks: Map<string, number>;
  jewels: Map<string, number>;
}

export function emptyLoadout(): LoadoutCounter {
  return { augments: new Map(), lineage: new Map(), keystones: new Map(), flasks: new Map(), jewels: new Map() };
}

const bump = (m: Map<string, number>, names: Iterable<string>): void => {
  for (const n of new Set(names)) if (n) m.set(n, (m.get(n) ?? 0) + 1);
};

interface RawItem {
  itemData?: { socketedItems?: Array<{ typeLine?: string }> };
}
interface RawGem {
  name?: string;
  itemData?: { support?: boolean; properties?: Array<{ name?: string }> };
}
interface RawGroup {
  allGems?: RawGem[];
}

/** リネージュサポート = タグ (properties[0].name) に LineageSupports が入るサポート (poe.ninja の形。Rust のキャッシュも同じ形で戻す) */
export const isLineage = (gem: RawGem): boolean =>
  !!gem?.itemData?.support && (gem.itemData.properties?.[0]?.name ?? "").includes("LineageSupports");

export function ingestLoadout(lc: LoadoutCounter, ci: CharacterItems): void {
  const items = (Array.isArray(ci.items) ? ci.items : []) as RawItem[];
  bump(lc.augments, items.flatMap((it) => (it.itemData?.socketedItems ?? []).flatMap((s) => (s?.typeLine ? [s.typeLine] : []))));
  const groups = (Array.isArray(ci.skills) ? ci.skills : []) as RawGroup[];
  bump(lc.lineage, groups.flatMap((g) => (g.allGems ?? []).filter(isLineage).flatMap((x) => (x.name ? [x.name] : []))));
  bump(lc.keystones, ci.keystones ?? []);
  bump(lc.flasks, ci.flasks ?? []);
  bump(lc.jewels, ci.jewels ?? []);
}
