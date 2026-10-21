<!--
  SimTreePage.vue — クラフトの道 (ツリー) のページ (?page=sim-tree、2026-10-22 オーナー OK、開発版だけ)。
  入口 (web-page.ts の treePage・web/page.ts・WebApp.vue) はジン部長、中身はシミュ部長 (これは型を通すための仮の部品。中身はシミュ部長が上書きする)。
-->
<script setup lang="ts">
import { tr } from "../../../i18n/lang";
</script>

<template>
  <section data-tree-page class="min-w-0 flex-1 p-4 max-md:px-2">
    <h1 class="g-tabbar g-brush flex min-w-0 items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[15px] tracking-[0.18em] max-md:tracking-[0.04em] text-[var(--exile-color-text-title)]">{{ tr("クラフトの道 (ツリー)", "Craft route tree") }}</h1>
  </section>
</template>
