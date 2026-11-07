/**
 * daily-aims.ts — 貼った文・エミュのアイテムをお題の狙いにする (D-13・D-14) と、お題を木にする (D-03)。
 * 読むのはエンジンの parseItemText、断るのは goalBlock。tree-paste の aimsOfReading と同じ形の写しで、シミュ部長が純粋な関数にしたら差し替える (D-41 ③)。
 */
import { goalBlock } from "../../services/simulator/sim-engine";
import { parseItemText } from "../../services/simulator/paste/item-text";
import type { ItemTextMod, ItemTextResult } from "../../services/simulator/paste/item-text-types";
import { tierRankLabel, tierRankOf, type PatchData, type StageItem } from "../../services/craft-stage/engine";
import { aimTextsOf } from "./daily-gen";
import { migrateStart, startRarity, type Aim, type StartFrom, type TreeDoc } from "../../services/simulator/tree/tree-model";
import { tr } from "../../i18n/lang";
import type { DailyAim } from "./daily-api";

export type PostItem = { base: string; baseJa: string; ilvl: number; aims: DailyAim[]; bad: Array<{ line: string; why: string }> };

const tierOf = (m: ItemTextMod): number => Number(m.tier!.label.replace(/^T/, ""));

function take(data: PatchData, base: { en: string; ja: string }, ilvl: number, mods: readonly ItemTextMod[], bad: PostItem["bad"]): PostItem {
  const aims: DailyAim[] = [];
  // 狙いの字はお題 (daily-gen の aimsOfSample) と同じ MOD 一覧の行の字にする (貼った文のままだと日本語の画面でも英語が出た、11-05)
  // ja・en は言語ごとの字 (aimTextsOf)。引けなければ貼った文のまま
  const textOf = aimTextsOf(data, base.en, ilvl);
  for (const m of mods) {
    if (m.unrevealed) { bad.push({ line: m.text, why: tr("未発現の MOD はお題にできない", "Unrevealed mods can't be used") }); continue; }
    if (!m.modId || !m.tier) { bad.push({ line: m.text, why: tr("MOD が分からない", "Unknown mod") }); continue; }
    if (aims.some((a) => a.modId === m.modId)) continue;
    const why = goalBlock(data, base.en, ilvl, aims.map((a) => ({ modId: a.modId, tier: a.tier })), { modId: m.modId, tier: tierOf(m) });
    if (why) { bad.push({ line: m.text, why }); continue; }
    aims.push({ modId: m.modId, tier: tierOf(m), ...(textOf(m.modId, tierOf(m)) ?? { ja: m.text, en: m.text }) });
  }
  return { base: base.en, baseJa: base.ja, ilvl, aims, bad };
}

/** 貼った文を読む。ベースが読めなければ理由の文字列 */
export function itemFromText(data: PatchData, text: string): PostItem | string {
  const r: ItemTextResult = parseItemText(data, text);
  if (!r.base) return r.skipped[0] ? tr(r.skipped[0].reason.ja, r.skipped[0].reason.en) : tr("ベースが読めない", "Couldn't read the base");
  if (r.rarity === "unique") return tr("ユニークはお題にできない", "Uniques can't be used");
  const reading = r.readings?.[0] ?? { mods: r.mods, skipped: r.skipped };
  return take(data, r.base, r.itemLevel ?? 82, reading.mods, reading.skipped.map((x) => ({ line: x.line, why: tr(x.reason.ja, x.reason.en) })));
}

/** エミュのアイテムを読む (エミュの「シミュレーターへ」と同じ渡し方) */
export function itemFromEmu(data: PatchData, item: StageItem): PostItem {
  const mods = [...item.prefixes, ...item.suffixes].map((m) => {
    const known = data.mods.has(m.modId), text = tr(m.textJa, m.textEn);
    return { text, modId: m.unrevealed ? null : m.modId, unrevealed: !!m.unrevealed, tier: known && !m.unrevealed ? { label: tierRankLabel(tierRankOf(data, m.modId, m.tierIndex), false) } : null } as ItemTextMod;
  });
  return take(data, { en: item.base, ja: item.baseJa }, item.itemLevel, mods, []);
}

/** 投稿で弾く時の訳 (D-14)。無ければ null */
export function postBlock(p: PostItem): string | null {
  if (!p.aims.length) return tr("お題にできる MOD が 1 つも無い", "No usable mods");
  if (p.bad.length) return tr("読めなかった行があるので、この形では投稿できない", "Some lines couldn't be read, so this can't be posted");
  return null;
}

/** お題の木を作る: ✦ を 1 つ付け、(a) フラクチャー済みから / (b) 白から確定フラクチャー (four)。始めの値段は数えない (D-03・D-37j)。木の中身は edit に渡す */
export function fillTopicDoc(d: TreeDoc, aims: readonly DailyAim[], fractured: string, from: StartFrom = "fractured"): void {
  const list: Aim[] = aims.map((a) => ({ modId: a.modId, tier: a.tier, ...(a.modId === fractured ? { fractured: true as const } : {}) }));
  d.memoAims = list;
  delete d.ilvlFit; // アイテムレベルはお題のまま (適正へ下げない)
  d.fracAsked = true;
  d.baseChosen = true;
  d.goal = { rarity: "rare" };
  migrateStart(d);
  d.start!.from = from;
  d.start!.price = 0;
  d.start!.mods = d.start!.mods.filter((m) => !list.some((a) => a.fractured && a.modId === m.modId));
  d.start!.rarity = startRarity(d);
}
