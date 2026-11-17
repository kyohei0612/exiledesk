/**
 * daily-pc-view.ts — スマホの端末で「PC 版を表示して挑戦」を押した時だけ、デイリーの挑戦の間 PC の画面を縮めて出す (D-70c、スイッチ dailyPcView、2026-11-17)
 * 頁の viewport を width=1280 (D-70 の境) にして、PC と同じ画面を全体表示で出す。指の拡大縮小は止めない (maximum-scale・user-scalable を付けない)。
 * 幅の判定 (usePhone・useViewOnlyWidth・CSS の境) は頁の幅を見るので、この間は全部 PC 扱いになる。PC のブラウザは viewport を見ないので変わらない。
 * 入る = ボタン (for-share/PcPlayButton.vue) が pcWanted を立てる。出る = 挑戦のページ (daily-start) を離れた時 (WebApp が見る)。
 */
import { ref } from "vue";
import { isTouchOnly, PHONE_MAX } from "./use-phone";

/** デイリーの挑戦の間の頁の幅 (D-70 の境と同じ) */
export const DAILY_PC_WIDTH = 1280;
const PC_VIEW = `width=${DAILY_PC_WIDTH}`;
/** 元の viewport (web.html の物。最初に替える時に覚える) */
let base: string | null = null;

/** 指の端末で、画面の幅 (screen.width = viewport に左右されない) が U-53 の境より狭い = スマホ・小さいタブレット。ボタンを出すのはこの時だけ */
export const phoneDevice = (): boolean => typeof screen !== "undefined" && isTouchOnly() && screen.width < PHONE_MAX;

/** 「PC 版を表示して挑戦」を押した (挑戦のページを離れたら WebApp が下ろす) */
export const pcWanted = ref(false);

/** on = PC の画面にする。スマホの端末だけ viewport を替え、外したら元へ戻す */
export function setDailyPcView(on: boolean): void {
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

/** 今 PC の画面にしている (縦持ちの時の「横にしてください」の被せ = for-share/TurnSideways.vue が見る) */
export const pcViewOn = ref(false);
