/**
 * stage-tuning.ts (画面の状態) — お告げの下で使う人が決める設定 (2026-10-21 オーナー、開発版だけ)。
 * 値はエンジンの入口の setStageTuning に渡すだけ (倍率の計算はエンジン)。変えたらお告げの一覧を入れ直して、確率の表・打てるかの判定を出し直させる。
 * ブラウザに覚える (読めない時は既定のまま)。
 */
import { ref } from "vue";
import { setStageTuning } from "../../services/craft-stage/engine";
import { craftStage } from "../craft-stage";

/** 開発版と手元の dev だけ (本番はオーナーの OK の後) */
export const TUNING_ON = import.meta.env.DEV || import.meta.env.VITE_DEV_PREVIEW === "1";

const KEY = "stage-tuning";
function load(): { catalysingPerPct: number | null; sanctifyK: number | null } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
    return { catalysingPerPct: num(v.catalysingPerPct), sanctifyK: num(v.sanctifyK) };
  } catch {
    return { catalysingPerPct: null, sanctifyK: null };
  }
}

const first = TUNING_ON ? load() : { catalysingPerPct: null, sanctifyK: null };
/** 触媒の高貴: 品質 1% ごとの倍率 (null = 既定 0.2) */
export const catalysingPerPct = ref<number | null>(first.catalysingPerPct);
/** 聖別: 決めた倍率 ×100 (null = 範囲の中でランダム) */
export const sanctifyK = ref<number | null>(first.sanctifyK);
setStageTuning(first);

function apply(): void {
  setStageTuning({ catalysingPerPct: catalysingPerPct.value, sanctifyK: sanctifyK.value });
  try { localStorage.setItem(KEY, JSON.stringify({ catalysingPerPct: catalysingPerPct.value, sanctifyK: sanctifyK.value })); } catch { /* 覚えられなくても動く */ }
  craftStage.omens.value = [...craftStage.omens.value];
}
export function setCatalysingPerPct(v: number | null): void { catalysingPerPct.value = v; apply(); }
export function setSanctifyK(v: number | null): void { sanctifyK.value = v; apply(); }
