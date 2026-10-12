/**
 * 広告の置き場のお試し (2026-10-12 オーナー「挙動再現してみてくれ、開発版ですぐ戻せるように、白い広告の出し方で」)。
 * `?adpreview=1` を付けた時だけ (このタブの間は覚える、`?adpreview=0` で外す)。中身は枠だけで、本物の広告は読まない。
 *
 * AdSense で認められる出し方だけを真似る:
 *   - 時間では入れ替えない。別の画面 (ベースを選ぶ・要望) へ移った時と、そこからクラフトへ戻った時だけ。
 *     ベースやモードの切り替えは上の帯も右の列も同じ画面のままなので、きっかけにしない (2026-10-12 オーナー「固定バーは変化してないからアウト」)
 *   - 同じ枠は前に出してから 60 秒以内なら出し直さない (行き来を連打して回数が増えないように)
 *   - ベースを選ぶ・要望は下に開く一覧 / 重ねる窓ではなく別の画面にして、その横に (窓に付いた広告にしない)。
 *     MOD 一覧は重ねる窓のまま・広告なし・開け閉めで出し直さない (2026-10-12 オーナー「MOD 一覧は今のままで」)
 */
import { reactive } from "vue";

const KEY = "exiledesk.adpreview";
export const AD_PREVIEW: boolean = (() => {
  // 開発版だけ (本番に出しても ?adpreview=1 は効かない)
  if (!import.meta.env.DEV) return false;
  try {
    const q = new URLSearchParams(location.search).get("adpreview");
    if (q === "1") sessionStorage.setItem(KEY, "1");
    if (q === "0") sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

/** 同じ枠を出し直すまでの最短 (秒) */
export const AD_MIN_GAP_S = 60;

/** 枠ごとの表示の回数と最後に出した時刻 (お試しの画面に出す) */
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

/** 右の列の枠を出し直すきっかけ (別の画面へ移った時・戻った時に増やす) */
export const adTicks = reactive({ side: 0 });
/** 今出している別の画面 (ベースを選ぶ画面は右の列も使って画面いっぱい。2026-10-12 オーナー「ベース選択の時は右側の固定バーも突っ切っていい」) */
export const adPages = reactive({ base: false });
/**
 * 両脇の縦長の枠の幅。真ん中をできるだけ広く (オーナー「横幅めっちゃ大事、限界まで真ん中広く」) するので、ふだんは 160×600、
 * 画面がとても広い時 (1800 px 以上) だけ 300×600 (単価の高い大きさ)
 */
export const sideAdW = (): number => (typeof window !== "undefined" && window.innerWidth >= 1800 ? 300 : 160);
