/**
 * phone-pc-view.ts — スマホの端末で木を組む画面 (シミュの木・デイリーの挑戦) は、横持ちの時だけ PC と同じ画面を全体表示で縮めて出す (U-53d・S-94l・D-70c、スイッチ phonePcView、2026-11-17)
 * 横持ち (か「横向きで表示」で回している間) は頁の viewport を width=1280 (U-53 の境) にして PC と同じ画面を出す。指の拡大縮小は止めない (maximum-scale・user-scalable を付けない)。
 * 幅の判定 (usePhone・useViewOnlyWidth・CSS の境) は頁の幅を見るので、この間は全部 PC 扱いになる。PC のブラウザは viewport を見ないので変わらない。
 * 縦持ちの間は元のスマホの画面のまま、ヘッダーの下を for-share/TurnSideways.vue の案内 (横にしてください・横向きで表示) にする。
 * WebApp が木を組む画面かどうか (treeShown) と回しているか (turned) を見て setPcView を呼ぶ。
 */
import { ref } from "vue";
import { isTouchOnly, PHONE_MAX } from "./use-phone";

/** 木を組む画面の頁の幅 (U-53 の境と同じ) */
export const PC_VIEW_WIDTH = 1280;
const PC_VIEW = `width=${PC_VIEW_WIDTH}`;
/** 元の viewport (web.html の物。最初に替える時に覚える) */
let base: string | null = null;

/** 指の端末で、画面の幅 (screen.width = viewport に左右されない) が U-53 の境より狭い = スマホ・小さいタブレット */
export const phoneDevice = (): boolean => typeof screen !== "undefined" && isTouchOnly() && screen.width < PHONE_MAX;

/** 木を組む画面を出している (WebApp が書く) */
export const treeShown = ref(false);
/** 縦持ち (頁の形で見る。viewport を 1280 にしても縦持ちは縦長のまま、横持ちは横長) */
export const portrait = ref(false);
if (typeof matchMedia === "function") {
  const mq = matchMedia("(orientation: portrait)");
  portrait.value = mq.matches;
  mq.addEventListener("change", () => { portrait.value = mq.matches; });
}
/** 縦持ちの案内を出す時 (スマホの端末で木を組む画面、縦持ち、回していない)。turned は turn-page.ts から渡す */
// 反応する値 (treeShown・portrait) を先に読む。phoneDevice() は反応しないので、先に偽で切れると向きの変わりを見張らなくなる (向きで screen.width が 1280 をまたぐ端末で縦に戻しても案内が出ない、d13 11-17)
export const guideOn = (turned: boolean): boolean => {
  const shown = treeShown.value, tall = portrait.value;
  return shown && tall && !turned && phoneDevice();
};

/** 今 PC の画面にしている */
export const pcViewOn = ref(false);

/** on = PC の画面にする。スマホの端末だけ viewport を替え、外したら元へ戻す */
export function setPcView(on: boolean): void {
  const meta = typeof document !== "undefined" ? document.querySelector<HTMLMetaElement>('meta[name="viewport"]') : null;
  if (!meta) return;
  if (on && phoneDevice()) {
    if (base === null) base = meta.content;
    if (meta.content !== PC_VIEW) meta.content = PC_VIEW;
    pcViewOn.value = true;
  } else {
    if (base !== null && meta.content !== base) meta.content = base;
    pcViewOn.value = false;
  }
}

/** 今 PC の画面にすべきか (木を組む画面で、横持ちか回している) */
export const wantPc = (turned: boolean): boolean => treeShown.value && (!portrait.value || turned);
