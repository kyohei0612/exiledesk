<!--
  StageBasePicker.vue — クラフトステージのベース選び (2026-09-29 作り直し)

  オーナー:「ベースのプルダウンの UI があまりにも悪い。全部一緒になってるからシンプルに使いやすく再設計」。
  前は 1 つのプルダウンに全種類 (指輪〜スキルジェム) の全ベースが入っていた。
  今: 今のベースを 1 行で出し、押すと下に開く。① 種類 (装飾品 / 防具 / 武器 / その他 の 4 段のチップ) → ② その種類のベースのカード
  (名前・必要レベル・固有の効果)。名前で探すこともできる (種類をまたいで)。選ぶと閉じる。計算機の BasePicker と同じ流れ。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { FLASK_BASES, GEM_BASES } from "../../services/craft-stage/stage-bases";
import { jaTypeName } from "../../services/trade2/localize";

const props = defineProps<{ base: string; ready: boolean }>();
const emit = defineEmits<{ pick: [en: string] }>();

/** 種類 (ゲームのアイテムクラス名) を 4 段に分ける */
const ROWS: Array<{ ja: string; cls: Array<[string, string]> }> = [
  { ja: "装飾品", cls: [["Rings", "指輪"], ["Amulets", "アミュレット"], ["Belts", "ベルト"]] },
  { ja: "防具", cls: [["Helmets", "兜"], ["Body_Armours", "鎧"], ["Gloves", "手袋"], ["Boots", "靴"], ["Shields", "盾"], ["Bucklers", "バックラー"], ["Foci", "焦点具"], ["Quivers", "矢筒"]] },
  { ja: "武器", cls: [["OneHand_Maces", "片手メイス"], ["TwoHand_Maces", "両手メイス"], ["Quarterstaves", "クォータースタッフ"], ["Spears", "槍"], ["Bows", "弓"], ["Crossbows", "クロスボウ"], ["Talismans", "タリスマン"], ["Wands", "ワンド"], ["Sceptres", "セプター"], ["Staves", "スタッフ"]] },
  { ja: "その他", cls: [["LifeFlask", "ライフフラスコ"], ["ManaFlask", "マナフラスコ"], ["SkillGem", "スキルジェム"]] },
];
const CLS_JA = new Map(ROWS.flatMap((r) => r.cls));

interface Row { en: string; ja: string; cls: string; lvl: number; implicit: string }
/** 全ベース (計算機のベース + 計算機に無いフラスコ・スキルジェム) */
const all = computed<Row[]>(() => {
  if (!props.ready) return [];
  const out: Row[] = Object.entries(htcBaseInfo()).map(([en, i]) => ({ en, ja: i.ja, cls: i.cls, lvl: i.lvl, implicit: (i.implicits ?? []).map((x) => x.ja).join(" / ") }));
  for (const f of FLASK_BASES) out.push({ en: f.en, ja: jaTypeName(f.en), cls: f.cls, lvl: f.lvl, implicit: "" });
  for (const g of GEM_BASES) out.push({ en: g.en, ja: g.ja, cls: "SkillGem", lvl: 0, implicit: "" });
  return out;
});
const current = computed(() => all.value.find((b) => b.en === props.base) ?? null);
/** 種類ごとの数 (無い種類のチップは出さない) */
const count = computed(() => {
  const m = new Map<string, number>();
  for (const b of all.value) m.set(b.cls, (m.get(b.cls) ?? 0) + 1);
  return m;
});

const open = ref(false);
const cls = ref("Rings");
const query = ref("");
/** 開いた時は今のベースの種類から */
watch(open, (o) => {
  if (!o) return;
  if (current.value) cls.value = current.value.cls;
  query.value = "";
});
/** 並べるベース: 検索中は全種類から名前で、そうでなければ選んだ種類を必要レベル順 (ジェムは名前順) */
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q) return all.value.filter((b) => b.ja.toLowerCase().includes(q) || b.en.toLowerCase().includes(q)).slice(0, 80);
  const l = all.value.filter((b) => b.cls === cls.value);
  return cls.value === "SkillGem" ? l : [...l].sort((a, b) => a.lvl - b.lvl || a.ja.localeCompare(b.ja, "ja"));
});
function choose(en: string): void {
  open.value = false;
  if (en !== props.base) emit("pick", en);
}
const chip = (on: boolean): string => (on ? "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60" : "border border-white/15 hover:bg-white/5");
</script>

<template>
  <div class="w-full">
    <!-- 今のベース (押すと開く) -->
    <button type="button" class="flex items-center gap-2 rounded-lg border px-3 py-1 text-left hover:bg-white/5" :class="open ? 'border-amber-400/70 bg-amber-500/10' : 'border-white/20'" @click="open = !open">
      <span class="opacity-60">ベース</span>
      <b class="text-[13px] text-amber-100">{{ current?.ja ?? base }}</b>
      <span v-if="current" class="opacity-50">{{ CLS_JA.get(current.cls) ?? current.cls }}</span>
      <span class="ml-1 opacity-60">{{ open ? "▲ 閉じる" : "▼ 変える" }}</span>
    </button>

    <div v-if="open" class="mt-2 rounded-xl border border-white/10 bg-black/30 p-3">
      <!-- 名前で探す (種類をまたぐ) -->
      <div class="mb-2 flex items-center gap-2">
        <input v-model="query" type="search" placeholder="名前で探す (例: サファイア、ルビー)" class="w-72 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
        <span v-if="query.trim()" class="opacity-50">{{ list.length }} 件</span>
      </div>
      <!-- ① 種類 -->
      <div v-if="!query.trim()" class="mb-3 space-y-1.5">
        <div v-for="r in ROWS" :key="r.ja" class="flex flex-wrap items-center gap-1.5">
          <span class="w-14 shrink-0 text-[11px] opacity-50">{{ r.ja }}</span>
          <template v-for="[c, ja] in r.cls" :key="c">
            <button v-if="count.get(c)" type="button" class="rounded-lg px-2.5 py-0.5" :class="chip(cls === c)" @click="cls = c">{{ ja }}</button>
          </template>
        </div>
      </div>
      <!-- ② ベース -->
      <div class="grid max-h-[340px] grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-1.5 overflow-y-auto pr-1">
        <button
          v-for="b in list"
          :key="b.en"
          type="button"
          class="rounded-lg border px-2.5 py-1.5 text-left"
          :class="b.en === base ? 'border-amber-400/70 bg-amber-500/15' : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.07]'"
          @click="choose(b.en)"
        >
          <p class="flex items-baseline gap-2">
            <b class="text-[13px]" :class="b.en === base ? 'text-amber-100' : ''">{{ b.ja }}</b>
            <span v-if="b.lvl" class="ml-auto shrink-0 text-[10px] opacity-50">Lv {{ b.lvl }}</span>
          </p>
          <p v-if="query.trim()" class="text-[10px] opacity-50">{{ CLS_JA.get(b.cls) ?? b.cls }}</p>
          <p v-if="b.implicit" class="truncate text-[11px] text-[#8888ff]" :title="b.implicit">{{ b.implicit }}</p>
        </button>
      </div>
    </div>
  </div>
</template>
