/**
 * tree-picked.ts — 「今押している箱」を木のページの外 (帯の TreeTabs など) から読む置き場 (S-145g)。
 * 押している箱 = 最後に手の窓か ＋ を開いた箱 (窓を閉じた後も覚えておく)。箱が木から消えたら・タブを替えたら・別の木を開いたら無し。
 * 書くのは選んでいる箱を受け取っている所 (use-tree-bands) だけ。読むだけの口で、木には何もしない
 * (11-12 オーナー「要望あれば今のアイテムカードの状態に合わせて表示させようかなと思うけど。どっちのがいいかな。まぁ欲を言えばどっちもだけどね」= 帯の「MOD 一覧」の窓で箱の品も見る)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import type { StageItem } from "../../../services/craft-stage/engine";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { useTree } from "./use-tree";

const t = useTree();
const last = ref<string | null>(null);
watch([t.active, t.opened], () => { last.value = null; });
/** 選んでいる箱が変わるたびに呼ぶ (null = 窓を閉じた、は覚えたまま) */
export function pickBox(id: string | null): void { if (id) last.value = id; }
/** 今押している箱の id (無ければ null) */
export const pickedBoxId = computed((): string | null => (last.value && t.doc.value.boxes[last.value] ? last.value : null));
/** 今押している箱の品 = その箱の見本 (ツリーがエンジンに渡す品と同じ sampleOf。無ければ null) */
export const pickedBoxItem = computed((): StageItem | null => {
  const d = s.data.value, id = pickedBoxId.value;
  if (!d || !id) return null;
  try { return sampleOf(d, t.doc.value, id, 1)?.item ?? null; } catch { return null; }
});
