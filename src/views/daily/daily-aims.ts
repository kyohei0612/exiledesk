/**
 * daily-aims.ts — 貼った文・エミュのアイテムをお題の狙いにする (D-13・D-14) と、お題を木にする (D-03)。
 * 読むのはエンジンの parseItemText、断るのは goalBlock。tree-paste の aimsOfReading と同じ形の写しで、シミュ部長が純粋な関数にしたら差し替える (D-41 ③)。
 */
import { goalBlock } from "../../services/simulator/sim-engine";
import { parseItemText } from "../../services/simulator/paste/item-text";
import type { ItemTextMod, ItemTextResult } from "../../services/simulator/paste/item-text-types";
import { tierRankLabel, tierRankOf, type Force, type PatchData, type StageItem } from "../../services/craft-stage/engine";
import { aimTextsOf } from "./daily-gen";
import { migrateStart, startRarity, type Aim, type StartFrom, type TreeDoc } from "../../services/simulator/tree/tree-model";
import { tr } from "../../i18n/lang";
import type { DailyAim } from "./daily-api";
import { genesisOver, genesisWhy, isGenesis, isGenesisLine } from "./daily-check";

/**
 * 狙いに入らなかった行。soft = 読めなかった行ではない (2 行で 1 つの MOD のもう 1 行 = もう数えてある・トレードの合計の行 = MOD ではない)。
 * スイッチ dailyPostLoose の下では soft の行を赤字に出さない (D-14b)
 */
export type PostBad = { line: string; why: string; soft?: boolean };
/** 読みが飛ばした行のうち、読めなかった行に数えない物 (D-14b) */
const SOFT_SKIP: ReadonlySet<string> = new Set(["hybridPart", "pseudoTotal"]);
export type PostItem = { base: string; baseJa: string; ilvl: number; aims: DailyAim[]; bad: PostBad[]; /** 狙いと同じ順の「始めの MOD」(エンジンの Force)。投稿には送らず、確かめの品を投稿の中のエミュに載せる時に渡す (D-12b)。フラクチャーの印は読んだ品の物をそのまま流す */ start: Force[] };

const tierOf = (m: ItemTextMod): number => Number(m.tier!.label.replace(/^T/, ""));

function take(data: PatchData, base: { en: string; ja: string }, ilvl: number, mods: readonly ItemTextMod[], bad: PostItem["bad"]): PostItem {
  const aims: DailyAim[] = [];
  const start: Force[] = [];
  // 狙いの字はお題 (daily-gen の aimsOfSample) と同じ MOD 一覧の行の字にする (貼った文のままだと日本語の画面でも英語が出た、11-05)
  // ja・en は言語ごとの字 (aimTextsOf)。引けなければ貼った文のまま
  const textOf = aimTextsOf(data, base.en, ilvl);
  for (const m of mods) {
    if (m.unrevealed) { bad.push({ line: m.text, why: tr("未発現の MOD はお題にできない", "Unrevealed mods can't be used") }); continue; }
    if (!m.modId || !m.tier) { bad.push({ line: m.text, why: tr("MOD が分からない", "Unknown mod") }); continue; }
    if (aims.some((a) => a.modId === m.modId)) continue;
    // 創生の樹の MOD は 1 つまで (D-14)。2 つ目からは行に訳を出す (エンジンの goalBlock は創生の樹を数えない)
    if (genesisOver(data, [...aims, { modId: m.modId }])) { bad.push({ line: m.text, why: genesisWhy() }); continue; }
    const why = goalBlock(data, base.en, ilvl, aims.map((a) => ({ modId: a.modId, tier: a.tier })), { modId: m.modId, tier: tierOf(m) });
    if (why) { bad.push({ line: m.text, why }); continue; }
    aims.push({ modId: m.modId, tier: tierOf(m), ...(textOf(m.modId, tierOf(m)) ?? { ja: m.text, en: m.text }) });
    start.push({ mod: m.modId, tier: m.tier.label, fractured: m.fractured });
  }
  return { base: base.en, baseJa: base.ja, ilvl, aims, bad, start };
}

/** 貼った文を読む。ベースが読めなければ理由の文字列 */
export function itemFromText(data: PatchData, text: string): PostItem | string {
  const r: ItemTextResult = parseItemText(data, text);
  if (!r.base) return r.skipped[0] ? tr(r.skipped[0].reason.ja, r.skipped[0].reason.en) : tr("ベースが読めない", "Couldn't read the base");
  if (r.rarity === "unique") return tr("ユニークはお題にできない", "Uniques can't be used");
  const reading = r.readings?.[0] ?? { mods: r.mods, skipped: r.skipped };
  const p = take(data, r.base, r.itemLevel ?? 82, reading.mods, reading.skipped.map((x) => ({ line: x.line, why: tr(x.reason.ja, x.reason.en), ...(SOFT_SKIP.has(x.code) ? { soft: true } : {}) })));
  return genesisLines(data, p, text);
}

