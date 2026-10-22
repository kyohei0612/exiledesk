/**
 * シミュレーターの入口 (2026-10-22 オーナー、設計 docs/org/simulator/notes/2026-10-22-entry-design.md)。
 * ① MOD 決め (build): クラフト台の MOD 一覧の「付ける」で完成品を組む。6 MOD で自動で次へ。
 * ②③ 打つ (play): 同じクラフト台・同じ棚で、カレンシーを打つと乱数の代わりにお告げの欄の所で付く MOD を選ぶ。フラクチャーまでが ②、その後が ③。
 * アイテム・エンジン・工程はクラフト台のまま。ここは入口の段と狙い (① の完成品) だけ
 */
import { ref } from "vue";

export const simBuild = ref(false);
/** 今の段 (① MOD 決め / ②③ カレンシーを打つ) */
export const buildStage = ref<"build" | "play">("build");

/** 狙い 1 つ (① の完成品の MOD。tierIndex は大きいほど良い段、tier = T の数で 1 が一番良い) */
export interface BuildMod { modId: string; tierName: string; tierIndex: number; tier: number; side: "prefix" | "suffix"; textJa: string; textEn: string; fractured?: true; desecrated?: true }
export const finished = ref<BuildMod[]>([]);
/** アイテムレベルの「適正」(選んだ段が全部付く一番低いレベル) を使うか。手で変えたら外れる (オーナー 10-22) */
export const ilvlFit = ref(true);
/** ②③ の候補の欄に出している手 (打つ前の手の番号で、打った・戻した時に消す) */
export const pathAsk = ref<{ key: string; omens: string[]; at: number; auto?: true } | null>(null);
/** 空打ちのスイッチ (お告げと並ぶ。入っている間は打つと外れの 1 手、候補は出さない。お告げと同じく打っても切れない、オーナー 10-22) */
export const missOn = ref(false);
