/**
 * stage-mod-list-look.ts — StageModList.vue の見た目の表と名前の小物 (2026-10-22 StageModList が 500 行に届いたので分けた。中身は前のまま)。
 * 節の色 (TONE)・重みの出どころの文 (weightNote)・エッセンスの名前 (essName・tierName)
 */
import type { ListRow, ModGroup, StageItem } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { jewelEmotionJa } from "../../../services/htc/patch";
import { runeToneOf } from "../../../services/craft-stage/mod-list";
import essenceKeys from "../../../services/htc/essence-keys.json";
import { flag } from "../../../web/release-flags";

/** エッセンスの段の名前 (英語) → 日本語 */
const ESS_JA = new Map(Object.values((essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys).map((k) => [k.en, k.ja]));
/**
 * そのエッセンス / 合金の MOD を付ける物の名前 (2026-10-05 オーナー「エッセンスと合金は使うエッセンスを表示、タグの後ろに簡易的に名前」)。
 * 名前はカレンシーの棚と同じ引き方 (パーフェクトの深淵・ヒステリーなど essence-keys に無い物も出る)
 */
export function essName(r: ListRow, item: StageItem | null): string | null {
  if (r.group !== "essence" && r.group !== "perfect_essence") return null;
  // 完全エッセンスはエンジンの名前 (ListTier.essence)。棚の名前では深淵の完全エッセンスが日本語の画面でも英語のままだった (2026-10-24、スイッチ essTier)
  const perfect = r.group === "perfect_essence" ? r.tiers[0]?.essence : undefined;
  if (perfect && flag("essTier")) return tr(perfect.ja, perfect.en);
  const key = `essence:${r.group === "perfect_essence" ? "perfect" : "normal"}:${r.id}`;
  const n = nameOfKey(key, item);
  if (n && n !== key) return n;
  const top = r.tiers[0]?.name;
  return top ? tr(ESS_JA.get(top) ?? jewelEmotionJa(top) ?? top, top) : null;
}
export const tierName = (r: ListRow, name: string): string => (r.group === "essence" || r.group === "perfect_essence" ? tr(ESS_JA.get(name) ?? jewelEmotionJa(name) ?? name, name) : name);
/** 重みの出どころ (乗せた時に出す)。ゲームは公開していないので、こちらが入れた重み */
export const weightNote = (): Partial<Record<string, string>> => ({
  rune: tr("ルーンの特殊 MOD の重みは Craft of Exile (beta) が載せている実測 (Krakenbul / Prohibited Library、2026-09 更新)。ゲームは公開していない", "Rune special mod weights are community measurements published by Craft of Exile (beta) (Krakenbul / Prohibited Library, updated 2026-09). The game does not publish them"),
  desecrated: tr("冒涜専用 MOD どうしの重みは公開されていないので、全部等しく (均一) で引いている。候補 3 つのうち専用が 1 個 85% / 2 個 14% / 3 個 1% は Reddit の実測 (u/Civil-Bee-f、指輪 563 回の発現)", "Weights among desecrated-only mods are not published, so they are all rolled equally (uniform). The share of desecrated-only mods among the 3 options (1: 85% / 2: 14% / 3: 1%) is measured on Reddit (u/Civil-Bee-f, 563 ring reveals)"),
  otherworldly: tr("異界の MOD の重みは公開されていない。冒涜専用 MOD と同じ扱い (同じ重み) で引いている", "Otherworldly mod weights are not published. They are rolled the same way (same weights) as desecrated-only mods"),
});
/**
 * 種類の色 (普通 = 青、エッセンス = 水色、冒涜 = 淀んだ深緑のグラデーション、異界 = 緑がかった青。
 * 2026-10-05 オーナー「エッセンスは水色で普通は青、冒涜は深緑、冒涜の緑はよどんでる感じでふよふよってグラデーション」)
 */
const TONE: Record<ModGroup, { tab: string; bar: string }> = {
  normal: { tab: "bg-rarity-magic/25 text-[#c8c8ff] ring-1 ring-rarity-magic/60", bar: "bg-rarity-magic/10" },
  rune: { tab: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60", bar: "bg-amber-500/[0.08]" },
  essence: { tab: "bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/60", bar: "bg-sky-400/[0.08]" },
  perfect_essence: { tab: "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/60", bar: "bg-cyan-400/[0.08]" },
  desecrated: { tab: "bg-gradient-to-r from-green-900/70 via-emerald-800/40 to-lime-900/60 text-lime-100/90 ring-1 ring-green-700/70", bar: "bg-gradient-to-r from-green-950/40 via-emerald-900/25 to-lime-900/20" },
  otherworldly: { tab: "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/60", bar: "bg-teal-500/[0.08]" },
  special: { tab: "bg-white/10 text-[var(--exile-color-text-secondary)] ring-1 ring-white/25", bar: "bg-white/[0.04]" },
};
/** 節の色 (ルーンの節はルーンのアイコンの色) */
export const toneOf = (sec: { g: ModGroup; rune: string | null }): { tab: string; bar: string } => runeToneOf(sec.rune) ?? TONE[sec.g];
