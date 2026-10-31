/**
 * daily-gen.ts — 毎朝のお題を組む (D-81〜D-83)。日付を種にした純粋な関数で、同じ日付・同じ辞書なら同じお題。
 * 実行の所 (朝 7 時の予定のタスク → POST /daily/topic) はサーバー管理人。今は端末がその週の分を組んで見せる (D-90)。
 * 打てるかはエンジンの goalBlock、MOD の表は modListFor で聞く。乱数は mulberry32
 */
import { freshItem, mulberry32, type PatchData } from "../../services/craft-stage/engine";
import { modListFor, type ListRow } from "../../services/craft-stage/mod-list";
import { goalBlock } from "../../services/simulator/sim-engine";
import { DAILY_TYPES, type DailyType } from "./daily-types";

export type GenAim = { modId: string; tier: number; ja: string; en: string };
export type GenTopic = { day: string; typeId: string; ja: string; en: string; base: string; ilvl: number; aims: GenAim[]; level: number };

/** 曜日の難易度 (0 = 月)。mods = MOD の数、tier = この T 以上 */
export const LEVELS = [{ mods: 3, tier: 5 }, { mods: 3, tier: 4 }, { mods: 4, tier: 4 }, { mods: 4, tier: 3 }, { mods: 5, tier: 3 }, { mods: 5, tier: 2 }, { mods: 6, tier: 2 }] as const;
/** この日数の間に出た型は避ける */
const RECENT = 6;
const SIDE_MAX = 3;

const seedOf = (s: string): number => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function shuffle<T>(a: readonly T[], rng: () => number): T[] {
  const o = [...a];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j]!, o[i]!]; }
  return o;
}
const nameOf = (r: ListRow): string => r.id.slice(r.id.indexOf("/") + 1);

/** 型 1 つからお題を組む。決まりを通らなければ null (D-83) */
function build(data: PatchData, ty: DailyType, want: { mods: number; tier: number }, rng: () => number): GenAim[] | null {
  let rows: ListRow[];
  try { rows = modListFor(data, freshItem(data, ty.base, ty.ilvl)).filter((r) => r.group === "normal"); } catch { return null; }
  const of = (name: string): ListRow | undefined => rows.find((r) => nameOf(r) === name);
  if (ty.must.some((m) => !of(m))) return null;
  const names = [...ty.must, ...shuffle(ty.pool.filter((p) => !ty.must.includes(p)), rng)];
  const aims: GenAim[] = [], side = { prefix: 0, suffix: 0 };
  for (const name of names) {
    if (aims.length >= want.mods) break;
    const r = of(name);
    if (!r || side[r.side as "prefix" | "suffix"] >= SIDE_MAX) continue;
    const able = r.tiers.filter((t) => t.ilvl <= ty.ilvl);
    const t = able.find((x) => x.tier === want.tier) ?? [...able].sort((a, b) => b.tier - a.tier).find((x) => x.tier >= Math.max(2, want.tier)) ?? [...able].sort((a, b) => b.tier - a.tier)[0];
    if (!t || t.tier < 2) continue; // T1 は狙いにしない
    const modId = t.modId ?? r.id;
    if (goalBlock(data, ty.base, ty.ilvl, aims.map((a) => ({ modId: a.modId, tier: a.tier })), { modId, tier: t.tier })) continue;
    aims.push({ modId, tier: t.tier, ja: t.text, en: t.text });
    side[r.side as "prefix" | "suffix"]++;
  }
  return aims.length >= want.mods ? aims : null;
}

/** day = "2026-11-02"、weekday = 0 (月)〜6、recent = 新しい順の型の id */
export function generateTopic(data: PatchData, day: string, weekday: number, recent: readonly string[], types: readonly DailyType[] = DAILY_TYPES): GenTopic | null {
  const want = LEVELS[weekday]!, rng = mulberry32(seedOf(day));
  const avoid = new Set(recent.slice(0, RECENT));
  const live = types.filter((t) => !t.off && (!t.heavy || weekday >= 4));
  const order = [...shuffle(live.filter((t) => !avoid.has(t.id)), rng), ...shuffle(live.filter((t) => avoid.has(t.id)), rng)];
  for (const ty of order) {
    const aims = build(data, ty, want, rng);
    if (aims) return { day, typeId: ty.id, ja: ty.ja, en: ty.en, base: ty.base, ilvl: ty.ilvl, aims, level: weekday };
  }
  return null;
}
