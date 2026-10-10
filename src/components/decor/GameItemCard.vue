<!--
  GameItemCard.vue — ゲームのアイテム画面そっくりのホバーカードの枠 (2026-09-26)

  ユニーク装備価格推移とカレンシーランキングで同じ作りにするための共通の枠 (オーナー:「ユニークとカレンシー UI 回り
  結構似てるから、細かい所一緒にしてほしい。ホバーしたときの挙動一緒にして」)。
    - 見た目: 黒地に金 (ユニークは茶) の二重枠、見出しに名前とベース。中身はスロット
    - 触れる: カードにカーソルを入れても消えない。中の下線 (キーワード) から次の段を開ける。ピン留めで外へ出ても残す
      (段の決まりは [[hover-stack.ts]])
    - 位置: 必ず窓の中 (オーナー「見切れるから絶対にホバーはウィンドウ内で」)。カーソルの右 (右端では左)、
      縦はカーソルの高さを真ん中にして上下の端で止める。窓より高い時は縮めて全部を収める
    - 動かす: ピン留めしたカードは名前 (見出し) を長押し (0.25 秒) するとつかめて、好きな所へ動かせる (2026-10-04 オーナー
      「カード固定したら名前長押して移動できるように、比較しづらいから」。全部のカードがこの枠なので全部に効く)
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import Icon from "../ui/Icon.vue";
import { computed, onBeforeUnmount, provide, ref, watch } from "vue";
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
    tone?: "unique" | "currency" | "keyword" | "gem" | "rare" | "magic" | "normal";
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
/** 動かした後の位置 (CSS px)。ピン留めを外したら元の決まりの位置に戻す */
const moved = ref<{ left: number; top: number } | null>(null);
watch(() => props.pinned, (p) => { if (!p) moved.value = null; });
const position = computed(() => {
  const vw = toCss(window.innerWidth);
  const vh = toCss(window.innerHeight);
  const w = props.width * scale.value;
  const h = height.value * scale.value;
  if (moved.value) {
    // 動かした時も窓の中に収める (見出しが外へ出て掴めなくならないように)
    return {
      left: Math.min(Math.max(EDGE - w + 80, moved.value.left), vw - 80),
      top: Math.min(Math.max(EDGE, moved.value.top), vh - 40),
    };
  }
  // アイコンの右上 (カードの下の端をアイコンの上の端に、右に少し空けて)。棚・ベースの一覧のように横に並んだ物を順に見る所。
  // 2026-10-10 オーナー「カードの位置もっと右、余裕持って空けないと被る、アイコンの右上に出してんのかな」。上に入らなければ下、右に入らなければ左
  const box = hoverStack.layers.value.find((l) => l.key === props.layerKey)?.box;
  if (box) {
    const GAP = 14;
    let bl = box.right + GAP;
    if (bl + w + EDGE > vw) bl = Math.max(EDGE, box.left - w - GAP);
    let bt = box.top - h - 6;
    if (bt < EDGE) bt = Math.min(box.bottom + 6, vh - h - EDGE);
    return { left: bl, top: Math.max(EDGE, bt) };
  }
  let left = props.x + 10;
  if (left + w + EDGE > vw) left = Math.max(EDGE, props.x - w - 10);
  let top = props.y - h / 2;
  top = Math.min(top, vh - h - EDGE);
  top = Math.max(EDGE, top);
  return { left, top };
});

/** 長押しでつかむ。押してから 0.25 秒で掴み、離すまでカーソルに付いて動く (ピン留めしている時だけ) */
const LONG_PRESS = 250;
const dragging = ref(false);
let pressTimer: ReturnType<typeof setTimeout> | null = null;
let grab = { dx: 0, dy: 0 };
function onHeadDown(e: PointerEvent): void {
  if (!props.pinned || e.button !== 0) return;
  const start = { x: toCss(e.clientX), y: toCss(e.clientY) };
  const at = position.value;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    dragging.value = true;
    grab = { dx: start.x - at.left, dy: start.y - at.top };
    moved.value = { left: at.left, top: at.top };
  }, LONG_PRESS);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}
