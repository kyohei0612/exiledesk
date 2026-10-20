/**
 * pattern.ts — シミュレーションの「パターン」: 1 手ずつ並べた作り方 (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
 * プルダウンはセットで選択させたい」「フラクチャー以降の話だから、それ以降で残りの MOD を決める」)。
 *
 * 1 手 = セット (打つ物 + お告げ) + 付ける物 (狙う MOD / ルーン) + 外れた時。セットと付ける物のプルダウンは、それまでの手で決まる状態で
 * 打てない物を理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。
 * 状態は「狙いが当たった」として前の手から積む (外れは見ない。並べる時の目安)。回すのは recipe-sim.ts の pattern
 */
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import { bossOmenAllowed } from "../../vendor/poe2htc/engine/probability";
import { ESSENCE_KEYS } from "../htc/essence-key-table";
import { runeIdByName } from "../../vendor/poe2htc/engine/runes";
import { RUNES } from "../craft-stage/stage-runes";

const ESS = ESSENCE_KEYS;
/** エッセンスの MOD の id → 種類 (普通のエッセンス / パーフェクト)。patternSets が data を持たないので、キーの表から引く */
const ESS_SOURCE = new Map<string, "essence" | "perfect_essence">(Object.keys(ESS).flatMap((k) => {
  const m = /^essence:(lesser|normal|greater|perfect):(.+)$/.exec(k);
  return m ? [[m[2]!, m[1] === "perfect" ? "perfect_essence" : "essence"] as const] : [];
}));

export type PatternKind = "transmute" | "augment" | "regal" | "alchemy" | "exalt" | "chaos" | "desecrate" | "essence" | "essence_perfect" | "annul" | "rune" | "fracture";
/** 外れた時: そのまま次へ / 同じ手をもう一度 / 外れを消去してもう一度 / 最初から (フラクチャー済みのベースから) */
export type MissRule = "next" | "annul_next" | "redo" | "annul_redo" | "restart" | "reset";

