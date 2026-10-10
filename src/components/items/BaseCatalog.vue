<!--
  BaseCatalog.vue — ベースを選ぶ一覧 (種類の段 → ゲーム内の絵つきのカード、名前で探す) (2026-09-29)

  クラフトステージのベース選びから切り出した共通の部品 (クラフト計算機でも使う)。中身は [[base-catalog.ts]]。
  selected: 今のベース (金の枠。その種類から開く)。extras: フラスコ・スキルジェムも出す。note: カードの下に足す 1 行 (計算機の付与スキルなど)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import BaseCardGrid from "./BaseCardGrid.vue";
import { baseCatalog, CATALOG_ROWS, CATALOG_ROW_EN, classEn, VARIANT_EN } from "../../services/items/base-catalog";
import { tr } from "../../i18n/lang";
import { baseArt } from "../../services/craft-stage/base-art";
import { gemArt } from "../../services/craft-stage/skill-art";
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
/**
 * 並べるベース: 検索中は全種類から名前で、そうでなければ選んだ種類を必要レベルの高い順 (ジェムは名前順)。
 * 高い方を押したアイコンの近くに (2026-10-10 オーナー「アイコンに近い方をレベルが高い順で、近くて即押しやすい方がいい」。前は低い順)
 */
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q) return all.value.filter((b) => b.ja.toLowerCase().includes(q) || b.en.toLowerCase().includes(q)).slice(0, 80);
  const l = all.value.filter((b) => b.cls === cls.value);
  return cls.value === "SkillGem" ? l : [...l].sort((a, b) => b.lvl - a.lvl || a.ja.localeCompare(b.ja, "ja"));
});
/**
 * 種類の札を全部並べると壁になる (手袋(str_dex) のような札が 50 個。2026-10-08 オーナー「UI カスすぎる」)。
 * 部位 (ゲームの絵のタイル) → 属性 / 元素 (日本語の札) → ベースの 3 段。スマホは 1 段ずつ (← 部位 で戻る)、
 * PC は部位のタイルを並べたまま下に属性とベースを出す (2026-10-09 オーナー「シミュレーターで装備のアイコンでスマホ版との齟齬あるよね」: PC だけ文字の札だった)
 */
const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
const onResize = (): void => { phone.value = window.innerWidth < 768; };
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
const ATTR_JA: Record<string, string> = { str: "筋力", dex: "器用", int: "知性", str_dex: "筋力・器用", str_int: "筋力・知性", dex_int: "器用・知性" };
/**
 * 種類の札 (手袋(str) / ワンド(火)) を「部位」と「中の札」に分ける。name は日本語 (中の目印)、en は英語の画面の名前
 * (2026-10-10 動きの揃え: 英語はクライアントの ItemClasses / ClientStrings のまま。base-catalog.ts)
 */
interface Family { name: string; en: string; variants: Array<{ cls: string; label: string; en: string }> }
const famLabel = (f: Family): string => tr(f.name, f.en);
const famLabelOf = (v: { label: string; en: string }): string => tr(v.label, v.en);
const NO_ATTR_EN = "Plain";
const families = computed((): Array<{ ja: string; en: string; fams: Family[] }> =>
  CATALOG_ROWS.map((r) => {
    const fams: Family[] = [];
    for (const [c, ja] of r.cls) {
      if (!count.value.get(c)) continue;
      const m = /^(.*?)\s*\((.*)\)$/.exec(ja);
      const name = m ? m[1]! : ja;
      const raw = m ? m[2]! : "";
      const label = raw ? (ATTR_JA[raw] ?? raw) : (m ? "無印" : name);
      const v = c.match(/_(str_dex|str_int|dex_int|str|dex|int|fire|cold|lightning|chaos|physical)$/)?.[1];
      let f = fams.find((x) => x.name === name);
      if (!f) { f = { name, en: classEn(c, false), variants: [] }; fams.push(f); }
      f.variants.push({ cls: c, label: raw ? label : "無印", en: raw && v ? VARIANT_EN[v]! : NO_ATTR_EN });
    }
    return { ja: r.ja, en: CATALOG_ROW_EN[r.ja] ?? r.ja, fams };
  }).filter((r) => r.fams.length).reduce((acc: Array<{ ja: string; en: string; fams: Family[]; names: string[]; ens: string[]; single: boolean }>, r) => {
    // 1 部位しかない段 (手袋・靴・鎧・兜) が続く時は 1 段にまとめる (縦 1 列に並んでいた。2026-10-09 オーナー「兜、鎧あたりの UI」)
    const last = acc[acc.length - 1];
    if (r.fams.length === 1 && last?.single) { last.fams.push(...r.fams); last.names.push(r.ja); last.ens.push(r.en); }
    else acc.push({ ja: r.ja, en: r.en, fams: [...r.fams], names: [r.ja], ens: [r.en], single: r.fams.length === 1 });
    return acc;
  }, []).map((r) => {
    const armour = r.names.length > 1 && r.names.every((n) => ARMOUR.has(n));
    return { ja: r.names.length > 1 ? (armour ? "防具" : r.names.join("・")) : r.ja, en: r.names.length > 1 ? (armour ? CATALOG_ROW_EN["防具"]! : r.ens.join(" · ")) : r.en, fams: r.fams };
  }));
