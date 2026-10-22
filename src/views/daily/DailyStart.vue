<!--
  DailyStart.vue — フラクチャー選び (デイリーのモック、2026-10-22)。
  ベースはお題で決まっているので、どの MOD をフラクチャーして始めるか (または無し) を 1 つ選び、シミュレーターへ。
  フラクチャーまでの費用は数えない (全員同じスタート、オーナー 10-22)。枠の外を押す・Esc で選ぶ前に戻す (メモ feedback-click-outside-cancel)。
  シミュレーターを開く口はシミュ部長の物で、まだ無い → 押すと「つなぐ前」の札だけ出す
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../services/craft-stage/base-art";
import { usePhone } from "../../utils/use-phone";
import HelpTip from "../../components/ui/HelpTip.vue";
import { fillMod, type DailyTopic } from "./daily-mock";
import DailyModList from "./DailyModList.vue";

const props = defineProps<{ topic: DailyTopic }>();
const phone = usePhone();
/** undefined = まだ選んでいない、null = フラクチャー無し */
const pick = ref<number | null | undefined>(undefined);
const sent = ref(false);
const box = ref<HTMLElement | null>(null);
const bar = ref<HTMLElement | null>(null);

const chosen = computed(() => {
  if (pick.value === undefined) return null;
  if (pick.value === null) return tr("フラクチャー無し", "No fracture");
  const x = props.topic.mods[pick.value];
  return x ? fillMod(tr(x.ja, x.en), x.range) : null;
});
const choose = (i: number | null) => { pick.value = pick.value === i ? undefined : i; sent.value = false; };
const go = () => { if (pick.value !== undefined) sent.value = true; };

// 枠の外・Esc で選ぶ前に戻す (決めるボタンの帯は枠の内として数える)
function onDown(e: PointerEvent) {
  const t = e.target as Node;
  if (box.value?.contains(t) || bar.value?.contains(t)) return;
  pick.value = undefined;
  sent.value = false;
}
function onKey(e: KeyboardEvent) { if (e.key === "Escape") { pick.value = undefined; sent.value = false; } }
onMounted(() => { document.addEventListener("pointerdown", onDown); document.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); });
</script>

<template>
  <div data-daily-start-page class="min-w-0" :class="phone ? 'pb-32' : ''">
    <div class="mb-3 flex min-w-0 items-center gap-3">
      <img v-if="baseArt(topic.base.en)" :src="baseArt(topic.base.en)!" alt="" class="size-12 shrink-0 object-contain" draggable="false" />
      <div class="min-w-0 flex-1">
        <p class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ topic.day }} · {{ tr(`アイテムレベル ${topic.base.ilvl}`, `Item Level ${topic.base.ilvl}`) }}</p>
        <h2 class="min-w-0 truncate text-[18px] text-[var(--exile-color-text-title)]">{{ tr(topic.base.ja, topic.base.en) }}</h2>
      </div>
    </div>

    <p class="mb-2 flex items-center gap-1.5 text-[14px] text-[var(--exile-color-text-primary)]">
      {{ tr("フラクチャーして始める MOD を選ぶ", "Pick a mod to start fractured") }}
      <HelpTip :text="tr('選んだ MOD が 1 つ付いて固定された状態から始めます。そこまでの費用は数えません (全員同じスタート)。平均の費用で競い、完成率 90% 以上で解決', 'You start with this one mod already on the item and fractured. That cost is not counted (everyone starts the same). Compete on average cost; 90%+ completion solves it')" />
    </p>

    <div ref="box" data-daily-pick class="min-w-0">
      <DailyModList :mods="topic.mods" :pick="pick" pickable @pick="choose" />
      <button type="button" data-daily-pick-none class="mt-1 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.06] max-md:py-2" :class="pick === null ? 'border-amber-400/70 bg-amber-500/15 text-amber-100' : 'border-transparent opacity-75'" :aria-pressed="pick === null" @click="choose(null)">
        <span class="w-9 shrink-0" />
        {{ tr("フラクチャー無しで始める", "Start without a fracture") }}
      </button>
    </div>

    <!-- 決める帯 (スマホは下に固定) -->
    <div ref="bar" data-daily-go class="mt-4 flex min-w-0 items-center gap-3 rounded-md bg-black/40 px-3 py-2" :class="phone ? 'fixed inset-x-0 bottom-0 z-30 !mt-0 rounded-none border-t border-white/10 bg-black/90 pb-[calc(0.5rem+env(safe-area-inset-bottom))]' : ''">
      <span class="min-w-0 flex-1 truncate text-[13px]" :class="chosen ? 'text-amber-100' : 'opacity-60'">{{ chosen ?? tr("まだ選んでいません", "Nothing picked yet") }}</span>
      <button type="button" class="g-btn g-btn-red shrink-0 max-md:min-h-11" :disabled="pick === undefined" @click="go">{{ tr("シミュレーターで始める →", "Open in Simulator →") }}</button>
    </div>
    <p v-if="sent" data-daily-sent class="mt-2 rounded-md bg-sky-900/30 px-3 py-1.5 text-[12px] text-sky-100" :class="phone ? 'mb-2' : ''">{{ tr("見本: ここでシミュレーターの画面を、お題のベース + 選んだフラクチャーで開きます (つなぐのは後)", "Mock: this will open the Simulator with the base and your fracture (wired later)") }}</p>
  </div>
</template>
