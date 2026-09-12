<!--
  SagaPlanner.vue — アルダーの航路 (2026-09-12)
  アルダーの叙事詩 (Aldur's Saga) の 5 枠に出る噂から、行き先のマップを絞る。
  噂 → マップの対応はゲーム内で観測された固定の組 (i18n/saga-routes.json、scripts/build-saga-from-client.mjs)。
  マップ名 (日英) · ボス名 · ユニークマップ判定はクライアント WorldAreas / MonsterVarieties 由来。
  噂の文言そのものはクライアントのテーブルに無いので英語のまま。評価は自分でつける (localStorage に保存)。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import BaseCard from "../components/decor/BaseCard.vue";
import routesRaw from "../i18n/saga-routes.json";

interface Route {
  mapEn: string;
  mapJa: string;
  rumourEn: string;
  kind: "grand" | "unique" | "boss";
  level: number | null;
  uniqueMap: boolean;
  bosses: { en: string; ja: string }[];
}
const ROUTES = routesRaw as Route[];

const KIND_LABEL: Record<Route["kind"], string> = { grand: "大遠征", unique: "ユニークマップ", boss: "ボス" };
const KIND_DESC: Record<Route["kind"], string> = {
  grand: "エリア全体が遠征。爆薬を連鎖させて広く掘る",
  unique: "一度きりの固有報酬があるユニークマップ",
  boss: "遠征の頂点ボス。ボス周回向き",
};
const SLOT_COLORS = ["#D6B98A", "#6AA0B8", "#9B7BCC", "#7FBF8E", "#D08A8A"];
const GRADES = ["", "S", "A", "B", "C", "D"] as const;

// ---- 自分の評価 (マップ → S/A/B/C/D)。localStorage は利便のためだけ。読めなくても動く ----
const GRADE_KEY = "exiledesk.saga.grades";
function loadGrades(): Record<string, string> {
  try {
    const raw = localStorage.getItem(GRADE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
const grades = ref<Record<string, string>>(loadGrades());
function setGrade(mapEn: string, g: string): void {
  grades.value = { ...grades.value, [mapEn]: g };
  try {
    localStorage.setItem(GRADE_KEY, JSON.stringify(grades.value));
  } catch {
    /* 保存不可でも動作は続く */
  }
}

// ---- 5 枠 ----
const slots = ref<string[]>(["", "", "", "", ""]);
const norm = (s: string): string => s.toLowerCase().replace(/[…\s.。、・]/g, "");
function matchesFor(q: string): Route[] {
  const n = norm(q);
  if (!n) return [];
  return ROUTES.filter(
    (r) =>
      norm(r.rumourEn).includes(n) ||
      norm(r.mapEn).includes(n) ||
      norm(r.mapJa).includes(n) ||
      r.bosses.some((b) => norm(b.ja).includes(n) || norm(b.en).includes(n)),
  );
}
const slotMatches = computed(() => slots.value.map((q) => matchesFor(q)));
const resolved = computed<(Route | null)[]>(() => slotMatches.value.map((m) => (m.length === 1 ? m[0] : null)));
/** マップ → 確定している枠番号 (グリッド側の色付け用) */
const slotOfMap = computed<Record<string, number>>(() => {
  const out: Record<string, number> = {};
  resolved.value.forEach((r, i) => {
    if (r) out[r.mapEn] = i;
  });
  return out;
});
function pick(i: number, r: Route): void {
  slots.value = slots.value.map((v, k) => (k === i ? r.rumourEn : v));
}
function clearAll(): void {
  slots.value = ["", "", "", "", ""];
}
const summary = computed(() => {
  const picks = resolved.value.filter((r): r is Route => !!r);
  const grand = picks.filter((r) => r.kind === "grand").length;
  const boss = picks.filter((r) => r.kind === "boss").length;
  const uniq = picks.filter((r) => r.kind === "unique").length;
  const graded = picks.map((r) => grades.value[r.mapEn]).filter(Boolean);
  return { total: picks.length, grand, boss, uniq, graded };
});
async function copyPicks(): Promise<void> {
  const lines = resolved.value.map((r, i) => `${i + 1}: ${r ? `${r.mapJa} (${r.rumourEn})` : "—"}`);
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
  } catch {
    /* 権限なし */
  }
}
const grouped = computed(() =>
  (["grand", "unique", "boss"] as const).map((kind) => ({ kind, label: KIND_LABEL[kind], desc: KIND_DESC[kind], routes: ROUTES.filter((r) => r.kind === kind) })),
);
</script>

<template>
  <section class="min-h-full flex flex-col px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">アルダーの航路</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        アルダーの叙事詩の 5 枠に出る噂から行き先を絞ります。噂の一部、マップ名 (日本語 / 英語)、ボス名のどれかを入れると候補が減り、
        1 つに決まると枠の色で光ります。5 枠まとめて見てから進むかを決めてください。
      </p>
      <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
        噂 → マップはゲーム内で観測された固定の組。マップ名 · ボス名 · ユニーク判定はゲームクライアント由来。噂の文言はクライアントに無いので英語表記。評価欄は自分用 (この PC に保存)。
      </p>
    </header>

    <!-- 5 枠 -->
    <BaseCard class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">5 枠</h2>
          <div class="flex items-center gap-3 text-[11px]">
            <span class="text-[var(--exile-color-text-secondary)] tabular-nums">
              確定 {{ summary.total }}/5 · 大遠征 {{ summary.grand }} · ユニーク {{ summary.uniq }} · ボス {{ summary.boss }}
              <span v-if="summary.graded.length"> · 評価 {{ summary.graded.join(" ") }}</span>
            </span>
            <button type="button" class="underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="copyPicks">確定分をコピー</button>
            <button type="button" class="underline text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)]" @click="clearAll">全部消す</button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div v-for="(q, i) in slots" :key="i" class="rounded border p-2" :style="{ borderColor: resolved[i] ? SLOT_COLORS[i] : 'var(--exile-color-border-subtle)' }">
            <div class="text-[10px] tracking-wider mb-1" :style="{ color: SLOT_COLORS[i] }">枠 {{ i + 1 }}</div>
            <input
              v-model="slots[i]"
              type="text"
              spellcheck="false"
              placeholder="噂 / マップ / ボス"
              class="w-full text-[12px] px-2 py-1 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
            />
            <div v-if="resolved[i]" class="mt-2 text-[12px]">
              <div class="font-display tracking-[0.04em]" :style="{ color: SLOT_COLORS[i] }">{{ resolved[i]!.mapJa }}</div>
              <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ resolved[i]!.mapEn }} · {{ KIND_LABEL[resolved[i]!.kind] }}</div>
              <div v-if="resolved[i]!.bosses.length" class="text-[10px] text-[var(--exile-color-text-secondary)]">{{ resolved[i]!.bosses.map((b) => b.ja).join(" / ") }}</div>
              <div v-if="grades[resolved[i]!.mapEn]" class="text-[10px] text-[var(--exile-color-accent-focus)]">評価 {{ grades[resolved[i]!.mapEn] }}</div>
            </div>
            <ul v-else-if="slotMatches[i].length > 0" class="mt-2 space-y-0.5">
              <li v-for="r in slotMatches[i]" :key="r.mapEn">
                <button type="button" class="w-full text-left text-[11px] px-1 py-0.5 rounded hover:bg-[var(--exile-color-bg-elevated)]" @click="pick(i, r)">
                  <span>{{ r.mapJa }}</span>
                  <span class="text-[var(--exile-color-text-tertiary)]"> · {{ r.rumourEn }}</span>
                </button>
              </li>
            </ul>
            <div v-else-if="q" class="mt-2 text-[11px] text-[var(--exile-color-text-tertiary)]">該当なし</div>
          </div>
        </div>
      </div>
    </BaseCard>

    <!-- 一覧 -->
    <BaseCard v-for="g in grouped" :key="g.kind" class="mb-4">
      <div class="p-4 pl-5">
        <div class="flex items-baseline gap-2 mb-2">
          <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base">{{ g.label }}</h2>
          <span class="text-[10px] tracking-wider text-[var(--exile-color-text-secondary)]">{{ g.desc }}</span>
        </div>
        <table class="w-full text-[12px]">
          <thead class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">
            <tr>
              <th class="text-left font-normal pb-1 w-10">枠</th>
              <th class="text-left font-normal pb-1">マップ</th>
              <th class="text-left font-normal pb-1">噂</th>
              <th class="text-left font-normal pb-1">ボス</th>
              <th class="text-right font-normal pb-1 w-24">自分の評価</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in g.routes"
              :key="r.mapEn"
              class="border-t border-[var(--exile-color-border-subtle)]"
              :style="slotOfMap[r.mapEn] != null ? { background: SLOT_COLORS[slotOfMap[r.mapEn]] + '22' } : {}"
            >
              <td class="py-1 tabular-nums" :style="{ color: slotOfMap[r.mapEn] != null ? SLOT_COLORS[slotOfMap[r.mapEn]] : 'transparent' }">
                {{ slotOfMap[r.mapEn] != null ? "枠" + (slotOfMap[r.mapEn] + 1) : "·" }}
              </td>
              <td class="py-1">
                <div>{{ r.mapJa }}</div>
                <div class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ r.mapEn }}<span v-if="r.level"> · Lv{{ r.level }}</span></div>
              </td>
              <td class="py-1 text-[var(--exile-color-text-secondary)]">{{ r.rumourEn }}</td>
              <td class="py-1 text-[var(--exile-color-text-secondary)]">{{ r.bosses.map((b) => b.ja).join(" / ") || "—" }}</td>
              <td class="py-1 text-right">
                <select :value="grades[r.mapEn] ?? ''" class="text-[12px] px-1 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)]" @change="setGrade(r.mapEn, ($event.target as HTMLSelectElement).value)">
                  <option v-for="gr in GRADES" :key="gr" :value="gr">{{ gr || "—" }}</option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </BaseCard>
  </section>
</template>
