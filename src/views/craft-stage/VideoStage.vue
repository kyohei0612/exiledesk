<!--
  VideoStage.vue — クラフトステージの動画モード (2026-09-27、ADR-001)

  オーナー:「動画モードを足して」。撮影 (POE2Tube / OBS) 用に、打った手 (か手順 JSON) を 16:9 の画面で 1 手ずつ見せる。
  - 1280×720 の枠を窓いっぱいに拡大 (1920×1080 の窓なら 1.5 倍)。アプリのサイドバーや操作欄は隠す
  - 左: アイテム (大きく、打った瞬間の演出つき)、右: 今使った物 (アイコン・名前・お告げ)・この手と累計の費用・最近の工程
  - 操作: Space 再生 / 一時停止、← → 1 手戻る / 進む、Home 最初、Esc 閉じる。操作欄はマウスを止めると消える (controls=0 なら出さない)
  テープは開いた時の工程の写し (打ち直しても変わらない)。演出は手で打つ画面と同じ [[use-stage-fx.ts]]。
  2026-09-28 オーナー「ゲームないみたいなつくまで道を描いて欲しい」: 1 手進む時は、棚 ([[VideoTray.vue]]) からカーソルが
  カレンシーを拾ってアイテムまで運び、押した瞬間に MOD が付く ([[use-video-hand.ts]])。戻る・最初へは一気に。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import StageItemCard from "./StageItemCard.vue";
