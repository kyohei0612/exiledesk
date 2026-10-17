/**
 * element-convert.ts — 属性の変換 (耐性のフラックス・アルダーのルーンで共通、2026-10-16)
 *
 * 変え方はクライアントの Expedition2ElementalModConversions (火 / 冷気 / 雷 / 混沌の MOD を 1 行ずつ対応させた表、src/data/element-conversions.json)。
 * 耐性の行 (res) はフラックス、それ以外の行はアルダーのルーンが使う。表に無い MOD (エッセンスで付けた物・ベース専用の行) は、
 * 属性の言葉だけ違う兄弟の同じ段 → 無ければ同じ数値の普通の MOD の段として表で変える
 * (2026-10-17 オーナー「耐性は全部変わる、説明通り。普通の MOD と同じ挙動。アルダーもスキルレベルやエッセンスで付いた奴も変わる」。
 * 10-16 は CoE に合わせて表に無い物は変えなかった)。
 * 表の MOD とエンジンの段は 名前・Lv・数値の幅で突き合わせる。数値は段の範囲の中の同じ位置。固定 (フラクチャー) と未発現は変えない
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageItem, StageMod } from "./types";
import { allMods, makeStageMod, replaced, withValues } from "./stage-core";
import TABLE from "../../data/element-conversions.json";

type Element = "fire" | "cold" | "lightning" | "chaos";
type Side = { id: string; name: string; level: number; ranges: number[][] };
type Row = Partial<Record<Element, Side | null>> & { res: boolean };
const ROWS = (TABLE as { rows: Row[] }).rows;

const sameRange = (a: readonly (readonly number[])[], b: readonly number[][]): boolean =>
  a.length === b.length && a.every((r, i) => Math.min(r[0]!, r[1]!) === Math.min(b[i]![0]!, b[i]![1]!) && Math.max(r[0]!, r[1]!) === Math.max(b[i]![0]!, b[i]![1]!));
const isTier = (t: Mod["tiers"][number], s: Side): boolean => t.ilvl === s.level && t.name === s.name && sameRange(t.ranges, s.ranges);

/** 部位 (id の先頭) ごとの MOD (普通の物を先に) */
const byClass = new WeakMap<PatchData, Map<string, Mod[]>>();
function modsOfClass(data: PatchData, cls: string): Mod[] {
  let m = byClass.get(data);
  if (!m) { m = new Map(); byClass.set(data, m); }
  let list = m.get(cls);
  if (!list) {
    list = [...data.mods.values()].filter((x) => x.id.startsWith(`${cls}/`)).sort((a, b) => Number(b.source === "normal") - Number(a.source === "normal"));
    m.set(cls, list);
  }
  return list;
}

/**
 * 表に無い段 (エッセンスで付けた物・ベース専用の行) は、同じ系統・同じ数値の幅の普通の MOD の段と同じに扱う
 * (2026-10-17 オーナー「耐性は全部変わる、説明通り。普通の MOD と同じ挙動。アルダーもスキルレベルやエッセンスで付いた奴も変わる」)
 */
function plainTwin(data: PatchData, md: Mod, t: Mod["tiers"][number]): Mod["tiers"][number] | null {
  const fams = new Set(md.families ?? [md.family]);
  for (const cand of modsOfClass(data, md.id.split("/")[0]!)) {
    if (cand.source !== "normal" || cand.id === md.id || !(cand.families ?? [cand.family]).some((f) => fams.has(f))) continue;
    const twin = cand.tiers.find((x) => sameRange(t.ranges, x.ranges.map((r) => [...r])));
    if (twin) return twin;
  }
  return null;
}
const inTable = (t: Mod["tiers"][number], eats: readonly string[], res: boolean): boolean =>
  ROWS.some((row) => row.res === res && eats.some((e) => { const s = row[e as Element]; return !!s && isTier(t, s); }));

