/**
 * tut-data.ts — シミュのチュートリアルの手順と文 (src/data/sim-tutorial.json) の読み込みと、手元の dev だけの保存
 * (2026-10-26 夜オーナー「開発版で文字を俺が打つから保存と修正が開発版でできるような構造」)。
 *   steps   = 手順 (tutorial.md T-21 の 14 段。種類 goal / start / hand / done / unset / test / run / note、hand は箱の役・打つ物・お告げ・狙い・残したい MOD。
 *             進む条件は木の中身を見る use-sim-tutorial)。スマホの順は持たず、役ごとの手から画面で求める (T-26、use-sim-tutorial-phone)
 *   texts   = 札の文 { 鍵: { ja, en } }。鍵は「手順の id.場面」(hand は plus / bar / hold / omen-off / omen / aim / aim-off / free / keep / use / wrong / missing、
 *             スマホだけの場面は p- を頭に付ける。ほかは main ほか)。空なら下書き (tut-route の既定の文)
 *   targets = 光らせる所を人が選び直した物 { 鍵: CSS }。無ければ既定の所
 * 本番・開発版のビルドは JSON を読むだけ。手元の dev (vite serve) だけ POST /__sim-tutorial で JSON を書く (scripts/vite-sim-tutorial.ts)。commit はオーナーかブラック
 */
import { ref } from "vue";
import seed from "../../../data/sim-tutorial.json";
import type { Role } from "./tut-route";

export type TutText = { ja: string; en: string };
export type TutStepDef =
  | {
    id: string; kind: "hand"; box: Role; key: string; omens: string[];
    /** 窓の「狙う MOD」でチェックする MOD */ aim?: string;
    /** 狙い無し (☑ 無し、結果は「打った後」1 箱、S-23) */ free?: boolean;
    /** 消去の「残したい MOD」で ☑ する MOD (S-27) */ keep?: string;
  }
  | { id: string; kind: "done"; box: Role }
  /** goal = 完成形の設定 (✦ と品質の決め)、start = 始め方の窓、unset = 帯「! 未設定 ▸ 次へ」、test = 穴チェックの ✓、run = 100 人 → 結果 → 終わる */
  | { id: string; kind: "goal" | "start" | "unset" | "test" | "run" | "end" | "note" };
export type TutData = { v: 1; course: string; steps: TutStepDef[]; texts: Record<string, TutText>; targets: Record<string, string> };

const clone = (d: unknown): TutData => JSON.parse(JSON.stringify(d)) as TutData;
/** 今の手順と文 (dev で書き換えるとそのまま画面に出る。保存するまで JSON は変わらない) */
export const tutData = ref<TutData>(clone(seed));
/** 保存していない書き換えがある */
export const tutDirty = ref(false);
/** 書ける画面か (手元の dev だけ。開発版・本番のビルドでは書く所を出さない) */
export const TUT_EDITABLE = import.meta.env.DEV;

export function setText(key: string, lang: "ja" | "en", v: string): void {
  const t = (tutData.value.texts[key] ??= { ja: "", en: "" });
  t[lang] = v;
  if (!t.ja && !t.en) delete tutData.value.texts[key];
  tutDirty.value = true;
}
export function setTarget(key: string, sel: string | null): void {
  if (sel) tutData.value.targets[key] = sel; else delete tutData.value.targets[key];
  tutDirty.value = true;
}
/** 手順の並びを書き換える (足す・消す・上下)。消した手順の文と光らせる所も消す */
export function editSteps(fn: (s: TutStepDef[]) => void): void {
  const before = new Set(tutData.value.steps.map((s) => s.id));
  fn(tutData.value.steps);
  const after = new Set(tutData.value.steps.map((s) => s.id));
  for (const id of before) {
    if (after.has(id)) continue;
    for (const k of Object.keys(tutData.value.texts)) if (k.startsWith(`${id}.`)) delete tutData.value.texts[k];
    for (const k of Object.keys(tutData.value.targets)) if (k.startsWith(`${id}.`)) delete tutData.value.targets[k];
  }
  tutDirty.value = true;
}
/** 新しい「文だけの手順」の id (note-1, note-2, …) */
export const newNoteId = (): string => { let n = 1; while (tutData.value.steps.some((s) => s.id === `note-${n}`)) n++; return `note-${n}`; };

/** 保存 (手元の dev だけ): JSON をそのまま書く。失敗したら理由を返す */
export async function saveTutData(): Promise<string | null> {
  if (!TUT_EDITABLE) return "dev だけ";
  try {
    const res = await fetch("/__sim-tutorial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tutData.value, null, 2) });
    if (!res.ok) return `${res.status} ${await res.text()}`;
    tutDirty.value = false;
    return null;
  } catch (e) { return String(e); }
}
// JSON を書くと vite が中身を差し替えに来るが、画面の中身はもう同じなのでここで止める (読み込み直すと案内の状態が 2 つに分かれる)
if (import.meta.hot) import.meta.hot.accept(() => {});
