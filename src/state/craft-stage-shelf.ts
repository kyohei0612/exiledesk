/**
 * craft-stage-shelf.ts — クラフトステージの棚に並べる物と、その名前・値段・アイコン (2026-09-27、ADR-001)
 *
 * オーナー:「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
 * 並べる物: オーブ (普通 / 上級 / 完全)、神・フラクチャー・アーティファサー・ヴァール、骨 (装備で種類が決まる)、エッセンス (そのベースで使える物)、
 * カタリスト (指輪・アミュレット)、お告げ。キーは計算機と同じ price-keys.json / essence-keys.json の物。
 * 値段とアイコンは相場 (market-store) の行を英語名で引く (計算機の buildHtcPrices と同じ引き方)。
 */
import { CRAFT_RUNES_EN } from "../services/htc/sockets";
import { isLegacyRune, LEGACY_SOURCE } from "../services/market/legacy-rune";
import priceKeys from "../services/htc/price-keys.json";
import { ESSENCE_KEYS } from "../services/htc/essence-key-table";
import essences from "../vendor/poe2htc/data/essences.json";
import { desecrationBoneFor } from "../vendor/poe2htc/engine/probability";
import { jaOfOmen } from "../services/htc/labels";
import { stepEn, stepJa } from "../services/craft-stage/run-plan";
import { OMEN_FOR } from "../services/craft-stage/omens";
import { isFlask, isGem } from "../services/craft-stage/stage-bases";
import { isRune, runeEffectFor, runeKeys, runeNameOf, runeOf } from "../services/craft-stage/stage-runes";
import { runeArt } from "../services/craft-stage/rune-art";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";
import { marketStore } from "./market-store";
import { lang, tr } from "../i18n/lang";

type Named = Record<string, { en: string; ja: string }>;
const KEYS = priceKeys as unknown as { currency: Named; bones: Named; omens: Named };
const ESS: Named = ESSENCE_KEYS;

export interface ShelfGroup { kind: string; label: string; keys: string[] }

/** オーブと、MOD を足し引きしない物 */
export const ORBS: ShelfGroup[] = [
  // label は英語の画面に切り替えた時も変わるように getter (2026-10-10 英語版)
  { kind: "transmute", get label() { return tr("変成", "Transmutation"); }, keys: ["transmute", "transmute_greater", "transmute_perfect"] },
  { kind: "augment", get label() { return tr("増強", "Augmentation"); }, keys: ["augment", "augment_greater", "augment_perfect"] },
  { kind: "regal", get label() { return tr("王者", "Regal"); }, keys: ["regal", "regal_greater", "regal_perfect"] },
  { kind: "alchemy", get label() { return tr("錬金", "Alchemy"); }, keys: ["alchemy"] },
  { kind: "exalt", get label() { return tr("高貴", "Exalted"); }, keys: ["exalt", "exalt_greater", "exalt_perfect"] },
  { kind: "chaos", get label() { return tr("カオス", "Chaos"); }, keys: ["chaos", "chaos_greater", "chaos_perfect"] },
  { kind: "annul", get label() { return tr("消去", "Annulment"); }, keys: ["annul"] },
  { kind: "other", get label() { return tr("その他", "Other"); }, keys: ["divine", "fracture", "artificer", "vaal", "chance", "hinekora"] },
  // 耐性のフラックス (2026-10-04 オーナー「カレンシーフルチェック」、apply-flux.ts)
  { kind: "flux", get label() { return tr("フラックス (耐性の変換)", "Flux (resistance conversion)"); }, keys: ["flux_fire", "flux_cold", "flux_lightning", "flux_chaos"] },
  // 2026-10-09 オーナー「カランドラとか抽出のオーブとか、クラフト要素ではあるけどエミュレーターに関係ないものは削除」で外した物:
  // 鏡・抽出・解呪・サルベージ / シャード 4 種 / アクトの品質・ジェム系 (砥石・鎧の欠片・ガラス玉・ジェムカッター・宝石職人・エッチャー・識別) /
  // ヴァールの道具 10 種 (インフューザー・生贄・アーキテクト・耕作・サイフォナー)。打つ処理 (apply-extra / apply-dispose) は古い手順の再生のため残す
];
/**
 * ルーン (ソケットにはめる。stage-runes.ts、POE2Tube 要望 ⑰-1)。2026-09-29 オーナー「ルーン関係タブでまとめてもいいかも」で棚の別のタブに。
 * アクト中に拾える下位 (レッサー) から段ごと。今のベースに効き目の無い物は出さない (runesFor)
 */
/**
 * クラフトに関わるルーン (クラフトの決まりを変える / 特別な MOD を足す)。棚は段ごとのまとまりのまま、初めはこれだけ出して他は畳む
 * (2026-10-04 オーナー「UI はさっきの方が好き。ルーンのとこでたたんでおけばおｋ、クラフトに関わる奴のみデフォで表示」)
 */
