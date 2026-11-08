<!--
  StageRuneforgedBases.vue — ベースのページの「ルーンフォージ版で選ぶ」をオンにした時の一覧 (2026-11-09 オーナー「ここでオンオフチェックボックスのイメージだったベースまとめて　できたらフォージ品として表示して欲しいな。んで出来たらホバーでカレンシー説明みたいにカード出て欲しいなと」)。
  ルーンフォージ版のあるベースだけを部位ごとにまとめ、版ごとに 1 つのフォージ品 (ワード) として並べる。乗せるとカレンシーの説明と同じ枠 (GameItemCard) でその版のカード。
  値はエンジンの入口だけ (runeforgedOf = 版の一覧、runeforgedStatsOf = ワードと残る防御、E-78)。カードの値は白の品 (品質 0・MOD なし) の素の値。押すとそのベースを選ぶ (元のベース)。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { baseCatalog, classLabel, freshItem, htcBaseInfo, runeforgedOf, runeforgedStatsOf, type PatchData, type Runeforged } from "../../services/craft-stage/engine";
import { baseArt } from "../../components/art/base-art";
import GameItemCard from "../../components/decor/GameItemCard.vue";
import DataNote from "../../components/ui/DataNote.vue";
import { toCss } from "../../utils/zoom";
import { isTouchOnly } from "../../utils/use-phone";
import { tr } from "../../i18n/lang";

/** cls = ベースの一覧で今開いている部位・属性の札 (無ければルーンフォージ版のある全部を部位ごとに) */
const props = defineProps<{ data: PatchData | null; selected: string; cls?: string }>();
const emit = defineEmits<{ pick: [en: string] }>();

/** 1 つのフォージ品 = 元のベース + 版の番号 */
interface Forged { en: string; ja: string; lvl: number; i: number; of: number; form: Runeforged }
/** 版に残る防御の素の値 (表の値そのまま、品質・MOD なし) */
const defOf = (r: Runeforged): string => [
  r.armour != null ? tr(`アーマー ${r.armour}`, `Armour ${r.armour}`) : "",
  r.evasion != null ? tr(`回避力 ${r.evasion}`, `Evasion ${r.evasion}`) : "",
  r.es != null ? tr(`ES ${r.es}`, `ES ${r.es}`) : "",
].filter(Boolean).join(" / ");
/** 部位ごと (ベースの一覧と同じ並び) */
const groups = computed((): Array<{ label: string; items: Forged[] }> => {
  if (!props.data) return [];
  const by = new Map<string, Forged[]>();
  for (const b of baseCatalog(props.data, true)) {
    if (props.cls && b.cls !== props.cls) continue;
    const forms = runeforgedOf(b.en);
    if (!forms.length) continue;
    const label = classLabel(b.cls);
    const list = by.get(label) ?? [];
    forms.forEach((form, i) => list.push({ en: b.en, ja: b.ja, lvl: b.lvl, i, of: forms.length, form }));
    by.set(label, list);
  }
  // いつものベースの並びと同じく必要レベルの高い順
  return [...by].map(([label, items]) => ({ label, items: items.sort((a, b) => b.lvl - a.lvl) }));
});
/** 版の名前 (元のベースと名前の違う版がある、例 Cassis Helm → Runeforged Gladiatorial Helm。日本語はその名前のベースから、無ければ元のベース) */
const nameOf = (f: Forged, short = false): string => {
  const ja = htcBaseInfo()[f.form.name.replace(/^Runeforged /, "")]?.ja ?? f.ja;
  // 並びの札は一覧全体がフォージ品なので頭の「ルーンフォージ」を外す (名前が切れないように)。カードは付ける
  const name = short ? tr(ja, f.form.name.replace(/^Runeforged /, "")) : tr(`ルーンフォージ ${ja}`, f.form.name);
  return name + (f.of > 1 ? tr(` (版 ${f.i + 1})`, ` (V${f.i + 1})`) : "");
};

