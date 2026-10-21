<!--
  SimRecipeBar.vue — シミュレーターの右上のレシピの帯 (2026-10-21 オーナー「レシピ消したり上書きしたり色々できるようにしないとそもそも作りがお粗末、
  シェアもない。しっかり作りこんでくれ」。前は「レシピ ▾」の吹き出しに保存・一覧・ファイルを全部詰めていた)。

  2026-10-20 オーナー OK (棚卸し sim-controls.md の 1): 道具の帯は [今のレシピの名前 ● 未保存 ▾] 1 つに、押すと下の物を並べた吹き出し。
  [保存]       … 開いているレシピがあれば上書き。無ければ名前を聞いて新しく保存
  [別名で保存] … 開いているレシピがある時だけ。名前を聞いて新しく保存 (元のレシピはそのまま)
  [共有]       … 今の状態を URL にしてコピー / X に投稿 (URL の # に全部乗る。開いた人はそのレシピで始まる)
  [レシピの一覧] … レシピのページ (一覧・名前替え・複製・消す・ファイル)
  [最初から]   … 前の「リセット」(2 回押し。選んだ MOD・工程・結果を消す、入れた値段は残る)。消す操作を帯に常に出さない
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import Icon from "../../components/ui/Icon.vue";
import { currentRecipe, overwriteRecipe, saveNewRecipe, sameContent, simNow } from "../../state/simulator/sim-recipe-store";
import { openRecipesPage } from "../../web/page";
import { fmtDate, recipeShareText, recipeShareUrl, recipeXUrl, shareRecipeX } from "./recipe-share";
import { craftStage as s } from "../../state/craft-stage";
import { track } from "../../utils/track";
import { tr } from "../../i18n/lang";

const props = defineProps<{ /** 「最初から」を 1 回押して、もう一度押すと消える状態 */ resetArmed: boolean }>();
const emit = defineEmits<{ reset: [] }>();
const now = computed(() => simNow.value);
/** 保存していない変更がある (開いているレシピと中身が違う。無ければ狙いを 1 つでも選んだら) */
const dirty = computed(() => {
  const n = now.value;
  if (!n) return false;
  const ses = n.session();
  return currentRecipe.value ? !sameContent(ses, currentRecipe.value.session) : ses.targets.length > 0;
});

/** 小さな吹き出し (名前を聞く / 共有)。外を押す・Esc で閉じる */
const pop = ref<"menu" | "name" | "share" | null>(null);
const box = ref<HTMLElement | null>(null);
function outside(e: Event): void {
  if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.value?.contains(e.target as Node)) close();
}
function openPop(p: "menu" | "name" | "share"): void {
  if (pop.value === p) { close(); return; }
  const had = pop.value != null;
  pop.value = p;
  if (!had) void nextTick(() => { document.addEventListener("pointerdown", outside, true); document.addEventListener("keydown", outside); });
}
/** 吹き出しの「最初から」: 1 回目は押し直しを待つ (吹き出しは開いたまま)、2 回目で消して閉じる */
function reset(): void { const armed = props.resetArmed; emit("reset"); if (armed) close(); }
function close(): void {
  pop.value = null;
  document.removeEventListener("pointerdown", outside, true);
  document.removeEventListener("keydown", outside);
}
onBeforeUnmount(close);

/** 終わった時の一言 (2 秒) */
const note = ref("");
let noteT = 0;
function say(t: string): void { note.value = t; clearTimeout(noteT); noteT = window.setTimeout(() => { note.value = ""; }, 2500); }

