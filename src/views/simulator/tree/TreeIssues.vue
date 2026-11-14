<!--
  TreeIssues.vue — ルート精査の結果の一覧 (SimTreePage から分けた、2026-10-22)。上の帯の「未設定 n ▾」を押した時だけ帯の下に落ちる窓
  (10-26 夜オーナー「ツリーで使える所がめちゃくちゃ狭い」: 右の列に開きっぱなしにしない)。枠の外を押す・Esc・行を押す (その箱へ寄る) で閉じる。
  行は箱ごとにまとめ「7 段目・打った後」の下に文を並べる。見出しの数 = 箱の数 (11-08 オーナー「足りない所と下の未設定の数字が合わない。未設定に合わせて」)。
  木の側の不具合 (kind orphan) の行は「要望・バグを送る」で木の URL を入れた要望の窓を開く (11-08 オーナー「本体バグとして要望へって促してくれ」)
  木の途中の未設定 (S-107d・U-05f、スイッチ actLog) は赤と分けて琥珀の節: 行の 2 行目に訳と消し方、要望のボタンは節の一番下に 1 つ
-->
<script setup lang="ts">
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { holesCount, holesWhat, issueGroups } from "./hole-check";
import { stepOf } from "./tree-fail";
import BusyTag from "../../../components/ui/BusyTag.vue";
import { midIdsOf, midListFoot, midListHead, midListWhat, midRowWhy, midSendAsIs } from "./tree-mid-unset";

/** busy = 精査の途中 (見出しに進みの札。穴は辿った人から順に足される)。mid = 木の途中の未設定 (S-107d) */
const props = defineProps<{ issues: CheckIssue[]; doc: TreeDoc; lower: boolean; boxName: (id: string) => string; busy?: { text: string; n?: number; of?: number } | null; mid?: readonly CheckIssue[] }>();
const emit = defineEmits<{ go: [id: string]; close: []; /** 木の側の不具合を要望で送る */ report: [] }>();

const midIds = computed(() => midIdsOf(props.mid ?? []));
// 同じ箱の同じ文は 1 行 (要確認は 1 つの箱に何件でも同じ文)
const all = computed(() => issueGroups(props.issues, props.doc).map((g) => ({ ...g, rows: g.rows.filter((x, i) => g.rows.findIndex((y) => y.text === x.text) === i) })));
const isMid = (g: { boxId: string; rows: CheckIssue[] }): boolean => midIds.value.has(g.boxId) && g.rows.every((x) => x.kind === "orphan");
const groups = computed(() => all.value.filter((g) => !isMid(g)));
const mids = computed(() => all.value.filter(isMid));
const head = (id: string): string => (id ? tr(`${stepOf(props.doc, id)} 段目・${props.boxName(id)}`, `Step ${stepOf(props.doc, id)}: ${props.boxName(id)}`) : tr("木の全体", "Whole tree"));
// 出しっぱなし: 行を押してもその箱へ移るだけで閉じない。閉じるのは未設定の札をもう一度押す・「閉じる」だけ
// (11-08 オーナー「その一覧押したら勝手に閉じちゃうけど出しっぱなしでおk。そこ未設定もっかい押したら閉じるで」。前の枠の外・Esc で閉じる 10-26 は撤回)
function go(id: string): void { if (id) emit("go", id); }
</script>

<template>
  <div data-tree-issues role="dialog" data-overlay :aria-label="tr('未設定', 'Unset')" class="flex max-h-[min(60vh,520px)] w-[440px] max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto rounded-lg border px-2 py-1.5 text-[12px] shadow-[0_10px_30px_rgba(0,0,0,0.7)]"
    :class="[groups.length ? 'border-rose-500/40 bg-[#1c0f10]' : mids.length ? 'border-amber-400/50 bg-[#1a150c]' : busy ? 'border-white/10 bg-[#15110c]' : 'border-emerald-500/40 bg-[#0d1a12]']">
    <div class="flex items-center gap-2">
      <b :class="groups.length ? 'text-rose-200' : mids.length ? 'text-amber-200' : busy ? 'text-[#d8ccb4]' : 'text-emerald-200'">{{ groups.length ? holesCount(groups.length) : mids.length ? midListHead(mids.length) : busy ? tr("精査中", "Checking") : tr("未設定は無かった (5 人で全部の枝を通した)", "Nothing unset (all branches walked by 5 runs)") }}</b>
      <BusyTag v-if="busy" :text="busy.text" :n="busy.n" :of="busy.of" />
      <button type="button" class="g-btn sm ml-auto" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
    </div>
    <p v-if="groups.length" data-tree-issues-what class="opacity-70">{{ holesWhat() }}</p>
    <div v-for="g in groups" :key="g.boxId || '-'" data-tree-issue-group :data-box-id="g.boxId || undefined" class="flex shrink-0 flex-col">
      <button type="button" data-tree-issue-row class="flex min-h-7 items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-white/5" @click="go(g.boxId)">
        <span class="mt-0.5 shrink-0 rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white">!</span>
        <!-- 箱の名前と文は縦に積んで折り返し、全文 (… で切らない、10-26 ブラック 13) -->
        <span class="flex min-w-0 flex-col">
          <span class="break-words opacity-70">{{ head(g.boxId) }}</span>
          <span v-for="(x, i) in g.rows" :key="i" class="break-words">{{ x.text }}</span>
        </span>
      </button>
      <!-- 詳しい文は開いた時だけ (止まりの訳、11-08) -->
      <details v-for="(x, i) in g.rows.filter((r) => r.detail)" :key="`d${i}`" data-tree-issue-detail class="ml-7 opacity-70"><summary class="cursor-pointer select-none">{{ tr("詳しく", "Details") }}</summary><p class="break-words">{{ x.detail }}</p></details>
      <button v-if="g.rows.some((x) => x.kind === 'orphan')" type="button" data-tree-issue-report class="g-btn sm ml-7 mt-0.5 self-start" @click="emit('report')">{{ tr("要望・バグを送る", "Send feedback") }}</button><!-- 一覧は閉じない: 要望の窓を閉じると一覧が開いたまま戻る (11-08 オーナー「なこして」) -->
    </div>
    <!-- 木の途中の未設定 (琥珀、U-05f) -->
    <section v-if="mids.length" data-tree-mid-list class="flex flex-col gap-1" :class="groups.length ? 'mt-1 border-t border-amber-400/20 pt-1.5' : ''">
      <b v-if="groups.length" class="text-amber-200">{{ midListHead(mids.length) }}</b>
      <p class="text-amber-100/70">{{ midListWhat() }}</p>
      <button v-for="g in mids" :key="g.boxId" type="button" data-tree-mid-row :data-box-id="g.boxId" class="flex min-h-7 items-start gap-2 rounded px-1 py-0.5 text-left hover:bg-white/5" @click="go(g.boxId)">
        <span class="mt-0.5 shrink-0 rounded-sm bg-amber-500 px-1.5 text-[11px] font-bold text-black">?</span>
        <span class="flex min-w-0 flex-col">
          <span class="break-words opacity-70">{{ head(g.boxId) }}</span>
          <span class="break-words text-amber-100/90">{{ midRowWhy() }}</span>
        </span>
      </button>
      <div class="mt-0.5 flex flex-col gap-1 border-t border-amber-400/20 pt-1.5">
        <p class="text-amber-100/80">{{ midListFoot() }}</p>
        <button type="button" data-tree-mid-report class="g-btn sm self-start" @click="emit('report')">{{ midSendAsIs() }}</button>
      </div>
    </section>
  </div>
</template>
