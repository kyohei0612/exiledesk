<!--
  SimPasteRead.vue — ① ベースを選ぶページの「貼り付け」のタイルで下に開く枠 (2026-10-20 オーナー)。
  取引所・poe.ninja のアイテムのテキストを貼ると、読んだ結果 (ベース・アイテムレベル・品質・暗黙・MOD・コラプト・読めなかった行と理由) を並べ、
  「これで始める」で ① のベースと ② の狙いを一度に埋めて ② へ。読みは services/simulator/paste-read.ts (【仮】入口はジン部長が作っている)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import { readPaste, type PasteRead } from "../../services/simulator/paste-read";

const emit = defineEmits<{ start: [r: PasteRead] }>();
const text = ref("");
const read = computed<PasteRead | null>(() => (s.data.value && text.value.trim() ? readPaste(s.data.value, text.value) : null));
const baseName = computed(() => (read.value?.base ? tr(read.value.baseText ?? read.value.base, read.value.base) : ""));
const unrevealedText = computed(() => {
  const u = read.value?.unrevealed;
  if (!u) return "";
  return [u.prefix ? tr(`未発現プレフィックス ×${u.prefix}`, `Unrevealed Prefix ×${u.prefix}`) : "", u.suffix ? tr(`未発現サフィックス ×${u.suffix}`, `Unrevealed Suffix ×${u.suffix}`) : ""].filter(Boolean).join(" · ");
});
const SIDE = { prefix: ["P", "プレフィックス", "Prefix"], suffix: ["S", "サフィックス", "Suffix"] } as const;
</script>

<template>
  <div data-sim-paste-read class="grid min-w-0 gap-2">
    <textarea v-model="text" data-sim-paste-text rows="5" class="w-full min-w-0 resize-y rounded bg-black/40 p-2 font-mono text-[12px] text-[var(--exile-color-text-primary)] max-md:text-[16px]" :placeholder="tr('アイテムのテキストを貼る (ゲーム・取引所・poe.ninja で Ctrl+C)', 'Paste the item text (Ctrl+C in game, trade or poe.ninja)')" />
    <template v-if="read">
      <p v-if="!read.base" data-sim-paste-nobase class="text-[13px] text-rose-200">{{ tr("ベースが読めない", "Could not read the base") }}</p>
      <div v-else class="grid min-w-0 gap-1.5 text-[13px]">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <b data-sim-paste-base class="min-w-0 truncate text-[15px] text-[var(--exile-color-text-title)]">{{ baseName }}</b>
          <span v-if="read.itemLevel != null" class="tabular-nums opacity-80">{{ tr(`アイテムレベル ${read.itemLevel}`, `Item Level ${read.itemLevel}`) }}</span>
          <span v-if="read.quality != null" class="tabular-nums opacity-80">{{ tr(`品質 +${read.quality}%`, `Quality +${read.quality}%`) }}</span>
          <span v-if="read.corrupted" data-sim-paste-corrupt class="text-rose-300">{{ read.corrupted === 2 ? tr("二重コラプト", "Twice Corrupted") : tr("コラプト", "Corrupted") }}</span>
        </div>
        <ul v-if="read.implicits.length" class="grid min-w-0 gap-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">
          <li v-for="(im, i) in read.implicits" :key="i" class="min-w-0 break-words"><span class="mr-1.5 opacity-60">{{ tr("暗黙", "Implicit") }}</span>{{ im }}</li>
        </ul>
        <ul data-sim-paste-mods class="grid min-w-0 gap-0.5">
          <li v-for="m in read.mods" :key="m.modId" class="flex min-w-0 items-baseline gap-1.5">
            <span class="w-4 shrink-0 text-center text-[11px] opacity-60" :title="tr(SIDE[m.side][1], SIDE[m.side][2])">{{ SIDE[m.side][0] }}</span>
            <span class="shrink-0 tabular-nums text-amber-200" :title="m.guessed ? tr('値がどの段にも入らないので推し量った段 (② で直す)', 'Value fits no tier; this tier is a guess (fix it in step 2)') : undefined">T{{ m.tierRank }}{{ m.guessed ? "?" : "" }}</span>
            <span class="min-w-0 break-words">{{ m.text }}</span>
            <span v-if="m.fractured" class="shrink-0 text-[11px] text-sky-200">{{ tr("フラクチャー", "Fractured") }}</span>
            <span v-if="m.desecrated" class="shrink-0 text-[11px] text-fuchsia-200">{{ tr("冒涜", "Desecrated") }}</span>
          </li>
          <li v-if="unrevealedText" class="text-[12px] text-fuchsia-200/80">{{ unrevealedText }}</li>
        </ul>
        <ul v-if="read.skipped.length" data-sim-paste-skipped class="grid min-w-0 gap-0.5 text-[12px] text-rose-200">
          <li v-for="(k, i) in read.skipped" :key="i" class="min-w-0 break-words"><span class="opacity-75">{{ tr("読めない", "Not read") }}:</span> {{ k.text }} <span class="opacity-70">({{ tr(k.ja, k.en) }})</span></li>
        </ul>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-sim-paste-start class="g-btn-red sm max-md:min-h-10 max-md:flex-1" :disabled="!read.base" @click="emit('start', read)">{{ tr("これで始める", "Start with this") }}</button>
        <button type="button" class="g-btn sm max-md:min-h-10" @click="text = ''">{{ tr("消す", "Clear") }}</button>
      </div>
    </template>
  </div>
</template>
