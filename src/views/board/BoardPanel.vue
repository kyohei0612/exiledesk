<!--
  BoardPanel.vue — 掲示板 (Web 版だけ、2026-10-16 最初の段。docs/roadmap-2026-10.md「掲示板の作り」)。
  クラフトステージの「エミュレーター」「シミュレーター」の並びの「掲示板」のタブで出す。
  1 つのタイムライン (新しい順、スレッド無し)。書き込み = 名前 (空なら名無しのエグザイル) + タグ 1 つ + 文字。
  当たりの速報 (エミュレーターでクソレアの線より下の T1 を引いた札、services/board/rare-hit.ts) は書き込みと別の見た目。
  時刻・「◯分前」・件数・閲覧数・人ごとの印は出さない (オーナー「過疎ってるって思われたくない」)。サーバーは server/live の board.ts
  2 段目 (2026-10-16 オーナー「掲示板強化」): エミュレーターの今のアイテムを貼る (BoardAttCard)。
  いいねはあり、返信は無し (オーナー「返信こない時の悲壮感あるから」。サーバーの parent は残してある)
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { baseNameOf, isEn, modText, tr } from "../../i18n/lang";
import { craftStage } from "../../state/craft-stage";
import { iconOfKey, nameOfKey } from "../../state/craft-stage-shelf";
import { freshItem } from "../../services/craft-stage/run-plan";
import { makeStageMod, withValues } from "../../services/craft-stage/stage-core";
import { fmtChance } from "../../utils/format-pct";
import Disclosure from "../../components/ui/Disclosure.vue";
import Icon from "../../components/ui/Icon.vue";
import BoardAttCard from "./BoardAttCard.vue";
import type { StageItem } from "../../services/craft-stage/types";
import { BOARD_HITS_ENABLED, BOARD_TAGS, boardHitsOn, boardName, errText, fetchBoard, likedIds, MAX_NAME, MAX_TEXT, NAMELESS, rememberName, reportItem, sendPost, setBoardHits, tagLabel, toggleLike, type BoardAtt, type BoardHit, type BoardItem, type BoardPostItem, type BoardTag } from "../../services/board/board-api";

/** 一覧の絞り込み (null = すべて) */
const items = ref<BoardItem[]>([]);
const more = ref(false);
const state = ref<"loading" | "ready" | "error">("loading");
async function load(append = false): Promise<void> {
  if (!append) state.value = "loading";
  try {
    const r = await fetchBoard(null, append ? items.value[items.value.length - 1]?.id ?? null : null);
    // 自分が今書いた物 (キャッシュの 45 秒の間は一覧に無い) は頭に残す
    const mine = append ? [] : posted.value.filter((p) => !r.items.some((x) => x.id === p.id));
    items.value = append ? [...items.value, ...r.items.filter((x) => !items.value.some((y) => y.id === x.id))] : [...mine, ...r.items];
    more.value = r.more;
    state.value = "ready";
  } catch {
    if (!append) state.value = "error";
  }
}
onMounted(() => void load());

// ---- 書く ----
const name = ref(boardName.value);
const tag = ref<BoardTag | null>(null);
const text = ref("");
const website = ref(""); // bot よけ (人は見えない)
const sending = ref(false);
const error = ref("");
const posted = ref<BoardItem[]>([]);
const textLen = computed(() => [...text.value].length);
const canSend = computed(() => !sending.value && text.value.trim().length > 0 && textLen.value <= MAX_TEXT);
async function send(): Promise<void> {
  if (!canSend.value) return;
  sending.value = true;
  error.value = "";
  const nm = name.value.trim();
  const r = await sendPost({ name: nm, tag: tag.value ?? undefined, text: text.value.trim(), website: website.value, att: attach.value });
  sending.value = false;
  if (!r.item) { error.value = errText(r.error ?? "?"); return; }
  boardName.value = nm;
  rememberName(nm);
  posted.value = [r.item, ...posted.value];
  items.value = [r.item, ...items.value];
  tag.value = null;
  text.value = "";
  attach.value = null;
}

