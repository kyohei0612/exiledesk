/**
 * _monkey-engine-entry.ts — check-monkey-engine.mjs が束ねて呼ぶ所 (2026-10-24、ジン部長。オーナー「照らし合わせの相手はエンジン」)。
 * 猿の記録の 1 手 (カードの文・棚に出た札の名前) から、エンジンの入口でアイテムを組み立て、打てる札の名前の集合を出す。
 * 打てるかはエンジンの useReason (クラフト台・ツリーの棚と同じ判定、お告げ無し)。棚の札の並びと名前は for-share の棚と同じ物を読む
 */
import { indexPatch } from "../src/vendor/poe2htc/engine/indexPatch";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import { applyExtras, htcBaseInfo } from "../src/services/htc/patch";
import mods from "../src/vendor/poe2htc/data/mods.json";
import bases from "../src/vendor/poe2htc/data/base_items.json";
import extra from "../src/services/htc/extra-bases.json";
import jewels from "../src/services/htc/jewel-bases.json";
import { aimHits, applyCurrency, baseSocketsOf, forceKey, freshItem, modListFor, mulberry32, omenBlock, omensAllowedFor, runeEffectFor, runeOf, tierIndexOf, useReason, type StageItem, type StageMod } from "../src/services/craft-stage/engine";
import { placeMods, stepOutcomesOrTooMany } from "../src/services/craft-stage/engine-sim";
import { CRAFT_RUNE_KEYS, ORBS, bonesFor, essenceShelf, nameOfKey, runesFor } from "../src/state/for-share/craft-stage-shelf";
import { SIM_HIDDEN } from "../src/state/for-share/shelf-context";

let data: PatchData | null = null;
export function load(): void {
  const d = indexPatch(mods as unknown as Parameters<typeof indexPatch>[0], bases as unknown as Parameters<typeof indexPatch>[1]);
  data = applyExtras(d, extra as unknown as Parameters<typeof applyExtras>[1], jewels as unknown as Parameters<typeof applyExtras>[2]);
}

/** 英語のベース名がエンジンのベースの一覧にあるか */
export const isBase = (en: string): boolean => !!htcBaseInfo()[en];
/** 日本語のベース名 → 英語 (ベースの一覧の ja) */
export function baseOfJa(ja: string): string | null {
  for (const [en, b] of Object.entries(htcBaseInfo())) if ((b as { ja?: string }).ja === ja) return en;
  return null;
}

/** 文の数字を # に (幅「(24-27)」は 1 つの #。段の表は「筋力 (25-27)」、カードは「筋力 +26」なので + は見ない) */
const norm = (s: string): string => s.replace(/\(\d+(?:\.\d+)?\s*[-–—~〜]\s*\d+(?:\.\d+)?\)/g, "#").replace(/\d+(?:\.\d+)?/g, "#").replace(/[+\s]/g, "").trim();

/** カードの「P7 物理ダメージが64%増加する」→ その段の MOD (文の数字を # にして、その部位の MOD 一覧の同じ段の文と比べる) */
export function modOf(base: string, side: "P" | "S", tier: number, text: string): { modId: string; tier: number } | null {
  const rows = modListFor(data!, freshItem(data!, base, 82, "rare"));
  const want = norm(text);
  for (const r of rows) {
    if ((r.side === "prefix") !== (side === "P")) continue;
    for (const t of r.tiers) if (t.tier === tier && norm(t.text) === want) return { modId: t.modId ?? r.id, tier };
  }
  return null;
}

/** そのレアリティで MOD を付けた形 (付けられなければ null)。ソケットはツリーのスタートと同じ規格外の数 (baseSocketsOf) */
function itemWith(base: string, rarity: "normal" | "magic" | "rare", ms: ReadonlyArray<{ modId: string; tier: number }>): StageItem | null {
  const it = itemWith0(base, rarity, ms);
  return it ? { ...it, sockets: Math.max(it.sockets ?? 0, baseSocketsOf(it.base, it.cls.category)) } : null;
}
function itemWith0(base: string, rarity: "normal" | "magic" | "rare", ms: ReadonlyArray<{ modId: string; tier: number }>): StageItem | null {
  if (rarity === "normal") return ms.length ? null : freshItem(data!, base, 82, "normal");
  if (rarity === "rare") { const r = placeMods(data!, base, 82, ms, mulberry32(1)); return r.left.length ? null : r.item; }
  let item = freshItem(data!, base, 82, "magic");
  for (const m of ms) {
    const r = applyCurrency(data!, item, forceKey(m.modId, `T${m.tier}`, "n"), mulberry32(1));
    if (!r.applied || r.item.rarity !== "magic") return null;
    item = r.item;
  }
  return item;
}

