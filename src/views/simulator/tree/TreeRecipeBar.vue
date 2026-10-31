<!--
  TreeRecipeBar.vue — ツリーの上の帯のレシピ (2026-10-21 オーナー 10-22「ツリー形式に変えてから無くなった物を足さないと」。工程式の SimRecipeBar と同じ役):
  今のレシピの名前 (押すと名前を変える)・● 未保存・保存 (開いているレシピへ上書き、無ければ新しく)・「レシピ ▾」の窓
  (保存したレシピから開く・共有された URL を貼る・別名で保存・URL をコピー・レシピのページへ)。一覧は state/simulator/tree-recipes.ts
  10-27 オーナー: 「1 行で行けるはず」(名前・保存・レシピ・シェアを 1 行)「名前を付けて保存だね」(保存前は「(未保存)」、保存で名前の窓 = 既定はベースの名前と日時)
  「シェアボタンも」(短い URL をコピー・X に出す。窓の中の「URL をコピー」はシェアへ寄せた)「レシピ一覧に行かなくても削除できるように」(窓の行の ×)「(窓が) 切れる。枠内で出すように」
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { currentTreeRecipe, removeTreeRecipe, renameTreeRecipe, saveTreeRecipe, setCurrentTreeRecipe, touchedAtTree, treeRecipes, type TreeRecipe } from "../../../state/simulator/tree-recipes";
import { askLeave, openRecipesPage } from "../../../web/page";
import { copyRecipeUrl, fmtDate, seedDevRecipes, closeNewer, sharedNewer, treeShortUrl, useRecipeUrl } from "../recipe-share";
import { xIntentUrl } from "../../../services/craft-stage/share";
import { useTree } from "./use-tree";
import { autoName, quickSave, unsaved } from "./tree-save";
import { usePhone } from "../../../utils/use-phone";
import { recipeSummary } from "./recipe-summary";
import { track } from "../../../utils/track";
import { simAct, simOp } from "../../../web/track";
import { tr } from "../../../i18n/lang";

const t = useTree();
/** opened = 別の木を開いた (ツリーの側で全体に合わせる) */
const emit = defineEmits<{ opened: [] }>();
/** menuOnly = 「レシピ ▾」だけ (名前・保存・別名で保存・URL をコピーは出さない)。完成形の設定の段のタブの右端で使う (小窓は右寄せ、10-23 オーナー) */
/** flat = 保存・レシピ ▾ を絵 + 短い名前の平たいボタンにする時のボタンの class (スマホの上の帯、PC の操作の列 0b131904 と同じ形。10-26 夜オーナー「上の帯が太い」) */
const props = defineProps<{ menuOnly?: boolean; flat?: string }>();
/** PC の右の列 (248px) で 1 行に入る平たい小さなボタン (操作の列 TreeTopTools と同じ形) */
const SMALL = "g-plain inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-white/15 bg-white/[0.04] px-1.5 text-[12px] text-sim-body hover:bg-white/10 hover:text-white aria-expanded:border-amber-400/60 aria-expanded:text-amber-100";
const btn = computed(() => props.flat ?? SMALL);
/** 小窓の置き場 (完成形の設定の右端は右寄せ 340px、スマホの上の帯は左寄せ 340px、PC の列は帯の幅いっぱい = 列の中) */
/**
 * 小窓の縦の置き場と最大の高さ (開く時に測る)。PC の右の列は overflow-hidden なので、列 (無ければ画面) の下までの空きと上までの空きを比べ、
 * 広い方へ開いてその空きまで (中は送る)。レシピが 8 つあると窓が 1254px になり、列の下で切れた (10-27 オーナー「切れる。枠内で出すように」)
 */
