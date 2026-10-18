/**
 * sim-methods.ts — シミュレーターの狙う MOD の付け方 (2026-10-18 オーナー「2 の狙う時に T1 とかで選択時に付け方をその場で選ばせる、ポップアップで」)。
 * 普通の MOD は 高貴ガチャ / カオススパム / 冒涜 / フラクチャー から選ぶ。冒涜の MOD は冒涜、エッセンス・合金の MOD はエッセンスに決まっている (選ばせない)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimMethod } from "./quiz-build";
import { freshItem } from "./run-plan";
import { limitOf } from "./stage-core";

export const METHOD_JA: Record<SimMethod, string> = { exalt: "高貴ガチャ", chaos: "カオススパム", desecrate: "冒涜", fracture: "フラクチャー", essence: "エッセンス" };
export const METHOD_EN: Record<SimMethod, string> = { exalt: "Exalt gamble", chaos: "Chaos spam", desecrate: "Desecrate", fracture: "Fracture", essence: "Essence" };

/** その MOD で選べる付け方 (1 つなら選ばせずにそれで足す) */
export function methodsFor(d: PatchData | null, modId: string): SimMethod[] {
  const src = d?.mods.get(modId)?.source;
  if (src === "desecrated") return ["desecrate"];
  if (src === "essence" || src === "perfect_essence") return ["essence"];
  return ["exalt", "chaos", "desecrate", "fracture"];
}

/** シミュレーターの狙い 1 つ (state/sim-state.ts の simTargets と同じ形) */
export interface SimTargetLike { modId: string; minTierIndex: number; method?: SimMethod; alts?: Array<{ modId: string; minTierIndex: number }>; need?: number }

/**
 * 側ごとに使う枠の数 (2026-10-18 オーナー「狙う MOD は何個でもいい、後で整理した際にまとめる」→ 整理の段で枠に収める)。
 * 手順 1 つ = 1 枠 (「どれか N つ」は手順が N 個なので N 枠)。フラクチャー予定は側ごとに 1 枠 (どれか 1 つが固定される)
 */
export function sideUse(d: PatchData | null, targets: readonly SimTargetLike[]): { prefix: number; suffix: number } {
  const side = (id: string): "prefix" | "suffix" => (d?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const out = { prefix: 0, suffix: 0 };
  const fr = new Set<string>();
  for (const t of targets) {
    if (t.method === "fracture") fr.add(side(t.modId));
    else out[side(t.modId)]++;
  }
  for (const sd of fr) out[sd as "prefix" | "suffix"]++;
  return out;
}

/** 整理の組: 同じ側・同じ付け方 (高貴ガチャ / カオススパム / 冒涜) の MOD。2 つ以上ある時だけ「全部 / どれか N つ」を選ばせる */
export interface SortBucket { side: "prefix" | "suffix"; method: SimMethod; members: Array<{ modId: string; minTierIndex: number }>; need: number }
export function sortBuckets(d: PatchData | null, targets: readonly SimTargetLike[]): SortBucket[] {
  const side = (id: string): "prefix" | "suffix" => (d?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const out: SortBucket[] = [];
  for (const t of targets) {
    if (t.method === "fracture" || t.method === "essence") continue;
    const method = t.method ?? "exalt";
    const all = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
    // 側をまたぐ「どれか」は整理の外 (前の作りのカオススパムの両側。触らない)
    if (new Set(all.map((m) => side(m.modId))).size > 1) continue;
    const sd = side(t.modId);
    let b = out.find((x) => x.side === sd && x.method === method);
    if (!b) { b = { side: sd, method, members: [], need: 0 }; out.push(b); }
    for (const m of all) if (!b.members.some((x) => x.modId === m.modId)) b.members.push(m);
    b.need++;
  }
  return out.filter((b) => b.members.length > 1);
}

/** 組を「この中のどれか n つ」にする (n = 候補の数なら全部付ける = まとめを解く)。手順は最初の候補の位置に入れ直す */
export function setAnyOf<T extends SimTargetLike>(targets: readonly T[], b: SortBucket, n: number): T[] {
  const ids = new Set(b.members.map((m) => m.modId));
  const inB = (t: T): boolean => (t.method ?? "exalt") === b.method && [t.modId, ...(t.alts ?? []).map((a) => a.modId)].every((id) => ids.has(id));
  const at = targets.findIndex(inB);
  const rest = targets.filter((t) => !inB(t));
  const base = targets.find(inB);
  const k = Math.max(1, Math.min(n, b.members.length));
  /** 手順 1 つ (付け方などは元の手順のまま、候補と alts だけ入れ替える。need は使わない) */
  const step = (m: { modId: string; minTierIndex: number }, alts: Array<{ modId: string; minTierIndex: number }> | null): T => {
    const o = { ...(base as T), modId: m.modId, minTierIndex: m.minTierIndex };
    delete o.need;
    if (alts) o.alts = alts; else delete o.alts;
    return o;
  };
  const made = k === b.members.length
    ? b.members.map((m) => step(m, null))
    : b.members.slice(0, k).map((m) => step(m, b.members.filter((x) => x.modId !== m.modId)));
  const cut = Math.min(at < 0 ? rest.length : at, rest.length);
  return [...rest.slice(0, cut), ...made, ...rest.slice(cut)];
}

/** そのベースのレアの側ごとの枠 (特殊なベースの「プレ / サフィ ±N 個」込み) */
export function sideLimits(d: PatchData | null, base: string, itemLevel: number): { prefix: number; suffix: number } {
  if (!d) return { prefix: 3, suffix: 3 };
  try {
    const it = { ...freshItem(d, base, itemLevel), rarity: "rare" as const };
    return { prefix: limitOf(it, "prefix"), suffix: limitOf(it, "suffix") };
  } catch { return { prefix: 3, suffix: 3 }; }
}

/** シミュレーターの始め方 (3 で縦に全部並べて、ベースの値段を比べる。2026-10-18 オーナー「始め方はタブで出さず全部計算させるから縦にそれぞれ表示」) */
export type SimStartKind = "white" | "fractured" | "magic" | "four" | "item";
export const SIM_STARTS: Array<{ k: SimStartKind; label: string; hint: string; labelEn: string; hintEn: string; needsFracture?: boolean }> = [
  { k: "white", label: "白ベースから", hint: "白のベースを買って 1 から作る", labelEn: "From a white base", hintEn: "Buy a white base and craft from scratch" },
  { k: "fractured", label: "フラクチャー済みを買う", hint: "フラクチャーの MOD が 1 つ付いたベースを買う (フラクチャー予定の MOD)", labelEn: "Buy fractured", hintEn: "Buy a base with the fracture-planned mod already fractured", needsFracture: true },
  { k: "magic", label: "マジックを買う", hint: "狙う MOD の最初のプレフィックス 1 つ・サフィックス 1 つが付いたマジックを買う (段は狙いの下限)", labelEn: "Buy a magic", hintEn: "Buy a magic item with the first target prefix and suffix (at their minimum tier)" },
  { k: "four", label: "4 MOD のレアを買う", hint: "3 MOD + 狙い 1 のレアを買って、骨の壁を足してからフラクチャー (当たり 1/3)", labelEn: "Buy a 4-mod rare", hintEn: "Buy a rare with 3 mods + 1 target, block with an Abyssal Bone, then use a Fracturing Orb (1/3 hit)", needsFracture: true },
  { k: "item", label: "エミュレーターの状態から", hint: "エミュレーターの今のアイテムから先を回す", labelEn: "From the Emulator item", hintEn: "Continue from the current Emulator item" },
];
