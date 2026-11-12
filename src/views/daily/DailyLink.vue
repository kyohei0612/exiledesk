<!--
  DailyLink.vue — リンクの番号の窓 (D-52b、スイッチ dailyLinkNum)。数字だけで別の端末を同じ名前にする (QR は作らない)。
  mode = "show": 名前を持つ端末が 6 桁の番号を出す (10 分で切れる・1 回きり・出し直せる)。
  mode = "enter": もう 1 台が番号を打つ。もう別の名前を持っている端末は、入れ替える前に前の名前の引き継ぎコードを見せて確かめる。
  見た目は番号の札 6 枚が主役 (出す側も打つ側も同じ札)。残り時間は札の下の細い金の線 (赤い火は挑戦の残り時間だけ = D-60b)。
  オーナー 11-12「数字打たすか。PCIDに紐づいた奴で」「おｋ数字オンリーでおｋ」「UIおしゃれな感じにしてほしい」
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";
import { linkNew, linkUse, myNick, type DailyNick, type LinkError } from "./daily-api";

const props = defineProps<{ mode: "show" | "enter" }>();
const emit = defineEmits<{ close: []; linked: [DailyNick] }>();

const mode = ref(props.mode);
const fail = ref<LinkError | null>(null);
const busy = ref(false);
const WHY: Record<LinkError, () => string> = {
  nick: () => tr("この端末の名前がサーバーに無い。名前を決め直す", "This device's name isn't on the server. Choose a name again"),
  busy: () => (mode.value === "show" ? tr("番号を出しすぎた。少し待ってから出し直す", "Too many numbers made. Wait a while and try again") : tr("間違いが続いた。10 分待ってから打ち直す", "Too many wrong tries. Wait 10 minutes and try again")),
  wrong: () => tr("番号が違うか、もう切れている。もう 1 台で番号を出し直す", "That number is wrong or has expired. Make a new one on the other device"),
  off: () => tr("今はリンクを使えない。少し待ってからもう一度", "Linking isn't available right now. Try again in a moment"),
  net: () => tr("サーバーにつながらない。少し待ってもう一度押す", "Couldn't reach the server. Try again in a moment"),
};
const why = computed(() => (fail.value ? WHY[fail.value]() : ""));

