<!--
  PobCheck.vue — 火力チェック (2026-10-02)

  同梱の PoB でビルドを読み込み、ジェムやパワーチャージを変えて計算し直し、前と比べる。
  数字はゲーム内の表記 (敵の耐性・呪い・露出を割り戻した値)。計算は PoB のまま (memory: pob-ui-remake-direction)。
  オーナー「pob新しいやつはUIシンプルかつわかりやすく、色付きで今風で表示してくれ」
-->
<script setup lang="ts">
import { computed } from "vue";
import DiffBadge from "./DiffBadge.vue";
import SkillCard from "./SkillCard.vue";
import GemGroupCard from "./GemGroupCard.vue";
import { fmtNum } from "./fmt";
import { usePobCheck } from "./usePobCheck";

const { input, loading, busy, error, cur, base, baseAt, skills, baseSkills, total, baseTotal, groups, merged, load, setBaseToNow, changeGem, toggleGroup, changeCharges } =
  usePobCheck();

const num = (k: string): number => {
  const v = cur.value?.stats[k];
  return typeof v === "number" ? v : 0;
};
const charges = computed(() => cur.value?.config.powerCharges ?? 0);
const chargesMax = computed(() => Math.max(num("PowerChargesMax"), 3));
const sameAsBase = computed(() => cur.value === base.value);

const statChips = computed(() => {
  if (!cur.value) return [];
  const list: Array<{ label: string; value: string; cls: string }> = [
    { label: "ライフ", value: fmtNum(num("Life")), cls: "text-rose-300" },
    { label: "マナ", value: fmtNum(num("Mana")), cls: "text-sky-300" },
  ];
  if (num("EnergyShield") > 0) list.push({ label: "ES", value: fmtNum(num("EnergyShield")), cls: "text-cyan-200" });
  if (num("Ward") > 0) list.push({ label: "ワード", value: fmtNum(num("Ward")), cls: "text-amber-200" });
  // 残りがマイナスになるビルドがある (PoB が武器セットの両方の予約を足す)。その時は合計だけ
  const left = num("SpiritUnreserved");
  list.push(
    left >= 0
      ? { label: "スピリット残り", value: `${Math.round(left)} / ${Math.round(num("Spirit"))}`, cls: "text-violet-200" }
      : { label: "スピリット", value: `${Math.round(num("Spirit"))}`, cls: "text-violet-200" },
  );
  return list;
});
const resists = computed(() =>
  cur.value
    ? [
        { label: "火", v: num("FireResist"), cls: "text-orange-300" },
        { label: "冷", v: num("ColdResist"), cls: "text-sky-300" },
        { label: "雷", v: num("LightningResist"), cls: "text-yellow-200" },
        { label: "混", v: num("ChaosResist"), cls: "text-fuchsia-300" },
      ]
    : [],
);
</script>

