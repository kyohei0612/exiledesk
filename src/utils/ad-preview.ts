/**
 * 広告の置き場のお試し (2026-10-12 オーナー「挙動再現してみてくれ、開発版ですぐ戻せるように、白い広告の出し方で」)。
 * `?adpreview=1` を付けた時だけ (このタブの間は覚える、`?adpreview=0` で外す)。中身は枠だけで、本物の広告は読まない。
 *
 * AdSense で認められる出し方だけを真似る:
 *   - 時間では入れ替えない。別の画面 (ベースを選ぶ・MOD 一覧) へ移った時と、そこからクラフトへ戻った時だけ。
 *     ベースやモードの切り替えは上の帯も右の列も同じ画面のままなので、きっかけにしない (2026-10-12 オーナー「固定バーは変化してないからアウト」)
 *   - 同じ枠は前に出してから 60 秒以内なら出し直さない (行き来を連打して回数が増えないように)
 *   - ベースを選ぶ・MOD 一覧は重ねる窓 / 下に開く一覧ではなく別の画面にして、その両脇に 2 つ (窓に付いた広告にしない)
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

/** 右の列の枠を出し直すきっかけ (中身が大きく変わった時に増やす) */
export const adTicks = reactive({ side: 0 });
