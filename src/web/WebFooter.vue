<!--
  WebFooter.vue — Web 版の一番下の決まり事 (WebApp.vue から分けた、2026-10-18: 要望・バグを送るのページにも同じ物を出す)
-->
<script setup lang="ts">
import { tr } from "../i18n/lang";
</script>

<template>
    <!-- 決まり事 (2026-10-07、2026-10-10 から画面に貼り付けずクラフトステージの一番下): 非公式のファンサイトであること・素材の権利・相場と確率の出どころ。1 行だけ -->
    <footer data-rec-part="footer" class="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--exile-color-border-subtle)] px-4 py-2 text-[10px] opacity-50">
      <span>{{ tr("ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。", "ExileDesk is an unofficial fan site and is not affiliated with or endorsed by Grinding Gear Games. Path of Exile 2 and all related names and images are the property of Grinding Gear Games.") }}</span>
      <span>{{ tr("相場は", "Market prices from") }} <a href="https://poe2scout.com/" target="_blank" rel="noopener" class="underline">poe2scout</a>{{ tr("、確率はゲームのデータからの推定で、結果を保証するものではありません。", ". Chances are estimates from game data; results are not guaranteed.") }}</span>
      <!-- 使い方の記録の案内と切り替えはプライバシーポリシーの「4. 記録を止める方法」へ (2026-10-17 オーナー「ちょっと目立って嫌だ」) -->
      <span class="ml-auto">{{ tr("協賛の枠には PR と表示します", "Sponsored slots are marked PR") }}</span>
      <!-- よくある一番下のリンク (2026-10-12 広告の審査の前に。中身は public/about.html・privacy.html の単独のページ) -->
      <a href="/guide" class="underline">{{ tr("使い方", "Guide") }}</a>
      <a :href="tr('/craft-basics', '/en/craft-basics')" class="underline">{{ tr("クラフト入門", "Crafting basics") }}</a>
      <a :href="tr('/bases/', '/en/bases/')" class="underline">{{ tr("ベース一覧", "Bases") }}</a>
      <a :href="tr('/about', '/en/about')" class="underline">{{ tr("ExileDesk について", "About") }}</a>
      <a :href="tr('/contact', '/en/contact')" class="underline">{{ tr("お問い合わせ", "Contact") }}</a>
      <a :href="tr('/privacy', '/en/privacy')" class="underline">{{ tr("プライバシーポリシー", "Privacy Policy") }}</a>
    </footer>
</template>