const defaultName = (): string => `${now.value?.baseJa() ?? s.base.value} ${fmtDate(Date.now())}`;
const name = ref("");
const nameEl = ref<HTMLInputElement | null>(null);
/** 保存: 開いているレシピがあれば上書き、無ければ名前を聞く */
function save(): void {
  const n = now.value;
  if (!n) return;
  if (currentRecipe.value) {
    if (!dirty.value) { say(tr("保存済みです", "Already saved")); return; }
    overwriteRecipe(currentRecipe.value.id, n.session(), n.baseJa());
    track("recipe:overwrite");
    say(tr(`「${currentRecipe.value.name}」に上書きしました`, `Saved to "${currentRecipe.value.name}"`));
    return;
  }
  askName();
}
function askName(): void {
  name.value = currentRecipe.value ? `${currentRecipe.value.name}${tr(" (2)", " (2)")}` : defaultName();
  openPop("name");
  void nextTick(() => nameEl.value?.select());
}
function saveAs(): void {
  const n = now.value;
  if (!n) return;
  const r = saveNewRecipe(name.value.trim() || defaultName(), n.baseJa(), n.session());
  track("recipe:save");
  close();
  say(tr(`「${r.name}」で保存しました`, `Saved as "${r.name}"`));
}

/** 共有: 今の状態の URL (吹き出しを開いた時に作る) */
const shareName = computed(() => currentRecipe.value?.name ?? defaultName());
const url = ref("");
const text = ref("");
async function openShare(): Promise<void> {
  openPop("share");
  const n = now.value;
  if (!n || pop.value !== "share") return;
  const r = { name: shareName.value, baseJa: n.baseJa(), session: n.session() };
  url.value = await recipeShareUrl(r);
  text.value = recipeShareText(r);
}
async function copyUrl(): Promise<void> {
  const ok = await navigator.clipboard.writeText(url.value).then(() => true, () => false);
  track("recipe:url");
  close();
  say(ok ? tr("URL をコピーしました (開いた人はこのレシピで始まる)", "URL copied (opening it starts this recipe)") : tr("コピーできませんでした", "Couldn't copy"));
}
function toX(e: MouseEvent): void {
  shareRecipeX(e, text.value, url.value, s.base.value);
  track("recipe:x");
  close();
}
</script>

