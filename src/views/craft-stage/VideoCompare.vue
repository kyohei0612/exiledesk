<!--
  VideoCompare.vue — 動画用の 2 つ並べて比べる画面 (POE2Tube 要望 ⑪-3、2026-09-29)

  URL: ?video=1&layout=clip&view=compare&a=<手順 JSON>&b=<手順 JSON>[&a_step=N&b_step=N]
  手順を (step まで) 打ったアイテム 2 つを左右に並べ、真ん中に違い (B − A) を色で出す (増えた = 緑、減った = 赤)。
  「装備を入れ替えるかの見方」の回用。下 15% (612px より下) は空ける。画面に「アイテムレベル」の文字が出る (アイテム枠)。
  2026-09-29 (要望 ⑰-3): &a_pob= / &b_pob= (それぞれの結果 JSON の pob、PoB で計算済み) があれば、差の一番上に「スキル DPS A → B (±%)」。
  動き (要望 ⑰-18 / ⑰-20、&play=1、2.4 秒): 左右とも 1 手前の状態から始めて同時に最後の手を打つ (同じルーンを武器と防具にはめる比べ等)
  → DPS の棒が左右で伸びる競争。&dps=0 で DPS を隠す (質問の行)、&reveal=1 で隠した所から出す。
-->
<script setup lang="ts">
import { computed } from "vue";
import StageItemCard from "./StageItemCard.vue";
import { craftStage } from "../../state/craft-stage";
import { playPlan } from "../../services/craft-stage/run-plan";
import { diffItems, splitLine, type DiffLine } from "../../services/craft-stage/compare";
import { NEGATIVE_WORDS } from "../../services/craft-stage/stage-core";
import type { CraftStagePlan } from "../../services/craft-stage/contract";
import { dpsText, type PobBlock } from "../../services/craft-stage/stage-pob";
import { easeOut, seg, useAnim } from "./use-anim";

const props = defineProps<{ a: CraftStagePlan; b: CraftStagePlan; aStep: number; bStep: number; aPob?: PobBlock | null; bPob?: PobBlock | null }>();
/** その手の PoB の値 (step が手の数より大きい時は最後) */
const pobAt = (p: PobBlock | null | undefined, step: number) => (p ? p.steps[Math.min(step, p.steps.length - 1)] ?? null : null);
const anim = useAnim(2400, { revealAt: 0.45 });
const hideDps = new URLSearchParams(location.search).get("dps") === "0";
/** 動きの前半は 1 手前、0.35 から最後の手 */
const after = computed(() => !anim.play || anim.t.value >= 0.35);
/** DPS の棒の伸び (0 → 1) */
const grow = computed(() => easeOut(seg(anim.t.value, 0.4, 0.95)));
const dps = computed(() => {
  const a = pobAt(props.aPob, props.aStep);
  const b = pobAt(props.bPob, props.bStep);
  if (!a || !b) return null;
  return { a: a.dps, b: b.dps, pct: a.dps > 0 ? Math.round(((b.dps - a.dps) / a.dps) * 100) : null, skill: props.aPob?.character.skill_ja ?? props.aPob?.character.skill ?? "" };
});

const view = computed(() => {
  const data = craftStage.data.value;
  if (!data) return null;
  try {
    const pa = playPlan(data, props.a, {}, props.aStep);
    const pb = playPlan(data, props.b, {}, props.bStep);
    const a = pa.final;
    const b = pb.final;
    // 1 手前 (動きの始め)。最後の手で付いた物は光らせる
    const aBefore = pa.steps.length ? pa.steps[pa.steps.length - 1]!.before : a;
    const bBefore = pb.steps.length ? pb.steps[pb.steps.length - 1]!.before : b;
    const aAdded = pa.steps.length ? pa.steps[pa.steps.length - 1]!.added : [];
    const bAdded = pb.steps.length ? pb.steps[pb.steps.length - 1]!.added : [];
    return { a, b, aBefore, bBefore, aAdded, bAdded, diff: diffItems(a, b) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
});
const num = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, ""));
const signed = (v: number): string => (v > 0 ? `+${num(v)}` : num(v));
/**
 * 差の行の文面 (要望 ㉑、2026-09-30「消えた MOD の符号が混ざる」「±0 の行が並ぶ」):
 *   増えた = 「+ アタックスピードが8%増加する」、消えた = 「− スタン持続時間が15%増加する」(数字は元のまま)、
 *   変わった = 「物理ダメージが53→104%増加する (+51)」(変わった数値だけ 前→後、最後に差)。数値は全部出す (要望 ⑭)
 */