function onMove(e: PointerEvent): void {
  if (!dragging.value) return;
  e.preventDefault();
  moved.value = { left: toCss(e.clientX) - grab.dx, top: toCss(e.clientY) - grab.dy };
}
function onUp(): void {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
  dragging.value = false;
  window.removeEventListener("pointermove", onMove);
}
onBeforeUnmount(onUp);
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
      <div class="g-card text-center relative" :class="`g-${tone}`">
        <!-- ピン留め (外へ出ても残す) と、留めた時の × -->
        <div class="absolute right-1.5 top-1.5 flex items-center gap-1 z-10">
          <button
            type="button"
            class="g-plain grid h-6 w-6 place-items-center bg-transparent text-[13px] leading-none transition"
            :class="pinned ? 'text-[#ffd479] drop-shadow-[0_0_4px_rgba(255,212,121,0.6)]' : 'text-[#8a8170] hover:text-[#e6dcc2]'"
            :title="pinned ? tr('ピン留めを外す', 'Unpin') : tr('ピン留め (カーソルを外しても消さない)', 'Pin (keeps the card when the cursor leaves)')"
            @click.stop="hoverStack.togglePin(layerKey)"
          >
            <Icon name="pin" class="size-3.5" />
          </button>
          <button v-if="pinned" type="button" class="g-plain h-6 w-6 bg-transparent text-[14px] leading-none text-[#cfc6ae] hover:text-white" :title="tr('閉じる', 'Close')" @click.stop="hoverStack.close(layerKey)">×</button>
        </div>
        <div
          class="g-head select-none"
          :class="[pinned ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : '', sub ? 'two' : 'one']"
          :title="pinned ? tr('長押しでつかんで動かせます', 'Press and hold to drag') : undefined"
          @pointerdown="onHeadDown"
        >
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
.g-unique .g-name { color: var(--color-rarity-unique); }
/* カレンシー: 灰金の枠とベージュの名前 */
.g-currency { border: 1px solid #6a5f48; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #22201a, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-currency .g-head { background: linear-gradient(180deg, #34302a 0%, #1d1b17 55%, #0c0b09 100%); border-bottom: 1px solid #7d7156; box-shadow: inset 0 1px 0 #9c8f70, inset 0 -1px 0 #2e2a22; }
.g-currency .g-name { color: #aa9e82; }
/* レア: 金の枠と黄色の名前 (ItemCard.vue と同じ) / マジック: 青の名前 */
.g-rare { border: 1px solid #6a5630; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #2a2214, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-rare .g-head { background: linear-gradient(180deg, #3d3116 0%, #221b0c 55%, #0f0c05 100%); border-bottom: 1px solid #8a7040; box-shadow: inset 0 1px 0 #a8895a, inset 0 -1px 0 #3a2f18; }
.g-rare .g-name { color: var(--color-rarity-rare); }
.g-magic { border: 1px solid #3d3d6a; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-magic .g-head { background: linear-gradient(180deg, #202038 0%, #121220 100%); border-bottom: 1px solid #4a4a80; }
.g-magic .g-name { color: var(--color-rarity-magic); }
/* ノーマル (白): ベースのカード (2026-10-10) */
.g-normal { border: 1px solid #4a4a4a; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-normal .g-head { background: linear-gradient(180deg, #2a2a2a 0%, #161616 55%, #0b0b0b 100%); border-bottom: 1px solid #5a5a5a; }
.g-normal .g-name { color: #c8c8c8; }
/* ジェム: 青緑の名前 (ゲームのジェムの色) */
.g-gem { border: 1px solid #2f5d5a; box-shadow: inset 0 0 0 1px #000, inset 0 0 0 2px #10201f, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-gem .g-head { background: linear-gradient(180deg, #16302e 0%, #0d1c1b 55%, #070d0d 100%); border-bottom: 1px solid #3c6f6a; box-shadow: inset 0 1px 0 #4f8a84, inset 0 -1px 0 #16302e; }
.g-gem .g-name { color: #1ba29b; }
/* キーワードの説明: 灰の枠と白の見出し (ゲームの説明の吹き出しに寄せる) */
.g-keyword { border: 1px solid #5a5a5a; box-shadow: inset 0 0 0 1px #000, 0 0 0 1px #000, 0 6px 24px rgba(0, 0, 0, 0.75); }
.g-keyword .g-head { background: linear-gradient(180deg, #2b2b2b 0%, #171717 100%); border-bottom: 1px solid #555; }
.g-keyword .g-name { color: #e8e8e8; font-size: 15px; }
/*
 * 名前の枠はゲームの絵 (クライアントの ItemsHeader*。左・中・右を 1 枚にした物、scripts/build-ui-art-from-client.mjs)。
 * 1 行 (名前だけ) は高さ 56 の絵、レア・ユニークの 2 行 (名前 + ベース) は 88 の絵。2026-10-10 オーナー「コモンの色とか名前の枠も POE2 仕様で、全部」
 */
.g-normal .g-head, .g-magic .g-head, .g-rare .g-head, .g-unique .g-head, .g-gem .g-head, .g-currency .g-head {
  background: none; box-shadow: none; border-bottom: 0;
  border-style: solid; border-image-slice: 0 56 fill; border-image-width: 0 36px; border-image-repeat: stretch;
  min-height: 36px; display: flex; flex-direction: column; justify-content: center; padding-top: 4px; padding-bottom: 4px;
}
.g-normal .g-head { border-image-source: url("/ui-art/ihead-normal.webp"); }
.g-magic .g-head { border-image-source: url("/ui-art/ihead-magic.webp"); }
.g-gem .g-head { border-image-source: url("/ui-art/ihead-gem.webp"); }
.g-currency .g-head { border-image-source: url("/ui-art/ihead-currency.webp"); }
.g-rare .g-head.one { border-image-source: url("/ui-art/ihead-rare-1.webp"); }
.g-unique .g-head.one { border-image-source: url("/ui-art/ihead-unique-1.webp"); }
.g-rare .g-head.two, .g-unique .g-head.two { border-image-slice: 0 80 fill; border-image-width: 0 49px; min-height: 54px; }
.g-rare .g-head.two { border-image-source: url("/ui-art/ihead-rare.webp"); }
.g-unique .g-head.two { border-image-source: url("/ui-art/ihead-unique.webp"); }
/* 名前の色はゲームと同じ (ノーマル白・マジック青・レア黄・ユニーク橙・ジェム青緑・カレンシーベージュ) */
.g-normal .g-name { color: #c8c8c8; }
</style>

<style>
/* 中身で使う色 (スロットの中の入れ子にも効くよう scoped にしない。.g-card の中だけ) */
.g-card .g-dim { color: #7f7f7f; }
.g-card .g-white { color: #fff; }
.g-card .g-mod { color: var(--color-rarity-magic); }
.g-card .g-flavour { color: var(--color-rarity-unique); font-style: italic; font-size: 12.5px; }
.g-card .g-desc { color: var(--color-rarity-normal); }
.g-card .g-head2 { color: #aa9e82; font-size: 12px; margin-top: 4px; }
.g-card .g-sep { height: 1px; margin: 6px 0; background: linear-gradient(90deg, transparent, #7a6538 20%, #7a6538 80%, transparent); }
/* 区切り線もゲームの絵 (ItemsSeparator*。2026-10-10) */
.g-card.g-normal .g-sep, .g-card.g-magic .g-sep, .g-card.g-rare .g-sep, .g-card.g-unique .g-sep, .g-card.g-gem .g-sep, .g-card.g-currency .g-sep { height: 8px; margin: 5px auto; max-width: 364px; background-position: center; background-size: 100% 100%; background-repeat: no-repeat; }
.g-card.g-normal .g-sep { background-image: url("/ui-art/isep-normal.webp"); }
.g-card.g-magic .g-sep { background-image: url("/ui-art/isep-magic.webp"); }
.g-card.g-rare .g-sep { background-image: url("/ui-art/isep-rare.webp"); }
.g-card.g-unique .g-sep { background-image: url("/ui-art/isep-unique.webp"); }
.g-card.g-gem .g-sep { background-image: url("/ui-art/isep-gem.webp"); }
.g-card.g-currency .g-sep { background-image: url("/ui-art/isep-currency.webp"); }
</style>
