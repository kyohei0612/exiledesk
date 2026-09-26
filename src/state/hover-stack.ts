/**
 * hover-stack.ts — ゲーム内のような「ホバー → ホバー → ホバー」の重なり (2026-09-26)
 *
 * オーナー:「ホバーに実態もたせて、ホバー中にその詳細のとこにマウスもってったらそのまま消えないで見えるように。
 *   ゲーム内みたいに、詳細にさらに下線の所の詳細みれるじゃん？ ホバー → ホバー → ホバーみたいな感じでどんどん奥まで
 *   行けるようにして。ホバーの画像外にマウスでたらそのまま消えておk。ただ固定ピンあれば、そのホバーはマウスが
 *   外に行っても消えないようにしてあげると親切」。
 *
 * 段 (layer) の決まり:
 *   - 表の名前にカーソル → 段 0 を開く (ピン留めしていない段は全部入れ替え)
 *   - カードの中の下線 (キーワード) にカーソル → そのカードの 1 つ上の段を開く (それより上は閉じる)
 *   - カードにカーソルが入る → 閉じる予定を取り消し、そのカードより上の段 (ピン留め以外) を閉じる
 *   - 名前 / 下線から出る → 少し待って、ピン留めしていない段を全部閉じる (待つのはカードへ移る間のため)
 *   - カードから出る → すぐ閉じる (オーナー 2026-09-26「説明外に入った瞬間即閉じて欲しい」)。
 *     子のカードから親のカードへ戻る時は、出た直後に親に入るので、同じ流れの中で取り消せるよう 0ms だけ待つ
 *   - ピン留めした段は、外へ出ても残る。× で閉じる
 * 画面は [[HoverStack.vue]] (App.vue に 1 つ) が描く。
 */
import { ref } from "vue";
import type { RankedItem } from "../api/poe2scout";
import type { UniqueRow } from "../views/unique-trend/useUniqueTrend";

export type HoverPayload =
  | { kind: "unique"; row: UniqueRow }
  | { kind: "currency"; item: RankedItem }
  | { kind: "keyword"; id: string; label: string };

export interface HoverLayer {
  key: number;
  payload: HoverPayload;
  /** カーソル (段 0) か下線の右端 (段 1〜) の位置。CSS px */
  x: number;
  y: number;
  pinned: boolean;
}

/** 名前 / 下線からカードへ移る間に消えないための待ち (ms) */
const CLOSE_DELAY = 140;

const layers = ref<HoverLayer[]>([]);
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function cancel(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
function closeUnpinned(): void {
  layers.value = layers.value.filter((l) => l.pinned);
}

export const hoverStack = {
  layers,
  /** 表の名前から開く (段 0) */
  openRoot(payload: HoverPayload, x: number, y: number): void {
    cancel();
    layers.value = [...layers.value.filter((l) => l.pinned), { key: ++seq, payload, x, y, pinned: false }];
  },
  /** カードの中の下線から開く (そのカードの上の段) */
  openChild(parentKey: number, payload: HoverPayload, x: number, y: number): void {
    cancel();
    const i = layers.value.findIndex((l) => l.key === parentKey);
    // 同じ物がすぐ上に開いていれば位置だけ直す (下線の上でカーソルが動いた時)
    const next = layers.value[i + 1];
    if (next && !next.pinned && JSON.stringify(next.payload) === JSON.stringify(payload)) return;
    const keep = layers.value.filter((l, j) => j <= i || l.pinned);
    layers.value = [...keep, { key: ++seq, payload, x, y, pinned: false }];
  },
  /** 名前 / 下線から出た (カードへ移る間だけ待つ) */
  leave(): void {
    cancel();
    timer = setTimeout(closeUnpinned, CLOSE_DELAY);
  },
  /** カードから出た (すぐ閉じる。親のカードへ戻った時は enterLayer が取り消す) */
  leaveCard(): void {
    cancel();
    timer = setTimeout(closeUnpinned, 0);
  },
  /** カードに入った: 閉じる予定を取り消し、それより上の段 (ピン留め以外) を閉じる */
  enterLayer(key: number): void {
    cancel();
    const i = layers.value.findIndex((l) => l.key === key);
    if (i < 0) return;
    if (layers.value.some((l, j) => j > i && !l.pinned)) layers.value = layers.value.filter((l, j) => j <= i || l.pinned);
  },
  togglePin(key: number): void {
    layers.value = layers.value.map((l) => (l.key === key ? { ...l, pinned: !l.pinned } : l));
  },
  close(key: number): void {
    layers.value = layers.value.filter((l) => l.key !== key);
  },
  /** 画面を切り替えた時など (ピン留めも含めて全部) */
  clear(): void {
    cancel();
    layers.value = [];
  },
};