/**
 * 貼る口の創生の樹 (D-14): 読みは創生の樹の行を読めない行 (ドロップ限定・説明できない) にするので、狙いと読めない行を合わせて 2 つ目から訳を創生の樹の物にする。
 * 1 つだけなら今のまま (ドロップ限定の訳)。数える順は貼った文の行の順
 */
function genesisLines(data: PatchData, p: PostItem, text: string): PostItem {
  const order = text.split(/\r?\n/).map((l) => l.trim());
  const at = (line: string): number => order.indexOf(line.trim());
  const rows = [
    ...p.aims.filter((a) => isGenesis(data, a.modId)).map(() => ({ at: -1, bad: null as PostItem["bad"][number] | null })),
    ...p.bad.filter((b) => b.why !== genesisWhy() && isGenesisLine(data, b.line)).map((b) => ({ at: at(b.line), bad: b })),
  ].sort((a, b) => a.at - b.at);
  const already = p.bad.filter((b) => b.why === genesisWhy()).length;
  if (rows.length + already < 2) return p;
  rows.slice(already ? 0 : 1).forEach((r) => { if (r.bad) r.bad.why = genesisWhy(); });
  return p;
}

/** エミュのアイテムを読む (エミュの「シミュレーターへ」と同じ渡し方) */
export function itemFromEmu(data: PatchData, item: StageItem): PostItem {
  const mods = [...item.prefixes, ...item.suffixes].map((m) => {
    const known = data.mods.has(m.modId), text = tr(m.textJa, m.textEn);
    return { text, modId: m.unrevealed ? null : m.modId, unrevealed: !!m.unrevealed, fractured: !!m.fractured, tier: known && !m.unrevealed ? { label: tierRankLabel(tierRankOf(data, m.modId, m.tierIndex), false) } : null } as ItemTextMod;
  });
  return take(data, { en: item.base, ja: item.baseJa }, item.itemLevel, mods, []);
}

/**
 * 投稿で弾く時の訳 (D-14)。無ければ null。
 * loose (D-14b、スイッチ dailyPostLoose): 狙いに入らなかった行があっても止めない = 止めるのはお題にできる MOD が 0 の時だけ
 * (MOD の数が足りない時は呼ぶ側 DailyPost が fullMods で止める)。オーナー 11-12「これ弾くタイミングは６MODじゃないとき以外は弾かなくてよくねって思うし」
 */
export function postBlock(p: PostItem, loose = false): string | null {
  if (!p.aims.length) return tr("お題にできる MOD が 1 つも無い", "No usable mods");
  if (!loose && p.bad.length) return tr("読めなかった行があるので、この形では投稿できない", "Some lines couldn't be read, so this can't be posted");
  return null;
}

/** 確かめの画面に赤字で出す行 (D-14b): loose の時は読めなかった行だけ (soft を除く)、そうでなければ今までどおり全部 */
export const shownBad = (p: PostItem, loose: boolean): PostBad[] => (loose ? p.bad.filter((b) => !b.soft) : p.bad);
/** 読んだ品のフラクチャーの印を、狙いと同じ順で (確かめのカードに出すだけ。お題には引き継がない = フラクチャーは挑戦する人が選ぶ、D-03) */
export const postFractured = (p: PostItem): boolean[] => p.start.map((f) => !!f.fractured);

/** 「フラクチャー無し」を選んだ印 (DailyTry.fractured に入れる。どの狙いにも当たらないので ✦ は付かず、白い品から始まる。D-03・D-37j、11-12 のお題から) */
export const NO_FRAC = "none";
/** お題の木を作る: ✦ を 1 つ付け (フラクチャー無しなら付けない)、(a) フラクチャー済みから / (b) 白から確定フラクチャー (four)。始めの値段は数えない (D-03・D-37j)。木の中身は edit に渡す */
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
  d.start!.sureFrac = true; // デイリーの印: 「ベースから」のフラクチャーは選んだ MOD が必ず付き、費用は 3 回分 (D-03・S-43a)
  // フラクチャー無しで始めた木は、手の棚でフラクチャーのオーブを打たせない (S-13b、11-11 オーナー「フラクチャー無しはフラクチャーオーブ無いようにしないとね詰まるから」)
  if (list.some((a) => a.fractured)) delete d.start!.noFracOrb; else d.start!.noFracOrb = true;
  // 始めの品に MOD は付けない (お題の木の始めは白い品か ✦ 1 つだけ、D-03)。保存の木の始めに狙いの MOD を書き込んだ木を、検算がそのまま回して通していた (11-12)
  d.start!.mods = [];
  d.start!.rarity = startRarity(d);
}
