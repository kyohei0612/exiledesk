<!--
  BreakdownTab.vue — 火力の内訳 (2026-10-03 オーナー「火力チェック自体はかなりいい物。どこの火力が乗っているから今こんな火力が出ている、
  という詳細が欲しい。出した数字を辿ればその数字になればクリア。外したり自分の物で計算させたり色々できるように」)

  上のバーのスキルについて「この DPS はこう出ている」を上から下へ:
    1. 行の DPS = ヒット + 継続 + その他 + ミニオン (表と同じ物差し。敵側の倍率は入れない = ゲーム内の表記)
    2. ヒットの DPS = 平均の 1 発 × 命中率 × 1 秒の回数 (× DPS 倍率 × 数)
    3. 平均の 1 発 = 1 発 (非クリ) × (1 − クリ率) + 1 発 (クリ) × クリ率
    4. 種類ごとの 1 発 = 基礎 × (1 + 増加の合計) × 増しの積 (× その他の倍率) … 増加 / 増し / 基礎の各 MOD を出所つきで (BreakdownModList)
    5. 1 秒の回数 / クリ率 / クリ倍率 もそれぞれ 基礎 × 増加 × 増し と MOD の出所
  数字は全部 PoB の内訳 (CALCS) の出力から取り、掛け算を辿ると表の数字になることを式ごとに確かめて出す (services/pob-check/breakdown.ts)。
  合わなかった所は注記に出す (本家の式に無い上限などが掛かった時)。要素の行の操作 (外す / オフ / チャージ 0 に) は既存の操作に流す
-->
<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import { gemJa } from "../../services/pob-check/api";
import type { Chain, HandChain, ModRow, TypeChain } from "../../services/pob-check/breakdown";
import { linesToJa } from "../../services/pob-check/item-text";
import type { SkillRow } from "./usePobCheck";
import { fmtNum, TYPE_STYLE } from "./fmt";
import BreakdownModList, { type ModAction } from "./BreakdownModList.vue";
import GemIcon from "../../components/decor/GemIcon.vue";
import GemName from "../../components/decor/GemName.vue";

const props = defineProps<{
  chain: Chain | null;
  loading: boolean;
  error: string | null;
  /** 今の自分・上のバーのスキルの物か (古ければ取り直し中の印) */
  fresh: boolean;
  focus: SkillRow | null;
  busy: boolean;
  /** 比べる相手を読み込んであるか (「自分の物で計算」への誘導) */
  hasTarget: boolean;
}>();
const emit = defineEmits<{ (e: "act", row: ModRow, action: ModAction): void; (e: "go-diff"): void }>();

/** 装備の行の日本語 (まとめて 1 回。相手との差と同じやり方) */
const ja = shallowRef<Map<string, string>>(new Map());
async function addJa(lines: Iterable<string>): Promise<void> {
  const arr = [...new Set(lines)].filter((l) => !ja.value.has(l));
  if (!arr.length) return;
  const out = await linesToJa(arr);
  ja.value = new Map([...ja.value, ...arr.map((l, i): [string, string] => [l, out[i] ?? l])]);
}
const allRows = (c: Chain): ModRow[] =>
  c.hands.flatMap((h) => [
    ...h.types.flatMap((t) => [...t.incMods, ...t.moreMods, ...t.addedMods]),
    ...h.speedChain.incMods,
    ...h.speedChain.moreMods,
    ...h.critChain.baseMods,
    ...h.critChain.incMods,
    ...h.critChain.moreMods,
    ...h.critMultChain.baseMods,
    ...h.critMultChain.incMods,
    ...h.critMultChain.moreMods,
  ]);
watch(
  () => props.chain,
  (c) => {
    if (c) void addJa(allRows(c).map((m) => m.line).filter((l): l is string => !!l));
  },
  { immediate: true },
);
const lineJa = (l: string): string => ja.value.get(l) ?? l;

