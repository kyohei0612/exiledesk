/**
 * apply-spam.ts — スパムシミュの当たった形をクラフト台に置く 1 手 (2026-10-22 オーナー「当たった状態でクラフト台に戻る」「工程にスパムの 1 行、費用も入れる」)。
 * 鍵 spam:{…} に道・等級・費用 (高貴建て)・手数と、置く MOD (Force の形)・レアリティ・当たった形のルーンを入れる。打つと MOD を丸ごと置き換え (台から残った MOD は印ごとそのまま)、
 * 当たった形のルーンを嵌める (足りなければソケットも開ける、M-64。暗黙・品質と、それ以外のルーンは打つ前のアイテムのまま)。
 * 乱数を使わないので、再生 (手順 JSON) でも同じ形に飛ぶ。1 つ戻すでこの行ごと消える
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { replaceBlock } from "./augment-rules";
import { addStartMods } from "./run-plan";
import { mulberry32 } from "../htc/rng";
import { allMods, type Force } from "./stage-core";
import { applyRune, baseSocketsOf, RUNE_PREFIX } from "./stage-runes";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
import { tr } from "../../i18n/lang";

export const SPAM = "spam:";
export const isSpam = (key: string): boolean => key.startsWith(SPAM);
/** 鍵の中身。avg = 道のカードから (費用は people 人の平均) / 運試しから (その 1 人の費用)。people の無い前の手は 100 人。runes = 当たった形のルーンの英語名 (無い手はルーンを足さない) */
interface SpamStep { route: string; grade: string; cost: number; n: number; avg: boolean; people?: number; rarity: StageItem["rarity"]; mods: Force[]; runes?: string[] }

export function spamKey(s: SpamStep): string {
  return SPAM + JSON.stringify(s);
}
export function parseSpam(key: string): SpamStep | null {
  if (!isSpam(key)) return null;
  try {
    const s = JSON.parse(key.slice(SPAM.length)) as SpamStep;
    return Array.isArray(s.mods) && typeof s.cost === "number" ? s : null;
  } catch { return null; }
}
/** 置く MOD (アイテムの明示 MOD を始めの MOD の形に。値・フラクチャー・冒涜の印も) */
export const forcesOf = (it: StageItem): Force[] => [...it.prefixes, ...it.suffixes].map((m) => ({ mod: m.modId, tier: m.tierName, values: m.values, ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}) }));

/**
 * 当たった形のルーンを打つ前のアイテムに嵌める。足りない分だけソケットを開け (規格外まで)、それでも足りなければ当たった形に無いルーンと置き換える。
 * 嵌められなければ理由の文を返す
 */
function wearRunes(data: PatchData, item: StageItem, runes: readonly string[]): StageItem | string {
  const spare = (item.augments ?? []).map((a) => a.en);
  const missing = runes.filter((en) => { const i = spare.indexOf(en); if (i < 0) return true; spare.splice(i, 1); return false; });
  if (!missing.length) return item;
  const had = item.sockets ?? 0;
  let it: StageItem = { ...item, sockets: Math.max(had, Math.min(baseSocketsOf(item.base, item.cls.category), (item.augments?.length ?? 0) + missing.length)) };
  for (const en of missing) {
    const now = it.augments ?? [];
    const full = now.length >= (it.sockets ?? 0);
    const swap = full ? now.findIndex((a) => spare.includes(a.en) && !replaceBlock(a)) : -1;
    // 満杯で置き換えられる物が無ければ嵌めない (番号なしで打つと当たった形のルーンを置き換えてしまう)
    if (full && swap < 0) { const a = now.find((x) => spare.includes(x.en)); return (a && replaceBlock(a)) ?? tr("置き換えられる物が無い", "Nothing can be replaced"); }
    const r = applyRune(it, `${RUNE_PREFIX}${en}${swap >= 0 ? `@${swap + 1}` : ""}`, data);
    if (!r.applied) return r.reason ?? tr("ルーンを嵌められない", "Can't socket the rune");
    if (swap >= 0) spare.splice(spare.indexOf(now[swap]!.en), 1);
    it = r.item;
  }
  return it;
}

