<!--
  StageBasePicker.vue — クラフトステージのベース選び (2026-09-29 作り直し)

  オーナー:「ベースのプルダウンの UI があまりにも悪い。全部一緒になってるからシンプルに使いやすく再設計」。
  今のベースを 1 行で出し、押すと下に開く。中身の一覧は共通の部品 [[BaseCatalog.vue]] (クラフト計算機と同じ)。
  種類は poe2db どおり STR / DEX / INT ごと、素の数値つき、ルーンフォージ等は出さない。フラスコ・スキルジェムは 2026-10-09 から出さない。選ぶと閉じる。
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import BaseCatalog from "../../components/items/BaseCatalog.vue";
import { baseCatalog, classLabel } from "../../services/items/base-catalog";
import { baseArt } from "../../services/craft-stage/base-art";
import Icon from "../../components/ui/Icon.vue";
import { tr } from "../../i18n/lang";
import { glideBy, scrollBoxOf } from "../../utils/keep-place";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

const props = defineProps<{ base: string; data: PatchData | null; /** まだ選んでいない (開いた状態で始まり、今のベースは出さない) */ unpicked?: boolean }>();
const emit = defineEmits<{ pick: [en: string] }>();

const current = computed(() => (props.data ? (baseCatalog(props.data, true).find((b) => b.en === props.base) ?? null) : null));
const open = ref(!!props.unpicked);
// ベースが決まったら閉じる (レシピを呼んだ時も。2026-10-09 レビュー: 一覧が開いたままで打ち方の段が画面の下に隠れた)
watch(() => props.unpicked, (v) => { open.value = !!v; });
const head = ref<HTMLElement | null>(null);
/**
 * 選んだら閉じる。閉じて一覧の分だけ縮んでも、今のベースの行は画面の同じ所に残す (2026-10-09 オーナー「選んだ瞬間予想より下にばっと移動する、
 * 固定でおｋ」: 一覧の下の方で選ぶと、縮んだ分だけ画面が下の段へ飛んでいた)。行が画面の上に隠れていた時は、行を画面の上に出す
 */
function choose(en: string): void {
  const el = head.value;
  const before = el?.getBoundingClientRect().top ?? null;
  open.value = false;
  if (en !== props.base || props.unpicked) emit("pick", en);
  if (!el || before == null) return;
  void nextTick(() => {
    if (!el.isConnected) return;
    const box = scrollBoxOf(el);
    // 縮んだ分の戻しは一気に (見た目は動かない)。行が画面の上に隠れていた時の送りだけ滑らせる (2026-10-10 オーナー「強制的に飛ぶ、スクロールが必要な時だけ高速でスライド」)
    const keep = el.getBoundingClientRect().top - before;
    if (Math.abs(keep) > 1) (box ?? window).scrollBy({ top: keep, behavior: "instant" as ScrollBehavior });
    const want = box ? box.getBoundingClientRect().top + 8 : 8;
    if (before < want) glideBy(box, before - want);
  });
}
</script>

<template>
  <div class="w-full">
    <!-- 今のベース (押すと開く) -->
    <button ref="head" type="button" class="group flex h-10 items-center gap-3 rounded-md px-2 text-left transition hover:bg-white/5" :class="open ? 'bg-white/[0.04]' : ''" :aria-expanded="open" @click="open = !open">
      <template v-if="unpicked"><b class="text-[15px] text-[var(--exile-color-accent-focus)]">{{ tr("ベースを選ぶ", "Choose a base") }}</b></template>
      <template v-else>
        <img v-if="baseArt(base)" :src="baseArt(base)!" alt="" class="size-8 object-contain" draggable="false" />
        <b class="font-display text-[15px] tracking-wide text-[var(--color-rarity-rare)]">{{ tr(current?.ja ?? base, base) }}</b>
        <span v-if="current" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ classLabel(current.cls) }}</span>
      </template>
      <span class="ml-1 inline-flex items-center gap-0.5 text-[12px] text-[var(--exile-color-text-tertiary)] group-hover:text-[var(--exile-color-text-secondary)]">{{ open ? tr("閉じる", "Close") : tr("変える", "Change") }}<Icon :name="open ? 'chevron-up' : 'chevron-down'" class="size-3.5" /></span>
    </button>
    <div v-if="open" class="mt-2 rounded-lg bg-black/30 p-4">
      <!-- 未選択の時は前のベース・種類を選んだ状態にしない (2026-10-05 オーナー「リセットの時ベース未選択から始めんかい」) -->
      <!-- フラスコ・スキルジェムは出さない (2026-10-09 オーナー「フラスコとスキルジェムはいらんね」) -->
      <BaseCatalog :data="data" :selected="unpicked ? '' : base" @pick="choose" />
    </div>
  </div>
</template>
