<!--
  SimPasteRead.vue — ① ベースを選ぶページの「貼り付け」のタイルで下に開く枠 (2026-10-20 オーナー)。
  取引所・poe.ninja のアイテムのテキストを貼ると、読んだ結果 (ベース・アイテムレベル・品質・暗黙・MOD・コラプト・読めなかった行と理由) を並べ、
  「これで始める」で ① のベースと ② の狙いを一度に埋めて ② へ。読みはエンジンの入口の parseItemText (services/simulator/paste-read.ts)
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import { readPaste, type PasteRead } from "../../services/simulator/paste-read";
import type { ItemTextImplicit } from "../../services/craft-stage/engine";

const emit = defineEmits<{ start: [r: PasteRead] }>();
const text = ref("");
const read = computed<PasteRead | null>(() => (s.data.value && text.value.trim() ? readPaste(s.data.value, text.value) : null));
const it = computed(() => read.value?.item ?? null);
/** 段の「?」を押して開いた行 (推し量った段の理由。2026-10-20 点検 2: ? の意味が分からなかった) */
const why = ref(new Set<number>());
function toggleWhy(i: number): void { const n = new Set(why.value); if (n.has(i)) n.delete(i); else n.add(i); why.value = n; }
/**
 * 貼ったら「これで始める」が画面の外なら、そこまで送る (2026-10-20 点検 8: 1660×860 で 943px に出て止まったように見えた)。
 * PC は貼る欄と結果を左右に並べて背を低くし、ボタンは結果の上に置く
 */
const startEl = ref<HTMLElement | null>(null);
watch(() => !!read.value?.item.base, (ok) => {
  why.value = new Set();
  if (ok) void nextTick(() => startEl.value?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
});
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
  <div data-sim-paste-read class="grid min-w-0 gap-2 md:grid-cols-2 md:gap-3">
    <textarea v-model="text" data-sim-paste-text rows="5" class="w-full min-w-0 resize-y md:min-h-[14rem] rounded bg-black/40 p-2 font-mono text-[12px] text-[var(--exile-color-text-primary)] max-md:text-[16px]" :placeholder="tr('アイテムのテキストを貼る (ゲーム・取引所・poe.ninja で Ctrl+C)', 'Paste the item text (Ctrl+C in game, trade or poe.ninja)')" />
    <div v-if="read && it" class="grid min-w-0 content-start gap-2">
      <div ref="startEl" class="flex flex-wrap items-center gap-2">
        <button type="button" data-sim-paste-start class="g-btn-red sm max-md:min-h-10 max-md:flex-1" :disabled="!it.base" @click="emit('start', read)">{{ tr("これで始める", "Start with this") }}</button>
        <button type="button" class="g-btn sm max-md:min-h-10" @click="text = ''">{{ tr("消す", "Clear") }}</button>
      </div>
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
          <li v-for="(m, i) in it.mods" :key="i" class="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
            <span class="w-4 shrink-0 text-center text-[11px] opacity-60" :title="m.side ? tr(SIDE[m.side][1], SIDE[m.side][2]) : undefined">{{ m.side ? SIDE[m.side][0] : "?" }}</span>
            <template v-if="m.unrevealed"><span class="min-w-0 break-words text-fuchsia-200/80">{{ m.text }}</span></template>
            <template v-else>
              <span v-if="m.tier" class="shrink-0 tabular-nums text-amber-200" :title="m.tier.name">{{ m.tier.label }}</span>
              <button v-if="m.tier && !m.tier.fits" type="button" data-paste-why class="-ml-1 shrink-0 rounded px-1 text-[12px] font-bold text-amber-200 hover:bg-white/10 max-md:min-h-8 max-md:min-w-8" :aria-expanded="why.has(i)" :title="tr('段を推し量った理由', 'Why this tier is a guess')" @click="toggleWhy(i)">?</button>
              <span class="min-w-0 break-words">{{ m.text }}</span>
              <span v-if="m.fractured" class="shrink-0 text-[11px] text-sky-200">{{ tr("フラクチャー", "Fractured") }}</span>
              <span v-if="m.desecrated" class="shrink-0 text-[11px] text-fuchsia-200">{{ tr("冒涜", "Desecrated") }}</span>
              <span v-if="m.crafted" class="shrink-0 text-[11px] text-sky-100/80">{{ tr("クラフト", "Crafted") }}</span>
              <span v-if="why.has(i)" class="basis-full pl-[1.375rem] text-[12px] text-amber-100/80">{{ tr(`値がどの段の幅にも入らないので、アイテムレベル ${it.itemLevel ?? "?"} で出る一番上の段にした (② で直せる)`, `The value fits no tier's range, so it was set to the best tier at item level ${it.itemLevel ?? "?"} (you can change it in step 2)`) }}</span>
            </template>
          </li>
        </ul>
      </div>
      <ul v-if="it.skipped.length" data-sim-paste-skipped class="grid min-w-0 gap-0.5 text-[12px] text-rose-200">
        <li v-for="(k, i) in it.skipped" :key="i" class="min-w-0 break-words"><span class="opacity-75">{{ tr("読めない", "Not read") }}:</span> {{ k.line }} <span class="opacity-70">({{ tr(k.reason.ja, k.reason.en) }})</span></li>
      </ul>
    </div>
  </div>
</template>
