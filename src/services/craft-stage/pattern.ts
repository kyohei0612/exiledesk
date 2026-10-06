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
/** エッセンスの MOD の id → 種類 (普通のエッセンス / パーフェクト)。patternSets が data を持たないので、キーの表から引く */
const ESS_SOURCE = new Map<string, "essence" | "perfect_essence">(Object.keys(ESS).flatMap((k) => {
  const m = /^essence:(lesser|normal|greater|perfect):(.+)$/.exec(k);
  return m ? [[m[2]!, m[1] === "perfect" ? "perfect_essence" : "essence"] as const] : [];
}));

export type PatternKind = "transmute" | "augment" | "regal" | "alchemy" | "exalt" | "chaos" | "desecrate" | "essence" | "essence_perfect" | "annul" | "rune";
/** 外れた時: そのまま次へ / 同じ手をもう一度 / 外れを消去してもう一度 / 最初から (フラクチャー済みのベースから) */
export type MissRule = "next" | "redo" | "annul_redo" | "restart";
export const MISS_JA: Record<MissRule, string> = { next: "そのまま次へ", redo: "同じ手をもう一度", annul_redo: "外してもう一度", restart: "最初からやり直す" };

export interface PatternStep {
  /** セットのキー (PatternSet.key) */
  set: string;
  /** 付ける物: 狙う MOD の手順 (simTargets の modId) / ルーンの英語名。消去は無し */
  target: string | null;
  onMiss: MissRule;
  /**
   * 外す時の打つ物 + お告げ (セットのキー。消去・カオスの物)。「外してもう一度」の時に使う。無ければ自動 (やり直しの費用で素の消去か側のお告げ)。
   * 2026-10-06 オーナー「付ける時と外す時で分けて、それぞれこのやり方で表示」
   */
  miss?: string | null;
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

/**
 * セットの一覧 (プルダウンの中身。打てるかは checkSet で見る)。お告げは重ねられる組み合わせを全部 (2026-10-06 オーナー「全パターンセットで置いて良い」)。
 * 側のお告げは左右どちらか 1 つ、勢力のお告げは 1 つ。今のゲームに無いお告げ (REMOVED_OMENS) と、単体で効く腐食は入れない
 */
export function patternSets(cls: ItemBase): PatternSet[] {
  const out: PatternSet[] = [];
  const sides = (pair: readonly [string, string]): string[][] => [[], [pair[0]], [pair[1]]];
  const cross = (...lists: string[][][]): string[][] => lists.reduce<string[][]>((acc, l) => acc.flatMap((a) => l.map((b) => [...a, ...b])), [[]]);
  for (const c of ["transmute", "transmute_greater", "transmute_perfect"]) out.push(set("transmute", c, [], "変成 (ノーマル → マジック)"));
  for (const c of ["augment", "augment_greater", "augment_perfect"]) out.push(set("augment", c, [], "増強 (マジック)"));
  // エッセンスは 1 個ずつ (このベースで使える物。付く MOD と側がエッセンスごとに違う。2026-10-07 オーナー「パーフェクトエッセンスが簡略されてる、
  // 何でするかによってサフィについたりプレについたりする、使える状態のエッセンスは全部表示」)
  const essOf = (src: "essence" | "perfect_essence"): string[] => [...cls.pools.essence.prefixes, ...cls.pools.essence.suffixes].filter((id) => ESS_SOURCE.get(id) === src);
  for (const id of essOf("essence")) for (const lv of ["lesser", "normal", "greater"]) { const k = `essence:${lv}:${id}`; if (ESS[k]) out.push(set("essence", k, [], "エッセンス (マジック → レア)")); }
  for (const c of ["regal", "regal_greater", "regal_perfect"]) out.push(set("regal", c, [], "王者 (マジック → レア)"));
  out.push(set("alchemy", "alchemy", [], "錬金 (→ レア)"));
  for (const c of ["exalt", "exalt_greater", "exalt_perfect"]) {
    for (const o of cross(sides(SIDE.exalt), [[], ["OmenofGreaterExaltation"]], [[], ["OmenofCatalysingExaltation"]])) out.push(set("exalt", c, o, "高貴"));
  }
  for (const c of ["chaos", "chaos_greater", "chaos_perfect"]) {
    for (const o of cross([[], ["OmenofWhittling"]], sides(SIDE.erase))) out.push(set("chaos", c, o, "カオス"));
  }
  const bones = ["desecrate", "desecrate_ancient", ...(cls.pools.otherworldly ? ["desecrate_altered"] : [])];
  for (const c of bones) {
    for (const o of cross(sides(SIDE.necro), [[], ...Object.keys(FACTION_OMEN).map((f) => [f])], [[], ["OmenofAbyssalEchoes"]])) out.push(set("desecrate", c, o, "冒涜 (骨 → 発現)"));
  }
  for (const id of essOf("perfect_essence")) { const k = `essence:perfect:${id}`; if (ESS[k]) for (const o of sides(SIDE.crystal)) out.push(set("essence_perfect", k, o, "パーフェクトエッセンス (レア)")); }
  for (const o of [[], [SIDE.annul[0]], [SIDE.annul[1]], ["OmenofLight"]]) out.push(set("annul", "annul", o, "消去"));
  out.push(set("rune", "", [], "ルーン"));
  return out;
}
/** レアリティが変わる手 (外れても外してやり直せない) */
export const RARITY_CHANGE = new Set<PatternKind>(["transmute", "regal", "alchemy", "essence"]);
const sideOf = (omens: readonly string[]): "prefix" | "suffix" | null =>
  omens.some((o) => PREFIX_OMENS.has(o)) ? "prefix" : omens.some((o) => SUFFIX_OMENS.has(o)) ? "suffix" : null;
const SIDE_JA = { prefix: "プレフィックス", suffix: "サフィックス" } as const;
/**
 * やり直しのカレンシーで、外れた MOD を消せない理由 (消せれば null)。2026-10-07 オーナー「やり直せない奴は選択させない、
 * そのMODが消えない奴は選択できない」。外れが付く側は、付ける手の側のお告げで決まる (無ければどちらか分からないので、側の決め打ちは止めない)
 */
export function checkRemoval(add: PatternSet, rm: PatternSet): string | null {
  if (RARITY_CHANGE.has(add.kind)) return "この手はレアリティが変わるので、外してやり直せない";
  if (rm.kind === "chaos" && add.kind === "augment") return "カオスはレアだけ (この手はマジック)";
  if (rm.omens.includes("OmenofLight") && add.kind !== "desecrate") return "光のお告げは冒涜の MOD だけ消す (外れは普通の MOD)";
  if ((rm.kind === "essence_perfect" || rm.kind === "desecrate") && add.kind === "augment") return "レアだけ (この手はマジック)";
  if (rm.kind === "desecrate" && add.kind === "desecrate") return "冒涜の MOD は 1 つまで (外れの冒涜は光か消去で外す)";
  const junk = add.kind === "exalt" || add.kind === "desecrate" ? sideOf(add.omens) : null;
  const only = sideOf(rm.omens);
  if (junk && only && junk !== only) return `外れは${SIDE_JA[junk]}に付くので、${SIDE_JA[only]}だけを消すお告げでは消えない`;
  return null;
}
/** 外す時に使えるセット (消去・カオス) */
/**
 * 外す時に使えるセット: 消去・カオス・パーフェクトエッセンス (結晶化で外れの側を上書き)・冒涜 (骨 + 側のネクロマンシーで外れの側を置き換え)。
 * 2026-10-07 オーナー「やり直し効く奴沢山あるでしょ、エッセンスとか冒涜系」
 */
export const removalSets = (sets: readonly PatternSet[]): PatternSet[] =>
  sets.filter((x) => x.kind === "annul" || x.kind === "chaos" || x.kind === "essence_perfect" || (x.kind === "desecrate" && !x.omens.some((o) => FACTION_OMEN[o])));
/**
 * シミュレーションの基本情報 (始めのレアリティ・ソケット・部位) で、そもそも使わない物を外す (灰色で並べない)。
 * 2026-10-07 オーナー「フラクチャー品だし、フラクチャー後なんだからレアだろ、基本情報連携してくれ、一括管理なんだからわかるだろ」。
 * フラクチャー済み (レア) から始めるなら変成・増強・王者・錬金・マジックのエッセンスは出さない。ソケットが 0 ならルーン、勢力のお告げが効かない部位なら勢力、
 * 触媒の高貴はパターンにカタリストの手が無いので出さない
 */
export function setsForStart(sets: readonly PatternSet[], cls: ItemBase, start: { rarity: "normal" | "rare"; sockets: number }): PatternSet[] {
  const magicOnly = new Set<PatternKind>(["transmute", "augment", "regal", "alchemy", "essence"]);
  return sets.filter((x) =>
    !(start.rarity === "rare" && magicOnly.has(x.kind))
    && !(x.kind === "rune" && start.sockets <= 0)
    && !(x.omens.some((o) => FACTION_OMEN[o]) && !bossOmenAllowed(cls.category))
    && !x.omens.includes("OmenofCatalysingExaltation"));
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
  if (s.omens.includes("OmenofCatalysingExaltation")) return "触媒の高貴のお告げは品質 (カタリスト) が要る (パターンにはまだカタリストの手が無い)";
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
    case "essence": case "essence_perfect":
      // セットのエッセンスで付く MOD だけ (エッセンスごとに MOD が決まっている)
      if (s.currency) return s.currency.endsWith(`:${t.modId}`) ? null : "このエッセンスで付く MOD ではない";
      return s.kind === "essence" ? (["lesser", "normal", "greater"].some((lv) => ESS[`essence:${lv}:${t.modId}`]) ? null : "マジックに使うエッセンスが無い MOD") : ESS[`essence:perfect:${t.modId}`] ? null : "パーフェクトエッセンスが無い MOD";
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
