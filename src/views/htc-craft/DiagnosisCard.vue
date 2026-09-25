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
import { computed, onBeforeUnmount } from "vue";
import { tradeAuto } from "../../services/trade2/auto-price";
import { sideLimits } from "../../services/htc/bridge";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import { openExternal } from "../../services/trade2/open-external";
import { zeroStart } from "./craft-settings";
import TreeFracturePanel from "./TreeFracturePanel.vue";
import StartResults from "./StartResults.vue";
import ModBreakdown from "./ModBreakdown.vue";
import { MAX_STARTS, useStartSearch } from "./useStartSearch";
import { useFinishedCompare } from "./useFinishedCompare";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;
const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
const baseJa = computed(() => c.item.value?.baseText ?? c.bases.value.find((b) => b.current)?.ja ?? baseType.value ?? "");
const lim = computed(() => (c.data.value ? sideLimits(c.data.value, baseType.value) : { prefix: 3, suffix: 3 }));
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
/** 探さずに (or 探せずに) ②③ と作り方へ */
function finishDiag(): void {
  c.phase.value = "done";
  c.diagBusy.value = false;
}
/** 取得中の流れ (今どこか)。① のボタンの下に出す */
const flow = computed(() => {
  const st = c.stage.value;
  const at = st.includes("固定無し") ? 1 : st.startsWith("③") ? 2 : st.startsWith("②") ? 0 : -1;
  const n = ss.checked.value.length;
  return [
    { label: `候補の「固定済み」を 1 本ずつ (${ss.current.value && at === 0 ? `${ss.current.value.index}/${ss.current.value.count}` : `${n} 本`})`, state: at > 0 ? "done" : at === 0 ? "now" : "todo" },
    { label: "一番安い候補の「固定無し」(自分でフラクチャーする道。固定済みが安すぎれば飛ばす)", state: at > 1 ? "done" : at === 1 ? "now" : "todo" },
    { label: "完成品を 1 本", state: at === 2 ? "now" : "todo" },
    { label: "→ ② ③ を出して、作り方を自動で組む", state: "todo" },
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
/** 取引所へ投げる本数の目安 (候補ごとに固定済み 1 本 + 最安候補の固定無し 2 本 + 完成品 1 本。1 本 約 10 秒) */
const calls = computed(() => ss.checked.value.length + (ss.kind.value.kind === "separate" ? 0 : 2) + (fin.query.value && !fin.found.value ? 1 : 0));
const sideJa = (x: "P" | "S" | null): string => (x === "P" ? "プレ" : x === "S" ? "サフィ" : "片側");
/** 3 つの道: 完成品を買う / 固定済みを買って作る / 自分でフラクチャーして作る。一番安い物に印 */
const threeWay = computed(() => {
  const tw = ss.threeWay.value;
  // 全部取れてから出す (オーナー 2026-09-26:「全部終わってから ② → ③。目が疲れない」。取得中に値が入れ替わって見えていた)
  if (c.phase.value !== "done" || (!ss.chosen.value && !fin.buyCost.value)) return [];
  const best = ss.chosen.value?.res;
  const selfSkipped = !!best && best !== "error" && !("kind" in best) && !!best.earlyBuy;
  const list = [
    { key: "buy", name: "完成品を買う", cost: fin.outlier.value || fin.dropped.value.length || fin.tierless.value ? null : fin.buyCost.value, why: fin.found.value ? (fin.dropped.value.length || fin.tierless.value ? "同じ物は無い" : fin.outlier.value ? "当てにならない" : "出品なし") : "まだ", detail: "" },
    { key: "fixed", name: "固定済みを買って途中から作る", cost: tw.fixed?.cost ?? null, why: ss.busy.value ? "取得中…" : "出品なし", detail: tw.fixed?.label ?? "" },
    { key: "self", name: "自分でフラクチャーして作る", cost: tw.self?.cost ?? null, why: ss.kind.value.kind === "separate" ? "固定不要" : selfSkipped ? "固定済みが安いので省略" : ss.busy.value ? "取得中…" : "出品が足りない", detail: tw.self?.label ?? "" },
  ];
  const min = Math.min(...list.map((w) => w.cost ?? Infinity));
  return list.map((w) => ({ ...w, best: w.cost != null && w.cost === min }));
});
/** 道しるべ: 貼る → 固定を決めて探す → 買うか作るか → 作り方を回す */
const steps = computed(() => {
  // 取得中 (②③) はまだ「済み」にしない (2026-09-25: ③ を探している最中に ③ ✓ ④ が出ていた)
  const searched = (!!ss.chosen.value || !!fin.found.value) && !ss.busy.value;
  const decided = threeWay.value.some((w) => w.best) && !c.diagBusy.value && !fin.busy.value;
  const s = (label: string, state: "done" | "now" | "todo") => ({ label, state });
  const ph = c.phase.value;
  return [
    s("アイテムを貼る", "done"),
    s("MOD と段を確かめる", ph === "analyzed" ? "now" : "done"),
    s("固定する MOD を選んで探す", ph === "analyzed" ? "todo" : searched && ph === "done" ? "done" : "now"),
    s("買うか作るかを見る", ph !== "done" ? "todo" : decided ? "done" : "now"),
    s("下の作り方を回して確かめる", ph === "done" && decided ? "now" : "todo"),
  ];
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
      <!-- 道しるべ (初見でも最後まで行けるように。オーナー 2026-09-25) -->
      <ol class="mb-2 flex flex-wrap gap-1 text-[11px]">
        <li v-for="(st, i) in steps" :key="st.label" class="flex items-center gap-1 rounded-full px-2 py-0.5" :class="st.state === 'done' ? 'bg-emerald-500/15 text-emerald-200' : st.state === 'now' ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60' : 'bg-white/5 opacity-50'">
          <span class="font-bold">{{ i + 1 }}</span>{{ st.label }}<span v-if="st.state === 'done'">✓</span>
        </li>
      </ol>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div class="min-w-[10rem]">
          <p class="text-sm font-bold">{{ baseJa }}</p>
          <p class="opacity-60">プレ {{ lim.prefix }} / サフィ {{ lim.suffix }} 枠 ・ 品質 {{ quality }}% ・ 狙い {{ c.targets.value.length }} 個</p>
        </div>
        <template v-if="threeWay.length">
          <div v-for="w in threeWay" :key="w.key" class="rounded-lg px-3 py-1" :class="w.best ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50' : 'bg-white/[0.04]'">
            <p class="text-[11px] opacity-60">{{ w.name }}</p>
            <p class="text-base font-bold" :class="w.best ? 'text-emerald-300' : ''">{{ w.cost != null ? c.money(w.cost) : w.why }}</p>
          </div>
          <p v-if="threeWay.some((w) => w.best)" class="ml-auto text-sm">
            → <b class="text-emerald-300">{{ threeWay.find((w) => w.best)?.name }}</b> <span class="opacity-60">が一番安い</span>
          </p>
        </template>
        <p v-else class="ml-auto opacity-60">
          {{ ss.kind.value.kind === "unsafe" ? "クラフト非推奨 (完成品を買う)" : c.phase.value === "analyzed" ? "MOD と段を確かめて「おｋ」を押してください" : ss.busy.value ? "取引所で探しています… 全部取れたら ② ③ が出ます" : "左で固定する MOD を選んで「取引所で探す」を押すと、ここに 3 つの道が出ます" }}
        </p>
      </div>
      <!-- 今なにで止まっているか (② 何番目の候補の何本目 / ③ 完成品 / 取引所の待ち) -->
      <p v-if="c.stage.value" class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-amber-200/90">
        <span class="inline-block animate-pulse">●</span>{{ c.stage.value }}
        <span v-if="tradeWait" class="rounded bg-amber-500/15 px-1.5 py-0.5">{{ tradeWait }}</span>
        <span class="opacity-60">→ 終わると下の作り方が自動で回ります</span>
      </p>
    </div>
    <!-- MOD 解析: 種類ごと・プレ / サフィごと (オーナー 2026-09-24) -->
    <ModBreakdown :c="c" />
    <!-- 解析おｋ → ① へ (段を直したい時はここで直してから) -->
    <div v-if="c.phase.value === 'analyzed'" class="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
      <span>MOD と段はこれでおｋ？ <span class="opacity-60">(段は上の枠で選び直せます)</span></span>
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
          <p class="mb-1 opacity-60">出にくい MOD ほど固定 (フラクチャー) の価値が高い。出にくい順に 3 つまで選んであります</p>
          <!-- 樹 MOD を固定 (作る側に樹 MOD が 1 つ) -->
          <template v-if="ss.kind.value.kind === 'fix'">
            <p class="mb-1 font-bold">固定済み (フラクチャー) にして始める MOD</p>
            <p class="opacity-80">
              🔒 {{ fixLabel }}を固定 <span class="opacity-60">(樹 MOD はクラフトで付け直せず、カオスや消去で消えるので固定。ほかの MOD は選べません)</span>
            </p>
          </template>
          <template v-else>
            <p class="mb-1 font-bold">{{ ss.kind.value.kind === "separate" ? "買う物" : "固定する MOD" }}
              <span class="font-normal opacity-50">{{ MAX_STARTS }} つまで</span>
            </p>
            <!-- 固定不要 (作る側に樹 MOD が無い) -->
            <p v-if="ss.kind.value.kind === 'separate'" class="mb-1 text-emerald-300/90">
              固定不要: 作るのは{{ sideJa(ss.kind.value.craftSide) }}だけなので、{{ omenSide }}のお告げで作れば樹 MOD は消えません。
              樹 MOD が付いた物を買って始めます (固定の有無は問わない)
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
          <p v-else class="mt-1 opacity-50">取引所へ約 {{ calls }} 本 (10 秒に 4 本まで。30 分は結果を覚えておきます)</p>
        </div>
      </section>

      <!-- 始め方の結果: 一番安い 1 つだけ出して、他は畳む ([[StartResults.vue]]) -->
      <StartResults v-if="show2 && c.phase.value === 'done'" :c="c" :ss="ss" />

      <!-- ③ 買うか作るか。完成品の条件は一番ゆるく (MOD だけ、固定済みかは問わない) -->
      <section v-if="show3 && c.phase.value === 'done'" class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p class="mb-2 flex items-center gap-2"><span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">3</span><b class="text-sm">買うか、作るか</b>
          <button v-if="fin.query.value && !ss.busy.value" type="button" class="ml-auto rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/5" :disabled="fin.busy.value" @click="fin.search()">
            {{ fin.busy.value ? "探しています…" : fin.found.value ? "完成品を探し直す" : "完成品だけ探す" }}
          </button>
        </p>
        <div class="mb-2 grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-black/30 p-2" :class="fin.verdict.value?.buy ? 'ring-1 ring-emerald-400/50' : ''">
            <p class="text-[11px] opacity-60">完成品を買う</p>
            <p class="text-lg font-bold">{{ fin.buyCost.value != null ? c.money(fin.buyCost.value) : fin.found.value ? "出品なし" : fin.busy.value ? "取得中…" : "まだ" }}</p>
          </div>
          <div class="rounded-lg bg-black/30 p-2" :class="fin.verdict.value && !fin.verdict.value.buy ? 'ring-1 ring-emerald-400/50' : ''">
            <p class="text-[11px] opacity-60">素材から作る (初動 + 作る見込み)</p>
            <p class="text-lg font-bold">{{ fin.craftCost.value != null && ss.chosen.value ? c.money(fin.craftCost.value) : "-" }}</p>
          </div>
        </div>
        <p>
          完成品: <b>{{ fin.buyCost.value != null ? c.money(fin.buyCost.value) : fin.found.value ? "出品なし" : fin.busy.value ? "取得中…" : "まだ" }}</b>
          <!-- 取引所に無い時だけ手で埋める -->
          <span v-if="fin.found.value && fin.found.value.min == null" class="ml-1 opacity-80">
            手で入れる <input v-model.number="fin.manual.value" type="number" min="0" class="num w-14" /> 神
          </span>
          <button v-if="fin.found.value?.url" type="button" class="ml-1 text-sky-300 underline" @click="openExternal(fin.found.value.url)">{{ fin.found.value.total }} 件 →</button>
        </p>
        <p class="opacity-50">条件は MOD だけ (普通・固定済み・冒涜のどれで付いていてもいい)</p>
        <p v-if="fin.lightNote.value" class="text-amber-300/80">{{ fin.lightNote.value }}</p>
        <p v-if="fin.found.value && fin.found.value.total === 0 && !fin.deepDone.value && !fin.busy.value" class="mt-1">
          <button type="button" class="rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/5" @click="fin.search({ deep: true })">近い物を探す (値を問わず → MOD を外して、最大 3 本)</button>
        </p>
        <p v-if="fin.dropped.value.length" class="rounded bg-amber-500/10 px-1 text-amber-200">
          完成品は無かったので、近い物: {{ fin.dropped.value.join(" / ") }} を外して見つけた値段です (買ってから付ける。作るのとは比べていません)
        </p>
        <p v-if="fin.unbuildable.value" class="text-rose-300">{{ fin.unbuildable.value }}</p>
        <p v-if="fin.outlier.value" class="text-amber-300/80">出品が少なく、値段が作る見込みよりけた違いに高いので当てにしません (比べていません)</p>
        <p v-if="ss.kind.value.kind === 'unsafe'" class="opacity-50">クラフト非推奨なので、作る見込みは出しません</p>
        <p v-else-if="fin.craftBasis.value" class="opacity-50">始め方の初動 + {{ fin.craftBasis.value }}。目安で、下の作り方で回すと正確になります</p>
        <p v-else class="opacity-50">始め方を探すと出ます</p>
        <p v-if="fin.verdict.value && ss.chosen.value" class="mt-2 rounded-lg bg-emerald-500/10 px-2 py-1">
          → <b class="text-emerald-300">{{ fin.verdict.value.buy ? "完成品を買う" : "素材から作る" }}</b>
          方が {{ c.money(fin.verdict.value.diff) }} 安い
        </p>
        <!-- 3 つの道の中身 (上の要約の内訳) -->
        <div v-if="threeWay.length" class="mt-2 rounded border border-white/10 bg-black/20 p-2">
          <p v-for="w in threeWay.filter((x) => x.detail)" :key="w.key" class="opacity-70">{{ w.name }}: {{ w.detail }}</p>
        </div>

        <p v-if="fin.error.value" class="mt-1 text-rose-300">{{ fin.error.value }}</p>
      </section>
    </div>

    <details v-if="c.treeResult.value" class="mt-2">
      <summary class="cursor-pointer opacity-50">固定済み・固定無しの詳しい表</summary>
      <TreeFracturePanel :c="c" />
    </details>
  </div>
</template>
