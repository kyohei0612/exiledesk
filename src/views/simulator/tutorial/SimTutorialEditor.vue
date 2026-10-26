<!--
  SimTutorialEditor.vue — 手元の dev だけ: チュートリアルの札の中で文を打つ・光らせる所を選ぶ・手順を足す / 消す / 並べ替える・保存
  (2026-10-26 夜オーナー「開発版で文字を俺が打つから保存と修正が開発版でできるような構造。メモ帳みたいな感じでくっつけて一緒に進行」)。
  文は今の場面の鍵 (手順の id.場面) に日 / 英で入る。空なら下書きが出る。保存は src/data/sim-tutorial.json へ (tut-data の saveTutData)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { editSteps, newNoteId, saveTutData, setTarget, setText, tutData, tutDirty } from "./tut-data";

const props = defineProps<{ textKey: string; stepId: string; boxId?: string; draft: [string, string] }>();

const cur = computed(() => tutData.value.texts[props.textKey] ?? { ja: "", en: "" });
const picked = computed(() => tutData.value.targets[props.textKey] ?? null);
const note = ref("");

/** 押した要素 → 光らせる所の CSS (近い data-* の目印。今の手順の箱の中なら {box} で書き、組み直しても同じ所を指す) */
function selectorOf(el: Element): string | null {
  for (let e: Element | null = el; e && e !== document.body; e = e?.parentElement ?? null) {
    const here: Element = e;
    const attrs = [...here.attributes].filter((a) => a.name.startsWith("data-") && !a.name.startsWith("data-v-") && !a.name.startsWith("data-rec") && !a.name.startsWith("data-tut"));
    if (!attrs.length) continue;
    const a = attrs.find((x) => x.value && x.name !== "data-box-id") ?? attrs.find((x) => x.name !== "data-box-id") ?? attrs[0]!;
    const idOf = (v: string): string => (v === props.boxId ? "{box}" : v);
    let sel = a.name === "data-box-id" ? `[data-box-id="${idOf(a.value)}"]` : a.value ? `[${a.name}="${a.value.replace(/"/g, '\\"')}"]` : `[${a.name}]`;
    const box = a.name === "data-box-id" ? null : here.closest("[data-box-id]");
    if (box) sel = `[data-box-id="${idOf(box.getAttribute("data-box-id") ?? "")}"] ${sel}`;
    return sel;
  }
  return null;
}
/** 場所を選んでいる間: 次に押した所を光らせる所にする (その押しは画面には渡さない)。札の中・Esc はやめる */
const picking = ref(false);
const hover = ref<{ x: number; y: number; w: number; h: number } | null>(null);
function stopPick(): void {
  picking.value = false; hover.value = null;
  window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("click", swallow, true); window.removeEventListener("mousedown", swallow, true);
  window.removeEventListener("pointermove", onMove, true); window.removeEventListener("keydown", onKey, true);
}
function swallow(e: Event): void { if (!(e.target as Element).closest?.("[data-tut-card]")) { e.preventDefault(); e.stopImmediatePropagation(); } }
function onDown(e: PointerEvent): void {
  const el = e.target as Element;
  if (el.closest?.("[data-tut-card]")) return;
  swallow(e);
  const sel = selectorOf(el);
  note.value = sel ? `選んだ所: ${sel}` : "目印の無い所 (別の所を押す)";
  if (sel) { setTarget(props.textKey, sel); window.setTimeout(stopPick, 0); }
}
function onMove(e: PointerEvent): void { const el = e.target as Element; if (el.closest?.("[data-tut-card]")) { hover.value = null; return; } const r = el.getBoundingClientRect(); hover.value = { x: r.left, y: r.top, w: r.width, h: r.height }; }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") { e.stopImmediatePropagation(); stopPick(); } }
function startPick(): void {
  picking.value = true; note.value = "光らせたい所を押す (Esc でやめる)";
  window.addEventListener("pointerdown", onDown, true); window.addEventListener("click", swallow, true); window.addEventListener("mousedown", swallow, true);
  window.addEventListener("pointermove", onMove, true); window.addEventListener("keydown", onKey, true);
}
onBeforeUnmount(stopPick);

