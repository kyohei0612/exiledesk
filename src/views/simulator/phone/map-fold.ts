/**
 * map-fold.ts — スマホ版の下の全体図を畳んでいるか (PhoneMap と、畳んだ時に下の帯のボタンを出す PhoneTreePage で共有)。
 * 既定は画面の高さ 700px 未満で畳む (320×640 で上下の帯が 225px を取り、質問が最初の画面に入らなかった。10-26 夜オーナー OK)。
 * 開いた / 畳んだはこのブラウザに覚える (読めなければ既定)
 */
import { ref } from "vue";

const KEY = "exiledesk.simPhoneMapFold";
export const mapFolded = ref(((): boolean => {
  try { const v = localStorage.getItem(KEY); if (v === "1" || v === "0") return v === "1"; } catch { /* 読めない */ }
  return typeof window !== "undefined" && window.innerHeight < 700;
})());
export function setMapFold(v: boolean): void {
  mapFolded.value = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 書けない */ }
}