export interface PatternStep {
  /** セットのキー (PatternSet.key) */
  set: string;
  /** 付ける物: 狙う MOD の手順 (simTargets の modId) / ルーンの英語名。消去は無し */
  target: string | null;
  /**
   * 偉大なる高貴のお告げ (1 回で 2 つ) の手の 2 つ目の狙い (2026-10-07 オーナー「偉大を選ぶ時は MOD も選ばせないとダメ、次のページで狙う」)
   */
  target2?: string | null;
  /**
   * 偉大の手の 3 つ目の候補。候補 (target・target2・target3) のどれか 2 つが付けば当たり
   * (2026-10-07 オーナー「偉大で狙うのは 3 MOD まで決められるように、そのうちどれか当たり、2 つだけの選択で確定じゃなく増やせる」)
   */
  target3?: string | null;
  /**
   * 偉大の手で片方だけ当たり、消去で外れが消えた後に残りを打つ手 (セットのキー)。無ければ同じカレンシーで偉大だけ外した物
   * (2026-10-07 オーナー「片方空いてたら同じ流れを単体のカレンシーで、偉大は OFF、側のお告げは ON のまま」)
   */
  single?: string | null;
  /**
   * この手を打っている間に、付いている MOD (固定以外) が消えたら何手目 (0 始まり) からやり直すか。MOD ごと。無ければその MOD を付けた手
   * (2026-10-07 オーナー「片方当たり MOD が消えたら、にしよう。フラクチャーされてない MOD の数だけやり直しの選択肢、何手目かに設定」)。
   * LOST_RESTART (-1) は新しいベースで最初から。マジックの手 (変成・増強・王者・錬金・エッセンス) で付けた物はレアに打ち直せないので既定はこれ
   */
  lostGoto?: Record<string, number>;
  onMiss: MissRule;
  /**
   * 1 MOD 残し消去 (スパムまでリセット) の戻り先 (カオスの手の番号、0 始まり)。onMiss / 形の表の "reset" で使う
   * (2026-10-09 オーナー「カオススパムが初手ならそこまで消去を打ってリセット。最初からは消去 1 個無駄、1 MOD 残して消去 (リセット)」)
   */
  resetTo?: number;
  /**
   * 外す時の打つ物 + お告げ (セットのキー。消去・カオスの物)。「外してもう一度」の時に使う。無ければ自動 (やり直しの費用で素の消去か側のお告げ)。
   * 2026-10-06 オーナー「付ける時と外す時で分けて、それぞれこのやり方で表示」
   */
  miss?: string | null;
  /**
   * 外しがお告げ無しの消去の時、反対の側の MOD が消えたら: "annul" = もう一度消去 (狙いの側の外れを消す) / "redo" = もう一度打つ。無ければ増強は annul、高貴は redo (otherGoneOf)。
   * 狙いの側の外れが消えた時は必ずもう一度打つ (反対の側が埋まっていれば狙いの側に付く)。
   * 2026-10-07 オーナー「増強 2 回打って消去 → サフィだけ消えるともう 1 回消去、プレだけ消えたら消去は使わずにトライを繰り返す。いろんな場面で使える仕組みに」→「ツリーの枝で手で決める」
   */
  otherGone?: "annul" | "redo" | null;
  /**
   * 外しがお告げ無しの消去の時、外れが反対の側に付いたら: "keep" = 消さずにもう一度打つ (壁にして狙いの側に打たせる) / "annul" = 消去。
   * 無ければ増強は keep、高貴は annul (後の手で反対の側に別の狙いを付けることがある)。otherJunkOf で引く
   */
  otherJunk?: "keep" | "annul" | null;
  /**
   * 起こりうる状況ごとの反応 (2026-10-08 オーナー「● を実行した時の起こりうる状況を全てに対応する選択肢をユーザーが選ぶ、1 個 1 個。それがシミュレーション」)。
   * 選んだ状況だけ上の決まり (onMiss・miss・otherGone…) より先に使う。選んでいない状況は今までの決まりのまま
   */
  on?: Partial<Record<Situation, Reaction>>;
  /**
   * 結果ごとの行動 (2026-10-08 オーナー「打った結果全てにどういう行動をとるかを選択肢に。偉大左を打ったら狙い以外 2 / 当たり 1 狙い以外 1 / 当たり 2、
   * 狙い以外 2 なら消去、消去が狙い以外に刺さったら完全高貴、当たりに刺さったら…と細かく」)。
   * 狙いの側の状態「当たり h・狙い以外 j」(キー `${h}-${j}`) ごとに、次に打つ物 (set) かすること (then)。打った結果がまた別の状態になり、そこでも決めた物を使う
   */
  policy?: Record<string, PolicyAct>;
}
/** 結果の状態での行動: 打つ物 (set) か、次の手・最初から・N 手目 (then) */
/**
 * 結果の状態での行動: 打つ物 (set) か、次の手・最初から・N 手目 (then)。
 * pre は set の前に打つ形の変わらない物 (触媒で品質を足してから触媒の高貴、など。2026-10-09 オーナー「触媒打ったら品質消えるから足す作業」)
 */
export interface PolicyAct { set?: string; pre?: string[]; then?: "next" | "restart" | "goto" | "reset" | "miss"; goto?: number; /** 自動で入れた (前の手の始めと同じ形 → その手へ) */ auto?: boolean }
/**
 * 1 つの手で起こりうる状況。
 *   pre_full … 打つ前に狙いの側が狙い以外で埋まっている (6 MOD・ルーンで 7 MOD の時も)
 *   partial  … 一部だけ当たり (2 つ以上足す手・候補のうち N つ)
 *   miss_t   … 狙い以外が狙いの側に付いた / miss_o … 狙い以外が反対の側に付いた / miss … 狙い以外 (側が決まらない手)
 */
export type Situation = "pre_full" | "partial" | "miss_t" | "miss_o" | "miss";
/**
 * 状況への反応: 先に打つ物 (消去・カオス・パーフェクトエッセンス・骨。セットのキー、無ければ打たない) → 次にすること。
 * repeat はこの手をもう一度 (again があればその打ち方で: 偉大を外した 1 発など)、next は次の手、restart は新しいベースで最初から、goto は N 手目 (0 始まり)
 */