const idx = computed(() => tutData.value.steps.findIndex((s) => s.id === props.stepId));
function move(d: -1 | 1): void { editSteps((s) => { const i = idx.value, j = i + d; if (i < 0 || j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j]!, s[i]!]; }); }
function addNote(): void { const id = newNoteId(); editSteps((s) => { s.splice(idx.value + 1, 0, { id, kind: "note" }); }); }
function remove(): void { if (window.confirm(`手順「${props.stepId}」を消す (文と光らせる所も消える。保存するまでファイルは変わらない)`)) editSteps((s) => { s.splice(idx.value, 1); }); }
async function save(): Promise<void> { const e = await saveTutData(); note.value = e ? `保存できなかった: ${e}` : "保存した (src/data/sim-tutorial.json)"; }
</script>

<template>
  <div data-tut-editor class="flex flex-col gap-1.5 border-t border-[#7a4b12]/25 pt-2 text-[12px]">
    <div class="flex items-center gap-1 opacity-70"><span class="min-w-0 flex-1 truncate font-mono" :title="textKey">{{ textKey }}</span><span v-if="tutDirty" class="text-amber-300">● 未保存</span></div>
    <textarea data-tut-edit-ja rows="3" style="background: rgba(255, 255, 255, 0.8)" class="g-plain w-full resize-y rounded border border-[#7a4b12]/40 bg-white/75 px-1.5 py-1 text-[13px] text-[#2b2217] placeholder:text-[#2b2217]/45" :placeholder="`日本語 (空なら下書き: ${draft[0]})`" :value="cur.ja" @input="setText(textKey, 'ja', ($event.target as HTMLTextAreaElement).value)" />
    <textarea data-tut-edit-en rows="2" style="background: rgba(255, 255, 255, 0.8)" class="g-plain w-full resize-y rounded border border-[#7a4b12]/40 bg-white/75 px-1.5 py-1 text-[13px] text-[#2b2217] placeholder:text-[#2b2217]/45" :placeholder="`English (empty = draft: ${draft[1]})`" :value="cur.en" @input="setText(textKey, 'en', ($event.target as HTMLTextAreaElement).value)" />
    <div class="flex flex-wrap items-center gap-1">
      <button type="button" data-tut-pick class="ted-btn" :aria-pressed="picking" @click="picking ? stopPick() : startPick()">{{ picking ? "選ぶのをやめる" : "場所を選ぶ" }}</button>
      <button v-if="picked" type="button" class="ted-btn" :title="picked" @click="setTarget(textKey, null)">既定の場所に戻す</button>
    </div>
    <div class="flex flex-wrap items-center gap-1">
      <span class="opacity-70">手順</span>
      <button type="button" class="ted-btn" :disabled="idx <= 0" @click="move(-1)">↑</button>
      <button type="button" class="ted-btn" :disabled="idx < 0 || idx >= tutData.steps.length - 1" @click="move(1)">↓</button>
      <button type="button" data-tut-add-note class="ted-btn" @click="addNote">＋ 文だけの手順を後ろに</button>
      <button type="button" class="ted-btn" @click="remove">この手順を消す</button>
    </div>
    <div class="flex items-center gap-2">
      <button type="button" data-tut-save class="ted-btn" :disabled="!tutDirty" @click="save">保存</button>
      <span v-if="note" data-tut-edit-note class="min-w-0 flex-1 break-words opacity-75">{{ note }}</span>
    </div>
    <div v-if="picking && hover" aria-hidden="true" class="pointer-events-none fixed z-[1199] rounded border-2 border-dashed border-sky-300" :style="{ left: `${hover.x}px`, top: `${hover.y}px`, width: `${hover.w}px`, height: `${hover.h}px` }" />
  </div>
</template>

<style scoped>
/* 札 (メモ帳の紙) の中の小さなボタン (SimTutorialGuide の tut-btn と同じ見た目) */
.ted-btn { height: 24px; padding: 0 8px; border: 1px solid rgba(122, 75, 18, 0.45); border-radius: 4px; font-size: 12px; color: #4a3214; background: rgba(255, 255, 255, 0.4); }
.ted-btn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.75); }
.ted-btn:disabled { opacity: 0.4; }
.ted-btn[aria-pressed="true"], .ted-save:not(:disabled) { background: #7a4b12; color: #fff; }
</style>