/** 台の MOD のうち、当たった形にそのまま残った物 (エッセンスなどの印ごと持ち越す。Force からは組み直せない) と、新しく組む物に分ける */
function splitKept(item: StageItem, mods: readonly Force[]): { kept: StageMod[]; rest: Force[] } {
  const left = allMods(item), kept: StageMod[] = [];
  const rest = mods.filter((f) => {
    const i = left.findIndex((m) => m.modId === f.mod && m.tierName === f.tier && m.values.join() === (f.values ?? []).join() && !!m.fractured === !!f.fractured && !!m.desecrated === !!f.desecrated);
    if (i < 0) return true;
    kept.push(...left.splice(i, 1));
    return false;
  });
  return { kept, rest };
}

export function applySpam(data: PatchData, item: StageItem, key: string): StageApply {
  const s = parseSpam(key);
  if (!s) return { applied: false, item, added: [], removed: [], reason: tr("スパムの手の形が違う", "Invalid spam step") };
  const worn = wearRunes(data, item, s.runes ?? []);
  if (typeof worn === "string") return { applied: false, item, added: [], removed: [], reason: worn };
  let built: StageItem;
  // 残った MOD を先に置き、新しい MOD をルーン込みの枠と置き場で組む (特殊 MOD とセールの凱旋の枠はルーンがある時だけ付く)
  const { kept, rest } = splitKept(item, s.mods);
  const on = (sd: StageSide): StageMod[] => kept.filter((m) => m.side === sd);
  try { built = addStartMods(data, { ...worn, rarity: s.rarity, prefixes: on("prefix"), suffixes: on("suffix") }, rest, mulberry32(0)); }
  catch (e) { return { applied: false, item, added: [], removed: [], reason: e instanceof Error ? e.message : String(e) }; }
  // 並びは当たった形のまま
  const at = (m: StageMod): number => s.mods.findIndex((f) => f.mod === m.modId);
  built = { ...built, prefixes: [...built.prefixes].sort((a, b) => at(a) - at(b)), suffixes: [...built.suffixes].sort((a, b) => at(a) - at(b)) };
  // 付いた / 消えたは変わった MOD だけ (フラクチャーなど、そのまま残った物は数えない)
  const sig = (m: StageMod): string => `${m.modId}#${m.tierIndex}#${m.values.join(",")}#${m.fractured ? 1 : 0}`;
  const before = [...item.prefixes, ...item.suffixes], after = [...built.prefixes, ...built.suffixes];
  const was = new Set(before.map(sig)), now = new Set(after.map(sig));
  return { applied: true, item: { ...worn, rarity: s.rarity, prefixes: built.prefixes, suffixes: built.suffixes }, added: after.filter((m) => !was.has(sig(m))), removed: before.filter((m) => !now.has(sig(m))) };
}

const ROUTE_JA: Record<string, [string, string]> = { augment: ["増強スパム", "Augment spam"], chaos: ["カオススパム", "Chaos spam"], exalt: ["高貴スパム", "Exalt spam"] };
const GRADE_JA: Record<string, [string, string]> = { base: ["無印", "Regular"], greater: ["上級", "Greater"], perfect: ["完全", "Perfect"] };
/** 工程の 1 行の名前 (例「カオススパム・無印 (30 人の平均、この 1 人は 17 手)」) */
export function spamName(s: SpamStep, en: boolean): string {
  const r = ROUTE_JA[s.route] ?? [s.route, s.route], g = GRADE_JA[s.grade] ?? [s.grade, s.grade];
  return en
    ? `${r[1]} (${g[1]}) — ${s.avg ? `average of ${s.people ?? 100}, this one hit on use ${s.n}` : `luck test, ${s.n} uses`}`
    : `${r[0]}・${g[0]} (${s.avg ? `${s.people ?? 100} 人の平均、この 1 人は ${s.n} 手` : `運試し ${s.n} 手`})`;
}
