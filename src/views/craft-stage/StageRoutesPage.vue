<!--
  StageRoutesPage.vue — スパムシミュレーター (?page=routes、2026-10-18 オーナー「エミュレーターに簡易シミュレーターページ。1 MOD を対象にどのルートが一番早く着くか。
  要はスパム。冒涜スパムは無し。高貴・増強・カオスのスパム」)。カレンシーの見出しの「スパムシミュレーター」で開き、最初に MOD を 1 つ選ぶ (StageAimPicker の routes)。
  オーナー「全てのスパムで計測、100 人で。カオスは今まで通り。カオススパム計算機じゃないから完全でのリロールは無し、カオスは無印と上級。スパム計算機はここで全部管理」
  計算は services/craft-stage/route-race.ts (エミュレーターと同じ applyCurrency で 1 通り 100 人分)。8 通り (増強・高貴 × 完全 / 上級 / 無印、カオス × 上級 / 無印) を 1 つずつ間を空けて回し、出た順に表へ。
  値段は今の相場 (priceOf)、白のベース代はどの道でも同じなので入れない。広告ありきの別のページ (WebApp.vue が両脇の枠を置く)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage as s, nameOf, priceOf } from "../../state/craft-stage";
import { routesOpen, routesTarget } from "../../state/web-page";
import { raceRoutes, type Grade, type RaceRow, type RouteKind } from "../../services/craft-stage/route-race";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { displayCurrency } from "../../state/display-currency";
import { tr } from "../../i18n/lang";
import HelpTip from "../../components/ui/HelpTip.vue";

const ROUTE_JA: Record<RouteKind, [string, string, string, string]> = {
  augment: ["増強スパム", "Augment spam", "変成でマジック → 狙いの側が空くまで消去、空いたら増強、を狙いが付くまで", "Transmute → annul until the target side is empty, then augment, until the target rolls"],
  chaos: ["カオススパム", "Chaos spam", "錬金でレア → 狙いが付くまでカオス", "Alchemy → Chaos until the target rolls"],
  exalt: ["高貴スパム", "Exalt spam", "錬金でレア → 消去で 1 MOD → 高貴 + 偉大な高貴のお告げ + 狙いの側の高貴のお告げ → 外れたら消去で 1 MOD に戻す", "Alchemy → annul to 1 mod → Exalt + Greater Exaltation + side omen → annul back to 1 mod on a miss"],
};
const GRADE_JA: Record<Grade, [string, string]> = { perfect: ["完全", "Perfect"], greater: ["上級", "Greater"], base: ["無印", "Regular"] };
const ORDER: Array<{ route: RouteKind; grade: Grade }> = (["augment", "chaos", "exalt"] as const).flatMap((route) => (["perfect", "greater", "base"] as const).filter((g) => !(route === "chaos" && g === "perfect")).map((grade) => ({ route, grade })));
const RUNS = 100;

const t = computed(() => routesTarget.value);
const mod = computed(() => (t.value ? s.data.value?.mods.get(t.value.modId) ?? null : null));
const label = computed(() => {
  const m = mod.value, tt = t.value;
  if (!m || !tt) return "";
  const tier = m.tiers[tt.minTierIndex];
  return `${fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ")} (T${m.tiers.length - tt.minTierIndex} 以上)`;
});
const ilvl = computed(() => s.item.value?.itemLevel ?? s.itemLevel.value);
const rows = ref<RaceRow[]>([]);
const busy = ref(false);
let runId = 0;
async function run(): Promise<void> {
  const d = s.data.value, tt = t.value;
  if (!d || !tt) return;
  const id = ++runId;
  rows.value = [];
  busy.value = true;
  for (const one of ORDER) {
    await new Promise((r) => setTimeout(r, 0));
    if (id !== runId) return;
    rows.value = [...rows.value, ...raceRoutes(d, s.base.value, ilvl.value, tt, priceOf, { runs: RUNS, only: one })];
  }
  busy.value = false;
}
watch(t, () => void run());
/** 一番安い (着いた物の中で) */
const best = computed(() => {
  const ok = rows.value.filter((r) => !r.off);
  return ok.length ? ok.reduce((a, b) => (b.avgCost < a.avgCost ? b : a)) : null;
});
const money = (x: number): string => displayCurrency.money(x);
const fmtN = (n: number): string => (n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1));
function back(): void { s.aimPicker.value = null; routesOpen.value = false; routesTarget.value = null; }
function pickMod(): void { s.aimPicker.value = { seed: null, routes: true }; }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape" && !s.aimPicker.value) back(); }
let before = 0;
onMounted(() => { before = window.scrollY; window.scrollTo(0, 0); window.addEventListener("keydown", onKey); void run(); });
onBeforeUnmount(() => { runId++; window.removeEventListener("keydown", onKey); const y = before; requestAnimationFrame(() => window.scrollTo(0, y)); });
</script>

