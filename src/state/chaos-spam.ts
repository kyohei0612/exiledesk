/**
 * chaos-spam.ts (state) — カオススパムの「回している最中」の印 (2026-10-16)。
 * 回している間は「次の手で狙う」の計算 (打つたびに数千回試す) を止める。止めないと 1 手ごとに出し直して重くなる
 */
import { ref } from "vue";

export const spamming = ref(false);
