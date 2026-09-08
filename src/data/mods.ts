/**
 * POE2 Mod データ (mods-bundle.json) の型と読み込み
 *
 * 2026-09-08: poe2db 時代のクラフト確率計算 (getModGroupsForItem / probabilityOfMod 等、
 * 約 330 行) はどこからも呼ばれていなかったので削除し、型と allMods だけ残した。
 * 辞書の逆引き索引は services/mods/dictionaries.ts、ティア表は services/mods/tiers.ts。
 */
import modsBundle from "../i18n/mods-bundle.json";

export interface SpawnWeight {
  t: string;
  w: number;
}

export interface ModStat {
  id: string;
  min?: number;
  max?: number;
}

export interface Mod {
  key: string;
  text_en: string;
  text_ja: string;
  type: "prefix" | "suffix";
  groups: string[];
  level: number;
  stats: ModStat[];
  spawn: SpawnWeight[];
  /** Essence currency 固有 mod */
  essence?: number;
  /** Vaal Orb コラプトでのみ付く mod */
  corrupt?: number;
  /** 冒涜 (Desecrated) ドメインの mod */
  desecrated?: number;
}

/** bundle 全 mod (key 付き) */
export const allMods: Mod[] = Object.entries(modsBundle as Record<string, Omit<Mod, "key">>).map(([key, m]) => ({ key, ...m }));
