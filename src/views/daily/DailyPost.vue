<!--
  DailyPost.vue — お題の投稿 (D-11〜D-15)。エミュはタブへ移らず、このページの中で開いて作る (D-12、?page=daily&q=post-emu)。口は 2 か所: 上 = エミュのアイテム、下 = poe.ninja / トレード / ゲームのコピーを貼る欄 (読みは 1 つ)。
  どちらも同じ確かめの画面へ。投稿は機械が確かめて、通れば箱へ、落ちれば訳を出す (D-20)。サーバーの口 (daily-api → POST /daily/box) へ送り、16:00 の台本がもう一度確かめる
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../components/art/base-art";
import { craftStage as s } from "../../state/craft-stage";
import { emuPostAsk } from "../../state/emulator/to-daily";
import { clearPostItem, loadPostItem, POST_OWN, postItem } from "../../state/emulator/post-slot";
import { goDaily } from "./daily-open";
import { itemFromEmu, itemFromText, postBlock, type PostItem } from "./daily-aims";
import { myNick, postBox, type BoxError, type DailyBoxItem } from "./daily-api";
import { fullMods, genesisWhy } from "./daily-check";
import { allMods } from "../../services/craft-stage/engine";
import DailyAimCard from "./DailyAimCard.vue";
import DailyNick from "./DailyNick.vue";
import CraftStage from "../craft-stage/CraftStage.vue";

/** inEmu = このページの中でエミュを開いている (D-12)。中はいつものエミュの画面そのまま、上にデイリーの帯 1 本 */
const props = defineProps<{ inEmu?: boolean }>();

const item = ref<PostItem | null>(null);
const why = ref<string | null>(null);
const text = ref("");
const note = ref("");
const sent = ref<DailyBoxItem | null>(null);
const asking = ref(false);

/** フル MOD でない品の断り (送る前の block と、サーバーの not-full の返りで同じ文) */
const notFull = (): string => tr("MOD の数がそのベースのプレ・サフィの上限の合計以上の品だけ投稿できる", "Only items with at least as many mods as the base allows (prefix + suffix limits) can be posted");
/** ① の口の品。スイッチ dailyPostOwnItem の下では投稿の中のエミュで作った品 (エミュのタブとは別の品、D-12b)、閉じている間はエミュのタブの品 */
const emu = computed(() => { const i = POST_OWN ? postItem.value : s.item.value; return i && allMods(i).length ? i : null; });
/** 弾く訳 (D-14)。フル MOD でない品も送る前に止める (D-84、確かめの boxCheck と同じ fullMods) */
const block = computed(() => {
  const p = item.value, d = s.data.value;
  if (!p) return null;
  return postBlock(p) ?? (d && !fullMods(d, p.base, p.aims) ? notFull() : null);
});
/** 中のエミュの品を持って確かめの画面へ (D-12) */
const takeEmu = (): void => { useEmu(); goDaily({ view: "detail", q: "post" }); };
const useEmu = (it = emu.value): void => { const d = s.data.value; if (d && it) { why.value = null; redoWhy.value = null; item.value = itemFromEmu(d, it); } };
/** 確かめの画面の品を投稿の中のエミュに載せて作り直す (D-12b)。段は同じ・値は振り直し・工程は空から。載せられない組は訳を出して動かない */
const redoWhy = ref<string | null>(null);
function redo(): void {
  const p = item.value;
  if (!p) return;
  const r = loadPostItem(p.base, p.ilvl, p.start);
  if (r) { redoWhy.value = tr(`この形はエミュレーターに載せられない (${r})`, `This item can't be loaded into the Emulator (${r})`); return; }
  redoWhy.value = null;
  goDaily({ view: "detail", q: "post-emu" });
}
/** エミュの「デイリーに投稿 →」から来た時は、今の品で確かめの画面へ直行 (D-10)。合図はここで下ろす */
watch(emuPostAsk, (v) => { if (v) { emuPostAsk.value = false; if (!props.inEmu) { const t = s.item.value; useEmu(POST_OWN ? (t && allMods(t).length ? t : null) : emu.value); } } }, { immediate: true }); // 合図の時はエミュのタブの品 (置き場はまだ emu)
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
  if (typeof r === "string") sendFail.value = r; else { sendFail.value = null; sent.value = r; if (POST_OWN) clearPostItem(); void nextTick(() => window.scrollTo(0, 0)); } // 送れた後の文は頭に出るので、頭へ送る (D-15b)
}
const failText = (e: BoxError): string =>
  e === "busy" ? tr("投稿は 1 時間に 5 件まで。少し待って投稿し直す。", "Up to 5 posts per hour. Wait a bit and post again.")
  : e === "net" ? tr("サーバーにつながらない。少し待って投稿し直す。", "Couldn't reach the server. Try again in a moment.")
  : tr("この形では送れない。選び直す。", "This item can't be sent. Choose again.");
