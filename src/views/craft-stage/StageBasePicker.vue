<!--
  StageBasePicker.vue — クラフトステージのベース選び (2026-09-29 作り直し)

  オーナー:「ベースのプルダウンの UI があまりにも悪い。全部一緒になってるからシンプルに使いやすく再設計」。
  今のベースを 1 行で出し、押すと下に開く。中身の一覧は共通の部品 [[BaseCatalog.vue]] (クラフト計算機と同じ)。
  種類は poe2db どおり STR / DEX / INT ごと、素の数値つき、ルーンフォージ等は出さない。フラスコ・スキルジェムは 2026-10-09 から出さない。選ぶと閉じる。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
const everOpen = ref(open.value);
watch(open, (v) => { if (v) everOpen.value = true; });
const head = ref<HTMLElement | null>(null);
/**
 * 選んだら閉じる。ベースの行が画面の上に隠れていたら、先にそこまでぬるっと送ってから一覧を縮める
 * (2026-10-10 オーナー「ベース選んでから移る時がワープしてるように見える」: 縮むのと同時にページの高さが減り、スクロールの位置が切り詰められて一気に飛んでいた)。
 * 行が見えていれば送らずに縮める (行は一覧の上にあるので動かない)
 */
async function choose(en: string): Promise<void> {
  // 先にクラフトの位置 (ベースの枠の外枠の少し上、data-craft-top の scroll-mt) までぬるっと送ってから縮める (2026-10-10 オーナー「ベース選択後もここでおｋ」)
  const el = head.value?.closest<HTMLElement>("[data-craft-top]") ?? head.value;
  const box = el ? scrollBoxOf(el) : null;
  if (el) {
    const mt = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const want = (box ? box.getBoundingClientRect().top : 0) + 8 + mt;
    await glideBy(box, el.getBoundingClientRect().top - want, 320);
  }
  open.value = false;
  if (en !== props.base || props.unpicked) emit("pick", en);
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
      <!-- ゲームの絵のボタンで目立たせる (2026-10-10 オーナー「ベース変更見づらいよね」: 灰色の小さい「変える」だった) -->
      <span class="g-btn sm ml-2 inline-flex items-center gap-1">{{ open ? tr("閉じる", "Close") : tr("ベースを変える", "Change base") }}<Icon :name="open ? 'chevron-up' : 'chevron-down'" class="size-3.5" /></span>
    </button>
    <!-- 開け閉めは高さを 0.3 秒で伸び縮み (パッと消える・出るのが「ワープみたい」。2026-10-10 オーナー「ぬるっと動かして、特にベース選択後」)。
         一度開いたら中身は残す (閉じる動きの間も見えるように) -->
    <div class="grid transition-[grid-template-rows,opacity] duration-300 ease-out" :class="open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'" :inert="!open">
      <div class="min-h-0 overflow-hidden">
        <div v-if="everOpen" class="mt-2 rounded-lg bg-black/30 p-4">
          <!-- 未選択の時は前のベース・種類を選んだ状態にしない (2026-10-05 オーナー「リセットの時ベース未選択から始めんかい」) -->
          <!-- フラスコ・スキルジェムは出さない (2026-10-09 オーナー「フラスコとスキルジェムはいらんね」) -->
          <BaseCatalog :data="data" :selected="unpicked ? '' : base" @pick="choose" />
        </div>
      </div>
    </div>
  </div>
</template>
