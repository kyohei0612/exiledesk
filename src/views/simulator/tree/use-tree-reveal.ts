/**
 * use-tree-reveal.ts — 木を開いた時に箱を 1 段目 (始まり) から段ごとに順に出す (2026-10-22 オーナー「読み込みながら徐々に出す」
 * 「1 列目から徐々に表示していけばいい」。真ん中を覆う表示はやめた)。データが来るまでは箱を出さない。組んで足した数個の箱はすぐ出す
 */
import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import { BOX_H, type TreeBox } from "../../../services/simulator/tree/tree-model";

/** これより多く一度に増えた時だけ順に出す (見本・レシピを開いた時。手で足した箱は待たせない) */
const AT_ONCE = 3;
/** 1 段足すまでの間 (ms) */
const TICK = 70;

/** 上から段に分ける (整列した木は段ごとに同じ高さ。手で動かした箱は箱の半分の高さまでを同じ段に数える)。同じ段は左から */
function rowsOf(list: readonly TreeBox[]): string[][] {
  const rows: TreeBox[][] = [];
  for (const b of [...list].sort((a, z) => a.y - z.y || a.x - z.x)) {
    const last = rows[rows.length - 1];
    if (last && b.y - last[0]!.y < BOX_H / 2) last.push(b); else rows.push([b]);
  }
  return rows.map((r) => r.sort((a, z) => a.x - z.x).map((b) => b.id));
}

export function useTreeReveal(list: ComputedRef<TreeBox[]>, ready: () => boolean, opened: Ref<number>) {
  const seen = ref(new Set<string>());
  /** 段ごとに出している途中の段の数 (n/of)。無ければ出し終わり */
  const run = ref<{ n: number; of: number } | null>(null);
  let timer = 0;
  function sync(): void {
    if (!ready() || timer) return;
    const fresh = list.value.filter((b) => !seen.value.has(b.id));
    if (!fresh.length) return;
    if (fresh.length <= AT_ONCE) { seen.value = new Set([...seen.value, ...fresh.map((b) => b.id)]); return; }
    const rows = rowsOf(fresh);
    let i = 0;
    const step = (): void => {
      seen.value = new Set([...seen.value, ...rows[i++]!]);
      run.value = i < rows.length ? { n: i, of: rows.length } : null;
      timer = i < rows.length ? window.setTimeout(step, TICK) : 0;
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