function fill(text: string, vals: (i: number) => string): string {
  let i = 0;
  return text.replace(/#/g, () => vals(i++));
}
function lineText(d: DiffLine): string {
  // 「減少する」の文は数字を正で (ゲームと同じ。データの値は負)
  if (NEGATIVE_WORDS.test(d.text)) d = { ...d, a: d.a.map(Math.abs), b: d.b.map(Math.abs), delta: -d.delta };
  if (d.kind === "added") return `+ ${fill(d.text, (i) => num(d.b[i] ?? 0))}`;
  if (d.kind === "removed") return `− ${fill(d.text, (i) => num(d.a[i] ?? 0))}`;
  const body = fill(d.text, (i) => ((d.a[i] ?? 0) === (d.b[i] ?? 0) ? num(d.b[i] ?? 0) : `${num(d.a[i] ?? 0)}→${num(d.b[i] ?? 0)}`));
  return `${body} (${signed(d.delta)})`;
}
/**
 * 差の列の 1 行を 名前 / 数値 / 補足 に (2026-09-30 オーナー「真ん中の奴、ゴチャってる」)。MOD の文面は変えず、見せ方だけ分ける。
 * 分けられない文は名前 = 文全体 (数値入り)。変わった行の数値は「53% → 104%」
 */
function rowOf(d: DiffLine): { name: string; value: string; note: string } {
  const neg = NEGATIVE_WORDS.test(d.text);
  const a = neg ? d.a.map(Math.abs) : d.a;
  const b = neg ? d.b.map(Math.abs) : d.b;
  const s = splitLine(d.text);
  if (!s) return { name: lineText(d).replace(/^[+−] /, ""), value: "", note: "" };
  const at = (vals: number[]) => fill(s.value, (i) => num(vals[i] ?? 0));
  const value = d.kind === "added" ? at(b) : d.kind === "removed" ? at(a) : `${at(a)} → ${at(b)}`;
  return { name: s.name, value, note: s.note };
}
const KIND_JA = { added: "付く", changed: "変わる", removed: "消える" } as const;
/** 行の色: 増えた・上がった = 緑、消えた・下がった = 赤 */
const tone = (d: DiffLine): string => (d.kind === "added" || (d.kind === "changed" && d.delta > 0) ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200");
/** 行が多い時は全体を少し小さく (下 15% より上に全部の差を収める) */
const topFont = (n: number): number => (n <= 8 ? 22 : n <= 10 ? 20 : n <= 12 ? 18 : 16);
/**
 * 並べ方 (要望 ⑫「3 列を横幅いっぱいに。差の行は特に大きく」、⑬「左右のアイテムを縦にも大きく。MOD の文字は 1080p で 28px 以上。
 * 差の列は少し細くしてよい」): 差の列 360px・文字 22px (1080p で約 33px)。左右のカードは残りの幅を 2 枚で分け、CSS の zoom で
 * ZOOM 倍 (MOD の文字 13px × 1.44 ≒ 19px = 1080p で約 28px)。幅が足りない分は元の幅を狭めて MOD を折り返す
 */
const DIFF_W = 360;
const COL_W = (1280 - 24 - DIFF_W - 24) / 2;
const ZOOM = 1.44;
</script>

<template>
  <div class="absolute inset-x-0 top-0 h-[612px] px-3 pt-3 text-white">
    <p v-if="!view" class="mt-40 text-center text-2xl opacity-60">データを読んでいます…</p>
    <p v-else-if="'error' in view" class="mt-40 text-center text-2xl text-rose-300">{{ view.error }}</p>
    <div v-else class="flex h-full items-start justify-center gap-3">
      <div class="shrink-0" :style="{ width: `${COL_W}px` }">
        <p class="mb-1 text-center text-[24px] font-bold text-white/80">A (今の装備)</p>
        <div :style="{ zoom: ZOOM }">
          <StageItemCard :item="after ? view.a : view.aBefore" :added="after && anim.play ? view.aAdded : []" :removed="[]" :holding="false" :flash-key="after ? 1 : 0" compact :width="COL_W / ZOOM" />
        </div>
      </div>
      <!-- 違い (B − A) -->
      <div class="shrink-0 space-y-1.5 rounded-2xl border border-white/15 bg-black/70 p-3" :style="{ width: `${DIFF_W}px` }">
        <p class="text-center text-[24px] font-bold text-amber-100">入れ替えると</p>
        <!-- スキル DPS の差 (PoB、要望 ⑰-3) -->
        <div v-if="dps && !hideDps" class="rounded-lg px-2.5 py-1.5 text-center font-bold" :class="dps.b > dps.a ? 'bg-emerald-500/20 text-emerald-100' : dps.b < dps.a ? 'bg-rose-500/20 text-rose-100' : 'bg-white/5 text-white/60'">
          <p class="text-[15px] opacity-80">スキル DPS ({{ dps.skill }})</p>
          <!-- 棒の競争 (左 A / 右 B、長い方に合わせる) -->
          <div v-for="(v, i) in [dps.a, dps.b]" :key="i" class="mt-1 flex items-center gap-2 text-[15px]">
            <span class="w-5 text-white/60">{{ i ? "B" : "A" }}</span>
            <span class="h-4 flex-1 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full" :class="i ? 'bg-amber-300' : 'bg-white/60'" :style="{ width: `${(v / Math.max(dps.a, dps.b, 1e-9)) * 100 * grow}%` }" /></span>
            <span class="w-14 text-right tabular-nums">{{ dpsText(v * grow) }}</span>
          </div>
          <p v-if="anim.shown.value && grow >= 1" class="stage-pop text-[24px] tabular-nums leading-tight">{{ dpsText(dps.a) }} → {{ dpsText(dps.b) }}<template v-if="dps.pct != null"> ({{ dps.pct > 0 ? "+" : "" }}{{ dps.pct }}%)</template></p>
        </div>
        <p v-if="!view.diff.length" class="text-center text-[24px] opacity-60">MOD の違いは無い</p>
        <!-- 1 行 = 札 (付く / 変わる / 消える) + 名前 (左) + 数値 (右、大きく)。補足は数値の下に小さく -->
        <div
          v-for="(d, i) in view.diff.slice(0, 14)"
          :key="i"
          class="flex items-center gap-2 rounded-lg px-2.5 py-1"
          :class="tone(d)"
          :style="{ fontSize: `${topFont(Math.min(14, view.diff.length))}px` }"
        >
          <span class="shrink-0 rounded px-1 text-[0.55em] font-bold opacity-80 ring-1 ring-current">{{ KIND_JA[d.kind] }}</span>
          <span class="line-clamp-2 min-w-0 flex-1 font-bold leading-snug" :class="d.kind === 'removed' ? 'opacity-75' : ''">{{ rowOf(d).name }}</span>
          <span v-if="rowOf(d).value" class="shrink-0 text-right font-bold tabular-nums">
            {{ rowOf(d).value }}
            <span v-if="rowOf(d).note" class="block text-[0.55em] font-normal opacity-70">{{ rowOf(d).note }}</span>
          </span>
        </div>
      </div>
      <div class="shrink-0" :style="{ width: `${COL_W}px` }">
        <p class="mb-1 text-center text-[24px] font-bold text-white/80">B (入れ替える物)</p>
        <div :style="{ zoom: ZOOM }">
          <StageItemCard :item="after ? view.b : view.bBefore" :added="after && anim.play ? view.bAdded : []" :removed="[]" :holding="false" :flash-key="after ? 1 : 0" compact :width="COL_W / ZOOM" />
        </div>
      </div>
    </div>
  </div>
</template>
