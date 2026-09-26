<!--
  UniqueHoverCard.vue — ユニーク装備価格推移の行にカーソルを乗せた時のカード (2026-09-26)

  オーナー:「カーソルホバーでそのアイテムの画像をちゃんとゲーム内のホバーと同じで、アイテム画像と MOD の効果を表示させて。
  MOD が変わるところは伏字でもなんでもおｋ」。
  ゲームのユニークの見た目に寄せる: 茶の見出しに橙の名前、防御値と要求は灰と白、MOD は青、フレーバーは橙の斜体。
  数字の幅は「(100-150)」のまま出す。「どれかが付く」行 (poe.ninja の optional) は薄く出す。
  文面の日本語は [[unique-mod-ja.ts]]。防御値の見出しはゲームの MOD 文に出てくる語だけ日本語にする (確かめられない語は英語のまま)。
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { toCss } from "../../utils/zoom";
import { jaItemClass, jaUniqueText, loadUniqueHoverDict } from "../../services/mods/unique-mod-ja";
import { NINJA_UNIQUE_KINDS } from "../../api/ninja-economy";
import { stripRichTextMarkers } from "../../services/mods/normalize";
import type { UniqueRow } from "../../views/unique-trend/useUniqueTrend";

const props = defineProps<{ row: UniqueRow | null; x: number; y: number }>();

/** 防御値・要求の見出し (ゲームの MOD 文で使われている語) */
const LABEL: Record<string, string> = {
  "Energy Shield": "エナジーシールド",
  Armour: "アーマー",
  "Evasion Rating": "回避力",
  "Runic Ward": "ルーンワード",
  "Block chance": "ブロック率",
  "Chance to Block": "ブロック率",
  "Physical Damage": "物理ダメージ",
  "Critical Hit Chance": "クリティカルヒット率",
  Spirit: "スピリット",
  Level: "レベル",
  Str: "筋力",
  Dex: "器用さ",
  Int: "知性",
  Strength: "筋力",
  Dexterity: "器用さ",
  Intelligence: "知性",
};
/** 「見出し: 値」を日本語の見出しに */
function labelLine(text: string): { label: string; value: string } {
  const plain = stripRichTextMarkers(text);
  const i = plain.indexOf(": ");
  if (i < 0) return { label: "", value: jaUniqueText(text) };
  const en = plain.slice(0, i);
  return { label: LABEL[en] ?? en, value: plain.slice(i + 2) };
}

onMounted(() => void loadUniqueHoverDict());

/** 種類 (「武器 · セプター」)。オーナー 2026-09-26「武器なのか防具なのか、アミュレットなのかセプターなのかも」 */
const kindLine = computed(() => {
  const r = props.row;
  if (!r) return "";
  const group = NINJA_UNIQUE_KINDS.find((k) => k.kind === r.kind)?.ja ?? "";
  const cls = jaItemClass(r.baseEn);
  return [group, cls].filter(Boolean).join(" · ");
});

const properties = computed(() => (props.row?.hover.properties ?? []).map((m) => labelLine(m.text)));
const requirements = computed(() =>
  (props.row?.hover.requirements ?? []).map((m) => {
    const l = labelLine(m.text);
    return l.label ? `${l.label} ${l.value}` : l.value;
  }),
);
const implicits = computed(() => (props.row?.hover.implicit ?? []).map((m) => ({ text: jaUniqueText(m.text), optional: !!m.optional })));
const explicits = computed(() => (props.row?.hover.explicit ?? []).map((m) => ({ text: jaUniqueText(m.text), optional: !!m.optional })));
const flavour = computed(() => {
  const f = props.row?.hover.flavour ?? "";
  return f ? jaUniqueText(f).split(/\r?\n/) : [];
});

const WIDTH = 380;
const EDGE = 12;
/** カードの実際の高さ (描いてから測る) */
const card = ref<HTMLElement | null>(null);
const height = ref(0);
// 中身が変わると高さも変わる (辞書を読み込んだ後に訳が入る等)。見張って測り直す
watch(card, (el, _old, onCleanup) => {
  if (!el) {
    height.value = 0;
    return;
  }
  height.value = el.offsetHeight;
  const ro = new ResizeObserver(() => (height.value = el.offsetHeight));
  ro.observe(el);
  onCleanup(() => ro.disconnect());
});
/** 窓より高いカードは縮めて全部を窓に収める (見切れさせない) */
const scale = computed(() => {
  const vh = toCss(window.innerHeight);
  return height.value > 0 ? Math.min(1, (vh - EDGE * 2) / height.value) : 1;
});
/**
 * 必ず窓の中に出す (オーナー 2026-09-26「見切れるから絶対にホバーはウィンドウ内で表示させて、全体的に上にもう少し」)。
 * 横はカーソルの右 (右端では左)、縦はカーソルの高さを真ん中にして、上下の端で止める
 */