const ARMOUR = new Set(["手袋", "靴", "鎧", "兜"]);
/** ベースの絵 (スキルジェムはジェムの絵) */
const artOf = (en: string): string | null => baseArt(en) ?? gemArt(en);
/** 部位のタイルの絵 = その部位の一番高いレベルのベースの絵 (ゲーム内の絵) */
function famArt(f: Family): string | null {
  const cs = new Set(f.variants.map((v) => v.cls));
  const bs = all.value.filter((b) => cs.has(b.cls)).sort((a, b) => b.lvl - a.lvl);
  for (const b of bs) { const a = artOf(b.en); if (a) return a; }
  return null;
}
/** 選んだ部位 (属性の札を出す)。1 種類しかない部位はそのまま種類を選ぶ。PC は今のベースの部位から開く */
const familyOfCls = (c: string | null): Family | null => (c ? families.value.flatMap((r) => r.fams).find((f) => f.variants.some((v) => v.cls === c)) ?? null : null);
const family = ref<Family | null>(phone.value ? null : familyOfCls(cls.value));
/**
 * PC は押した部位のタイルの行のすぐ下に、属性の札とベースのカードを出す。同じタイルをもう一度押すと畳む、別のタイルならその行の下に開き直す
 * (2026-10-10 オーナー「選んだアイコンの 1 行下に表示すべき、同じアイコンクリックでたたむ、他のベースなら別の一覧がアイコンの下に」)。
 * 段 (片手武器・両手武器…) は横に流れて 2 つ並ぶ行があるので、押した段と同じ高さにある最後の段の後ろに入れる
 */
const groupEls = new Map<string, HTMLElement>();
const setGroupEl = (ja: string) => (el: unknown): void => { if (el instanceof HTMLElement) groupEls.set(ja, el); else groupEls.delete(ja); };
const insertAfter = ref<string | null>(null);
function placeUnder(f: Family | null): void {
  if (!f || phone.value) { insertAfter.value = null; return; }
  const own = families.value.find((r) => r.fams.includes(f))?.ja;
  const top = own ? groupEls.get(own)?.offsetTop : undefined;
  if (own == null || top == null) { insertAfter.value = own ?? null; return; }
  let last = own;
  for (const r of families.value) { const t = groupEls.get(r.ja)?.offsetTop; if (t != null && Math.abs(t - top) < 4) last = r.ja; }
  insertAfter.value = last;
}
function pickFamily(f: Family): void {
  // PC で開いている部位をもう一度押したら畳む
  if (!phone.value && family.value?.name === f.name) { family.value = null; insertAfter.value = null; return; }
  // 行の位置は開いた物を閉じてから測る (開いた一覧の分だけ下の段がずれるので)
  insertAfter.value = null;
  family.value = f;
  // 属性の札は先頭 (筋力・無印) を選んだ状態で開いて、すぐベースを出す。札は上で切り替える
  // (2026-10-10 オーナー「押したら選ばせるんじゃなく最初から筋力のページ開いて上のタブで切り替え、アイコンと文字が挟まれると目が滑る」)
  cls.value = f.variants.some((v) => v.cls === cls.value) ? cls.value : f.variants[0]!.cls;
  void nextTick(() => placeUnder(f));
  // 押しても画面は動かさない (2026-10-09 オーナー「押したら下に移動とかっていう挙動しなくてもいい、固定でおｋ」。前は属性の札を画面の上へ送っていた)
}
onMounted(() => { void nextTick(() => placeUnder(family.value)); });
function backToFamilies(): void { family.value = null; cls.value = null; }
</script>