// ---- アイテムを貼る (エミュレーターの今のアイテムを縮めて。MOD は 12 個まで、未発現は外す) ----
const attach = ref<BoardAtt | null>(null);
function attOf(it: StageItem): BoardAtt {
  const mods = [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed).slice(0, 12);
  return {
    b: it.base, i: it.itemLevel, r: it.rarity,
    m: mods.map((m) => [m.modId, m.tierIndex, [...m.values], m.side === "prefix" ? "p" : "s", `${m.fractured ? "f" : ""}${m.desecrated ? "d" : ""}`]),
    ...(it.corrupted ? { c: 1 as const } : {}),
  };
}
/** 貼れる時 (エミュレーターにアイテムがある) */
const canAttach = computed(() => !!craftStage.item.value);
function attachNow(): void { const it = craftStage.item.value; if (it) attach.value = attOf(it); }

// ---- いいね (押し直しで外す。数は手元で足し引き。0 の時は数を出さない) ----
// 返信は無し (2026-10-16 オーナー「いいね付けてもいいかも、返信は無くていい、返信こない時の悲壮感あるから」)
const liking = ref<Set<string>>(new Set());
/** 一覧は 45 秒ためるので、自分が押した物は最低 1 にする */
const likeCount = (p: BoardPostItem): number => Math.max(p.likes ?? 0, likedIds.value.has(p.id) ? 1 : 0);
async function like(p: BoardPostItem): Promise<void> {
  if (liking.value.has(p.id)) return;
  liking.value = new Set([...liking.value, p.id]);
  const r = await toggleLike(p.id);
  if (r) p.likes = r.likes;
  const next = new Set(liking.value); next.delete(p.id); liking.value = next;
}

// ---- 通報 (押すと確かめの 2 つのボタン) ----
const asking = ref<string | null>(null);
const reported = ref<Set<string>>(new Set());
async function report(id: string): Promise<void> {
  asking.value = null;
  if (await reportItem(id)) reported.value = new Set([...reported.value, id]);
}

// ---- 当たりの札の文 (見る人の画面のデータで作る。サーバーには形だけ) ----
interface HitView { base: string; cur: string; icon: string; n: number; mod: string; tier: string; pct: string }
function hitView(h: BoardHit): HitView | null {
  const data = craftStage.data.value;
  const mod = data?.mods.get(h.modId);
  if (!data || !mod || !mod.tiers[h.ti]) return null;
  try {
    const it = freshItem(data, h.base, h.ilvl);
    const sm = withValues(makeStageMod(mod, "prefix", h.ti, () => 0), mod, () => 0, h.v);
    return { base: baseNameOf(it), cur: nameOfKey(h.cur, null), icon: iconOfKey(h.cur, null), n: h.n, mod: modText(sm), tier: sm.tierName, pct: fmtChance(h.p) };
  } catch { return null; }
}
/** 札ごとの文 (言語・データが変わった時だけ作り直す)。文にできない札 (データが読めていない・今のデータに無い MOD) は出さない */
const hits = computed(() => new Map(items.value.flatMap((it) => (it.kind === "hit" ? [[it.id, hitView(it.hit)] as const] : []))));
const shown = computed(() => items.value.filter((it) => it.kind === "post" || (BOARD_HITS_ENABLED && hits.value.get(it.id))));
</script>

