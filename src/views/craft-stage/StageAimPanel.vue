<!--
  StageAimPanel.vue — エミュレーターの「狙う」(2026-10-09)

  オーナー「狙うボタンを押すと、この状態で一番付く確率が高い物を順に、使えるカレンシーに確率を出す。並び順は付きやすい順。冒涜も含める。
  反響も使える (使わない選択肢は無い) からセットで。安いとかじゃなくて確率を出したい。高貴なら左側・完全高貴、場合によっては上級の方が付きやすいとか」。
  計算は aim-odds.ts (ステージで打つのと同じ処理を何百回も試す)。行を押すとそのカレンシーを持ってお告げを掛ける。打ったら今の状態で出し直す。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { AIM_MAX, craftStage as s, iconOf, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { bonesFor, essenceShelf, ORBS } from "../../state/craft-stage-shelf";
import { OMEN_FOR } from "../../services/craft-stage/omens";
import { kindOf } from "../../services/craft-stage/apply-currency";
import { aimCombos, aimDone, aimOdds, REVEAL, type AimCombo, type AimOdd } from "../../services/craft-stage/aim-odds";
import Icon from "../../components/ui/Icon.vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import { logRecord } from "../../utils/log-record";
import { keepPlace } from "../../utils/keep-place";

/** 分析用の記録 (狙い・今のアイテムの MOD と一緒に) */
function logAim(kind: string, extra: Record<string, unknown>): void {
  const it = s.item.value, t = s.aims.value;
  if (!it || !t.length) return;
  logRecord(kind, { base: it.base, ilvl: it.itemLevel, rarity: it.rarity, mods: [...it.prefixes, ...it.suffixes].map((m) => `${m.modId}#${m.tierIndex}${m.fractured ? "f" : ""}`), aims: t.map((x) => `${x.modId}#${x.minTierIndex}`), ...extra });
}

const TRIALS = 1500;
const rows = ref<AimOdd[]>([]);
const total = ref(0);
/** 既定で出すのは上位 5 件 (残りは畳む。2026-10-09 オーナー「上位 5 個でいい、あとは畳んどけばええよデフォルトで」) */
const TOP = 5;
const showAll = ref(false);
let gen = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const done = computed(() => (s.item.value ? aimDone(s.item.value, s.aims.value) : false));

/** 今のアイテムと狙いで出し直す (少しずつ。画面を止めない) */
function recompute(): void {
  const my = ++gen;
  clearTimeout(timer);
  rows.value = [];
  total.value = 0;
  showAll.value = false;
  const d = s.data.value, it = s.item.value, t = s.aims.value;
  if (!d || !it || !t.length || done.value) return;
  const keys = [...ORBS.flatMap((g) => g.keys), ...bonesFor(it), ...essenceShelf(d, it).flatMap((g) => g.keys)];
  const combos: AimCombo[] = aimCombos(d, it, keys);
  total.value = combos.length;
  let i = 0;
  const step = (): void => {
    if (my !== gen) return;
    const t0 = performance.now();
    const out: AimOdd[] = [];
    while (i < combos.length && performance.now() - t0 < 30) {
      const c = combos[i++]!;
      out.push({ ...c, p: aimOdds(d, it, t, c, TRIALS, 17), n: TRIALS });
    }
    rows.value = [...rows.value, ...out].sort(byValue);
    if (i < combos.length) timer = setTimeout(step, 0);
    else logAim("aim_odds", { top: rows.value.slice(0, 12).map((x) => ({ c: keyOf(x), p: Math.round(x.p * 1000) / 1000, cost: Math.round(costOf(x) * 100) / 100 })) });
  };
  timer = setTimeout(step, 0);
}
watch([() => s.aims.value, () => s.item.value], recompute, { immediate: true });
/**
 * スマホ: 打った時に上 (工程・アイテムのカード) が伸びても、この一覧を画面の同じ高さに残す (打つたびに一覧が下へ流れて探し直していた)。
 * 画面に見えている時だけ。PC は棚の横なので動かない
 */
const panel = ref<HTMLElement | null>(null);
let keepTop: number | null = null;
watch(() => s.item.value, () => {
  const el = panel.value;
  if (!el || window.innerWidth >= 768) { keepTop = null; return; }
  const r = el.getBoundingClientRect();
  keepTop = r.bottom > 0 && r.top < window.innerHeight ? r.top : null;
}, { flush: "pre" });
watch(() => s.item.value, () => {
  const el = panel.value, before = keepTop;
  keepTop = null;
  if (!el || before == null) return;
  const d = el.getBoundingClientRect().top - before;
  if (Math.abs(d) > 1) window.scrollBy({ top: d, behavior: "instant" as ScrollBehavior });
}, { flush: "post" });
onBeforeUnmount(() => { gen++; clearTimeout(timer); });

const busy = computed(() => rows.value.length < total.value);
/**
 * 費用 (2026-10-09 オーナー「かかる費用を適正価値で。確率出したらそのままトータルで分かる、どれがコスパ良いか。付きやすさと費用対効果は違うから
 * 費用対効果順でいいや表示のランキング」)。1 回 = カレンシー + お告げ (ステージの累計と同じ相場、高貴建て)。値段が分からない物は後ろへ。
 * 付くまでの平均は「外れたら今の状態を作り直してやり直す」(2026-10-09 オーナー「やり直しで確率とコスト計算できる、単純な確率の話」):
 * 外れると今の状態は崩れるので、作り直す費用 = 今の累計 (rebuild) を外れの分だけ足す。E = (1 回 + (1 − p) × 累計) ÷ p。
 * 1 回だけの確率で並べると、何も消さない高貴がいつも上に来て参考にならなかった
 */
const costOf = (r: AimCombo): number => (r.currency === REVEAL ? 0 : priceOf(r.currency)) + r.omens.reduce((a, o) => a + priceOf(o), 0);
const rebuild = computed(() => Math.max(0, s.total.value));
const perHit = (r: AimOdd): number => { const c = costOf(r); return r.p > 0 && c > 0 ? (c + (1 - r.p) * rebuild.value) / r.p : Infinity; };
function byValue(a: AimOdd, b: AimOdd): number { return perHit(a) - perHit(b) || b.p - a.p; }
const hitRows = computed(() => rows.value.filter((r) => r.p > 0));
const shown = computed(() => (showAll.value ? hitRows.value : hitRows.value.slice(0, TOP)));
/** 棒 = 一番安い平均費用に対するこの行の割合 (長いほどお得) */
const cheapest = computed(() => Math.min(...hitRows.value.map(perHit)));

const nameRow = (r: AimOdd): string => (r.currency === REVEAL ? "発現 (未発現の MOD)" : nameOf(r.currency));
const omenNames = (r: AimOdd): string[] => r.omens.map((o) => nameOf(o));
const pct = (p: number): string => (p >= 0.995 ? "100%" : p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.001 ? `${(p * 100).toFixed(1)}%` : "<0.1%");

/** その打ち方を持つ: カレンシーを持ち、お告げはその手の種類の物をこの組み合わせに揃える (ほかの種類のお告げは残す) */
function pick(r: AimOdd): void {
  if (r.currency === REVEAL) {
    if (!s.omens.value.includes("OmenofAbyssalEchoes")) s.toggleOmen("OmenofAbyssalEchoes");
    document.querySelector("[data-reveal-panel]")?.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  const kinds = [kindOf(r.currency), ...(kindOf(r.currency) === "desecrate" ? ["reveal"] : [])];
  const mine = new Set(kinds.flatMap((k) => OMEN_FOR[k] ?? []));
  s.omens.value = [...s.omens.value.filter((o) => !mine.has(o)), ...r.omens];
  s.hold(r.currency);
}
/**
 * 回す (2026-10-09 オーナー「ここでも回したいよね、何回やったら何回付くのか」): その打ち方を今の状態から N 回 (毎回今の状態から) 打って、付いた回数。
 * 試すたびに乱数は変わる (確率の目安とは別の、実際の 1 回 1 回)
 */
const ROLLS = [10, 100, 1000] as const;
const rollN = ref<number>(100);
const rolled = ref<{ key: string; n: number; hit: number } | null>(null);
const keyOf = (r: AimOdd): string => r.currency + "|" + r.omens.join("+");
function roll(r: AimOdd): void {
  const d = s.data.value, it = s.item.value, t = s.aims.value;
  if (!d || !it || !t.length) return;
  const p = aimOdds(d, it, t, r, rollN.value, Math.floor(Math.random() * 1e9));
  const hit = Math.round(p * rollN.value);
  rolled.value = { key: keyOf(r), n: rollN.value, hit };
  logAim("aim_roll", { combo: keyOf(r), n: rollN.value, hit, odds: r.p });
}
watch([() => s.aims.value, () => s.item.value], () => { rolled.value = null; });
/** 平均で何回に 1 回付くか */
const every = (p: number): string => (p <= 0 ? "" : p >= 0.995 ? "毎回" : `${Math.round(1 / p).toLocaleString()} 回に 1 回`);
const isHeld = (r: AimOdd): boolean => s.held.value === r.currency && r.omens.every((o) => s.omens.value.includes(o));
</script>

<template>
  <section v-if="s.aims.value.length" ref="panel" data-aim-panel class="g-panel scroll-mt-2 p-2 text-[12px]">
    <header class="mb-2 flex flex-wrap items-center gap-2">
      <b class="g-brush text-[18px] tracking-[0.12em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">次の手で狙う</b>
      <span class="flex min-w-0 flex-wrap gap-1 max-md:order-last max-md:w-full">
        <span v-for="a in s.aims.value" :key="a.modId" class="inline-flex items-center gap-1 rounded bg-[rgba(136,136,255,0.14)] py-0.5 pl-1.5 text-[12px] text-[var(--color-rarity-magic)]">{{ a.label }}<button type="button" class="g-plain grid size-7 place-items-center opacity-60 hover:opacity-100" title="この MOD を外す" @click="s.aims.value = s.aims.value.filter((x) => x.modId !== a.modId)">×</button></span>
        <!-- 足す・変える: 選ぶ窓をもう一度 (MOD 一覧まで戻らなくていい) -->
        <button type="button" class="g-plain inline-flex min-h-7 items-center gap-1 rounded border border-dashed border-white/25 px-2 text-[12px] text-[var(--exile-color-text-secondary)] hover:bg-white/5" @click="s.aimPicker.value = { seed: null }"><Icon name="plus" class="size-3.5" />{{ s.aims.value.length < AIM_MAX ? "足す・変える" : "変える" }}</button>
      </span>
      <span class="flex items-center gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]">回す回数
        <button v-for="n in ROLLS" :key="n" type="button" class="g-tab !min-h-[26px] !px-2 !text-[11px]" :class="rollN === n ? 'on' : ''" @click="rollN = n">{{ n.toLocaleString() }}</button>
      </span>
      <HelpTip title="次の手で狙う" :width="320">
        <p>今の状態から 1 回打った時に、狙いの MOD (その段以上。最大 4 つで、全部揃って当たり) が付く確率。打ち方 (カレンシーとお告げの組み合わせ) ごとに {{ TRIALS }} 回試した目安です。</p>
        <p class="mt-1">冒涜は骨の後の発現の候補 (アビスの反響の引き直しを含む) に出れば当たり。</p>
        <p class="mt-1">並びは付くまでの平均費用の安い順。外れたら今の状態を作り直してやり直すとして、(1 回の費用 + 外れる確率 × 今の累計) ÷ 確率 で出します (カレンシーとお告げの相場)。</p>
        <p class="mt-1 text-[var(--exile-color-text-secondary)]">行を押すと、そのカレンシーを持ってお告げを掛けます。打つと今の状態で出し直します。</p>
      </HelpTip>
      <button type="button" class="ml-auto grid size-8 place-items-center rounded text-[var(--exile-color-text-tertiary)] hover:bg-white/10 hover:text-[var(--exile-color-text-primary)]" title="狙うのをやめる" @click="s.aims.value = []"><Icon name="x" class="size-4" /></button>
    </header>
    <p v-if="done" class="text-emerald-300">もう全部付いています</p>
    <template v-else>
      <p class="mb-0.5 pr-[76px] text-right text-[10px] text-[var(--exile-color-text-tertiary)]">安い順 · 付くまでの平均 / 確率<template v-if="rebuild > 0"> (外れたら累計 {{ displayCurrency.money(rebuild) }} で作り直す)</template></p>
      <ol class="flex flex-col gap-1">
        <li v-for="(r, i) in shown" :key="r.currency + r.omens.join('+')">
          <button type="button" class="g-plain flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition" :class="isHeld(r) ? 'bg-[rgba(163,52,42,0.35)] ring-1 ring-[var(--exile-color-border-brass)]' : 'hover:bg-white/[0.05]'" @click="keepPlace($event.currentTarget as Element, () => pick(r))">
            <span class="w-5 shrink-0 text-right tabular-nums text-[var(--exile-color-text-tertiary)] max-md:hidden">{{ i + 1 }}</span>
            <span class="flex shrink-0 items-center -space-x-1.5">
              <img v-if="r.currency !== REVEAL && iconOf(r.currency)" :src="iconOf(r.currency)" alt="" class="size-7 object-contain" />
              <img v-for="o in r.omens" :key="o" :src="iconOf(o)" alt="" class="size-6 object-contain" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block leading-snug text-[var(--exile-color-text-primary)] md:truncate">{{ nameRow(r) }}</span>
              <span v-if="r.omens.length" class="block text-[11px] leading-snug text-violet-200/80 md:truncate">+ {{ omenNames(r).join("・") }}</span>
              <span class="block text-[11px] text-[var(--exile-color-text-tertiary)]"><template v-if="costOf(r) > 0">1 回 {{ displayCurrency.money(costOf(r)) }} · </template>{{ every(r.p) }}<template v-if="rolled?.key === keyOf(r)"> · <b class="text-emerald-300">{{ rolled.n.toLocaleString() }} 回中 {{ rolled.hit.toLocaleString() }} 回付いた</b></template></span>
            </span>
            <span class="w-24 shrink-0 max-md:hidden">
              <span class="block h-1.5 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full bg-[var(--exile-color-accent-focus)]" :style="{ width: `${Number.isFinite(perHit(r)) ? (cheapest / perHit(r)) * 100 : 0}%` }"></span></span>
            </span>
            <!-- 付くまでの平均費用 (並びの元) と、その下に確率 -->
            <span class="w-20 shrink-0 text-right leading-tight">
              <b class="block whitespace-nowrap tabular-nums text-[14px]" :class="i === 0 ? 'text-[var(--exile-color-text-title)]' : 'text-[var(--exile-color-text-primary)]'">{{ Number.isFinite(perHit(r)) ? displayCurrency.money(perHit(r)) : "値段なし" }}</b>
              <span class="block whitespace-nowrap text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ pct(r.p) }}</span>
            </span>
            <span role="button" tabindex="0" class="g-btn sm shrink-0" :title="`今の状態から ${rollN.toLocaleString()} 回打って (毎回この状態から) 何回付くか`" @click.stop="roll(r)" @keydown.enter.stop="roll(r)">回す</span>
          </button>
        </li>
      </ol>
      <p v-if="busy" class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">計算中… {{ rows.length }} / {{ total }}</p>
      <p v-else-if="!hitRows.length" class="text-[var(--exile-color-text-secondary)]">今の状態ではどの打ち方でも付きません (空きが無い・同じ系統が付いている・アイテムレベルが足りない など)</p>
      <button v-if="hitRows.length > TOP" type="button" class="g-plain mt-1 inline-flex min-h-8 items-center gap-1 text-[12px] text-[var(--exile-color-text-link)]" @click="showAll = !showAll"><Icon :name="showAll ? 'chevron-up' : 'chevron-down'" class="size-3.5" />{{ showAll ? "畳む" : `ほか ${hitRows.length - TOP} 件` }}</button>
    </template>
  </section>
</template>