/** 乗せているフォージ品と札の位置 (カードは札の右、カレンシーの棚と同じ置き方) */
const hov = ref<{ f: Forged; x: number; y: number } | null>(null);
/** 指の端末 (ホバーの無い画面) はカードを出さない (押すと mouseenter も来て、カードが並びに被る。いつものベースの並びと同じ) */
const touchOnly = isTouchOnly();
function enter(f: Forged, e: MouseEvent): void {
  if (touchOnly) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  hov.value = { f, x: toCss(r.right), y: toCss(r.top) };
}
/** カードの数値の行 (白の品の素の値、エンジンの runeforgedStatsOf) */
const rows = computed((): Array<{ label: string; value: number; ward?: boolean }> => {
  const h = hov.value;
  if (!h || !props.data) return [];
  const s = runeforgedStatsOf(freshItem(props.data, h.f.en, 82), h.f.i);
  if (!s) return [];
  const out: Array<{ label: string; value: number; ward?: boolean }> = [{ label: tr("ルーンワード", "Runic Ward"), value: s.ward, ward: true }];
  if (s.armour != null) out.push({ label: tr("アーマー", "Armour"), value: s.armour });
  if (s.evasion != null) out.push({ label: tr("回避力", "Evasion Rating"), value: s.evasion });
  if (s.es != null) out.push({ label: tr("エナジーシールド", "Energy Shield"), value: s.es });
  return out;
});
const NOTE = (): string[] => [
  tr("版ごとのワード・防御の素の値は poe2db の値", "Base Ward and defences per version are poe2db's values"),
  tr("ここは品質 0・MOD なしの値。品質と MOD はクラフトの画面で足される", "Shown at 0% quality with no mods; quality and mods add on in the craft view"),
];
</script>

<template>
  <div data-runeforged-bases class="flex flex-col gap-4">
    <section v-for="g in groups" :key="g.label">
      <p v-if="!cls" class="mb-1 text-[12px] opacity-60">{{ g.label }}</p>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 pr-1 max-md:grid-cols-2 max-md:gap-1.5">
        <!-- 札の作りはいつものベースの並び (BaseCardGrid) と同じ枠・大きさ。数値の行はルーンワード (青) と版に残る防御 -->
        <button
          v-for="f in g.items"
          :key="f.en + f.i"
          type="button"
          :data-runeforged-base="f.en"
          class="g-plain g-item flex items-center gap-2 bg-clip-padding px-1 py-0.5 text-left transition max-md:flex-col max-md:gap-1 max-md:text-center"
          :class="f.en === selected ? 'bg-[rgba(163,52,42,0.35)]' : 'bg-black/50 hover:bg-white/[0.06]'"
          @mouseenter="enter(f, $event)"
          @mouseleave="hov = null"
          @click="hov = null; emit('pick', f.en)"
        >
          <img v-if="baseArt(f.en)" :src="baseArt(f.en)!" alt="" loading="lazy" class="h-12 w-12 shrink-0 object-contain md:h-16 md:w-16" draggable="false" />
          <span class="min-w-0 flex-1 max-md:w-full">
            <span class="flex items-baseline gap-2 max-md:flex-col max-md:items-center max-md:gap-0">
              <b class="min-w-0 truncate text-[13px] md:text-[15px] max-md:whitespace-normal" :class="f.en === selected ? 'text-amber-100' : ''" :title="nameOf(f)">{{ nameOf(f, true) }}</b>
              <span v-if="f.lvl" class="ml-auto shrink-0 text-[10px] opacity-50 max-md:ml-0 md:text-[12px]">Lv {{ f.lvl }}</span>
            </span>
            <span class="block text-[11px] tabular-nums text-sky-200 md:text-[13px]">{{ tr("ルーンワード", "Runic Ward") }} {{ f.form.ward }}</span>
            <span v-if="defOf(f.form)" class="block truncate text-[11px] text-rarity-magic max-md:whitespace-normal md:text-[13px]">{{ defOf(f.form) }}</span>
          </span>
        </button>
      </div>
    </section>
    <p v-if="data && !groups.length" class="text-[12px] opacity-60">{{ tr("この種類にはルーンフォージ版のあるベースが無い", "No bases of this type have a Runeforged version") }}</p>
    <!-- 乗せた時のカード (カレンシーの説明と同じ枠)。指の端末はホバーが無いので出ない -->
    <GameItemCard v-if="hov" :show="true" :x="hov.x" :y="hov.y" :name="nameOf(hov.f)" :sub="tr(`元のベース: ${hov.f.ja}`, `Base: ${hov.f.en}`)" tone="normal" :width="340" :layer-key="-1" :pinned="false" :z="1400">
      <div class="text-center text-[12.5px]">
        <img v-if="baseArt(hov.f.en)" :src="baseArt(hov.f.en)!" alt="" class="mx-auto h-16 w-16 object-contain" />
        <p v-for="r in rows" :key="r.label" class="text-white/50">{{ r.label }}: <span :class="r.ward ? 'text-sky-200' : 'text-white/85'">{{ r.value }}</span></p>
        <div class="mt-1 flex justify-center"><DataNote small tip="center" :text="tr('ワードの出し方', 'How Ward is shown')" :hint="NOTE()" /></div>
      </div>
    </GameItemCard>
  </div>
</template>