const position = computed(() => {
  const vw = toCss(window.innerWidth);
  const vh = toCss(window.innerHeight);
  const w = WIDTH * scale.value;
  const h = height.value * scale.value;
  let left = props.x + 28;
  if (left + w + EDGE > vw) left = Math.max(EDGE, props.x - w - 16);
  let top = props.y - h / 2;
  top = Math.min(top, vh - h - EDGE);
  top = Math.max(EDGE, top);
  return { left, top };
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="row"
      ref="card"
      class="fixed z-50 pointer-events-none"
      :style="{ left: position.left + 'px', top: position.top + 'px', width: WIDTH + 'px', transform: `scale(${scale})`, transformOrigin: 'top left', visibility: height ? 'visible' : 'hidden' }"
      role="tooltip"
    >
      <div class="u-card text-center">
        <div class="u-head">
          <p class="u-name">{{ row.nameJa }}</p>
          <p class="u-name u-base">{{ row.baseJa || row.baseEn }}</p>
        </div>
        <div class="px-4 pt-3 pb-3">
          <p v-if="kindLine" class="u-dim text-[12px] mb-1">{{ kindLine }}</p>
          <img v-if="row.icon" :src="row.icon" :alt="row.nameEn" class="mx-auto max-h-36 object-contain mb-2" referrerpolicy="no-referrer" />
          <p v-for="(p, i) in properties" :key="'p' + i" class="u-dim">
            <template v-if="p.label">{{ p.label }}: </template><span class="u-white">{{ p.value }}</span>
          </p>
          <p v-if="requirements.length" class="u-dim">要求 <span class="u-white">{{ requirements.join(", ") }}</span></p>
          <template v-if="implicits.length">
            <div class="u-sep" />
            <p v-for="(m, i) in implicits" :key="'i' + i" class="u-mod whitespace-pre-line" :class="m.optional ? 'opacity-60' : ''">{{ m.text }}</p>
          </template>
          <div class="u-sep" />
          <p v-for="(m, i) in explicits" :key="'e' + i" class="u-mod whitespace-pre-line" :class="m.optional ? 'opacity-60' : ''">{{ m.text }}</p>
          <template v-if="flavour.length">
            <div class="u-sep" />
            <p v-for="(l, i) in flavour" :key="'f' + i" class="u-flavour">{{ l }}</p>
          </template>
          <p v-if="explicits.some((m) => m.optional)" class="u-dim text-[10px] mt-2">薄い行はどれかが付く MOD</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ゲームのユニークのアイテム画面に寄せる (ItemCard.vue のレア版と同じ作り、色だけユニーク) */
.u-card {
  font-family: "Noto Serif JP", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", Georgia, serif;
  background: linear-gradient(180deg, #0d0d10 0%, #050506 100%);
  border: 1px solid #7a4a22;
  box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #2a1a0e, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75);
  border-radius: 3px;
  font-size: 13.5px;
  line-height: 1.45;
}
.u-head {
  padding: 7px 20px 6px;
  background: linear-gradient(180deg, #3d2412 0%, #22140a 55%, #0f0905 100%);
  border-bottom: 1px solid #8a5a30;
  box-shadow: inset 0 1px 0 #a8744a, inset 0 -1px 0 #3a2414;
}
.u-name { color: #af6025; font-weight: 700; font-size: 16px; letter-spacing: 0.04em; }
.u-base { font-size: 14px; font-weight: 600; }
.u-dim { color: #7f7f7f; }
.u-white { color: #fff; }
.u-mod { color: #8888ff; }
.u-flavour { color: #af6025; font-style: italic; font-size: 12.5px; }
.u-sep { height: 1px; margin: 6px 0; background: linear-gradient(90deg, transparent, #7a4a22 20%, #7a4a22 80%, transparent); }
</style>