/** 棚の札 1 つ (猿の shelf と同じ形: name = 札の名前、off = 打てない、why = 打てない理由) */
export interface Card { name: string; off: boolean; why: string | null; key: string }
const ESS_ORDER = ["essence:lesser:", "essence:normal:", "essence:greater:", "essence:perfect:"];
const essRank = (k: string): number => { const i = ESS_ORDER.findIndex((p) => k.startsWith(p)); return i < 0 ? 9 : i; };

/**
 * 棚 (CurrencyShelf の「打てる」の欄と同じ並び): オーブ・骨 / エッセンスは系統ごとに 1 つ (札は打てる段のうち一番上、どれも打てなければ普通の段。groupRep と同じ) /
 * ルーンはソケットがある時だけで、クラフトに関わるルーン (CRAFT_RUNE_KEYS) だけ (ほかのルーンは畳んだ欄で、猿には見えない)。ツリーで隠す札 (SIM_HIDDEN) は抜く。
 * 打てない札も理由つきで返す (猿の棚は打てる欄だけなので、比べるのは off でない物)。allTiers = エッセンスを段ごとに全部 (猿の口の棚と同じ数え方)
 */
export function shelfOf(item: StageItem, allTiers = false): Card[] {
  const why = (k: string): string | null => useReason(data!, item, k);
  const out: Card[] = [];
  const keys = [...ORBS.flatMap((g) => g.keys), ...bonesFor(item), ...((item.sockets ?? 0) > 0 ? runesFor(item).flatMap((g) => g.keys).filter((k) => CRAFT_RUNE_KEYS.includes(k)) : [])];
  for (const k of keys) { if (SIM_HIDDEN.has(k)) continue; const w = why(k); out.push({ name: nameOfKey(k, item), off: !!w, why: w, key: k }); }
  for (const g of essenceShelf(data!, item)) {
    const ks = g.keys.filter((k) => !SIM_HIDDEN.has(k)).sort((a, b) => essRank(a) - essRank(b));
    // 段ごと (猿の口 __simMonkey.shelf は系統の段を全部別の札で返す。名前は系統で揃わない: 氷のレッサー / 氷晶 / 氷のグレーター)
    if (allTiers) { for (const k of ks) { const w = why(k); out.push({ name: nameOfKey(k, item), off: !!w, why: w, key: k }); } continue; }
    const ok = ks.filter((k) => !why(k));
    const rep = ok[ok.length - 1] ?? ks.find((k) => k.startsWith("essence:normal:")) ?? ks[0];
    if (rep) out.push({ name: nameOfKey(rep, item), off: !ok.length, why: ok.length ? null : why(rep), key: rep });
  }
  return out;
}

/** 選んだ手に掛けられるお告げ (エンジンの omensAllowedFor) と、掛けられない物の理由 (omenBlock。お告げの欄の灰色と同じ) */
export function omensOf(item: StageItem, key: string): Array<{ name: string; off: boolean; why: string | null; key: string }> {
  return omensAllowedFor(key).map((o) => { const w = omenBlock(data!, item, key, [], o); return { name: nameOfKey(o, item), off: !!w, why: w, key: o }; });
}

/** 選んだ手で付きうる MOD の候補 (1 手の行き先の全部の枝で新しく付く MOD の文、段つき)。枝が多すぎる手 (錬金など) は "多すぎて数えない" */
export function candidatesOf(item: StageItem, key: string): string[] | "多すぎて数えない" {
  const r = stepOutcomesOrTooMany(data!, item, key, []);
  if (r === "tooMany") return "多すぎて数えない";
  if (!r) return [];
  const before = new Set([...item.prefixes, ...item.suffixes].map((m) => m.modId));
  const out = new Set<string>();
  for (const o of r) if (!o.void) for (const m of o.added) if (!before.has(m.modId)) out.add(`${m.side === "prefix" ? "P" : "S"} ${m.modId}#${m.tierIndex}`);
  return [...out].sort();
}

/** カードの文に効き目の文があるクラフトのルーンを、ソケットにはめる (ツリーの箱でもうはまっている物) */
function withRunes(item: StageItem, card: string): StageItem {
  const c = norm(card);
  let it = item;
  for (const k of CRAFT_RUNE_KEYS) {
    const r = runeOf(k);
    const eff = r ? runeEffectFor(r, it.cls.category) : null;
    if (!eff?.ja || !c.includes(norm(eff.ja))) continue;
    const out = applyCurrency(data!, it, k, mulberry32(1));
    if (out.applied) it = out.item;
  }
  return it;
}

