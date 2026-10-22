/**
 * stage-tuning.ts (画面の状態) — お告げの下で使う人が決める設定 (2026-10-21 オーナー、開発版だけ)。
 * 値はエンジンの入口の setStageTuning に渡すだけ (倍率の計算はエンジン)。変えたらお告げの一覧を入れ直して、確率の表・打てるかの判定を出し直させる。
 * ブラウザに覚える (読めない時は既定のまま)。
 * MOD の重み (2026-10-22 オーナー「1000 で置いて、修正できるように」) は開発版だけ (WEIGHTS_ON)。変えたら一覧・確率の表も出し直す。
 */
import { ref } from "vue";
import { setStageTuning } from "../../services/craft-stage/engine";
import { craftStage } from "../craft-stage";

/** 本番も出す (2026-10-21 オーナー OK「触媒はそのまま本番出して」) */
export const TUNING_ON = true;
/** MOD の重みを直す欄は開発版と手元の dev だけ (本番はオーナーの OK の後) */
export const WEIGHTS_ON = import.meta.env.DEV || import.meta.env.VITE_DEV_PREVIEW === "1";

const KEY = "stage-tuning";
const WKEY = "stage-mod-weights";
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
/** MOD の id → 直した重み (一番重い段の重み) */
export const modWeights = ref<Record<string, number>>(WEIGHTS_ON ? loadWeights() : {});
setStageTuning({ ...first, modWeights: modWeights.value });

function loadWeights(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(WKEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]) && e[1] >= 0));
  } catch {
    return {};
  }
}

function apply(): void {
  setStageTuning({ catalysingPerPct: catalysingPerPct.value, sanctifyK: sanctifyK.value, modWeights: modWeights.value });
  try { localStorage.setItem(KEY, JSON.stringify({ catalysingPerPct: catalysingPerPct.value, sanctifyK: sanctifyK.value })); } catch { /* 覚えられなくても動く */ }
  craftStage.omens.value = [...craftStage.omens.value];
}
export function setCatalysingPerPct(v: number | null): void { catalysingPerPct.value = v; apply(); }
export function setSanctifyK(v: number | null): void { sanctifyK.value = v; apply(); }

/** MOD の重みを直す (null = 既定に戻す)。一覧と確率の表はアイテムを入れ直して出し直す */
export function setModWeight(id: string, w: number | null): void {
  const next = { ...modWeights.value };
  if (w == null || !(w >= 0)) delete next[id]; else next[id] = w;
  modWeights.value = next;
  try { localStorage.setItem(WKEY, JSON.stringify(next)); } catch { /* 覚えられなくても動く */ }
  apply();
  if (craftStage.item.value) craftStage.item.value = { ...craftStage.item.value };
}
export function resetModWeights(): void {
  modWeights.value = {};
  try { localStorage.removeItem(WKEY); } catch { /* 覚えられなくても動く */ }
  apply();
  if (craftStage.item.value) craftStage.item.value = { ...craftStage.item.value };
}
