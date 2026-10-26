/**
 * map-fold.ts — スマホ版の「完成形と全体図」の重ね窓 (PhoneOverview) を閉じているか (PhoneMap・PhoneOverview・下の帯の 1 行で共有)。
 * 既定は閉じる (10-26 夜オーナー「まず情報過多」「全体図は基本閉じる、必要な時に人が開く」)。
 * 重ね窓になったので開け閉めは覚えない (読み直すたびに勝手に窓が開かないように。前は下の帯の中の図で、このブラウザに覚えていた)
 */
import { ref } from "vue";

export const mapFolded = ref(true);
export function setMapFold(v: boolean): void { mapFolded.value = v; }