/** 1 手: 白・マジック・レアの形それぞれのアイテム (組み立てられない形は null)。ルーンはカードの文から */
export function itemsFor(base: string, ms: ReadonlyArray<{ modId: string; tier: number }>, card = ""): Record<"normal" | "magic" | "rare", StageItem | null> {
  const out = {} as Record<"normal" | "magic" | "rare", StageItem | null>;
  for (const rarity of ["normal", "magic", "rare"] as const) { const it = itemWith(base, rarity, ms); out[rarity] = it ? withRunes(it, card) : null; }
  return out;
}
/** 狙い (ツリーの札 = modId と段の T) */
export interface Aim { modId: string; tier: number }
/**
 * 1 手で狙いのどれが付くかの割合 (エンジンの stepOutcomes の全部の枝、乱数なし)。当たり = 新しく付いた MOD が狙いに当たる (同じ系統で同じ文も、ツリーの当たりと同じ sameText)。
 * lost = もう付いていた狙いの MOD が消えた枝。枝が多すぎる・行き先の無い手は null
 */
export function oddsOf(item: StageItem, key: string, omens: readonly string[], aims: readonly Aim[]): { hit: Record<string, number>; any: number; lost: number; void: number } | null {
  const r = stepOutcomesOrTooMany(data!, item, key, omens);
  if (!r || r === "tooMany") return null;
  const ts = aims.map((a) => ({ k: `${a.modId}|${a.tier}`, t: { modId: a.modId, minTierIndex: tierIndexOf(data!, a.modId, a.tier) } }));
  const opts = { data: data!, sameText: true };
  const held = (it: StageItem): Set<string> => new Set(ts.filter(({ t }) => [...it.prefixes, ...it.suffixes].some((m) => aimHits(m, t, opts))).map(({ k }) => k));
  const before = held(item);
  const out = { hit: Object.fromEntries(ts.map(({ k }) => [k, 0])) as Record<string, number>, any: 0, lost: 0, void: 0 };
  for (const o of r) {
    if (o.void) { out.void += o.p; continue; }
    const got = ts.filter(({ k, t }) => !before.has(k) && o.added.some((m) => aimHits(m, t, opts)));
    for (const { k } of got) out.hit[k]! += o.p;
    if (got.length) out.any += o.p;
    if ([...before].some((k) => !held(o.item).has(k))) out.lost += o.p;
  }
  return out;
}
/** 見えている形 (レアリティ・MOD・品質・ソケット) からエンジンで組み立てたアイテム (組み立てられなければ null)。ツリーが渡した物と比べる */
export function rebuild(base: string, rarity: "normal" | "magic" | "rare", ms: ReadonlyArray<{ modId: string; tier: number; fractured?: boolean }>, quality = 0, sockets = 0): StageItem | null {
  const it = itemWith0(base, rarity, ms);
  if (!it) return null;
  const fr = new Set(ms.filter((m) => m.fractured).map((m) => m.modId));
  const mark = (m: StageMod): StageMod => (fr.has(m.modId) ? { ...m, fractured: true } : m);
  return { ...it, quality, sockets: Math.max(sockets, it.sockets ?? 0), prefixes: it.prefixes.map(mark), suffixes: it.suffixes.map(mark) };
}
/** 2 つのアイテムの食い違い (レアリティ・MOD の id と段・✦・品質・ソケット)。同じなら空 */
export function itemDiff(a: StageItem, b: StageItem): string[] {
  const sig = (it: StageItem): string[] => [...it.prefixes, ...it.suffixes].map((m) => `${m.side === "prefix" ? "P" : "S"} ${m.modId}#${m.tierIndex}${m.fractured ? "✦" : ""}${m.unrevealed ? "?" : ""}`).sort();
  const out: string[] = [];
  if (a.rarity !== b.rarity) out.push(`レアリティ ${a.rarity} / ${b.rarity}`);
  const sa = sig(a), sb = sig(b);
  for (const x of sa) if (!sb.includes(x)) out.push(`組み立てだけ ${x}`);
  for (const x of sb) if (!sa.includes(x)) out.push(`ツリーだけ ${x}`);
  if ((a.quality ?? 0) !== (b.quality ?? 0)) out.push(`品質 ${a.quality ?? 0} / ${b.quality ?? 0}`);
  if ((a.sockets ?? 0) !== (b.sockets ?? 0)) out.push(`ソケット ${a.sockets ?? 0} / ${b.sockets ?? 0}`);
  return out;
}
/** 名前から鍵 (今の棚にある札の中で) */
export const keyOfName = (cards: Card[], name: string): string | null => cards.find((c) => c.name === name)?.key ?? null;
