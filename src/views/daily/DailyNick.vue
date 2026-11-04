<!--
  DailyNick.vue — ニックネームを決める窓 (D-51・D-52)。決めるまで挑戦できない。決めたら引き継ぎコードを 1 度だけ見せ、「コピーした」まで閉じない。
  別の PC では「引き継ぎコードで名前を戻す」から戻す。保存はサーバーの口 (daily-api) の形で。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";
import { createNick, NICK_MAX, restoreNick, type DailyNick, type NickError } from "./daily-api";

const emit = defineEmits<{ done: [DailyNick]; close: [] }>();
const mode = ref<"new" | "back">("new");
const name = ref("");
const code = ref("");
const fail = ref<NickError | null>(null);
/** 決めた直後 = 合言葉を見せている */
const made = ref<DailyNick | null>(null);
const copied = ref(false);

const WHY: Record<NickError, () => string> = {
  empty: () => tr("名前を入れる", "Enter a name"),
  long: () => tr(`${NICK_MAX} 字まで`, `Up to ${NICK_MAX} characters`),
  url: () => tr("URL は使えない", "URLs aren't allowed"),
  reserved: () => tr("運営に見える名前は使えない", "This name looks official"),
  bad: () => tr("使えない言葉が入っている", "This name has a banned word"),
  taken: () => tr("もう使われている名前。別の名前にするか、自分の名前なら引き継ぎコードで戻す", "That name is taken. Pick another, or restore it with your transfer code if it's yours"),
  wrong: () => tr("名前か引き継ぎコードが違う", "Name or transfer code doesn't match"),
  busy: () => tr("名前を作りすぎた。1 時間待ってから決める", "Too many names made. Wait an hour and try again"),
  net: () => tr("サーバーにつながらない。少し待ってもう一度押す", "Couldn't reach the server. Try again in a moment"),
};
const why = computed(() => (fail.value ? WHY[fail.value]() : ""));

async function decide(): Promise<void> {
  const r = await createNick(name.value);
  if (typeof r === "string") { fail.value = r; return; }
  fail.value = null; made.value = r;
}
async function back(): Promise<void> {
  const r = await restoreNick(name.value, code.value);
  if (typeof r === "string") { fail.value = r; return; }
  emit("done", r);
}
async function copy(): Promise<void> {
  try { await navigator.clipboard.writeText(made.value!.code); } catch { /* 手で写せる */ }
  copied.value = true;
}
const setMode = (m: "new" | "back"): void => { mode.value = m; fail.value = null; };
</script>

<template>
  <ModalShell :open="true" :title="tr('ニックネーム', 'Nickname')" width="w-[440px] max-w-[94vw]" :closable="!made" @close="emit('close')">
    <div data-daily-nick class="flex flex-col gap-3 p-4 text-[14px]">
      <template v-if="made">
        <p>{{ tr(`「${made.name}」に決まった。別の PC で同じ名前を使う時は、この引き継ぎコードを入れる。`, `"${made.name}" is yours. Enter this transfer code to use the same name on another PC.`) }}</p>
        <p class="daily-pass select-all text-center" data-daily-pass>{{ made.code }}</p>
        <p class="text-[12px] opacity-70">{{ tr("コードはここでしか見られない。なくすと名前を戻せない。", "This is the only time it's shown. Without it the name can't be restored.") }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="g-btn sm" data-daily-pass-copy @click="copy">{{ copied ? tr("コピーした", "Copied") : tr("コードをコピー", "Copy code") }}</button>
          <button type="button" class="g-btn-red sm" data-daily-nick-done :disabled="!copied" @click="emit('done', made!)">{{ tr("閉じる", "Close") }}</button>
        </div>
      </template>
      <template v-else>
        <p v-if="mode === 'new'">{{ tr("順位に載る名前を決める。ずっと同じ名前で遊べて、同じ名前の人は出ない。", "Choose the name shown on the rankings. It stays yours and no one else can take it.") }}</p>
        <input v-model="name" data-daily-nick-name type="text" :maxlength="NICK_MAX + 4" spellcheck="false" autocomplete="off" class="daily-input" :placeholder="tr('ニックネーム', 'Nickname')" @input="fail = null" @keydown.enter.prevent="mode === 'new' ? decide() : back()" />
        <input v-if="mode === 'back'" v-model="code" data-daily-nick-pass type="text" spellcheck="false" autocomplete="off" class="daily-input" :placeholder="tr('引き継ぎコード', 'Transfer code')" @input="fail = null" @keydown.enter.prevent="back" />
        <p v-if="why" data-daily-nick-why class="text-[13px] text-[var(--exile-color-signal-down)]">{{ why }}</p>
        <div class="flex items-center justify-between gap-2">
          <button type="button" class="text-[13px] underline opacity-70 hover:opacity-100" data-daily-nick-mode @click="setMode(mode === 'new' ? 'back' : 'new')">{{ mode === "new" ? tr("引き継ぎコードで名前を戻す", "Restore a name") : tr("新しい名前を決める", "Choose a new name") }}</button>
          <button type="button" class="g-btn-red sm" data-daily-nick-ok @click="mode === 'new' ? decide() : back()">{{ mode === "new" ? tr("この名前にする", "Use this name") : tr("名前を戻す", "Restore name") }}</button>
        </div>
      </template>
    </div>
  </ModalShell>
</template>
