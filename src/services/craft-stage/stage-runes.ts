/**
 * stage-runes.ts — ルーン (オーグメント) をソケットにはめる (2026-09-29、POE2Tube 要望 ⑰-1)
 *
 * 表は stage-runes.json (scripts/build-stage-runes.mjs、クライアントの SoulCores / SoulCoreStats)。
 * 手順 JSON のキーは `rune:<英語名>` (例 `rune:Lesser Desert Rune`)。
 * 効き目は部位で違う (SoulCoreStatCategories: マーシャル武器 / ワンドまたはスタッフ / 防具 …)。1 つの部位に当てはまる行が複数ある時は、
 * 当てはまる部位が一番狭い行 (「弓」>「マーシャル武器」>「全ての装備品」) を使う。
 * はめる・置き換える・取り外すの決まりは src/services/augment-rules.ts (説明文から作った表 augment-rules.json) に通す (2026-10-03 オーナー
 *   「ソケットバウンド系と普通のルーンを確認しよう。アストリッドとか、ソケットバウンドじゃないのに付け替えできないとかある」)。
 *   2026-10-02 までは「はめたら外せない・空きが無ければ打てない」を全部に当てていて、普通のルーンもアストリッドも置き換えられなかった。
 *   - 空きがあれば空きにはめる。空きが無ければ、はまっている物を置き換える (置き換えた方は壊れて戻らない)
 *   - 手順のキー `rune:<英語名>@<n>` で n 番目 (1 から) のソケットを指す。@ が無く空きが無い時は、左から最初の置き換えられる物
 *   - ソケットバウンドの物 (セールの凱旋など) は置き換えられない (理由の札「○○はソケットバウンドなので置き換えられない」)
 *   - 部位の制限 (「靴の空のオーグメントソケットに」) と、1 つのアイテムにはめられる数 (SoulCoreLimits) も表どおり。
 *     説明文の部位と効き目の部位 (SoulCoreStats) が食い違う物 (5 件、tests/augment-rules.test.ts) は両方を満たす時だけはめる
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
import { augmentRule, limitBlock, placeBlock, replaceBlock } from "../augment-rules";

export interface RuneEffect { cat: string; catJa: string; stats: Array<{ id: string; value: number }>; ja: string; en: string }
export interface RuneRow {
  ja: string;
  kind: "rune" | "soulcore" | "talisman";
  tier: string | null;
  level: number;
  drop: number | null;
  /**
   * 使わない: SoulCores.Limit の行番号のまま入っていて数ではない (遺産のルーンが 3 = AldursLegacyLimit1 の行)。
   * はめられる数は augment-rules.ts の limitBlock (SoulCoreLimits を引いた表) で見る
   */
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
/**
 * 手順のキー `rune:<英語名>` / `rune:<英語名>@<n>` (n 番目のソケットを指す、1 から) を分ける。
 * 名前に @ は無いので、最後の @ と数字だけをソケットの番号として読む
 */
export function parseRuneKey(key: string): { en: string; socket: number | null } | null {
  if (!key.startsWith(RUNE_PREFIX)) return null;
  const body = key.slice(RUNE_PREFIX.length);
  const m = /^(.*)@(\d+)$/.exec(body);
  return m ? { en: m[1]!, socket: Number(m[2]) } : { en: body, socket: null };
}
/** キーの英語名 (相場・絵を引く鍵。@n は外す) */
export const runeNameOf = (key: string): string => parseRuneKey(key)?.en ?? key;
export const isRune = (key: string): boolean => { const p = parseRuneKey(key); return !!p && !!RUNES[p.en]; };
export const runeOf = (key: string): RuneRow | null => { const p = parseRuneKey(key); return p ? RUNES[p.en] ?? null : null; };

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

/** 棚に並べるルーン (ルーンだけ、段 → ドロップレベル順)。tier を渡すとその段だけ。kind でソウルコア / アイドル (talisman) も */
export function runeKeys(tier?: string, kind: RuneRow["kind"] = "rune"): string[] {
  const order: Record<string, number> = { lesser: 0, normal: 1, greater: 2, perfect: 3, special: 4 };
  return Object.entries(RUNES)
    .filter(([, r]) => r.kind === kind && r.available !== false && (!tier || r.tier === tier))
    .sort(([, a], [, b]) => (order[a.tier ?? ""] ?? 9) - (order[b.tier ?? ""] ?? 9) || (a.drop ?? 0) - (b.drop ?? 0))
    .map(([en]) => `${RUNE_PREFIX}${en}`);
}

/**
 * ルーンを 1 つはめる。空きがあれば空きに、無ければ置き換え (augment-rules.ts の決まり)。
 * 置き換えた時は StageApply.augment.replaced に外れた物 (壊れて戻らない = replacedGoes "destroyed")
 */
/** 段の順 (傑作のルーンで 1 つ上へ) */
const TIER_UP: Record<string, string> = { lesser: "normal", normal: "greater", greater: "perfect" };
const TIER_PREFIX: Record<string, string> = { lesser: "Lesser ", normal: "", greater: "Greater ", perfect: "Perfect " };
export const TIER_JA: Record<string, string> = { lesser: "レッサー", normal: "無印", greater: "グレーター", perfect: "パーフェクト" };
/** そのルーンの 1 段上の英語名 (砂漠のグレータールーン → 砂漠のパーフェクトルーン)。段の無い物・最上段は null */
export function upgradedRuneOf(en: string): string | null {
  const r = RUNES[en];
  if (!r || r.kind !== "rune" || !r.tier || !TIER_UP[r.tier]) return null;
  const family = en.replace(/^(Lesser|Greater|Perfect) /, "");
  const next = `${TIER_PREFIX[TIER_UP[r.tier]!]}${family}`;
  return RUNES[next] ? next : null;
}

