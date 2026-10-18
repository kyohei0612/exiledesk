<!--
  StageSimPanel.vue — クラフトステージのシミュレーション (2026-10-05、実験)

  オーナー「この MOD 群をクラフトした場合にいくらかかるのか見たい」「ステージでタブ切り替えでエミュレーター作ってよくね」
  「どういう順番で付けるかを最初に選ばせて、それぞれフラクチャー・冒涜をする箇所を選ばせて、順番通りに作る」
  「取引所関連は設定だけしてあげて検索ボタンで自分で拾いに行かせる。値段設定とかも手動で」。
  狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)。狙いの順番と付け方 (高貴 / カオス / 冒涜 / エッセンス /
  フラクチャー) を決めて、ステージの 1 手で何百回も打つ ([[recipe-sim.ts]])。真ん中くらいの 1 回を「手で打つ」で再生できる。
  半自動 (2026-10-05 オーナー「自動化はやめておこうか、半自動化で、カオススパムやら消去リロールやらの仕組みは自動化」): 作り方を
  探す自動 (計算機の自動のツリー) は外した。計算機 (htc-craft) はそのまま。
-->
<script setup lang="ts">
import { computed, nextTick, watch } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { revealBottom } from "../../utils/keep-place";
import SimStartPick from "./SimStartPick.vue";
import SimRareStrip from "./SimRareStrip.vue";
import SimTargetSort from "./SimTargetSort.vue";
import { SIM_STARTS, type SimStartKind } from "../../services/craft-stage/sim-methods";
import { ARMED_CLASS } from "../../utils/use-armed";
import { iconOf, priceOf } from "../../state/craft-stage";
import { simCurrency } from "../../state/display-currency";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import StageFracturePicker from "./StageFracturePicker.vue";
import StageTargetSummary from "./StageTargetSummary.vue";
import StageModList from "./StageModList.vue";
import PriceInput from "../../components/PriceInput.vue";
import { tr } from "../../i18n/lang";
import StagePatternEditor from "./StagePatternEditor.vue";
import SimStepHead from "./SimStepHead.vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import SimProgress from "./SimProgress.vue";
import { useSimTargets } from "./use-sim-targets";
import { useSimSearch } from "./use-sim-search";
import { useSimRun } from "./use-sim-run";
import { useSimRecipes } from "./use-sim-recipes";
import { useSimSteps } from "./use-sim-steps";
import { useSimResult } from "./use-sim-result";

const tg = useSimTargets();
const sr = useSimSearch(tg);
const rn = useSimRun({ ...tg, ...sr });
const rc = useSimRecipes({ ...tg, ...rn });
const st = useSimSteps({ ...tg, ...rn });
const rs = useSimResult({ ...tg, ...sr, ...rn, ...rc });
const { s, runs, MAX_STEPS_CHOICES, maxSteps, METHOD_JA, rows, runeNeeded, orderKeys, moveOrder, removeRune, runeChoices, toggleRune,
  orderRow, runeJa, redoOf, REDO_METHOD_JA, patternStart, fractureRows, fracMembers, fractureRow, boughtDivine, magicDivine, whiteDivine,
  fourDivine, itemDivine, num, socketsOk, socketCount, ageOf, searchIlvl, searchFour, searchWhite, mixedSides, searchBought, doneDivine,
  doneAge, searchDone, searchPattern, calc, busy, phase, progressBox, error, recipeOut, phone, resultOf, shownName, cheapestName,
  showResultByName, patternNote, togglePatternOff, hasSteps, quizBase, magicMods, runnable, blocked, activePattern, run, stop, open, toggle,
  help, modsDone, sortDone, orderDone, startDone, step3, startPrice, whiteDone, stepStart, stepOrder, patternDone, stale, recipes, recipeOpen,
  recipeName, recipeArm, recipeRenaming, fmtDate, openRecipes, saveRecipe, recipeBox, renameRecipe, recipeNote, recipeFile, exportRecipes,
  importRecipes, removeRecipe, loadRecipe, step4pre, stepNo, fold, step4, ilvlNote, goTo, resetArm, resetAll, panelEl, whiteDecide,
  undoStack, undo, routes, money, pct, compare, hitName, split, moneyT, fmtCount, hitShort, cardOk, cardNote, saveCard, copyCard, luck,
  costGroups, summary, tooManySteps, nextMaxSteps } = { ...tg, ...sr, ...rn, ...rc, ...st, ...rs };
/** 付与スキルが候補から 1 つのベースで、まだ選んでいない (選ぶまで始め方を出さない) */
const grantPending = computed(() => (htcBaseInfo()[s.base.value]?.grants?.length ?? 0) > 1 && !s.simGrant.value);
// 付与スキルを選んで始め方が出たら、3 の枠の下の線 + 24px まで送る (段が進んだ時と同じ。2026-10-18 オーナー)
watch(grantPending, (p, was) => { if (!p && was) void nextTick(() => requestAnimationFrame(() => { const el = panelEl.value?.querySelector("[data-sim-cur]"); if (el) revealBottom(el); })); });
/** 3 の始め方の行 (エミュレーターの状態からは、持ってきた時だけ) */
const startKinds = computed(() => SIM_STARTS.filter((k) => k.k !== "item" || !!s.simStartItem.value));
/** 使えない始め方の理由 (フラクチャー予定が無いと、フラクチャー済み・4 MOD のレアは使えない) */
const startOff = (k: (typeof SIM_STARTS)[number]): string => (k.needsFracture && !fracMembers.value.length ? "2 でフラクチャー予定を選ぶと使える" : "");
/** その始め方のベースの値段 (高貴建て。入れていなければ null) */
function startCost(k: SimStartKind): number | null {
  return num(k === "white" ? whiteDivine.value : k === "fractured" ? boughtDivine.value : k === "magic" ? magicDivine.value : k === "four" ? fourDivine.value : itemDivine.value);
}
/** 値段が入った始め方が 2 つ以上ある時の一番安い物 */
const cheapStart = computed((): SimStartKind | null => {
  const ok = startKinds.value.filter((k) => !startOff(k) && startCost(k.k) != null);
  return ok.length > 1 ? ok.reduce((a, b) => (startCost(b.k)! < startCost(a.k)! ? b : a)).k : null;
});
</script>

