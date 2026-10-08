<!--
  BaseCatalog.vue — ベースを選ぶ一覧 (種類の段 → ゲーム内の絵つきのカード、名前で探す) (2026-09-29)

  クラフトステージのベース選びから切り出した共通の部品 (クラフト計算機でも使う)。中身は [[base-catalog.ts]]。
  selected: 今のベース (金の枠。その種類から開く)。extras: フラスコ・スキルジェムも出す。note: カードの下に足す 1 行 (計算機の付与スキルなど)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
/** 今の種類。selected が空文字 = 未選択の時は種類も選ばない (クラフトステージのシミュレーションのリセット後・最初。2026-10-05) */
const cls = ref<string | null>(all.value.find((b) => b.en === props.selected)?.cls ?? (props.selected === "" ? null : "Rings"));
const query = ref("");
/** 並べるベース: 検索中は全種類から名前で、そうでなければ選んだ種類を必要レベル順 (ジェムは名前順) */
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q) return all.value.filter((b) => b.ja.toLowerCase().includes(q) || b.en.toLowerCase().includes(q)).slice(0, 80);
  const l = all.value.filter((b) => b.cls === cls.value);
  return cls.value === "SkillGem" ? l : [...l].sort((a, b) => a.lvl - b.lvl || a.ja.localeCompare(b.ja, "ja"));
});
const chip = (on: boolean): string => (on ? "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60" : "border border-white/15 hover:bg-white/5");
/**
 * スマホ (幅 768 CSS px 未満): 種類の札を全部並べると壁になる (手袋(str_dex) のような札が 50 個。2026-10-08 オーナー「UI カスすぎる」)。
 * 部位 (大きめのタイル) → 属性 / 元素 (日本語の札) → ベース (1 列) の 3 段にする。PC は今まで通り
 */
const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
const onResize = (): void => { phone.value = window.innerWidth < 768; };
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
const ATTR_JA: Record<string, string> = { str: "筋力", dex: "器用", int: "知性", str_dex: "筋力・器用", str_int: "筋力・知性", dex_int: "器用・知性" };
/** 種類の札 (手袋(str) / ワンド(火)) を「部位」と「中の札」に分ける */
interface Family { name: string; variants: Array<{ cls: string; label: string }> }
const families = computed((): Array<{ ja: string; fams: Family[] }> =>
  CATALOG_ROWS.map((r) => {
    const fams: Family[] = [];
    for (const [c, ja] of r.cls) {
      if (!count.value.get(c)) continue;
      const m = /^(.*?)\s*\((.*)\)$/.exec(ja);
      const name = m ? m[1]! : ja;
      const raw = m ? m[2]! : "";
      const label = raw ? (ATTR_JA[raw] ?? raw) : (m ? "無印" : name);
      let f = fams.find((x) => x.name === name);
      if (!f) { f = { name, variants: [] }; fams.push(f); }
      f.variants.push({ cls: c, label: raw ? label : "無印" });
    }
    return { ja: r.ja, fams };
  }).filter((r) => r.fams.length));
/** スマホで選んだ部位 (属性の札を出す)。1 種類しかない部位はそのまま種類を選ぶ */
const family = ref<Family | null>(null);
function pickFamily(f: Family): void {
  family.value = f;
  cls.value = f.variants.length === 1 ? f.variants[0]!.cls : null;
}
function backToFamilies(): void { family.value = null; cls.value = null; }
</script>

<template>
  <div>
    <!-- 名前で探す (種類をまたぐ) -->
    <div class="mb-2 flex items-center gap-2">
      <input v-model="query" type="search" placeholder="名前で探す (例: サファイア、ルビー)" class="w-72 rounded-lg border border-white/15 bg-black/30 px-2 py-1 max-md:w-full" />
      <span v-if="query.trim()" class="opacity-50">{{ list.length }} 件</span>
    </div>
    <!-- スマホ: 部位 → 属性 / 元素 → ベース -->
    <template v-if="phone && !query.trim()">
      <div v-if="!family" class="mb-3 space-y-3">
        <div v-for="r in families" :key="r.ja">
          <p class="mb-1 text-[11px] opacity-50">{{ r.ja }}</p>
          <div class="grid grid-cols-2 gap-2">
            <button v-for="f in r.fams" :key="f.name" type="button" class="min-h-12 rounded-xl border border-white/15 bg-white/[0.03] px-3 text-left text-[14px] font-bold active:bg-amber-500/15" @click="pickFamily(f)">
              {{ f.name }}<span v-if="f.variants.length > 1" class="ml-1 text-[11px] font-normal opacity-50">{{ f.variants.length }} 種</span>
            </button>
          </div>
        </div>
      </div>
      <div v-else class="mb-3">
        <div class="mb-2 flex items-center gap-2">
          <button type="button" class="min-h-11 rounded-lg border border-white/20 px-3" @click="backToFamilies">← 部位</button>
          <b class="text-[15px] text-amber-100">{{ family.name }}</b>
        </div>
        <div v-if="family.variants.length > 1" class="mb-2 flex flex-wrap gap-2">
          <button v-for="v in family.variants" :key="v.cls" type="button" class="min-h-11 rounded-lg px-3 text-[13px]" :class="chip(cls === v.cls)" @click="cls = v.cls">{{ v.label }}</button>
        </div>
        <p v-if="!cls" class="py-1 text-[12px] opacity-60">属性を選ぶ</p>
      </div>
    </template>
    <!-- ① 種類 (poe2db と同じ段) -->
    <div v-else-if="!query.trim()" class="mb-3 space-y-1.5">
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
    <p v-if="!cls && !query.trim() && !(phone && family)" class="py-2 text-[12px] opacity-60">{{ phone ? "部位を選ぶか、名前で探す" : "種類を選ぶか、名前で探す" }}</p>
    <div v-if="cls || query.trim()" class="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-1.5 overflow-y-auto pr-1 max-md:grid-cols-1" :style="{ maxHeight: phone ? 'none' : (height ?? '340px') }">
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
          <span v-if="b.stats" class="block truncate text-[11px] text-rarity-magic" :title="b.stats">{{ b.stats }}</span>
          <span v-if="b.implicit" class="block truncate text-[11px] text-rarity-magic" :title="b.implicit">{{ b.implicit }}</span>
          <span v-if="note?.(b.en)" class="block truncate text-[10.5px] text-sky-300">{{ note(b.en) }}</span>
        </span>
      </button>
      <p v-if="!list.length" class="col-span-full py-4 text-center opacity-50">見つかりません</p>
    </div>
  </div>
</template>
