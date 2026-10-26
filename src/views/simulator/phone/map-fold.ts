/**
 * map-fold.ts — スマホ版の下の全体図を畳んでいるか (PhoneMap と、畳んだ時に下の帯のボタンを出す PhoneTreePage で共有)。
 * 既定は畳む (高さに関係なく。10-26 夜オーナー「まず情報過多」「全体図は基本閉じる、必要な時に人が開く」。前は高さ 700px 未満だけ)。
 * 開いた / 畳んだはこのブラウザに覚える (読めなければ既定)
 */
import { ref } from "vue";

// 鍵は 10-26 夜に替えた (前の鍵で「開く」を覚えた人も、既定の畳むから始める)
const KEY = "exiledesk.simPhoneMapFold2";
export const mapFolded = ref(((): boolean => {
  try { const v = localStorage.getItem(KEY); if (v === "1" || v === "0") return v === "1"; } catch { /* 読めない */ }
  return true;
})());
export function setMapFold(v: boolean): void {
  mapFolded.value = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 書けない */ }
}
