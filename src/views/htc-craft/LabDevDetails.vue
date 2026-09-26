<script setup lang="ts">
/**
 * LabDevDetails.vue — クラフト計算機の「詳しく」(MOD の段・忍者の道・ベース候補)。開発ビルドだけ出す
 * HtcCraftLab.vue から切り出し (2026-09-26)。中身は変えていない。
 */
import type { useHtcCraft } from "./useHtcCraft";
import type { usePicker } from "./usePicker";

const props = defineProps<{ c: ReturnType<typeof useHtcCraft>; pk: ReturnType<typeof usePicker> }>();
const c = props.c;
const pk = props.pk;

/** 暗黙は複数行のことがある (枠の増減は 2 行)。1 行に畳んで出す */
const implicitText = (lines: readonly string[]): string =>
  (lines[0] ?? "").split(String.fromCharCode(10)).join(" / ");
</script>

<template>
      <details class="mb-4 mt-4 text-xs">
        <summary class="cursor-pointer opacity-60">詳しく (MOD の段・忍者の道・ベース候補)</summary>
      <!-- 読み取り -->
      <section class="mb-4">
        <h2 class="mb-1 font-bold">① MOD 解析</h2>
        <!-- 貼り付けから来た時だけ、読めた見出しを出す (ベースから組んだ時は自分で決めた物なので不要) -->
        <p v-if="c.item.value" class="text-xs opacity-80">
          {{ c.item.value.baseText }} ({{ c.item.value.baseType }}) / ilvl {{ c.item.value.itemLevel }}
          <span v-if="c.item.value.quality"> / 品質 {{ c.item.value.quality }}%</span>
          <span v-if="c.item.value.catalystTag" class="text-amber-300"> — 種類 {{ c.item.value.catalystTag }} (この種類の MOD は品質を外してから読む)</span>
        </p>
        <p v-else class="text-xs opacity-80">
          {{ pk.baseRows.value.find((b) => b.en === pk.baseName.value)?.ja ?? pk.baseName.value }} / ilvl {{ pk.level.value }}
          <span class="opacity-50">— 自分で並べた {{ c.rows.value.length }} 個</span>
        </p>
        <table class="mt-1 w-full text-xs">
          <tr v-for="r in c.rows.value" :key="r.modId" class="border-b border-white/5">
            <td class="w-6 opacity-50">{{ r.side }}</td>
            <td class="py-0.5">{{ r.text }}</td>
            <td class="opacity-70">{{ r.tierName }}</td>
            <td class="opacity-50">{{ r.range }}</td>
            <td class="w-28 text-amber-300">{{ r.boosted ? "品質を外した" : "" }}</td>
            <td class="w-32 text-emerald-300">{{ r.crafted ? "確定で乗せられる" : "" }}</td>
            <!-- 重みがデータに無い MOD は確率を信用できない。埋めた物は推定値と断る -->
            <td class="w-28 text-amber-300" :title="r.overridden ? c.weightNote : ''">
              {{ r.unknownWeight ? "重み不明" : r.overridden ? "重みは推定値" : "" }}
            </td>
          </tr>
        </table>
        <!-- 解く前に分かる話なので、ここで先に出す -->
        <p
          v-if="c.slots.value"
          class="mt-2 rounded p-2 text-xs"
          :class="c.slots.value.impossible ? 'bg-red-900/40' : c.slots.value.needsAstrid ? 'bg-amber-900/40' : 'bg-white/5'"
        >
          {{ c.slots.value.note }}
        </p>
        <p v-if="c.implicits.value.length" class="mt-1 text-xs opacity-50">
          暗黙 (ベースで決まるので作る対象外): {{ c.implicits.value.join(" / ") }}
        </p>
        <!-- 作れない MOD は黙って外さない。外して解くと別のアイテムの手順が出る -->
        <p v-if="c.skipped.value.length" class="mt-2 rounded bg-red-900/40 p-2 text-xs">
          <b>このベースでは作れない MOD が {{ c.skipped.value.length }} 件あります</b> — {{ c.skipped.value.join(" / ") }}<br />
          <span class="opacity-80">
            <b>クラフトでは付きません。</b>
            <template v-for="d in c.dropOnly.value" :key="d.text">
              <br /><b class="text-amber-300">{{ d.tagJa }}</b> からしか出ません — {{ d.text }}
              <!-- 段は品質を外した値で決める (エンジンに無い MOD なのでクライアントの表を直に引く) -->
              <span v-if="d.tier" class="text-sky-300">
                (乗っているのは {{ d.tier.name }} {{ d.tier.min }}-{{ d.tier.max }} = T{{ d.tier.of - d.tier.index }}<template
                  v-if="d.deboosted"> / 品質を外した素の値 {{ d.raw?.toFixed(1) }}</template>)
              </span>
              <!-- 探す段。既定は貼り付けた物の段。変えると 3 本の検索の下限が変わる -->
              <label v-if="d.tiers?.length" class="ml-1">
                探す段
                <select
                  class="rounded border border-[var(--exile-color-border-subtle)] bg-black/30 px-1"
                  :value="c.treeTierPick.value[d.text] ?? d.tier?.index ?? 0"
                  @change="c.treeTierPick.value = { ...c.treeTierPick.value, [d.text]: Number(($event.target as HTMLSelectElement).value) }"
                >
                  <option v-for="(t, i) in d.tiers" :key="i" :value="i">
                    T{{ d.tiers.length - i }} {{ t.name }} ({{ t.min }}-{{ t.max }}) 以上
                  </option>
                </select>
              </label>
            </template>
            <br />
            <b>付いた物を買ってください。</b>しかも<b>固定済み</b>で ──
            クラフトでは二度と付けられないので、固定されていないと途中で消えたら終わりです。
            <b>枠はその分を引いて数えています</b>
            (<template v-if="c.slotsUsed.value.prefixes">プレフィックス {{ c.slotsUsed.value.prefixes }} </template>
            <template v-if="c.slotsUsed.value.suffixes">サフィックス {{ c.slotsUsed.value.suffixes }} </template>
            <template v-if="c.slotsUsed.value.either">側が決まらない分 {{ c.slotsUsed.value.either }} は両側から </template>
            使用中)。
          </span>
        </p>
      </section>

      <!-- ベース選び。ここが分岐点なので、段階 0 より前に置く -->
      <section v-if="c.bases.value.length" class="mb-4">
        <h2 class="mb-1 font-bold">② ベース</h2>
        <p class="mb-2 text-xs opacity-60">
          <b>貼り付けた物を真似るなら、ベースは決まっています</b> (先頭の「今の物」)。
          下は<b>0 から作る時</b>の参考です ── 枠が違うベース、暗黙がタダで乗るベース、
          <b>品質の最大値を上げるベース</b>があります。後者ならプレフィックスを使わずに高い品質へ
          行けます (エッセンスで上げる道は枠を食う)。<b>選ぶのは手動です。</b>
        </p>
        <table class="w-full text-xs">
          <tr v-for="b in c.bases.value.slice(0, 8)" :key="b.baseType" class="border-b border-white/5">
            <td class="w-5">{{ b.fits ? "○" : "×" }}</td>
            <td class="py-0.5" :class="b.current ? 'text-amber-300 font-bold' : ''">
              {{ b.ja }}<span v-if="b.current" class="opacity-60"> ← 今の物</span>
            </td>
            <td class="w-14 opacity-50">lvl {{ b.lvl }}</td>
            <td class="w-16 opacity-70">{{ b.prefixes }}P/{{ b.suffixes }}S</td>
            <td class="w-28 text-emerald-300">{{ b.maxQualityPlus ? "品質上限 +" + b.maxQualityPlus + "%" : "" }}</td>
            <td class="pl-2 opacity-60">{{ b.why ?? implicitText(b.implicits) }}</td>
          </tr>
        </table>
      </section>

      </details>
</template>
