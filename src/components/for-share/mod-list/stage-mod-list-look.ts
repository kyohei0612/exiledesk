/**
 * stage-mod-list-look.ts — StageModList.vue の見た目の表と名前の小物 (2026-10-22 StageModList が 500 行に届いたので分けた。中身は前のまま)。
 * 節の色 (TONE)・重みの出どころの文 (weightNote)・エッセンスの名前 (essName・tierName)
 */
import { DESECRATION_EXCLUSIVE_COUNT, ESSENCE_KEYS, essenceKey, isEssenceGroup, type ListRow, type ModGroup, type StageItem } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { jewelEmotionJa } from "../../../services/htc/patch";
import { runeToneOf } from "../../../services/craft-stage/mod-list";
import { flag } from "../../../web/release-flags";

/** エッセンスの段の名前 (英語) → 日本語 */
const ESS_JA = new Map(Object.values(ESSENCE_KEYS).map((k) => [k.en, k.ja]));
/**
 * そのエッセンス / 合金の MOD を付ける物の名前 (2026-10-05 オーナー「エッセンスと合金は使うエッセンスを表示、タグの後ろに簡易的に名前」)。
 * 名前はカレンシーの棚と同じ引き方 (パーフェクトの深淵・ヒステリーなど essence-keys に無い物も出る)
 */