export interface Reaction { pre?: string | null; then: "repeat" | "next" | "restart" | "goto"; goto?: number; again?: string | null }
/**
 * お告げ無しの消去で反対の側が消えた時の既定 (PatternStep.otherGone)。増強はもう一度消去
 * (2026-10-07 オーナー「狙いがプレ 1 で増強 2 回打ってどっちも外れた場合、消去 1 回でサフィが残ってプレが消えたらもう 1 度消去は要らない」= 狙いの側が消えたら打つ、
 * 反対が消えて狙いの側に外れが残ったら消す。指輪のライフで消去 71 → 44)
 */
export const otherGoneOf = (kind: PatternKind | undefined, v: "annul" | "redo" | null | undefined): "annul" | "redo" => v ?? (kind === "augment" ? "annul" : "redo");
/** 外れが反対の側に付いた時の既定 (PatternStep.otherJunk) */
export const otherJunkOf = (kind: PatternKind | undefined, v: "keep" | "annul" | null | undefined): "keep" | "annul" => v ?? (kind === "augment" ? "keep" : "annul");
/** off: 全部まとめて回す時に回さない (2026-10-07 オーナー「回すパターンを選択できるように」) */
/**
 * パターン。play = 打って作った手 (ADR-002)。steps は前の作り方の名残 (読み込まない、2026-10-10 に画面も消した。空で持つ)。
 * 流れ (flow) は 2026-10-10 に消した
 */
/** quiz = クイズのレシピの答え (ADR-003)。前の打って作る (play、ADR-002) は 2026-10-12 に外した */
export interface Pattern { name: string; steps: PatternStep[]; off?: boolean; quiz?: import("./quiz-build").QuizRules }

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
  // 自前のフラクチャー (2026-10-07 オーナー「自前フラクチャーの仕組みができたら結構複雑な作り方でも対応できる」)。
  // レアで MOD 4 つ以上の時、未発現の冒涜以外から 1 つが固定される。付ける物 = 固定したい MOD (前の手で付けた物)。外れたら新しいベースで最初から
  out.push(set("fracture", "fracture", [], "フラクチャー (レア 4 MOD → 1 つ固定)"));
  out.push(set("rune", "", [], "ルーン"));
  return out;
}
/**
 * 付ける物「何が付いてもいい (打つだけ)」(2026-10-07 オーナー「高貴だけ適当に打って、それを犠牲にエッセンスを選んだりする、打つってだけの選択肢も欲しい」)。
 * 外れが無い手。回す時は付ける物無し (打って次へ)。使えるのはランダムに MOD が付く物だけ
 */
export const ANY_TARGET = "*";
/** 1 回で 2 つ付ける手 (偉大なる高貴のお告げ) */
export const isDouble = (s: PatternSet | undefined): boolean => !!s && s.kind === "exalt" && s.omens.includes("OmenofGreaterExaltation");
/**
 * 候補を足せる手 (ガチャ: ランダムに付く物)。候補のどれかが付けば当たり (偉大は 2 つ)
 * (2026-10-07 オーナー「ガチャの時だけ複数選択、偉大だからじゃなくて高貴やらカオススパムやら一緒」)
 */
export const GACHA_KINDS = new Set<PatternKind>(["transmute", "augment", "regal", "exalt", "chaos", "desecrate", "fracture"]);
export const hasCands = (s: PatternSet | undefined): boolean => !!s && GACHA_KINDS.has(s.kind);
/**
 * 付ける物「前の手の候補の残り」(rest:<手の番号>)。候補が付く数より多い手 (偉大で 3 つのどれか 2 つ など) の後は、どれが残るか分からないので
 * 次の手では個別に選ばず「残り」を狙う (2026-10-07 オーナー「偉大で 2/3 にするとそれ以降の設定どうするか。次の奴の選択肢に残りのプレフィックス MOD 1 つと表示」)
 */
