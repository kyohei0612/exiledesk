/**
 * ascendancy-list.ts — アセンダンシー一覧 (使用率つき) を 1 か所で持つ (2026-09-19)
 *
 * 使用率ランキング (GemBreak) と 自動ジェム監視 (GemWatch) が同じ選択肢を出していたが、
 * 片方は poe.ninja から取った使用率つきの一覧、もう片方は直書きの名前だけだった。
 * オーナー指示で「取得先」の選択を監視側に一本化したので、一覧もここに寄せる。
 *
 * poe.ninja を叩くのは 1 回だけ (index-state から取る軽い呼び出し)。
 */
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export interface AscendancyMeta {
  class: string;
  percentage: number;
}

export const ascendancies = ref<AscendancyMeta[]>([]);
export const ascendancyError = ref("");

let inflight: Promise<void> | null = null;

/** 一覧を取る (取得済みなら何もしない)。同時に呼ばれても 1 回にまとめる */
export function loadAscendancies(): Promise<void> {
  if (ascendancies.value.length > 0 || !isTauriRuntime()) return Promise.resolve();
  if (inflight) return inflight;
  inflight = invoke<AscendancyMeta[]>("gem_break_ascendancies")
    .then((list) => {
      ascendancies.value = list;
      ascendancyError.value = "";
    })
    .catch((e: unknown) => {
      ascendancyError.value = e instanceof Error ? e.message : String(e);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
