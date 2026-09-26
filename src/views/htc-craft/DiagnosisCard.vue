<script setup lang="ts">
/**
 * DiagnosisCard.vue — MOD 解析 + ベース診断 (2026-09-24)
 *
 * オーナー:「MOD 解析も別に表示せずに、MOD 解析 + ベース診断まで直通で通していいよ。その結果だけ
 * 分かりやすく簡潔に表示したらおけ」。細かい表は HtcCraftLab の「詳しく」に畳んである。
 *
 * 3 枚 (オーナー 2026-09-24:「ベースの所で複数選択で開始フラクチャー選びたい。その時点で検索かけたいから取得は手動。
 * 完成品こそ一番ゆるく。真ん中は結果表示、取得後に表示する形で徐々に」):
 *   ベース (固定済みにして始める MOD を選んで「探す」) / 始め方の結果 (一番安い 1 つ、他は畳む) / 完成品と比べる
 * 取引所へは「探す」を押した時だけ ([[useStartSearch.ts]])。
 */
import { computed, onBeforeUnmount, watch } from "vue";
import { tradeAuto } from "../../services/trade2/auto-price";
import { sideLimits } from "../../services/htc/bridge";
import { withSocketLimits } from "../../services/htc/sockets";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import { zeroStart } from "./craft-settings";
import TreeFracturePanel from "./TreeFracturePanel.vue";
import BuyOrCraftSection from "./BuyOrCraftSection.vue";
import { useThreeWay } from "./three-way";
import ModBreakdown from "./ModBreakdown.vue";
import { MAX_STARTS, useStartSearch } from "./useStartSearch";
import { useFinishedCompare } from "./useFinishedCompare";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
const baseJa = computed(() => c.item.value?.baseText ?? c.bases.value.find((b) => b.current)?.ja ?? baseType.value ?? "");
// セールの凱旋を差せばサフィは 1 つ多い (2026-09-26)
const lim = computed(() => withSocketLimits(c.data.value ? sideLimits(c.data.value, baseType.value) : { prefix: 3, suffix: 3 }, c.socketOn.value));
/** 別のベースの方が合う時だけ 2 つまで (枠が違う・暗黙がタダ・品質の上限) */
const others = computed(() => c.bases.value.filter((b) => b.fits && !b.current && (b.maxQualityPlus || b.implicits.length)).slice(0, 2));
const quality = computed(() => c.item.value?.quality ?? zeroStart.value.quality);
/** 英語の行 (忍者のコピー) は日本語に */
const ja = (t: string): string => jaOfPastedLine(t) ?? t;
/** 完成品を買うのと作るのと (始め方で選んだ物の初動を足す) */
const fin = useFinishedCompare(c, computed(() => ss.chosen.value?.startCost ?? null));
/** 始め方: 選んで押した時だけ探す。候補を全部取ったら完成品を 1 本 */
const ss = useStartSearch(c, async () => { if (fin.query.value && !fin.found.value) await fin.search(); });
/**
 * 解析が通ったら、順に取る: ② 始め方 (候補を上から 1 つずつ) → ③ 完成品 → 下の作り方のシミュレーション
 * (オーナー 2026-09-25:「順に取得してから表示していってくれ。真ん中終わったら次、完成終わったらシミュレーションって順番」)。
 * 探せない時 (非推奨・候補なし) は診断の印を下ろして、すぐシミュレーションへ
 */
