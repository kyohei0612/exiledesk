<!--
  BuildDiff.vue — 比べる相手との差 (2026-10-03 オーナー「自分に足りない MOD をそれぞれ出したい。ユニークは装備ごと、
  レアは足りない MOD だけ『これからこれ』。火力比較で」)

  上: 相手のキャラと、上のバーのスキルの DPS (自分 → 相手の同じ名前のスキル、無ければ相手の一番高いスキル)。
      「相手のビルドをゲームのビルドプランナーに書き出す」(2026-10-03) もここ。
  中: ジェム (2026-10-03 オーナー「ジェムも」): 相手の組ごとに、自分に無い組は組ごと、ある組は足りないジェム / 低いレベル・品質だけ。
  下: 欄ごとに ユニーク = 「名前 → 名前」、レア = 足りない / 弱い MOD の行だけ「自分の行 → 相手の行」。差の無い欄は出さない。
  決まりは services/pob-check/build-diff.ts
-->
<script setup lang="ts">
import { computed, shallowRef, watch } from "vue";
import itemsJaClient from "../../i18n/items-ja-client.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import { gemJa, type ItemView, type Summary } from "../../services/pob-check/api";
import { diffBuilds, diffGems, type GemLineDiff } from "../../services/pob-check/build-diff";
import { linesToJa, rareNameJa } from "../../services/pob-check/item-text";
import { slotJa } from "../../services/pob-check/slots";
import type { SkillRow } from "./usePobCheck";
import { fmtNum } from "./fmt";
import DiffBadge from "./DiffBadge.vue";

const props = defineProps<{
  mine: Summary;
  target: Summary;
  targetFrom: string;
  focus: SkillRow | null;
  /** 相手のビルドプランナーの中身があるか (読み込んだ時に作れなかったら押せない) */
  canPlan: boolean;
  /** 書き出した後に出す文 */
  planMsg: string;
  busy: boolean;
}>();
const emit = defineEmits<{ (e: "clear"): void; (e: "plan"): void }>();

const gems = computed(() => diffGems(props.mine, props.target));
/** ジェムの差の行の文 (「無し → 名前」「Lv 20 → Lv 21」「品質 0% → 20%」) */
const gemLine = (l: GemLineDiff): { gem: string; from: string; to: string } => {
  const gem = gemJa(l.gem);
  if (l.kind === "missing") return { gem, from: "無し", to: gem };
  if (l.kind === "level") return { gem, from: `Lv ${l.from}`, to: `Lv ${l.to}` };
  return { gem, from: `品質 ${l.from}%`, to: `品質 ${l.to}%` };
};

const JA_BASE = itemsJaClient as Record<string, string>;
const JA_UNIQUE = uniqueNamesJa as Record<string, string>;
const nameJa = (it: ItemView | null): string => {
  if (!it) return "無し";
  const r = it.rarity.toUpperCase();
  const base = JA_BASE[it.base] ?? it.base;
  if (r === "UNIQUE") return `${JA_UNIQUE[it.title] ?? it.title} (${base})`;
  if (r === "RARE") return `${rareNameJa(it.title) ?? it.title} (${base})`;
  return base;
};

const diff = computed(() => diffBuilds(props.mine, props.target));

/** 相手のスキル: 上のバーと同じ名前の物、無ければ DPS が一番高い物 */
const targetSkill = computed(() => {
  const all = props.target.groups.filter((g) => g.enabled && !g.duplicateOf).flatMap((g) => g.skills);
  const same = props.focus ? all.filter((s) => s.name === props.focus!.s.name).sort((a, b) => b.game.dps - a.game.dps)[0] : undefined;
  return same ?? all.sort((a, b) => b.game.dps - a.game.dps)[0] ?? null;
});