<template>
  <!-- 工程ごとに同じ高さの枠を縦に並べる (入れ子の枠はやめた。2026-10-05 オーナー「枠の中に何個枠あんのよ、きもいやろ」
       「1 がベース選定、2 がベース値段、3 が狙う MOD と分けたら」)。1 ベースは上の CraftStage.vue の枠 -->
  <div ref="panelEl" class="space-y-3 text-[12px]">
    <!-- 1 つ戻す・説明はタブの行の右端に (工程の枠の間に行を挟まない) -->
    <!-- defer: 移し先 (#sim-tools、CraftStage.vue) ができてから描く。無いうちに描くと失敗し、以後の描き直しが全部エラーで止まっていた
         (2026-10-07 オーナー「また進まない」: 2 狙う MOD の「決めた →」を押しても画面が変わらなかった) -->
    <Teleport defer to="#sim-tools" :disabled="s.mode.value !== 'sim' || !!s.replay.value">
      <CurrencyPicker sim />
      <!-- レシピ (名前を付けて残す・呼び出す) -->
      <span ref="recipeBox" class="relative">
        <button type="button" class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" :aria-expanded="recipeOpen" title="今の途中 (ベース・狙い・順番・パターン) を名前を付けて残す / 呼び出す" @click="openRecipes">レシピ<Icon :name="recipeOpen ? 'chevron-up' : 'chevron-down'" class="size-4" /></button>
        <div v-if="recipeOpen" class="fixed inset-0 z-30 bg-black/60 md:hidden" @click="recipeOpen = false"></div>
        <div v-if="recipeOpen" class="absolute right-0 top-full z-40 mt-1 w-[26rem] rounded-xl border border-white/15 bg-[#14110d] p-3 text-[12px] shadow-2xl max-md:fixed max-md:inset-x-3 max-md:top-14 max-md:w-auto max-md:max-h-[80vh] max-md:overflow-y-auto">
          <button type="button" class="mb-2 w-full rounded-lg border border-white/20 py-2 md:hidden" @click="recipeOpen = false">閉じる</button>
          <div class="flex items-center gap-2">
            <input v-model="recipeName" class="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1 outline-none focus:border-amber-400/60" placeholder="レシピの名前" @keydown.enter="saveRecipe" />
            <button type="button" class="shrink-0 rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-1 font-bold text-amber-100 hover:bg-amber-500/30" @click="saveRecipe">今の状態を保存</button>
          </div>
          <!-- 書き出し・読み込み (別の PC・URL に持っていく用) -->
          <div class="mt-2 flex items-center gap-2 text-[11px]">
            <button type="button" class="shrink-0 whitespace-nowrap rounded border border-white/15 px-2 py-0.5 opacity-80 hover:bg-white/10 hover:opacity-100 disabled:opacity-40" :disabled="!recipes.length" title="全部のレシピをファイルに保存する (別の PC やブラウザで「読み込む」と戻せる)" @click="exportRecipes">書き出す</button>
            <button type="button" class="shrink-0 whitespace-nowrap rounded border border-white/15 px-2 py-0.5 opacity-80 hover:bg-white/10 hover:opacity-100" title="書き出したファイルからレシピを足す (今のレシピは消えない)" @click="recipeFile?.click()">読み込む</button>
            <input ref="recipeFile" type="file" accept=".json,application/json" class="hidden" @change="importRecipes" />
            <span v-if="recipeNote" class="truncate opacity-60">{{ recipeNote }}</span>
          </div>
          <p v-if="!recipes.length" class="mt-3 text-center opacity-50">まだ保存したレシピはありません</p>
          <div v-else class="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
            <div v-for="r in recipes" :key="r.id" class="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
              <div class="min-w-0 flex-1">
                <input v-if="recipeRenaming === r.id" :ref="(el) => { if (el) (el as HTMLInputElement).focus(); }" :value="r.name" class="w-full rounded border border-amber-400/60 bg-black/50 px-1 outline-none" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="recipeRenaming = null" @blur="renameRecipe(r.id, ($event.target as HTMLInputElement).value)" />
                <p v-else class="flex cursor-text items-center gap-1 font-bold" title="ダブルクリックで名前を変える" @dblclick="recipeRenaming = r.id"><span class="truncate">{{ r.name }}</span><button type="button" class="shrink-0 rounded px-1 text-[12px] opacity-50 hover:opacity-100" title="名前を変える" @click.stop="recipeRenaming = r.id">✎</button></p>
                <p class="truncate text-[10px] opacity-50">{{ r.baseJa ?? r.session.base }} · パターン {{ r.session.patterns.length }} つ · {{ fmtDate(r.savedAt) }}</p>
              </div>
              <button type="button" class="shrink-0" :class="recipeArm.is(`load:${r.id}`) ? ARMED_CLASS : 'g-btn sm'" :title="recipeArm.is(`load:${r.id}`) ? '今の状態は置き換わる。もう一度押すと呼び出す' : 'このレシピを呼び出す (今の状態は置き換わる)'" @click="loadRecipe(r)">{{ recipeArm.is(`load:${r.id}`) ? "もう一度押すと呼び出す" : "呼び出す" }}</button>
              <button type="button" class="shrink-0" :class="recipeArm.is(`del:${r.id}`) ? ARMED_CLASS : 'g-plain rounded px-1.5 py-0.5 opacity-50 hover:bg-white/10 hover:opacity-100'" :title="recipeArm.is(`del:${r.id}`) ? 'もう一度押すと消す' : 'このレシピを消す'" @click="removeRecipe(r.id)"><template v-if="recipeArm.is(`del:${r.id}`)">もう一度押すと消す</template><Icon v-else name="x" class="size-3.5" /></button>
            </div>
          </div>
        </div>
      </span>
      <!-- 2026-10-10 動きの揃え 6: 帯のボタンはエミュレーターの「白に戻す」「1 手戻す」と同じ g-btn sm (2 回押しの間は g-btn-red) -->
      <button type="button" class="inline-flex items-center gap-1.5 max-md:min-h-10" :class="resetArm.is() ? ARMED_CLASS : 'g-btn sm'" title="最初 (ベースを選ぶ所) に戻す。選んだ MOD・工程・結果を消す (入れた値段は残る)" @click="resetAll"><Icon name="rotate" class="size-4" /><span :class="resetArm.is() ? '' : 'max-md:hidden'">{{ resetArm.is() ? "もう一度押すと消える" : "リセット" }}</span></button>
      <button type="button" class="g-btn sm inline-flex items-center gap-1.5 max-md:min-h-10" :disabled="!undoStack.length" :title="undoStack.length ? '直前の操作を 1 つ取り消す (Ctrl+Z)' : '戻せる操作がまだ無い'" @click="undo"><Icon name="undo" class="size-4" /><span class="max-md:hidden">1 つ戻す</span></button>
      <button type="button" class="grid size-8 place-items-center rounded-md transition max-md:size-10" :class="help ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)] ring-1 ring-[var(--exile-color-border-brass)]' : 'text-[var(--exile-color-text-tertiary)] hover:bg-white/5 hover:text-[var(--exile-color-text-secondary)]'" :title="help ? '説明を閉じる' : '説明を出す (各所の説明の文を開く)'" :aria-pressed="help" @click="toggle('help')"><Icon name="help" class="size-5" /></button>
    </Teleport>
    <p v-if="help" class="mb-3 rounded-md bg-white/[0.03] px-3 py-2 text-[13px] text-[var(--exile-color-text-secondary)]">狙いは「このベースに付く MOD」の表の「T○ 以上」で選ぶ。打ち方 (パターン) を組んで「回す」と、何百人分も作った平均の費用が出る。各所の <Icon name="help" class="inline size-3.5 align-[-2px]" /> にも説明がある</p>

    <!--
      2〜5 は決めた後 (6 パターンを作る間) は 1 行に畳む。押すと開く (2026-10-07 オーナー採用の 2 枠の作業場。最小の窓 1660×860 で 6 が収まるように)
    -->
    <div v-if="socketsOk && step4pre" class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] px-5 py-2.5 text-[13px]">
      <span class="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-[12px] font-bold text-emerald-200 ring-1 ring-emerald-400/40">✓</span>
      <b class="shrink-0 whitespace-nowrap text-[var(--exile-color-text-primary)]">決めたこと</b>
      <span class="min-w-0 truncate text-[var(--exile-color-text-secondary)] max-md:whitespace-normal">狙う MOD {{ s.simTargets.value.length }} 個<template v-if="s.simStart.value !== 'white'"> · 始め {{ s.simStart.value === "item" ? "エミュレーターの状態" : s.simStart.value === "fractured" ? "フラクチャー済みを買う" : s.simStart.value === "magic" ? `マジックを買う ${money(num(magicDivine) ?? 0)}` : "4 MOD のレアを買う" }}</template><template v-else-if="routes.best && fractureRow"> · 始め {{ routes.list.find((x) => x.key === routes.best)!.name.replace(/\s*\(.*$/, "") }} {{ money(routes.list.find((x) => x.key === routes.best)!.cost ?? 0) }}</template> · 付ける順 {{ orderKeys.length }} つ</span>
      <Disclosure :open="!fold" kind="section" class="ml-auto h-7 shrink-0 rounded-md px-2 hover:bg-white/5" @update:open="fold = !$event" />
    </div>
    <!-- 2 狙う MOD → 3 白ベース設定 → 4 最安値スタート → 5 付ける順番と付け方 -->
    <template v-if="socketsOk && !(step4pre && fold)">
      <!-- ① 狙う MOD (下の「このベースに付く MOD」の「T○ 以上」で足す。「＋」であるいは) -->
      <div :data-sim-cur="!modsDone || !sortDone || undefined" :class="!modsDone || !sortDone ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.04)]' : 'border-white/10 bg-white/[0.025]'" class="rounded-xl border px-5 py-4">
        <SimStepHead class="mb-3" :n="2" title="狙う MOD" :done="modsDone" :current="!modsDone" :redo="modsDone" help="下の「このベースに付く MOD」で MOD を押すと段の表が開く。そこの「T○ 以上」で足す。「＋」は、その MOD の代わりに付いても当たりにする物 (どれか 1 つ)" @redo="goTo('mods')">
          <!-- MOD 一覧を重ねて開く (Tab でも。2026-10-18 オーナー「シミュレーターでも MOD 一覧見れるように、狙う MOD の横にボタン」) -->
          <template #side><button type="button" data-sim-mod-list class="g-btn sm max-md:hidden" :title="tr('このベースに付く MOD の一覧を重ねて開く (Tab でも開く)', 'Open the mod list for this base (Tab also opens it)')" @click="s.modOverlay.value = true">{{ tr("MOD 一覧", "Mod list") }}</button></template>
        </SimStepHead>
        <p v-if="ilvlNote" class="mb-1 text-[11px] text-amber-200">{{ ilvlNote }}</p>
        <!-- 完成図 (ベースの横から移した。段・＋・×・どれか N つ・付きやすさ) -->
        <!-- スマホ: 狙う MOD を選んでいる間は完成図を画面の上に貼り付ける (2026-10-09 オーナー「上の方がいいな、絶えず表示してあげたらいい。どの MOD どういう設定か忘れがち」) -->
        <div :class="phone && !modsDone && rows.length ? 'sticky top-0 z-[60] -mx-3 max-h-[40vh] overflow-y-auto border-b border-[var(--exile-color-border-brass)] bg-[#120f0c] px-3 pb-2 pt-1 shadow-[0_8px_18px_rgba(0,0,0,0.7)] [&_select]:max-w-full' : ''">
          <StageTargetSummary :editable="!modsDone" />
          <!-- 「決めた」の後: 付け方が同じ MOD の整理 (全部 / この中のどれか N つ)。枠に収まるまで 3 に進めない -->
          <SimTargetSort v-if="modsDone && !sortDone" @back="goTo('mods')" @done="sortDone = true" />
        </div>
        <div v-if="rows.length && !modsDone" class="mt-1 flex items-center gap-2">
          <button type="button" class="inline-flex h-8 items-center rounded-md px-2 text-[13px] text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-signal-down)]" @click="s.simTargets.value = []">全部外す</button>
          <button type="button" class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-40 max-md:hidden" title="狙う MOD を決めて、次のベースの値段へ (1 つでも進める)" @click="modsDone = true">決めた<Icon name="arrow-right" class="size-4" /></button>
        </div>
        <!-- スマホ: 一覧の下で「T○ 以上」を押しても上の完成図は見えないので、狙いの数と「決めた →」を画面の下に固定 (2026-10-08 レビュー) -->
        <div v-if="phone && rows.length && !modsDone" class="fixed inset-x-0 bottom-0 z-[150] flex items-center gap-2 border-t border-[var(--exile-color-border-subtle)] bg-[#14110d]/95 px-3 backdrop-blur py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
          <span class="min-w-0 flex-1 truncate"><b class="text-amber-100">狙い {{ rows.length }} 個</b><span class="opacity-60"> · 足したら決める</span></span>
          <button type="button" class="min-h-11 inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-40 px-4" @click="modsDone = true">決めた<Icon name="arrow-right" class="size-4" /></button>
        </div>
        <div v-if="phone && rows.length && !modsDone" class="h-20"></div>
        <!-- このベースに付く MOD (同じ枠の中。2026-10-05 オーナー「枠は一緒の枠で表示するべき」)。長いので枠の中で送り、上の完成図は見えたまま -->
        <div v-if="!modsDone" class="-mx-3 mt-3 max-h-[62vh] overflow-auto border-t border-white/10 px-3 [overflow-anchor:none] max-md:max-h-none max-md:overflow-visible">
          <StageModList embedded />
        </div>
      </div>

      <!-- 3 白ベース設定: 白ベースの値段 + 増強・消去スパムで狙う MOD (= フラクチャー予定、2 の中から) -->
      <div v-if="step3" :data-sim-cur="!whiteDone || undefined" :class="!whiteDone ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.04)]' : 'border-white/10 bg-white/[0.025]'" class="rounded-xl border px-5 py-4">
        <SimStepHead class="mb-3" :n="3" title="始め方・アイテムレベル・ベースの値段" :done="whiteDone" :current="!whiteDone" :redo="whiteDone" help="ベース 1 個の値段。分からなければ 0 のままでいい (費用の内訳でベース代として足すだけ)" @redo="goTo('white')" />
        <!-- 始め方 (前は 1 ベースの欄。2026-10-18 オーナー「MOD へ進む、そのあとに始め方を決める工程」) -->
        <SimStartPick v-if="!whiteDone" class="mb-3" />
        <!-- 付与スキルがあるベースは、選ぶまで始め方を出さない (値段が付与スキルで変わるので。2026-10-18 オーナー「決めてから表示させないと漏れる」) -->
        <p v-if="grantPending" class="text-[12px] text-amber-200">{{ tr("付与スキルを選ぶと、始め方とベースの値段が出る", "Choose the granted skill to see the start options and base prices") }}</p>
        <template v-else>
        <!-- 始め方は縦に全部並べて、ベースの値段を比べる (2026-10-18 オーナー「タブで出さず全部計算させるから縦にそれぞれ表示」)。行を押すとその始め方で回す。一番安い行に印 -->
        <div data-sim-starts class="flex flex-col gap-1.5 text-[11px]">
          <template v-for="k in startKinds" :key="k.k">
          <div data-sim-start-row :data-start="k.k" class="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5" :class="[s.simStart.value === k.k ? 'border-[var(--exile-color-border-brass)] bg-white/[0.04]' : 'border-white/10', startOff(k) ? 'opacity-45' : 'cursor-pointer hover:bg-white/[0.03]']" :title="tr(k.hint, k.hintEn)" @click="!whiteDone && !startOff(k) && (s.simStart.value = k.k)">
            <span class="grid size-4 shrink-0 place-items-center rounded-full border" :class="s.simStart.value === k.k ? 'border-amber-300' : 'border-white/30'"><span v-if="s.simStart.value === k.k" class="size-2 rounded-full bg-amber-300" /></span>
            <b class="w-36 shrink-0 text-[12px] max-md:w-auto"><Icon v-if="k.k === 'fractured'" name="lock" class="mr-0.5 inline size-3.5" />{{ tr(k.label, k.labelEn) }}</b>
            <span v-if="startOff(k)" class="opacity-80">{{ startOff(k) }}</span>
            <template v-else-if="k.k === 'item'">
              <PriceInput v-model="itemDivine" base="exalted" unit-key="sim.item" initial-unit="exalted" placeholder="0" />
              <span class="opacity-60">(エミュレーターの累計 {{ money(s.simStartCost.value) }} + 白ベース。直せる)</span>
            </template>
            <template v-else-if="k.k === 'fractured'">
              <span class="text-[var(--exile-color-text-secondary)]">{{ fracMembers[0]?.text }}</span>
              <PriceInput v-model="boughtDivine" base="exalted" unit-key="sim.bought" placeholder="値段" />
              <button type="button" class="inline-flex items-center gap-1 rounded px-1 text-[var(--exile-color-text-link)] hover:underline max-md:min-h-11" title="フラクチャーの MOD が付いたベースを取引所で探す (開くだけ)" @click.stop="searchBought">取引所で探す<Icon name="external" class="size-3.5" /></button>
              <span class="inline-block w-24 shrink-0" :class="ageOf('bought')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("bought")?.text ?? "" }}</span>
            </template>
            <template v-else-if="k.k === 'magic'">
              <span class="text-[var(--exile-color-text-secondary)]">{{ magicMods.length ? magicMods.join(" / ") : tr("2 で狙う MOD を足す", "Add target mods in step 2") }}</span>
              <PriceInput v-model="magicDivine" base="exalted" unit-key="sim.magic" placeholder="値段" />
              <span class="inline-block w-24 shrink-0" :class="ageOf('magic')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("magic")?.text ?? "" }}</span>
            </template>
            <template v-else-if="k.k === 'four'">
              <span class="text-[var(--exile-color-text-secondary)]">3 MOD + {{ fracMembers[0]?.text }}</span>
              <PriceInput v-model="fourDivine" base="exalted" unit-key="sim.four" placeholder="値段" />
              <button type="button" class="inline-flex items-center gap-1 rounded px-1 text-[var(--exile-color-text-link)] hover:underline max-md:min-h-11" title="狙いの MOD が付いたレア (固定済みは除く、MOD 4 つまで) を取引所で探す (開くだけ)" @click.stop="searchFour">取引所で探す<Icon name="external" class="size-3.5" /></button>
              <span class="inline-block w-24 shrink-0" :class="ageOf('four')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("four")?.text ?? "" }}</span>
            </template>
            <template v-else>
              <PriceInput v-model="whiteDivine" base="exalted" unit-key="sim.white" placeholder="0" />
              <button type="button" class="inline-flex items-center gap-1 rounded px-1 text-[var(--exile-color-text-link)] hover:underline max-md:min-h-11" :title="`アイテムレベル ${searchIlvl} 以上 (狙う MOD の段が付く一番高いレベル) の白のベースを取引所で探す (開くだけ)`" @click.stop="searchWhite">取引所で探す<Icon name="external" class="size-3.5" /></button>
              <span class="inline-block w-24 shrink-0" :class="ageOf('white')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("white")?.text ?? "" }}</span>
            </template>
            <span v-if="!startOff(k)" class="ml-auto shrink-0 tabular-nums" :class="cheapStart === k.k ? 'font-bold text-emerald-300' : 'opacity-80'">{{ startCost(k.k) != null ? money(startCost(k.k)!) : "—" }}</span>
            <span v-if="cheapStart === k.k" class="shrink-0 rounded-sm bg-emerald-500/20 px-1.5 py-px text-emerald-200">一番安い</span>
          </div>
          <!-- 白ベースの比べ: 適当なレア + 消去で 1 MOD まで (2026-10-18 オーナー) -->
          <SimRareStrip v-if="k.k === 'white' && !whiteDone" class="pl-8" :white="num(whiteDivine)" />
          </template>
        </div>
        <!-- フラクチャー予定は 2 狙う MOD で決める (2026-10-05 オーナー「狙う MOD の所でフラクチャー予定とか全部決めたら後が楽」)。ここは確認だけ -->
        <p class="mt-3 text-[12px] font-semibold text-[var(--exile-color-text-secondary)]" :class="fractureRows.length ? '' : 'max-md:hidden'">{{ s.simStart.value === "fractured" ? "フラクチャーの MOD (買う物)" : s.simStart.value === "four" ? "自分でフラクチャーする MOD" : "増強・消去スパムで狙う MOD (フラクチャー予定)" }}</p>
        <p v-if="!fractureRows.length" class="text-[11px] opacity-50 max-md:hidden">無し (フラクチャーしない。2 の付け方の予定で「フラクチャー予定」を選ぶと出る)</p>
        <p v-if="mixedSides" class="text-[11px] text-amber-200">候補がプレフィックスとサフィックスに分かれています (推奨は同じ側。マジックの間はどちらの側に付いても当たり)</p>
        <p v-for="(r, i) in fracMembers" :key="r.modId" class="flex items-center gap-2 py-0.5">
          <span class="w-8 text-[10px] opacity-60">{{ r.side }}</span>
          <span :class="r.tone">{{ r.text }}</span> <span class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span>
          <span v-if="calc?.each[i] && s.simStart.value !== 'fractured'" class="ml-auto text-[11px] tabular-nums opacity-80" title="増強 1 回でこの段以上が付く割合 (2 狙う MOD の出やすさは全段の重み、ここは打つ増強の下限で絞る)">増強で付く {{ pct(calc.each[i]!.p) }}<template v-if="calc.each[i]!.p === 0"> ({{ calc.grade }}では MOD レベルが低い)</template></span>
        </p>
        <div v-if="!whiteDone" class="mt-1 flex items-center gap-2">
          <span v-if="calc && fracMembers.length >= 2" class="text-[11px] opacity-80">付きやすさ 合計 {{ pct(calc.pHit) }}</span>
          <span v-if="num(startPrice) == null" class="ml-auto text-[11px] text-amber-200/80">{{ s.simStart.value === "white" ? "白ベースの値段を入れる (分からなければ 0)" : "買うベースの値段を入れる" }}</span>
          <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-40 max-md:min-h-11" :class="num(startPrice) == null ? '' : 'ml-auto'" :disabled="num(startPrice) == null" :title="num(startPrice) == null ? '白ベースの値段を入れると押せる' : undefined" @click="whiteDecide">決めた<Icon name="arrow-right" class="size-4" /></button>
        </div>
        </template>
      </div>

      <!-- 4 最安値スタート: フラクチャー済みのベースを手に入れるまでの 3 ルート (回さずに計算)。入れるのは買うベースの値段だけ -->
      <div v-if="stepStart" :data-sim-cur="!startDone || undefined" :class="!startDone ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.04)]' : 'border-white/10 bg-white/[0.025]'" class="rounded-xl border px-5 py-4">
        <SimStepHead class="mb-3" :n="stepNo.start" title="フラクチャー済みまでの一番安い道" :done="startDone" :current="!startDone" :redo="startDone" help="フラクチャー済みのベースを手に入れるまでの費用を、作る・買うの道ごとに比べる。この先の打ち方はどれも同じ" @redo="goTo('start')" />
        <table class="w-full table-fixed text-[12px] max-md:table-auto">
          <colgroup><col /><col class="w-[22rem] max-md:w-auto" /><col class="w-36 max-md:w-auto" /></colgroup>
          <tbody>
            <tr v-for="x in routes.list" :key="x.key" class="border-t border-white/5" :class="routes.best === x.key ? 'bg-emerald-500/10' : ''">
              <td class="py-1">{{ x.name }}<span v-if="routes.best === x.key" class="ml-1.5 rounded bg-emerald-500/25 px-1.5 text-[10px] text-emerald-200">一番安い</span></td>
              <td class="py-1">
                <span v-if="x.key === 'self'" class="text-[11px] opacity-70">1 回分 × 3 (当たり 1/3) + 消去 × 2<template v-if="calc && calc.grade !== '完全'"> · {{ calc.grade }}の増強で計算</template></span>
                <span v-else class="flex items-center gap-1.5 text-[11px]">
                  <PriceInput v-if="x.key === 'four'" v-model="fourDivine" base="exalted" unit-key="sim.four" placeholder="値段" />
                  <PriceInput v-else v-model="boughtDivine" base="exalted" unit-key="sim.bought" placeholder="値段" />
                  <button type="button" class="inline-flex items-center gap-1 rounded px-1 text-[var(--exile-color-text-link)] hover:underline disabled:opacity-40 max-md:min-h-11" :title="(x.key === 'four' ? '狙いの MOD が付いたレア (固定済みは除く) を取引所で探す (開くだけ)' : 'この MOD が固定済みのベースを取引所で探す (開くだけ)') + `。アイテムレベル ${searchIlvl} 以上`" @click="x.key === 'four' ? searchFour() : searchBought()">取引所で探す<Icon name="external" class="size-3.5" /></button>
                </span>
              </td>
              <td class="truncate py-1 text-right tabular-nums"><b v-if="x.cost != null">{{ money(x.cost) }}</b><span v-else class="text-[11px] opacity-50" :title="x.key === 'self' ? undefined : '値段が空 = 取引所に無い物として数えない (2026-10-06)'">{{ x.key === "self" ? "—" : "無し" }}</span></td>
            </tr>
          </tbody>
        </table>
        <p v-if="calc?.cantRoll" class="mt-1 text-[11px] text-rose-300">増強ではこの段は出ません (アイテムレベルが足りない)</p>
        <div class="mt-1.5 flex items-center gap-2">
          <button type="button" class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" :aria-expanded="open.calc" @click="toggle('calc')">内訳<Icon :name="open.calc ? 'chevron-up' : 'chevron-down'" class="size-3.5" /></button>
          <button v-if="!startDone" type="button" class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-40" @click="startDone = true">決めた<Icon name="arrow-right" class="size-4" /></button>
        </div>
        <!-- 内訳 (① 自作の 1 回分と、② の分かれ目) -->
        <div v-if="open.calc && calc" class="mt-1.5 rounded bg-black/25 px-2 py-1.5 text-[11px]">
          <p class="mb-1">① 自作: 1 個 = 1 回分 <b>{{ money(calc.once) }}</b> × 3 + 固定できた後の消去 × 2 {{ money(calc.after) }} = <b class="text-amber-100">{{ money(calc.total) }}</b>
            <span class="opacity-60">(増強 1 回で候補のどれかが付く {{ calc.pHit > 0 ? pct(calc.pHit) : "0%" }} → リロール平均 {{ Number.isFinite(calc.rerolls) ? calc.rerolls.toFixed(1) : "—" }} 回)</span></p>
          <table class="w-full">
            <tbody>
              <tr v-for="l in calc.lines" :key="l.name" class="border-t border-white/5">
                <td class="py-0.5">{{ l.name }}</td>
                <td class="w-20 py-0.5 text-right tabular-nums">× {{ Number.isFinite(l.n) ? l.n.toFixed(l.n < 10 && l.n % 1 ? 1 : 0) : "—" }}</td>
                <td class="w-24 py-0.5 text-right tabular-nums opacity-70">{{ money(l.each) }}</td>
                <td class="w-24 py-0.5 text-right tabular-nums">{{ money(l.n * l.each) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-1">② は 1 回分 = ベースの値段 + {{ money(calc.buyRest) }} (深淵のエッセンス・結晶化・骨・ネクロマンシーで印を置き換える壁 + フラクチャー) × 3 + 消去 × 2。<b class="text-sky-100">{{ money(calc.breakEven) }}</b> より安いベースなら ① より安い</p>
          <p v-if="calc.noAbyss" class="text-amber-300">このベースの深淵のエッセンスの値段が分かりません (0 で数えています)</p>
        </div>
      </div>

      <!-- ③ 付ける順番と付け方 (フラクチャー以外) -->
      <div v-if="stepOrder" :data-sim-cur="!orderDone || undefined" :class="!orderDone ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.04)]' : 'border-white/10 bg-white/[0.025]'" class="rounded-xl border px-5 py-4">
        <SimStepHead class="mb-3" :n="stepNo.order" title="付ける順番" :done="orderDone" :current="!orderDone" :redo="orderDone" help="目安の順番。打ち方で付ける MOD を選ぶ時、この順に並ぶ" @redo="goTo('order')" />
        <p v-if="!orderKeys.length" class="text-[11px] opacity-50">フラクチャーだけ (付ける物はありません)</p>
        <table v-else class="w-full">
          <thead v-if="redoOf.size">
            <tr class="text-[11px] text-[var(--exile-color-text-tertiary)]">
              <th colspan="3"></th>
              <th class="pb-1 text-right font-normal"><span class="inline-flex items-center gap-1">外した時の取り直し (目安)<HelpTip text="消去などで外れた時に、その MOD を付け直す費用の見込み。黄色はほかの MOD を巻き込む物" /></span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(k, i) in orderKeys" :key="k" class="border-t border-white/5">
              <td class="w-14 py-1">
                <span class="mr-1 font-bold text-amber-200">{{ i + 1 }}</span>
                <template v-if="!orderDone">
                  <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="moveOrder(k, -1)"><Icon name="chevron-up" class="size-4" /></button>
                  <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === orderKeys.length - 1" title="下へ" @click="moveOrder(k, 1)"><Icon name="chevron-down" class="size-4" /></button>
                </template>
              </td>
              <template v-if="orderRow(k)">
                <td class="w-10 py-1 text-[10px] opacity-60">{{ orderRow(k)!.side }}</td>
                <td class="py-1">
                  <span :class="orderRow(k)!.tone">{{ orderRow(k)!.text }}</span> <span class="ml-1 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ orderRow(k)!.rank }} 以上</span>
                  <span v-if="orderRow(k)!.alts.length" class="ml-1 text-[10px] text-amber-200">ほか {{ orderRow(k)!.alts.length }} つと合わせてどれか</span>
                  <span class="ml-1 text-[10px] opacity-60">{{ METHOD_JA[orderRow(k)!.method] }}</span>
                </td>
                <td class="w-48 py-1 text-right text-[11px] tabular-nums max-md:w-auto">
                  <span v-if="redoOf.get(orderRow(k)!.modId)" :class="redoOf.get(orderRow(k)!.modId)!.safe ? 'opacity-70' : 'text-amber-200'" :title="`取り直す時の見込み (計算機と同じ見積もり): ${REDO_METHOD_JA[redoOf.get(orderRow(k)!.modId)!.method]}で 1 回 ${money(redoOf.get(orderRow(k)!.modId)!.perTry)}・当たり ${pct(redoOf.get(orderRow(k)!.modId)!.p)}・外れ 1 回のやり直し ${money(redoOf.get(orderRow(k)!.modId)!.perMiss)}${redoOf.get(orderRow(k)!.modId)!.safe ? '' : '。外れを消す時にほかの物を巻き込む'}`">約 {{ money(redoOf.get(orderRow(k)!.modId)!.expected) }}</span>
                </td>
              </template>
              <template v-else>
                <td class="w-10 py-1 text-[10px] opacity-60">ルーン</td>
                <td class="py-1"><span class="text-amber-100">{{ runeJa(k) }}</span><span v-if="runeNeeded.has(k)" class="ml-1 text-[10px] opacity-60">(狙いの MOD に要る)</span></td>
                <td class="w-6 py-1 text-right">
                  <button v-if="!orderDone && !runeNeeded.has(k)" type="button" class="opacity-50 hover:text-rose-300 hover:opacity-100" title="順番計画から外す" @click="removeRune(k)">×</button>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
        <!-- ルーン: ステージの棚と同じ札。押すと順番計画に入れる / 外す (効き目はホバー) -->
        <div v-if="!orderDone && socketCount > 0 && runeChoices.length" class="mt-2 flex gap-2 text-[11px]">
          <p class="w-24 shrink-0 pt-1 leading-tight opacity-60">ルーン<br />(押して入れ切り)</p>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="r in runeChoices" :key="r.en" type="button"
              class="relative flex w-[66px] flex-col items-center rounded-lg border px-0.5 pb-0.5 pt-1 text-[10px] transition"
              :class="[r.inOrder ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60' : 'border-white/10 bg-black/30 hover:border-white/30', r.why && !r.inOrder ? 'cursor-not-allowed opacity-35' : '']"
              :title="`${r.ja}: ${r.effect}${r.why ? `\n${r.why}` : ''}`" @click="toggleRune(r)"
            >
              <img v-if="iconOf(r.k)" :src="iconOf(r.k)" alt="" class="h-7 w-7 object-contain" draggable="false" />
              <span v-else class="h-7 w-7 rounded border border-white/20"></span>
              <span class="w-full truncate text-center leading-tight">{{ r.ja }}</span>
              <span v-if="priceOf(r.k)" class="text-[9px] tabular-nums opacity-60">{{ simCurrency.money(priceOf(r.k)) }}</span>
              <span v-if="r.inOrder" class="absolute left-0.5 top-0.5 rounded bg-amber-600/90 px-1 text-[9px] font-bold text-white">{{ runeNeeded.has(r.k) ? "要る" : "入れた" }}</span>
            </button>
          </div>
        </div>
        <div v-if="!orderDone" class="mt-1 flex">
          <button type="button" class="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-3 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-40 max-md:min-h-11" @click="orderDone = true">決めた<Icon name="arrow-right" class="size-4" /></button>
        </div>
      </div>
    </template>
      <!-- 6 パターン (2026-10-06): 1 手ずつ。回すのはこの手の通り -->
      <div v-if="step4pre" :data-sim-cur="!patternDone || undefined" :class="!patternDone ? 'border-[var(--exile-color-border-brass)] bg-[rgba(201,162,90,0.04)]' : 'border-white/10 bg-white/[0.025]'" class="rounded-xl border px-5 py-4">
        <SimStepHead class="mb-3" :n="stepNo.play" title="打ち方" :done="patternDone" :current="!patternDone" :redo="patternDone" :note="tr(`${s.simStart.value === 'item' ? 'エミュレーターの状態' : s.simStart.value === 'magic' ? '買ったマジック' : fractureRow ? 'フラクチャー済みのベース' : '白のベース'}から 1 手ずつ`, `Step by step from ${s.simStart.value === 'item' ? 'the Emulator item' : s.simStart.value === 'magic' ? 'the bought magic' : fractureRow ? 'the fractured base' : 'a white base'}`)" :help="tr('状況ごとに「この時はこの手」を答えた物 = パターン。いくつか作って、回して費用を比べられる', 'Answers to “in this situation, do this” = a pattern. Make several and run them to compare costs')" @redo="patternDone = false" />
        <StagePatternEditor :busy="busy" :start="patternStart" :locked="patternDone" :quiz-base="quizBase" @run-one="(k: number) => run(k)" @active="(k: number) => (activePattern = k)" />
        <!--
          パターンの一覧はここ 1 つ (2026-10-07 オーナー「パターンの比べは何個もいらん、表示 1 個でいい」「回すパターンを選択できるように」)。
          チェックで全部まとめて回す時に入れるか、押すとその結果を下に。回していない物は「未実行」、組みかけは「未完成」
        -->
        <div v-if="!patternDone" class="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-[12px]" :class="stale && !busy ? '[&_.res]:opacity-50' : ''">
          <span class="flex items-center gap-1 text-[11px] font-medium tracking-wide text-[var(--exile-color-text-tertiary)]">まとめて回す <HelpTip text="チェックしたパターンをまとめて回し、費用を比べる。1 つだけ試す時は上の「このパターンを回す」" /></span>
          <!-- 枠のどこを押してもチェックが切り替わる (2026-10-07 オーナー「チェックボックスだけじゃなくて枠クリックで」)。金額の所だけは結果を下に出す -->
          <span v-for="(p, i) in s.simPatterns.value" :key="i" role="checkbox" :aria-checked="hasSteps(p) && !p.off" :aria-disabled="!hasSteps(p)" tabindex="0" class="flex select-none items-center gap-1.5 rounded-md py-1 pl-2 pr-1 transition" :class="[!hasSteps(p) ? 'cursor-default opacity-40' : 'cursor-pointer hover:bg-white/5', shownName === p.name && resultOf(p.name) ? 'bg-[var(--exile-color-bg-elevated)]' : '', p.off && hasSteps(p) ? 'opacity-50' : '']" :title="!hasSteps(p) ? '手が無いので回さない' : p.off ? '押すとまとめて回す時に入れる' : '押すとまとめて回す時に入れない'" @click="hasSteps(p) && togglePatternOff(i)" @keydown.space.prevent="hasSteps(p) && togglePatternOff(i)">
            <span class="grid size-3.5 place-items-center rounded-sm border" :class="p.off || !hasSteps(p) ? 'border-white/30' : 'border-[var(--exile-color-accent-focus)] bg-[var(--exile-color-accent-focus)] text-black'"><Icon v-if="!p.off && hasSteps(p)" name="check" class="size-3" :stroke="3" /></span>
            <b>{{ p.name }}</b>
            <button v-if="resultOf(p.name)" type="button" class="res flex items-center gap-1 rounded-full px-1.5 hover:bg-white/10" :title="stale ? '設定が変わりました。回し直すと合う (押すと結果を下に)' : '押すと結果を下に出す'" @click.stop="showResultByName(p.name)">
              <b class="tabular-nums text-[var(--exile-color-text-primary)]">{{ money(resultOf(p.name)!.out.r.perDone) }}</b>
              <span class="text-[var(--exile-color-text-tertiary)]">完成 {{ pct(resultOf(p.name)!.out.r.pDone) }}</span>
              <span v-if="cheapestName === p.name" class="rounded bg-[rgba(126,201,148,0.15)] px-1 text-[11px] text-[var(--exile-color-signal-up)]">一番安い</span>
            </button>
            <span v-else class="pr-1.5 text-[var(--exile-color-text-tertiary)]">{{ hasSteps(p) ? patternNote(p) : tr("答えが無い · 回さない", "No answers · not run") }}</span>
          </span>
          <SimProgress v-if="busy" :box="progressBox" :phase="phase" />
          <button v-if="busy" type="button" class="g-btn-red sm" @click="stop">中止</button>
          <span v-if="error" class="text-rose-300">{{ error }}</span>
          <!-- 開いているパターンの MOD 群を取引所 (JP) で探す (2026-10-07 オーナー「回すの横、相場ボタンじゃなくてこの MOD 群をそのまま検索にかけたい」) -->
          <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--exile-color-text-link)] hover:bg-white/5 hover:underline disabled:opacity-40" :class="busy ? '' : 'ml-auto'" :disabled="!s.simPatterns.value[activePattern] || !hasSteps(s.simPatterns.value[activePattern]!)" :title="`${s.simPatterns.value[activePattern]?.name ?? ''} の狙い (付ける MOD とフラクチャー) が付いた物を取引所 (JP) で探す。開くだけ`" @click="searchPattern(activePattern)">この狙いで取引所を見る<Icon name="external" class="size-3.5" /></button>
          <!-- 1 人の上限 (手の数)。重い MOD を狙う時に上げる (2026-10-07) -->
          <label class="flex items-center gap-1.5 text-[12px] text-[var(--exile-color-text-secondary)]" title="1 人が打てる手の上限。超えた人は完成しなかった扱い (カオスで重い MOD を狙う時は上げる。回るのは遅くなる)">1 人の上限
            <select v-model.number="maxSteps" class="h-8 rounded-md border border-[var(--exile-color-border-subtle)] bg-black/40 px-1.5" :disabled="busy">
              <option v-for="n in MAX_STEPS_CHOICES" :key="n" :value="n">{{ n.toLocaleString() }} 手</option>
            </select>
          </label>
          <button type="button" class="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--exile-color-accent-focus)] px-4 text-[13px] font-semibold text-black transition hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-40 max-md:min-h-11" :disabled="busy || !!blocked" :title="blocked ?? `チェックの入ったパターンで、${runs.toLocaleString()} 人がそれぞれ完成まで作った場合を試す (1 人 ${maxSteps.toLocaleString()} 手まで。組みかけは組めている所まで)`" @click="run()"><Icon name="play" class="size-4" />回す<span v-if="runnable.length > 1" class="rounded-full bg-black/25 px-1.5 text-[11px] tabular-nums" :title="`チェックした ${runnable.length} つのパターンを回す`">{{ runnable.length }} つ</span></button>
        </div>
      </div>
    <StageFracturePicker v-if="s.simAltFor.value" :alt-for="s.simAltFor.value" @close="s.simAltFor.value = null" />

    <template v-if="step4">
    <!--
      結果 (2026-10-07 作り直し。オーナー「UI カスすぎない、パッと見て数字が分かりづらい」「7 回すは機能してないからいらない」
      「ベースとそれ以降のクラフト金額も、何にお金がかかったかに分けて」)。上から いくらか → 運でどれくらい振れるか → 何にお金がかかったか (ベース / クラフト)
    -->
    <div v-if="summary && recipeOut" data-sim-result class="scroll-mt-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3" :class="stale ? 'opacity-60' : ''">
      <p v-if="stale" class="mb-1 text-[11px] text-amber-200">設定が変わりました。もう一度「回す」で出し直してください</p>
      <div class="flex flex-wrap items-stretch gap-x-5 gap-y-2">
        <!-- 手の上限で止まった人が多い時は、バグではなく打つ回数が足りないと分かるように (2026-10-08 オーナー「手が多すぎて止まったのかバグったのか」) -->
        <div v-if="tooManySteps" class="mb-2 flex w-full flex-wrap items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-[12px]">
          <span class="text-amber-100">{{ pct(tooManySteps) }} の人が {{ (summary.maxSteps ?? maxSteps).toLocaleString() }} 手で完成しなかった (止まっただけ。重い MOD は打つ回数が要る)</span>
          <button v-if="nextMaxSteps" type="button" class="ml-auto rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-1 font-bold text-amber-100 max-md:min-h-11" :disabled="busy" @click="maxSteps = nextMaxSteps; void run()">{{ nextMaxSteps.toLocaleString() }} 手で回し直す</button>
        </div>
        <div class="flex flex-col">
          <span class="flex items-center gap-1.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ shownName }} · 1 個あたりの平均<template v-if="s.simStart.value === 'item'"> · この状態から先</template>
            <HelpTip text="平均 = 全員の出費 ÷ 完成した数。運の悪い人も入るので、真ん中の人より高く出る" />
          </span>
          <span class="text-[30px] font-bold leading-tight tabular-nums text-[var(--exile-color-accent-focus)]">{{ moneyT(split.base + split.craft) }}</span>
          <span class="text-[12px] tabular-nums text-[var(--exile-color-text-secondary)]">ベース {{ moneyT(split.base) }} + クラフト {{ moneyT(split.craft) }}</span>
        </div>
        <div v-if="luck[0]" class="flex flex-col border-l border-white/10 pl-4">
          <span class="text-[12px] text-[var(--exile-color-text-secondary)]">2 人に 1 人は</span>
          <span class="text-[22px] font-semibold leading-tight tabular-nums text-[var(--exile-color-text-primary)]">{{ moneyT(luck[0].v) }}</span>
          <span class="text-[12px] text-[var(--exile-color-text-tertiary)]">以内で完成</span>
        </div>
        <span class="inline-flex h-7 items-center gap-1 self-center rounded-full px-2.5 text-[12px] font-semibold tabular-nums" :class="summary.pDone >= 0.995 ? 'bg-[rgba(126,201,148,0.14)] text-[var(--exile-color-signal-up)]' : summary.pDone >= 0.8 ? 'bg-[rgba(224,201,122,0.14)] text-[var(--exile-color-signal-warn)]' : 'bg-[rgba(229,128,107,0.14)] text-[var(--exile-color-signal-down)]'" :title="recipeOut.r.stops.map((x) => `${pct(x.p)}: ${x.reason}`).join(' / ') || '全員完成'"><Icon v-if="summary.pDone >= 0.995" name="check" class="size-3.5" />完成 {{ pct(summary.pDone) }}<span v-if="summary.pDone < 0.995" class="font-normal opacity-80">(打ち切り {{ pct(1 - summary.pDone) }})</span></span>
        <HelpTip v-if="summary.pDone < 0.995" class="self-center" :text="`打ち切り = 1 人の上限 (${(summary.maxSteps ?? maxSteps).toLocaleString()} 手) に届いて完成しなかった人。上限を上げるか、ハズレルート設定を見直す`" />
        <span v-if="cardOk" class="ml-auto flex items-center gap-1.5 self-center">
          <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--exile-color-border-brass)] px-3 text-[13px] text-[var(--exile-color-text-primary)] transition hover:bg-[var(--exile-color-bg-elevated)]" title="この手順と結果を 1 枚の画像に (PNG で保存)" @click="saveCard"><Icon name="image" class="size-4" />手順を画像で保存</button>
          <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-[var(--exile-color-text-secondary)] transition hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" title="画像をクリップボードに (Discord などに貼れる)" @click="copyCard"><Icon name="copy" class="size-4" />コピー</button>
          <span v-if="cardNote" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ cardNote }}</span>
        </span>
      </div>

      <!-- 運の幅 -->
      <!-- 1 人が打てる手の上限 (recipe-sim の maxSteps 既定 4,000)。超えた人は「手が多すぎる」で未完成 (2026-10-07 オーナー「4000 回が限度って書いてない」) -->
      <p class="mt-5 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--exile-color-text-primary)]">運の幅 <span class="text-[12px] font-normal text-[var(--exile-color-text-tertiary)]">{{ summary.runs.toLocaleString() }} 人が作ってみた</span>
        <HelpTip :text="`同じ打ち方で ${summary.runs.toLocaleString()} 人が 1 個ずつ作った時の、完成までの出費の散らばり。1 人 ${(summary.maxSteps ?? maxSteps).toLocaleString()} 手を超えた人は完成しなかった扱い (使ったお金は平均に入る)`" />
      </p>
      <!-- 線には印だけ、言葉は下に 1 行で (印の横に書くと長い文がくっついた) -->
      <div class="relative mt-2 h-5 max-w-2xl">
        <div class="absolute left-0 right-0 top-2 h-1 rounded bg-white/15"></div>
        <div v-for="(q, qi) in luck" :key="q.label" class="absolute top-0.5 h-4 w-[3px] -translate-x-1/2 rounded" :class="q.top ? 'bg-white/70' : qi === 0 ? 'bg-[var(--exile-color-accent-focus)]' : 'bg-[var(--exile-color-text-tertiary)]'" :style="{ left: q.left }" :title="`${q.label} ${moneyT(q.v)} ${q.tail}`"></div>
      </div>
      <div class="mt-2 grid max-w-2xl grid-cols-3 gap-3 text-[12px] max-md:grid-cols-1">
        <div v-for="(q, qi) in luck.filter((x) => !x.top)" :key="q.label" class="flex flex-col">
          <span class="text-[var(--exile-color-text-secondary)]">{{ q.label.replace("完成した ", "") }}</span>
          <b class="text-[15px] tabular-nums" :class="qi === 0 ? 'text-[var(--exile-color-accent-focus)]' : 'text-[var(--exile-color-text-primary)]'">{{ moneyT(q.v) }} <span class="text-[12px] font-normal text-[var(--exile-color-text-tertiary)]">{{ q.tail }}</span></b>
        </div>
      </div>
      <!-- 何にお金がかかったか (ベース / クラフト) -->
      <div class="mt-5 grid max-w-4xl gap-x-10 gap-y-4 @3xl:grid-cols-2 max-md:grid-cols-1">
        <div v-for="g in costGroups" :key="g.name">
          <p class="mb-1.5 flex items-baseline gap-2 text-[13px]"><b class="shrink-0 whitespace-nowrap">{{ g.name }}</b><span class="min-w-0 truncate text-[12px] text-[var(--exile-color-text-tertiary)]">{{ g.note }}</span><span class="ml-auto shrink-0 whitespace-nowrap font-semibold tabular-nums">{{ moneyT(g.total) }}</span></p>
          <!-- スマホは名前を 1 行目いっぱいに (「カオスオーブ × 5,…」と切れていた) -->
          <div class="grid grid-cols-[minmax(0,1fr)_5rem_5rem_2.5rem] items-center gap-x-3 gap-y-1.5 text-[13px] max-md:grid-cols-[minmax(0,1fr)_4.5rem_2.5rem]">
            <template v-for="x in g.items" :key="x.name">
              <span class="truncate max-md:col-span-3 max-md:whitespace-normal" :title="x.name">{{ x.name }}<span v-if="x.n" class="text-[12px] text-[var(--exile-color-text-tertiary)]"> × {{ fmtCount(x.n) }}</span></span>
              <div class="h-1.5 rounded-full bg-white/10"><div class="h-1.5 rounded-full" :class="g.bar" :style="{ width: `${Math.max(2, x.share * 100)}%` }"></div></div>
              <span class="text-right tabular-nums">{{ moneyT(x.cost) }}</span>
              <span class="text-right text-[12px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ Math.round(x.share * 100) }}%</span>
            </template>
          </div>
        </div>
      </div>
      <!-- 付いていた割合は完成が 100% でない時だけ (組みかけのパターンでどこまで付くか。100% なら全部 100% で要らない。2026-10-07 オーナー「ここいらん、デフォで畳んでいい」) -->
      <div v-if="summary.pDone < 0.995 && recipeOut.r.hitRates?.length" class="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span class="text-[var(--exile-color-text-secondary)]">終わった時に付いていた割合</span>
          <span v-for="h in recipeOut.r.hitRates" :key="h.modId" class="rounded-md bg-white/[0.05] px-2 py-0.5">
            <span :class="hitName(h.modId).tone" :title="hitName(h.modId).text">{{ hitShort(h.modId) }}</span>
            <b class="ml-1 tabular-nums" :class="h.p >= 0.9 ? 'text-emerald-300' : h.p >= 0.5 ? 'text-amber-200' : 'text-rose-300'">{{ pct(h.p) }}</b>
          </span>
        </div>
        <p v-for="x in recipeOut.r.stops.filter((y) => !/手が多すぎる/.test(y.reason))" :key="x.reason" class="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--exile-color-signal-warn)]">{{ /手が多すぎる/.test(x.reason) ? "打ち切り" : "完成しなかった" }} {{ pct(x.p) }}<HelpTip :text="/手が多すぎる/.test(x.reason) ? `1 人の上限 (${(summary.maxSteps ?? maxSteps).toLocaleString()} 手) に届いた人。上限を上げるか、ハズレルート設定を見直す` : x.reason" /></p>
      <!-- 畳む物 -->
      <div class="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3 text-[13px]">
        <button type="button" class="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" :aria-expanded="open.more" @click="toggle('more')"><Icon :name="open.more ? 'chevron-down' : 'chevron-right'" class="size-4" />始め方の比べ</button>
        <HelpTip text="同じ打ち方で、白から作る・レアのベースを買う・フラクチャー済みを買う・完成品を買う、のどれが安いか。買う値段は取引所で見て入れる" />
      </div>
      <template v-if="open.more">
    <!-- 始め方の比べ (回した後) -->
    <div v-if="recipeOut" class="mt-2 rounded-lg bg-black/20 px-4 py-3 text-[13px]">
      <!-- 列の幅は固定 (金額の欄の字が変わっても入力欄が動かない。2026-10-05 オーナー「入力時 UI がズレる、入力する所は軸に」) -->
      <table class="w-full table-fixed max-md:table-auto">
        <colgroup><col class="w-64 max-md:w-auto" /><col /><col class="w-40 max-md:w-auto" /></colgroup>
        <tbody>
          <tr v-for="x in compare.list" :key="x.key" class="border-t border-white/5" :class="compare.best === x.key ? 'bg-emerald-500/10' : ''">
            <td class="py-1.5">{{ x.name }}<span v-if="compare.best === x.key" class="ml-1.5 rounded bg-[rgba(126,201,148,0.15)] px-1.5 text-[11px] text-[var(--exile-color-signal-up)]">一番安い</span></td>
            <td class="py-1">
              <span v-if="x.key === 'four'" class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <PriceInput v-model="fourDivine" base="exalted" unit-key="sim.four" placeholder="値段" />
                <button type="button" class="inline-flex items-center gap-1 rounded px-1 text-[var(--exile-color-text-link)] hover:underline max-md:min-h-11" title="狙いの MOD が付いたレアを取引所で探す (固定済みは除く。開くだけ)" @click="searchFour">取引所で探す<Icon name="external" class="size-3.5" /></button>
                <span class="inline-block w-24 shrink-0" :class="ageOf('four')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("four")?.text ?? "" }}</span>
              </span>
              <span v-else-if="x.key === 'bought'" class="text-[12px] text-[var(--exile-color-text-tertiary)]">値段は上の 3〜4 で入れた物</span>
              <span v-else-if="x.key === 'done'" class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <PriceInput v-model="doneDivine" base="exalted" unit-key="sim.done" placeholder="値段" />
                <button type="button" class="inline-flex items-center gap-1 rounded px-1 text-[var(--exile-color-text-link)] hover:underline max-md:min-h-11" title="狙いの MOD が全部付いた物を取引所で探す (普通・固定済み・冒涜のどれでも。開くだけ)" @click="searchDone">取引所で探す<Icon name="external" class="size-3.5" /></button>
                <span class="inline-block w-24 shrink-0" :class="doneAge?.old ? 'text-amber-300' : 'opacity-60'">{{ doneAge?.text ?? "" }}</span>
              </span>
            </td>
            <td class="truncate py-1 text-right tabular-nums"><b v-if="x.cost != null">{{ money(x.cost) }}</b><span v-else class="text-[11px] opacity-50">{{ x.note }}</span></td>
          </tr>
        </tbody>
      </table>
      <p v-if="stale && recipeOut" class="mt-1 text-[11px] text-amber-200">設定が変わりました。「回す」で出し直すと作る側の数字も合います</p>
    </div>

      </template>
    </div>
    </template>
  </div>
</template>
