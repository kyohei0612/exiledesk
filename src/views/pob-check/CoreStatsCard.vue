<!--
  CoreStatsCard.vue — 火力の中身 (2026-10-04)

  オーナー「DPS はその火力の計算に関わってる奴全て表示して、自分と相手で分かりやすく。基礎 DPS に関わってる主なステータスを UI でどっかに」
  「ゲーム内表記で基本的に統一でいいよ表示は」。並びはゲームのスキルの詳細 (オーナーの Spark / ファイヤーストームの画面) と同じ節:
    ダメージ / 使用量 / 投射物 / クリティカルヒット、と 増加と上昇 (ノード・サポートで上がる所)。
  ゲームの詳細はスキルごとに、そのスキルが持つ stat (クールダウン・シール・嵐の半径など) をスキル専用の書き方で並べる。そこは PoB に無いので出さず、
  どのスキルにもある火力の数字だけを同じ名前で出す。上のバーのスキルについて 自分 → 相手 (相手は比較の時だけ)
-->
<script setup lang="ts">
import { computed } from "vue";
import type { CoreStats } from "../../services/pob-check/api";
import { fmtNum } from "./fmt";
import DiffBadge from "./DiffBadge.vue";

const props = defineProps<{ mine: CoreStats | null | undefined; target?: CoreStats | null; skillJa: string }>();

const TYPE_JA: Record<string, string> = { Physical: "物理", Fire: "火", Cold: "冷気", Lightning: "雷", Chaos: "混沌" };
const pct = (v: number) => `${Math.round(v)}%`;
const plusPct = (v: number) => `+${Math.round(v)}%`;
const range = (lo: number, hi: number) => `${fmtNum(lo)} - ${fmtNum(hi)}`;

/** 1 行: 見せる文字 (自分 / 相手) と、差の印に使う数 (無ければ印なし) */
type Row = { label: string; a: string; b: string | null; na?: number; nb?: number | null; hint?: string };
type Section = { title: string; rows: Row[] };

