<!-- DailyNoteEdit.vue — 提出の後から一言を足す・直す・消す小窓 (D-35e、スイッチ dailyNote)。欄・字数・赤字は提出の窓 (DailySubmitAsk) と同じ -->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";
import { getTry, noteTry, SUBMIT_NOTE_MAX } from "./daily-api";

const props = defineProps<{ id: string; open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const note = ref("");
const had = ref(false);
const busy = ref(false);
const bad = ref(false);
const failed = ref(false);
const noteLen = computed(() => [...note.value.trim()].length);
/** 開くたびに今の一言 (端末の控え) から始める */
watch(() => props.open, (o) => { if (!o) return; note.value = getTry(props.id)?.note ?? ""; had.value = !!note.value; bad.value = failed.value = false; }, { immediate: true });
async function put(text: string): Promise<void> {
  bad.value = failed.value = false;
  busy.value = true;
  const r = await noteTry(props.id, text);
  busy.value = false;
  if (r === "bad") { bad.value = true; return; }
  if (r === "fail") { failed.value = true; return; }
  emit("close");
}
</script>

<template>
  <ModalShell :open="open" :title="had ? tr('ひとことを直す', 'Edit your note') : tr('ひとことを書く', 'Add a note')" width="w-[440px] max-w-[94vw]" @close="!busy && emit('close')">
    <div data-daily-note-edit class="flex flex-col gap-3 p-4 text-[14px]">
      <label class="daily-note-field">
        <span>{{ tr("順位の自分の行の名前の下に出る (40 字まで)", "Shown under your name on the ranking (up to 40 characters)") }}</span>
        <input v-model="note" type="text" class="daily-input w-full" data-daily-note-input :maxlength="SUBMIT_NOTE_MAX" spellcheck="false" autocomplete="off" :disabled="busy" :placeholder="tr('例: フラクチャーで 2 回ミスった', 'e.g. Missed the fracture twice')" @input="bad = false" @keydown.enter="noteLen && put(note)" />
        <small>{{ noteLen }} / {{ SUBMIT_NOTE_MAX }}</small>
      </label>
      <p v-if="bad" data-daily-note-bad class="text-[var(--exile-color-signal-down)]">{{ tr("使えない言葉か URL が入っている。書き直してください。", "Your note has a word or URL that isn't allowed. Please change it.") }}</p>
      <p v-if="failed" data-daily-note-fail class="text-[var(--exile-color-signal-down)]">{{ tr("置けなかった (つながらない・今日のお題が切り替わった)。", "Couldn't save it (connection, or today's challenge has changed).") }}</p>
      <div class="flex items-center gap-2">
        <button v-if="had" type="button" class="g-btn" data-daily-note-clear :disabled="busy" @click="put('')">{{ tr("消す", "Remove") }}</button>
        <span class="flex-1" />
        <button type="button" class="g-btn" :disabled="busy" @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" class="g-btn-red" data-daily-note-ok :disabled="busy || !noteLen" @click="put(note)">{{ tr("置く", "Save") }}</button>
      </div>
    </div>
  </ModalShell>
</template>

<style scoped>
.daily-note-field { display: flex; flex-direction: column; gap: 4px; }
.daily-note-field > span { font-size: 13px; opacity: 0.8; }
.daily-note-field > small { align-self: flex-end; font-size: 12px; opacity: 0.6; }
</style>