/** MOD 解析 (段) がおｋ → ① へ。クラフト非推奨なら探す物が無いので ③ (完成品) へ直行 */
function goPick(): void {
  if (ss.kind.value.kind === "unsafe") { finishDiag(); return; }
  c.phase.value = "pick";
}
// 「前回の続きから」: 解析おｋ → ① → 探す (キャッシュ) → done まで自動で
watch(() => [c.phase.value, ss.busy.value] as const, ([ph, busy]) => {
  if (!c.resumeFlow.value) return;
  if (ph === "analyzed") goPick();
  else if (ph === "pick" && !busy) { if (ss.kind.value.kind !== "unsafe" && ss.checked.value.length) void ss.searchAll(); else finishDiag(); }
  else if (ph === "done") c.resumeFlow.value = false;
}, { immediate: true });
/** 探さずに (or 探せずに) ②③ と作り方へ */
function finishDiag(): void {
  c.phase.value = "done";
  c.diagBusy.value = false;
}
/** 取得中の流れ (今どこか)。① のボタンの下に出す */
const flow = computed(() => {
  const st = c.stage.value;
  const at = st.startsWith("③") ? 2 : st.startsWith("②") ? 0 : -1;
  const n = ss.checked.value.length;
  return [
    { label: `候補ごとに 固定済み・ゆるい・厳しい (${ss.current.value && at === 0 ? `${ss.current.value.index}/${ss.current.value.count}` : `${n} 候補`})`, state: at > 0 ? "done" : at === 0 ? "now" : "todo" },
    { label: "完成品", state: at === 2 ? "now" : "todo" },
    { label: "→ ② を出して作り方を組む", state: "todo" },
  ];
});
// 画面を離れたら取得を打ち切る (入口に戻るは c.reset() が打ち切る)
onBeforeUnmount(() => c.abortFetch());
/** 取引所で待たされている時の一言 (間隔待ち・レート制限) */
const tradeWait = computed(() => {
  const secs = tradeAuto.waitSecs.value;
  if (tradeAuto.rateLimitSecs.value > 0) return `取引所のレート制限中 (あと ${secs} 秒)`;
  if (secs > 0) return `取引所の間隔待ち (あと ${secs} 秒)`;
  return tradeAuto.pending.value > 0 ? "取引所に問い合わせ中…" : "";
});
/**
 * ① → ② → ③ の順に出す (オーナー 2026-09-25:「1 から順に表示しろ。取得中で真ん中表示させないで」)。
 * ② は取れてから、③ は完成品が取れてから (探せない時はすぐ)。取得中の「今どこか」は ① のボタンの下と上の要約に出す
 */
const show2 = computed(() => !ss.busy.value && ss.rows.value.some((r) => r.res));
const show3 = computed(() => !ss.busy.value && !fin.busy.value && (show2.value || ss.kind.value.kind === "unsafe" || !!fin.found.value || !!fin.error.value || !!fin.unbuildable.value));
/** 候補をプレ / サフィに分ける (中は確率の高い順のまま) */
const candGroups = computed(() => [
  { title: "プレフィックス", list: ss.candidates.value.filter((x) => x.side === "P") },
  { title: "サフィックス", list: ss.candidates.value.filter((x) => x.side === "S") },
].filter((g) => g.list.length));
const pctOf = (p: number): string => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;
/** 取引所へ投げる本数の目安 (候補ごとに 3 本 + 完成品 1 本) */
const calls = computed(() => ss.checked.value.length * (ss.kind.value.kind === "separate" ? 1 : 3) + (fin.query.value && !fin.found.value ? 1 : 0));
const sideJa = (x: "P" | "S" | null): string => (x === "P" ? "プレ" : x === "S" ? "サフィ" : "片側");
/** 3 つの道と一番安い道 ([[three-way.ts]]) */
const { threeWay, verdict3 } = useThreeWay(c, ss, fin);
/** 道しるべ: 貼る → 固定を決めて探す → 買うか作るか → 作り方を回す */
const steps = computed(() => {
  // 取得中 (②③) はまだ「済み」にしない (2026-09-25: ③ を探している最中に ③ ✓ ④ が出ていた)
  const searched = (!!ss.chosen.value || !!fin.found.value) && !ss.busy.value;
  const decided = threeWay.value.some((w) => w.best) && !c.diagBusy.value && !fin.busy.value;
  const s = (label: string, state: "done" | "now" | "todo") => ({ label, state });
  const ph = c.phase.value;
  return [
    s(c.item.value ? "アイテムを貼る" : "アイテムを決める", "done"),
    s("MOD と段を確かめる", ph === "analyzed" ? "now" : "done"),
    s("固定する MOD を選んで探す", ph === "analyzed" ? "todo" : searched && ph === "done" ? "done" : "now"),
    s("買うか作るかを見る", ph !== "done" ? "todo" : decided ? "done" : "now"),
    s("下の作り方を回して確かめる", ph === "done" && decided ? "now" : "todo"),
  ];
});
/** 今やることの一言 (上の要約) */
const hint = computed(() => {
  if (ss.kind.value.kind === "unsafe") return "クラフト非推奨: ② で完成品を探して買う";
  const ph = c.phase.value;
  if (ph === "analyzed") return "MOD と段を確かめて「おｋ」を押す";
  if (ph === "pick") return "固定する MOD を選んで「取引所で探す」を押す";
  const best = threeWay.value.find((w) => w.best);
  return best ? `${best.name} が一番安い → 下の作り方 (STEP) を回して確かめる` : "② で買うか作るかを見る";
});
const omenSide = computed(() => (ss.kind.value.craftSide === "P" ? "左側" : ss.kind.value.craftSide === "S" ? "右側" : "その側"));
/** 固定する樹 MOD の名前 (樹 MOD が 2 つある時は重い側の物だけ) */
const fixLabel = computed(() => {
  const side = ss.kind.value.fixSide;
  const rows = c.dropOnly.value.filter((d) => !side || d.side === side);
  return rows.length === 1 ? `樹 MOD (${ja(rows[0]!.text)}) ` : "樹 MOD ";
});
</script>