const sections = computed<Section[]>(() => {
  const a = props.mine, b = props.target ?? null;
  if (!a) return [];
  const row = (label: string, get: (c: CoreStats) => number | undefined, show: (v: number) => string, opts: { hint?: string; noBadge?: boolean } = {}): Row | null => {
    const va = get(a), vb = b ? get(b) : undefined;
    if ((va == null || va === 0) && (vb == null || vb === 0)) return null;
    return { label, a: va != null ? show(va) : "—", b: b ? (vb != null ? show(vb) : "—") : null, na: opts.noBadge ? undefined : va ?? 0, nb: opts.noBadge ? null : vb ?? null, hint: opts.hint };
  };
  const keep = (rs: Array<Row | null>): Row[] => rs.filter((r): r is Row => !!r);
  // 種類ごとのダメージ・耐性貫通 (自分と相手の種類を合わせて)
  const types = [...new Set([...(a.ranges ?? []), ...(b?.ranges ?? [])].map((r) => r.type))];
  const rangeOf = (c: CoreStats | null, t: string) => c?.ranges?.find((r) => r.type === t);
  const typeRows: Row[] = types.flatMap((t) => {
    const ra = rangeOf(a, t), rb = rangeOf(b, t);
    const ja = TYPE_JA[t] ?? t;
    const out: Row[] = [{ label: `${ja}ダメージ`, a: ra ? range(ra.min, ra.max) : "—", b: b ? (rb ? range(rb.min, rb.max) : "—") : null, na: ra ? (ra.min + ra.max) / 2 : 0, nb: b ? (rb ? (rb.min + rb.max) / 2 : 0) : null }];
    if ((ra?.pen ?? 0) > 0 || (rb?.pen ?? 0) > 0) out.push({ label: `${ja}耐性貫通`, a: pct(ra?.pen ?? 0), b: b ? pct(rb?.pen ?? 0) : null, na: ra?.pen ?? 0, nb: b ? rb?.pen ?? 0 : null });
    return out;
  });
  const ta = TYPE_JA[a.type] ?? a.type, tb = b ? TYPE_JA[b.type] ?? b.type : ta;
  const t = ta === tb ? ta : `${ta} / 相手は${tb}`;
  return [
    { title: "ダメージ", rows: [
      ...keep([
        row("秒間ダメージ量", (c) => c.dps, fmtNum),
        row("ヒットごとの平均ダメージ", (c) => c.avg, fmtNum, { hint: "クリティカル込み (敵の軽減なし)" }),
      ]),
      ...(a.totalMax ? [{ label: "合計ダメージ", a: range(a.totalMin ?? 0, a.totalMax ?? 0), b: b ? range(b.totalMin ?? 0, b.totalMax ?? 0) : null, na: ((a.totalMin ?? 0) + (a.totalMax ?? 0)) / 2, nb: b ? ((b.totalMin ?? 0) + (b.totalMax ?? 0)) / 2 : null }] : []),
      ...typeRows,
    ] },
    { title: "使用量", rows: keep([
      row("キャストタイム", (c) => (c.speed > 0 ? 1 / c.speed : undefined), (v) => `${v.toFixed(2)}秒`, { noBadge: true }),
      row("秒間キャスト回数", (c) => c.speed, (v) => v.toFixed(2)),
    ]) },
    { title: "投射物", rows: keep([
      row("放たれる投射物数", (c) => c.projectiles, (v) => String(Math.round(v))),
      row("投射物スピードモッド", (c) => c.incProjSpeed, plusPct),
    ]) },
    { title: "クリティカルヒット", rows: keep([
      row("クリティカルヒット率", (c) => c.critChance, (v) => `${v.toFixed(2)}%`),
      row("クリティカルダメージボーナス", (c) => (c.critMulti - 1) * 100, plusPct),
    ]) },
    { title: "増加と上昇 (ノード・サポートで上がる所)", rows: keep([
      row(`${t}ダメージ増加`, (c) => c.incDamage, pct, { hint: "このスキルに効く「ダメージが #% 増加する」の合計 (ダメージ・元素・その種類)" }),
      row(`${t}ダメージ上昇`, (c) => (c.moreDamage - 1) * 100, pct, { hint: "このスキルに効く「ダメージが #% 上昇する」を掛け合わせた物 (サポートジェム・ノードなど)" }),
      row("クリティカルヒット率増加", (c) => c.incCrit, pct),
      row("クリティカルダメージボーナス増加", (c) => c.incCritMulti, pct),
      row("スキルスピード増加", (c) => c.incSpeed, pct),
    ]) },
  ].filter((s) => s.rows.length);
});
</script>

<template>
  <section v-if="sections.length" class="card px-4 py-3">
    <p class="mb-2 text-[13px] font-bold">
      火力の中身 <span class="note font-normal">— {{ skillJa }}{{ target ? " (自分 → 相手)" : "" }}。名前と並びはゲームのスキルの詳細と同じ</span>
    </p>
    <div class="grid gap-x-8 gap-y-3 @4xl:grid-cols-2 @7xl:grid-cols-3">
      <div v-for="s in sections" :key="s.title">
        <p class="mb-1 border-b border-white/10 pb-0.5 text-[12px] font-bold text-[var(--exile-color-text-secondary)]">{{ s.title }}</p>
        <div v-for="r in s.rows" :key="r.label" class="flex items-baseline gap-2 py-0.5 text-[13px]" :title="r.hint">
          <span class="min-w-0 flex-1 truncate text-[var(--exile-color-text-secondary)]">{{ r.label }}</span>
          <span class="font-bold tabular-nums text-amber-200">{{ r.a }}</span>
          <template v-if="r.b != null">
            <span class="text-[var(--exile-color-text-tertiary)]">→</span>
            <span class="font-bold tabular-nums text-sky-200">{{ r.b }}</span>
            <DiffBadge v-if="r.na != null && r.nb != null && r.na > 0" :now="r.nb" :before="r.na" />
            <span v-else-if="r.na === 0 && (r.nb ?? 0) > 0" class="text-[11px] text-emerald-300">0 →</span>
            <span v-else class="w-[3.5rem]" />
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