const WORD: Record<Element, string> = { fire: "Fire", cold: "Cold", lightning: "Lightning", chaos: "Chaos" };
/** 表に無い MOD の兄弟 (id の属性の言葉だけ違う物。エッセンスの火耐性 → エッセンスの冷気耐性、ラップ専用の火耐性 → ラップ専用の雷耐性) の同じ段 */
function sibling(data: PatchData, md: Mod, tierIndex: number, element: string, eats: readonly string[]): { mod: Mod; tierIndex: number } | null {
  for (const e of eats) {
    const from = WORD[e as Element], to = WORD[element as Element];
    if (!from || !to || !md.id.includes(from)) continue;
    const sib = data.mods.get(md.id.replace(from, to));
    if (sib && sib.tiers[tierIndex]) return { mod: sib, tierIndex };
  }
  return null;
}

/** 表で 1 つ変える (表に無ければ、属性の言葉だけ違う兄弟の同じ段 → 同じ数値の普通の MOD の段として。どれも無ければ null) */
function viaTable(data: PatchData, m: StageMod, md: Mod, element: string, eats: readonly string[], res: boolean): { mod: Mod; tierIndex: number } | null {
  const own = md.tiers[m.tierIndex];
  if (!own) return null;
  const listed = inTable(own, eats, res);
  // 表に無い物は、耐性の MOD はフラックスだけ・それ以外はアルダーだけが変える (アルダーで耐性が変わらないように)
  const isRes = (md.families ?? [md.family]).some((f) => /Resistance$/.test(f));
  if (!listed && isRes !== res) return null;
  if (!listed) { const sib = sibling(data, md, m.tierIndex, element, eats); if (sib) return sib; }
  const t = listed ? own : plainTwin(data, md, own);
  if (!t) return null;
  for (const row of ROWS) {
    if (row.res !== res) continue;
    if (!eats.some((e) => { const s = row[e as Element]; return !!s && isTier(t, s); })) continue;
    const to = row[element as Element];
    if (!to) return null;
    for (const cand of modsOfClass(data, md.id.split("/")[0]!)) {
      if (cand.type !== md.type) continue;
      const i = cand.tiers.findIndex((x) => isTier(x, to));
      if (i >= 0) return { mod: cand, tierIndex: i };
    }
    return null;
  }
  return null;
}

/** 食う属性 (eats) の MOD を element の物に変える。res = 耐性の行だけ (フラックス) / それ以外の行だけ (アルダーのルーン) */
export function convertByTable(data: PatchData, item: StageItem, element: string, eats: readonly string[], res: boolean, by?: "flux"): { item: StageItem; mods: Array<{ from: StageMod; to: StageMod }> } {
  let out = item;
  const mods: Array<{ from: StageMod; to: StageMod }> = [];
  for (const m of allMods(item)) {
    if (m.unrevealed || m.fractured) continue;
    const md = data.mods.get(m.modId);
    if (!md) continue;
    const hit = viaTable(data, m, md, element, eats, res);
    if (!hit || hit.mod.id === md.id) continue;
    const fresh = makeStageMod(hit.mod, m.side, hit.tierIndex, () => 0.5);
    const fixed = fresh.ranges.map((r, i) => {
      const lo = Math.min(r[0]!, r[1]!), hi = Math.max(r[0]!, r[1]!);
      const or = m.ranges[i], v = m.values[i];
      const p = or && v != null && or[1] !== or[0] ? (v - Math.min(or[0]!, or[1]!)) / Math.abs(or[1]! - or[0]!) : 0.5;
      const x = lo + Math.min(1, Math.max(0, p)) * (hi - lo);
      return Number.isInteger(lo) && Number.isInteger(hi) ? Math.round(x) : Math.round(x * 100) / 100;
    });
    const next: StageMod = { ...withValues(fresh, hit.mod, () => 0.5, fixed), ...(m.desecrated ? { desecrated: true } : {}), ...(m.crafted ? { crafted: true } : {}), convertedFrom: m.textJa, ...(by ? { convertedBy: by } : {}) };
    out = replaced(out, m, next);
    mods.push({ from: m, to: next });
  }
  return { item: out, mods };
}
