<!--
  UsageTable.vue — 使用率ランキングの表 (完成品 / レベル 21 / 品質 23% の 3 列)
  行を押すと内訳 (何レベル / 何 % で使われているか) が出る。
  2026-09-19 に GemBreak.vue から切り出した。中身は変えていない。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { jaSkill } from "../../i18n/skills-ja";
import { openGemCorrupt } from "../../state/app-nav";
import { addManualGem, isManualGem, removeManualGem } from "../../state/watch-settings";
import { rebuildWatches } from "../../state/gem-watch-auto";
import { sampleBusy, sampleGemNow } from "../gem-corrupt/sample-now";
import gemsRaw from "../../i18n/gems-client.json";

/** ジェムコラプトの賭けで計算できるジェム (英語名) */
const CORRUPTIBLE = new Set((gemsRaw as { en: string }[]).map((g) => g.en));

interface Row {
  name: string;
  users: number;
  lvl21: number;
  q23: number;
  both: number;
  max_level: number;
  max_quality: number;
  /** コラプト済みで使っていた人数 */
  corrupted: number;
  /** [レベル, 人数] 昇順 */
  level_dist: [number, number][];
  /** [品質, 人数] 昇順 */
  quality_dist: [number, number][];
}

const props = defineProps<{ rows: Row[] }>();
const rows = computed(() => props.rows);

// オーナー指示 (2026-09-16): 並びは 完成品 → レベル 21 → 品質 23%
const SECTIONS = [
  { key: "both", label: "完成品 (両方)", icon: "☠", note: "レベル 21 以上かつ品質 23% 以上で使っている人数" },
  { key: "lvl21", label: "レベル 21 以上", icon: "⬆", note: "コラプトでレベルが上がったジェムを使っている人数" },
  { key: "q23", label: "品質 23% 以上", icon: "✧", note: "コラプトで品質が上がったジェムを使っている人数" },
] as const;
type Key = (typeof SECTIONS)[number]["key"];

/** 売れ行きを追う下限 (完成品を使っている人数) */
/** 一覧から自動ジェム監視に入れる / 外す (すぐ追跡に反映する) */
function toggleWatchGem(name: string): void {
  if (isManualGem(name)) {
    removeManualGem(name);
    void rebuildWatches();
    return;
  }
  if (!addManualGem(name)) return;
  // 足したその場で 3 条件の最安を 1 回ずつ取る (6 リクエスト)。監視の一覧に値段がすぐ出る (2026-09-19)
  void rebuildWatches().then(() => sampleGemNow(name));
}

const PAGE = 25;
const showAll = ref<Record<string, boolean>>({});
function listOf(key: Key): Row[] {
  return rows.value
    .filter((r) => r[key] > 0)
    .slice()
    .sort((a, b) => b[key] - a[key] || b.users - a.users || a.name.localeCompare(b.name));
}
const visible = (key: Key): Row[] => (showAll.value[key] ? listOf(key) : listOf(key).slice(0, PAGE));

/** 行を開いてレベル / 品質の内訳を見る */
const expanded = ref<Record<string, boolean>>({});
const toggle = (key: Key, name: string): void => {
  const k = key + "::" + name;
  expanded.value = { ...expanded.value, [k]: !expanded.value[k] };
};
const isOpen = (key: Key, name: string): boolean => !!expanded.value[key + "::" + name];
/** "20:5 / 21:12 / 22:3" (人数の多い順ではなく値の昇順、0 は出さない) */
const distText = (d: [number, number][] | undefined, suffix = ""): string =>
  (d ?? []).map(([v, c]) => `${v}${suffix}: ${c}人`).join(" / ") || "—";
</script>