const pct = (v: number, d = 0): string => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}%`;
const x = (v: number, d = 2): string => `×${v.toFixed(d)}`;
const typeJa = (t: string): string => TYPE_STYLE[t]?.ja ?? t;
const typeColor = (t: string): string => TYPE_STYLE[t]?.color ?? "#999";
const handLabel = (h: HandChain): string => (h.key === "MainHand" ? "メインハンド" : h.key === "OffHand" ? "オフハンド" : "");
/** 1 発の式の「その他の倍率」(ダブルダメージ・ウォークライなど) は 1 でない時だけ */
const extraMult = (t: TypeChain): boolean => Math.abs(t.allMult - 1) > 1e-6;
/** ヒットの DPS の式で 1 でない時だけ出す倍率 */
const hasDpsMult = (h: HandChain): boolean => Math.abs(h.dpsMult - 1) > 1e-6;
const hasQuantity = (h: HandChain): boolean => Math.abs(h.quantity - 1) > 1e-6;
const terms = computed(() => {
  const c = props.chain;
  if (!c) return [];
  const out: Array<{ label: string; value: number; cls: string; note?: string }> = [{ label: "ヒット", value: c.hitDps, cls: "text-amber-200" }];
  if (c.dot > 0) out.push({ label: "継続", value: c.dot, cls: "text-orange-300", note: "発火・出血・毒・継続ダメージ (敵側の倍率を割り戻した物)。中身の式は PoB の数字のまま" });
  if (c.other > 0) out.push({ label: "インペイル等", value: c.other, cls: "text-sky-300", note: "インペイル・ミラージュ (PoB の数字のまま)" });
  if (c.minion > 0) out.push({ label: c.minionName ? `ミニオン (${c.minionName})` : "ミニオン", value: c.minion, cls: "text-emerald-300", note: "ミニオン・コンパニオンの DPS (PoB の数字のまま)" });
  return out;
});
</script>

<template>
  <div class="mb-6 space-y-4">
    <!-- 読み込み / 失敗 / 無し -->
    <p v-if="!focus" class="note">上のバーにスキルが無いので内訳はありません。</p>
    <p v-else-if="error" class="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">内訳を取れませんでした: {{ error }}</p>
    <div v-else-if="!chain" class="flex items-center gap-2 text-sm text-amber-200/80"><span class="h-2.5 w-2.5 animate-ping rounded-full bg-amber-300" />PoB から内訳を取っています</div>

    <template v-if="chain && focus">
      <!-- 1. 行の DPS = ヒット + 継続 + … -->
      <section class="card p-4">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p class="flex items-center gap-1.5 text-[13px] font-bold">
            <GemIcon :en="chain.skill" :size="22" />
            <GemName :en="chain.skill" :label="gemJa(chain.skill)" />
            <span class="text-[11px] font-normal text-[var(--exile-color-text-tertiary)]">の DPS はこう出ている</span>
          </p>
          <span v-if="loading || !fresh" class="flex items-center gap-1 text-[11px] text-amber-200/80"><span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />取り直し中</span>
          <span v-else-if="chain.okDps && chain.okHit && !chain.mismatches.length" class="rounded-full bg-emerald-500/15 px-2 py-px text-[11px] text-emerald-300" title="下の式の数字を掛け合わせると表の DPS になる (丸めの誤差 0.5% 以内)">辿ると一致</span>
          <span v-else class="rounded-full bg-amber-500/15 px-2 py-px text-[11px] text-amber-200" :title="chain.mismatches.join(' / ')">一部合わない所あり (下の注記)</span>
        </div>
        <div class="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span class="text-3xl font-black leading-none tabular-nums text-amber-200">{{ fmtNum(chain.dps) }}</span>
          <template v-for="(t, i) in terms" :key="t.label">
            <span class="text-[var(--exile-color-text-tertiary)]">{{ i === 0 ? "=" : "+" }}</span>
            <span class="inline-flex items-baseline gap-1" :title="t.note">
              <span class="text-[17px] font-bold tabular-nums" :class="t.cls">{{ fmtNum(t.value) }}</span>
              <span class="text-[11px] text-[var(--exile-color-text-secondary)]">{{ t.label }}</span>
            </span>
          </template>
        </div>
        <p class="note mt-2">
          数字はゲーム内の表記 (敵の耐性・呪い・露出 = 敵側の倍率を入れない)。PoB の敵込みの DPS は {{ fmtNum(chain.pobDps) }}
          <template v-if="chain.enemy.length"> (敵側の倍率: <span v-for="(e, i) in chain.enemy" :key="e.type">{{ i ? "、" : "" }}{{ typeJa(e.type) }} {{ x(e.effMult, 3) }}</span>)</template>
          <template v-if="chain.cull > 0">。カリングの分 {{ fmtNum(chain.cull) }} も表記に無いので入れていない</template>
        </p>
        <ul v-if="chain.mismatches.length" class="mt-2 space-y-0.5 text-[11px] text-amber-200/90">
          <li v-for="m in chain.mismatches" :key="m">合わない: {{ m }} — PoB の式に上限・丸めなどが掛かっている所。実際の値 (PoB) の方を使っています</li>
        </ul>
      </section>

      <!-- 手ごと (スペルは 1 つ、アタックは メインハンド / オフハンド) -->
      <template v-for="h in chain.hands" :key="h.key ?? 'skill'">
        <h2 v-if="chain.hands.length > 1" class="sec-title">{{ handLabel(h) }}<span class="sec-note">ヒットの DPS {{ fmtNum(h.dps) }}{{ chain.dual && !chain.combines ? " (交互に振るので両手の和 ÷ 2 が行の値)" : "" }}</span></h2>

        <!-- 2. ヒットの DPS = 平均の 1 発 × 命中率 × 回数 -->
        <section class="card p-4">
          <p class="text-[11px] font-semibold text-[var(--exile-color-text-secondary)]">ヒットの DPS</p>
          <div class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] tabular-nums">
            <span class="text-[22px] font-black text-amber-200">{{ fmtNum(h.dps) }}</span>
            <span class="text-[var(--exile-color-text-tertiary)]">=</span>
            <span><b class="text-[15px]">{{ fmtNum(h.avg) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">平均の 1 発</span></span>
            <span class="text-[var(--exile-color-text-tertiary)]">×</span>
            <span><b class="text-[15px]">{{ (h.hitSpeed ?? h.speed).toFixed(2) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">{{ h.hitSpeed != null ? "1 秒のヒット回数" : "1 秒の回数" }}</span></span>
            <template v-if="h.hitChance < 1">
              <span class="text-[var(--exile-color-text-tertiary)]">×</span>
              <span><b class="text-[15px]">{{ (h.hitChance * 100).toFixed(0) }}%</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">命中率</span></span>
            </template>
            <template v-if="hasDpsMult(h)">
              <span class="text-[var(--exile-color-text-tertiary)]">×</span>
              <span><b class="text-[15px]">{{ h.dpsMult.toFixed(2) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">DPS 倍率 (スキル固有)</span></span>
            </template>
            <template v-if="hasQuantity(h)">
              <span class="text-[var(--exile-color-text-tertiary)]">×</span>
              <span><b class="text-[15px]">{{ h.quantity }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">数</span></span>
            </template>
          </div>
          <!-- 3. 平均の 1 発 -->
          <div class="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] tabular-nums">
            <span class="text-[11px] font-semibold text-[var(--exile-color-text-secondary)]">平均の 1 発</span>
            <span class="text-[15px] font-bold">{{ fmtNum(h.avg) }}</span>
            <span class="text-[var(--exile-color-text-tertiary)]">=</span>
            <span><b>{{ fmtNum(h.hit) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">1 発</span> × (1 − <b>{{ (h.cc * 100).toFixed(1) }}%</b>)</span>
            <span class="text-[var(--exile-color-text-tertiary)]">+</span>
            <span><b>{{ fmtNum(h.crit) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">クリティカルの 1 発</span> × <b>{{ (h.cc * 100).toFixed(1) }}%</b></span>
            <span class="note">(クリティカルの 1 発 = 1 発 × クリ倍率 {{ x(h.critMult) }})</span>
          </div>
          <!-- 4. 種類ごとの 1 発 -->
          <div class="mt-3 grid gap-3 @5xl:grid-cols-2">
            <div v-for="t in h.types" :key="t.type" class="rounded-lg border border-white/10 p-3" :style="{ borderLeftColor: typeColor(t.type), borderLeftWidth: '3px' }">
              <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px] tabular-nums">
                <span class="text-[12px] font-bold" :style="{ color: typeColor(t.type) }">{{ typeJa(t.type) }}の 1 発</span>
                <span class="text-[17px] font-black">{{ fmtNum(t.pobValue) }}</span>
                <span class="text-[var(--exile-color-text-tertiary)]">=</span>
                <span :title="`${t.min.toFixed(1)}〜${t.max.toFixed(1)} の平均 (運の良いヒットなら 1/3・2/3 で平均)`"><b>{{ fmtNum(t.base) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">基礎 ({{ fmtNum(t.min) }}〜{{ fmtNum(t.max) }})</span></span>
                <span class="text-[var(--exile-color-text-tertiary)]">×</span>
                <span>(1 <b class="text-sky-200">{{ pct(t.incPct) }}</b>) <span class="text-[11px] text-[var(--exile-color-text-secondary)]">増加</span></span>
                <span class="text-[var(--exile-color-text-tertiary)]">×</span>
                <span><b class="text-orange-200">{{ x(t.more) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">増し</span></span>
                <template v-if="extraMult(t)">
                  <span class="text-[var(--exile-color-text-tertiary)]">×</span>
                  <span><b>{{ x(t.allMult) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">その他 (ダブルダメージ・ウォークライ等)</span></span>
                </template>
                <span v-if="t.lucky > 0" class="note">運の良いヒット {{ (t.lucky * 100).toFixed(0) }}%</span>
                <span v-if="!t.ok" class="rounded-full bg-amber-500/15 px-2 py-px text-[10px] text-amber-200">辿った値 {{ fmtNum(t.value) }}</span>
              </div>
              <!-- 基礎の中身 -->
              <p class="note mt-1">
                基礎:
                <template v-if="t.src.min || t.src.max || t.added.min || t.added.max">
                  <template v-if="t.src.min || t.src.max">{{ t.src.weapon ? "武器" : "スキル (ジェムのレベル)" }} {{ fmtNum(t.src.min) }}〜{{ fmtNum(t.src.max) }}</template><template v-if="t.added.min || t.added.max">{{ t.src.min || t.src.max ? " + " : "" }}追加 {{ fmtNum(t.added.min) }}〜{{ fmtNum(t.added.max) }}<template v-if="Math.abs(t.added.mult - 1) > 1e-6"> × {{ x(t.added.mult) }}</template></template><template v-if="Math.abs(t.baseMultiplier - 1) > 1e-6"> × {{ x(t.baseMultiplier) }} (スキルの倍率)</template><template v-if="t.convMult < 1"> × {{ x(t.convMult) }} (他の種類へ変換)</template><template v-if="Math.abs(t.min - (t.src.min + t.added.min * t.added.mult) * t.baseMultiplier * t.convMult) > 0.5 || Math.abs(t.max - (t.src.max + t.added.max * t.added.mult) * t.baseMultiplier * t.convMult) > 0.5"> → 他の種類からの変換・追加分を足して {{ fmtNum(t.min) }}〜{{ fmtNum(t.max) }}</template>
                </template>
                <template v-else>この種類の基礎は無く、他の種類からの変換・追加分 {{ fmtNum(t.min) }}〜{{ fmtNum(t.max) }}</template>
              </p>
              <div class="mt-2 space-y-2">
                <BreakdownModList :rows="t.incMods" title="増加" :total="`合計 ${pct(t.incPct)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="inc" @act="(m, a) => emit('act', m, a)" />
                <BreakdownModList :rows="t.moreMods" title="増し" :total="`積 ${x(t.more)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="more" @act="(m, a) => emit('act', m, a)" />
                <BreakdownModList v-if="t.addedMods.length" :rows="t.addedMods" title="追加ダメージ" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="base" @act="(m, a) => emit('act', m, a)" />
              </div>
            </div>
          </div>
        </section>

        <!-- 5. 回数 / クリ率 / クリ倍率 -->
        <div class="grid gap-3 @5xl:grid-cols-3">
          <section class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-secondary)]">1 秒の回数</p>
            <div class="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[12px] tabular-nums">
              <span class="text-[17px] font-black">{{ h.speedChain.speed.toFixed(2) }}</span>
              <template v-if="h.speedChain.fixed">
                <span class="note">{{ h.speedChain.triggered ? "発動の頻度 (固定)" : "固定の速さ (増加は効かない)" }}</span>
              </template>
              <template v-else>
                <span class="text-[var(--exile-color-text-tertiary)]">=</span>
                <span><b>{{ h.speedChain.baseRate.toFixed(2) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">基礎 ({{ h.speedChain.baseTime.toFixed(2) }} 秒{{ h.speedChain.attack ? "の武器" : "の詠唱" }})</span></span>
                <span class="text-[var(--exile-color-text-tertiary)]">×</span>
                <span>(1 <b class="text-sky-200">{{ pct(h.speedChain.incPct) }}</b>)</span>
                <template v-if="Math.abs(h.speedChain.more - 1) > 1e-6"><span class="text-[var(--exile-color-text-tertiary)]">×</span><span><b class="text-orange-200">{{ x(h.speedChain.more) }}</b></span></template>
                <template v-if="Math.abs(h.speedChain.action - 1) > 1e-6"><span class="text-[var(--exile-color-text-tertiary)]">×</span><span><b>{{ x(h.speedChain.action) }}</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">行動速度</span></span></template>
                <span v-if="!h.speedChain.ok" class="note">→ 辿ると {{ h.speedChain.derived.toFixed(2) }}。{{ h.speedChain.cooldown ? `クールダウン ${h.speedChain.cooldown.toFixed(2)} 秒` : "上限" }}で {{ h.speedChain.speed.toFixed(2) }} に</span>
              </template>
              <span v-if="h.speedChain.hitSpeed != null" class="note">ヒットは 1 秒に {{ h.speedChain.hitSpeed.toFixed(2) }} 回 (DPS はこちら)</span>
            </div>
            <div v-if="!h.speedChain.fixed" class="mt-2 space-y-2">
              <BreakdownModList :rows="h.speedChain.incMods" title="増加" :total="`合計 ${pct(h.speedChain.incPct)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="inc" @act="(m, a) => emit('act', m, a)" />
              <BreakdownModList v-if="h.speedChain.moreMods.length" :rows="h.speedChain.moreMods" title="増し" :total="`積 ${x(h.speedChain.more)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="more" @act="(m, a) => emit('act', m, a)" />
            </div>
          </section>

          <section class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-secondary)]">クリティカルヒット率</p>
            <div class="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[12px] tabular-nums">
              <span class="text-[17px] font-black">{{ h.critChain.eff.toFixed(1) }}%</span>
              <template v-if="h.critChain.never"><span class="note">クリティカルしない</span></template>
              <template v-else-if="h.critChain.override != null"><span class="note">固定 {{ h.critChain.override }}%</span></template>
              <template v-else>
                <span class="text-[var(--exile-color-text-tertiary)]">=</span>
                <span>(<b>{{ h.critChain.baseCrit.toFixed(2) }}%</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">基礎</span><template v-if="Math.abs(h.critChain.base) > 1e-6"> + <b>{{ h.critChain.base.toFixed(2) }}%</b></template>)</span>
                <span class="text-[var(--exile-color-text-tertiary)]">×</span>
                <span>(1 <b class="text-sky-200">{{ pct(h.critChain.incPct) }}</b>)</span>
                <template v-if="Math.abs(h.critChain.more - 1) > 1e-6"><span class="text-[var(--exile-color-text-tertiary)]">×</span><span><b class="text-orange-200">{{ x(h.critChain.more) }}</b></span></template>
                <span v-if="h.critChain.raw > h.critChain.cap + 1e-6" class="note">= {{ h.critChain.raw.toFixed(1) }}% → 上限 {{ h.critChain.cap }}%</span>
                <span v-if="h.critChain.accuracy < 100" class="note">× 命中 {{ h.critChain.accuracy.toFixed(0) }}%</span>
                <span v-if="h.critChain.lucky" class="note">運が良い</span>
                <span v-if="h.critChain.bifurcate" class="note">分岐</span>
                <span v-if="h.critChain.inevitable" class="note">必然のクリティカル</span>
              </template>
            </div>
            <div v-if="h.critChain.override != null && h.critChain.overrideMods.length" class="mt-2">
              <BreakdownModList :rows="h.critChain.overrideMods" title="固定の出所" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="override" @act="(m, a) => emit('act', m, a)" />
            </div>
            <div v-if="!h.critChain.never && h.critChain.override == null" class="mt-2 space-y-2">
              <BreakdownModList v-if="h.critChain.baseMods.length" :rows="h.critChain.baseMods" title="加算" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="base" @act="(m, a) => emit('act', m, a)" />
              <BreakdownModList :rows="h.critChain.incMods" title="増加" :total="`合計 ${pct(h.critChain.incPct)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="inc" @act="(m, a) => emit('act', m, a)" />
              <BreakdownModList v-if="h.critChain.moreMods.length" :rows="h.critChain.moreMods" title="増し" :total="`積 ${x(h.critChain.more)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="more" @act="(m, a) => emit('act', m, a)" />
            </div>
          </section>

          <section class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-secondary)]">クリティカル倍率</p>
            <div class="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[12px] tabular-nums">
              <span class="text-[17px] font-black">{{ x(h.critMultChain.value) }}</span>
              <template v-if="h.critMultChain.none"><span class="note">クリティカルで増えない</span></template>
              <template v-else>
                <span class="text-[var(--exile-color-text-tertiary)]">=</span>
                <span>1 + <b>{{ h.critMultChain.override != null ? h.critMultChain.override : h.critMultChain.basePct }}%</b> <span class="text-[11px] text-[var(--exile-color-text-secondary)]">ボーナス{{ h.critMultChain.override != null ? " (固定)" : "" }}</span></span>
                <template v-if="h.critMultChain.override == null && Math.abs(h.critMultChain.incPct) > 1e-6"><span class="text-[var(--exile-color-text-tertiary)]">×</span><span>(1 <b class="text-sky-200">{{ pct(h.critMultChain.incPct) }}</b>)</span></template>
                <template v-if="h.critMultChain.override == null && Math.abs(h.critMultChain.more - 1) > 1e-6"><span class="text-[var(--exile-color-text-tertiary)]">×</span><span><b class="text-orange-200">{{ x(h.critMultChain.more) }}</b></span></template>
                <span v-if="Math.abs(h.critMultChain.enemyBase) > 1e-6 || Math.abs(h.critMultChain.enemyInc) > 1e-6" class="note">敵側: {{ h.critMultChain.enemyBase ? `${pct(h.critMultChain.enemyBase)} ` : "" }}{{ h.critMultChain.enemyInc ? `受けるクリダメージ ${pct(h.critMultChain.enemyInc)}` : "" }}</span>
              </template>
            </div>
            <!-- 固定 (OVERRIDE) の時は加算・増加・増しは効かないので、固定の出所だけ -->
            <div v-if="!h.critMultChain.none && h.critMultChain.override != null" class="mt-2">
              <BreakdownModList :rows="h.critMultChain.overrideMods" title="固定の出所" :total="`ボーナス = ${h.critMultChain.override}% (加算・増加・増しは効かない)`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="override" @act="(m, a) => emit('act', m, a)" />
            </div>
            <div v-if="!h.critMultChain.none && h.critMultChain.override == null" class="mt-2 space-y-2">
              <BreakdownModList :rows="h.critMultChain.baseMods" title="ボーナス" :total="`合計 +${h.critMultChain.basePct}%`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="base" @act="(m, a) => emit('act', m, a)" />
              <BreakdownModList v-if="h.critMultChain.incMods.length" :rows="h.critMultChain.incMods" title="増加" :total="`合計 ${pct(h.critMultChain.incPct)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="inc" @act="(m, a) => emit('act', m, a)" />
              <BreakdownModList v-if="h.critMultChain.moreMods.length" :rows="h.critMultChain.moreMods" title="増し" :total="`積 ${x(h.critMultChain.more)}`" :line-ja="lineJa" :busy="busy" :power-charges="chain.powerCharges" tone="more" @act="(m, a) => emit('act', m, a)" />
            </div>
          </section>
        </div>
      </template>

      <p class="note">
        要素の行の「外す」「オフ」「チャージ 0 に」は 装備 / パッシブツリー / ジェム のタブと同じ操作 (上のバーに差が出て、ここも計算し直す)。
        相手の装備やジェムを自分に当てて計算する (自分の物で計算) は
        <button type="button" class="btn-link" @click="emit('go-diff')">相手との差の「取り入れたら」</button>{{ hasTarget ? "" : " (先に比べる相手を読み込む)" }}。
        増加 / 増しの値は条件 (パワーチャージの数など) を今のビルドで評価した後の数字。継続・ミニオンの中身は PoB の数字のまま (式には分けていない)
      </p>
    </template>
  </div>
</template>
