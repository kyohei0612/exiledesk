<!--
  BreakdownModList.vue — 火力の内訳の「要素の出所」の一覧 (2026-10-03)

  増加 / 増し / 追加ダメージの MOD を 1 行ずつ: 値 | 何に効くか (装備なら装備の行を日本語で) | 出所 (装備 / ノード / ジェム / 設定) | 操作。
  操作は出所に応じた既存の物へのボタン (オーナー「外したり自分の物で計算させたり色々できるように」):
    装備 → その欄を「外す」(読み込んだ時から変えてあれば「元に戻す」)、ノード → 「外す」、サポートジェム → 「オフ」、
    パワーチャージの数で変わる MOD → 「チャージ 0 に」。押すと計算し直し、内訳も更新 (上のバーに差が出る)。
  多すぎる時は効きの大きい順に上位 8 件 + 「全部」
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import itemsJaClient from "../../i18n/items-ja-client.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import passivesJa from "../../i18n/passives-ja-client.json";
import { gemJa } from "../../services/pob-check/api";
import { modCondText, modStatText, modValueText, sortMods, srcKindJa, type ModRow } from "../../services/pob-check/breakdown";
import { rareNameJa } from "../../services/pob-check/item-text";
import { slotJa } from "../../services/pob-check/slots";
import GemIcon from "../../components/decor/GemIcon.vue";
import GemName from "../../components/decor/GemName.vue";
import ItemArt from "../../components/decor/ItemArt.vue";

export type ModAction = "clear" | "restore" | "node" | "gem-off" | "charges0";

const props = defineProps<{
  rows: ModRow[];
  /** 見出し (「増加」など) と合計の文 (「合計 +421%」) */
  title: string;
  total?: string;
  /** 装備の行 (英語) → 日本語 (親がまとめて辞書を引く) */
  lineJa: (line: string) => string;
  busy: boolean;
  /** 今のパワーチャージの数 (0 なら「チャージ 0 に」は出さない) */
  powerCharges: number;
  /** 行の値の色 (増加 = 空色 / 増し = 橙 / 追加 = 白) */
  tone?: "inc" | "more" | "base" | "override";
}>();
const emit = defineEmits<{ (e: "act", row: ModRow, action: ModAction): void }>();

const LIMIT = 8;
const showAll = ref(false);
const sorted = computed(() => sortMods(props.rows));
const shown = computed(() => (showAll.value || sorted.value.length <= LIMIT ? sorted.value : sorted.value.slice(0, LIMIT)));

const JA_BASE = itemsJaClient as Record<string, string>;
const JA_UNIQUE = uniqueNamesJa as Record<string, string>;
const JA_PASSIVE = passivesJa as Record<string, string>;
/** 出所の日本語 (装備 = 欄: 名前、ノード = 名前、ジェム = 名前) */
function srcLabel(m: ModRow): string {
  const s = m.src;
  if (s.kind === "item") {
    const r = (s.rarity ?? "").toUpperCase();
    const base = JA_BASE[s.base ?? ""] ?? s.base ?? "";
    const name = r === "UNIQUE" ? JA_UNIQUE[s.label] ?? s.label : r === "RARE" ? rareNameJa(s.label) ?? s.label : base || s.label;
    return `${s.slot ? slotJa(s.slot, { jewel: s.jewel }) + ": " : ""}${name}`;
  }
  if (s.kind === "tree") return JA_PASSIVE[s.label] ?? s.label;
  if (s.kind === "gem") return gemJa(s.gemName ?? s.label);
  if (s.kind === "config") return "設定";
  if (s.kind === "base") return "基本";
  // バフ (アーケインサージなど) はスキル名で来るので、ジェムの辞書に当たればそれ
  return gemJa(s.label);
}
/** 行の主文: 装備なら装備の行 (日本語)、それ以外は MOD の中身 */
function mainText(m: ModRow): string {
  if (m.line) return props.lineJa(m.line);
  return modStatText(m);
}
/** 出所に応じた操作 (無ければ null) */
function actionOf(m: ModRow): { action: ModAction; label: string; title: string } | null {
  const s = m.src;
  if (m.pc && props.powerCharges > 0) return { action: "charges0", label: "チャージ 0 に", title: "パワーチャージを 0 にして計算し直す (上のバーの数字と同じ)" };
  if (s.kind === "item" && s.slot) {
    return s.changed ? { action: "restore", label: "元に戻す", title: "この欄を読み込んだ時の物に戻す" } : { action: "clear", label: "外す", title: "この欄を空にして計算し直す (装備のタブの「外す」と同じ。「元に戻す」で戻る)" };
  }
  if (s.kind === "tree" && s.alloc && !s.granted && s.nodeType !== "ClassStart" && s.nodeType !== "AscendClassStart") {
    return { action: "node", label: "外す", title: "このノードを外して計算し直す (パッシブツリーのタブで押すのと同じ。つながらなくなる先も外れる)" };
  }
  if (s.kind === "gem" && s.gi && s.gj && s.support && s.enabled !== false) return { action: "gem-off", label: "オフ", title: "このサポートジェムをオフにして計算し直す (ジェムのタブと同じ)" };
  return null;
}
const SRC_CLS: Record<ModRow["src"]["kind"], string> = {
  item: "bg-amber-500/15 text-amber-200",
  tree: "bg-emerald-500/15 text-emerald-200",
  gem: "bg-sky-500/15 text-sky-200",
  config: "bg-violet-500/15 text-violet-200",
  base: "bg-white/10 text-[var(--exile-color-text-secondary)]",
  other: "bg-white/10 text-[var(--exile-color-text-secondary)]",
};
const valueCls = computed(() => (props.tone === "more" ? "text-orange-200" : props.tone === "base" ? "text-[var(--exile-color-text-primary)]" : props.tone === "override" ? "text-violet-200" : "text-sky-200"));
</script>

