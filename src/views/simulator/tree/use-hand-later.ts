/**
 * use-hand-later.ts — 手の窓の重い数えを描画の外へ出す (S-71e ①、スイッチ junkTidy)。結果の数え・消える数・手だけ替えるの組み直しは描画の中で打たず、
 * 札を先に動かして絵を出してから 1 つずつ読む。中身は同じ computed なので、決める時は computed を直に読めば待たずに同じ答え
 */
import { computed, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import { flag } from "../../../web/release-flags";

/** 絵が 1 枚出た後 (窓が隠れている間は rAF が止まるので時間でも進める) */
const afterPaint = (): Promise<void> => new Promise((r) => { let was = false; const go = (): void => { if (!was) { was = true; setTimeout(r, 0); } }; requestAnimationFrame(go); setTimeout(go, 100); });

/** key が変わったら読み直す。keep = 読み直す間は前の値を出す (同じ手で要る物だけ増えた時) */
export function useHandLater() {
  const waiting = ref(0);
  function later<T>(key: () => string, read: ComputedRef<T>, keep: () => boolean = () => false): Readonly<Ref<T | undefined>> {
    if (!flag("junkTidy")) return read;
    const v = shallowRef<T>();
    let run = 0, pending = false;
    watch(key, async () => {
      const me = ++run;
      if (!keep()) v.value = undefined;
      if (!pending) { pending = true; waiting.value++; }
      await afterPaint();
      if (me !== run) return;
      v.value = read.value;
      pending = false; waiting.value--;
    }, { immediate: true });
    return v;
  }
  return { later, counting: computed(() => waiting.value > 0) };
}
