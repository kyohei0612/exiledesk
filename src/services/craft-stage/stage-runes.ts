/**
 * stage-runes.ts — ルーン (オーグメント) をソケットにはめる (2026-09-29、POE2Tube 要望 ⑰-1)
 *
 * 表は stage-runes.json (scripts/build-stage-runes.mjs、クライアントの SoulCores / SoulCoreStats)。
 * 手順 JSON のキーは `rune:<英語名>` (例 `rune:Lesser Desert Rune`)。
 * 効き目は部位で違う (SoulCoreStatCategories: マーシャル武器 / ワンドまたはスタッフ / 防具 …)。1 つの部位に当てはまる行が複数ある時は、
 * 当てはまる部位が一番狭い行 (「弓」>「マーシャル武器」>「全ての装備品」) を使う。
 * 決まり (クライアントの ClientStrings.ItemDescriptionSoulCore「一度ソケットすると取り外すことはできないが、他のオーグメントアイテムで置き換えることができる」):
 *   空きソケットにはめる。外す手は無い。空きが無い時は打てない (置き換えの手は今は未対応、打てない扱い)
 * 2026-09-29 オーナー「現行のバージョンでシステム正しいかデータ見ながら」で見直し (build-stage-runes.mjs):
 *   - 棚に出すのは今のゲームに有る物だけ (相場に値段がある、available)。Tempered のルーンなどはクライアントにあるが相場に無い
 *   - 1 つのアイテムにはめられる数 (SoulCores.Limit)、コラプト・聖別の後でもはめられるか (SoulCores.CanSocketInCorruptedSanctified)
 *   - ソケットの上限はベースごと (PoB の Data/Bases の socketLimit、胴・両手武器 4 / ほか 3)。熟練工で付けられるのは socketLimit − 2
 *     (胴・両手 2 / ほか 1)、規格外のベースは +1、コラプト (ヴァール) で +1 の読み。規格外はこのステージでは扱わない
 */
import runesRaw from "./stage-runes.json";
import basesPob from "./stage-bases-pob.json";
import { ARMOUR, CASTER, MARTIAL } from "./apply-act";
import type { StageApply, StageItem, StageAugment } from "./types";
import { skip } from "./stage-core";

export interface RuneEffect { cat: string; catJa: string; stats: Array<{ id: string; value: number }>; ja: string; en: string }
export interface RuneRow {
  ja: string;
  kind: "rune" | "soulcore" | "talisman";
  tier: string | null;
  level: number;
  drop: number | null;
  /** 1 つのアイテムにはめられる数 (無ければ制限なし) */
  limit: number | null;
  bound: boolean;
  /** コラプト・聖別の後でもはめられる */
  corruptOk: boolean;
  /** 今のゲームに有るか (相場に値段がある。null = 分からない) */
  available: boolean | null;
  dds: string | null;
  effects: RuneEffect[];
}
export const RUNES = (runesRaw as unknown as { runes: Record<string, RuneRow> }).runes;
const SOCKET_LIMITS = (basesPob as unknown as { socketLimits: Record<string, number> }).socketLimits;

export const RUNE_PREFIX = "rune:";
export const isRune = (key: string): boolean => key.startsWith(RUNE_PREFIX) && !!RUNES[key.slice(RUNE_PREFIX.length)];
export const runeOf = (key: string): RuneRow | null => RUNES[key.slice(RUNE_PREFIX.length)] ?? null;