<template>
  <section data-routes-page class="min-w-0 flex-1 p-4">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("スパムシミュレーター", "Spam simulator") }}</h1>
      <span class="flex items-center gap-2">
        <button type="button" data-routes-back class="g-btn sm max-md:min-h-10" @click="back">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
        <span class="text-[12px] opacity-60 max-md:hidden">{{ tr("Esc でも戻る", "Esc also goes back") }}</span>
      </span>
    </div>
    <div v-if="!t" class="g-panel flex flex-col items-center gap-3 px-4 py-8 text-center text-[13px]">
      <p>{{ tr("狙う MOD を 1 つ選ぶと、増強・カオス・高貴のスパムでどれが一番安く着くかを比べます", "Pick one mod to see which spam (augment / chaos / exalt) gets there cheapest") }}</p>
      <button type="button" data-routes-pick class="g-btn-red min-w-40" @click="pickMod">{{ tr("MOD を選ぶ", "Pick a mod") }}</button>
    </div>
    <div v-else class="g-panel px-4 py-3 text-[12px]">
      <p class="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-[var(--exile-color-text-secondary)]">{{ tr("狙い", "Target") }}</span>
        <b class="text-[14px] text-[#c8c8ff]">{{ label }}</b>
        <span class="opacity-70">{{ s.item.value?.baseJa ?? s.base.value }} · {{ tr(`アイテムレベル ${ilvl}`, `Item level ${ilvl}`) }}</span>
        <button type="button" data-routes-pick class="g-btn sm" @click="pickMod">{{ tr("MOD を選び直す", "Change mod") }}</button>
        <HelpTip :title="tr('比べ方', 'How it compares')" :width="340">
          <p>{{ tr("エミュレーターと同じ打ち方で、白のベースから 1 通り 100 人分打った平均。値段は今の相場、白のベース代はどの道でも同じなので入れていない", "Average of 100 runs per route from a white base, using the same rules as the Emulator. Current market prices; the white base cost is the same for every route, so it is left out") }}</p>
          <p class="mt-1 text-[var(--exile-color-text-secondary)]">{{ tr("半分 / 9 割 = その金額までに半分 / 9 割の人が着いた (運の幅)", "Half / 90% = by this cost, half / 90% of runs had hit (luck range)") }}</p>
        </HelpTip>
      </p>
      <p v-if="busy" class="mb-2 text-amber-200">{{ tr(`計算中… ${rows.length} / ${ORDER.length}`, `Calculating… ${rows.length} / ${ORDER.length}`) }}</p>
      <table class="w-full text-[12px] tabular-nums">
        <thead>
          <tr class="border-b border-white/10 text-[11px] text-[var(--exile-color-text-tertiary)]">
            <th class="py-1 text-left font-normal">{{ tr("道", "Route") }}</th>
            <th class="py-1 text-left font-normal">{{ tr("等級", "Grade") }}</th>
            <th class="py-1 text-right font-normal">{{ tr("平均の費用", "Avg cost") }}</th>
            <th class="py-1 text-right font-normal max-md:hidden">{{ tr("平均の手数", "Avg uses") }}</th>
            <th class="py-1 text-right font-normal max-md:hidden">{{ tr("半分", "Half") }}</th>
            <th class="py-1 text-right font-normal max-md:hidden">{{ tr("9 割", "90%") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="`${r.route}:${r.grade}`" data-route-row class="border-b border-white/5" :class="best === r ? 'bg-emerald-500/10' : ''">
            <td class="py-1.5 pr-2" :title="tr(ROUTE_JA[r.route][2], ROUTE_JA[r.route][3])">{{ tr(ROUTE_JA[r.route][0], ROUTE_JA[r.route][1]) }}</td>
            <td class="py-1.5 pr-2">{{ tr(...GRADE_JA[r.grade]) }}</td>
            <template v-if="r.off">
              <td colspan="4" class="py-1.5 text-right text-[11px] opacity-50">{{ r.off }}</td>
            </template>
            <template v-else>
              <td class="py-1.5 text-right" :class="best === r ? 'font-bold text-emerald-300' : ''">
                {{ money(r.avgCost) }}<span v-if="best === r" class="ml-1 text-[10px]">{{ tr("一番安い", "Cheapest") }}</span>
                <HelpTip :title="tr('1 人あたり平均で使った物', 'Average uses per run')" :width="300" class="ml-1">
                  <p v-for="(n, k) in r.uses" :key="k">{{ nameOf(String(k)) }} × {{ fmtN(n) }}</p>
                </HelpTip>
              </td>
              <td class="py-1.5 text-right opacity-80 max-md:hidden">{{ fmtN(r.avgSteps) }}</td>
              <td class="py-1.5 text-right opacity-80 max-md:hidden">{{ money(r.p50) }}</td>
              <td class="py-1.5 text-right opacity-80 max-md:hidden">{{ money(r.p90) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
      <p class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("道の名前に乗せると打ち方が出る。冒涜スパムは入れていない", "Hover a route name for how it is crafted. Desecration spam is not included") }}</p>
    </div>
  </section>
</template>
