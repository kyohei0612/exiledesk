<script setup lang="ts">
/**
 * SearchChecks.vue — 始め方の検索 3 本の中身 (バグ確認用、2026-09-24)
 *
 * オーナー:「それぞれトレードでバグチェックしたいから、ゆるい厳しい条件の奴も検索して 0 件だったのか
 * どうなのか確認するから表示させてくれ」。
 * 1 本ずつ: 条件 (どの MOD をどの下限で、固定済みか固定無しか、MOD の数の上限、ilvl) / 結果 (件数・取れなかった理由・
 * まだ) / 取引所へのリンク。取れなかった物は 0 件と区別して出す。
 */
import { computed } from "vue";
import { openExternal } from "../../services/trade2/open-external";
import { STRICT_PREFIX, STRICT_SUFFIX } from "../../services/htc/tree-buy";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft> }>();
const c = props.c;

type Filter = { id: string; value?: { min?: number; max?: number } };
type Q = { query?: { stats?: Array<{ filters?: Filter[] }>; filters?: { type_filters?: { filters?: { ilvl?: { min?: number } } }; misc_filters?: { filters?: { fractured_item?: { option?: string } } } } } };

/** 条件を日本語 1 行に */
function conditions(q: unknown): string[] {
  const x = q as Q;
  const buys = c.treePlan.value?.buys ?? [];
  const nameOf = (id: string): string => {
    const bare = id.replace(/^(explicit|fractured)\./, "");
    return buys.find((b) => b.filters.some((f) => f.id.replace(/^(explicit|fractured)\./, "") === bare))?.text ?? id;
  };
  const out: string[] = [];
  for (const f of x.query?.stats?.[0]?.filters ?? []) {
    const v = f.value ?? {};
    const range = `${v.min != null ? `${v.min} 以上` : ""}${v.max != null ? `${v.max} 以下` : ""}`;
    if (f.id === STRICT_PREFIX) out.push(`プレの MOD の数 ${range}`);
    else if (f.id === STRICT_SUFFIX) out.push(`サフィの MOD の数 ${range}`);
    else out.push(`${f.id.startsWith("fractured.") ? "固定済み" : "固定無し"}: ${nameOf(f.id)} ${range}`);
  }
  const ilvl = x.query?.filters?.type_filters?.filters?.ilvl?.min;
  if (ilvl != null) out.push(`ilvl ${ilvl} 以上`);
  const fr = x.query?.filters?.misc_filters?.filters?.fractured_item?.option;
  if (fr === "false") out.push("フラクチャー: いいえ");
  out.push("コラプト無し");
  return out;
}

const rows = computed(() => (c.treePlan.value?.searches ?? []).map((sq) => {
  const f = c.treeResult.value?.found.find((x) => x.key === sq.key);
  const status = f ? (f.error ? `取れず: ${f.error}` : `${f.total} 件`) : c.treeBusy.value ? "探しています…" : "まだ";
  return { key: sq.key, label: sq.label, cond: conditions(sq.query), status, error: !!f?.error, url: f?.url ?? null };
}));
</script>

<template>
  <details class="mt-1">
    <summary class="cursor-pointer opacity-70">検索の中身 (3 本)</summary>
    <div v-for="r in rows" :key="r.key" class="mt-1 pl-2">
      <b>{{ r.label }}</b>:
      <span :class="r.error ? 'text-rose-300' : ''">{{ r.status }}</span>
      <button v-if="r.url" type="button" class="ml-2 text-sky-300 underline" @click="openExternal(r.url)">取引所 →</button>
      <div class="pl-2 opacity-60">{{ r.cond.join(" / ") }}</div>
    </div>
  </details>
</template>
