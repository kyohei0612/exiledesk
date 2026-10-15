/**
 * Web の広告の並びと入れ替えの決まり (2026-10-16、ブランチ ad-preview の形を今の main の上に作り直した)。
 * 本物の広告タグは AdSlot.vue と web/ads-config.ts の 2 か所だけ (審査中は仮の枠)。アプリ (Tauri) には出さない (AdSense は WebView 不可):
 * 広告を出すのは Web の入口 (web/main.ts) が enableAds() を呼んだ時だけ。
 *
 * AdSense で認められる出し方だけ (メモ web-ads-domain-plan、2026-10-12 オーナー):
 *   - 時間では入れ替えない。別の画面 (ベースを選ぶ・要望) へ移った時と、そこからクラフトへ戻った時だけ
 *   - ベース・モードの切り替えは上の帯も右の列も同じ画面のままなので、きっかけにしない (オーナー「固定バーは変化してないからアウト」)
 *   - 同じ枠は前に出してから 60 秒以内なら出し直さない (行き来を連打して回数が増えないように)
 *   - MOD 一覧は重ねる窓のまま・広告なし・開け閉めで出し直さない (オーナー「MOD 一覧は今のままで」、Tab で何度も行き来するので軽さ優先)
 *   - 右の列は 2 つまで (300×250 × 2)、全体で最大 3 つ。ベースを選ぶ画面は右の列を外して両脇に縦長、要望は左に縦長 1 つ (右は右の列)
 *   - スマホは上の帯の下に 1 つ (開いてすぐ見える所、棚から指 1 本分離れた所)
 */
import { reactive } from "vue";
import { track } from "./track";

/** 同じ枠を出し直すまでの最短 (ミリ秒) */
export const AD_MIN_GAP_MS = 60_000;
/** 1 つの画面に出す広告の上限 (2026-10-12 オーナー「全体で最大 3 つ」) */
export const AD_MAX_PER_PAGE = 3;
/** 縦長を 300 幅にする画面の幅 (それ未満は 160×600。真ん中をできるだけ広く、オーナー「横幅めっちゃ大事」) */
export const AD_WIDE_PX = 1800;

/** 広告にとっての「画面」。MOD 一覧の窓・ベースやモードの切り替えは画面ではない (adPageOf) */
export type AdPage = "craft" | "base" | "feedback";
export type AdPlace = "right" | "left" | "top";
export interface AdSlotDef { id: string; w: number; h: number; place: AdPlace }

/**
 * 今の画面 (広告の入れ替えのきっかけになる物だけを見る)。
 * modOverlay (MOD 一覧の窓)・base / mode の切り替えは引数にあっても見ない = 入れ替えない
 */
export function adPageOf(v: { basePage: boolean; feedbackPage: boolean; modOverlay?: boolean; base?: string; mode?: string }): AdPage {
  if (v.basePage) return "base";
  if (v.feedbackPage) return "feedback";
  return "craft";
}

/** 画面ごとの枠 (PC / スマホ、画面の幅)。上限 AD_MAX_PER_PAGE を超えない */
export function adLayout(page: AdPage, o: { phone: boolean; width: number }): AdSlotDef[] {
  if (o.phone) return page === "craft" ? [{ id: "phone-top", w: 320, h: 100, place: "top" }] : [];
  const tall = o.width >= AD_WIDE_PX ? 300 : 160;
  const side: AdSlotDef[] = [{ id: "side-1", w: 300, h: 250, place: "right" }, { id: "side-2", w: 300, h: 250, place: "right" }];
  if (page === "base") return [{ id: "base-left", w: tall, h: 600, place: "left" }, { id: "base-right", w: tall, h: 600, place: "right" }];
  if (page === "feedback") return [{ id: "fb-left", w: tall, h: 600, place: "left" }, ...side];
  return side;
}

/**
 * 出し直しの帳簿 (枠ごとの回数と最後に出した時刻)。now を渡せるのはテストのため。
 * show(id) は出す (出し直す) なら true、60 秒以内なら見送って false
 */
export function createAdRotation(now: () => number = Date.now) {
  const slots = reactive(new Map<string, { n: number; at: number; skipped: number }>());
  let page: AdPage | null = null;
  return {
    slots,
    show(id: string): boolean {
      const t = now();
      const cur = slots.get(id);
      if (cur && t - cur.at < AD_MIN_GAP_MS) { cur.skipped++; return false; }
      slots.set(id, { n: (cur?.n ?? 0) + 1, at: t, skipped: cur?.skipped ?? 0 });
      return true;
    },
    /** 画面が変わったら true (枠を出し直すきっかけ)。同じ画面のままなら false */
    navigate(to: AdPage): boolean {
      const changed = page !== null && page !== to;
      page = to;
      return changed;
    },
  };
}

/**
 * 広告の状態 (Web の殻と CraftStage で共有)。on は Web の入口だけが立てる。
 * basePage / feedbackPage = 別の画面を開いている (CraftStage / WebApp が立てる)、phone / width は WebApp の fitZoom が入れる
 */
export const ads = reactive({ on: false, page: "craft" as AdPage, tick: 0, basePage: false, feedbackPage: false, phone: false, width: 1660 });
export const adRotation = createAdRotation();
/** その画面の枠のうち、置き場が place の物 (広告を出さない時は空)。別の画面の枠は隠して残すので、page を決めて引く */
export const adSlotsAt = (place: AdPlace, page: AdPage = ads.page): AdSlotDef[] => (ads.on ? adLayout(page, { phone: ads.phone, width: ads.width }) : []).filter((x) => x.place === place);

/** Web の入口で 1 回。アプリでは呼ばない (広告を出さない) */
export function enableAds(on = true): void { ads.on = on; }

/** 画面を移った (別の画面へ / 戻った)。変わった時だけ枠を出し直すきっかけを進める */
export function adNavigate(to: AdPage): void {
  if (adRotation.navigate(to)) ads.tick++;
  ads.page = to;
}

/** 枠を出す。出した時は表示の回数として数える (web/track.ts が端末で数えて、送る時に枠ごと 1 つの印 "ad" にまとめる) */
export function adShow(id: string): boolean {
  if (!adRotation.show(id)) return false;
  track("ad", id);
  return true;
}
