<script setup lang="ts">
/**
 * ChallengePanel.vue — 今日のお題のページ (Web 版、/challenge か ?challenge。docs/craft-challenge.md「画面の流れ」、2026-10-16 土台)。
 * 開く (お題は伏せる・ニックネーム・挑戦した人数・昨日の上位と沼) → 挑戦する (お題が出て時間が始まる・初手のフラクチャー)
 * → 打つ (上の帯に時間・手数・費用・リセットの残り・狙いのチェック、下はいつものエミュレーター) → 達成 (すぐ送って順位)。
 * 打つ所はクラフトステージ (CraftStage.vue の challenge モード) をそのまま使う
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import CraftStage from "../views/craft-stage/CraftStage.vue";
import { craftStage } from "../state/craft-stage";
import { challenge as c, NICK_MAX, nickProblem, type Board, type BoardRow } from "../state/challenge";
import { CHALLENGE_RESETS } from "../services/challenge/daily";
import { swampTotal } from "../services/challenge/swamp";
import { hits } from "../services/craft-stage/aim-odds";
import { displayCurrency } from "../state/display-currency";
import { baseNameOf, tr } from "../i18n/lang";

defineEmits<{ close: [] }>();

/** 画面の時計 (1 秒ごと。順位の時間はサーバーが測る) */
const now = ref(Date.now());
let tick = 0;
onMounted(() => { tick = window.setInterval(() => { now.value = Date.now(); }, 1000); void c.loadBoard(); });
onBeforeUnmount(() => { window.clearInterval(tick); c.leave(); });
const clock = (ms: number): string => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const elapsed = computed(() => (c.startedAt.value ? now.value - c.startedAt.value : 0));