<template>
  <section class="g-panel px-3 py-2 text-[13px]" data-rec-part="board">
    <!-- 決まり・当たりの設定 (タグは無し。2026-10-16 オーナー「タグなくておけ、自由に書き込める感じで」) -->
    <div class="mb-2 flex flex-wrap items-center gap-1">
      <span class="ml-auto flex items-center gap-3 text-[11px] text-[var(--exile-color-text-tertiary)]">
        <label v-if="BOARD_HITS_ENABLED" class="inline-flex cursor-pointer items-center gap-1.5" :title="tr('エミュレーターでとても珍しい T1 を引いた時、名前を出さずにここへ流す', 'When you hit a very rare T1 in the Emulator, post it here anonymously')">
          <input type="checkbox" class="size-4 accent-amber-500" :checked="boardHitsOn" @change="setBoardHits(($event.target as HTMLInputElement).checked)" />{{ tr("自分の当たりを流す", "Share my rare hits") }}
        </label>
        <a href="/board-rules" target="_blank" rel="noopener" class="underline hover:text-[var(--exile-color-text-primary)]">{{ tr("決まり・削除の依頼", "Rules / removal requests") }}</a>
      </span>
    </div>

    <!-- 書く -->
    <form class="relative mb-3 flex flex-col gap-2" @submit.prevent="send">
      <div class="flex flex-wrap items-center gap-2">
        <input v-model="name" :maxlength="MAX_NAME" class="w-44 min-w-0 rounded-md border border-white/15 bg-black/40 px-2 py-1 outline-none focus:border-amber-400/60 max-md:min-h-10 max-md:flex-1" :placeholder="NAMELESS()" :aria-label="tr('名前', 'Name')" />
        <!-- タグは付けたい人だけ (付けなくても書ける。2026-10-16 オーナー「自由に書き込める感じで、ただ自分の文章にタグ付けるのはあり」) -->
        <span class="flex flex-wrap items-center gap-1" role="radiogroup" :aria-label="tr('タグ (なくてもよい)', 'Tag (optional)')">
          <button v-for="t in BOARD_TAGS" :key="t.k" type="button" role="radio" :aria-checked="tag === t.k" class="rounded-full border px-2.5 py-0.5 text-[12px] max-md:min-h-9" :class="tag === t.k ? 'border-amber-300 bg-amber-500/30 font-bold text-amber-50' : 'border-white/20 text-[var(--exile-color-text-secondary)] hover:border-amber-400/60'" @click="tag = tag === t.k ? null : t.k">{{ tr(t.ja, t.en) }}</button>
        </span>
      </div>
      <textarea v-model="text" rows="3" class="w-full resize-y rounded-md border border-white/15 bg-black/40 px-2 py-1.5 outline-none focus:border-amber-400/60" :placeholder="tr('クラフトの相談・自慢・意見など', 'Crafting questions, show-offs, thoughts…')" :aria-label="tr('本文', 'Message')"></textarea>
      <input v-model="website" tabindex="-1" autocomplete="off" class="pointer-events-none absolute left-0 top-0 size-px overflow-hidden opacity-0" aria-hidden="true" />
      <!-- 貼ったアイテム (外すのは ×) -->
      <div v-if="attach" class="flex items-start gap-1">
        <BoardAttCard :att="attach" class="!mt-0 min-w-0 flex-1" />
        <button type="button" class="g-plain grid size-8 shrink-0 place-items-center rounded text-[var(--exile-color-text-tertiary)] hover:bg-white/10" :title="tr('貼ったアイテムを外す', 'Remove the attached item')" @click="attach = null"><Icon name="x" class="size-4" /></button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="error" class="min-w-0 flex-1 truncate text-rose-300" :title="error">{{ error }}</span>
        <button v-else-if="!attach && canAttach" type="button" data-board-attach class="g-btn sm shrink-0 max-md:min-h-10" :title="tr('エミュレーターの今のアイテムを書き込みに貼る', 'Attach the current Emulator item to your post')" @click="attachNow"><span class="max-md:hidden">{{ tr("今のアイテムを貼る", "Attach item") }}</span><span class="md:hidden">{{ tr("アイテムを貼る", "Attach") }}</span></button>
        <span v-if="!error" class="flex-1" />
        <span class="shrink-0 text-[10px] tabular-nums" :class="textLen > MAX_TEXT ? 'text-rose-300' : 'opacity-40'">{{ textLen }} / {{ MAX_TEXT }}</span>
        <button type="submit" class="g-btn-red sm shrink-0 disabled:opacity-40 max-md:min-h-10" :disabled="!canSend">{{ sending ? tr("書き込んでいます…", "Posting…") : tr("書き込む", "Post") }}</button>
      </div>
    </form>

    <!-- タイムライン -->
    <p v-if="state === 'loading'" class="py-8 text-center opacity-50">{{ tr("読み込み中…", "Loading…") }}</p>
    <p v-else-if="state === 'error'" class="flex items-center justify-center gap-3 py-6 text-rose-300">{{ tr("読めなかった", "Couldn't load") }}<button type="button" class="g-btn sm" @click="load()">{{ tr("もう一度", "Retry") }}</button></p>
    <p v-else-if="!shown.length" class="py-8 text-center opacity-50">{{ tr("最初の書き込みをどうぞ", "Be the first to post") }}</p>
    <ul v-else class="flex flex-col">
      <li v-for="it in shown" :key="it.id" class="min-w-0 rounded-md px-2 py-2 odd:bg-white/[0.025]">
        <!-- 当たりの速報 (名前は出さない) -->
        <div v-if="it.kind === 'hit' && hits.get(it.id)" class="flex min-w-0 items-center gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 ring-1 ring-amber-400/30">
          <img v-if="hits.get(it.id)!.icon" :src="hits.get(it.id)!.icon" alt="" class="size-8 shrink-0 object-contain" />
          <p class="min-w-0 flex-1 text-left text-[13px] leading-snug text-amber-100">
            <template v-if="!isEn">誰かが <b>{{ hits.get(it.id)!.base }}</b>に{{ hits.get(it.id)!.cur }} {{ hits.get(it.id)!.n.toLocaleString() }} 回目で <b class="text-amber-50">{{ hits.get(it.id)!.mod }}</b> ({{ hits.get(it.id)!.tier }}、{{ hits.get(it.id)!.pct }}) を引きました</template>
            <template v-else>Someone hit <b class="text-amber-50">{{ hits.get(it.id)!.mod }}</b> ({{ hits.get(it.id)!.tier }}, {{ hits.get(it.id)!.pct }}) on <b>{{ hits.get(it.id)!.base }}</b> with {{ hits.get(it.id)!.cur }} #{{ hits.get(it.id)!.n.toLocaleString() }}</template>
          </p>
        </div>
        <template v-else-if="it.kind === 'post'">
          <div class="flex min-w-0 items-center gap-2">
            <b class="min-w-0 truncate text-amber-200">{{ it.name || NAMELESS() }}</b>
            <span v-if="it.tag" class="shrink-0 rounded-sm bg-white/10 px-1.5 text-[11px] text-[var(--exile-color-text-secondary)]">{{ tagLabel(it.tag) }}</span>
            <span class="ml-auto shrink-0 text-[11px]">
              <template v-if="reported.has(it.id)"><span class="opacity-40">{{ tr("通報しました", "Reported") }}</span></template>
              <template v-else-if="asking === it.id">
                <button type="button" class="g-plain text-rose-300 hover:text-rose-100 max-md:min-h-9 max-md:px-1" @click="report(it.id)">{{ tr("通報する", "Report") }}</button>
                <button type="button" class="g-plain ml-2 opacity-60 hover:opacity-100 max-md:min-h-9 max-md:px-1" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
              </template>
              <button v-else type="button" class="g-plain opacity-30 hover:opacity-80 max-md:min-h-9 max-md:px-1" :title="tr('荒らし・個人情報などを知らせる', 'Report spam, personal info, etc.')" @click="asking = it.id">{{ tr("通報", "Report") }}</button>
            </span>
          </div>
          <p class="mt-0.5 whitespace-pre-wrap break-words text-left leading-relaxed">{{ it.text }}</p>
          <BoardAttCard v-if="it.att" :att="it.att" />
          <button type="button" class="g-plain mt-1 inline-flex min-h-8 items-center gap-1 rounded px-1 text-[13px] hover:bg-white/5" :class="likedIds.has(it.id) ? 'text-rose-300' : 'text-[var(--exile-color-text-tertiary)]'" :aria-pressed="likedIds.has(it.id)" :title="tr('いいね', 'Like')" @click="like(it)">{{ likedIds.has(it.id) ? "♥" : "♡" }}<span v-if="likeCount(it)" class="text-[12px] tabular-nums">{{ likeCount(it) }}</span></button>
        </template>
      </li>
    </ul>
    <Disclosure v-if="state === 'ready' && more" :open="false" bar @update:open="load(true)" />
    <div v-else class="g-list-end" aria-hidden="true" />
  </section>
</template>