export const CRAFT_RUNE_KEYS: readonly string[] = CRAFT_RUNES_EN.map((en) => `rune:${en}`).filter((k) => runeOf(k));
export const RUNE_GROUPS: ShelfGroup[] = [
  { kind: "lesser", get label() { return tr("レッサー", "Lesser"); }, keys: runeKeys("lesser") },
  { kind: "normal", get label() { return tr("普通", "Normal"); }, keys: runeKeys("normal") },
  { kind: "greater", get label() { return tr("グレーター", "Greater"); }, keys: runeKeys("greater") },
  { kind: "perfect", get label() { return tr("パーフェクト", "Perfect"); }, keys: runeKeys("perfect") },
  { kind: "special", get label() { return tr("特別なルーン (古代・ウォード・人の名前の物など)", "Special runes (Ancient, Ward, named runes etc.)"); }, keys: runeKeys("special") },
  // ソウルコア・アイドルも (POE2Tube 要望 ㉘ 2026-10-04、手で打つ画面の棚に)
  { kind: "soulcore", get label() { return tr("ソウルコア", "Soul Cores"); }, keys: runeKeys(undefined, "soulcore") },
  { kind: "idol", get label() { return tr("アイドル", "Idols"); }, keys: runeKeys(undefined, "talisman") },
];
/**
 * 今のアイテムに効き目がある (効果のデータにこの部位の行がある) ルーンだけ
 * (グループごと、空のグループは出さない)。部位が説明文から読めない物 (傑作のルーン・アルダーの遺産) は出しておき、打つと理由が出る
 */
export function runesFor(item: StageItem | null): ShelfGroup[] {
  if (!item) return [];
  const fits = (k: string): boolean => {
    const r = runeOf(k);
    // 部位は効果のデータ (この部位に効果の行があるか) を正にする。説明文の部位とは 5 件食い違う (augment-rules.ts の placeBlock)
    // 傑作のルーンは自分の効き目を持たない (はまっているルーンを上げる) ので出しておく
    return !!r && (runeNameOf(k) === "Masterwork Rune" || !!runeEffectFor(r, item.cls.category));
  };
  return RUNE_GROUPS.map((g) => ({ ...g, keys: g.keys.filter(fits) })).filter((g) => g.keys.length);
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
  desecrate: "冒涜", reveal: "発現", vaal: "ヴァール", divine: "神", chance: "可能性",
};
const OMEN_LABEL_EN: Record<string, string> = {
  exalt: "Exalted", regal: "Regal", alchemy: "Alchemy", chaos: "Chaos", annul: "Annulment", essence_perfect: "Perfect Essence",
  desecrate: "Desecration", reveal: "Reveal", vaal: "Vaal", divine: "Divine", chance: "Chance",
};
/** お告げ (掛かる手の種類ごと) */
export const OMEN_GROUPS: ShelfGroup[] = Object.entries(OMEN_FOR).map(([kind, keys]) => ({ kind, get label() { return tr(OMEN_LABEL[kind] ?? kind, OMEN_LABEL_EN[kind] ?? kind); }, keys: [...keys] }));

/** そのベースで使えるエッセンス (名前ごとに レッサー / 普通 / グレーター / パーフェクト) */
export function essenceShelf(data: PatchData | null, item: StageItem | null): ShelfGroup[] {
  if (!data || !item) return [];
  const pool = new Set([...item.cls.pools.essence.prefixes, ...item.cls.pools.essence.suffixes]);
  const out: ShelfGroup[] = [];
  for (const e of (essences as { essences: Array<{ name: string; tiers: Record<string, string[]> }> }).essences) {
    const keys: string[] = [];
    for (const [lvl, ids] of Object.entries(e.tiers)) {
      // 写した MOD (poe2db に合わせて足した物、essence-key-table) は essences.json に無いので、同じ名前の鍵を持つ置き場の MOD も見る
      const en = ids.map((x) => ESS[`essence:${lvl.toLowerCase()}:${x}`]?.en).find(Boolean);
      const id = ids.find((x) => pool.has(x)) ?? (en ? [...pool].find((x) => ESS[`essence:${lvl.toLowerCase()}:${x}`]?.en === en) : undefined);
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
  if (isRune(key)) return runeNameOf(key);
  if (BONES.includes(key) && item) {
    const bone = desecrationBoneFor(item.cls.category);
    const suffix = /^desecrate_(ancient|altered|gnawed)$/.exec(key)?.[1];
    const k = suffix ? `${bone}_${suffix}` : bone;
    return KEYS.bones[k]?.en ?? key;
  }
  return KEYS.currency[key]?.en ?? KEYS.omens[key]?.en ?? KEYS.bones[key]?.en ?? key;
}
const row = (key: string, item: StageItem | null) => marketStore.items.value.find((x) => x.Text === enOf(key, item));
/** 1 個の値段 (高貴建て、相場。無ければ 0。発現は 0) */
export function priceOfKey(key: string, item: StageItem | null): number {
  const it = row(key, item);
  const p = it && typeof it.CurrentPrice === "number" ? it.CurrentPrice : 0;
  // 遺産のルーンは相場に値段が無い → アルダーの遺産の値段 (legacy-rune.ts)
  if (p <= 0 && isRune(key) && isLegacyRune(runeNameOf(key))) return marketStore.items.value.find((x) => x.Text === LEGACY_SOURCE)?.CurrentPrice ?? 0;
  return p;
}
/** アイコン: 相場の行の絵。ルーンは相場に無い物もあるのでクライアントから書き出した絵 (rune-art) を先に */
export const iconOfKey = (key: string, item: StageItem | null): string => (isRune(key) ? runeArt(runeNameOf(key)) : null) ?? row(key, item)?.IconUrl ?? "";
/** 日本語名 (お告げ・発現も) */
export function nameOfKey(key: string, item: StageItem | null): string {
  // 英語の画面ではゲームの英語名 (無い物 = 発現などは日本語のまま。2026-10-10 英語版)
  if (lang.value === "en") { const st = stepEn(key); if (st) return st; const en = enOf(key, item); if (en !== key) return en; }
  if (KEYS.omens[key]) return jaOfOmen(key) ?? key;
  if (!item) return KEYS.currency[key]?.ja ?? key;
  return stepJa(key, item);
}
