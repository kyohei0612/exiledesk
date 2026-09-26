/** sim-route.ts から切り出し (2026-09-26): シミュレーターの型 (手・○×の行き先・指輪・結果・設定) と、確定の手 / 側のお告げの判定 */
import { type Side, type StepCtx } from "./step-odds";

/** 1 回で付く物 1 つ (数える MOD = modId、それ以外 = 外れ)。tiers = 付いた時の段の MOD レベルの分布 (この中の割合) */
export interface RollOutcome { modId: string | null; family: string; side: Side; p: number; tiers: ReadonlyArray<{ lvl: number; p: number }> }

export type SimAction =
  /** side = 抹消のお告げ (次のカオスが消すのをその側だけに。足す側は選べない、枠の空いている側に付く) */
  | { kind: "chaos"; tier: "chaos" | "chaos_greater" | "chaos_perfect"; side?: Side | null }
  /** greater = 偉大なる高貴のお告げ (1 回で MOD を 2 つ足す。側のお告げ・触媒の高貴のお告げは両方に効く) */
  | { kind: "exalt"; tier: "exalt" | "exalt_greater" | "exalt_perfect"; side: Side | null; catalyst: string | null; greater?: boolean }
  | { kind: "annul"; side: Side | null }
  /**
   * removeSide = 結晶化のお告げの側 = **消す側** (poe2db: 「次のパーフェクトエッセンスが消すのをその側だけに」)。付く側は
   * エッセンスの MOD で決まる。省略時はエッセンスの MOD と同じ側
   */
  | { kind: "essence"; modId: string; removeSide?: Side | "auto" }
  | { kind: "desecrate"; side: Side; bone: "desecrate" | "desecrate_ancient"; echoes: boolean }
  | { kind: "light" }
  | { kind: "breach"; removeSide?: Side }
  | { kind: "whittle" }
  /** 打たずに○の条件だけ見る (CoE の確認だけの手。「キャスピがある? → 高貴へ / 無ければカオスへ」) */
  | { kind: "check" }
  /**
   * カタリストだけ入れて品質を上限まで上げる (オーナー 2026-09-24:「品質だけ上げる時もあるから、カタリストのみ付ける手の
   * ターンもある。○のとこやけど、×は入力しないから無視で進む」)。確定の手
   */
  | { kind: "quality"; catalyst: string };

/**
 * ○×の行き先: 手の id / 完成 / 自動 / 未設定 (そこで止まる)。
 *
 * **自動** (オーナー 2026-09-24:「キャスピ消えたら手 1 に戻るし、触媒の高貴のお告げの成功品が消えても失敗が残るから失敗品が消えるまで消去だし、
 * 失敗品消えたらもう一度っていう処理は自動でやりたい」):
 *   1. 本線 (手 1 から○をたどった手の並び) を上から見て、揃っていない一番上の手を探す
 *   2. それがカオスの手なら、外せる物が 1 つになるまで今の消去を続けてから、そこへ (スパムの狙いが消えたら剥がして最初から)
 *   3. それ以外で外れが残っていれば、今の手をもう 1 回 (消去を続ける)
 *   4. 外れが無ければ、その揃っていない手へ (失敗品が消えたら同じ触媒の高貴のお告げをもう 1 回、成功品が消えていたらその手から)
 *   5. 全部揃っていれば完成 (本線の最後が「完成」の時)
 * 揃っている = 狙いのどれかがある かつ 残したい MOD が全部ある (外れ無し・個数の条件は見ない)
 *
 * たどる時の決まり (人が自然にやる事):
 *   - 本線の狙いのある手で、もう揃っていれば飛ばして○の行き先へ (カオスで付け直した時、前の成功品が残っていれば次の手へ)。
 *     狙いの無い手 (品質だけ・削減・確認) は飛ばさない
 *   - 打てない (枠が無い等) けれど外れがあれば、先に × の行き先 (消去の手) へ回す (費用は掛からない)
 */
export type Goto = string | "done" | "auto" | null;

export interface SimNode {
  id: string;
  /** 打つ物。未設定なら null (そこで止まる。最初から何も入れない、オーナー) */
  action: SimAction | null;
  /** 狙う MOD。このうち `need` 個あれば○ (空なら問わない) */
  targets: Array<{ modId: string; minTier: number }>;
  /**
   * 狙う MOD のうち何個あれば○か (既定 1 = どれか)。「知性か全耐性」の手の次に「2 つとも」の手を置くため
   * (1 つ付いた時点で次の手まで○にならないように。2026-09-24)
   */
  need?: number;
  /** 残したい MOD (全部あること)。その手に来るまでに揃えた物を入れておく */
  keep: string[];
  /** 外れが無いことも○の条件にする */
  clean: boolean;
  /** 外せる MOD (固定済み以外) がこの数以下であることも○の条件にする (「1 つになるまで剥がしてカオスへ」)。無ければ問わない */
  maxMods?: number | null;
  /**
   * ブリーチの MOD がある時だけ打つ (無ければ飛ばして○の行き先へ)。削減でブリーチの MOD を消す手用: 無いのに打つと、
   * 一番レベルの低い狙いの MOD を消してしまう (2026-09-24 自動で組んだツリー)
   */
  onlyWithBreach?: boolean;
  onHit: Goto;
  onMiss: Goto;
}