const popV = ref<{ up: boolean; max: number }>({ up: false, max: 9999 });
function placePop(): void {
  const r = root.value?.getBoundingClientRect();
  if (!r) return;
  const box = root.value?.closest("[data-tree-side]")?.getBoundingClientRect();
  const bottom = Math.min(box?.bottom ?? innerHeight, innerHeight), top = Math.max(box?.top ?? 0, 0);
  const below = bottom - r.bottom - 8, above = r.top - top - 8;
  popV.value = below >= 320 || below >= above ? { up: false, max: Math.max(160, below) } : { up: true, max: Math.max(160, above) };
}
const popPlace = computed(() => `${props.menuOnly ? "right-0 w-[340px] max-w-[calc(100vw-2rem)]" : props.flat || bare.value ? "left-0 w-[340px] max-w-[calc(100vw-2rem)]" : "inset-x-0 min-w-0"} ${popV.value.up ? "bottom-full mb-1" : "top-full mt-1"}`);
/** 開いている木に保存の手が要らない時 (ベースが無い空の形・完成形の設定の右端) */
const bare = computed(() => t.needBase.value || !!props.menuOnly);
/** 一覧の 1 行の要約 (ベースの絵・狙い・印) */
const sum = (r: { tree: Parameters<typeof recipeSummary>[0] }) => recipeSummary(r.tree);
/** 作りかけ (保存していない狙いか手がある、tree-save の unsaved) */
const dirty = computed(() => unsaved(t.doc.value));
const defaultName = (): string => autoName(t.doc.value);

const note = ref("");
let noteT = 0;
function say(text: string): void { note.value = text; clearTimeout(noteT); noteT = window.setTimeout(() => { note.value = ""; }, 3_000); }

// 名前を変える (その場で。保存していない木は名前を付けて保存)
const renaming = ref(false);
const nameInput = ref<HTMLInputElement | null>(null);
function startRename(): void { renaming.value = true; void nextTick(() => nameInput.value?.select()); }
function endRename(v: string): void {
  if (!renaming.value) return;
  renaming.value = false;
  if (!v.trim()) return;
  // 名前を変えたら新しい名前で一言 (前は「〜で保存しました」が前の名前のまま残り、新しい名前で残ったか分からなかった、10-26 猿の 7)
  if (currentTreeRecipe.value) { renameTreeRecipe(currentTreeRecipe.value.id, v); say(tr(`「${v.trim()}」に名前を変えました`, `Renamed to "${v.trim()}"`)); }
  else { saveTreeRecipe(v, t.doc.value); track("tree-recipe:save"); say(tr(`「${v.trim()}」で保存しました`, `Saved as "${v.trim()}"`)); }
}
/**
 * 保存: 開いているレシピがあれば上書き (名前は聞かない)。まだ名前が無ければ名前の窓 (欄には最初からベースの名前と日時、そのまま「保存」でその名前。
 * 10-27 オーナー「名前を付けて保存だね。基本何も決めずにだったらベースの名前で保存される感じで」)。離れる時の「保存して進む」は今まで通り聞かない (tree-save の quickSave)
 */
const naming = ref(false);
const saveName = ref("");
const saveInput = ref<HTMLInputElement | null>(null);
function save(): void {
  if (!currentTreeRecipe.value) { saveName.value = defaultName(); naming.value = true; pop.value = false; share.value = false; void nextTick(() => saveInput.value?.select()); return; }
  simAct("save");
  const { r, over } = quickSave();
  say(over ? tr(`「${r.name}」に保存しました`, `Saved to "${r.name}"`) : tr(`「${r.name}」で保存しました (名前を押すと変えられる)`, `Saved as "${r.name}" (click the name to rename)`));
}
/** 名前の窓の「保存」 */
function saveNamed(): void {
  const v = saveName.value.trim() || defaultName();
  naming.value = false;
  simAct("save");
  saveTreeRecipe(v, t.doc.value);
  track("tree-recipe:save");
  say(tr(`「${v}」で保存しました`, `Saved as "${v}"`));
}
/** 名前の押し口: 保存したレシピなら名前を変える、まだなら名前の窓 */
function onName(): void { if (currentTreeRecipe.value) startRename(); else save(); }
function saveAs(): void {
  simAct("save");
  const r = saveTreeRecipe(currentTreeRecipe.value ? `${currentTreeRecipe.value.name}${tr(" のコピー", " (copy)")}` : defaultName(), t.doc.value);
  track("tree-recipe:save-as");
  pop.value = false;
  say(tr(`「${r.name}」で保存しました`, `Saved as "${r.name}"`));
  startRename();
}

