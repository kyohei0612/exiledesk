/**
 * pattern.ts — シミュレーションの「パターン」: 1 手ずつ並べた作り方 (2026-10-06 オーナー「パターン作ってほしい、簡単に操作できる UI で 1 手ずつ。
 * プルダウンはセットで選択させたい」「フラクチャー以降の話だから、それ以降で残りの MOD を決める」)。
 *
 * 1 手 = セット (打つ物 + お告げ) + 付ける物 (狙う MOD / ルーン) + 外れた時。セットと付ける物のプルダウンは、それまでの手で決まる状態で
 * 打てない物を理由つきで選べなくする (オーナー「ルーン嵌めてないのにコルの MOD とか、エッセンス 2 回目とか、選択できずにグレーアウト、理由も」)。
 * 状態は「狙いが当たった」として前の手から積む (外れは見ない。並べる時の目安)。回すのは recipe-sim.ts の pattern
 */
import { runeIdByName, RUNES } from "../craft-stage/engine";

export type PatternKind = "transmute" | "augment" | "regal" | "alchemy" | "exalt" | "chaos" | "desecrate" | "essence" | "essence_perfect" | "annul" | "rune" | "fracture";
/** 外れた時: そのまま次へ / 同じ手をもう一度 / 外れを消去してもう一度 / 最初から (フラクチャー済みのベースから) */
export type MissRule = "next" | "annul_next" | "redo" | "annul_redo" | "restart" | "reset";

export interface PatternStep {
  /** セットのキー (`種類|打つ物|お告げ+…`) */
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
/** off: 全部まとめて回す時に回さない (2026-10-07 オーナー「回すパターンを選択できるように」) */
/**
 * パターン。play = 打って作った手 (ADR-002)。steps は前の作り方の名残 (読み込まない、2026-10-10 に画面も消した。空で持つ)。
 * 流れ (flow) は 2026-10-10 に消した
 */
/** quiz = クイズのレシピの答え (ADR-003)。前の打って作る (play、ADR-002) は 2026-10-12 に外した */
export interface Pattern { name: string; steps: PatternStep[]; off?: boolean; quiz?: import("./quiz-build").QuizRules }

export const FACTION_OMEN: Record<string, string> = { OmenoftheSovereign: "ulaman_mod", OmenoftheLiege: "amanamu_mod", OmenoftheBlackblooded: "kurgal_mod" };
/** 「MOD が消えたら」の戻り先: 新しいベースで最初から */
export const LOST_RESTART = -1;
/** 打ち直せない手 (マジックにしか打てない・レアリティが変わる)。ここで付けた物が消えたら最初から */
export const ONCE_KINDS = new Set<PatternKind>(["transmute", "augment", "regal", "alchemy", "essence"]);

/** エンジンのルーンの id (kolrs-hunt) → ステージのルーンの英語名 (Kolr's Hunt) */
let runeEnById: Map<string, string> | null = null;
export function runeEnForId(runeId: string): string | null {
  runeEnById ??= new Map(Object.keys(RUNES).flatMap((en) => { const id = runeIdByName(en); return id ? [[id, en] as const] : []; }));
  return runeEnById.get(runeId) ?? null;
}
