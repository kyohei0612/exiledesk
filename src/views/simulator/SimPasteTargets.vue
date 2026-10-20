<!--
  SimPasteTargets.vue — ② 狙う MOD を、取引所のアイテム (ゲームで Ctrl+C したテキスト) の貼り付けで写す (2026-10-20 要望 91832821 の ②)。
  押すと貼る欄が開く (既定は閉じる)。貼った時に写す: 今の狙いと入れ替え、段は貼った値が入る段 (その段以上が当たり)、固定済みの注記はフラクチャーの印。
  写せない行 (このベースに無い・段が分からない・別の部位) は下に文で出す。仕組みは services/simulator/paste-target.ts
-->
<script setup lang="ts">
import { ref } from "vue";
import { craftStage } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import { pasteToTargets, type PasteNote } from "../../services/simulator/paste-target";

const s = craftStage;
const open = ref(false);
const text = ref("");
const done = ref<{ count: number; notes: PasteNote[] } | null>(null);

function apply(raw: string): void {
  const d = s.data.value;
  if (!d || !raw.trim()) return;
  const r = pasteToTargets(d, raw, s.base.value);
  done.value = { count: r.targets.length, notes: r.notes };
  if (r.targets.length) s.simTargets.value = r.targets;
}
function onPaste(e: ClipboardEvent): void {
  const raw = e.clipboardData?.getData("text") ?? "";
  if (!raw) return;
  e.preventDefault();
  text.value = raw;
  apply(raw);
}
const NOTE_CLS: Record<PasteNote["kind"], string> = { skip: "text-rose-200", tier: "text-amber-200", base: "text-amber-200", info: "opacity-70" };
</script>

<template>
  <div data-sim-paste class="min-w-0">
    <button type="button" class="g-btn sm max-md:min-h-10" :aria-expanded="open" :title="tr('取引所のアイテムをゲームで Ctrl+C して貼ると、その MOD と段を狙いに写す', 'Paste an item copied with Ctrl+C in game (e.g. from trade) to copy its mods and tiers as targets')" @click="open = !open">
      {{ tr("貼り付けで写す", "Copy from pasted item") }} {{ open ? "▴" : "▾" }}
    </button>
    <div v-if="open" class="mt-1.5 grid min-w-0 gap-1.5 rounded-md border border-white/10 bg-black/20 p-2">
      <textarea v-model="text" data-sim-paste-text rows="4" class="w-full min-w-0 resize-y rounded bg-black/40 p-1.5 font-mono text-[12px] text-[var(--exile-color-text-primary)]" :placeholder="tr('ゲームでアイテムに乗せて Ctrl+C → ここで Ctrl+V (今の狙いと入れ替える)', 'Hover the item in game, Ctrl+C, then Ctrl+V here (replaces the current targets)')" @paste="onPaste" />
      <div class="flex items-center gap-2">
        <button type="button" class="g-btn sm" :disabled="!text.trim() || !s.data.value" @click="apply(text)">{{ tr("写す", "Copy") }}</button>
        <span v-if="done" data-sim-paste-result class="min-w-0 truncate text-[12px]" :class="done.count ? 'text-emerald-200' : 'text-rose-200'">{{ done.count ? tr(`${done.count} つ写した`, `Copied ${done.count} mods`) : tr("写せなかった", "Nothing copied") }}</span>
      </div>
      <ul v-if="done?.notes.length" class="grid gap-0.5 text-[12px]">
        <li v-for="(n, i) in done.notes" :key="i" class="min-w-0 break-words" :class="NOTE_CLS[n.kind]">{{ tr(n.ja, n.en) }}</li>
      </ul>
    </div>
  </div>
</template>