import VideoTray from "./VideoTray.vue";
import { useStageFx } from "./use-stage-fx";
import { useVideoHand } from "./use-video-hand";
import { craftStage, iconOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";

const s = craftStage;
const opts = s.video.value ?? { from: 0, autoplay: false, controls: true };
const tape = [...s.log.value];
const start = tape[0]?.before ?? s.item.value!;
const idx = ref(Math.min(opts.from, tape.length));
const playing = ref(false);
const speed = ref(1);
const title = s.replay.value?.plan.title ?? `${start.baseJa} をクラフト`;

const item = computed(() => (idx.value === 0 ? start : tape[idx.value - 1]!.after));
const last = computed(() => (idx.value ? tape[idx.value - 1]! : null));
const recent = computed(() => tape.slice(Math.max(0, idx.value - 6), idx.value));
const money = (v: number) => displayCurrency.money(v);

/** 演出の位置 (アイテム枠の真ん中) */
const cardEl = ref<HTMLElement | null>(null);
const anchor = ref({ x: 0, y: 0 });
const fx = useStageFx(anchor, { count: () => idx.value, last: () => last.value });
const fxCls = computed(() => (fx.value ? { hit: "stage-hit", up: "stage-up", shake: "stage-shake" }[fx.value.kind] : ""));

/** 棚に並べる物 (工程で使うカレンシー等とお告げ。開示の手は棚を使わない) */
const trayKeys = [...new Set(tape.map((st) => st.out.currency).filter((c) => !c.startsWith("reveal:")))];
const trayOmens = [...new Set(tape.flatMap((st) => (st.out.omen ? st.out.omen.split("+") : [])))];
const frameEl = ref<HTMLElement | null>(null);
const hand = useVideoHand(frameEl, speed);

/**
 * n 手目へ。1 手進む時は手つきを見せてから付ける (押した瞬間に idx を進める)。戻る・飛ぶ時は一気に
 */
async function go(n: number): Promise<void> {
  const to = Math.max(0, Math.min(tape.length, n));
  if (to === idx.value + 1 && !hand.isBusy()) {
    await hand.play(tape[to - 1]!, cardEl.value, () => {
      anchor.value = hand.screenPoint();
      idx.value = to;
    });
  } else {
    hand.skip();
    const r = cardEl.value?.getBoundingClientRect();
    if (r) anchor.value = { x: r.x + r.width / 2, y: r.y + r.height / 3 };
    idx.value = to;
  }
  if (idx.value >= tape.length) playing.value = false;
}
/** 自動再生: 手つき → 付いた所を 1.3 秒見せる → 次 (速さで割る)。止めたら抜ける */
let loop = 0;
async function run(): Promise<void> {
  const me = ++loop;
  while (playing.value && me === loop && idx.value < tape.length) {
    await go(idx.value + 1);
    await new Promise((r) => setTimeout(r, 1300 / speed.value));
  }
  if (me === loop) playing.value = false;
}
function toggle(): void {
  if (idx.value >= tape.length) idx.value = 0;
  playing.value = !playing.value;
  if (playing.value) void run();
}
const close = () => (s.video.value = null);

/** 1280×720 を窓に合わせて拡大 (窓の大きさは ResizeObserver で追う。resize だけだと撮影側の画面サイズ指定を取りこぼす) */
const scale = ref(1);
const rootEl = ref<HTMLElement | null>(null);
// アプリ全体の表示倍率 (CSS zoom) が掛かっているので、見かけの大きさ (getBoundingClientRect) ではなく CSS の大きさで割る
const fit = () => { const el = rootEl.value; if (el) scale.value = Math.min(el.clientWidth / 1280, el.clientHeight / 720); };
let ro: ResizeObserver | undefined;
/** 操作欄はマウスを動かした時だけ */
const awake = ref(true);
let sleepTimer: ReturnType<typeof setTimeout> | undefined;
function poke(): void {
  awake.value = true;
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(() => (awake.value = false), 2000);
}
function onKey(e: KeyboardEvent): void {
  if (e.key === " ") { e.preventDefault(); toggle(); }
  else if (e.key === "ArrowRight") { playing.value = false; if (hand.isBusy()) hand.skip(); else void go(idx.value + 1); }
  else if (e.key === "ArrowLeft") { playing.value = false; void go(idx.value - 1); }
  else if (e.key === "Home") { playing.value = false; void go(0); }
  else if (e.key === "Escape") close();
  else if (!(e.ctrlKey || e.metaKey)) return; // Ctrl+Z (1 手戻す) などは後ろの画面に渡さない
  else e.preventDefault();
  e.stopPropagation();
}
onMounted(() => {
  fit();
  poke();
  ro = new ResizeObserver(fit);
  if (rootEl.value) ro.observe(rootEl.value);
  window.addEventListener("keydown", onKey, true);
  if (opts.autoplay) { playing.value = true; void run(); }
});
onBeforeUnmount(() => {
  loop++;
  hand.skip();
  clearTimeout(sleepTimer);
  ro?.disconnect();
  window.removeEventListener("keydown", onKey, true);
});
const btn = "rounded-lg border border-white/25 bg-black/60 px-3 py-1.5 hover:bg-white/10";
</script>

<template>
  <Teleport to="body">
    <div ref="rootEl" class="fixed inset-0 z-[400] grid place-items-center overflow-hidden bg-black" :class="awake ? '' : 'cursor-none'" @mousemove="poke">
      <div ref="frameEl" class="stage-video-bg relative h-[720px] w-[1280px] shrink-0 overflow-hidden text-[var(--exile-color-text-primary,#e8e2d6)]" :style="{ transform: `scale(${scale})` }">
        <!-- 見出しと進み -->
        <header class="absolute left-10 right-10 top-7 flex items-end justify-between">
          <div>
            <p class="text-[13px] tracking-[0.3em] text-amber-200/60">CRAFT STAGE</p>
            <h1 class="font-display text-[30px] tracking-[0.06em] text-amber-100">{{ title }}</h1>
          </div>
          <p class="text-[18px] tabular-nums text-white/70"><b class="text-[28px] text-white">{{ idx }}</b> / {{ tape.length }} 手</p>
        </header>

        <!-- アイテム -->
        <div class="absolute left-[60px] top-[120px] flex w-[640px] justify-center">
          <div ref="cardEl" class="relative origin-top scale-[1.3]" :class="fxCls" :style="fx ? { '--fx': fx.color } : undefined">
            <StageItemCard :item="item" :added="last?.added ?? []" :removed="last?.removed ?? []" :holding="false" :flash-key="idx" />
            <span v-if="fx?.text" :key="fx.n" class="stage-float" :class="fx.kind === 'shake' ? 'text-sm' : 'text-2xl'">{{ fx.text }}</span>
          </div>
        </div>

        <!-- 開示の候補 (アイテムの上に出して、選ぶ物を点ける) -->
        <div v-if="hand.reveal.value" class="stage-row-in absolute left-[110px] top-[260px] z-20 w-[540px] space-y-2 rounded-2xl border border-rose-400/50 bg-black/85 p-4 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
          <p class="text-[15px] font-bold text-rose-200">開示する — 1 つ選ぶ</p>
          <div
            v-for="(m, i) in hand.reveal.value.offers"
            :key="m.modId + i"
            class="flex items-center justify-between rounded-xl border px-4 py-2 text-[17px] transition-all duration-200"
            :class="hand.reveal.value.lit === i ? 'scale-[1.04] border-rose-300 bg-rose-500/25 text-white shadow-[0_0_18px_rgba(244,63,94,0.6)]' : 'border-white/10 bg-black/40 text-[#e0a0a0]'"
          >
            <span>{{ m.textJa }}</span>
            <span class="text-[12px] opacity-60">{{ m.side === "prefix" ? "プレ" : "サフィ" }} {{ m.tierName }}</span>
          </div>
        </div>

        <!-- 棚 (カーソルがここから拾う) -->
        <VideoTray :keys="trayKeys" :omens="trayOmens" :held="hand.hand.held" :armed="hand.armed.value" :spent="hand.spent.value" :slots="hand.slots" />

        <!-- カーソル (横と縦で動き方を変えて弧を描く) -->
        <div v-if="hand.hand.visible" class="pointer-events-none absolute left-0 top-0 z-30" :style="{ transform: `translateX(${hand.hand.x}px)`, transition: `transform ${hand.hand.dur}ms cubic-bezier(0.45, 0.05, 0.3, 1)` }">
          <div :style="{ transform: `translateY(${hand.hand.y}px)`, transition: `transform ${hand.hand.dur}ms cubic-bezier(0.15, 0.7, 0.35, 1)` }">
            <img v-if="hand.hand.held && iconOf(hand.hand.held)" :src="iconOf(hand.hand.held)" alt="" class="absolute left-2 top-3 h-12 w-12 object-contain drop-shadow-[0_0_10px_rgba(250,204,21,0.7)]" />
            <span v-if="hand.hand.hint" class="absolute left-7 top-5 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[11px] text-orange-200">{{ hand.hand.hint }}</span>
            <svg :key="hand.hand.press" class="stage-press relative h-7 w-7 drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]" viewBox="0 0 24 24">
              <path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.3 L17.5 13.3 Z" fill="#f5efe2" stroke="#1a140c" stroke-width="1.4" stroke-linejoin="round" />
            </svg>
          </div>
        </div>

        <!-- 今使った物 -->
        <aside class="absolute right-10 top-[120px] w-[460px] space-y-4">
          <div :key="'u' + idx" class="stage-row-in flex min-h-[112px] items-center gap-4 rounded-2xl border border-amber-300/25 bg-black/50 px-5 py-4">
            <template v-if="last">
              <img v-if="iconOf(last.out.currency)" :src="iconOf(last.out.currency)" alt="" class="h-20 w-20 object-contain drop-shadow-[0_0_14px_rgba(250,204,21,0.45)]" />
              <div class="min-w-0">
                <p class="text-[26px] font-bold leading-tight text-amber-100">{{ last.out.currency_ja }}</p>
                <p v-if="last.out.omen_ja" class="mt-1 text-[15px] text-violet-300">+ {{ last.out.omen_ja }}</p>
              </div>
            </template>
            <p v-else class="text-[20px] text-white/60">白のアイテムから始めます</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="rounded-2xl border border-white/10 bg-black/40 px-5 py-3">
              <p class="text-[13px] text-white/50">この手</p>
              <p class="text-[22px] font-bold tabular-nums">{{ last && last.out.cost.subtotal ? money(last.out.cost.subtotal) : "—" }}</p>
            </div>
            <div class="rounded-2xl border border-amber-300/30 bg-black/40 px-5 py-3">
              <p class="text-[13px] text-amber-200/70">累計</p>
              <p class="text-[22px] font-bold tabular-nums text-amber-100">{{ money(last?.out.cost.cumulative ?? 0) }}</p>
            </div>
          </div>
          <ol class="space-y-1.5">
            <li v-for="st in recent" :key="st.out.index" class="flex items-center gap-2 rounded-xl bg-black/35 px-3 py-1.5 text-[14px]" :class="st.out.index === idx ? 'stage-row-in ring-1 ring-amber-300/40' : 'opacity-60'">
              <span class="w-6 text-right tabular-nums text-white/50">{{ st.out.index }}</span>
              <img v-if="iconOf(st.out.currency)" :src="iconOf(st.out.currency)" alt="" class="h-6 w-6 object-contain" />
              <span class="shrink-0 font-bold">{{ st.out.currency_ja }}</span>
              <span class="truncate text-emerald-300">{{ st.added[0] ? `+ ${st.added[0].textJa}` : st.removed[0] ? "" : "" }}</span>
            </li>
          </ol>
        </aside>

        <!-- 進みの棒 -->
        <div class="absolute bottom-6 left-10 right-10 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-200 transition-[width] duration-500" :style="{ width: `${tape.length ? (idx / tape.length) * 100 : 0}%` }" />
        </div>
      </div>

      <!-- 操作 (マウスを止めると消える) -->
      <div v-if="opts.controls" class="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 text-[13px] text-white transition-opacity duration-300" :class="awake ? 'opacity-100' : 'pointer-events-none opacity-0'">
        <button type="button" :class="btn" title="最初 (Home)" @click="playing = false; void go(0)">⏮</button>
        <button type="button" :class="btn" title="1 手戻る (←)" @click="playing = false; void go(idx - 1)">◀</button>
        <button type="button" :class="btn" class="min-w-[88px]" title="再生 / 一時停止 (Space)" @click="toggle()">{{ playing ? "⏸ 止める" : "▶ 再生" }}</button>
        <button type="button" :class="btn" title="1 手進む (→)" @click="playing = false; hand.isBusy() ? hand.skip() : void go(idx + 1)">▶|</button>
        <button v-for="v in [0.5, 1, 2]" :key="v" type="button" :class="[btn, speed === v ? 'ring-1 ring-amber-300' : '']" @click="speed = v">×{{ v }}</button>
        <button type="button" :class="btn" title="閉じる (Esc)" @click="close()">閉じる</button>
      </div>

      <!-- 押した所の波紋と、吸い込まれるアイコン (手で打つ画面と同じ) -->
      <template v-if="fx && fx.kind !== 'shake'">
        <span :key="'r' + fx.n" class="stage-ripple" :style="{ left: `${fx.x}px`, top: `${fx.y}px`, '--fx': fx.color }" />
        <img v-if="fx.icon" :key="'d' + fx.n" :src="fx.icon" alt="" class="stage-drop object-contain" :style="{ left: `${fx.x}px`, top: `${fx.y}px` }" />
      </template>
    </div>
  </Teleport>
</template>