<template>
  <div>
    <p class="mb-1 flex items-baseline gap-2 text-[11px] font-semibold text-[var(--exile-color-text-secondary)]">
      {{ title }}
      <span v-if="total" class="font-normal text-[var(--exile-color-text-tertiary)]">{{ total }}</span>
      <span class="font-normal text-[var(--exile-color-text-tertiary)]">{{ rows.length }} 件</span>
    </p>
    <p v-if="!rows.length" class="note">無し</p>
    <ul v-else class="space-y-px text-[11px] leading-snug">
      <li v-for="(m, i) in shown" :key="i" class="grid grid-cols-[7.5rem_minmax(0,1fr)_auto_auto] items-center gap-x-2 rounded px-1 py-0.5 hover:bg-white/[0.03]">
        <!-- 値 -->
        <span class="text-right font-semibold tabular-nums" :class="valueCls">{{ modValueText(m) }}</span>
        <!-- 何に効くか + 条件 -->
        <span class="min-w-0 truncate" :title="`${modStatText(m)}${m.flags.length ? ' [' + m.flags.join(', ') + ']' : ''} — ${m.source}`">
          {{ mainText(m) }}
          <span v-for="(c, ci) in modCondText(m)" :key="ci" class="ml-1 text-[var(--exile-color-text-tertiary)]">({{ c }})</span>
        </span>
        <!-- 出所 -->
        <span class="inline-flex max-w-[16rem] items-center gap-1 truncate rounded px-1.5 py-px text-[10px]" :class="SRC_CLS[m.src.kind]" :title="m.source">
          <span class="shrink-0 opacity-70">{{ srcKindJa(m.src.kind) }}</span>
          <template v-if="m.src.kind === 'gem'">
            <GemIcon :en="m.src.gemName ?? m.src.label" :size="14" />
            <GemName :en="m.src.gemName ?? m.src.label" :label="srcLabel(m)" class="truncate" />
          </template>
          <template v-else-if="m.src.kind === 'item'">
            <ItemArt :name="m.src.label" :base="m.src.base ?? ''" :rarity="m.src.rarity ?? 'NORMAL'" :size="14" />
            <span class="truncate">{{ srcLabel(m) }}</span>
          </template>
          <span v-else class="truncate">{{ srcLabel(m) }}</span>
        </span>
        <!-- 操作 -->
        <span class="w-[5.5rem] text-right">
          <button v-if="actionOf(m)" type="button" class="btn btn-sm btn-ghost !h-5 !px-1.5 !text-[10px]" :disabled="busy" :title="actionOf(m)!.title" @click="emit('act', m, actionOf(m)!.action)">{{ actionOf(m)!.label }}</button>
        </span>
      </li>
    </ul>
    <button v-if="sorted.length > LIMIT" type="button" class="btn-link mt-1 text-[11px]" @click="showAll = !showAll">{{ showAll ? "上位だけ" : `全部 (${sorted.length} 件)` }}</button>
  </div>
</template>