<template>
    <!-- 段組みは他の「賭け」画面と同じ刻み (狭い時に無理に横並びにしない) -->
    <div class="grid grid-cols-1 @6xl:grid-cols-2 @7xl:grid-cols-3 gap-4 items-start">
      <div v-for="sec in SECTIONS" :key="sec.key" class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-4">
        <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-baseline gap-2">
          <span aria-hidden="true">{{ sec.icon }}</span>
          <span>{{ sec.label }}</span>
        </h2>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-0.5 mb-2">{{ sec.note }}</p>
        <ul class="space-y-0.5">
          <li
            v-for="(r, i) in visible(sec.key)"
            :key="r.name"
            class="py-1 px-1 -mx-1 rounded hover:bg-[var(--exile-color-bg-elevated)] cursor-pointer"
            :title="r.name"
            @click="toggle(sec.key, r.name)"
          >
            <div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2">
              <span class="tabular-nums text-[10px] w-5 text-right text-[var(--exile-color-text-tertiary)]">{{ i + 1 }}</span>
              <div class="flex items-baseline gap-1.5 min-w-0">
                <span class="min-w-0 truncate text-[13px]" :title="r.name">
                  {{ jaSkill(r.name) }}
                  <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ isOpen(sec.key, r.name) ? "▲" : "▼" }}</span>
                </span>
                <button
                  v-if="CORRUPTIBLE.has(r.name)"
                  type="button"
                  class="shrink-0 whitespace-nowrap text-[10px] px-1 rounded border border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] transition-colors"
                  :title="`ジェムコラプトの賭けで ${jaSkill(r.name)} を計算する`"
                  @click.stop="openGemCorrupt(r.name)"
                >
                  このジェムで計算 ↗
                </button>
                <!-- 2026-09-17 オーナー指示: 一覧から直接、自動ジェム監視に入れられるように -->
                <button
                  type="button"
                  class="shrink-0 whitespace-nowrap text-[10px] px-1 rounded border transition-colors"
                  :class="isManualGem(r.name)
                    ? 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)] hover:text-rose-300'
                    : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]'"
                  :disabled="sampleBusy"
                  :title="
                    sampleBusy
                      ? '別のジェムを取得中です。終わってから押せます (通信が重ならないように 1 本ずつ流します)'
                      : isManualGem(r.name)
                        ? '自動ジェム監視から外す'
                        : 'このジェムを自動ジェム監視に入れて、その場で 3 条件を取ります (10 秒後に開始。レート制限中なら明けるまで待ちます)'
                  "
                  @click.stop="toggleWatchGem(r.name)"
                >
                  {{ isManualGem(r.name) ? "監視中 ✓" : "監視へ +" }}
                </button>
              </div>
              <span class="tabular-nums text-[13px] whitespace-nowrap">
                {{ r[sec.key] }} <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">/ {{ r.users }} 人</span>
              </span>
            </div>
            <!-- 内訳: 何レベル / 何 % が実際に使われているか -->
            <dl v-if="isOpen(sec.key, r.name)" class="ml-7 mt-1 space-y-0.5 text-[11px] text-[var(--exile-color-text-secondary)]">
              <div class="flex gap-2">
                <dt class="shrink-0 text-[var(--exile-color-text-tertiary)]">レベル</dt>
                <dd class="tabular-nums">{{ distText(r.level_dist) }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="shrink-0 text-[var(--exile-color-text-tertiary)]">品質</dt>
                <dd class="tabular-nums">{{ distText(r.quality_dist, "%") }}</dd>
              </div>
              <div class="flex gap-2">
                <dt class="shrink-0 text-[var(--exile-color-text-tertiary)]">コラプト済み</dt>
                <dd class="tabular-nums">{{ r.corrupted }} / {{ r.users }} 人</dd>
              </div>
            </dl>
          </li>
          <li v-if="listOf(sec.key).length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">該当なし</li>
        </ul>
        <button
          v-if="listOf(sec.key).length > PAGE"
          type="button"
          class="mt-2 text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums"
          @click="showAll[sec.key] = !showAll[sec.key]"
        >
          {{ showAll[sec.key] ? `▲ 上位 ${PAGE} 件だけ` : `▼ 残り ${listOf(sec.key).length - PAGE} 件を見る` }}
        </button>
      </div>
    </div>
</template>
