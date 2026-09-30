/**
 * craft-stage-shelf.ts — クラフトステージの棚に並べる物と、その名前・値段・アイコン (2026-09-27、ADR-001)
 *
 * オーナー:「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
 * 並べる物: オーブ (普通 / 上級 / 完全)、神・破砕・アーティファサー・ヴァール、骨 (装備で種類が決まる)、エッセンス (そのベースで使える物)、
 * カタリスト (指輪・アミュレット)、お告げ。キーは計算機と同じ price-keys.json / essence-keys.json の物。
 * 値段とアイコンは相場 (market-store) の行を英語名で引く (計算機の buildHtcPrices と同じ引き方)。
 */
import { isLegacyRune, LEGACY_SOURCE } from "../services/market/legacy-rune";
import priceKeys from "../services/htc/price-keys.json";
import essenceKeys from "../services/htc/essence-keys.json";
import essences from "../vendor/poe2htc/data/essences.json";
import { desecrationBoneFor } from "../vendor/poe2htc/engine/probability";
import { jaOfOmen } from "../services/htc/labels";
import { stepJa } from "../services/craft-stage/run-plan";
import { OMEN_FOR } from "../services/craft-stage/omens";
import { isFlask, isGem } from "../services/craft-stage/stage-bases";
import { isRune, runeEffectFor, runeKeys, runeOf, RUNE_PREFIX } from "../services/craft-stage/stage-runes";
import { runeArt } from "../services/craft-stage/rune-art";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";
import { marketStore } from "./market-store";

type Named = Record<string, { en: string; ja: string }>;
const KEYS = priceKeys as unknown as { currency: Named; bones: Named; omens: Named };
const ESS = (essenceKeys as { keys: Named }).keys;

export interface ShelfGroup { kind: string; label: string; keys: string[] }

/** オーブと、MOD を足し引きしない物 */
export const ORBS: ShelfGroup[] = [
  { kind: "transmute", label: "変成", keys: ["transmute", "transmute_greater", "transmute_perfect"] },
  { kind: "augment", label: "増強", keys: ["augment", "augment_greater", "augment_perfect"] },
  { kind: "regal", label: "王者", keys: ["regal", "regal_greater", "regal_perfect"] },
  { kind: "alchemy", label: "錬金", keys: ["alchemy"] },
  { kind: "exalt", label: "高貴", keys: ["exalt", "exalt_greater", "exalt_perfect"] },
  { kind: "chaos", label: "カオス", keys: ["chaos", "chaos_greater", "chaos_perfect"] },
  { kind: "annul", label: "消去", keys: ["annul"] },
  { kind: "other", label: "その他", keys: ["divine", "fracture", "artificer", "vaal"] },
  // アクト中に落ちる物 (2026-09-28、POE2Tube 要望 ⑧)
  { kind: "act", label: "アクト", keys: ["wisdom", "chance", "whetstone", "scrap", "bauble", "gemcutter", "jeweller_lesser", "jeweller_greater", "jeweller_perfect", "etcher"] },
  // 2026-09-29 オーナー「全部足して」: 今の相場にあって棚に無かった物 (apply-extra.ts)
  { kind: "vaal_extra", label: "ヴァール", keys: ["vaal_infuser_jewellery", "vaal_infuser_armour", "vaal_infuser_martial", "vaal_infuser_caster", "sacrifice_jewellery", "sacrifice_armour", "sacrifice_weapon", "architect", "cultivation", "siphoner"] },
  { kind: "special", label: "特殊", keys: ["mirror", "hinekora", "extraction"] },
  { kind: "shard", label: "シャード", keys: ["transmute_shard", "regal_shard", "artificer_shard", "chance_shard"] },
  // 2026-09-29 (POE2Tube 要望 ⑰-5): 解呪・サルベージ (アイテムは無くなり、シャード・品質カレンシーになる。apply-dispose.ts)
  { kind: "dispose", label: "解呪・サルベージ", keys: ["disenchant", "salvage"] },
];
/**
 * ルーン (ソケットにはめる。stage-runes.ts、POE2Tube 要望 ⑰-1)。2026-09-29 オーナー「ルーン関係タブでまとめてもいいかも」で棚の別のタブに。
 * アクト中に拾える下位 (レッサー) から段ごと。今のベースに効き目の無い物は出さない (runesFor)
 */
