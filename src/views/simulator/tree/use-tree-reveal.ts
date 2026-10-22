/**
 * use-tree-reveal.ts — 木を開いた時に箱を上の段から順に出す (2026-10-22 オーナー「読み込みながら徐々に出す」。真ん中を覆う表示はやめた)。
 * データが来るまでは箱を出さず、来たら少しずつ足す。組んで足した数個の箱はすぐ出す
 */
import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import type { TreeBox } from "../../../services/simulator/tree/tree-model";

/** これより多く一度に増えた時だけ順に出す (見本・レシピを開いた時。手で足した箱は待たせない) */
const AT_ONCE = 3;
/** 1 回に足すまでの間 (ms) と、全部出すまでのおおよその回数 */
const TICK = 30;
const STEPS = 20;

export function useTreeReveal(list: ComputedRef<TreeBox[]>, ready: () => boolean, opened: Ref<number>) {
  const seen = ref(new Set<string>());
  /** 順に出している途中の数 (n/of)。無ければ出し終わり */
  const run = ref<{ n: number; of: number } | null>(null);
  let timer = 0;
  function sync(): void {
    if (!ready() || timer) return;
    // 上の段から、同じ段は左から (組んだ順に見える)
    const fresh = list.value.filter((b) => !seen.value.has(b.id)).sort((a, z) => a.y - z.y || a.x - z.x).map((b) => b.id);
    if (!fresh.length) return;
    if (fresh.length <= AT_ONCE) { seen.value = new Set([...seen.value, ...fresh]); return; }
    const per = Math.max(1, Math.ceil(fresh.length / STEPS));
    let i = 0;
    const step = (): void => {
      const from = i;
      i = Math.min(fresh.length, i + per);
      seen.value = new Set([...seen.value, ...fresh.slice(from, i)]);
      run.value = i < fresh.length ? { n: i, of: fresh.length } : null;
      timer = i < fresh.length ? window.setTimeout(step, TICK) : 0;
      if (!timer) sync(); // 出している間に増えた箱
    };
    step();
  }
  watch([() => list.value.map((b) => b.id).join(","), ready], sync, { immediate: true });
  // 別の木を開いたら上から出し直す (箱の id は木ごとに b1・b2… と同じなので数えた物を捨てる)
  watch(opened, () => { clearTimeout(timer); timer = 0; seen.value = new Set(); run.value = null; sync(); });
  onBeforeUnmount(() => clearTimeout(timer));
  const isShown = (id: string): boolean => seen.value.has(id);
  const visible = computed(() => list.value.filter((b) => seen.value.has(b.id)));
  /** 全部出し終わったか (合流の線など、全部の箱の位置が要る物はそれから) */
  const done = computed(() => !run.value && visible.value.length === list.value.length);
  return { isShown, visible, done, run };
}
