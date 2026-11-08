<!--
  PhoneIssues.vue — スマホ版の「足りない所」(PC と同じルート精査 = use-tree-check の下は押した時だけ回る)。
  10-26 オーナーの選んだ失敗時の挙動の案 2「スマホにも精査」(前はスマホに無く、打てない・外れを持ったまま戻る・分かれ目の行が無い などが見えなかった)。
  ページの中は 1 行「足りない所 n ▾」だけ (10-26 夜オーナー OK、一覧が質問より上で 547px を取り、開いても質問が画面の外だった)。押すと下から重ね窓で全部 (文は省略しない、決まり 10)。
  窓の行を押すと、その箱の重ね窓 (案 B) か、閉じていればその箱の質問へ
-->
<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import { simSheet } from "./sim-sheet";
import { useTree } from "../tree/use-tree";
import { routeKeyOf, useTreeCheck } from "../tree/use-tree-check";
import { phoneCheck, sheet, testedKey, usePhoneQuiz } from "./use-phone-quiz";
import { holeAgain, holeBusy, holeName, holesCount, holesWhat, issueGroups } from "../tree/hole-check";
import { stepOf } from "../tree/tree-fail";
import TreeBugReport, { reportTreeBug } from "../tree/TreeBugReport.vue";
import { tr } from "../../../i18n/lang";

const t = useTree();
const q = usePhoneQuiz();
const check = useTreeCheck(t.doc, () => !t.needBase.value && !t.goalInline.value);
const { checking, progress } = check;
/**
 * スマホは答えていない道を質問で聞くので、その分 (行き先を決めていない箱・道が残っている間の「完成の箱が無い」) は一覧に出さない
 * (10-26 組みかけの指輪で 4 件中 4 件がこれで、質問と同じ事を赤で繰り返していた)。分かれ目の行の行き先が無いのは質問に無いので出す
 */
const issues = computed(() => (check.issues.value ?? []).filter((x) => !(x.kind === "open" && !t.doc.value.boxes[x.boxId]?.split) && !(x.kind === "noDone" && x.boxId === "start" && q.questions.value.length > 0)));
/** 隠している「完成の箱が無い」がある (未定の質問が残っている間)。緑の「止まる所なし」だけだと完成の箱が無いのに合格に見えた (10-27 夜モンキー 2 回目 8、スイッチ phoneTestDone) */
const noDoneYet = computed(() => (check.issues.value ?? []).some((x) => x.kind === "noDone"));
// 下の帯の「100 人回す」が読む (合格まで止める、S-70)
/** 箱ごとにまとめた行 (数 = 箱の数、PC の未設定と同じ数え、11-08)。同じ箱の同じ文は 1 行 */
const groups = computed(() => issueGroups(issues.value, t.doc.value).map((g) => ({ ...g, rows: g.rows.filter((x, i) => g.rows.findIndex((y) => y.text === x.text) === i) })));
const head = (id: string): string => (id ? tr(`${stepOf(t.doc.value, id)} 段目・${q.boxTitle(id)}`, `Step ${stepOf(t.doc.value, id)}: ${q.boxTitle(id)}`) : tr("木の全体", "Whole tree"));
watchEffect(() => { phoneCheck.value = { busy: checking.value, passed: check.passed.value, holes: groups.value.length }; });
/** 穴チェックを押した後 (木の形がその時のまま) だけ結果を出す */
const tested = computed(() => testedKey.value === routeKeyOf(t.doc.value));
function test(): void { testedKey.value = routeKeyOf(t.doc.value); void check.runCheck(); }
/** 一覧の重ね窓を開いている */
const listOpen = ref(false);
function open(id: string): void {
  listOpen.value = false;
  if (!id) return; // 箱の無い木の不具合は寄る箱が無い
  sheet.value = { id, issue: issues.value.filter((x) => x.boxId === id).map((x) => x.text).join(" / ") };
}
// 殻は共通の ModalShell の下から出る形 (U-15・U-21、11-07 オーナー OK): Esc・後ろを押す・後ろのページの止め・重なりの段 z-300 は共通の物
</script>

<template>
  <!-- 穴チェック (PC の帯と同じ言い方)。押す前は足りない所を出さない -->
  <button v-if="!tested" type="button" data-phone-test class="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-white/[0.06] px-3 text-[13px] text-sim-body hover:bg-white/10" @click="test">{{ holeName() }}</button>
  <p v-else-if="!checking && !issues.length" data-phone-test-ok class="flex min-h-10 flex-wrap items-center justify-center gap-x-2 text-center text-[13px] font-bold" :class="noDoneYet ? 'text-amber-200' : 'text-emerald-300'">{{ q.questions.value.length ? tr(`✓ 止まる所なし · 未定 ${q.questions.value.length}${noDoneYet ? " · 完成の箱がまだ無い" : ""}`, `✓ No dead ends · ${q.questions.value.length} open${noDoneYet ? " · no done box yet" : ""}`) : tr("✓ 合格", "✓ Passed") }} <button type="button" class="min-h-10 px-1 text-[12px] font-normal text-sim-dim underline decoration-white/20" @click="test">{{ holeAgain() }}</button></p>
  <button v-else type="button" data-phone-issues :disabled="checking && !issues.length" class="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-rose-400/40 bg-[#1d0f10] px-3 py-1.5 text-left text-[13px] font-bold text-rose-200" :aria-expanded="listOpen" @click="listOpen = true">
    <span class="min-w-0 flex-1 break-words text-center">{{ checking ? `${holeBusy()}${progress ? ` ${progress.n}/${progress.of}` : ""}` : holesCount(groups.length) }}</span>
    <span v-if="issues.length" class="shrink-0 text-[12px] font-normal text-rose-100/80">{{ tr("見る ▾", "View ▾") }}</span>
  </button>
  <!-- 一覧の重ね窓 (閉じれば元の場所・スクロールのまま) -->
  <ModalShell :open="listOpen && issues.length > 0" sheet :label="holesCount(groups.length)" :panel-class="simSheet('border-rose-400/70')" body-class="px-3 pb-3 pt-2" @close="listOpen = false">
      <div data-phone-issues-sheet>
        <p class="text-[14px] font-bold text-rose-200">{{ holesCount(groups.length) }}</p>
        <p class="mb-2 break-words text-[12px] text-sim-dim">{{ holesWhat() }}</p>
        <div class="flex flex-col gap-1.5">
          <div v-for="g in groups" :key="g.boxId || '-'" class="flex flex-col gap-1">
            <button type="button" data-phone-issue :data-box-id="g.boxId || undefined" class="min-h-11 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-left text-[13px]" @click="open(g.boxId)">
              <b class="block break-words text-rose-100">{{ head(g.boxId) }}</b>
              <span v-for="(x, i) in g.rows" :key="i" class="block break-words text-[#e8d8c8]">{{ x.text }}</span>
            </button>
            <details v-for="(x, i) in g.rows.filter((r) => r.detail)" :key="`d${i}`" class="px-2 text-[12px] text-sim-dim"><summary class="min-h-8 cursor-pointer select-none">{{ tr("詳しく", "Details") }}</summary><p class="break-words">{{ x.detail }}</p></details>
            <button v-if="g.rows.some((x) => x.kind === 'orphan')" type="button" data-phone-issue-report class="g-btn !min-h-11 self-start" @click="reportTreeBug(t.doc.value); listOpen = false">{{ tr("要望・バグを送る", "Send feedback") }}</button>
          </div>
        </div>
      </div>
    <template #footer>
        <button type="button" data-phone-issues-close class="g-btn !min-h-11 flex-1" @click="listOpen = false">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
  <TreeBugReport />
</template>
