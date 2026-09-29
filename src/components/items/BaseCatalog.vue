<!--
  BaseCatalog.vue — ベースを選ぶ一覧 (種類の段 → ゲーム内の絵つきのカード、名前で探す) (2026-09-29)

  クラフトステージのベース選びから切り出した共通の部品 (クラフト計算機でも使う)。中身は [[base-catalog.ts]]。
  selected: 今のベース (金の枠。その種類から開く)。extras: フラスコ・スキルジェムも出す。note: カードの下に足す 1 行 (計算機の付与スキルなど)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { baseCatalog, CATALOG_CLS_JA, CATALOG_ROWS } from "../../services/items/base-catalog";
import { baseArt } from "../../services/craft-stage/base-art";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

const props = defineProps<{ data: PatchData | null; selected?: string | null; extras?: boolean; note?: (en: string) => string; height?: string }>();
const emit = defineEmits<{ pick: [en: string] }>();

const all = computed(() => (props.data ? baseCatalog(props.data, !!props.extras) : []));
const count = computed(() => {
  const m = new Map<string, number>();
  for (const b of all.value) m.set(b.cls, (m.get(b.cls) ?? 0) + 1);
  return m;
});
const cls = ref(all.value.find((b) => b.en === props.selected)?.cls ?? "Rings");
const query = ref("");
/** 並べるベース: 検索中は全種類から名前で、そうでなければ選んだ種類を必要レベル順 (ジェムは名前順) */
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q) return all.value.filter((b) => b.ja.toLowerCase().includes(q) || b.en.toLowerCase().includes(q)).slice(0, 80);
  const l = all.value.filter((b) => b.cls === cls.value);
  return cls.value === "SkillGem" ? l : [...l].sort((a, b) => a.lvl - b.lvl || a.ja.localeCompare(b.ja, "ja"));
});
const chip = (on: boolean): string => (on ? "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60" : "border border-white/15 hover:bg-white/5");
</script>

<template>
  <div>
    <!-- 名前で探す (種類をまたぐ) -->
    <div class="mb-2 flex items-center gap-2">
      <input v-model="query" type="search" placeholder="名前で探す (例: サファイア、ルビー)" class="w-72 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
      <span v-if="query.trim()" class="opacity-50">{{ list.length }} 件</span>
    </div>
    <!-- ① 種類 (poe2db と同じ段) -->
    <div v-if="!query.trim()" class="mb-3 space-y-1.5">
      <template v-for="r in CATALOG_ROWS" :key="r.ja">
        <div v-if="r.cls.some(([c]) => count.get(c))" class="flex flex-wrap items-center gap-1.5">
          <span class="w-16 shrink-0 text-[11px] opacity-50">{{ r.ja }}</span>
          <template v-for="[c, ja] in r.cls" :key="c">
            <button v-if="count.get(c)" type="button" class="rounded-lg px-2.5 py-0.5" :class="chip(cls === c)" @click="cls = c">{{ ja }}</button>
          </template>
        </div>
      </template>
    </div>
    <!-- ② ベースのカード (ゲーム内の絵・必要レベル・素の数値・固有の効果) -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-1.5 overflow-y-auto pr-1" :style="{ maxHeight: height ?? '340px' }">
      <button
        v-for="b in list"
        :key="b.en"
        type="button"
        class="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left"
        :class="b.en === selected ? 'border-amber-400/70 bg-amber-500/15' : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.07]'"
        @click="emit('pick', b.en)"
      >
        <img v-if="baseArt(b.en)" :src="baseArt(b.en)!" alt="" loading="lazy" class="h-12 w-12 shrink-0 object-contain" draggable="false" />
        <span v-else class="h-12 w-12 shrink-0" />
        <span class="min-w-0 flex-1">
          <span class="flex items-baseline gap-2">
            <b class="text-[13px]" :class="b.en === selected ? 'text-amber-100' : ''">{{ b.ja }}</b>
            <span v-if="b.lvl" class="ml-auto shrink-0 text-[10px] opacity-50">Lv {{ b.lvl }}</span>
          </span>
          <span v-if="query.trim()" class="block text-[10px] opacity-50">{{ CATALOG_CLS_JA.get(b.cls) ?? b.cls }}</span>
          <span v-if="b.stats" class="block truncate text-[11px] text-[#8888ff]" :title="b.stats">{{ b.stats }}</span>
          <span v-if="b.implicit" class="block truncate text-[11px] text-[#8888ff]" :title="b.implicit">{{ b.implicit }}</span>
          <span v-if="note?.(b.en)" class="block truncate text-[10.5px] text-sky-300">{{ note(b.en) }}</span>
        </span>
      </button>
      <p v-if="!list.length" class="col-span-full py-4 text-center opacity-50">見つかりません</p>
    </div>
  </div>
</template>