const WANDSTAFF = ["Wands", "Staves"];
const TWO_HAND = ["TwoHand_Maces", "Quarterstaves", "Bows", "Crossbows", "Staves", "Talismans"];
/** SoulCoreStatCategories.Id → 計算機の部位 (ItemBase.category) */
const CAT_TO_CLASSES: Record<string, string[] | "all"> = {
  All: "all",
  "Martial Weapon": MARTIAL,
  "Caster Weapon": CASTER,
  "Wand or Staff": WANDSTAFF,
  Armour: ARMOUR,
  "Body Armour": ["Body_Armours"],
  Boots: ["Boots"],
  Bow: ["Bows"],
  Focus: ["Foci"],
  Gloves: ["Gloves"],
  Helmet: ["Helmets"],
  Sceptre: ["Sceptres"],
  Shield: ["Shields"],
  Buckler: ["Bucklers"],
  "Shield or Buckler": ["Shields", "Bucklers"],
  "Two Hand Mace": ["TwoHand_Maces"],
  "One Hand Mace": ["OneHand_Maces"],
  Crossbow: ["Crossbows"],
  Spear: ["Spears"],
  Quarterstaff: ["Quarterstaves"],
  Wand: ["Wands"],
  Staff: ["Staves"],
  Talisman: ["Talismans"],
  "Martial Or Caster Weapon": [...MARTIAL, ...CASTER],
  "Martial Weapon Wand or Staff": [...MARTIAL, ...WANDSTAFF],
  "Quarterstaff or Spear": ["Quarterstaves", "Spears"],
  "Two Handed Weapon": TWO_HAND,
  "Maces or Talisman": ["OneHand_Maces", "TwoHand_Maces", "Talismans"],
  "Crossbow Bow or Spear": ["Crossbows", "Bows", "Spears"],
  "One Hand Mace or Quarterstaff": ["OneHand_Maces", "Quarterstaves"],
};
const EQUIP = [...MARTIAL, ...CASTER, ...ARMOUR];
const BIG = [...TWO_HAND, "Body_Armours"];

/**
 * 熟練工のオーブで付けられるソケットの数 (0 = 付けられない部位)。PoB の socketLimit − 2 (胴・両手 2 / ほか 1)。
 * PoB に無いベースは部位で (胴・両手 4 / ほか 3 の − 2)
 */
export function socketCapOf(base: string, category: string): number {
  if (!EQUIP.includes(category)) return 0;
  const lim = SOCKET_LIMITS[base] ?? (BIG.includes(category) ? 4 : 3);
  return Math.max(0, lim - 2);
}
const sizeOf = (c: string[] | "all" | undefined): number => (c === "all" ? 1000 : c?.length ?? 1e9);

/** そのルーンがその部位で持つ効き目 (当てはまる部位が一番狭い行)。無ければ null */
export function runeEffectFor(rune: RuneRow, category: string): RuneEffect | null {
  const hits = rune.effects.filter((e) => {
    const c = CAT_TO_CLASSES[e.cat];
    return c === "all" ? EQUIP.includes(category) : !!c?.includes(category);
  });
  return hits.sort((a, b) => sizeOf(CAT_TO_CLASSES[a.cat]) - sizeOf(CAT_TO_CLASSES[b.cat]))[0] ?? null;
}

/** 棚に並べるルーン (ルーンだけ、段 → ドロップレベル順)。tier を渡すとその段だけ */
export function runeKeys(tier?: string): string[] {
  const order: Record<string, number> = { lesser: 0, normal: 1, greater: 2, perfect: 3, special: 4 };
  return Object.entries(RUNES)
    .filter(([, r]) => r.kind === "rune" && r.available !== false && (!tier || r.tier === tier))
    .sort(([, a], [, b]) => (order[a.tier ?? ""] ?? 9) - (order[b.tier ?? ""] ?? 9) || (a.drop ?? 0) - (b.drop ?? 0))
    .map(([en]) => `${RUNE_PREFIX}${en}`);
}

/** ルーンを空きソケットに 1 つはめる */
export function applyRune(item: StageItem, key: string): StageApply {
  const rune = runeOf(key)!;
  const sockets = item.sockets ?? 0;
  const used = item.augments?.length ?? 0;
  if (rune.available === false) return skip(item, "今のゲームには無いルーン (相場に無い)");
  if ((item.corrupted || item.sanctified) && !rune.corruptOk) return skip(item, "コラプト・聖別したアイテムにははめられない");
  if (!sockets) return skip(item, "ソケットが無い (先に熟練工のオーブ)");
  if (used >= sockets) return skip(item, "空きソケットが無い (はめたルーンは外せない)");
  if (rune.limit && (item.augments ?? []).filter((a) => a.key === key).length >= rune.limit) return skip(item, `このルーンは 1 つのアイテムに ${rune.limit} 個まで`);
  const eff = runeEffectFor(rune, item.cls.category);
  if (!eff) return skip(item, "この部位には効き目が無い");
  const aug: StageAugment = { key, en: key.slice(RUNE_PREFIX.length), ja: rune.ja, cat: eff.catJa, textJa: eff.ja, textEn: eff.en, stats: eff.stats };
  return { applied: true, item: { ...item, augments: [...(item.augments ?? []), aug] }, added: [], removed: [] };
}
