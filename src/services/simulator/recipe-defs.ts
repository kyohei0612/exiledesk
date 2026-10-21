/**
 * recipe-defs.ts — 決めた順番で作るシミュレーションの型と小さな決まり (recipe-sim.ts から分けた。2026-10-16、500 行の決まり)。
 * 呼ぶ側は今まで通り recipe-sim.ts から読める
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { MissRule, PatternKind } from "./pattern";
import type { StageItem, StageMod, StageSide } from "../craft-stage/types";
import { ESSENCE_KEYS } from "../htc/essence-key-table";

export type RecipeMethod = "exalt" | "chaos" | "augment" | "desecrate" | "essence" | "fracture";
/**
 * 狙いの 1 手順。alts があれば「どれか 1 つが付けば当たり」(2026-10-05 オーナー「マークスマンの MOD をプレで複数選んで狙いたい。
 * その 1 つの MOD の所は他の MOD でも当たりとする」)。alts は modId と同じ側・同じ付け方 (普通 / 冒涜) の物だけ
 */
export interface RecipeTarget {
  modId: string; minTierIndex: number; method: RecipeMethod; alts?: ReadonlyArray<{ modId: string; minTierIndex: number }>;
  /** 候補 (本体 + alts) のうちいくつ付けば当たりか (既定 1。2026-10-05 オーナー「どれか 2 つとかも選ばせたい」)。その数だけ枠を使う */
  need?: number;
}
/** 値段を 1 回引いたら覚える (相場の一覧を毎手引くと、500 回で 46 秒かかっていた)。1 回の「回す」ごとに作る */
export function memoPrice(f: (k: string) => number): (k: string) => number {
  const memo = new Map<string, number>();
  return (k) => { let v = memo.get(k); if (v == null) { v = f(k); memo.set(k, v); } return v; };
}
/** その手順で当たりになる MOD (本体 + alts) */
export const membersOf = (t: Pick<RecipeTarget, "modId" | "minTierIndex" | "alts">): Array<{ modId: string; minTierIndex: number }> => [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
/**
 * 候補のうちいくつ付けば当たりか (どれか N つ)。冒涜の手順でも N はそのまま: 冒涜で付けるのは候補のどれか 1 つ (冒涜の MOD は
 * アイテムに 1 つまで)、残りの N − 1 つは高貴で付ける (2026-10-05 オーナー「3 つのうちどれかは 3 つのうちどれが当たりでも可能とする話、
 * 今回の奴に関しては結局 3 パターンいる」)
 */
export const needOf = (t: RecipeTarget): number => Math.max(1, Math.min(t.need ?? 1, membersOf(t).length));
export const hits = (t: RecipeTarget, m: StageMod): boolean => membersOf(t).some((x) => m.modId === x.modId && m.tierIndex >= x.minTierIndex);
/** パターンの 1 手 (pattern.ts の手を狙いとつないだ物。打つ物はエッセンス以外セットで決まる) */
export interface CompiledStep {
  kind: PatternKind; currency: string; omens: string[];
  /** 狙う MOD の手順 (無ければ付ける物の無い手: 消去・ルーン) */
  target: RecipeTarget | null;
  /** 偉大の手で片方当たった後、残りを打つ手 (無ければ偉大だけ外す) */
  single?: { kind?: PatternKind; currency: string; omens: string[] };
  /** この手の間に消えた MOD (modId) → 戻る手の番号 (パターンの中の 0 始まり) */
  lostGoto?: Record<string, number>;
  /** ルーンを差す手の英語名 */
  rune?: string;
  onMiss: MissRule;
  /** 打って作るパターンの手 (ADR-002)。前の手の狙いが消えても自動で取り直さない (消えた形の手はユーザーが決めている) */
  play?: boolean;
  /** 反対の側に残っているはずの前の手の狙いの数 (打って作るパターン)。減っていたら揃っていても形の手で決める */
  gNeed?: number;
  /** 1 MOD 残し消去の戻り先 (並べた後の番号) */
  resetTo?: number;
  /** 両側の狙いのカオス (打って作る、side any): 打つ前に外れを 1 つまで消去で減らす */
  spam?: boolean;
  /** 揃った後の行き先 (無ければ次の手。pat.length = 完成の確かめ) */
  next?: number;
  /** 揃った後、当たった MOD の側で分ける行き先 */
  branch?: { prefix: number; suffix: number };
  /** 外す時の打つ物 + お告げ (無ければ自動)。kind はパーフェクトエッセンス (一番安い物を選ぶ)・冒涜 (発現まで) を見分ける */
  miss?: { kind?: PatternKind; currency: string; omens: string[] };
  /** お告げ無しの消去で反対の側が消えたら、もう一度消去 (PatternStep.otherGone) */
  otherGone?: "annul";
  /** お告げ無しの消去で外す時、外れが反対の側に付いたら消さずにもう一度打つ (PatternStep.otherJunk) */
  otherJunk?: "keep";
  /** 状況ごとの反応 (PatternStep.on をセットに直した物。goto は並べた後の番号) */
  /** 結果の状態ごとの行動 (PatternStep.policy をセットに直した物。キーは `${当たり}-${ハズレ}` (狙いの側)) */
  policy?: Record<string, { act?: { kind?: PatternKind; currency: string; omens: string[] }; pre?: Array<{ currency: string; omens: string[] }>; then?: "next" | "restart" | "goto" | "reset" | "miss"; goto?: number; keep?: number }>;
  on?: Partial<Record<"pre_full" | "partial" | "miss_t" | "miss_o" | "miss", { pre?: { kind?: PatternKind; currency: string; omens: string[] } | null; then: "repeat" | "next" | "restart" | "goto"; goto?: number; again?: { kind?: PatternKind; currency: string; omens: string[] } | null }>>;
  /**
   * 「残り」の手の元の手 (パターンの中の番号)。この手の間に候補が消えても、まだ 1 つでも付いていればこの手を続け、全部消えたら元の手へ
   * (2026-10-08 オーナー「全部消えたら高貴 → 2 手目へ戻る流れ、消去はそのまま普通の消去」)
   */
  restFrom?: number;
}
export interface RecipeSpec {
  /**
   * パターン (2026-10-06): あれば、フラクチャーまで (か白) の後はこの手の通りに打つ (自動の付け方は使わない)。
   * ルーンもパターンの手で差す (白から差しておくのはやめる)
   */
  pattern?: readonly CompiledStep[];
  /**
   * 外れの消し方 (側ごと): 素の消去 / 側の消去のお告げ。計算機のやり直しの費用 (redo-cost.ts の annulSides) から決めた物。
   * 無ければ「反対側に当たりがあれば側のお告げ」(2026-10-06)
   */
  annulSides?: Partial<Record<StageSide, "plain" | "side">>;
  data: PatchData;
  base: string;
  itemLevel: number;
  /** 上から順に作る */
  targets: readonly RecipeTarget[];
  /**
   * フラクチャーの狙い (付け方 fracture、いくつでも = 同じ側の候補で、どれか 1 つが付いたら進み、どれが固定されても良い) の始め方。"bought" = 付いた状態のベースを買う (price は高貴建て)。
   * "make" = 確率込みで作る。route "alch" = 錬金 → 狙いが付くまでカオス、"magic" = 変成・増強ガチャ (狙いが全部揃うまで) → 王者 → 高貴
   * (blocker = 4 つ目を骨の未発現の冒涜にして、フラクチャーの候補を 1 つ減らす)
   */
  fractureStart?: { kind: "make"; route?: "alch" | "magic"; blocker?: boolean } | { kind: "bought"; price: number };
  /**
   * 白のベースの値段 (高貴建て、手で入れる。規格外のソケット付きならその値段)。白から始める時・作り直す時に数え、マジックで外れた時に
   * 「消去」と「白を買い直して変成」の安い方を選ぶ (2026-10-05 オーナー「消去もバカにならんが」「フラクチャーと消去の値段、ベースの規格外の値段次第」)
   */
  whiteBasePrice?: number;
  /**
   * 手で打つ画面から持ってきた始めの状態 (その MOD が付いた状態から先を回す。2026-10-08)。これがある時は白・固定済みの始まりは使わず、
   * 1 人ごとにこのアイテムの写しから始める。「最初から」はこの状態を買い直す (startPrice = 手打ちの累計 + 白ベース代)
   */
  startItem?: StageItem;
  startPrice?: number;
  /** 白のベースのソケットの数 (0 / 1 / 2、規格外のベース。2026-10-05 オーナー「ベース選択後ソケット何個か選ばせて、これだとただの通常品のベース」) */
  sockets?: number;
  /** 1 個の値段 (高貴建て) */
  price: (key: string) => number;
  runs: number;
  /** 1 回の挑戦の手の上限 (超えたら失敗) */
  maxSteps?: number;
  seed?: number;
}
export interface RecipeRun {
  done: boolean; cost: number; steps: Array<{ currency: string; omen: string | null }>; seed: number; reason?: string;
  /** 白から作り直した時の、最後の作り直しの手の番号 (再生はここから。前の手は費用にだけ入る) */
  replayFrom: number;
  /** 使った白のベースの数 (始めの 1 個 + 作り直し。付いた状態で始めた時は 0) */
  bases: number;
  /** 終わった時に付いていた狙いの MOD (固定以外) */
  hits?: string[];
  /** パターンの手ごと (並べた後の番号): その手のカレンシーを打った数と、その手にいる間にかかった費用 (外しの消去なども込み)。「この手だけ回す」用 */
  stepPresses?: number[];
  stepCost?: number[];
}
export interface RecipeResult {
  runs: number;
  pDone: number;
  /** 1 個できるまでの平均 (全部の回の費用 ÷ 完成した回数) */
  perDone: number;
  p50: number; p80: number; p90: number;
  /** 打った物ごとの、1 個できるまでの平均の数と費用 */
  usage: Array<{ key: string; count: number; cost: number }>;
  /** 止まった理由と割合 */
  stops: Array<{ reason: string; p: number }>;
  /** 費用が真ん中くらいの完成した回 (ステージで再生する用) */
  sample: RecipeRun | null;
  /** 1 個できるまでに使った白のベースの平均 */
  bases: number;
  /** 狙いの MOD ごとの、終わった時に付いていた割合 (全部の回で。未完成のパターンで「どこまで付くか」を見る) */
  hitRates: Array<{ modId: string; p: number }>;
  /** パターンの手ごとの平均 (全部の回で、打った数と費用)。「この手だけ回す」の結果 (2026-10-07) */
  stepAvg?: Array<{ presses: number; cost: number; p80Presses: number; p80Cost: number }>;
  /** イレギュラー (答えの無い状況で止めた人) の数と回した全員の数。runs・pDone・費用には入っていない (2026-10-20) */
  irregular?: { n: number; of: number };
}

export const ESS = ESSENCE_KEYS;
/** 結晶化のお告げの側 (無ければ両側) */
export const crystalSides = (omens: readonly string[]): StageSide[] => (omens.some((o) => /SinistralCrystallisation/.test(o)) ? ["prefix"] : omens.some((o) => /DextralCrystallisation/.test(o)) ? ["suffix"] : ["prefix", "suffix"]);
export const SIDE_OMEN = {
  exalt: { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" },
  annul: { prefix: "OmenofSinistralAnnulment", suffix: "OmenofDextralAnnulment" },
  necro: { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" },
  crystal: { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" },
} as const;