<template>
  <div>
    <!-- 名前で探す (種類をまたぐ) -->
    <div class="mb-2 flex items-center gap-2">
      <input v-model="query" type="search" :placeholder="tr('名前で探す (例: サファイア、ルビー)', 'Search by name (e.g. Sapphire, Ruby)')" class="w-72 rounded-lg border border-white/15 bg-black/30 px-2 py-1 max-md:w-full md:w-96 md:py-1.5 md:text-[14px]" />
      <span v-if="query.trim()" class="opacity-50">{{ tr(`${list.length} 件`, `${list.length} found`) }}</span>
    </div>
    <!-- 部位 → 属性 / 元素 → ベース。スマホは 1 段ずつ、PC は部位のタイルを並べたまま、押したタイルの行の下に属性とベースを出す -->
    <template v-if="!query.trim()">
      <!-- PC は段を横に流して 2 行ほどに (縦に 1 段ずつだと、押した後の属性とベースが画面の下に押し出された) -->
      <div v-if="!phone || !family" class="mb-3" :class="phone ? 'space-y-3' : 'flex flex-wrap gap-x-5 gap-y-2'">
        <template v-for="r in families" :key="r.ja">
          <!-- 宝飾品は PC では最後の行に (防具・オフハンドの行に詰めない) -->
          <div :ref="setGroupEl(r.ja)" :class="!phone && r.ja === '宝飾品' ? 'basis-full' : ''">
            <p class="mb-0.5 text-[11px] opacity-50 md:text-[12px]">{{ tr(r.ja, r.en) }}</p>
            <!-- 部位のタイル: ゲームの絵 + 名前 (スマホ 3 列。2026-10-09 オーナー「各種武器はアイコン出してもいいね、装備もほかの」) -->
            <div :class="phone ? 'grid grid-cols-3 gap-1.5' : 'flex flex-wrap gap-1'">
              <button v-for="f in r.fams" :key="f.name" type="button" class="g-plain flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-1 text-center active:scale-95" :class="phone ? '' : ['w-[112px] rounded', family?.name === f.name ? 'bg-[rgba(163,52,42,0.35)] ring-1 ring-[var(--exile-color-border-brass)]' : 'hover:bg-white/5']" :aria-expanded="!phone ? family?.name === f.name : undefined" @click="pickFamily(f)">
                <span class="grid size-16 place-items-center md:size-20" :class="family?.name === f.name && !phone ? 'g-slot on' : 'g-slot'">
                  <img v-if="famArt(f)" :src="famArt(f)!" alt="" loading="lazy" class="max-h-12 max-w-12 object-contain md:max-h-16 md:max-w-16" draggable="false" />
                </span>
                <span class="g-antique leading-tight text-[var(--exile-color-text-primary)]" :class="phone ? 'text-[13px]' : 'text-[15px]'">{{ famLabel(f) }}</span>
                <span v-if="f.variants.length > 1" class="text-[10px] leading-none opacity-50 md:text-[11px]">{{ tr(`${f.variants.length} 種`, `${f.variants.length} types`) }}</span>
              </button>
            </div>
          </div>
          <!-- PC: 押したタイルの行のすぐ下 (行いっぱい) -->
          <div v-if="!phone && family && insertAfter === r.ja" class="basis-full rounded-md bg-black/25 p-2 ring-1 ring-white/10">
            <div v-if="family.variants.length > 1" class="mb-2 flex flex-wrap gap-2">
              <button v-for="v in family.variants" :key="v.cls" type="button" class="g-tab !min-h-10 !px-4 !text-[14px]" :class="cls === v.cls ? 'on' : ''" @click="cls = v.cls">{{ famLabelOf(v) }}</button>
            </div>
            <p v-if="!cls" class="py-1 text-[12px] opacity-60">{{ tr("属性を選ぶ", "Choose an attribute") }}</p>
            <BaseCardGrid v-else :list="list" :selected="selected" :note="note" fold @pick="(en) => emit('pick', en)" />
          </div>
        </template>
      </div>
      <!-- スマホ: 部位 → 属性 → ベースを 1 段ずつ -->
      <div v-if="phone && family" class="mb-3">
        <div class="mb-2 flex items-center gap-2">
          <button type="button" class="min-h-11 rounded-lg border border-white/20 px-3" @click="backToFamilies">{{ tr("← 部位", "← Item class") }}</button>
          <b class="text-[15px] text-amber-100">{{ famLabel(family) }}</b>
        </div>
        <div v-if="family.variants.length > 1" class="mb-2 flex flex-wrap gap-2">
          <button v-for="v in family.variants" :key="v.cls" type="button" class="g-tab !min-h-10 !px-4 !text-[13px]" :class="cls === v.cls ? 'on' : ''" @click="cls = v.cls">{{ famLabelOf(v) }}</button>
        </div>
        <p v-if="!cls" class="py-1 text-[12px] opacity-60">{{ tr("属性を選ぶ", "Choose an attribute") }}</p>
      </div>
    </template>
    <!-- ② ベースのカード: スマホ (1 段ずつの最後) と名前で探す時はここ -->
    <BaseCardGrid v-if="query.trim() || (phone && cls)" :list="list" :selected="selected" :note="note" :show-cls="!!query.trim()" :fold="!query.trim()" @pick="(en) => emit('pick', en)" />
  </div>
</template>
