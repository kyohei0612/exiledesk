<!--
  TreeBoxModBtn.vue — 箱の側の「MOD 一覧」のボタン (S-145h、スイッチ treeBoxModList)。
  次に打つ手の窓のカードの下 (TreeHandShelf) と、箱の大きい写しの窓 (SimTreePage の data-tree-pop) に置く。
  押すと共通の MOD 一覧の窓がその箱の品で開く (窓は TreeBoxModList)。見るだけで木には何もしない。スイッチが閉じている間は出さない
-->
<script setup lang="ts">
import { flag } from "../../../web/release-flags";
import { tr } from "../../../i18n/lang";
import { openBoxMods } from "./tree-box-mods";

const props = defineProps<{ boxId: string }>();
const emit = defineEmits<{ opened: [] }>();
const ON = flag("treeBoxModList");
function open(): void { openBoxMods(props.boxId); emit("opened"); }
</script>

<template>
  <button v-if="ON" type="button" data-tree-box-modlist class="g-btn sm shrink-0 whitespace-nowrap"
    :title="tr('この箱のアイテムに次の手で付く MOD と確率を見る (見るだけ、木は変わらない)', 'See which mods the next craft can roll on this box’s item, with odds (view only; the tree does not change)')"
    @click.stop="open">{{ tr("MOD 一覧", "Mod list") }}</button>
</template>