<template>
  <div class="mb-3 text-xs">
    <!-- 上に貼り付いた要約 (2026-09-25 オーナー:「見やすく使いやすく」): 何を作るか + 3 つの道 + 判定。取れた物から埋まる -->
    <div class="sticky top-0 z-10 -mx-1 mb-3 rounded-xl border border-white/10 bg-[var(--exile-color-bg-surface)]/95 px-3 py-2 shadow-lg backdrop-blur">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
        <!-- 作る物 -->
        <div class="min-w-[12rem]">
          <p class="text-[10px] tracking-widest opacity-50">作る物</p>
          <p class="text-sm font-bold text-amber-100">{{ baseJa }}</p>
          <p class="opacity-60">プレ {{ lim.prefix }} / サフィ {{ lim.suffix }} 枠 ・ 品質 {{ quality }}% ・ 狙い {{ c.targets.value.length }} 個</p>
        </div>
        <!-- 今どこか (道しるべ) -->
        <ol class="flex flex-1 flex-wrap items-center gap-y-1 text-[11px]">
          <li v-for="(st, i) in steps" :key="st.label" class="flex items-center">
            <span class="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold transition-colors"
              :class="st.state === 'done' ? 'bg-emerald-500/15 text-emerald-200' : st.state === 'now' ? 'bg-amber-500/25 text-amber-50 ring-1 ring-amber-400/70 shadow-[0_0_14px_rgba(245,158,11,0.35)]' : 'bg-white/5 text-white/40'">
              <span class="grid h-4 w-4 place-items-center rounded-full text-[10px]" :class="st.state === 'done' ? 'bg-emerald-400 text-black' : st.state === 'now' ? 'bg-amber-400 text-black' : 'bg-white/10'">{{ st.state === "done" ? "✓" : i + 1 }}</span>
              {{ st.label }}
            </span>
            <span v-if="i < steps.length - 1" class="mx-1 h-px w-3" :class="st.state === 'done' ? 'bg-emerald-400/60' : 'bg-white/15'" />
          </li>
        </ol>
      </div>
      <!-- 今やること / 今なにで止まっているか -->
      <p class="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
        <template v-if="c.stage.value">
          <span class="inline-block animate-pulse text-amber-300">●</span><span class="text-amber-200/90">{{ c.stage.value }}</span>
          <span v-if="tradeWait" class="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200">{{ tradeWait }}</span>
        </template>
        <template v-else>
          <span class="text-amber-300">▶</span><span class="text-amber-100/90">{{ hint }}</span>
        </template>
      </p>
    </div>
    <!-- MOD 解析: 種類ごと・プレ / サフィごと (オーナー 2026-09-24) -->
    <ModBreakdown :c="c" />
    <!-- 解析おｋ → ① へ (段を直したい時はここで直してから) -->
    <div v-if="c.phase.value === 'analyzed'" class="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <span>MOD と段はこれでおｋ？</span>
      <button type="button" class="rounded-lg bg-amber-500 px-4 py-1.5 font-bold text-black shadow hover:bg-amber-400" @click="goPick()">おｋ → ① 固定する MOD を選ぶ</button>
      <button type="button" class="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/5" title="取引所で探さずに、貼った物のまま作り方を組む" @click="finishDiag()">探さずに作り方へ</button>
    </div>
    <div v-else class="grid gap-3 lg:grid-cols-3">
      <!-- ① 固定済みにして始める MOD を選ぶ -->
      <section class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p class="mb-2 flex items-center gap-2"><span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">1</span><b class="text-sm">固定する MOD を選ぶ</b></p>
        <p class="opacity-70">{{ baseJa }} ・ プレ {{ lim.prefix }} / サフィ {{ lim.suffix }} 枠 ・ 品質 {{ quality }}%</p>
        <p v-if="c.dropOnly.value.length" class="mt-1">
          樹 MOD (固定済みで買う): <b>{{ c.dropOnly.value.map((d) => ja(d.text)).join(" / ") }}</b>
        </p>
        <p v-if="c.slots.value?.impossible" class="mt-1 text-rose-300">{{ c.slots.value.note }}</p>
        <p v-for="b in others" :key="b.baseType" class="mt-1 opacity-60">
          別のベースなら: {{ b.ja }} ({{ b.maxQualityPlus ? `品質上限 +${b.maxQualityPlus}%` : b.implicits.join(" / ") }})
        </p>

        <!-- クラフト非推奨 (満杯の側の両方に樹 MOD。固定は 1 つしかできず、もう片方がガチャで消える) -->
        <div v-if="ss.kind.value.kind === 'unsafe'" class="mt-3 rounded border border-rose-500/50 bg-rose-500/10 p-2 text-rose-200">
          <b>クラフト非推奨</b>: 固定 (フラクチャー) できるのは 1 つだけで、残りの樹 MOD はクラフト中に消えると付け直せません。
          <span v-for="r in ss.kind.value.reasons ?? []" :key="r" class="block pl-2">・{{ r }}</span>
          完成品を買うのをすすめます (右で探せます)
        </div>
        <div v-else-if="ss.candidates.value.length" class="mt-3 border-t border-white/10 pt-2">
          <p class="mb-1 opacity-60">出にくい MOD ほど固定の価値が高い (出にくい順に 2 つ選択済み。3 つまで増やせる)</p>
          <!-- 樹 MOD を固定 (作る側に樹 MOD が 1 つ) -->
          <template v-if="ss.kind.value.kind === 'fix'">
            <p class="mb-1 font-bold">固定済み (フラクチャー) にして始める MOD</p>
            <p class="opacity-80">
              🔒 {{ fixLabel }}を固定 <span class="opacity-60">(樹 MOD は付け直せないので固定。ほかは選べない)</span>
            </p>
          </template>
          <template v-else>
            <p class="mb-1 font-bold">{{ ss.kind.value.kind === "separate" ? "買う物" : "固定する MOD" }}
              <span class="font-normal opacity-50">{{ MAX_STARTS }} つまで</span>
            </p>
            <!-- 固定不要 (作る側に樹 MOD が無い) -->
            <p v-if="ss.kind.value.kind === 'separate'" class="mb-1 text-emerald-300/90">
              固定不要: {{ sideJa(ss.kind.value.craftSide) }}だけ作るので樹 MOD は消えない ({{ omenSide }}のお告げで側を守る)。樹 MOD 付きを買って始める
            </p>
            <label v-for="x in ss.candidates.value.filter((y) => !y.side)" :key="x.key" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5" :class="ss.locked(x.key) ? 'opacity-40' : ''">
              <input v-model="ss.checked.value" type="checkbox" :value="x.key" :disabled="ss.locked(x.key) || ss.busy.value" />
              <span class="flex-1">{{ x.name }}</span>
            </label>
            <!-- プレ / サフィに分けて、ベースに付く確率の高い順 (オーナー 2026-09-24) -->
            <div v-for="g in candGroups" :key="g.title" class="mb-1">
              <p class="mt-1 opacity-60">{{ g.title }} <span class="opacity-60">(% = 1 回で出る確率)</span></p>
              <label v-for="x in g.list" :key="x.key" class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5" :class="ss.locked(x.key) ? 'opacity-40' : ss.checked.value.includes(x.key) ? 'bg-amber-500/10' : ''">
                <input v-model="ss.checked.value" type="checkbox" :value="x.key" :disabled="ss.locked(x.key) || ss.busy.value" />
                <span class="flex-1">{{ x.name }}</span>
                <span class="rounded-md bg-white/5 px-1.5 tabular-nums opacity-80" title="その側に 1 回付けて出る確率 (狙いの段以上)">{{ x.chance != null ? pctOf(x.chance) : "?" }}</span>
              </label>
            </div>
          </template>
          <button type="button" class="mt-2 rounded-lg bg-sky-500 px-3 py-1.5 font-bold text-black shadow hover:bg-sky-400 disabled:opacity-40" :disabled="ss.busy.value || !ss.checked.value.length" @click="ss.searchAll()">
            {{ ss.busy.value ? "探しています…" : `取引所で探す (${ss.kind.value.kind === "fix" ? "樹 MOD" : `${ss.checked.value.length} つ`} + 完成品)` }}
          </button>
          <button v-if="c.phase.value !== 'done' && !ss.busy.value" type="button" class="ml-2 mt-2 rounded-lg border border-white/20 px-2 py-1 hover:bg-white/5" @click="finishDiag()">探さずに作り方へ</button>
          <div v-if="ss.busy.value" class="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-amber-100">
            <p><span class="inline-block animate-pulse">●</span> {{ c.stage.value || "取引所で探しています…" }}
              <span v-if="tradeWait" class="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5">{{ tradeWait }}</span></p>
            <ol class="mt-1 space-y-0.5">
              <li v-for="(f, i) in flow" :key="i" :class="f.state === 'now' ? 'text-amber-200' : f.state === 'done' ? 'text-emerald-200/80' : 'opacity-50'">
                {{ f.state === "done" ? "✓" : f.state === "now" ? "▶" : "・" }} {{ f.label }}
              </li>
            </ol>
          </div>
          <p v-else class="mt-1 opacity-50">取引所へ約 {{ calls }} 回 ≒ {{ Math.max(1, Math.round((calls * 2 - 6) * 13.6 / 60)) }} 分 (結果は 30 分覚える)</p>
        </div>
      </section>

      <!-- 始め方の結果: 一番安い 1 つだけ出して、他は畳む ([[StartResults.vue]]) -->

      <!-- ② 買うか、作るか ([[BuyOrCraftSection.vue]]) -->
      <BuyOrCraftSection v-if="(show2 || show3) && c.phase.value === 'done'" :c="c" :ss="ss" :fin="fin" :three-way="threeWay" :verdict3="verdict3" :show2="show2" />
    </div>

    <details v-if="c.treeResult.value" class="mt-2">
      <summary class="cursor-pointer opacity-50">固定済み・固定無しの詳しい表</summary>
      <TreeFracturePanel :c="c" />
    </details>
  </div>
</template>
