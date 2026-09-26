<!--
  BuildItemTable.vue — 忍者ビルドコピーの装備の表 (2026-09-26)
  部位 / アイテム (日本語名、ベース、差したルーン) / 値段 / トレード2へ。
  ユニークは poe.ninja の相場。レアは相場を取らず、段で組んだ検索をゆるさ違いで 3 本 (完成品 → 1 つ欠けても可 → 数値なし)。
  マジック・ノーマルは値段なし (安い物)。
-->
<script setup lang="ts">
import { displayCurrency } from "../../state/display-currency";
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";
import { jaCurrency } from "../../i18n/currencies-ja";
import RichText from "../decor/RichText.vue";
import { jaUniqueText } from "../../services/mods/unique-mod-ja";
import type { ItemRow } from "../../views/build-copy/useBuildCopy";
import { lineMin, type RareLine, type RareMod } from "../../services/build-copy/rare-query";

defineProps<{ rows: ItemRow[] }>();
const emit = defineEmits<{ trade: [r: ItemRow]; link: [query: unknown]; tier: [row: number, mod: number, tier: number]; lower: [row: number]; raise: [row: number]; reset: [row: number] }>();
const money = (ex: number) => displayCurrency.money(ex);
/** ゲームのレアリティの色 */
const COLOR: Record<string, string> = { UNIQUE: "text-[#af6025]", RELIC: "text-[#82ad6a]", RARE: "text-[#e8d77a]", MAGIC: "text-[#8888ff]", NORMAL: "text-[#c8c8c8]" };
const th = "px-3 py-2.5 whitespace-nowrap font-normal";
/** MOD をプレフィックス → サフィックス → その他 の順に分ける (選んだ段の番号 k は元の並びのまま) */
function sideGroups(mods: readonly RareMod[]): Array<{ side: string; label: string; mods: Array<{ m: RareMod; k: number }> }> {
  const all = mods.map((m, k) => ({ m, k }));
  return [
    { side: "prefix", label: "プレフィックス", mods: all.filter((x) => x.m.side === "prefix") },
    { side: "suffix", label: "サフィックス", mods: all.filter((x) => x.m.side === "suffix") },
    { side: "other", label: "その他", mods: all.filter((x) => !x.m.side) },
  ].filter((g) => g.mods.length);
}
const btn = "rounded border border-[var(--exile-color-border-subtle)] px-2 py-0.5 hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]";
const upTitle = (r: ItemRow) => (r.rare?.analysis.mods.length ? "全ての MOD の段を 1 つずつ上げる (数値の行は 10% 上げる)" : "数値の下限を 10% 上げる");
const downTitle = (r: ItemRow) => (r.rare?.analysis.mods.length ? "全ての MOD の段を 1 つずつ下げる (数値の行は 10% 下げる)" : "数値の下限を 10% 下げる");
/** 数値の行の条件 (「28 以上」「固定 1」「数値なし」) */
function lineLabel(l: RareLine, ratio: number): string {
  const min = lineMin(l, ratio);
  if (min == null) return "条件に入れるだけ";
  const s = l.negative ? `${min} 以上減る` : `${min} 以上`;
  return l.fixed ? `${s} (固定)` : s;
}
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] overflow-hidden">
    <table class="w-full text-[13px]">
      <thead class="bg-[var(--exile-color-bg-surface)] text-[11px] tracking-wider text-[var(--exile-color-text-secondary)]">
        <tr>
          <th :class="th" class="text-left w-32">部位</th>
          <th :class="th" class="text-left">アイテム</th>
          <th :class="th" class="text-right w-40">値段</th>
          <th :class="th" class="text-right w-28"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.i" class="border-t border-[var(--exile-color-border-subtle)] align-top">
          <td class="px-3 py-2 text-[12px] text-[var(--exile-color-text-secondary)] whitespace-nowrap">{{ r.item.slot }}</td>
          <td class="px-3 py-2">
            <div class="flex items-baseline gap-2 flex-wrap">
              <!-- 名前に下線。カーソルでゲームと同じカード (オーナー 2026-09-26「詳細カードよろしくね、ゲーム内仕様の」) -->
              <span
                :class="COLOR[r.item.rarity]"
                class="underline decoration-dotted decoration-[var(--exile-color-text-tertiary)] underline-offset-4 cursor-help"
                @mouseenter="(ev) => hoverStack.openRoot({ kind: 'build', item: r.item }, toCss(ev.clientX), toCss(ev.clientY))"
                @mouseleave="hoverStack.leave()"
                >{{ r.nameJa }}</span
              >
              <span v-if="r.item.rarity === 'RARE'" class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ r.item.name }}</span>
              <span v-else-if="r.baseJa && r.baseJa !== r.nameJa" class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ r.baseJa }}</span>
              <span v-if="r.item.corrupted" class="text-[10px] text-[var(--exile-color-signal-error)]">コラプト</span>
              <span v-if="r.item.sanctified" class="text-[10px] text-amber-300" title="聖別で MOD の数値が 78%〜122% に振り直されています。段は戻した値で決めています">聖別</span>
            </div>
            <div v-if="r.item.runes.length" class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">ルーン: {{ r.item.runes.map((x) => jaCurrency(x)).join(" · ") }}</div>
            <!-- レアの MOD と段。段は選び直せて、取引所のリンクの条件に入る (オーナー 2026-09-26「各 MOD とティア出して、ティアはいじれる様に」) -->
            <!-- 全 MOD の段を 1 つ上げる / 下げる / 付いている段に戻す (オーナー 2026-09-26)。数値の行は割合を 10% ずつ -->
            <div v-if="r.rare && (r.rare.analysis.mods.length || r.rare.analysis.lines.length)" class="mt-1.5 flex items-center gap-2 text-[11px]">
              <button type="button" :class="btn" :title="upTitle(r)" @click="emit('raise', r.i)">{{ r.rare.analysis.mods.length ? "段を 1 つ上げる" : "数値を 10% 上げる" }}</button>
              <button type="button" :class="btn" :title="downTitle(r)" @click="emit('lower', r.i)">{{ r.rare.analysis.mods.length ? "段を 1 つ下げる" : "数値を 10% 下げる" }}</button>
              <button type="button" :disabled="!Object.keys(r.rare.picked).length && r.rare.ratio === 100" :class="btn" class="disabled:opacity-40" title="付いている段・数値に戻す" @click="emit('reset', r.i)">リセット</button>
              <span v-if="r.rare.analysis.lines.length" class="text-[var(--exile-color-text-tertiary)]" :class="r.rare.ratio !== 100 ? 'text-amber-300' : ''">数値の {{ r.rare.ratio }}% 以上</span>
            </div>
            <!-- プレフィックスを上、サフィックスを下に分ける (オーナー 2026-09-26「ユニーク以外サフィとプレフィックス簡単に分けて表示」) -->
            <template v-if="r.rare">
              <template v-for="g in sideGroups(r.rare.analysis.mods)" :key="g.side">
                <p class="mt-1.5 text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">{{ g.label }}</p>
                <ul class="space-y-0.5">
                  <li v-for="{ m, k } in g.mods" :key="k" class="flex items-center gap-2 text-[12px]">
                    <select
                      :value="r.rare.picked[k] ?? m.tier"
                      class="num w-52 shrink-0 text-[11px] py-0"
                      :class="r.rare.picked[k] != null && r.rare.picked[k] !== m.tier ? 'ring-1 ring-amber-500/70' : ''"
                      @change="emit('tier', r.i, k, Number(($event.target as HTMLSelectElement).value))"
                    >
                      <option v-for="o in m.options" :key="o.i" :value="o.i">{{ o.label }}{{ o.i === m.tier ? " (今)" : "" }}</option>
                    </select>
                    <span class="text-[#8888ff] min-w-0"><RichText :text="m.text" /></span>
                  </li>
                </ul>
              </template>
              <!-- 段の無い行 (ジュエル・計算機で作れない特殊な MOD) は数値の割合で (オーナー 2026-09-26「特殊 MOD 省かなくていい」「ジュエルは数値に」) -->
              <template v-if="r.rare.analysis.lines.length">
                <p v-if="r.rare.analysis.mods.length" class="mt-1.5 text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)]">特殊な MOD (数値で)</p>
                <ul class="mt-1 space-y-0.5">
                  <li v-for="(l, k) in r.rare.analysis.lines" :key="'l' + k" class="flex items-center gap-2 text-[12px]">
                    <span class="num w-52 shrink-0 text-[11px] text-[var(--exile-color-text-secondary)]">{{ lineLabel(l, r.rare.ratio) }}</span>
                    <span class="text-[#8888ff] min-w-0"><RichText :text="l.text" /></span>
                  </li>
                </ul>
              </template>
            </template>
            <p v-if="r.rare?.analysis.missing.length" class="mt-1 text-[10px] text-[var(--exile-color-text-tertiary)]">取引所の条件に無い行: <RichText :text="r.rare.analysis.missing.map((x) => jaUniqueText(x)).join(' / ')" /></p>
          </td>
          <td class="px-3 py-2 text-right tabular-nums whitespace-nowrap">
            <span v-if="r.price != null" class="text-[var(--exile-color-accent-focus)]">{{ money(r.price) }}</span>
            <span v-else-if="r.src === 'rare'" class="text-[12px] text-[var(--exile-color-text-tertiary)]">取引所で確認</span>
            <span v-else-if="r.src === 'unique'" class="text-[12px] text-[var(--exile-color-text-tertiary)]">相場なし</span>
            <span v-else class="text-[12px] text-[var(--exile-color-text-tertiary)]" title="マジック・ノーマルは安いので数えません">—</span>
          </td>
          <td class="px-3 py-2 text-right whitespace-nowrap">
            <!-- レアはゆるさ違いの 3 本 (オーナー「完成品ヒットなしで徐々にゆるく」。取引所には通信しないので手で順に開く) -->
            <div v-if="r.src === 'rare' && r.rare" class="flex flex-col items-end gap-1">
              <button
                v-for="(l, li) in r.rare.links"
                :key="l.label"
                type="button"
                class="rounded border px-2 py-0.5 text-[11px] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]"
                :class="li === 0 ? 'border-[var(--exile-color-border-subtle)]' : 'border-transparent text-[var(--exile-color-text-tertiary)] underline'"
                :title="`取引所 (即時購入) をこの条件で開く`"
                @click="emit('link', l.query)"
              >
                {{ li === 0 ? "トレード2へ" : l.label }}
              </button>
            </div>
            <button
              v-else-if="r.src !== 'none' || r.baseJa"
              type="button"
              class="rounded border border-[var(--exile-color-border-subtle)] px-2 py-0.5 text-[11px] hover:border-[var(--exile-color-accent-focus)] hover:text-[var(--exile-color-accent-focus)]"
              title="取引所 (即時購入) をブラウザで開く"
              @click="emit('trade', r)"
            >
              トレード2へ
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