export const REST = "rest:";
/** 「MOD が消えたら」の戻り先: 新しいベースで最初から */
export const LOST_RESTART = -1;
/** 打ち直せない手 (マジックにしか打てない・レアリティが変わる)。ここで付けた物が消えたら最初から */
export const ONCE_KINDS = new Set<PatternKind>(["transmute", "augment", "regal", "alchemy", "essence"]);
export const isRest = (t: string | null | undefined): t is string => !!t && t.startsWith(REST);
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
  /** 自前のフラクチャーの手で固定した MOD (この後は消えない) */
  fractured: string | null;
  /**
   * 「付かなかった → そのまま次へ」の手で狙った物 (付いていないかもしれない)。後の手でもう一度狙える (付いていれば計算はその手を飛ばす)。
   * 2026-10-07 オーナー「付かなかった場合次へはあるけど、次の所でもっかい狙いの MOD が選べない」(手袋: 上級の変成で外れたら上級の増強で同じ MOD)
   */
  maybe: Set<string>;
  /** 打つだけの手で付いた物 (側は分からない) */
  junk: number;
}

export interface CheckCtx {
  data: PatchData;
  cls: ItemBase;
  targets: readonly PlanTarget[];
  sets: readonly PatternSet[];
  runeJa: (en: string) => string;
  /**
   * 始めの状態: フラクチャー済みのレア (固定の MOD の側) か白。mods があれば手で打つ画面から持ってきた状態
   * (付いている MOD の数・狙いのうち付いている物・固定・冒涜・エッセンス。2026-10-08)
   */
  start: {
    rarity: "normal" | "magic" | "rare"; fracturedSide: "prefix" | "suffix" | null; sockets: number;
    mods?: { prefix: number; suffix: number; placed: string[]; fractured: string | null; desecrated: number; essences: number };
  };
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
    case "fracture": {
      if (st.fractured || ctx.start.fracturedSide) return "もう固定した MOD がある (フラクチャーは 1 つだけ)";
      if (st.rarity !== "rare") return "レアにだけ使える";
      const n = st.prefix + st.suffix + st.junk;
      return n >= 4 ? null : `MOD が 4 つ以上要る (この時点で ${n} つ。先に高貴・骨などで埋める)`;
    }
    default: break;
  }
  const r = need("rare", "レア");
  if (r) return r;
  // カオス・消去は付いている MOD を消すので、固定 (フラクチャー) 以外に何か付いていないと打てない
  // (2026-10-07 オーナー「パターン 3 で回せない理由は」: フラクチャー済みにすぐカオスで、1500 回とも「外せる MOD が無い」で止まっていた)
  if ((s.kind === "chaos" || s.kind === "annul") && st.prefix + st.suffix + st.junk - (ctx.start.fracturedSide ? 1 : 0) <= 0) return "消せる MOD が無い (固定だけ。先に「打つだけ」で高貴などを 1 つ付ける)";
  if (s.kind === "desecrate") {
    if (st.desecrated >= 1) return "冒涜の MOD はアイテムに 1 つまで";
    if (s.omens.some((o) => FACTION_OMEN[o]) && !bossOmenAllowed(ctx.cls.category)) return "勢力のお告げは武器・宝飾品・矢筒だけ";
    const side = s.omens.some((o) => PREFIX_OMENS.has(o)) ? "prefix" : s.omens.some((o) => SUFFIX_OMENS.has(o)) ? "suffix" : null;
    if (side && st[side] >= st.limits[side]) return `${side === "prefix" ? "プレフィックス" : "サフィックス"}の枠が埋まっている`;
  }
  if (s.kind === "essence_perfect" && st.essences >= st.essenceLimit) return "エッセンスの MOD は 1 つまで (アストリッドの創造性で 2 つ)";
  if (s.kind === "exalt" && st.prefix + st.suffix + st.junk >= st.limits.prefix + st.limits.suffix) return "枠が全部埋まっている";
  if (s.omens.includes("OmenofCatalysingExaltation")) return "触媒の高貴のお告げは品質 (カタリスト) が要る (パターンにはまだカタリストの手が無い)";
  return null;
}

/** エンジンのルーンの id (kolrs-hunt) → ステージのルーンの英語名 (Kolr's Hunt) */
let runeEnById: Map<string, string> | null = null;
function runeEnOf(_ctx: CheckCtx, runeId: string): string | null {
  runeEnById ??= new Map(Object.keys(RUNES).flatMap((en) => { const id = runeIdByName(en); return id ? [[id, en] as const] : []; }));
  return runeEnById.get(runeId) ?? null;
}
export const runeEnForId = (runeId: string): string | null => runeEnOf(null as unknown as CheckCtx, runeId);