// 「レシピ ▾」の窓
const pop = ref(false);
const root = ref<HTMLElement | null>(null);
const recent = computed(() => [...treeRecipes.value].sort((a, b) => touchedAtTree(b) - touchedAtTree(a)).slice(0, 8));
/** レシピを開く。今の木が作りかけなら 3 択 (保存して進む = 今の木を保存してから開く。10-26 オーナー「レシピを開いて今の木を替える」も) */
function open(r: TreeRecipe): void {
  const go = (): void => { simOp("open-recipe"); setCurrentTreeRecipe(r.id); t.open(r.tree); pop.value = false; emit("opened"); track("tree-recipe:open"); };
  if (dirty.value && currentTreeRecipe.value?.id !== r.id) { pop.value = false; askLeave(go, () => void quickSave()); }
  else go();
}
const { url, urlNote, openUrl, onPaste } = useRecipeUrl({
  notUrl: ["レシピの URL ではありません", "Not a recipe URL"],
  unreadable: ["このレシピは読めませんでした", "Couldn't read this recipe"],
  onOpened: () => { pop.value = false; emit("opened"); },
});
async function copyUrl(): Promise<void> {
  const name = currentTreeRecipe.value?.name ?? defaultName();
  const { ok, short } = await copyRecipeUrl({ name, tree: t.doc.value }); // 短い URL (だめなら長い URL、10-26 夜オーナー OK)
  track("tree-recipe:url");
  pop.value = false; share.value = false;
  say(!ok ? tr("コピーできませんでした", "Couldn't copy") : short ? tr("今の木の短い URL をコピーしました (開いた人はこの木で始まる)", "Copied a short URL for this tree (opening it starts with this tree)") : tr("今の木の URL をコピーしました (開いた人はこの木で始まる)", "Copied a URL for this tree (opening it starts with this tree)"));
}
/** レシピの行の × を押した行 (その行の中で「消しますか?」、別の画面へ行かない) */
const askDel = ref<string | null>(null);
function del(r: TreeRecipe): void {
  removeTreeRecipe(r.id); // 開いている木の行なら、木はそのままで (未保存) に戻る (removeTreeRecipe が今のレシピを外す)
  track("tree-recipe:delete");
  askDel.value = null;
  say(tr(`「${r.name}」を消しました`, `Deleted "${r.name}"`));
}
/** シェアの小窓 (短い URL をコピー・X に出す) */
const share = ref(false);
async function shareX(): Promise<void> {
  // await の後に開くとブラウザに止められるので、押した時に開いてから行き先を入れる (スパムシミュの X シェアと同じ intent、share.ts の xIntentUrl)
  const w = window.open("", "_blank");
  const name = currentTreeRecipe.value?.name ?? defaultName();
  const url = await treeShortUrl({ name, tree: t.doc.value });
  track("tree-recipe:x");
  share.value = false;
  const to = xIntentUrl(url, tr(`ExileDesk のシミュレーターで組んだクラフトの道「${name}」`, `My craft route on ExileDesk Simulator: "${name}"`));
  if (w) w.location.href = to; else window.open(to, "_blank");
}
/** 小窓 (レシピ・名前・シェア) を全部閉じる */
function closeAll(): void { pop.value = false; naming.value = false; share.value = false; askDel.value = null; }
function onDown(e: PointerEvent): void { if ((pop.value || naming.value || share.value) && root.value && !root.value.contains(e.target as Node)) closeAll(); }
/**
 * Ctrl+S (Mac は Cmd+S) = 保存 (ブラウザの「ページを保存」は止める。文字の欄に入力中でも効く)。PC のツリーの帯だけ (スマホ・完成形の設定の右端の「レシピ ▾」だけの帯では効かない)。
 * 10-26 オーナー「コントロールSだっけホットキー保存させよう」
 */
