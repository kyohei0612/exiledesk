<!--
  SimPasteRead.vue — ① ベースを選ぶページの「貼り付け」のタイルで下に開く枠 (2026-10-20 オーナー)。
  取引所・poe.ninja のアイテムのテキストを貼ると、読んだ結果 (ベース・アイテムレベル・品質・暗黙・MOD・コラプト・読めなかった行と理由) を並べ、
  「これで始める」で ① のベースと ② の狙いを一度に埋めて ② へ。読みはエンジンの入口の parseItemText (services/simulator/paste-read.ts)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import { readPaste, type PasteRead } from "../../services/simulator/paste-read";
import type { ItemTextImplicit } from "../../services/craft-stage/engine";

const emit = defineEmits<{ start: [r: PasteRead] }>();
const text = ref("");
const read = computed<PasteRead | null>(() => (s.data.value && text.value.trim() ? readPaste(s.data.value, text.value) : null));
const it = computed(() => read.value?.item ?? null);
const SIDE = { prefix: ["P", "プレフィックス", "Prefix"], suffix: ["S", "サフィックス", "Suffix"] } as const;
/** 暗黙の行の札。extra = 印の無い貼り付けでベースの暗黙より前にあった行 (ルーン・エンチャント・コラプトの暗黙のどれか) */
const IMPLICIT: Record<ItemTextImplicit["from"], [string, string, string?, string?]> = {
  base: ["暗黙", "Implicit"],
  rune: ["ルーン", "Rune"],
  enchant: ["エンチャント", "Enchant"],
  extra: ["暗黙?", "Implicit?", "ルーン・エンチャント・コラプトの暗黙のどれか (文では見分けられない)", "A rune, enchant or corruption implicit (the text alone can't tell)"],
};
</script>

<template>
  <div data-sim-paste-read class="grid min-w-0 gap-2">
    <textarea v-model="text" data-sim-paste-text rows="5" class="w-full min-w-0 resize-y rounded bg-black/40 p-2 font-mono text-[12px] text-[var(--exile-color-text-primary)] max-md:text-[16px]" :placeholder="tr('アイテムのテキストを貼る (ゲーム・取引所・poe.ninja で Ctrl+C)', 'Paste the item text (Ctrl+C in game, trade or poe.ninja)')" />
    <template v-if="read && it">
      <p v-if="!it.base" data-sim-paste-nobase class="text-[13px] text-rose-200">{{ tr("ベースが読めない", "Could not read the base") }}</p>
      <div v-else class="grid min-w-0 gap-1.5 text-[13px]">
        <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <b data-sim-paste-base class="min-w-0 truncate text-[15px] text-[var(--exile-color-text-title)]">{{ tr(it.base.ja, it.base.en) }}</b>
          <span v-if="it.itemLevel != null" class="tabular-nums opacity-80">{{ tr(`アイテムレベル ${it.itemLevel}`, `Item Level ${it.itemLevel}`) }}</span>
          <span v-if="it.quality" class="tabular-nums opacity-80" :title="it.quality.label">{{ tr(`品質 +${it.quality.value}%`, `Quality +${it.quality.value}%`) }}</span>
          <span v-if="it.corrupted" data-sim-paste-corrupt class="text-rose-300">{{ it.corrupted === 2 ? tr("二重コラプト", "Twice Corrupted") : tr("コラプト", "Corrupted") }}</span>
          <span class="tabular-nums text-[12px] opacity-60">P {{ it.count.prefix }}/{{ it.count.limit.prefix }} · S {{ it.count.suffix }}/{{ it.count.limit.suffix }}</span>
        </div>
        <ul v-if="it.implicits.length" class="grid min-w-0 gap-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">
          <li v-for="(im, i) in it.implicits" :key="i" class="min-w-0 break-words"><span class="mr-1.5 opacity-60" :title="IMPLICIT[im.from][2] ? tr(IMPLICIT[im.from][2]!, IMPLICIT[im.from][3]!) : undefined">{{ tr(IMPLICIT[im.from][0], IMPLICIT[im.from][1]) }}</span>{{ im.text }}</li>
        </ul>
        <ul data-sim-paste-mods class="grid min-w-0 gap-0.5">
          <li v-for="(m, i) in it.mods" :key="i" class="flex min-w-0 items-baseline gap-1.5">
            <span class="w-4 shrink-0 text-center text-[11px] opacity-60" :title="m.side ? tr(SIDE[m.side][1], SIDE[m.side][2]) : undefined">{{ m.side ? SIDE[m.side][0] : "?" }}</span>
            <template v-if="m.unrevealed"><span class="min-w-0 break-words text-fuchsia-200/80">{{ m.text }}</span></template>
            <template v-else>
              <span v-if="m.tier" class="shrink-0 tabular-nums text-amber-200" :title="m.tier.fits ? m.tier.name : tr('値がどの段にも入らないので推し量った段 (② で直す)', 'Value fits no tier; this tier is a guess (fix it in step 2)')">{{ m.tier.label }}{{ m.tier.fits ? "" : "?" }}</span>
              <span class="min-w-0 break-words">{{ m.text }}</span>
              <span v-if="m.fractured" class="shrink-0 text-[11px] text-sky-200">{{ tr("フラクチャー", "Fractured") }}</span>
              <span v-if="m.desecrated" class="shrink-0 text-[11px] text-fuchsia-200">{{ tr("冒涜", "Desecrated") }}</span>
              <span v-if="m.crafted" class="shrink-0 text-[11px] text-sky-100/80">{{ tr("クラフト", "Crafted") }}</span>
            </template>
          </li>
        </ul>
      </div>
      <ul v-if="it.skipped.length" data-sim-paste-skipped class="grid min-w-0 gap-0.5 text-[12px] text-rose-200">
        <li v-for="(k, i) in it.skipped" :key="i" class="min-w-0 break-words"><span class="opacity-75">{{ tr("読めない", "Not read") }}:</span> {{ k.line }} <span class="opacity-70">({{ tr(k.reason.ja, k.reason.en) }})</span></li>
      </ul>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-sim-paste-start class="g-btn-red sm max-md:min-h-10 max-md:flex-1" :disabled="!it.base" @click="emit('start', read)">{{ tr("これで始める", "Start with this") }}</button>
        <button type="button" class="g-btn sm max-md:min-h-10" @click="text = ''">{{ tr("消す", "Clear") }}</button>
      </div>
    </template>
  </div>
</template>
