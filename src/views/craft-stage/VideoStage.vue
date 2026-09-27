<!--
  VideoStage.vue — クラフトステージの動画モード (2026-09-27、ADR-001)

  オーナー:「動画モードを足して」。撮影 (POE2Tube / OBS) 用に、打った手 (か手順 JSON) を 16:9 の画面で 1 手ずつ見せる。
  - 1280×720 の枠を窓いっぱいに拡大 (1920×1080 の窓なら 1.5 倍)。アプリのサイドバーや操作欄は隠す
  - 左: アイテム (大きく、打った瞬間の演出つき)、右: 今使った物 (アイコン・名前・お告げ)・この手と累計の費用・最近の工程
  - 操作: Space 再生 / 一時停止、← → 1 手戻る / 進む、Home 最初、Esc 閉じる。操作欄はマウスを止めると消える (controls=0 なら出さない)
  テープは開いた時の工程の写し (打ち直しても変わらない)。演出は手で打つ画面と同じ [[use-stage-fx.ts]]。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import StageItemCard from "./StageItemCard.vue";
import { useStageFx } from "./use-stage-fx";
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

function go(n: number): void {
  const r = cardEl.value?.getBoundingClientRect();
  if (r) anchor.value = { x: r.x + r.width / 2, y: r.y + r.height / 3 };
  idx.value = Math.max(0, Math.min(tape.length, n));
  if (idx.value >= tape.length) playing.value = false;
}
/** 自動再生: 1 手 1.8 秒 (速さで割る) */
let timer: ReturnType<typeof setTimeout> | undefined;
function tick(): void {
  clearTimeout(timer);
  if (!playing.value) return;
  timer = setTimeout(() => {
    if (!playing.value) return;
    go(idx.value + 1);
    tick();
  }, 1800 / speed.value);
}
function toggle(): void {
  if (idx.value >= tape.length) idx.value = 0;
  playing.value = !playing.value;
  tick();
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
  else if (e.key === "ArrowRight") { playing.value = false; go(idx.value + 1); }
  else if (e.key === "ArrowLeft") { playing.value = false; go(idx.value - 1); }
  else if (e.key === "Home") { playing.value = false; go(0); }
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
  if (opts.autoplay) { playing.value = true; tick(); }
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  clearTimeout(sleepTimer);
  ro?.disconnect();
  window.removeEventListener("keydown", onKey, true);
});
const btn = "rounded-lg border border-white/25 bg-black/60 px-3 py-1.5 hover:bg-white/10";
</script>

<template>
  <Teleport to="body">
    <div ref="rootEl" class="fixed inset-0 z-[400] grid place-items-center overflow-hidden bg-black" :class="awake ? '' : 'cursor-none'" @mousemove="poke">
      <div class="stage-video-bg relative h-[720px] w-[1280px] shrink-0 text-[var(--exile-color-text-primary,#e8e2d6)]" :style="{ transform: `scale(${scale})` }">
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
        <button type="button" :class="btn" title="最初 (Home)" @click="playing = false; go(0)">⏮</button>
        <button type="button" :class="btn" title="1 手戻る (←)" @click="playing = false; go(idx - 1)">◀</button>
        <button type="button" :class="btn" class="min-w-[88px]" title="再生 / 一時停止 (Space)" @click="toggle()">{{ playing ? "⏸ 止める" : "▶ 再生" }}</button>
        <button type="button" :class="btn" title="1 手進む (→)" @click="playing = false; go(idx + 1)">▶|</button>
        <button v-for="v in [0.5, 1, 2]" :key="v" type="button" :class="[btn, speed === v ? 'ring-1 ring-amber-300' : '']" @click="speed = v; tick()">×{{ v }}</button>
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