/** MOD の行の日本語 (英語 → 日本語は辞書の逆引き。まとめて 1 回) */
const ja = shallowRef<Map<string, string>>(new Map());
watch(
  diff,
  async (d) => {
    const lines = new Set<string>();
    for (const s of d.slots) if (s.kind === "mods") for (const m of s.mods) { if (m.from) lines.add(m.from); lines.add(m.to); }
    const arr = [...lines];
    const out = await linesToJa(arr);
    ja.value = new Map(arr.map((l, i) => [l, out[i] ?? l]));
  },
  { immediate: true },
);
const lineJa = (l: string): string => ja.value.get(l) ?? l;
const stat = (s: Summary, k: string): number => (typeof s.stats[k] === "number" ? (s.stats[k] as number) : 0);
const STATS = [
  { k: "Life", label: "ライフ" },
  { k: "EnergyShield", label: "ES" },
  { k: "Mana", label: "マナ" },
  { k: "FireResist", label: "火" },
  { k: "ColdResist", label: "冷" },
  { k: "LightningResist", label: "雷" },
  { k: "ChaosResist", label: "混" },
];
</script>

<template>
  <div class="mb-6 space-y-4">
    <!-- 相手と火力 -->
    <div class="rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/[0.06] to-transparent p-4">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p class="text-sm font-bold text-sky-200">
          比べる相手: {{ target.char.ascendancy || target.char.class }} <span class="text-[var(--exile-color-text-tertiary)]">Lv {{ target.char.level }}</span>
          <span class="ml-2 text-[11px] font-normal text-[var(--exile-color-text-tertiary)]">{{ targetFrom }} から</span>
        </p>
        <button type="button" class="rounded bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold hover:bg-white/15" @click="emit('clear')">相手を外す</button>
        <!-- 相手のツリーとジェムをゲームのビルドプランナー (.build) に。中身は相手を読み込んだ時に作ってある -->
        <button
          type="button"
          class="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/30 disabled:opacity-40"
          :disabled="!canPlan || busy"
          :title="canPlan ? '相手のパッシブとジェムを Documents/My Games/Path of Exile 2/BuildPlanner に .build で書く。ゲームのビルドプランナーの一覧に出る' : '相手を読み込んだ時にビルドプランナーの中身を作れませんでした (相手を読み直す)'"
          @click="emit('plan')"
        >相手のビルドをゲームのビルドプランナーに書き出す</button>
        <span v-if="planMsg" class="text-[11px] text-emerald-200">{{ planMsg }}</span>
      </div>
      <div v-if="focus && targetSkill" class="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)]">自分 — {{ gemJa(focus.s.name) }}</p>
          <p class="text-2xl font-black tabular-nums text-amber-200">{{ fmtNum(focus.s.game.dps) }}</p>
        </div>
        <p class="pb-1 text-xl text-[var(--exile-color-text-tertiary)]">→</p>
        <div>
          <p class="text-[11px] text-[var(--exile-color-text-tertiary)]">相手 — {{ gemJa(targetSkill.name) }}<span v-if="targetSkill.name !== focus.s.name"> (同じスキルが無いので一番高い物)</span></p>
          <p class="text-2xl font-black tabular-nums text-sky-200">{{ fmtNum(targetSkill.game.dps) }}</p>
        </div>
        <DiffBadge :now="targetSkill.game.dps" :before="focus.s.game.dps" size="lg" />
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <span v-for="s in STATS" :key="s.k" class="rounded-lg bg-white/[0.04] px-2.5 py-1 text-xs tabular-nums">
          <span class="text-[var(--exile-color-text-tertiary)]">{{ s.label }}</span>
          <span class="ml-1.5 font-semibold">{{ Math.round(stat(mine, s.k)) }}</span>
          <span class="mx-1 text-[var(--exile-color-text-tertiary)]">→</span>
          <span class="font-semibold text-sky-200">{{ Math.round(stat(target, s.k)) }}</span>
        </span>
      </div>
    </div>

    <!-- ジェムの差 (相手の組ごと) -->
    <div>
      <p class="mb-1.5 text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">
        ジェム
        <span class="ml-1 font-normal">
          <template v-if="!gems.groups.length">— 差はありません (相手の組は全部あって、ジェムも足りている)</template>
          <template v-else>— 相手の組 {{ gems.groups.length }} 個に差</template>
          <template v-if="gems.onlyMine"> ・ 自分だけの組 {{ gems.onlyMine }} 個</template>
        </span>
      </p>
      <div v-if="gems.groups.length" class="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <template v-for="(g, gi) in gems.groups" :key="gi">
          <div v-if="g.kind === 'missing'" class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">{{ gemJa(g.active.name) }} — 自分に無い組</p>
            <p class="mt-1.5 text-[13px]">
              <span class="text-rose-300/80">無し</span>
              <span class="mx-2 text-[var(--exile-color-text-tertiary)]">→</span>
              <span class="font-bold text-amber-200">{{ gemJa(g.active.name) }}</span>
              <span v-if="g.others.length" class="text-emerald-200"> + {{ g.others.map((x) => gemJa(x.name)).join("、") }}</span>
            </p>
          </div>
          <div v-else class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">{{ gemJa(g.active.name) }} の組 — 足りない / 低い {{ g.lines.length }} 件</p>
            <ul class="mt-1.5 space-y-1 text-[12px] leading-snug">
              <li v-for="(l, i) in g.lines" :key="i" class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2">
                <span :class="l.kind === 'missing' ? 'text-rose-300/80' : 'text-[var(--exile-color-text-secondary)]'">{{ l.kind === "missing" ? "無し" : `${gemLine(l).gem} ${gemLine(l).from}` }}</span>
                <span class="text-[var(--exile-color-text-tertiary)]">→</span>
                <span class="text-emerald-200">{{ l.kind === "missing" ? gemLine(l).to : `${gemLine(l).gem} ${gemLine(l).to}` }}</span>
              </li>
            </ul>
          </div>
        </template>
      </div>
    </div>

    <!-- 欄ごとの差 -->
    <p class="mb-1.5 text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">装備</p>
    <p v-if="!diff.slots.length" class="text-sm text-[var(--exile-color-text-secondary)]">装備に差はありません (同じユニーク、または相手より弱い MOD が無い)。</p>
    <div v-else class="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
      <template v-for="d in diff.slots" :key="d.slot">
        <div v-if="d.kind === 'unique'" class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">{{ slotJa(d.slot) }} — ユニーク (装備ごと)</p>
          <p class="mt-1.5 text-[13px]">
            <span :class="d.from ? 'text-[var(--exile-color-text-secondary)]' : 'text-rose-300/80'">{{ nameJa(d.from) }}</span>
            <span class="mx-2 text-[var(--exile-color-text-tertiary)]">→</span>
            <span class="font-bold text-amber-200">{{ nameJa(d.to) }}</span>
          </p>
        </div>
        <div v-else-if="d.kind === 'mods'" class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">
            {{ slotJa(d.slot) }} — 足りない MOD {{ d.mods.length }} 行
            <span class="ml-1 font-normal">({{ nameJa(d.from) }} → {{ nameJa(d.to) }})</span>
          </p>
          <ul class="mt-1.5 space-y-1 text-[12px] leading-snug">
            <li v-for="(m, i) in d.mods" :key="i" class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2">
              <span :class="m.from ? 'text-[var(--exile-color-text-secondary)]' : 'text-rose-300/80'">{{ m.from ? lineJa(m.from) : "無し" }}</span>
              <span class="text-[var(--exile-color-text-tertiary)]">→</span>
              <span class="text-emerald-200">{{ lineJa(m.to) }}</span>
            </li>
          </ul>
        </div>
      </template>
    </div>
    <p class="text-[11px] text-[var(--exile-color-text-tertiary)]">
      ジュエル: 自分 {{ diff.jewels.mine }} 個 / 相手 {{ diff.jewels.target }} 個 (穴の位置が人ごとに違うので数だけ)。相手の装備は読み込んだ時の写しで、相手の DPS はゲーム内の表記に寄せた同じ物差しです。
    </p>
  </div>
</template>