const phone = usePhone();
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && (pop.value || naming.value || share.value)) { closeAll(); e.stopImmediatePropagation(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s" && !bare.value && !phone.value && !t.goalInline.value && !t.goalPage.value) { e.preventDefault(); save(); }
}
// 小窓を開いた時に向きと高さを測る (placePop)
watch([pop, naming, share], ([a, b, c]) => { if (a || b || c) placePop(); });
onMounted(() => { window.addEventListener("pointerdown", onDown, true); window.addEventListener("keydown", onKey, true); void seedDevRecipes(); });
onBeforeUnmount(() => { window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("keydown", onKey, true); clearTimeout(noteT); });
</script>

<template>
  <span ref="root" data-tree-recipe-bar class="relative flex min-w-0 flex-wrap items-center gap-1.5">
    <input v-if="renaming && !bare" ref="nameInput" data-tree-recipe-name-input :value="currentTreeRecipe?.name ?? defaultName()" class="h-8 w-56 max-md:order-last max-md:w-full rounded border border-amber-400/60 bg-black/50 px-1.5 text-[13px] font-bold outline-none" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" @keydown.esc.stop="renaming = false" @blur="endRename(($event.target as HTMLInputElement).value)" />
    <!-- 名前 (保存前は「(未保存)」、押すと保存したレシピは名前を変える・まだなら名前を付けて保存)。… で切らず折り返す -->
    <button v-else-if="!bare" type="button" data-tree-recipe-name class="flex min-w-0 items-center gap-1.5 rounded px-1 text-left text-[13px] hover:bg-white/[0.06]" :class="flat ? 'h-10 max-w-[240px] max-[359px]:max-w-none max-[359px]:basis-full max-[359px]:justify-center' : 'min-h-8'" :title="currentTreeRecipe ? tr('名前を変える', 'Rename') : tr('名前を付けて保存', 'Save with a name')" @click="onName">
      <b class="min-w-0 break-words" :class="currentTreeRecipe ? '' : 'font-normal opacity-70'">{{ currentTreeRecipe?.name ?? tr("(未保存)", "(Unsaved)") }}</b>
      <span v-if="dirty" data-tree-recipe-dirty class="size-2 shrink-0 rounded-full bg-amber-400" :title="tr('保存していない変更がある', 'Unsaved changes')" />
    </button>
    <!-- 保存・レシピ・シェア (スマホは差し込みのメモ・白紙も) を 1 組にして一緒に折り返す (名前が長い・幅が狭い時は名前だけ 1 行目)。PC の列は平たい小さなボタン (SMALL) で 248px に 1 行 -->
    <span class="flex max-w-full shrink-0 flex-wrap items-center justify-center gap-1">
      <button v-if="!bare" type="button" data-tree-recipe-save :class="btn" :aria-expanded="naming" :title="currentTreeRecipe ? tr('開いているレシピに上書き保存 (Ctrl+S)', 'Save to the open recipe (Ctrl+S)') : tr('名前を付けて保存 (Ctrl+S)', 'Save with a name (Ctrl+S)')" @click="save"><Icon v-if="flat" name="save" class="size-4" />{{ tr("保存", "Save") }}</button>
      <button type="button" data-tree-recipe-menu :class="menuOnly ? 'g-btn sm inline-flex shrink-0 items-center gap-1' : btn" :aria-expanded="pop" @click="pop = !pop; naming = false; share = false"><Icon v-if="flat" name="book" class="size-4" />{{ tr("レシピ", "Recipes") }} ▾</button>
      <button v-if="!bare" type="button" data-tree-recipe-share :class="btn" :aria-expanded="share" :title="tr('この木を人に見せる (短い URL をコピー・X に出す)', 'Share this tree (copy a short URL or post to X)')" @click="share = !share; pop = false; naming = false"><Icon v-if="flat" name="share" class="size-4" />{{ tr("シェア", "Share") }}</button>
      <slot name="after" />
    </span>
    <!-- 開いたレシピにこの版に無い手 (本番で開くとそこから先を組めない。× で閉じる、S-103b) -->
    <span v-if="!bare && sharedNewer.length" data-tree-recipe-newer class="flex min-w-0 max-w-full items-start gap-1 break-words rounded bg-rose-950/90 px-2 py-0.5 text-[12px] text-rose-100">{{ tr(`このレシピにはまだこの版に無い手 (${sharedNewer.join("・")}) があり、そこから先は組めない (次の版で開ける)`, `This recipe uses a craft this version doesn't have yet (${sharedNewer.join(", ")}); the tree stops there (opens in a later version)`) }}<button type="button" data-tree-recipe-newer-close class="shrink-0 px-1 opacity-80 hover:opacity-100" :aria-label="tr('閉じる', 'Close')" @click="closeNewer">×</button></span>
    <span v-if="note" data-tree-recipe-note class="pointer-events-none min-w-0 max-w-full break-words rounded bg-emerald-900/90 px-2 py-0.5 text-[12px] text-emerald-100">{{ note }}</span>

    <!-- 小窓の置き場: PC の列では帯の幅 (列の 248px) に収める、スマホの上の帯・完成形の設定の右端は前の幅 (10-27 オーナー「切れる。枠内で出すように」) -->
    <!-- 名前を付けて保存 (欄には最初からベースの名前と日時、そのまま保存でその名前) -->
    <div v-if="naming" data-tree-recipe-save-pop :class="popPlace" :style="{ maxHeight: `${popV.max}px` }" class="absolute z-40 flex flex-col gap-1.5 overflow-y-auto rounded-lg border border-[var(--exile-color-border-brass)]/60 bg-[#14110d] p-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
      <p class="opacity-70">{{ tr("名前を付けて保存", "Save with a name") }}</p>
      <input ref="saveInput" v-model="saveName" data-tree-recipe-save-name type="text" spellcheck="false" autocomplete="off" class="h-8 min-w-0 rounded border border-amber-400/60 bg-black/50 px-2 text-[13px] outline-none" @keydown.enter.prevent="saveNamed" @keydown.esc.stop="naming = false" />
      <span class="flex justify-end gap-1.5">
        <button type="button" data-tree-recipe-save-cancel :class="SMALL" @click="naming = false">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-recipe-save-ok class="g-btn sm" @click="saveNamed">{{ tr("保存", "Save") }}</button>
      </span>
    </div>
    <!-- シェア: 短い URL をコピー・X に出す (窓の中の「URL をコピー」はここへ寄せた) -->
    <div v-if="share" data-tree-recipe-share-pop :class="popPlace" :style="{ maxHeight: `${popV.max}px` }" class="absolute z-40 flex flex-col gap-1.5 overflow-y-auto rounded-lg border border-[var(--exile-color-border-brass)]/60 bg-[#14110d] p-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
      <p class="opacity-70">{{ tr("開いた人はこの木で始まる", "Whoever opens it starts with this tree") }}</p>
      <span class="flex flex-wrap gap-1.5">
        <button type="button" data-tree-recipe-copy-url class="g-btn sm inline-flex items-center gap-1" @click="copyUrl"><Icon name="link" class="size-3.5" />{{ tr("URL をコピー", "Copy URL") }}</button>
        <button type="button" data-tree-recipe-x class="g-btn sm" @click="shareX">{{ tr("X に出す", "Post to X") }}</button>
      </span>
    </div>
    <div v-if="pop" data-tree-recipe-pop :class="popPlace" :style="{ maxHeight: `${popV.max}px` }" class="absolute z-40 flex flex-col gap-1.5 overflow-y-auto rounded-lg border border-[var(--exile-color-border-brass)]/60 bg-[#14110d] p-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
      <p class="opacity-60">{{ tr("保存したレシピから開く", "Open a saved recipe") }}</p>
      <p v-if="!recent.length" class="py-1 opacity-50">{{ tr("まだありません", "None yet") }}</p>
      <!-- 1 行 = ベースの絵 (空の木は空の印)・名前・ベース · 狙いの数と主な狙い · ✦ の数・日時 (10-23 オーナー「視覚的に管理しやすく」、要約は recipe-summary.ts)。右の × で消す (その行の中で確かめる) -->
      <div v-for="r in recent" :key="r.id" data-tree-recipe-row class="flex min-w-0 flex-wrap items-center gap-1 rounded hover:bg-white/[0.06]">
        <template v-if="askDel === r.id">
          <span class="min-w-0 basis-full break-words px-1.5 pt-2 text-rose-100">{{ tr(`「${r.name}」を消しますか?`, `Delete "${r.name}"?`) }}</span>
          <button type="button" data-tree-recipe-del-ok class="g-btn-red mb-1.5 ml-auto min-h-8 shrink-0 px-2 text-[12px]" @click="del(r)">{{ tr("消す", "Delete") }}</button>
          <button type="button" data-tree-recipe-del-cancel class="mb-1.5 mr-1" :class="SMALL" @click="askDel = null">{{ tr("やめる", "Cancel") }}</button>
        </template>
        <template v-else>
          <button type="button" data-tree-recipe-open class="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left" @click="open(r)">
            <img v-if="sum(r).art" :src="sum(r).art!" alt="" class="size-9 shrink-0 object-contain" draggable="false" />
            <span v-else data-tree-recipe-empty class="flex size-9 shrink-0 items-center justify-center rounded bg-white/[0.06] text-[10px] opacity-60">{{ sum(r).empty ? tr("空", "Empty") : "" }}</span>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="break-words" :class="r.id === currentTreeRecipe?.id ? 'font-bold text-amber-200' : ''">{{ r.name }}</span>
              <span data-tree-recipe-sum class="break-words text-[11px] opacity-70">{{ sum(r).empty ? tr("ベースなし", "No base") : [sum(r).base, sum(r).aims ? tr(`狙い ${sum(r).aims}`, `${sum(r).aims} target(s)`) : "", sum(r).first].filter(Boolean).join(" · ") }}</span>
              <span class="flex gap-2 text-[11px]"><span v-if="sum(r).marks" class="text-mod-fractured">✦ {{ sum(r).marks }}</span><span class="tabular-nums opacity-50">{{ fmtDate(touchedAtTree(r)) }}</span></span>
            </span>
          </button>
          <button type="button" data-tree-recipe-del class="flex size-8 shrink-0 items-center justify-center rounded text-white/40 hover:bg-rose-900/40 hover:text-rose-200" :title="tr('このレシピを消す', 'Delete this recipe')" @click="askDel = r.id"><Icon name="x" class="size-3.5" /></button>
        </template>
      </div>
      <span class="flex items-center gap-1.5">
        <input v-model="url" data-tree-recipe-url type="text" inputmode="url" spellcheck="false" autocomplete="off" class="h-8 min-w-0 flex-1 rounded border border-white/15 bg-black/40 px-2 outline-none placeholder:opacity-45 focus:border-amber-400/60" :placeholder="tr('共有されたレシピの URL を貼る', 'Paste a shared recipe URL')" @paste="onPaste" @keydown.enter.prevent="openUrl" />
        <button type="button" class="g-btn sm" :disabled="!url.trim()" @click="openUrl">{{ tr("開く", "Open") }}</button>
      </span>
      <p v-if="urlNote" class="text-amber-200">{{ urlNote }}</p>
      <div class="flex flex-wrap gap-1.5 border-t border-white/10 pt-1.5">
        <button v-if="!bare" type="button" data-tree-recipe-save-as class="g-btn sm" @click="saveAs">{{ tr("別名で保存", "Save as") }}</button>
        <button type="button" data-tree-recipe-list class="g-btn sm ml-auto" @click="pop = false; openRecipesPage()">{{ tr("レシピの一覧へ", "All recipes") }}</button>
      </div>
    </div>
  </span>
</template>