export function essName(r: ListRow, item: StageItem | null): string | null {
  if (!isEssenceGroup(r.group)) return null;
  // 完全エッセンスはエンジンの名前 (ListTier.essence)。棚の名前では深淵の完全エッセンスが日本語の画面でも英語のままだった (2026-10-24、スイッチ essTier)
  const perfect = r.group === "perfect_essence" ? r.tiers[0]?.essence : undefined;
  if (perfect && flag("essTier")) return tr(perfect.ja, perfect.en);
  const key = essenceKey(r.group === "perfect_essence" ? "perfect" : "normal", r.id);
  const n = nameOfKey(key, item);
  if (n && n !== key) return n;
  const top = r.tiers[0]?.name;
  return top ? tr(ESS_JA.get(top) ?? jewelEmotionJa(top) ?? top, top) : null;
}
export const tierName = (r: ListRow, name: string): string => (isEssenceGroup(r.group) ? tr(ESS_JA.get(name) ?? jewelEmotionJa(name) ?? name, name) : name);
/** 冒涜専用 MOD が候補 3 つに入る数の割合 (エンジンの DESECRATION_EXCLUSIVE_COUNT) */
const exPct = (unit: string, sep: string): string => DESECRATION_EXCLUSIVE_COUNT.map((c) => `${c.exclusive}${unit} ${Math.round(c.rate * 100)}%`).join(sep);
/** 重みの出どころ (札を乗せた・押した時に「・」の縦の箇条書きで出す、U-18)。ゲームは公開していないので、こちらが入れた重み */
export const weightNote = (): Partial<Record<string, string[]>> => ({
  rune: [
    tr("ゲームはルーンの特殊 MOD の重みを公表していない", "The game does not publish rune special mod weights"),
    tr("Craft of Exile (beta) が載せている実測を使っている (Krakenbul / Prohibited Library、2026-09 更新)", "Uses the community measurements published by Craft of Exile (beta) (Krakenbul / Prohibited Library, updated 2026-09)"),
    tr("Craft of Exile に無い物 (約 30 件) は仮の 1000", "The ~30 mods Craft of Exile lacks use a placeholder 1000"),
    tr("% は目安として見る", "Treat the % as estimates"),
  ],
  desecrated: [
    tr("ゲームは冒涜専用 MOD どうしの重みを公表していない", "The game does not publish weights among desecrated-only mods"),
    tr("ここでは全部等しく (均一) で引いている", "Here they are all rolled equally (uniform)"),
    tr(`候補 3 つのうち専用が ${exPct(" 個", " / ")} は Reddit の実測 (u/Civil-Bee-f、指輪 563 回の発現)`, `The share of desecrated-only mods among the 3 options (${exPct(":", " / ")}) is measured on Reddit (u/Civil-Bee-f, 563 ring reveals)`),
    tr("% は目安として見る", "Treat the % as estimates"),
  ],
  otherworldly: [
    tr("ゲームは異界の MOD の重みを公表していない", "The game does not publish otherworldly mod weights"),
    tr("冒涜専用 MOD と同じ扱い (同じ重み) で引いている", "They are rolled the same way (same weights) as desecrated-only mods"),
    tr("% は目安として見る", "Treat the % as estimates"),
  ],
});
/** ジュエルの MOD の重みの出どころ (ゲームは公表していない。poe2db も Craft of Exile も全部 1 なので、サイトが全部同じ重み = 均一にした。冒涜は仮の 2500。11-09 オーナー) */
export const jewelWeightNote = (): string[] => [
  tr("ゲームはジュエルの MOD の重みを公表していない", "The game does not publish jewel mod weights"),
  tr("poe2db・Craft of Exile も全部同じ値", "poe2db and Craft of Exile list them all the same"),
  tr("ここでは全部同じ重み (均一) で引いている。冒涜の MOD は仮の重み", "Here every mod rolls with the same weight (uniform); desecrated mods use a placeholder weight"),
  tr("% は目安として見る", "Treat the % as estimates"),
];
/** 一般の MOD の重みの出どころ (poe2db の値 = PoE1 の同じ系統の重みを当てた推定。11-09 オーナー「全部それで」= 一般の節にも札) */
const normalWeightNote = (): string[] => [
  tr("ゲームは一般の MOD の重みを公表していない", "The game does not publish regular mod weights"),
  tr("poe2db の値を使っている (PoE1 の同じ系統の重みを当てた推定)", "Uses poe2db's values (estimated from the matching PoE1 mod groups)"),
  tr("poe2db に無い物 (キャストスピードなど) は Craft of Exile の値や同じ系統から借りた値で、行に「重みは推定」の札", "Mods poe2db lacks (e.g. Cast Speed) use Craft of Exile's value or one borrowed from a matching group, marked \"Est. weight\" on the row"),
  tr("% は目安として見る", "Treat the % as estimates"),
];
/** 節の見出しの青の札 (U-18): 短い文と出どころの行。札の無い節は null (エッセンス・創生の樹など重みで引かない節) */
export function sectionNote(g: string, rune: boolean, jewel: boolean): { short: string; detail: string[] } | null {
  const own = weightNote()[rune ? "rune" : g];
  if (own) return { short: tr("重みはゲーム非公表。コミュニティのデータの目安", "Weights aren't published. Community estimates"), detail: own };
  if (jewel) return { short: tr("重みはゲーム非公表。全部同じ重みの仮", "Weights aren't published. All equal (placeholder)"), detail: jewelWeightNote() };
  if (g === "normal") return { short: tr("重みはゲーム非公表。poe2db の推定", "Weights aren't published. poe2db estimates"), detail: normalWeightNote() };
  return null;
}
/**
 * 種類の色 (普通 = 青、エッセンス = 水色、冒涜 = 淀んだ深緑のグラデーション、異界 = 緑がかった青。
 * 2026-10-05 オーナー「エッセンスは水色で普通は青、冒涜は深緑、冒涜の緑はよどんでる感じでふよふよってグラデーション」)
 */
const TONE: Record<ModGroup, { tab: string; bar: string }> = {
  normal: { tab: "bg-rarity-magic/25 text-stage-mod ring-1 ring-rarity-magic/60", bar: "bg-rarity-magic/10" },
  rune: { tab: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60", bar: "bg-amber-500/[0.08]" },
  essence: { tab: "bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/60", bar: "bg-sky-400/[0.08]" },
  perfect_essence: { tab: "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/60", bar: "bg-cyan-400/[0.08]" },
  desecrated: { tab: "bg-gradient-to-r from-green-900/70 via-emerald-800/40 to-lime-900/60 text-lime-100/90 ring-1 ring-green-700/70", bar: "bg-gradient-to-r from-green-950/40 via-emerald-900/25 to-lime-900/20" },
  otherworldly: { tab: "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/60", bar: "bg-teal-500/[0.08]" },
  special: { tab: "bg-white/10 text-[var(--exile-color-text-secondary)] ring-1 ring-white/25", bar: "bg-white/[0.04]" },
};
/** 節の色 (ルーンの節はルーンのアイコンの色) */
export const toneOf = (sec: { g: ModGroup; rune: string | null }): { tab: string; bar: string } => runeToneOf(sec.rune) ?? TONE[sec.g];
