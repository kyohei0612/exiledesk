<!--
  UniqueTooltip.vue — ユニーク MOD ホバーオーバーレイ

  発見 V2B のユニーク使用率セクションでユニーク名にマウスホバーされた際に
  画面に固定表示されるカード型ポップアップ。

  仕様 (オーナー指示 2026-05-22):
    - 上部: アイコン (64-96px) + 名前 (typeLine 日本語) + ベース (baseType)
    - 中央: implicitMods (青) + explicitMods (本文色) + flavourText (斜体・暖色)
    - 下部: 必要レベル等の補足
    - 画面端でフリップ (右端で出すと切れる場合は左フリップ)
    - リッチテキストマーカー `[Tag|Display]` は Display 側のみ表示
    - 別 fetcher 不要 (`UniqueUsage.representative` の itemData をそのまま使う)

  デザイントークン (Phase A):
    - 暖色枠の BaseCard 風 (border-brass)
    - z-50 の position: fixed
-->
<script setup lang="ts">
import { toCss } from "../../utils/zoom";
import { computed } from "vue";
import { jaCurrency } from "../../i18n/currencies-ja";
import type { UniqueUsage } from "../../services/craft-v2/types";
// 日本語化 + リッチテキスト整形は unique-tooltip-i18n.ts へ (2026-09-26 の分割)
import { _uniqueNamesJa, asArray, strip } from "./unique-tooltip-i18n";

const props = defineProps<{
  /** 表示対象 (null なら描画しない) */
  unique: UniqueUsage | null;
  /** ビューポート上の左上座標 (px) */
  x: number;
  y: number;
}>();

// ---------------------------------------------------------------------------
// Computed: 表示用フィールド
// ---------------------------------------------------------------------------
const r = computed(() => props.unique?.representative ?? null);

const displayName = computed<string>(() => {
  const u = props.unique;
  if (!u) return "";
  // 2026-05-22: ユニュ正式名 (data.name = "Atziri's Splendour") → 日本語正式名 ("アッツィリの栄耀") を優先。
  // 辞書未登録なら英語正式名のまま、それも無ければ typeLine を jaCurrency で日本語化 (旧挙動 fallback)。
  const officialEn = r.value?.name;
  if (officialEn) {
    return _uniqueNamesJa[officialEn] || officialEn;
  }
  const en = r.value?.typeLine ?? u.nameEn;
  return jaCurrency(en);
});

const displayBase = computed<string>(() => {
  const en = r.value?.baseType ?? "";
  return en ? jaCurrency(en) : "";
});

const implicitLines = computed<string[]>(() =>
  asArray(r.value?.implicitMods).map(strip),
);
const explicitLines = computed<string[]>(() =>
  asArray(r.value?.explicitMods).map(strip),
);
// flavour text は配列で来るが、辞書キーは複数行を改行で連結した 1 文字列。
// 配列を改行連結 → strip で 1 度に翻訳 → 改行で再 split (2026-05-22 修正)
const flavourLines = computed<string[]>(() => {
  const arr = asArray(r.value?.flavourText);
  if (arr.length === 0) return [];
  const joined = arr.join("\n");
  const translated = strip(joined);
  return translated.split(/\r?\n/);
});

/**
 * 必要レベルなど requirements / level の要約 1 行。
 * poe.ninja の requirements は `{ name, values: [[value, ...]] }` 構造の可能性が高いが、
 * 実機データの型バリエーションをすべてカバーするのは難しいので、簡易にレベルだけ取り出す。
 */
const summaryFooter = computed<string>(() => {
  const ilvl = r.value?.ilvl;
  const lv = r.value?.level;
  const parts: string[] = [];
  if (typeof ilvl === "number" && ilvl > 0) parts.push(`アイテムLv ${ilvl}`);
  if (typeof lv === "number" && lv > 0) parts.push(`要求 Lv ${lv}`);
  return parts.join(" / ");
});

