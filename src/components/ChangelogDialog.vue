<!--
  ChangelogDialog.vue — 更新内容 (更新した後に 1 回だけ) と 更新履歴 (バージョンを押した時) の窓 (2026-10-10)。
  中身と出す決まりは state/changelog.ts。アプリ (App.vue) と Web (WebApp.vue) の両方に置く
-->
<script setup lang="ts">
import { computed } from "vue";
import { APP_VERSION, CHANGELOG, changelogNew, changelogOpen } from "../state/changelog";
import { tr, isEn } from "../i18n/lang";
import ModalShell from "./ui/ModalShell.vue";
import { feedbackReplies, imageAskFor, markRepliesSeen } from "../state/feedback-replies";

const list = computed(() => (changelogOpen.value === "new" ? changelogNew.value : CHANGELOG.filter((e) => e.items.length)));
/** 要望・バグへの返事 (今回の更新の窓の一番上。2026-10-11) */
const replies = computed(() => (changelogOpen.value === "new" ? feedbackReplies.value : []));
const close = (): void => { if (changelogOpen.value === "new") markRepliesSeen(); changelogOpen.value = null; };
/** 「画像を下さい」の返事: この窓を閉じて、その要望に画像を送る窓を開く */
const sendImage = (id: string): void => { close(); imageAskFor.value = id; };
</script>

<template>
  <!-- 窓の動きは ModalShell (2026-10-10 オーナー「動きが統一されてない所」: Esc が効いていなかった) -->
  <!-- 幅は画面まで (2026-10-10 スマホで右にはみ出して「閉じる」が見えなかった) -->
  <ModalShell :open="!!changelogOpen" width="w-full max-w-[38rem]" body-class="px-4 py-2" @close="close">
    <template #title>{{ changelogOpen === "new" ? (changelogNew.length ? tr("更新しました", "What's new") : tr("お知らせ", "Notice")) : tr("更新履歴", "Changelog") }}</template>
    <template #header>
      <span class="text-[12px] text-[var(--exile-color-text-tertiary)]">{{ tr("今の版", "Current version") }} v{{ APP_VERSION }}</span>
      <span v-if="isEn" class="text-[11px] text-[var(--exile-color-text-tertiary)]">(notes are in Japanese)</span>
    </template>
    <!-- 送ってくれた要望・バグへの返事 -->
    <section v-if="replies.length" class="mb-2 rounded-md bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-400/30">
      <p class="mb-1 text-[13px] font-bold text-emerald-200">{{ tr("送ってくれた要望・バグへの返事", "Replies to your feedback") }}</p>
      <!-- お礼は決まった一文 (2026-10-11 オーナー「お礼も言ってな、無難な文章で、！付けていい」)。直した中身は返事ごとに書く -->
      <div v-for="r in replies" :key="r.id" class="py-1 text-[12px] leading-relaxed">
        <p class="text-[var(--exile-color-text-tertiary)]">「{{ r.asked }}{{ r.asked.length >= 60 ? "…" : "" }}」</p>
        <p class="text-[var(--exile-color-text-primary)]">{{ tr("ご報告ありがとうございます！", "Thank you for your feedback!") }} {{ isEn && r.en ? r.en : r.reply }}<span v-if="r.version" class="ml-1 text-[11px] text-[var(--exile-color-text-tertiary)]">(v{{ r.version }})</span></p>
        <button v-if="r.askImage" type="button" class="g-btn sm mt-1" @click="sendImage(r.id)">{{ tr("画像を送る", "Send images") }}</button>
      </div>
    </section>
    <section v-for="(e, i) in list" :key="e.v" class="pb-2">
      <div v-if="i > 0" class="g-divider mb-2" />
      <p class="mb-1 flex items-baseline gap-2">
        <b class="text-[14px] text-[var(--exile-color-accent-focus)]">v{{ e.v }}</b>
        <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ e.date }}</span>
      </p>
      <ul class="space-y-0.5 text-[12px] leading-relaxed">
        <li v-for="(it, i) in e.items" :key="i" class="flex gap-2">
          <span class="shrink-0 text-[var(--exile-color-text-tertiary)]">・</span>
          <span class="min-w-0 break-words"><span v-if="it.area" class="mr-1 text-[var(--exile-color-text-secondary)]">{{ it.area }}:</span>{{ it.text }}</span>
        </li>
      </ul>
    </section>
    <template #footer>
      <button v-if="changelogOpen === 'new'" type="button" class="btn-link" @click="changelogOpen = 'all'">{{ tr("これまでの更新履歴", "Full changelog") }}</button>
      <button type="button" class="g-btn sm ml-auto" @click="close">{{ tr("閉じる", "Close") }}</button>
    </template>
  </ModalShell>
</template>
