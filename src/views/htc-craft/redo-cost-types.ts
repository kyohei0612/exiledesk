/** redo-cost.ts から切り出し (2026-09-26): 取り方の見積もりの型 (MethodEstimate / RedoPlan) と、画面にも出す決まり (RULES) */
import type { Side } from "../../services/htc/step-odds";

export type Method = "chaos" | "exalt" | "desecrate" | "essence";
export type Reroll = "light" | "overwrite";
export type Bone = "desecrate" | "desecrate_ancient";

/** 狙い 1 つの取り方 1 つの見積もり */
export interface MethodEstimate {
  modId: string;
  side: Side;
  method: Method;
  /** 冒涜の骨と外れの回し方 */
  bone?: Bone;
  reroll?: Reroll;
  /** 触媒の高貴のお告げを使う (品質の入れ直し代込み) */
  catalyst?: string | null;
  /** 高貴のオーブ (完全 / 上級 / 普通) */
  orb?: "exalt_perfect" | "exalt_greater" | "exalt";
  /** 外れは素の消去 (お告げ無し) の方が安いか */
  plainAnnul?: boolean;
  /**
   * 側のお告げ (高貴・ネクロマンシー・結晶化) が要らない (反対側が埋まっている / 外せる物が無い) ので 1 回の値段に入れていない。
   * シミュレーターの omenNeeded と同じ決まり (2026-09-26 オーナー承認)
   */
  noSideOmen?: boolean;
  /** カオスに抹消のお告げを付ける (触らない MOD がある側を消させない)。代は perTry に入っている */
  erasure?: boolean;
  /** 1 回の値段 (高貴建て) */
  perTry: number;
  /** 1 回で当たる確率 */
  p: number;
  /** 外れ 1 回のやり直し費用 (消す値段 + 消えうる物の作り直し) */
  perMiss: number;
  /** やり直しが確定 (他の物を巻き込まない) か */
  safe: boolean;
  /** 見込み (高貴建て) */
  expected: number;
  /** なぜその取り方が使えないか (使えない物は候補から外す) */
  why?: string;
}

export interface RedoPlan {
  /** 採る取り方 (狙いごと) */
  rows: MethodEstimate[];
  /** 合計の見込み */
  total: number;
  /** autoTree に渡す指定 */
  chaosPick: string | null;
  desecratePick: string | null;
  /** 狙いごとの高貴のオーブ (見積もりで安かった物) */
  exaltTiers: Record<string, "exalt_perfect" | "exalt_greater" | "exalt">;
  /** 側ごとの外れの消し方 (見積もりで安かった物。その側に高貴の狙いが無ければ無し) */
  annulSides: Partial<Record<Side, "plain" | "side">>;
  reroll?: Reroll;
  bone?: "preserved";
}

/** 決まり (画面にも出す) */
export const RULES: readonly string[] = [
  "冒涜の外れをエッセンス (天体) で上書きして回せるのは、その側の残りがフラクチャーだけの時 (結晶化はフラクチャー以外からランダムに消す)",
  "それ以外の冒涜の外れは光のお告げ + 消去 (冒涜の MOD だけ消えるので確定)",
  "高貴の外れは側の消去のお告げで消す。その側に固定でない物が他にあると巻き込む (その分の作り直しをやり直し費用に足す)",
  "触らない MOD (固定していない樹 MOD など) がある側では高貴を使わない (消去で消えるとその回は失敗)",
  "冒涜は 1 アイテム 1 つ、クラフト MOD (エッセンス・ブリーチ) も 1 つ",
  "カオスで引くのは最初の 1 つだけ (何も付いていないうちなら消えるのは外れだけ)",
];
