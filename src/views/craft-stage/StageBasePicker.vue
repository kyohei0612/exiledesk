<!--
  StageBasePicker.vue — クラフトステージのベース選び (2026-09-29 作り直し)

  オーナー:「ベースのプルダウンの UI があまりにも悪い。全部一緒になってるからシンプルに使いやすく再設計」。
  前は 1 つのプルダウンに全種類 (指輪〜スキルジェム) の全ベースが入っていた。
  今: 今のベースを 1 行で出し、押すと下に開く。① 種類 (poe2db と同じ並びの段) → ② その種類のベースのカード
  (名前・必要レベル・素の数値・固有の効果)。名前で探すこともできる (種類をまたいで)。選ぶと閉じる。
  2026-09-29 オーナー「DB 通りに STR / DEX / INT で分ける」「素の数値 (アーマー・エナシ) を最初から出す」「ルーン○○はベースではない」:
  - 種類は計算機のエンジンの行 (Gloves_str など)。**行ごとに MOD の置き場が違う** (STR はアーマー、INT はエナジーシールドの MOD) ので分ける
  - ルーンフォージ / ルーンマスター / ルーンファーザーのベースは出さない (ヴェリシウムで普通のベースから作る物で、最初から選ぶ物ではない)
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { classOfBase } from "../../services/htc/bridge";
import { baseStatsOf, FLASK_BASES, GEM_BASES } from "../../services/craft-stage/stage-bases";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { jaTypeName } from "../../services/trade2/localize";

const props = defineProps<{ base: string; data: PatchData | null }>();
const emit = defineEmits<{ pick: [en: string] }>();

/** 種類の段 (poe2db のモッドの一覧と同じ並び)。キーはエンジンの行 (MOD の置き場の単位) */
const A = (k: string, ja: string): Array<[string, string]> => ["str", "dex", "int", "str_dex", "str_int", "dex_int"].map((x) => [`${k}_${x}`, `${ja}(${x})`]);
const EL = (k: string, ja: string): Array<[string, string]> => [[k, ja], ...([["fire", "火"], ["cold", "冷気"], ["lightning", "雷"], ["chaos", "混沌"], ["physical", "物理"]] as const).map(([x, j]): [string, string] => [`${k}_${x}`, `${ja}(${j})`])];
const ROWS: Array<{ ja: string; cls: Array<[string, string]> }> = [
  { ja: "片手武器", cls: [...EL("Wands", "ワンド"), ["OneHand_Maces", "片手メイス"], ["Sceptres", "セプター"], ["Spears", "スピア"]] },
  { ja: "両手武器", cls: [["Bows", "弓"], ...EL("Staves", "スタッフ"), ["TwoHand_Maces", "両手メイス"], ["Quarterstaves", "クォータースタッフ"], ["Crossbows", "クロスボウ"], ["Talismans", "タリスマン"]] },
  { ja: "宝飾品", cls: [["Amulets", "アミュレット"], ["Rings", "指輪"], ["Belts", "ベルト"]] },
  { ja: "手袋", cls: A("Gloves", "手袋") },
  { ja: "靴", cls: A("Boots", "靴") },
  { ja: "鎧", cls: A("Body_Armours", "鎧") },
  { ja: "兜", cls: A("Helmets", "兜") },
  { ja: "オフハンド", cls: [["Quivers", "矢筒"], ["Shields_str", "盾(str)"], ["Shields_str_dex", "盾(str_dex)"], ["Shields_str_int", "盾(str_int)"], ["Bucklers", "バックラー"], ["Foci", "フォーカス"]] },
  { ja: "フラスコ", cls: [["LifeFlask", "ライフフラスコ"], ["ManaFlask", "マナフラスコ"]] },
  { ja: "ジェム", cls: [["SkillGem", "スキルジェム"]] },
];
const CLS_JA = new Map(ROWS.flatMap((r) => r.cls));
/** ヴェリシウムで作る (最初から選ぶ物ではない) ベース */
const RUNE_MADE = /^(Runeforged|Runemastered|Runefather's) /;
/** 素の数値を 1 行に (範囲はそのまま) */
const num = (v: number | [number, number] | undefined): string => (v === undefined ? "" : Array.isArray(v) ? `${v[0]}-${v[1]}` : String(v));
function statLine(en: string): string {
  const b = baseStatsOf(en);
  if (!b) return "";
  const out: string[] = [];
  if (b.armour) out.push(`アーマー ${num(b.armour)}`);
  if (b.evasion) out.push(`回避力 ${num(b.evasion)}`);
  if (b.es) out.push(`エナジーシールド ${num(b.es)}`);
  if (b.block) out.push(`ブロック ${b.block}%`);
  if (b.phys) out.push(`物理 ${b.phys[0]}-${b.phys[1]}`);
  if (b.aps) out.push(`${b.aps.toFixed(2)} 回/秒`);
  if (b.crit && b.phys) out.push(`クリ ${b.crit.toFixed(2)}%`);
  if (b.life) out.push(`ライフ ${b.life}`);
  if (b.mana) out.push(`マナ ${b.mana}`);
  return out.join(" · ");
}

interface Row { en: string; ja: string; cls: string; lvl: number; implicit: string; stats: string }
/** 全ベース (計算機のベース + 計算機に無いフラスコ・スキルジェム) */
const all = computed<Row[]>(() => {
  const d = props.data;
  if (!d) return [];
  // エンジンの行が無いベース (ユニーク専用の Golden〜・開発用の [DNT] など) は MOD の置き場が無く打てないので出さない
  const out: Row[] = Object.entries(htcBaseInfo()).flatMap(([en, i]): Row[] => {
    const row = RUNE_MADE.test(en) ? null : classOfBase(d, en);
    return row ? [{ en, ja: i.ja, cls: row.id, lvl: i.lvl, implicit: (i.implicits ?? []).map((x) => x.ja).join(" / "), stats: statLine(en) }] : [];
  });
  for (const f of FLASK_BASES) out.push({ en: f.en, ja: jaTypeName(f.en), cls: f.cls, lvl: f.lvl, implicit: "", stats: statLine(f.en) });
  for (const g of GEM_BASES) out.push({ en: g.en, ja: g.ja, cls: "SkillGem", lvl: 0, implicit: "", stats: "" });
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
          <span class="w-16 shrink-0 text-[11px] opacity-50">{{ r.ja }}</span>
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
          <p v-if="b.stats" class="truncate text-[11px] text-white/70" :title="b.stats">{{ b.stats }}</p>
          <p v-if="b.implicit" class="truncate text-[11px] text-[#8888ff]" :title="b.implicit">{{ b.implicit }}</p>
        </button>
      </div>
    </div>
  </div>
</template>
