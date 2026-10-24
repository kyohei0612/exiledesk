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
import { applyCurrency, baseSocketsOf, forceKey, freshItem, modListFor, mulberry32, runeEffectFor, runeOf, useReason, type StageItem } from "../src/services/craft-stage/engine";
import { placeMods } from "../src/services/craft-stage/engine-sim";
import { CRAFT_RUNE_KEYS, ORBS, bonesFor, essenceShelf, nameOfKey, runesFor } from "../src/state/for-share/craft-stage-shelf";
import { SIM_HIDDEN } from "../src/state/for-share/shelf-context";

let data: PatchData | null = null;
export function load(): void {
  const d = indexPatch(mods as unknown as Parameters<typeof indexPatch>[0], bases as unknown as Parameters<typeof indexPatch>[1]);
  data = applyExtras(d, extra as unknown as Parameters<typeof applyExtras>[1], jewels as unknown as Parameters<typeof applyExtras>[2]);
}

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

/**
 * 棚の「打てる」の欄 (CurrencyShelf の usableAll) と同じ並び: オーブ・骨 / エッセンスは系統ごとに 1 つ (どれかの段が打てれば、札の名前はグレーター) /
 * ルーンはソケットがある時だけで、クラフトに関わるルーン (CRAFT_RUNE_KEYS) だけ (ほかのルーンは畳んだ欄で、猿には見えない)。ツリーで隠す札 (SIM_HIDDEN: 品質の札・ヒネコラの髪束など) は抜く
 */
function usableNames(item: StageItem): string[] {
  const ok = (k: string): boolean => !SIM_HIDDEN.has(k) && !useReason(data!, item, k);
  const out = new Set<string>();
  const keys = [...ORBS.flatMap((g) => g.keys), ...bonesFor(item), ...((item.sockets ?? 0) > 0 ? runesFor(item).flatMap((g) => g.keys).filter((k) => CRAFT_RUNE_KEYS.includes(k)) : [])];
  for (const k of keys) if (ok(k)) out.add(nameOfKey(k, item));
  for (const g of essenceShelf(data!, item)) if (g.keys.some(ok)) out.add(nameOfKey(g.keys.find((k) => k.startsWith("essence:greater:")) ?? g.keys[0]!, item));
  return [...out];
}

/** 1 手: 白・マジック・レアの形それぞれで打てる札の名前 (組み立てられない形は null) */
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
export function check(base: string, ms: ReadonlyArray<{ modId: string; tier: number }>, card = ""): Record<string, string[] | null> {
  const out: Record<string, string[] | null> = {};
  for (const rarity of ["normal", "magic", "rare"] as const) {
    const it = itemWith(base, rarity, ms);
    out[rarity] = it ? usableNames(withRunes(it, card)) : null;
  }
  return out;
}
