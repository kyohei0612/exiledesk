/**
 * sim-state.ts — シミュレーターの状態 (ベース選び・始め方・狙う MOD・順番・パターン)。state/craft-stage.ts から分けた (2026-10-16、500 行の決まり)。
 * 画面からは今まで通り craftStage.simTargets などで触る
 */
import { ref } from "vue";
import type { StageItem } from "../services/craft-stage/types";
import type { Pattern } from "../services/craft-stage/pattern";

/** method = 付け方 (順番どおりのシミュレーション、[[recipe-sim.ts]])。省くと MOD の種類で決める (普通 = 高貴、冒涜 = 冒涜、エッセンス = エッセンス) */
/**
 * シミュレーションはベース選びから (2026-10-05 オーナー「実験開いたらベース決めからでしょ、ベースはデフォは選択なしでスタート」)。
 * simPicked = このタブでベースを選んだ。simShowMods = 下の MOD 一覧を出す段まで来た (② 付ける順番から)
 */
export const simPicked = ref(false);
/** 付与スキル (候補から 1 つ付くベース = 悲嘆・前兆・不在のアミュレットだけ)。3 の始め方で選ぶ。ベースを選び直すと空 (2026-10-18 オーナー「スキル付与が違うベース、3 の始め方で選ばせよう」) */
export const simGrant = ref<string | null>(null);
export const simShowMods = ref(false);
/** シミュレーションの白のベースのソケットの数 (1 ベースの枠で選ぶ。null = まだ) */
export const simSockets = ref<number | null>(null);
/**
 * 始め方 (1 ベースの枠で選ぶ。2026-10-08 オーナー「フラクチャー MOD を選んでそこからシミュレーターしたい場合は最初の段階から選択式がいい」)。
 * white = 白のベースから / fractured = 固定済みのベースを買う (固定 MOD は 2 狙う MOD の最初の 1 つ) / four = 4 MOD のレア (3 MOD + 狙い 1) を買って自分で固定。
 * 4 最安値スタートの 3 ルートを前に出した物。white 以外は 4 を飛ばし、始めのベース代は 3 で入れた値段
 */
export type SimStart = "white" | "fractured" | "four" | "item" | "magic";
export const simStart = ref<SimStart>("white");
/**
 * 手で打つ画面から持ってきた始めの状態 (2026-10-08 オーナー「その MOD が付いた状態以降を確認したい時があるから、手打ちからそのまま持っていくコース」)。
 * simStart = "item" の時だけ使う。simStartCost = その時点の手打ちの累計 (高貴)
 */
export const simStartItem = ref<StageItem | null>(null);
/** ベースを選ぶ前に選んだレシピ (StageSimPanel が開いたら読み込む。2026-10-08 完成判定: レシピはベースを選ぶまで出なかった) */
export const simPendingRecipe = ref<string | null>(null);
export const simStartCost = ref(0);
/**
 * ② の狙い。rest = フラクチャー予定の狙いだけ: 候補が 2 つ以上で、固定されなかった方も完成品に要る時のその付け方 (無ければ「どれか 1 つで良い」。
 * 2026-10-21 オーナー「どっちも要る時は一段下に付け方で 1 MOD 群増やして、フラクチャー以外の付け方を選ばせる。どっちかなら要らん」)
 */
export const simTargets = ref<Array<{ modId: string; minTierIndex: number; method?: "exalt" | "chaos" | "augment" | "desecrate" | "essence" | "fracture"; alts?: Array<{ modId: string; minTierIndex: number }>; need?: number; rest?: "exalt" | "chaos" | "desecrate" }>>([]);
/** ② のこの手順 (本体の modId) の「あるいは」を選ぶポップアップを開いている ([[StageFracturePicker.vue]] の altFor) */
export const simAltFor = ref<string | null>(null);
/**
 * 5 順番計画 (2026-10-06 オーナー「5 番は指標、順番計画みたいな欄のタイトルで今後には影響しない。付ける MOD を選ぶ時のプルダウンの順番をこれどおりに」
 * 「ルーンとかも付けていく順番を考えないといけないから順に表示」)。並びのキー: "mod:<modId>" / "rune:<英語名>"
 */
export const simOrder = ref<string[]>([]);
/** 6 パターン (pattern.ts)。回すのはこの手の通り */
export const simPatterns = ref<Pattern[]>([{ name: "パターン 1", steps: [], quiz: { v: 3, rules: {} } }]);
/** パターンの名前 → ハズレルート設定で決めていない形の数 (開いたパターンだけ。残っていれば回さない。2026-10-10 オーナー「ハズレ設定しないと回せない」) */
export const simPlayLeft = ref<Record<string, number>>({});
/** シミュレーターで開いているパターンの名前 (エミュレーターの「レシピで 1 手」が使うクイズのレシピ) */
export const simQuizActive = ref<string | null>(null);
export type SimTargets = typeof simTargets.value;