/** シミュレーターの中の指輪 */
export interface SimSlot {
  /** 狙い / 残したい MOD として数える物だけ modId (段も満たす)。それ以外は null (外れ) */
  modId: string | null;
  side: Side;
  fixed: boolean;
  /** 冒涜でまだ当たっていない (光で消せる) 外れ */
  desecrated?: boolean;
  /**
   * 固定されていないが、消えたら終わりの MOD (付け直せない樹 MOD など)。カオス・消去では普通に消えうるが、外れには数えない。
   * 消えたらその回は止める (2026-09-24: 固定不要の始め方で、樹 MOD の側に触らない作り方になっているかを確かめる)
   */
  keep?: boolean;
  /**
   * クラフト MOD (エッセンス・合金で付いた物) / 冒涜で付いた MOD か。0.5 から、クラフト MOD は同時に 1 つまで・冒涜の MOD も
   * 1 つまで (パッチノート。2026-09-24 調べ)。ブリーチの MOD もクラフト MOD (state.breach で数える)
   */
  crafted?: boolean;
  desec?: boolean;
  label?: string;
  /**
   * 実際に付いた MOD の系統 (外れでも)。同じ系統はもう付かないので、以後の抽選から外す (2026-09-26 精度上げ: 前は狙いの MOD
   * だけ系統を数えていて、外れの系統が次の高貴でまた出る扱いだった)。modId があればそちらから引く
   */
  family?: string;
  /** 付いた段の MOD レベル (削減のお告げが一番低い物を消すのに使う)。分からなければ無し */
  lvl?: number;
}
export interface SimState {
  slots: SimSlot[];
  breach: boolean;
  /**
   * 今の品質 (%) と種類 (カタリストのタグ)。品質の手を打つと入る。**ブリーチの MOD が消えても下がらない**
   * (オーナー 2026-09-24:「一度 40% に上げた後、品質 MOD 消してもそのままだからね」)。
   * 未設定 (品質の手を打っていない) の間は、前の数え方 (上限の品質があるとみなし、触媒の高貴のお告げのたびにカタリスト代) のまま
   */
  quality?: number;
  qualityTag?: string | null;
}

export interface SimResult {
  runs: number;
  /** 「完成」まで行けた割合 */
  pDone: number;
  /** 完成して予算内だった割合 */
  pBudget: number | null;
  /** 完成した回だけの平均 (表示の分布と揃える用。比べる・選ぶには perDone を使う) */
  expected: number;
  /**
   * 1 個完成させるのに掛かる平均 = 全部の回の費用の合計 ÷ 完成した回数 (完成しなければ Infinity)。
   * 2026-09-26 レビュー (エンジニア B / クラフター C 一致): expected は失敗した回の費用を捨てていて、
   * 途中で壊れやすい組み方ほど安く見えていた
   */
  perDone: number;
  /** 全部の回の費用の合計 (まとめる用) */
  spentAll: number;
  p50: number;
  p80: number;
  p90: number;
  /** 手ごとの 1 回あたりの平均の打つ回数と費用 */
  perNode: Array<{ id: string; tries: number; cost: number }>;
  /** 止まった理由 (未設定の行き先に来た / 打てない) と、その割合 */
  stops: Array<{ reason: string; p: number }>;
  /** 完成した回の費用 (まとめる用) */
  doneCosts: number[];
  /** うちソケットに差す物の代 (1 回あたり。各回の初めに 1 度。差さなければ 0) */
  socketCost: number;
}

/**
 * 確定の手 (必ず付く・必ず消える)。× の行き先が未設定でも止めずに○の行き先へ進む
 * (オーナー 2026-09-24:「一応確定やから、そこの手でバツはデフォで入力しなかったら無視するように」)
 */
export const CERTAIN: ReadonlySet<SimAction["kind"]> = new Set(["essence", "breach", "light", "quality"]);

/** 側のお告げを使う手か (高貴・消去・カオスは側を選んだ時、エッセンス・ブリーチ・冒涜はいつも)。画面の「お告げ不要」の出し分け用 */
export function hasSideOmen(a: SimAction | null): boolean {
  if (!a) return false;
  switch (a.kind) {
    case "exalt": case "annul": case "chaos": return !!a.side;
    case "essence": case "breach": case "desecrate": return true;
    default: return false;
  }
}

/**
 * シミュレーターの設定。baseQuality = ベースの品質の上限 (普通 20、ブリーチの指輪 40、洗練されたブリーチリング 45)。
 * craftedLimit = 持てるクラフト MOD の数 (既定 1、アストリッドの創造性で 2)。socketCost = ソケットに差す物の代 (1 回の作成に
 * 1 度、各回の初めに足す)。2026-09-26 オーナー「アストリッドやら追加しとこうか」([[sockets.ts]])
 */
export type SimCtx = StepCtx & { baseQuality?: number; craftedLimit?: number; socketCost?: number };
