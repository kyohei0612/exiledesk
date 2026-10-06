/**
 * pattern.ts — シミュレーションの「パターン」: 1 手ずつ並べた作り方 (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
 * プルダウンはセットで選択させたい」「フラクチャー以降の話だから、それ以降で残りの MOD を決める」)。
 *
 * 1 手 = セット (打つ物 + お告げ) + 付ける物 (狙う MOD / ルーン) + 外れた時。セットと付ける物のプルダウンは、それまでの手で決まる状態で
 * 打てない物を理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。
 * 状態は「狙いが当たった」として前の手から積む (外れは見ない。並べる時の目安)。回すのは recipe-sim.ts の pattern
 */
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { bossOmenAllowed } from "../../vendor/poe2htc/engine/probability";
import essenceKeys from "../htc/essence-keys.json";
import { runeIdByName } from "../../vendor/poe2htc/engine/runes";
import { RUNES } from "./stage-runes";

const ESS = (essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys;

export type PatternKind = "transmute" | "augment" | "regal" | "alchemy" | "exalt" | "chaos" | "desecrate" | "essence" | "essence_perfect" | "annul" | "rune";
/** 外れた時: そのまま次へ / 同じ手をもう一度 / 外れを消去してもう一度 / 最初から (フラクチャー済みのベースから) */
export type MissRule = "next" | "redo" | "annul_redo" | "restart";
export const MISS_JA: Record<MissRule, string> = { next: "そのまま次へ", redo: "同じ手をもう一度", annul_redo: "外れを消去してもう一度", restart: "最初からやり直す" };

export interface PatternStep {
  /** セットのキー (PatternSet.key) */
  set: string;
  /** 付ける物: 狙う MOD の手順 (simTargets の modId) / ルーンの英語名。消去は無し */
  target: string | null;
  onMiss: MissRule;
}
export interface Pattern { name: string; steps: PatternStep[] }

export interface PatternSet {
  key: string;
  kind: PatternKind;
  /** 打つ物 (エッセンスは付ける MOD で決まるので空) */
  currency: string;
  omens: string[];
  /** プルダウンのまとまり */
  group: string;
}

const SIDE = {
  exalt: ["OmenofSinistralExaltation", "OmenofDextralExaltation"],
  erase: ["OmenofSinistralErasure", "OmenofDextralErasure"],
  necro: ["OmenofSinistralNecromancy", "OmenofDextralNecromancy"],
  crystal: ["OmenofSinistralCrystallisation", "OmenofDextralCrystallisation"],
  annul: ["OmenofSinistralAnnulment", "OmenofDextralAnnulment"],
} as const;
const PREFIX_OMENS = new Set<string>(Object.values(SIDE).map((x) => x[0]));
const SUFFIX_OMENS = new Set<string>(Object.values(SIDE).map((x) => x[1]));
export const FACTION_OMEN: Record<string, string> = { OmenoftheSovereign: "ulaman_mod", OmenoftheLiege: "amanamu_mod", OmenoftheBlackblooded: "kurgal_mod" };

const set = (kind: PatternKind, currency: string, omens: string[], group: string): PatternSet => ({ key: `${kind}|${currency}|${omens.join("+")}`, kind, currency, omens, group });

/** セットの一覧 (プルダウンの中身。打てるかは checkSet で見る) */
export function patternSets(cls: ItemBase): PatternSet[] {
  const out: PatternSet[] = [];
  for (const c of ["transmute", "transmute_greater", "transmute_perfect"]) out.push(set("transmute", c, [], "ノーマル → マジック"));
  for (const c of ["augment", "augment_greater", "augment_perfect"]) out.push(set("augment", c, [], "マジック"));
  out.push(set("essence", "", [], "マジック"));
  for (const c of ["regal", "regal_greater", "regal_perfect"]) out.push(set("regal", c, [], "マジック → レア"));
  out.push(set("alchemy", "alchemy", [], "マジック → レア"));
  for (const c of ["exalt", "exalt_greater", "exalt_perfect"]) {
    for (const o of [[], [SIDE.exalt[0]], [SIDE.exalt[1]], ["OmenofGreaterExaltation"], ["OmenofGreaterExaltation", SIDE.exalt[0]], ["OmenofGreaterExaltation", SIDE.exalt[1]]]) out.push(set("exalt", c, o, "高貴"));
  }
  for (const c of ["chaos", "chaos_greater", "chaos_perfect"]) {
    for (const o of [[], ["OmenofWhittling"], [SIDE.erase[0]], [SIDE.erase[1]]]) out.push(set("chaos", c, o, "カオス"));
  }
  const bones = ["desecrate", "desecrate_ancient", ...(cls.pools.otherworldly ? ["desecrate_altered"] : [])];
  for (const c of bones) {
    for (const o of [[], [SIDE.necro[0]], [SIDE.necro[1]], ...Object.keys(FACTION_OMEN).map((f) => [f])]) out.push(set("desecrate", c, o, "冒涜 (骨 → 発現)"));
  }
  for (const o of [[], [SIDE.crystal[0]], [SIDE.crystal[1]]]) out.push(set("essence_perfect", "", o, "パーフェクトエッセンス (レア)"));
  for (const o of [[], [SIDE.annul[0]], [SIDE.annul[1]], ["OmenofLight"]]) out.push(set("annul", "annul", o, "消去"));
  out.push(set("rune", "", [], "ルーン"));
  return out;
}
export const setByKey = (sets: readonly PatternSet[], key: string): PatternSet | undefined => sets.find((x) => x.key === key);

/** 狙う MOD の手順 (simTargets の 1 つ) */
export interface PlanTarget { modId: string; minTierIndex: number; method?: string; alts?: ReadonlyArray<{ modId: string; minTierIndex: number }>; need?: number }

/** 前の手までで決まる状態 (狙いが当たったとして積む) */
export interface PatternState {
  rarity: "normal" | "magic" | "rare";
  prefix: number; suffix: number;
  limits: { prefix: number; suffix: number };
  runes: Set<string>; socketsLeft: number;
  essences: number; essenceLimit: number;
  desecrated: number;
  placed: Set<string>;
}

export interface CheckCtx {
  data: PatchData;
  cls: ItemBase;
  targets: readonly PlanTarget[];
  sets: readonly PatternSet[];
  runeJa: (en: string) => string;
  /** 始めの状態: フラクチャー済みのレア (固定の MOD の側) か白 */
  start: { rarity: "normal" | "rare"; fracturedSide: "prefix" | "suffix" | null; sockets: number };
}

export function stateBefore(ctx: CheckCtx, steps: readonly PatternStep[], upTo: number): PatternState {
  const st: PatternState = {
    rarity: ctx.start.rarity,
    prefix: ctx.start.fracturedSide === "prefix" ? 1 : 0,
    suffix: ctx.start.fracturedSide === "suffix" ? 1 : 0,
    limits: { prefix: ctx.cls.limits?.prefixes ?? 3, suffix: ctx.cls.limits?.suffixes ?? 3 },
    runes: new Set(), socketsLeft: ctx.start.sockets, essences: 0, essenceLimit: 1, desecrated: 0, placed: new Set(),
  };
  for (let i = 0; i < upTo && i < steps.length; i++) {
    const p = steps[i]!;
    const s = setByKey(ctx.sets, p.set);
    if (!s) continue;
    if (s.kind === "rune") {
      if (p.target) { st.runes.add(p.target); st.socketsLeft--; if (p.target === "Astrid's Creativity") st.essenceLimit = 2; }
      continue;
    }
    if (s.kind === "transmute") st.rarity = "magic";
    if (s.kind === "regal" || s.kind === "alchemy" || s.kind === "essence") st.rarity = "rare";
    const t = ctx.targets.find((x) => x.modId === p.target);
    if (!t) continue;
    st.placed.add(t.modId);
    const side = ctx.data.mods.get(t.modId)?.type === "suffix" ? "suffix" : "prefix";
    st[side] += 1;
    if (s.kind === "essence" || s.kind === "essence_perfect") st.essences++;
    if (s.kind === "desecrate") st.desecrated++;
  }
  return st;
}

/** セットを打てない理由 (打てれば null) */
export function checkSet(ctx: CheckCtx, st: PatternState, s: PatternSet): string | null {
  const need = (r: PatternState["rarity"], ja: string): string | null => (st.rarity === r ? null : `${ja}にだけ使える (この時点で${st.rarity === "normal" ? "ノーマル" : st.rarity === "magic" ? "マジック" : "レア"})`);
  switch (s.kind) {
    case "transmute": return need("normal", "ノーマル");
    case "alchemy": return st.rarity === "rare" ? "ノーマルかマジックにだけ使える (この時点でレア)" : null;
    case "augment": case "regal": case "essence": {
      const r = need("magic", "マジック");
      if (r) return r;
      if (s.kind === "essence" && st.essences >= st.essenceLimit) return "エッセンスの MOD は 1 つまで (アストリッドの創造性で 2 つ)";
      return null;
    }
    case "rune": return st.socketsLeft > 0 ? null : "ソケットが空いていない";
    default: break;
  }
  const r = need("rare", "レア");
  if (r) return r;
  if (s.kind === "desecrate") {
    if (st.desecrated >= 1) return "冒涜の MOD はアイテムに 1 つまで";
    if (s.omens.some((o) => FACTION_OMEN[o]) && !bossOmenAllowed(ctx.cls.category)) return "勢力のお告げは武器または宝飾品だけ";
    const side = s.omens.some((o) => PREFIX_OMENS.has(o)) ? "prefix" : s.omens.some((o) => SUFFIX_OMENS.has(o)) ? "suffix" : null;
    if (side && st[side] >= st.limits[side]) return `${side === "prefix" ? "プレフィックス" : "サフィックス"}の枠が埋まっている`;
  }
  if (s.kind === "essence_perfect" && st.essences >= st.essenceLimit) return "エッセンスの MOD は 1 つまで (アストリッドの創造性で 2 つ)";
  if (s.kind === "exalt" && st.prefix >= st.limits.prefix && st.suffix >= st.limits.suffix) return "枠が全部埋まっている";
  return null;
}

/** そのセットで付ける物 (狙う MOD) を選べない理由 (選べれば null) */
export function checkTarget(ctx: CheckCtx, st: PatternState, s: PatternSet, t: PlanTarget): string | null {
  const m = ctx.data.mods.get(t.modId);
  if (!m) return "MOD が見つからない";
  if (t.method === "fracture") return "フラクチャーで固定する MOD";
  if (st.placed.has(t.modId)) return "前の手で付けた";
  const side = m.type === "suffix" ? "suffix" : "prefix";
  const sideJa = side === "prefix" ? "プレフィックス" : "サフィックス";
  if (st[side] >= st.limits[side]) return `${sideJa}の枠が埋まる`;
  if (s.omens.some((o) => PREFIX_OMENS.has(o)) && side !== "prefix") return "左 (シニスター) のお告げはプレフィックスだけ";
  if (s.omens.some((o) => SUFFIX_OMENS.has(o)) && side !== "suffix") return "右 (デクストラル) のお告げはサフィックスだけ";
  const members = [m, ...(t.alts ?? []).map((a) => ctx.data.mods.get(a.modId)).filter((x): x is Mod => !!x)];
  switch (s.kind) {
    case "transmute": case "augment": case "regal": case "alchemy": case "exalt": case "chaos": {
      if (m.source === "desecrated") return "冒涜の MOD (骨で付ける)";
      if (m.source === "essence" || m.source === "perfect_essence") return "エッセンスの MOD (エッセンスで付ける)";
      if (m.rune && !st.runes.has(runeEnOf(ctx, m.rune) ?? "")) return `先に${ctx.runeJa(runeEnOf(ctx, m.rune) ?? m.rune)}を差す (差すと付く MOD)`;
      return null;
    }
    case "desecrate": {
      if (m.source !== "desecrated") return "冒涜の MOD ではない";
      const f = s.omens.map((o) => FACTION_OMEN[o]).find(Boolean);
      if (f && !members.some((x) => x.tags.includes(f))) return "このお告げの勢力の MOD ではない";
      if (s.currency === "desecrate_altered" && !members.some((x) => x.tags.includes("breach_desecration") || x.source === "desecrated")) return "変質した鎖骨で出ない MOD";
      return null;
    }
    case "essence": return ["lesser", "normal", "greater"].some((lv) => ESS[`essence:${lv}:${t.modId}`]) ? null : "マジックに使うエッセンスが無い MOD";
    case "essence_perfect": return ESS[`essence:perfect:${t.modId}`] ? null : "パーフェクトエッセンスが無い MOD";
    default: return null;
  }
}

/** ルーンを差す手で選べない理由 */
export function checkRune(_ctx: CheckCtx, st: PatternState, en: string): string | null {
  if (st.runes.has(en)) return "前の手で差した";
  if (st.socketsLeft <= 0) return "ソケットが空いていない";
  return null;
}

/** エンジンのルーンの id (kolrs-hunt) → ステージのルーンの英語名 (Kolr's Hunt) */
let runeEnById: Map<string, string> | null = null;
function runeEnOf(_ctx: CheckCtx, runeId: string): string | null {
  runeEnById ??= new Map(Object.keys(RUNES).flatMap((en) => { const id = runeIdByName(en); return id ? [[id, en] as const] : []; }));
  return runeEnById.get(runeId) ?? null;
}
export const runeEnForId = (runeId: string): string | null => runeEnOf(null as unknown as CheckCtx, runeId);

/** 外れた時の決まりを選べない理由 (選べれば null) */
export function checkMiss(s: PatternSet, rule: MissRule): string | null {
  if (rule === "redo" && s.kind === "desecrate") return "冒涜の MOD は 1 つまで (消さないともう一度打てない)";
  if ((rule === "redo" || rule === "annul_redo") && (s.kind === "transmute" || s.kind === "regal" || s.kind === "alchemy")) return "レアリティが変わるのでもう一度は打てない (次の手で直す)";
  return null;
}
/** 外れが無い手 (付ける物が必ず付く / 付ける物が無い) */
export const noMiss = (s: PatternSet | undefined): boolean => !s || s.kind === "rune" || s.kind === "annul" || s.kind === "essence" || s.kind === "essence_perfect";