/**
 * 傑作のルーン (Masterwork Rune、POE2Tube 要望 ㉘ 2026-10-04): 説明文「ティアを持つルーンを持つオーグメントソケットにはめて、そのルーンを
 * アップグレードできる」。n 番目 (指していなければ左から最初に上げられる物) のソケットのルーンを 1 段上げる。傑作のルーンは残らない (使い切り)。
 * ティアの無い物 (ソウルコア・アイドル・特別なルーン) と最上段 (パーフェクト) には打てない
 */
function applyMasterwork(item: StageItem, socket: number | null): StageApply {
  const now = item.augments ?? [];
  const sockets = item.sockets ?? 0;
  if (!sockets) return skip(item, "ソケットが無い (先に熟練工のオーブ)");
  if (socket != null && (socket < 1 || socket > sockets)) return skip(item, `ソケットは ${sockets} つ (${socket} 番目は無い)`);
  const at = socket != null ? socket - 1 : now.findIndex((a) => !!upgradedRuneOf(a.en));
  const old = at >= 0 ? now[at] : undefined;
  if (!old) return skip(item, socket != null ? `${socket} 番目のソケットは空 (ティアを持つルーンがはまったソケットにだけ使える)` : "ティアを持つルーンがはまったソケットが無い");
  const oldRow = RUNES[old.en];
  if (!oldRow || oldRow.kind !== "rune" || !oldRow.tier || oldRow.tier === "special") return skip(item, `${old.ja}はティアを持たないので上げられない (ティアを持つルーンにだけ使える)`);
  if (oldRow.tier === "perfect") return skip(item, `${old.ja}はもうパーフェクトなので上げられない`);
  const nextEn = upgradedRuneOf(old.en);
  const next = nextEn ? RUNES[nextEn] : null;
  if (!nextEn || !next) return skip(item, `${old.ja}の 1 段上のルーンが表に無い`);
  const eff = runeEffectFor(next, item.cls.category);
  if (!eff) return skip(item, "この部位には効き目が無い");
  const aug: StageAugment = { key: `${RUNE_PREFIX}${nextEn}`, en: nextEn, ja: next.ja, cat: eff.catJa, textJa: eff.ja, textEn: eff.en, stats: eff.stats };
  return {
    applied: true,
    item: { ...item, augments: now.map((a, i) => (i === at ? aug : a)) },
    added: [],
    removed: [],
    augment: { socket: at + 1, put: aug, replaced: old, replacedGoes: null, upgraded: true },
  };
}

export function applyRune(item: StageItem, key: string): StageApply {
  const p = parseRuneKey(key)!;
  if (p.en === "Masterwork Rune") return applyMasterwork(item, p.socket);
  const rune = runeOf(key)!;
  const rule = augmentRule(p.en);
  const sockets = item.sockets ?? 0;
  const now = item.augments ?? [];
  if (rune.available === false) return skip(item, "今のゲームには無いルーン (相場に無い)");
  const place = placeBlock(rule, { category: item.cls.category, rarity: item.rarity, corrupted: item.corrupted, sanctified: item.sanctified }, !!runeEffectFor(rune, item.cls.category));
  if (place) return skip(item, place);
  if (!sockets) return skip(item, "ソケットが無い (先に熟練工のオーブ)");
  if (p.socket != null && (p.socket < 1 || p.socket > sockets)) return skip(item, `ソケットは ${sockets} つ (${p.socket} 番目は無い)`);
  // どのソケットに: 指した番号 > 空き > 左から最初の置き換えられる物
  let at: number;
  if (p.socket != null) at = Math.min(p.socket - 1, now.length);
  else if (now.length < sockets) at = now.length;
  else {
    at = now.findIndex((a) => replaceBlock(a) == null);
    // 全部置き換えられない: 一番左の物の理由 (ソケットバウンドなので … ) を出す
    if (at < 0) return skip(item, replaceBlock(now[0]!) ?? "置き換えられる物が無い");
  }
  const old = at < now.length ? now[at]! : null;
  if (old) {
    const why = replaceBlock(old);
    if (why) return skip(item, why);
  }
  const lim = limitBlock(p.en, now.filter((_, i) => i !== at).map((a) => a.en));
  if (lim) return skip(item, lim);
  const eff = runeEffectFor(rune, item.cls.category);
  if (!eff) return skip(item, "この部位には効き目が無い");
  // 手順のキーは @n を外して持つ (同じルーンなら同じキー。絵・相場もこれで引く)
  const aug: StageAugment = { key: `${RUNE_PREFIX}${p.en}`, en: p.en, ja: rune.ja, cat: eff.catJa, textJa: eff.ja, textEn: eff.en, stats: eff.stats };
  const augments = old ? now.map((a, i) => (i === at ? aug : a)) : [...now, aug];
  return {
    applied: true,
    item: { ...item, augments },
    added: [],
    removed: [],
    augment: { socket: at + 1, put: aug, replaced: old, replacedGoes: old ? augmentRule(old.en)!.replacedGoes : null },
  };
}
