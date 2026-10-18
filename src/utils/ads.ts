/**
 * 広告の枠 (2026-10-18 オーナー「広告入れる前に広告入れてる前提のページ作りにしよう」)。
 * 並びは枠がある前提で組むが、AdSense の審査が通るまで本番には何も出さない。開発版 (手元の dev・deploy:web-dev) だけ枠の場所を見せる。
 * 通ったら ADS_LIVE を true にして、AdSlot.vue の中身を AdSense のタグにする ([[web-ads-domain-plan]])。
 *
 * 出し直しの決まり (AdSense で認められる出し方だけ。2026-10-12 オーナーと決めた):
 *   - 時間では入れ替えない。ページを移った時 (web/page.ts の URL が変わった時) だけ
 *   - 同じ枠は前に出してから 60 秒以内なら出し直さない (行き来の連打で回数が増えないように)
 *   - MOD 一覧は重ねる窓のまま・広告なし・開け閉めで出し直さない
 */
import { reactive, ref } from "vue";

/** 本物の広告を出す (AdSense の審査が通ったら true) */
export const ADS_LIVE = false;
/** 枠を見せる (本物か、開発版の場所だけの枠) */
export const AD_FRAMES: boolean = ADS_LIVE || import.meta.env.DEV || import.meta.env.VITE_DEV_PREVIEW === "1";

/** 同じ枠を出し直すまでの最短 (秒) */
export const AD_MIN_GAP_S = 60;

/** 枠ごとの表示の回数と最後に出した時刻 (開発版の枠に出す) */
export const adSlots = reactive(new Map<string, { n: number; at: number; skipped: number }>());

/** 枠を出す (出し直す)。60 秒以内なら見送って false */
export function adShow(id: string): boolean {
  const now = Date.now();
  const cur = adSlots.get(id);
  if (cur && now - cur.at < AD_MIN_GAP_S * 1000) {
    cur.skipped++;
    return false;
  }
  adSlots.set(id, { n: (cur?.n ?? 0) + 1, at: now, skipped: cur?.skipped ?? 0 });
  return true;
}

/** ページを移った回数 (ページをまたいで残る枠 = 右の列・スマホの上の枠の出し直しのきっかけ。web/page.ts が増やす) */
export const pageTick = ref(0);

/**
 * 両脇の縦長の枠の幅。真ん中をできるだけ広く (2026-10-12 オーナー「横幅めっちゃ大事、限界まで真ん中広く」) するので、ふだんは 160×600、
 * 画面がとても広い時 (1800 px 以上) だけ 300×600
 */
export const sideAdW = (): number => (typeof window !== "undefined" && window.innerWidth >= 1800 ? 300 : 160);
