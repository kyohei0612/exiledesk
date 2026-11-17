<!--
  TreeBoxModList.vue — 箱から開く「MOD 一覧」の窓 (S-145h、スイッチ treeBoxModList)。TreeOverlays に 1 つだけ置く。
  共通の窓 (ModListWin、U-12e) を「箱の品」が選ばれた形で開く: 品 = その箱の見本の 1 人目 (当たりの MOD を選ぶ窓 TreeModPick と同じ sampleOf の seed 1)。
  「付いている」の札は、その品で付いている完成の狙い (aimHeldOn、同じ系統・同じ文も = 狙いの窓と同じ判定) の行だけ (口 boxOnOf)。外れ MOD・2 つ組の片方の系統は「付いている」にしない (11-17 オーナー)。
  窓の上の切り替えで素の品 (木のベース・アイテムレベルの何も付いていない品) にも替えられる。帯の「MOD 一覧」(TreeTabs、S-145f) は今までどおり素の品で開く。
  見るだけで木には何もしない。次に打つ手の窓の上に重ねて出る (閉じると手の窓に戻る)
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import ModListWin from "../../../components/for-share/mod-list/ModListWin.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { freshItem, type ListRow } from "../../../services/craft-stage/engine";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { aimHeldOn } from "../../../services/simulator/tree/tree-aim";
import { treeHidden } from "../use-sim-shelf";
import { flag } from "../../../web/release-flags";
import { useTree } from "./use-tree";
import { boxModsId, closeBoxMods } from "./tree-box-mods";

const ON = flag("treeBoxModList");
const t = useTree();
/** 開いている箱 (木から消えた箱は無し) */
const id = computed(() => (boxModsId.value && t.doc.value.boxes[boxModsId.value] ? boxModsId.value : null));
// タブを替えた・別の木を開いたら閉じる (前の木の箱の品を出したままにしない)
watch([t.active, t.opened], closeBoxMods);
/**
 * 窓は開く時に作る (v-if): 窓の重なりは作った順なので、先に作っておくと次に打つ手の窓の後ろに出て押せない。
 * 作った次の番に開く (共通の窓は「開いた時」に箱の品を選ぶので、作ってから開く)
 */
const open = ref(false);
watch(id, async (v) => { if (!v) { open.value = false; return; } await nextTick(); open.value = !!id.value; });
const blank = computed(() => { const d = s.data.value; try { return id.value && d && !t.needBase.value ? freshItem(d, t.doc.value.base, t.doc.value.itemLevel, "rare") : null; } catch { return null; } });
/** 箱の品 = その箱の見本の 1 人目 (狙いの窓 TreeModPick と同じ sampleOf の seed 1)。品の作れない箱 (当たりの MOD が未定など) は null = 窓は素の品だけ */
const boxItem = computed(() => { const d = s.data.value; try { return id.value && d ? sampleOf(d, t.doc.value, id.value, 1).item : null; } catch { return null; } });
/** 箱の品で付いている完成の狙いの MOD (狙いの窓と同じ aimHeldOn + sameText) */
const heldIds = computed(() => { const d = s.data.value, it = boxItem.value; return new Set(d && it ? t.goals.value.filter((a) => aimHeldOn(d, it, a, { sameText: true })).map((a) => a.modId) : []); });
/** 行の「付いている」= 行のどれかの段の MOD が付いている狙い (外れの MOD の系統は付いているにしない) */
const boxOnOf = (r: ListRow): boolean => [r.id, ...r.tiers.map((x) => x.modId ?? r.id)].some((m) => heldIds.value.has(m));
</script>

<template>
  <ModListWin v-if="ON && id" :open="open":blank="blank" :box-item="boxItem" :box-on-of="boxOnOf" start-box :hidden="treeHidden" @close="closeBoxMods" />
</template>