<template>
  <div class="h-full overflow-auto p-4 @container">
    <!-- 見出しと読み込み -->
    <div class="mb-4">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">火力チェック</h1>
      <p class="mt-1 text-xs text-[var(--exile-color-text-secondary)]">PoB のコードか poe.ninja のキャラの URL を貼って読み込み。ジェムやチャージを変えると、読み込んだ時との差が出ます。</p>
      <form class="mt-3 flex gap-2" @submit.prevent="load">
        <input
          v-model="input"
          type="text"
          placeholder="PoB コード / https://poe.ninja/poe2/builds/... の URL"
          class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--exile-color-accent-focus)]"
        />
        <button
          type="submit"
          class="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-sm font-bold text-black shadow disabled:opacity-40"
          :disabled="loading || !input.trim()"
        >{{ loading ? "読み込み中…" : "読み込む" }}</button>
      </form>
      <p v-if="error" class="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{{ error }}</p>
    </div>

    <template v-if="cur">
      <!-- キャラ -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <span class="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-semibold">
          {{ cur.char.ascendancy || cur.char.class }} <span class="ml-1 text-[var(--exile-color-text-tertiary)]">Lv {{ cur.char.level }}</span>
        </span>
        <span v-for="c in statChips" :key="c.label" class="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
          <span class="text-[var(--exile-color-text-tertiary)]">{{ c.label }}</span>
          <span class="ml-1.5 font-semibold tabular-nums" :class="c.cls">{{ c.value }}</span>
        </span>
        <span class="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
          <span class="text-[var(--exile-color-text-tertiary)]">耐性</span>
          <span v-for="r in resists" :key="r.label" class="ml-1.5 font-semibold tabular-nums" :class="r.cls">{{ r.label }}{{ Math.round(r.v) }}</span>
        </span>
        <span v-if="cur.stats.LowLife" class="rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-xs font-semibold text-rose-200">低ライフ</span>
      </div>

      <!-- 合計と操作 -->
      <div class="mb-5 flex flex-wrap items-stretch gap-3">
        <div class="relative flex-1 overflow-hidden rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/15 via-orange-500/5 to-transparent px-5 py-4">
          <p class="text-xs text-amber-100/70">スキルの DPS の合計 <span class="text-[var(--exile-color-text-tertiary)]">(ゲーム内の表記)</span></p>
          <div class="mt-1 flex items-baseline gap-3">
            <p class="text-4xl font-black tabular-nums text-amber-200">{{ fmtNum(total) }}</p>
            <DiffBadge :now="total" :before="baseTotal" size="lg" />
          </div>
          <p class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
            比べる元: {{ baseAt }}<template v-if="!sameAsBase"> ({{ fmtNum(baseTotal) }})</template>
          </p>
          <div v-if="busy" class="absolute right-4 top-4 flex items-center gap-1.5 text-[11px] text-amber-200/80">
            <span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />計算中
          </div>
        </div>
        <div class="flex flex-col justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <div>
            <p class="text-[11px] text-[var(--exile-color-text-tertiary)]">パワーチャージ</p>
            <div class="mt-1 flex items-center gap-1">
              <button
                v-for="n in chargesMax + 1"
                :key="n"
                type="button"
                class="h-7 w-7 rounded-md text-xs font-semibold tabular-nums transition-colors"
                :class="n - 1 === charges ? 'bg-sky-500 text-white' : 'bg-white/5 text-[var(--exile-color-text-secondary)] hover:bg-white/15'"
                :disabled="busy"
                @click="changeCharges(n - 1)"
              >{{ n - 1 }}</button>
            </div>
          </div>
          <button
            type="button"
            class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-40"
            :disabled="sameAsBase"
            @click="setBaseToNow"
          >今を比べる元にする</button>
        </div>
      </div>

      <!-- スキル -->
      <h2 class="mb-2 text-sm font-bold text-[var(--exile-color-text-secondary)]">スキル <span class="font-normal text-[var(--exile-color-text-tertiary)]">DPS の高い順</span></h2>
      <div class="mb-6 grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <SkillCard
          v-for="x in skills"
          :key="x.key"
          :skill="x.s"
          :before="baseSkills.get(x.key)"
          :count="x.count"
          :share="total > 0 ? (x.s.game.dps / total) * 100 : 0"
        />
      </div>

      <!-- ジェム -->
      <h2 class="mb-2 text-sm font-bold text-[var(--exile-color-text-secondary)]">
        ジェム <span class="font-normal text-[var(--exile-color-text-tertiary)]">変えるとすぐ計算し直します<template v-if="merged > 0"> ・ 同じ中身の組 {{ merged }} 個はまとめました</template></span>
      </h2>
      <div class="mb-6 grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <GemGroupCard
          v-for="g in groups"
          :key="g.i"
          :group="g"
          :disabled="busy"
          @gem="(j, field, value) => changeGem(g.i, j, field, value)"
          @group="(en) => toggleGroup(g.i, en)"
        />
      </div>

      <p class="text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)]">
        数字はゲームのスキルの詳細と同じ書き方です (敵の耐性・呪い・露出は入れない)。常時のバフは入っています。
        「自動で発動」のスキルは、PoB が発動の頻度を計算しないので自分で撃った時の数字です。計算は同梱の PoB のままです。
      </p>
    </template>
  </div>
</template>