export const RUNE_GROUPS: ShelfGroup[] = [
  { kind: "lesser", label: "レッサー", keys: runeKeys("lesser") },
  { kind: "normal", label: "普通", keys: runeKeys("normal") },
  { kind: "greater", label: "グレーター", keys: runeKeys("greater") },
  { kind: "perfect", label: "パーフェクト", keys: runeKeys("perfect") },
  { kind: "special", label: "特別なルーン (古代・ウォード・人の名前の物など)", keys: runeKeys("special") },
];
/** 今のアイテムに効き目があるルーンだけ (段ごと、空の段は出さない) */
export function runesFor(item: StageItem | null): ShelfGroup[] {
  if (!item) return [];
  return RUNE_GROUPS.map((g) => ({ ...g, keys: g.keys.filter((k) => { const r = runeOf(k); return !!r && !!runeEffectFor(r, item.cls.category); }) })).filter((g) => g.keys.length);
}
export const BONES = ["desecrate_gnawed", "desecrate", "desecrate_ancient", "desecrate_altered"];
/**
 * 今のアイテムに出す骨。変質した鎖骨は装飾品だけ (武器・防具には「変質した」骨が無く、相場の行も絵も引けなかった。2026-09-29 オーナー「イラストエラー」)。
 * フラスコ・スキルジェムは冒涜できないので出さない
 */
export function bonesFor(item: StageItem | null): string[] {
  if (!item || isFlask(item.cls.category) || isGem(item.cls.category)) return [];
  return desecrationBoneFor(item.cls.category) === "collarbone" ? BONES : BONES.filter((k) => k !== "desecrate_altered");
}
export const CATALYSTS = Object.keys(KEYS.currency).filter((k) => k.startsWith("catalyst_"));
const OMEN_LABEL: Record<string, string> = {
  exalt: "高貴", regal: "王者", alchemy: "錬金", chaos: "カオス", annul: "消去", essence_perfect: "パーフェクトエッセンス",
  desecrate: "冒涜", reveal: "開示", vaal: "ヴァール", divine: "神",
};
/** お告げ (掛かる手の種類ごと) */
export const OMEN_GROUPS: ShelfGroup[] = Object.entries(OMEN_FOR).map(([kind, keys]) => ({ kind, label: OMEN_LABEL[kind] ?? kind, keys: [...keys] }));

/** そのベースで使えるエッセンス (名前ごとに レッサー / 普通 / グレーター / パーフェクト) */
export function essenceShelf(data: PatchData | null, item: StageItem | null): ShelfGroup[] {
  if (!data || !item) return [];
  const pool = new Set([...item.cls.pools.essence.prefixes, ...item.cls.pools.essence.suffixes]);
  const out: ShelfGroup[] = [];
  for (const e of (essences as { essences: Array<{ name: string; tiers: Record<string, string[]> }> }).essences) {
    const keys: string[] = [];
    for (const [lvl, ids] of Object.entries(e.tiers)) {
      const id = ids.find((x) => pool.has(x));
      const key = id ? `essence:${lvl.toLowerCase()}:${id}` : null;
      if (key && ESS[key]) keys.push(key);
    }
    if (keys.length) out.push({ kind: e.name, label: e.name, keys });
  }
  // ブリーチのエッセンスは essences.json の "the Breach" (essence:perfect:…LocalMaximumQuality) で並ぶ。essence:breach は手順 JSON 用の別名
  return out;
}

/** キーの英語名 (相場の行を引く鍵)。骨は装備で種類が決まる */
export function enOf(key: string, item: StageItem | null): string {
  if (key.startsWith("essence:") && ESS[key]) return ESS[key].en;
  if (isRune(key)) return key.slice(RUNE_PREFIX.length);
  if (BONES.includes(key) && item) {
    const bone = desecrationBoneFor(item.cls.category);
    const suffix = /^desecrate_(ancient|altered|gnawed)$/.exec(key)?.[1];
    const k = suffix ? `${bone}_${suffix}` : bone;
    return KEYS.bones[k]?.en ?? key;
  }
  return KEYS.currency[key]?.en ?? KEYS.omens[key]?.en ?? KEYS.bones[key]?.en ?? key;
}
const row = (key: string, item: StageItem | null) => marketStore.items.value.find((x) => x.Text === enOf(key, item));
/** 1 個の値段 (高貴建て、相場。無ければ 0。開示は 0) */
export function priceOfKey(key: string, item: StageItem | null): number {
  const it = row(key, item);
  const p = it && typeof it.CurrentPrice === "number" ? it.CurrentPrice : 0;
  // 遺産のルーンは相場に値段が無い → アルダーの遺産の値段 (legacy-rune.ts)
  if (p <= 0 && isRune(key) && isLegacyRune(key.slice(RUNE_PREFIX.length))) return marketStore.items.value.find((x) => x.Text === LEGACY_SOURCE)?.CurrentPrice ?? 0;
  return p;
}
/** アイコン: 相場の行の絵。ルーンは相場に無い物もあるのでクライアントから書き出した絵 (rune-art) を先に */
export const iconOfKey = (key: string, item: StageItem | null): string => (isRune(key) ? runeArt(key.slice(RUNE_PREFIX.length)) : null) ?? row(key, item)?.IconUrl ?? "";
/** 日本語名 (お告げ・開示も) */
export function nameOfKey(key: string, item: StageItem | null): string {
  if (KEYS.omens[key]) return jaOfOmen(key) ?? key;
  if (!item) return KEYS.currency[key]?.ja ?? key;
  return stepJa(key, item);
}