<template>
  <span ref="box" data-recipe-bar class="relative inline-flex items-center gap-1.5">
    <!-- 今のレシピ ▾ (押すと保存・共有・一覧・最初からの吹き出し) -->
    <button type="button" data-recipe-current class="g-btn sm inline-flex max-w-[16rem] items-center gap-1.5 max-md:min-h-10" :aria-expanded="pop === 'menu'" :title="tr('レシピ (保存・共有・一覧・最初から)', 'Recipe (save, share, list, start over)')" @click="openPop('menu')">
      <Icon name="book" class="size-4" />
      <span class="min-w-0 truncate">{{ currentRecipe ? currentRecipe.name : tr("レシピ", "Recipes") }}</span>
      <span v-if="dirty" data-recipe-dirty class="inline-flex shrink-0 items-center gap-1 text-[11px] font-normal text-amber-300" :title="tr('保存していない変更がある', 'Unsaved changes')"><span class="size-1.5 rounded-full bg-amber-400" />{{ tr("未保存", "Unsaved") }}</span>
      <Icon :name="pop === 'menu' ? 'chevron-up' : 'chevron-down'" class="size-4 shrink-0" />
    </button>
    <div v-if="pop === 'menu'" data-recipe-menu class="absolute right-0 top-full z-40 mt-1 grid w-[14rem] gap-0.5 rounded-xl border border-[var(--exile-color-border-brass)] bg-[#14110d] p-1.5 text-[13px] shadow-2xl max-md:fixed max-md:inset-x-3 max-md:top-16 max-md:w-auto">
      <button type="button" data-recipe-save class="g-plain flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06] disabled:opacity-40 max-md:min-h-11" :disabled="!now" @click="close(); save()"><Icon name="save" class="size-4" />{{ currentRecipe ? tr(`「${currentRecipe.name}」に保存`, `Save to “${currentRecipe.name}”`) : tr("名前を付けて保存", "Save with a name") }}</button>
      <button v-if="currentRecipe" type="button" data-recipe-save-as class="g-plain flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06] max-md:min-h-11" @click="askName"><Icon name="save" class="size-4 opacity-0" />{{ tr("別名で保存", "Save as") }}</button>
      <button type="button" data-recipe-share class="g-plain flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06] disabled:opacity-40 max-md:min-h-11" :disabled="!now" @click="openShare"><Icon name="share" class="size-4" />{{ tr("共有 (URL / X)", "Share (URL / X)") }}</button>
      <button type="button" data-recipe-list class="g-plain flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.06] max-md:min-h-11" @click="close(); openRecipesPage()"><Icon name="book" class="size-4" />{{ tr("レシピの一覧 →", "Recipe list →") }}</button>
      <button type="button" data-recipe-reset class="g-plain mt-1 flex items-center gap-2 rounded-md border-t border-white/10 px-2 py-1.5 text-left max-md:min-h-11" :class="resetArmed ? 'bg-rose-500/20 font-bold text-rose-200' : 'hover:bg-white/[0.06]'" :title="tr('最初 (ベースを選ぶ所) に戻す。選んだ MOD・工程・結果を消す (入れた値段は残る)', 'Back to the start (choose a base). Clears mods, steps and results (prices stay)')" @click="reset"><Icon name="rotate" class="size-4" />{{ resetArmed ? tr("もう一度押すと消える", "Click again to clear") : tr("最初から", "Start over") }}</button>
    </div>
    <span v-if="note" data-recipe-note class="absolute right-0 top-full z-40 mt-1 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[12px] text-emerald-200 shadow-lg">{{ note }}</span>

    <!-- 名前を聞く (新しく保存・別名で保存) -->
    <div v-if="pop === 'name'" data-recipe-name-pop class="absolute right-0 top-full z-40 mt-1 w-[22rem] rounded-xl border border-[var(--exile-color-border-brass)] bg-[#14110d] p-3 text-[13px] shadow-2xl max-md:fixed max-md:inset-x-3 max-md:top-16 max-md:w-auto">
      <p class="mb-1.5 font-bold">{{ currentRecipe ? tr("別名で保存", "Save as") : tr("名前を付けて保存", "Save with a name") }}</p>
      <div class="flex items-center gap-2">
        <input ref="nameEl" v-model="name" data-recipe-name class="h-8 min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 outline-none focus:border-amber-400/60 max-md:h-11" :placeholder="tr('レシピの名前', 'Recipe name')" @keydown.enter.prevent="saveAs" />
        <button type="button" data-recipe-name-ok class="h-8 shrink-0 rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 font-bold text-amber-100 hover:bg-amber-500/30 max-md:h-11" @click="saveAs">{{ tr("保存", "Save") }}</button>
      </div>
    </div>

    <!-- 共有 -->
    <div v-if="pop === 'share'" data-recipe-share-pop class="absolute right-0 top-full z-40 mt-1 w-[24rem] rounded-xl border border-[var(--exile-color-border-brass)] bg-[#14110d] p-3 text-[13px] shadow-2xl max-md:fixed max-md:inset-x-3 max-md:top-16 max-md:w-auto">
      <p class="font-bold">{{ tr("今の状態を共有", "Share the current state") }}</p>
      <p class="mb-2 truncate text-[12px] opacity-60">{{ shareName }}<template v-if="dirty && currentRecipe"> · {{ tr("保存していない変更も入る", "includes unsaved changes") }}</template></p>
      <div class="flex gap-2">
        <button type="button" data-recipe-copy-url class="g-btn sm inline-flex flex-1 items-center justify-center gap-1.5 max-md:min-h-11" :disabled="!url" @click="copyUrl"><Icon name="link" class="size-4" />{{ tr("URL をコピー", "Copy URL") }}</button>
        <a data-recipe-x class="g-btn sm inline-flex flex-1 items-center justify-center gap-1.5 max-md:min-h-11" :class="url ? '' : 'pointer-events-none opacity-40'" :href="url ? recipeXUrl(text, url) : undefined" target="_blank" rel="noopener" @click="toX">{{ tr("X に投稿", "Post on X") }}</a>
      </div>
      <p class="mt-2 text-[11px] opacity-50">{{ tr("URL にレシピが全部入っています。開いた人はこのレシピでシミュレーターが始まります", "The whole recipe is in the URL. Opening it starts the simulator with this recipe") }}</p>
    </div>
  </span>
</template>