</script>

<template>
  <div v-if="props.inEmu" data-daily-post-emu class="daily-post-emu">
    <div class="daily-post-emu-bar">
      <p class="min-w-0 flex-1">{{ tr("投稿する品をエミュレーターで作る。MOD を付けたら「この品で投稿へ」。", "Craft the item to post in the Emulator. Once it has mods, press \"Post this item\".") }}</p>
      <button type="button" class="g-btn sm" data-daily-post-emu-back @click="goDaily({ view: 'detail', q: 'post' })">{{ tr("投稿へ戻る", "Back to posting") }}</button>
      <button type="button" class="g-btn-red sm" data-daily-post-emu-take :disabled="!emu" :title="emu ? undefined : tr('MOD を付けると押せる', 'Add mods first')" @click="takeEmu()">{{ tr("この品で投稿へ", "Post this item") }}</button>
    </div>
    <CraftStage class="min-w-0 !h-auto !overflow-visible" />
  </div>
  <div v-else data-daily-post class="daily-post">
    <button v-if="!sent && !(POST_OWN && item)" type="button" class="g-btn sm daily-post-back" data-daily-back @click="goDaily({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
    <template v-if="sent">
      <h2 class="g-brush daily-post-title">{{ sent.status === "no" ? tr("投稿は通らなかった", "The post was rejected") : tr("箱に入った", "Added to the craft box") }}</h2>
      <p v-if="sent.status === 'no'" data-daily-post-why class="mb-4 text-[15px]">{{ sent.why === "bad-word" ? tr("名前か一言に使えない言葉がある。言葉を直して投稿し直す。", "The name or note has a banned word. Change it and post again.") : sent.why === "not-full" ? notFull() : sent.why === "no-mods" ? tr("お題にできる MOD が無い。", "No usable mods.") : sent.why === "genesis-2" ? genesisWhy() : sent.why }}</p>
      <p v-else-if="sent.status === 'wait'" data-daily-post-wait class="mb-4 text-[15px]">{{ tr("16:00 に機械が確かめて、通れば箱のお題になる。段の下限は全部 T3 以上になる。", "It's checked at 16:00 JST, and if it passes it becomes a challenge from the box. Every mod's tier floor becomes T3+.") }}</p>
      <p v-else class="mb-4 text-[15px]">{{ tr("箱の投稿は 16:00 のお題に先に使われる。段の下限は全部 T3 以上になる。", "Posts in the box are used first for the 16:00 challenge. Every mod's tier floor becomes T3+.") }}</p>
      <button type="button" class="g-btn" data-daily-post-back @click="goDaily({ view: 'list' })">{{ tr("一覧へ", "To the list") }}</button>
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
      <p v-if="redoWhy" data-daily-post-redo-why class="mb-3 text-[14px] text-[var(--exile-color-signal-down)]">{{ redoWhy }}</p>
      <div class="flex flex-wrap gap-2">
        <button v-if="!POST_OWN" type="button" class="g-btn" @click="item = null">{{ tr("選び直す", "Choose again") }}</button>
        <button v-if="POST_OWN" type="button" class="g-btn" data-daily-back @click="goDaily({ view: 'list' })">{{ tr("一覧へ戻る", "Back to the list") }}</button>
        <button v-if="POST_OWN" type="button" class="g-btn" data-daily-post-redo :title="tr('この品をデイリーの中のエミュレーターに載せて作り替える (エミュレーターのタブの品は変わらない)', 'Load this item into the Emulator inside Daily and rework it (your Emulator tab item is untouched)')" @click="redo">{{ tr("エミュレーターで作り直す", "Rework in the Emulator") }}</button>
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
            <p class="mb-3 text-[14px]">{{ tr(`${emu.baseJa}、MOD ${allMods(emu).length} つ`, `${emu.base}, ${allMods(emu).length} mods`) }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="g-btn" data-daily-use-emu @click="useEmu()">{{ tr("このアイテムを使う", "Use this item") }}</button>
              <button type="button" class="g-btn" data-daily-go-emu @click="goDaily({ view: 'detail', q: 'post-emu' })">{{ tr("エミュレーターで作り直す", "Craft more in the Emulator") }}</button>
            </div>
          </template>
          <template v-else>
            <p class="mb-3 text-[14px] opacity-70">{{ tr("MOD の付いたアイテムがまだ無い。", "No item with mods yet.") }}</p>
            <button type="button" class="g-btn" data-daily-go-emu @click="goDaily({ view: 'detail', q: 'post-emu' })">{{ tr("エミュレーターで作る", "Craft in the Emulator") }}</button>
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
