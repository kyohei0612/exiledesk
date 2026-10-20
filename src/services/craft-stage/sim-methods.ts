/**
 * sim-methods.ts — シミュレーターの狙う MOD の付け方 (2026-10-18 オーナー「2 の狙う時に T1 とかで選択時に付け方をその場で選ばせる、ポップアップで」)。
 * 普通の MOD は 高貴ガチャ / カオススパム / 増強スパム / 冒涜 / フラクチャー から選ぶ。冒涜の MOD は冒涜、エッセンス・合金の MOD はエッセンスに決まっている (選ばせない)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimMethod } from "./quiz-build";
import { freshItem } from "./run-plan";
import { limitOf } from "./stage-core";
import { tr } from "../../i18n/lang";

export const METHOD_JA: Record<SimMethod, string> = { exalt: "高貴ガチャ", chaos: "カオススパム", augment: "増強スパム", desecrate: "冒涜", fracture: "フラクチャー", essence: "エッセンス" };
export const METHOD_EN: Record<SimMethod, string> = { exalt: "Exalt gamble", chaos: "Chaos spam", augment: "Augmentation spam", desecrate: "Desecrate", fracture: "Fracture", essence: "Essence" };

/** その MOD で選べる付け方 (1 つなら選ばせずにそれで足す) */
export function methodsFor(d: PatchData | null, modId: string): SimMethod[] {
  const src = d?.mods.get(modId)?.source;
  if (src === "desecrated") return ["desecrate"];
  if (src === "essence" || src === "perfect_essence") return ["essence"];
  return ["exalt", "chaos", "augment", "desecrate", "fracture"];
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
    // 増強スパムは側ごとに 1 つ (2 つ目は足す時に候補へ。augmentHostOf) なので「どれか N つ」にまとめない
    if (t.method === "fracture" || t.method === "essence" || t.method === "augment") continue;
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
// マジックを買うは出さない (出回っていないことが多い。2026-10-18 オーナー「流石にマジックから買うのそもそも物が無かったりするからスルー」)。並びは白 → フラクチャーの MOD 付きレア → フラクチャー済み
export const SIM_STARTS: Array<{ k: SimStartKind; label: string; hint: string; labelEn: string; hintEn: string; needsFracture?: boolean }> = [
  { k: "white", label: "白ベースから", hint: "白のベースを買って 1 から作る", labelEn: "From a white base", hintEn: "Buy a white base and craft from scratch" },
  { k: "four", label: "フラクチャーの MOD 付きレアを買う", hint: "フラクチャー予定の MOD が付いた 4 MOD のレアを買ってフラクチャー (当たり 1/3、ベースとフラクチャーを 3 回分)", labelEn: "Buy a rare with the mod", hintEn: "Buy a 4-mod rare with the fracture-planned mod and use a Fracturing Orb (1/3 hit, so 3 bases and 3 orbs)", needsFracture: true },
  { k: "fractured", label: "フラクチャー済みを買う", hint: "フラクチャーの MOD が 1 つ付いたベースを買う (フラクチャー予定の MOD)", labelEn: "Buy fractured", hintEn: "Buy a base with the fracture-planned mod already fractured", needsFracture: true },
  { k: "item", label: "エミュレーターの状態から", hint: "エミュレーターの今のアイテムから先を回す", labelEn: "From the Emulator item", hintEn: "Continue from the current Emulator item" },
];

/**
 * カオススパムは片側だけ (2026-10-18 オーナー「サフィかプレでカオススパムの道順が違ってくるから、同時にスパムを選ぶのはなし。選ぶならどっちかで」。
 * [[sim-split-by-side]] と同じ考え)。反対側にもうカオススパムの狙いがあれば、その理由 (無ければ null)
 */
export function chaosBlocked(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): string | null {
  const side = (id: string): "prefix" | "suffix" => (d?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const me = side(modId);
  const other = targets.find((t) => t.modId !== modId && t.method === "chaos" && side(t.modId) !== me);
  return other ? (me === "prefix" ? tr("カオススパムはサフィックスで選んでいる (片側だけ)", "Chaos spam is already on suffixes (one side only)") : tr("カオススパムはプレフィックスで選んでいる (片側だけ)", "Chaos spam is already on prefixes (one side only)")) : null;
}

/**
 * 増強スパム (2026-10-21 オーナー OK): マジックで付ける。プレ 1 つ・サフィ 1 つ、側ごとに別に動き、各側は 1 つの狙い (「どれか」の候補は同じ側なら可) だけ。
 * その側にもう増強スパムの狙い (かフラクチャーの候補。マジックで一緒に揃えるので同じ枠を取り合う) があれば、その理由 (無ければ null)
 */
export function augmentBlocked(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): string | null {
  const side = (id: string): "prefix" | "suffix" => (d?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const me = side(modId);
  if (targets.some((t) => t.modId !== modId && t.method === "fracture" && [t, ...(t.alts ?? [])].some((x) => side(x.modId) === me))) return tr("フラクチャー予定と同じ側 (マジックの枠は側ごとに 1 つ)", "Same side as the fracture mod (magic has one slot per side)");
  // 同じ側の 2 つ目の増強スパムは止めない: 足す時にその側の増強スパムの「どれか 1 つ」の候補に入る (augmentHostOf。2026-10-21 モンキーチェック:
  // 見本の靴の「雷・火・冷気耐性のどれか」が 0 から組めなかった)
  return null;
}
/** その側に既にある増強スパムの狙い (2 つ目を選んだら、ここの候補 alts に足す)。無ければ null */
export function augmentHostOf<T extends SimTargetLike>(d: PatchData | null, targets: readonly T[], modId: string): T | null {
  const side = (id: string): "prefix" | "suffix" => (d?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  return targets.find((t) => t.modId !== modId && t.method === "augment" && side(t.modId) === side(modId)) ?? null;
}
/** 付け方のポップアップで選べない付け方と理由 (カオススパムは片側だけ・増強スパムは側ごとに 1 つ) */
export function methodsOff(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): Partial<Record<SimMethod, string>> {
  const c = chaosBlocked(d, targets, modId), a = augmentBlocked(d, targets, modId), f = fractureBlocked(d, targets, modId);
  return { ...(c ? { chaos: c } : {}), ...(a ? { augment: a } : {}), ...(f ? { fracture: f } : {}) };
}
/**
 * フラクチャー予定は増強スパムと別の側 (augmentBlocked の逆向き。マジックの枠は側ごとに 1 つ)。前は増強スパムを後から足す時だけ止めていて、
 * 増強スパムが先にあるとフラクチャー予定を同じ側に足せた (2026-10-21 モンキーチェック 10 人中 5 人)
 */
export function fractureBlocked(d: PatchData | null, targets: readonly SimTargetLike[], modId: string): string | null {
  const side = (id: string): "prefix" | "suffix" => (d?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const me = side(modId);
  return targets.some((t) => t.modId !== modId && t.method === "augment" && [t, ...(t.alts ?? [])].some((x) => side(x.modId) === me))
    ? tr("増強スパムと同じ側 (マジックの枠は側ごとに 1 つ)", "Same side as the augmentation spam mod (magic has one slot per side)") : null;
}
/**
 * 付け方を増強スパムに替える (② の表の ▾)。増強スパムは側ごとに 1 つの狙い (プレ 1・サフィ 1、それぞれ候補は複数可)。替える物
 * (フラクチャー候補の組なら全部) を側ごとに分けて、その側の増強スパムの候補に入れる。その側にまだ無ければ、その側の 1 つ目を本体・残りを候補に
 * (2026-10-21 モンキーチェック: 組を替えると 2 つとも増強スパムになった。オーナー「増強はプレサフィそれぞれいける、複数も選べる。プレに 2 MOD とも増強はできん」)
 */
export function toAugment<T extends SimTargetLike>(d: PatchData | null, targets: readonly T[], ids: readonly string[]): T[] {
  const side = (id: string): "prefix" | "suffix" => (d?.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const moving = targets.filter((t) => ids.includes(t.modId));
  if (!moving.length) return [...targets];
  const ms = moving.flatMap((t) => [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])]);
  let out = targets.filter((t) => !ids.includes(t.modId));
  const at = targets.indexOf(moving[0]!);
  // 同じ所へ差し込むので、後から入れた方が前に来る: サフィ → プレの順に入れてプレを先に
  for (const sd of ["suffix", "prefix"] as const) {
    const mine = ms.filter((m) => side(m.modId) === sd);
    if (!mine.length) continue;
    const host = augmentHostOf(d, out, mine[0]!.modId);
    if (host) { out = out.map((t) => (t === host ? { ...t, alts: [...(t.alts ?? []), ...mine.filter((m) => m.modId !== t.modId)] } : t)); continue; }
    const one = { ...moving[0]!, modId: mine[0]!.modId, minTierIndex: mine[0]!.minTierIndex, method: "augment" as const, alts: mine.slice(1) };
    if (!one.alts.length) delete (one as Partial<T>).alts;
    delete (one as Partial<T>).need;
    out.splice(Math.min(at, out.length), 0, one as T);
  }
  return out;
}