const nickWhy = computed(() => {
  const p = nickProblem(c.nick.value);
  return p === "long" ? tr(`${NICK_MAX} 字まで`, `Up to ${NICK_MAX} characters`) : p === "url" ? tr("URL は使えません", "URLs are not allowed") : null;
});
/** 狙い 1 つずつ揃っているか */
const targetOk = computed(() => {
  const it = craftStage.item.value, d = c.daily.value;
  return d?.targets.map((t) => !!it && [...it.prefixes, ...it.suffixes].some((m) => hits(m, t))) ?? [];
});
const confirmReset = ref(false);
const confirmQuit = ref(false);
/** 順位の表: 今日 / 昨日 */
const which = ref<"today" | "yesterday">("today");
const shown = computed<Board | null>(() => (which.value === "today" ? c.board.value : c.yesterday.value));
const shownDay = computed(() => (which.value === "today" ? c.day.value : new Date(Date.parse(`${c.day.value}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10)));
const canWatchRow = computed(() => which.value === "yesterday" || c.canWatch.value);
const openSwamp = ref<string | null>(null);
const swampLine = (r: BoardRow): string => tr(
  `カオス沼 ${r.swamp.chaos} · 削減沼 ${r.swamp.whittle} · 消去沼 ${r.swamp.annul} · 振り出し ${r.swamp.resets}`,
  `Chaos ${r.swamp.chaos} · Whittling ${r.swamp.whittle} · Annulment ${r.swamp.annul} · Restarts ${r.swamp.resets}`,
);
const playing = computed(() => c.phase.value !== "intro" || !!c.watching.value);
const ERR_EN: Record<string, string> = {
  "今日のお題ではない": "Not today's challenge",
  "挑戦が見つからない (始め直してください)": "Run not found (please start again)",
  "もう送ってある": "Already submitted",
  "今日の手順は達成してから": "Clear today's challenge first to see today's steps",
  "ニックネームが使えない": "This nickname can't be used",
};
const errText = computed(() => (c.error.value ? tr(c.error.value, ERR_EN[c.error.value] ?? c.error.value) : null));
</script>

<template>
  <div class="min-w-0 flex-1">
    <!-- 開く / 達成の後: お題は伏せたまま。順位と沼 -->
    <div v-if="!playing" class="p-4">
      <h1 class="g-tabbar g-brush mb-3 flex items-center px-8 text-[22px] tracking-[0.18em] text-[var(--exile-color-text-title)]">{{ tr("今日のお題", "Daily Challenge") }}<span class="ml-2 text-[11px] font-normal tracking-normal opacity-60">{{ tr("仮の名前", "name assumed") }}</span></h1>
      <section class="g-panel mx-auto max-w-[880px] space-y-4 p-4 text-[13px]">
        <div class="flex flex-wrap items-end gap-3">
          <label class="flex min-w-0 flex-col gap-1">
            <span class="text-[12px] opacity-70">{{ tr("ニックネーム", "Nickname") }}</span>
            <input :value="c.nick.value" type="text" maxlength="40" class="w-[220px] max-w-full rounded border border-white/20 bg-black/40 px-2 py-1.5" :placeholder="tr(`${NICK_MAX} 字まで`, `Up to ${NICK_MAX} characters`)" @input="c.nick.value = ($event.target as HTMLInputElement).value" @change="c.setNick(c.nick.value)" />
          </label>
          <button type="button" class="g-btn min-w-[160px]" :disabled="!!nickProblem(c.nick.value) || !c.daily.value || c.sending.value" @click="c.start()">{{ c.daily.value ? tr("挑戦する", "Start") : tr("読み込み中…", "Loading…") }}</button>
          <span v-if="c.board.value" class="tabular-nums opacity-70">{{ tr(`今日の挑戦 ${c.board.value.players} 人`, `${c.board.value.players} players today`) }}</span>
          <button type="button" class="g-btn sm ml-auto" @click="$emit('close')">{{ tr("クラフトステージへ", "To Craft Stage") }}</button>
        </div>
        <p v-if="nickWhy" class="text-[12px] text-amber-300">{{ nickWhy }}</p>
        <p v-if="errText" class="text-[12px] text-rose-300">{{ errText }}</p>
        <p class="text-[11px] opacity-60">{{ tr("押すとお題が出て時間が始まります。乱数はその日全員同じ。", "The challenge is revealed and the clock starts when you press Start. Everyone gets the same RNG today.") }}</p>

        <!-- 達成した時の結果 -->
        <div v-if="c.result.value" class="rounded border border-emerald-400/40 bg-emerald-500/10 px-3 py-2">
          <b class="text-emerald-200">{{ tr("達成", "Cleared") }}</b>
          <span class="ml-2 tabular-nums">{{ displayCurrency.money(c.result.value.cost) }} · {{ tr(`${c.result.value.steps} 手`, `${c.result.value.steps} steps`) }}<template v-if="c.result.value.ms != null"> · {{ clock(c.result.value.ms) }}</template></span>
          <span v-if="c.result.value.rank" class="ml-2 font-bold text-amber-100">{{ tr(`${c.result.value.rank} 位`, `#${c.result.value.rank}`) }}</span>
          <span v-if="c.result.value.best === false" class="ml-2 text-[11px] opacity-60">{{ tr("(自分の一番の記録は前の方)", "(your earlier record is better)") }}</span>
          <span v-if="c.sending.value" class="ml-2 text-[11px] opacity-60">{{ tr("送っています…", "Sending…") }}</span>
          <span class="ml-2 text-[11px] opacity-70">{{ tr(`沼 ${swampTotal(c.result.value.swamp)}`, `Swamp ${swampTotal(c.result.value.swamp)}`) }}</span>
        </div>

        <!-- 順位 (今日 / 昨日) -->
        <div>
          <div class="mb-2 flex flex-wrap items-center gap-1.5">
            <button v-for="t in (['today', 'yesterday'] as const)" :key="t" type="button" class="g-tab" :class="which === t ? 'on' : ''" @click="which = t">{{ t === "today" ? tr("今日", "Today") : tr("昨日", "Yesterday") }}</button>
            <span class="ml-auto text-[11px] opacity-60">{{ tr("順位: 費用 → 手数 → 時間 (仮: 何回でも挑戦でき、一番の記録で並ぶ)", "Ranking: cost → steps → time (assumed: unlimited attempts, best record counts)") }}</span>
          </div>
          <p v-if="!shown || !shown.rows.length" class="py-3 text-center opacity-60">{{ tr("まだ誰も達成していません", "No one has cleared it yet") }}</p>
          <table v-else class="w-full table-fixed text-left tabular-nums">
            <thead class="text-[11px] opacity-60"><tr><th class="w-10">#</th><th>{{ tr("名前", "Name") }}</th><th class="w-28">{{ tr("費用", "Cost") }}</th><th class="w-16">{{ tr("手数", "Steps") }}</th><th class="w-16">{{ tr("時間", "Time") }}</th><th class="w-16">{{ tr("沼", "Swamp") }}</th><th class="w-20" /></tr></thead>
            <tbody>
              <template v-for="(r, i) in shown.rows" :key="r.id">
                <tr :class="[i % 2 ? 'bg-white/[0.03]' : '', r.me ? 'text-amber-100' : '']">
                  <td>{{ r.pos }}</td>
                  <td class="min-w-0 truncate">{{ r.nick }}</td>
                  <td>{{ displayCurrency.money(r.cost) }}</td>
                  <td>{{ r.steps }}</td>
                  <td>{{ clock(r.ms) }}</td>
                  <td><button type="button" class="g-plain underline-offset-2 hover:underline" @click="openSwamp = openSwamp === r.id ? null : r.id">{{ swampTotal(r.swamp) }}</button></td>
                  <td><button v-if="canWatchRow" type="button" class="g-btn sm" @click="c.watch(shownDay, r)">{{ tr("手順", "Steps") }}</button></td>
                </tr>
                <tr v-if="openSwamp === r.id"><td /><td colspan="6" class="pb-1 text-[11px] opacity-70">{{ swampLine(r) }}</td></tr>
              </template>
            </tbody>
          </table>
          <p v-if="shown?.me && !shown.rows.some((r) => r.me)" class="mt-1 text-[12px] text-amber-100 tabular-nums">{{ tr(`自分: ${shown.me.pos} 位`, `You: #${shown.me.pos}`) }} · {{ displayCurrency.money(shown.me.cost) }} · {{ tr(`${shown.me.steps} 手`, `${shown.me.steps} steps`) }}</p>
          <p v-if="which === 'today' && !c.canWatch.value && shown?.rows.length" class="mt-1 text-[11px] opacity-60">{{ tr("今日の手順は 1 回達成すると見られます", "Clear today's challenge once to see today's steps") }}</p>
        </div>

        <!-- 沼ランキング -->
        <div v-if="shown?.swamp.length">
          <h3 class="g-sec-head mb-1">{{ tr("沼ランキング", "Swamp ranking") }}</h3>
          <ol class="space-y-0.5 text-[12px]">
            <li v-for="r in shown.swamp" :key="r.id" class="flex min-w-0 gap-2 text-left" :class="r.me ? 'text-amber-100' : ''"><span class="w-6 tabular-nums">{{ r.pos }}</span><span class="min-w-0 flex-1 truncate">{{ r.nick }}</span><span class="tabular-nums">{{ swampTotal(r.swamp) }}</span><span class="max-md:hidden truncate opacity-60">{{ swampLine(r) }}</span></li>
          </ol>
        </div>
      </section>
    </div>

    <!-- 挑戦中・上位の手順を見ている時: いつものエミュレーター (お題のモード) -->
    <CraftStage v-else challenge class="min-w-0 flex-1 !h-auto !overflow-visible" @leave-replay="c.stopWatching()">
      <template #replay-title>
        <b class="text-sky-200">{{ tr(`${c.watching.value?.nick ?? ""} の手順`, `${c.watching.value?.nick ?? ""}'s steps`) }}</b>
      </template>
      <template #challenge>
        <section v-if="c.daily.value" class="g-panel mb-4 space-y-2 px-3 py-2 text-[13px]">
          <!-- 上の帯: ベース・時間・手数・費用・リセットの残り -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
            <b class="min-w-0 truncate text-[var(--exile-color-text-title)]">{{ craftStage.item.value ? baseNameOf(craftStage.item.value) : c.daily.value.base }}</b>
            <span>{{ tr("時間", "Time") }} {{ clock(elapsed) }}</span>
            <span>{{ tr(`${craftStage.log.value.length} 手`, `${craftStage.log.value.length} steps`) }}</span>
            <span>{{ tr("費用", "Cost") }} {{ displayCurrency.money(craftStage.total.value) }}<span class="ml-1 text-[10px] opacity-60" :title="tr('値段は今の相場 (1 時間ごとに変わる)。日ごとに固定するかは未定', 'Prices are the current market (updated hourly). Whether to fix them per day is undecided')">{{ tr("仮", "assumed") }}</span></span>
            <span>{{ tr(`沼 ${swampTotal(c.swamp.value)}`, `Swamp ${swampTotal(c.swamp.value)}`) }}</span>
            <span class="ml-auto flex items-center gap-1.5">
              <template v-if="c.phase.value === 'play'">
                <button v-if="!confirmReset" type="button" class="g-btn sm" :disabled="c.resetsLeft.value <= 0" @click="confirmReset = true">{{ tr(`0 手目へ (残り ${c.resetsLeft.value}/${CHALLENGE_RESETS})`, `Restart (${c.resetsLeft.value}/${CHALLENGE_RESETS} left)`) }}</button>
                <template v-else>
                  <span class="text-[12px]">{{ tr("0 手目へ戻す? 時間は止まりません", "Back to step 0? The clock keeps running") }}</span>
                  <button type="button" class="g-btn sm" @click="confirmReset = false; c.fullReset()">{{ tr("戻す", "Restart") }}</button>
                  <button type="button" class="g-btn sm" @click="confirmReset = false">{{ tr("やめておく", "Cancel") }}</button>
                </template>
              </template>
              <template v-if="c.phase.value !== 'done'">
                <button v-if="!confirmQuit" type="button" class="g-btn sm" @click="confirmQuit = true">{{ tr("やめる", "Quit") }}</button>
                <template v-else>
                  <span class="text-[12px]">{{ tr("やめる? 記録は残りません", "Quit? This run won't be recorded") }}</span>
                  <button type="button" class="g-btn sm" @click="confirmQuit = false; c.giveUp()">{{ tr("やめる", "Quit") }}</button>
                  <button type="button" class="g-btn sm" @click="confirmQuit = false">{{ tr("続ける", "Continue") }}</button>
                </template>
              </template>
              <button v-else type="button" class="g-btn sm" @click="c.again()">{{ tr("順位を見る", "See ranking") }}</button>
            </span>
          </div>
          <!-- 狙い (揃ったらチェック)。初手はここから 1 つ選んでフラクチャー -->
          <p v-if="c.phase.value === 'fracture'" class="text-[12px] text-amber-200">{{ tr("初手: フラクチャーで始める MOD を 1 つ選ぶ (0 手目)", "First move: pick one mod to start with as fractured (step 0)") }}</p>
          <ul class="space-y-1">
            <li v-for="(t, i) in c.daily.value.targets" :key="t.modId" class="flex min-w-0 items-center gap-2 text-left">
              <span class="grid size-5 shrink-0 place-items-center rounded-full text-[11px]" :class="targetOk[i] ? 'bg-emerald-500/30 text-emerald-100' : 'bg-white/10 opacity-60'">{{ targetOk[i] ? "✓" : "" }}</span>
              <span class="shrink-0 text-[11px] opacity-60">{{ t.side === "prefix" ? tr("プレ", "Prefix") : tr("サフィ", "Suffix") }} {{ t.rank }}+</span>
              <span class="min-w-0 flex-1 truncate">{{ t.text }}</span>
              <button v-if="c.phase.value === 'fracture'" type="button" class="g-btn sm shrink-0" @click="c.chooseFracture(t)">{{ tr("これで始める", "Start with this") }}</button>
            </li>
          </ul>
          <p v-if="c.phase.value === 'done'" class="text-[12px] text-emerald-200">{{ tr("達成", "Cleared") }} · {{ c.sending.value ? tr("送っています…", "Sending…") : c.result.value?.rank ? tr(`${c.result.value.rank} 位`, `#${c.result.value.rank}`) : "" }}</p>
          <p v-if="errText" class="text-[12px] text-rose-300">{{ errText }}</p>
        </section>
      </template>
    </CraftStage>
  </div>
</template>