// ---------------------------------------------------------------------------
// 表示位置: 画面端フリップ
// ---------------------------------------------------------------------------
/** カードの想定幅 (見切れ判定用、実描画は max-w で制御) */
const TOOLTIP_WIDTH = 360;
/** カードの想定高さ (見切れ判定用、実際は内容次第) */
const TOOLTIP_HEIGHT = 320;
/** 画面端からの余白 */
const EDGE_MARGIN = 12;

const position = computed<{ left: number; top: number }>(() => {
  // SSR ガード: window が無い場合は単純に props 値を返す
  if (typeof window === "undefined") {
    return { left: props.x, top: props.y };
  }
  const vw = toCss(window.innerWidth);
  const vh = toCss(window.innerHeight);
  // 2026-05-22: マウス直近だとカーソルとカード端が被って邪魔という指摘 (#36)
  // → 右側オフセットをやや広げ、上方向にも少し持ち上げる
  let left = props.x + 32;
  let top = props.y + 4;
  // 右端で見切れるなら左フリップ (要素の左側に表示)
  if (left + TOOLTIP_WIDTH + EDGE_MARGIN > vw) {
    left = Math.max(EDGE_MARGIN, props.x - TOOLTIP_WIDTH - 16);
  }
  // 下端で見切れるなら上にずらす
  if (top + TOOLTIP_HEIGHT + EDGE_MARGIN > vh) {
    top = Math.max(EDGE_MARGIN, vh - TOOLTIP_HEIGHT - EDGE_MARGIN);
  }
  return { left, top };
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="unique"
      class="fixed z-50 pointer-events-none"
      :style="{ left: position.left + 'px', top: position.top + 'px' }"
      role="tooltip"
    >
      <div
        class="w-[360px] max-w-[90vw] rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] shadow-xl overflow-hidden"
      >
        <!-- ========= 上部: アイコン + 名前 + ベース ========= -->
        <div class="flex items-start gap-3 p-3 border-b border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-elevated)]">
          <img
            v-if="unique.icon"
            :src="unique.icon"
            :alt="unique.nameEn"
            class="w-16 h-16 object-contain shrink-0"
            referrerpolicy="no-referrer"
          />
          <div class="min-w-0">
            <div
              class="font-display tracking-[0.04em] text-[15px] text-[var(--exile-color-accent-focus)] leading-tight"
            >
              {{ displayName }}
            </div>
            <div
              v-if="displayBase"
              class="text-[12px] text-[var(--exile-color-text-secondary)] mt-0.5"
            >
              {{ displayBase }}
            </div>
            <div
              class="text-[10px] text-[var(--exile-color-text-tertiary)] mt-1 tabular-nums"
            >
              {{ unique.count }}人 ({{ Math.round(unique.percentage * 100) }}%)
            </div>
          </div>
        </div>

        <!-- ========= 中央: MODs ========= -->
        <div class="p-3 space-y-1.5 text-[12px] leading-snug">
          <!-- implicitMods (POE 慣習: 青系) -->
          <p
            v-for="(line, i) in implicitLines"
            :key="'imp-' + i"
            class="text-[#8FB6E5]"
          >
            {{ line }}
          </p>
          <!-- セパレータ (implicit と explicit がどちらも存在する場合のみ) -->
          <div
            v-if="implicitLines.length > 0 && explicitLines.length > 0"
            class="h-px bg-[var(--exile-color-border-subtle)] my-1"
          ></div>
          <!-- explicitMods (本文色) -->
          <p
            v-for="(line, i) in explicitLines"
            :key="'exp-' + i"
            class="text-[var(--exile-color-text-primary)]"
          >
            {{ line }}
          </p>
          <!-- flavourText (斜体・暖色) -->
          <p
            v-for="(line, i) in flavourLines"
            :key="'flv-' + i"
            class="italic text-[var(--exile-color-accent-focus)] text-[11px] mt-2"
          >
            {{ line }}
          </p>
        </div>

        <!-- ========= 下部: 補足 ========= -->
        <div
          v-if="summaryFooter"
          class="px-3 py-1.5 border-t border-[var(--exile-color-border-subtle)] text-[10px] tabular-nums text-[var(--exile-color-text-tertiary)]"
        >
          {{ summaryFooter }}
        </div>
      </div>
    </div>
  </Teleport>
</template>
