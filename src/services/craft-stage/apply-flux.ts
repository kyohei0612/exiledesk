/**
 * apply-flux.ts — 耐性のフラックス (2026-10-04 オーナー「カレンシーフルチェック」で、相場に値段があって棚に無かった物)
 *
 * クライアントの説明文: 火炎フラックス「アイテム上の全ての冷気および雷耐性モッドを同等な火耐性モッドに変換する」、
 * 冷却 = 火・雷 → 冷気、雷撃 = 火・冷気 → 雷、虚無 = 火・冷気・雷 → 混沌。
 * 変え方はクライアントの Expedition2ElementalModConversions (火 / 冷気 / 雷 / 混沌の MOD を 1 行ずつ対応させた表、src/data/flux-conversions.json)。
 * 例: 火耐性 Lv 60 (胴の T3) → 混沌耐性 Lv 68 (T2)、冒涜専用の火 & 混沌耐性 → 混沌耐性 Lv 81 (T1、アイテムレベルに関わらず)。
 * 2026-10-10 要望で分かった (前はアルダーのルーンと同じ「同じ段の順位」で、T3 → T3 にしていた)。表の MOD とエンジンの段は 名前・Lv・数値の幅で突き合わせる。
 * 表で見つからない MOD は前の変え方 (convertElements) のまま。数値は段の範囲の中の同じ位置。耐性の MOD (文面に Resistance) だけ。変える物が無ければ打てない。
 * 使い切りで、ソケットは要らない。コラプト・聖別の後は打てない (普通のカレンシーと同じ)
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { StageApply, StageItem, StageMod } from "./types";
import { allMods, makeStageMod, replaced, skip, withValues } from "./stage-core";
import { convertElements } from "./stage-runes";
import FLUX_TABLE from "../../data/flux-conversions.json";
import { tr } from "../../i18n/lang";

export const FLUX: Record<string, { element: string; eats: string[] }> = {
  flux_fire: { element: "fire", eats: ["cold", "lightning"] },
  flux_cold: { element: "cold", eats: ["fire", "lightning"] },
  flux_lightning: { element: "lightning", eats: ["fire", "cold"] },
  flux_chaos: { element: "chaos", eats: ["fire", "cold", "lightning"] },
};
export const FLUX_KEYS = Object.keys(FLUX);
export const isFlux = (key: string): boolean => key in FLUX;

type Side = { id: string; name: string; level: number; ranges: number[][] };
type Row = Partial<Record<"fire" | "cold" | "lightning" | "chaos", Side | null>>;
const ROWS = (FLUX_TABLE as { rows: Row[] }).rows;
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

/** 表で 1 つ変える (見つからなければ null) */
function viaTable(data: PatchData, m: StageMod, md: Mod, element: string, eats: readonly string[]): { mod: Mod; tierIndex: number } | null {
  const t = md.tiers[m.tierIndex];
  if (!t) return null;
  for (const row of ROWS) {
    if (!eats.some((e) => { const s = row[e as keyof Row]; return !!s && isTier(t, s); })) continue;
    const to = row[element as keyof Row];
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

export function applyFlux(data: PatchData, item: StageItem, key: string): StageApply {
  const f = FLUX[key]!;
  const isRes = (md: Mod) => /Resistance/.test(md.text ?? "");
  // 表にある MOD は表で変える。残りは前の変え方 (convertElements) で
  let out = item;
  const done: Array<{ from: StageMod; to: StageMod }> = [];
  for (const m of allMods(item)) {
    if (m.unrevealed || m.fractured) continue;
    const md = data.mods.get(m.modId);
    if (!md || !isRes(md)) continue;
    const hit = viaTable(data, m, md, f.element, f.eats);
    if (!hit || hit.mod.id === md.id) continue;
    const fresh = makeStageMod(hit.mod, m.side, hit.tierIndex, () => 0.5);
    const fixed = fresh.ranges.map((r, i) => {
      const lo = Math.min(r[0]!, r[1]!), hi = Math.max(r[0]!, r[1]!);
      const or = m.ranges[i], v = m.values[i];
      const p = or && v != null && or[1] !== or[0] ? (v - Math.min(or[0]!, or[1]!)) / Math.abs(or[1]! - or[0]!) : 0.5;
      const x = lo + Math.min(1, Math.max(0, p)) * (hi - lo);
      return Number.isInteger(lo) && Number.isInteger(hi) ? Math.round(x) : Math.round(x * 100) / 100;
    });
    const next: StageMod = { ...withValues(fresh, hit.mod, () => 0.5, fixed), ...(m.desecrated ? { desecrated: true } : {}), ...(m.crafted ? { crafted: true } : {}), convertedFrom: m.textJa };
    out = replaced(out, m, next);
    done.push({ from: m, to: next });
  }
  const touched = new Set(done.map((d) => d.to));
  const rest = convertElements(data, out, f.element, f.eats, (md) => isRes(md));
  const c = { item: rest.item, mods: [...done, ...rest.mods.filter((x) => !touched.has(x.from))] };
  if (!c.mods.length) return skip(item, tr("変換できる耐性モッドが無い", "No resistance mod to convert"));
  return { applied: true, item: c.item, added: c.mods.map((x) => x.to), removed: c.mods.map((x) => x.from), converted: { element: f.element, mods: c.mods } };
}
