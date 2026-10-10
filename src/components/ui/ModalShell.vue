<!--
  ModalShell.vue — 窓 (モーダル) の共通の枠 (2026-10-10)

  オーナー「動きが統一されてない所」「エミュレーターに合わせてくれ、全部ここが原点」。
  原点は「次の手で狙う」の窓 (StageAimPicker.vue) の動き: .g-panel の枠・題の横に × (Icon)・Esc で閉じる・後ろを押すと閉じる・後ろのページは送らない。
  窓はみなこれで包む。重なった時は一番上の窓だけが Esc を受ける (下の窓まで閉じていた)。
  重なりの段: 窓 z-[300]、確認 (ConfirmDialog / WatchReplaceDialog) は窓の上に出す z-[310] (layer="confirm")。ホバーのカードは 1000 以上。
  使い方: <ModalShell :open="x" :title="tr(...)" width="w-full max-w-[26rem]" @close="x = false"> 中身 <template #footer>ボタン</template></ModalShell>
  スロット: 既定 = 中身、#title = 題を差し替え、#header = 題の横 (× の手前)、#subheader = 題の下の行、#footer = 下の帯 (いつも見える所)
-->
<script lang="ts">
// 開いている窓の積み (上ほど後に開いた物)。Esc は一番上だけ
const stack: symbol[] = [];
// 後ろのページを止めている窓の数 (重なっても最後の 1 つが閉じた時に戻す)
let locks = 0;
let prevOverflow = "";
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useSlots, watch } from "vue";
import Icon from "./Icon.vue";
import { tr } from "../../i18n/lang";

const props = withDefaults(defineProps<{
  open: boolean;
  title?: string;
  /** 枠の幅 (max-w も含めて渡す)。既定はエミュレーターの窓と同じ */
  width?: string;
  /** 中身の余白など */
  bodyClass?: string;
  /** false なら × も Esc も後ろを押しても閉じない */
  closable?: boolean;
  /** × の説明 (既定「閉じる」) */
  closeTitle?: string;
  /** 確認の窓は他の窓の上 */
  layer?: "modal" | "confirm";
  /** スマホ (768 px 未満) は画面いっぱい (エミュレーターの一覧の窓) */
  fullOnPhone?: boolean;
}>(), { title: "", width: "w-[1000px] max-w-full", bodyClass: "px-3 py-2", closable: true, closeTitle: "", layer: "modal", fullOnPhone: false });
const emit = defineEmits<{ close: [] }>();
const slots = useSlots();

const id = Symbol("modal");
const panel = ref<HTMLElement | null>(null);
let prevFocus: HTMLElement | null = null;
let active = false;

function close(): void { if (props.closable) emit("close"); }

// Esc: window で先に受け (capture)、一番上の窓だけ閉じる。下の画面の Esc (持っている物を離す など) には渡さない
function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape" || stack[stack.length - 1] !== id) return;
  e.stopPropagation();
  e.preventDefault();
  close();
}
// 後ろを押した時だけ閉じる (中で押して外で離した時 = 文字の選択などでは閉じない)
let downOnBackdrop = false;
const onDown = (e: MouseEvent): void => { downOnBackdrop = e.target === e.currentTarget; };
const onBackdrop = (e: MouseEvent): void => { if (downOnBackdrop && e.target === e.currentTarget) close(); downOnBackdrop = false; };

function activate(): void {
  if (active) return;
  active = true;
  stack.push(id);
  if (locks++ === 0) { prevOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  window.addEventListener("keydown", onKey, true);
  prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // 開いたら窓に (autofocus の欄があればそこ)。Esc・Tab が窓から始まる
  void nextTick(() => {
    const el = panel.value;
    if (!el) return;
    const auto = el.querySelector<HTMLElement>("[autofocus]");
    (auto ?? el).focus({ preventScroll: true });
  });
}
function deactivate(): void {
  if (!active) return;
  active = false;
  const i = stack.indexOf(id);
  if (i >= 0) stack.splice(i, 1);
  if (--locks === 0) document.body.style.overflow = prevOverflow;
  window.removeEventListener("keydown", onKey, true);
  // 閉じたら前に居た所へ (消えていたらそのまま)
  const back = prevFocus;
  prevFocus = null;
  if (back && back.isConnected) back.focus({ preventScroll: true });
}
watch(() => props.open, (v) => (v ? activate() : deactivate()), { immediate: true });
onBeforeUnmount(deactivate);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 grid place-items-center bg-black/65 p-4"
      :class="[layer === 'confirm' ? 'z-[310]' : 'z-[300]', fullOnPhone ? 'max-md:place-items-stretch max-md:p-0' : '']"
      @mousedown="onDown"
      @click="onBackdrop"
    >
      <div
        ref="panel"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        :aria-label="title || undefined"
        class="g-panel flex max-h-[88vh] min-w-0 flex-col text-[12px] outline-none"
        :class="[width, fullOnPhone ? 'max-md:max-h-none max-md:w-full max-md:max-w-none max-md:rounded-none' : '']"
      >
        <!-- 見出し: 題・× (いつも見える所に) -->
        <header class="border-b border-white/10 px-3 py-2">
          <div class="flex items-center gap-2">
            <!-- 題と横の物 (横の物に ml-auto を付けると × の隣に寄る) -->
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <b class="g-brush text-[18px] tracking-[0.12em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]"><slot name="title">{{ title }}</slot></b>
              <slot name="header" />
            </div>
            <button v-if="closable" type="button" class="g-plain ml-auto grid size-9 shrink-0 place-items-center rounded text-[var(--exile-color-text-tertiary)] hover:bg-white/10" :title="closeTitle || tr('閉じる', 'Close')" :aria-label="closeTitle || tr('閉じる', 'Close')" @click="close"><Icon name="x" class="size-5" /></button>
          </div>
          <slot name="subheader" />
        </header>
        <div class="min-h-0 flex-1 overflow-auto" :class="bodyClass"><slot /></div>
        <!-- 決める・閉じる (下に固定) -->
        <footer v-if="slots.footer" class="flex items-center gap-2 border-t border-white/10 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
