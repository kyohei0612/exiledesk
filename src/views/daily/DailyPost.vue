<!--
  DailyPost.vue — お題の投稿 (D-11〜D-15)。口は 2 か所: 上 = エミュのアイテム、下 = poe.ninja / トレード / ゲームのコピーを貼る欄 (読みは 1 つ)。
  どちらも同じ確かめの画面へ。投稿はサーバーの口 (daily-api) の形で、今はこのブラウザに溜まる (D-90)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { craftStage as s } from "../../state/craft-stage";
import { closeDailyPage, openDailyPage } from "../../web/page";
import { itemFromEmu, itemFromText, postBlock, type PostItem } from "./daily-aims";
import { myNick, postBox } from "./daily-api";
import DailyNick from "./DailyNick.vue";

const item = ref<PostItem | null>(null);
const why = ref<string | null>(null);
const text = ref("");
const note = ref("");
const sent = ref(false);
const asking = ref(false);

const emu = computed(() => { const i = s.item.value; return i && i.prefixes.length + i.suffixes.length ? i : null; });
const block = computed(() => (item.value ? postBlock(item.value) : null));
const useEmu = (): void => { const d = s.data.value; if (d && emu.value) { why.value = null; item.value = itemFromEmu(d, emu.value); } };
function read(raw: string): void {
  const d = s.data.value;
  if (!d || !raw.trim()) return;
  const r = itemFromText(d, raw);
  if (typeof r === "string") { why.value = r; item.value = null; } else { why.value = null; item.value = r; }
}
const onPaste = (e: ClipboardEvent): void => { const v = e.clipboardData?.getData("text") ?? ""; if (v) { e.preventDefault(); text.value = v; read(v); } };
function send(): void {
  const p = item.value;
  if (!p || block.value) return;
  if (!myNick()) { asking.value = true; return; }
  postBox({ note: note.value.trim().slice(0, 80), base: p.base, baseJa: p.baseJa, ilvl: p.ilvl, aims: p.aims });
  sent.value = true;
}
</script>

<template>
  <div data-daily-post class="daily-post">
    <template v-if="sent">
      <h2 class="g-brush daily-hero-title">{{ tr("投稿した", "Posted") }}</h2>
      <p class="mb-4 text-[15px]">{{ tr("精査を通ると、古い順に朝 7 時のお題になる。", "After review it becomes a daily challenge, oldest first, at 7:00 JST.") }}</p>
      <button type="button" class="g-btn" data-daily-post-back @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ", "To the list") }}</button>
    </template>
    <template v-else-if="item">
      <h2 class="g-brush daily-hero-title">{{ tr("この形で投稿する", "Post this item") }}</h2>
      <div class="daily-veil">
        <img v-if="baseArt(item.base)" :src="baseArt(item.base)!" alt="" class="daily-veil-art open" />
        <div class="min-w-0">
          <p class="name daily-veil-name">{{ tr(item.baseJa, item.base) }}</p>
          <p class="text-[14px] opacity-70">{{ tr(`アイテムレベル ${item.ilvl}`, `Item level ${item.ilvl}`) }}</p>
        </div>
      </div>
      <ul data-daily-post-aims class="mb-3 text-[15px]">
        <li v-for="a in item.aims" :key="a.modId" class="py-0.5 text-[var(--exile-color-text-link)]">{{ tr(a.ja, a.en) }}</li>
        <li v-for="b in item.bad" :key="b.line" data-daily-post-bad class="py-0.5 text-[var(--exile-color-signal-down)]">{{ b.line }} ({{ b.why }})</li>
      </ul>
      <label class="mb-3 block text-[14px]">{{ tr("ひと言 (なくてもよい)", "A short note (optional)") }}
        <input v-model="note" data-daily-post-note type="text" maxlength="80" class="daily-input mt-1 w-full" />
      </label>
      <p v-if="block" data-daily-post-block class="mb-3 text-[14px] text-[var(--exile-color-signal-down)]">{{ block }}</p>
      <div class="flex gap-2">
        <button type="button" class="g-btn" @click="item = null">{{ tr("選び直す", "Choose again") }}</button>
        <button type="button" class="g-btn-red" data-daily-post-send :disabled="!!block" @click="send">{{ tr("投稿する", "Post") }}</button>
      </div>
    </template>
    <template v-else>
      <h2 class="g-brush daily-hero-title">{{ tr("作ってほしい装備を投稿する", "Post an item to be crafted") }}</h2>
      <div class="daily-post-from">
        <section data-daily-from-emu>
          <h3 class="name mb-2 text-[17px] text-[var(--exile-color-text-title)]">{{ tr("エミュレーターのアイテムから", "From the Emulator") }}</h3>
          <template v-if="emu">
            <p class="mb-3 text-[14px]">{{ tr(`${emu.baseJa}、MOD ${emu.prefixes.length + emu.suffixes.length} つ`, `${emu.base}, ${emu.prefixes.length + emu.suffixes.length} mods`) }}</p>
            <button type="button" class="g-btn" data-daily-use-emu @click="useEmu">{{ tr("このアイテムを使う", "Use this item") }}</button>
          </template>
          <template v-else>
            <p class="mb-3 text-[14px] opacity-70">{{ tr("MOD の付いたアイテムがまだ無い。", "No item with mods yet.") }}</p>
            <button type="button" class="g-btn" data-daily-go-emu @click="closeDailyPage">{{ tr("エミュレーターで作る", "Craft in the Emulator") }}</button>
          </template>
        </section>
        <section data-daily-from-paste>
          <h3 class="name mb-2 text-[17px] text-[var(--exile-color-text-title)]">{{ tr("poe.ninja・トレードのコピーから", "From poe.ninja or trade") }}</h3>
          <textarea v-model="text" data-daily-paste rows="6" spellcheck="false" class="daily-input w-full" :placeholder="tr('アイテムのコピーをここに貼る', 'Paste the copied item here')" @paste="onPaste" />
          <p v-if="why" data-daily-paste-why class="mt-1 text-[14px] text-[var(--exile-color-signal-down)]">{{ why }}</p>
          <button type="button" class="g-btn mt-2" data-daily-paste-read :disabled="!text.trim()" @click="read(text)">{{ tr("読み込む", "Read item") }}</button>
        </section>
      </div>
      <button type="button" class="g-btn mt-4" @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
    </template>
    <DailyNick v-if="asking" @done="asking = false; send()" @close="asking = false" />
  </div>
</template>