// --- 番号を出す ---
const TTL = 10 * 60_000;
const num = ref<string | null>(null);
/** 切れる時刻 (この端末の時計に直した物。サーバーの時計とのずれは出した時に見ない = 残りは 10 分から数える) */
const endAt = ref(0);
const now = ref(Date.now());
const timer = setInterval(() => (now.value = Date.now()), 500);
onBeforeUnmount(() => clearInterval(timer));
const left = computed(() => Math.max(0, endAt.value - now.value));
const expired = computed(() => !!num.value && left.value <= 0);
const mmss = computed(() => { const s = Math.ceil(left.value / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; });
async function issue(): Promise<void> {
  if (busy.value) return;
  busy.value = true; fail.value = null;
  const r = await linkNew();
  busy.value = false;
  if (typeof r === "string") { fail.value = r; num.value = null; return; }
  num.value = r.num; endAt.value = Date.now() + TTL; now.value = Date.now();
}
onMounted(() => { if (mode.value === "show") void issue(); else void nextTick(() => field.value?.focus()); });
const me = computed(() => myNick());

// --- 番号を打つ ---
const typed = ref("");
const field = ref<HTMLInputElement | null>(null);
const digits = computed(() => Array.from({ length: 6 }, (_, i) => typed.value[i] ?? ""));
const full = computed(() => typed.value.length === 6);
function onType(e: Event): void {
  const el = e.target as HTMLInputElement;
  typed.value = el.value.normalize("NFKC").replace(/\D/g, "").slice(0, 6);
  el.value = typed.value;
  fail.value = null;
}
/** 入れ替えの確かめ (もう別の名前を持っている端末) を出している */
const asking = ref(false);
const copied = ref(false);
const done = ref<DailyNick | null>(null);
async function copyOld(): Promise<void> {
  try { await navigator.clipboard.writeText(me.value!.code); } catch { /* 手で写せる */ }
  copied.value = true;
}
async function link(confirmed = false): Promise<void> {
  if (!full.value || busy.value) return;
  if (me.value && !confirmed) { asking.value = true; return; }
  busy.value = true; fail.value = null;
  const r = await linkUse(typed.value);
  busy.value = false; asking.value = false;
  if (typeof r === "string") { fail.value = r; if (r === "wrong") { typed.value = ""; void nextTick(() => field.value?.focus()); } return; }
  done.value = r;
  emit("linked", r);
}
function toEnter(): void { mode.value = "enter"; fail.value = null; void nextTick(() => field.value?.focus()); }
const title = computed(() => (mode.value === "show" ? tr("ほかの端末とリンク", "Link another device") : tr("リンクの番号を入れる", "Enter a link number")));
</script>

<template>
  <ModalShell :open="true" :title="title" width="w-[460px] max-w-[94vw]" @close="emit('close')">
    <div data-daily-link :data-daily-link-mode="mode" class="daily-link">
      <!-- 番号を出す側 -->
      <template v-if="mode === 'show'">
        <p v-if="me" class="daily-link-who">{{ tr("名前", "Name") }} <b>{{ me.name }}</b></p>
        <ol class="daily-link-steps">
          <li>{{ tr("もう 1 台でデイリーを開く", "Open Daily on the other device") }}</li>
          <li>{{ tr("名前の所の「リンクの番号を入れる」を押す", "Tap \"Enter a link number\" next to the name") }}</li>
          <li>{{ tr("下の番号を打つ", "Type the number below") }}</li>
        </ol>
        <div class="daily-link-plates" :class="{ dead: expired || !num }" data-daily-link-num :aria-label="num ? tr(`リンクの番号 ${num}`, `Link number ${num}`) : undefined">
          <span v-for="(d, i) in (num ?? '······').split('')" :key="i" class="daily-link-plate" :class="{ gap: i === 3 }">{{ d }}</span>
        </div>
        <div class="daily-link-fuse" aria-hidden="true"><i :style="{ width: `${num ? (left / TTL) * 100 : 0}%` }"></i></div>
        <p class="daily-link-left" data-daily-link-left>
          <template v-if="expired">{{ tr("番号が切れた。出し直す", "This number has expired. Make a new one") }}</template>
          <template v-else-if="num">{{ tr(`あと ${mmss} で切れる。1 回使うと消える`, `Expires in ${mmss}. It works once`) }}</template>
          <template v-else-if="busy">{{ tr("番号を出している", "Making a number") }}</template>
        </p>
        <p v-if="why" data-daily-link-why class="daily-link-why">{{ why }}</p>
        <p class="daily-link-warn">{{ tr("この番号を人に見せると、名前を使われる。", "Anyone who sees this number can use your name.") }}</p>
        <div class="daily-link-foot">
          <button type="button" class="daily-link-sub" data-daily-link-to-enter @click="toEnter">{{ tr("この端末に番号を入れる", "Enter a number on this device") }}</button>
          <span class="flex gap-2">
            <button type="button" class="g-btn sm" data-daily-link-again :disabled="busy" @click="issue">{{ tr("番号を出し直す", "New number") }}</button>
            <button type="button" class="g-btn-red sm" data-daily-link-close @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
          </span>
        </div>
      </template>

      <!-- リンクできた -->
      <template v-else-if="done">
        <p class="daily-link-done" data-daily-link-done>{{ tr(`この端末は「${done.name}」になった。`, `This device is now "${done.name}".`) }}</p>
        <p class="daily-link-note">{{ tr("挑戦・提出・諦めは、同じ名前の端末みんなで 1 つ。", "Challenges, submissions and giving up are shared by every device with this name.") }}</p>
        <div class="daily-link-foot end"><button type="button" class="g-btn-red sm" data-daily-link-close @click="emit('close')">{{ tr("閉じる", "Close") }}</button></div>
      </template>

      <!-- 入れ替えの確かめ (もう別の名前を持っている端末) -->
      <template v-else-if="asking && me">
        <p class="daily-link-ask" data-daily-link-ask>{{ tr(`今の名前「${me.name}」は、この端末から外れる。`, `The current name "${me.name}" will be removed from this device.`) }}</p>
        <p class="daily-link-note">{{ tr("記録は消えないが、新しい名前とは合わさらない。後で戻すにはこの引き継ぎコードが要る。", "Its records stay, but they aren't merged into the new name. You need this transfer code to restore it later.") }}</p>
        <p class="daily-pass select-all text-center" data-daily-link-oldpass>{{ me.code }}</p>
        <div class="daily-link-foot">
          <button type="button" class="g-btn sm" data-daily-link-copy @click="copyOld">{{ copied ? tr("コピーした", "Copied") : tr("コードをコピー", "Copy code") }}</button>
          <span class="flex gap-2">
            <button type="button" class="g-btn sm" data-daily-link-ask-no @click="asking = false">{{ tr("やめる", "Cancel") }}</button>
            <button type="button" class="g-btn-red sm" data-daily-link-ask-yes :disabled="busy" @click="link(true)">{{ tr("リンクする", "Link") }}</button>
          </span>
        </div>
      </template>

      <!-- 番号を打つ側 -->
      <template v-else>
        <p class="daily-link-note">{{ tr("もう 1 台の「ほかの端末とリンク」に出ている 6 桁の数字。", "The 6 digits shown under \"Link another device\" on your other device.") }}</p>
        <label class="daily-link-plates entry" :class="{ full }" data-daily-link-entry>
          <span v-for="(d, i) in digits" :key="i" class="daily-link-plate" :class="{ gap: i === 3, cur: i === typed.length }">{{ d }}</span>
          <input ref="field" data-daily-link-input class="daily-link-field" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" :value="typed" :aria-label="tr('リンクの番号 (6 桁)', 'Link number (6 digits)')" @input="onType" @keydown.enter.prevent="link()" />
        </label>
        <p v-if="why" data-daily-link-why class="daily-link-why">{{ why }}</p>
        <div class="daily-link-foot end">
          <button type="button" class="g-btn sm" data-daily-link-close @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
          <button type="button" class="g-btn-red sm" data-daily-link-ok :disabled="!full || busy" @click="link()">{{ tr("リンクする", "Link") }}</button>
        </div>
      </template>
    </div>
  </ModalShell>
</template>
