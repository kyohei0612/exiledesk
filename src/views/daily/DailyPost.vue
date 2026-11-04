<!--
  DailyPost.vue — お題の投稿 (D-11〜D-15)。口は 2 か所: 上 = エミュのアイテム、下 = poe.ninja / トレード / ゲームのコピーを貼る欄 (読みは 1 つ)。
  どちらも同じ確かめの画面へ。投稿は機械が確かめて、通れば箱へ、落ちれば訳を出す (D-20)。サーバーの口 (daily-api → POST /daily/box) へ送り、16:00 の台本がもう一度確かめる
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { craftStage as s } from "../../state/craft-stage";
import { closeDailyPage, openDailyPage } from "../../web/page";
import { itemFromEmu, itemFromText, postBlock, type PostItem } from "./daily-aims";
import { myNick, postBox, type BoxError, type DailyBoxItem } from "./daily-api";
import DailyAimCard from "./DailyAimCard.vue";
import DailyNick from "./DailyNick.vue";

const item = ref<PostItem | null>(null);
const why = ref<string | null>(null);
const text = ref("");
const note = ref("");
const sent = ref<DailyBoxItem | null>(null);
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
const sendFail = ref<BoxError | null>(null);
const sending = ref(false);
async function send(): Promise<void> {
  const p = item.value;
  const d = s.data.value;
  if (!p || !d || block.value || sending.value) return;
  if (!myNick()) { asking.value = true; return; }
  sending.value = true;
  const r = await postBox(d, { note: note.value.trim().slice(0, 80), base: p.base, baseJa: p.baseJa, ilvl: p.ilvl, aims: p.aims });
  sending.value = false;
  if (typeof r === "string") sendFail.value = r; else { sendFail.value = null; sent.value = r; }
}
const failText = (e: BoxError): string =>
  e === "busy" ? tr("投稿は 1 時間に 5 件まで。少し待って投稿し直す。", "Up to 5 posts per hour. Wait a bit and post again.")
  : e === "net" ? tr("サーバーにつながらない。少し待って投稿し直す。", "Couldn't reach the server. Try again in a moment.")
  : tr("この形では送れない。選び直す。", "This item can't be sent. Choose again.");
</script>

<template>
  <div data-daily-post class="daily-post">
    <button v-if="!sent" type="button" class="g-btn sm daily-post-back" data-daily-back @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
    <template v-if="sent">
      <h2 class="g-brush daily-post-title">{{ sent.status === "no" ? tr("投稿は通らなかった", "The post was rejected") : tr("箱に入った", "Added to the craft box") }}</h2>
      <p v-if="sent.status === 'no'" data-daily-post-why class="mb-4 text-[15px]">{{ sent.why === "bad-word" ? tr("名前か一言に使えない言葉がある。言葉を直して投稿し直す。", "The name or note has a banned word. Change it and post again.") : sent.why === "no-mods" ? tr("お題にできる MOD が無い。", "No usable mods.") : sent.why }}</p>
      <p v-else-if="sent.status === 'wait'" data-daily-post-wait class="mb-4 text-[15px]">{{ tr("16:00 に機械が確かめて、通れば箱のお題になる。段の下限は、元が T1 の MOD は T1、ほかは T2 以上になる。", "It's checked at 16:00 JST, and if it passes it becomes a challenge from the box. Tier floors become T1 for T1 mods and T2+ for the rest.") }}</p>
      <p v-else class="mb-4 text-[15px]">{{ tr("箱の投稿は 16:00 のお題に先に使われる。段の下限は、元が T1 の MOD は T1、ほかは T2 以上になる。", "Posts in the box are used first for the 16:00 challenge. Tier floors become T1 for T1 mods and T2+ for the rest.") }}</p>
      <button type="button" class="g-btn" data-daily-post-back @click="openDailyPage({ view: 'list' })">{{ tr("一覧へ", "To the list") }}</button>
    </template>
    <template v-else-if="item">
      <h2 class="g-brush daily-post-title">{{ tr("この形で投稿する", "Post this item") }}</h2>
      <div class="daily-veil">
        <img v-if="baseArt(item.base)" :src="baseArt(item.base)!" alt="" class="daily-veil-art open" />
        <div class="min-w-0">
          <p class="name daily-veil-name">{{ tr(item.baseJa, item.base) }}</p>
          <p class="text-[14px] opacity-70">{{ tr(`アイテムレベル ${item.ilvl}`, `Item level ${item.ilvl}`) }}</p>
        </div>
      </div>
      <!-- 狙いは完成形のカード (D-37e)。読めなかった行だけ文で下に -->
      <DailyAimCard v-if="item.aims.length" data-daily-post-aims class="mb-3" :base="item.base" :ilvl="item.ilvl" :aims="item.aims" />
      <ul v-if="item.bad.length" class="mb-3 text-[15px]">
        <li v-for="b in item.bad" :key="b.line" data-daily-post-bad class="py-0.5 text-[var(--exile-color-signal-down)]">{{ b.line }} ({{ b.why }})</li>
      </ul>
      <label class="mb-3 block text-[14px]">{{ tr("ひと言 (なくてもよい)", "A short note (optional)") }}
        <input v-model="note" data-daily-post-note type="text" maxlength="80" class="daily-input mt-1 w-full" />
      </label>
      <p v-if="sendFail" data-daily-post-fail class="mb-3 text-[14px] text-[var(--exile-color-signal-down)]">{{ failText(sendFail) }}</p>
      <p v-if="block" data-daily-post-block class="mb-3 text-[14px] text-[var(--exile-color-signal-down)]">{{ block }}</p>
      <div class="flex gap-2">
        <button type="button" class="g-btn" @click="item = null">{{ tr("選び直す", "Choose again") }}</button>
        <button type="button" class="g-btn-red" data-daily-post-send :disabled="!!block || sending" @click="send">{{ tr("投稿する", "Post") }}</button>
      </div>
    </template>
    <template v-else>
      <h2 class="g-brush daily-post-title">{{ tr("作ってほしい装備を投稿する", "Post an item to be crafted") }}</h2>
      <p class="daily-post-lead">{{ tr("投稿した装備は 16:00 に機械が確かめて、通ればクラフトボックスに入り、次のお題に先に使われる。下のどちらかから選ぶ。", "Posted items are checked at 16:00 JST. If they pass they go into the craft box and are used first for the next challenge. Pick one of the two below.") }}</p>
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
          <textarea v-model="text" data-daily-paste rows="6" spellcheck="false" class="daily-input w-full" :aria-label="tr('アイテムのコピー', 'Copied item text')" :placeholder="tr('アイテムのコピーをここに貼る', 'Paste the copied item here')" @paste="onPaste" />
          <p v-if="why" data-daily-paste-why class="mt-1 text-[14px] text-[var(--exile-color-signal-down)]">{{ why }}</p>
          <button type="button" class="g-btn mt-2" data-daily-paste-read :disabled="!text.trim()" @click="read(text)">{{ tr("読み込む", "Read item") }}</button>
        </section>
      </div>
    </template>
    <DailyNick v-if="asking" @done="asking = false; send()" @close="asking = false" />
  </div>
</template>
