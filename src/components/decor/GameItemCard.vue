<!--
  GameItemCard.vue — ゲームのアイテム画面そっくりのホバーカードの枠 (2026-09-26)

  ユニーク装備価格推移とカレンシーランキングで同じ作りにするための共通の枠 (オーナー:「ユニークとカレンシー UI 回り
  結構似てるから、細かい所一緒にしてほしい。ホバーしたときの挙動一緒にして」)。
    - 見た目: 黒地に金 (ユニークは茶) の二重枠、見出しに名前とベース。中身はスロット
    - 触れる: カードにカーソルを入れても消えない。中の下線 (キーワード) から次の段を開ける。ピン留めで外へ出ても残す
      (段の決まりは [[hover-stack.ts]])
    - 位置: 必ず窓の中 (オーナー「見切れるから絶対にホバーはウィンドウ内で」)。カーソルの右 (右端では左)、
      縦はカーソルの高さを真ん中にして上下の端で止める。窓より高い時は縮めて全部を収める
-->
<script setup lang="ts">
import { computed, provide, ref, watch } from "vue";
import { hoverStack } from "../../state/hover-stack";
import { toCss } from "../../utils/zoom";

const props = withDefaults(
  defineProps<{
    show: boolean;
    x: number;
    y: number;
    name: string;
    sub?: string | null;
    /** 名前の色: ユニーク (橙) / カレンシー (ベージュ) */
    tone?: "unique" | "currency" | "keyword";
    width?: number;
    /** 段の番号 (hover-stack)。中の下線がこの上に次の段を開く */
    layerKey: number;
    pinned?: boolean;
    /** 重なり順 (上の段ほど前) */
    z?: number;
  }>(),
  { sub: null, tone: "unique", width: 380, pinned: false, z: 1000 },
);
provide("hoverLayerKey", props.layerKey);

const EDGE = 12;
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
const scale = computed(() => {
  const vh = toCss(window.innerHeight);
  return height.value > 0 ? Math.min(1, (vh - EDGE * 2) / height.value) : 1;
});
const position = computed(() => {
  const vw = toCss(window.innerWidth);
  const vh = toCss(window.innerHeight);
  const w = props.width * scale.value;
  const h = height.value * scale.value;
  let left = props.x + 10;
  if (left + w + EDGE > vw) left = Math.max(EDGE, props.x - w - 10);
  let top = props.y - h / 2;
  top = Math.min(top, vh - h - EDGE);
  top = Math.max(EDGE, top);
  return { left, top };
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      ref="card"
      class="fixed"
      :data-hover-layer="layerKey"
      :style="{ zIndex: z, left: position.left + 'px', top: position.top + 'px', width: width + 'px', transform: `scale(${scale})`, transformOrigin: 'top left', visibility: height ? 'visible' : 'hidden' }"
      role="tooltip"
      @mouseenter="hoverStack.enterLayer(layerKey)"
      @mouseleave="hoverStack.leaveCard()"
    >
      <div class="g-card text-center relative" :class="tone === 'unique' ? 'g-unique' : tone === 'keyword' ? 'g-keyword' : 'g-currency'">
        <!-- ピン留め (外へ出ても残す) と、留めた時の × -->
        <div class="absolute right-1.5 top-1.5 flex items-center gap-1 z-10">
          <button
            type="button"
            class="w-6 h-6 rounded text-[13px] leading-none transition"
            :class="pinned ? 'bg-[#4a3a1a] text-[#ffd479]' : 'text-[#6f6a5e] hover:text-[#cfc6ae]'"
            :title="pinned ? 'ピン留めを外す' : 'ピン留め (カーソルを外しても消さない)'"
            @click.stop="hoverStack.togglePin(layerKey)"
          >
            📌
          </button>
          <button v-if="pinned" type="button" class="w-6 h-6 rounded text-[14px] leading-none text-[#cfc6ae] hover:text-white" title="閉じる" @click.stop="hoverStack.close(layerKey)">×</button>
        </div>
        <div class="g-head">
          <p class="g-name">{{ name }}</p>
          <p v-if="sub" class="g-name g-sub">{{ sub }}</p>
        </div>
        <div class="px-4 pt-3 pb-3">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ゲームのアイテム画面に寄せる。フォントは明朝 (ゲームは Fontin) */
.g-card {
  font-family: "Noto Serif JP", "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", Georgia, serif;
  background: linear-gradient(180deg, #0d0d10 0%, #050506 100%);
  border-radius: 3px;
  font-size: 13.5px;
  line-height: 1.45;
}
.g-head { padding: 7px 56px 6px; }
.g-name { font-weight: 700; font-size: 16px; letter-spacing: 0.04em; }
.g-sub { font-size: 14px; font-weight: 600; }
/* ユニーク: 茶の枠と橙の名前 */
.g-unique { border: 1px solid #7a4a22; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #2a1a0e, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-unique .g-head { background: linear-gradient(180deg, #3d2412 0%, #22140a 55%, #0f0905 100%); border-bottom: 1px solid #8a5a30; box-shadow: inset 0 1px 0 #a8744a, inset 0 -1px 0 #3a2414; }
.g-unique .g-name { color: #af6025; }
/* カレンシー: 灰金の枠とベージュの名前 */
.g-currency { border: 1px solid #6a5f48; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #22201a, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-currency .g-head { background: linear-gradient(180deg, #34302a 0%, #1d1b17 55%, #0c0b09 100%); border-bottom: 1px solid #7d7156; box-shadow: inset 0 1px 0 #9c8f70, inset 0 -1px 0 #2e2a22; }
.g-currency .g-name { color: #aa9e82; }
/* キーワードの説明: 灰の枠と白の見出し (ゲームの説明の吹き出しに寄せる) */
.g-keyword { border: 1px solid #5a5a5a; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-keyword .g-head { background: linear-gradient(180deg, #2b2b2b 0%, #171717 100%); border-bottom: 1px solid #555; }
.g-keyword .g-name { color: #e8e8e8; font-size: 15px; }
</style>

<style>
/* 中身で使う色 (スロットの中の入れ子にも効くよう scoped にしない。.g-card の中だけ) */
.g-card .g-dim { color: #7f7f7f; }
.g-card .g-white { color: #fff; }
.g-card .g-mod { color: #8888ff; }
.g-card .g-flavour { color: #af6025; font-style: italic; font-size: 12.5px; }
.g-card .g-desc { color: #c8c8c8; }
.g-card .g-head2 { color: #aa9e82; font-size: 12px; margin-top: 4px; }
.g-card .g-sep { height: 1px; margin: 6px 0; background: linear-gradient(90deg, transparent, #7a6538 20%, #7a6538 80%, transparent); }
</style>
