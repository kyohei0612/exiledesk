<script setup lang="ts">
/**
 * TreeVeilCheck.vue — 骨 (冒涜) の手の窓の「発現させる」☑ (10-27 夜オーナー、スイッチ boneLater)。既定は無し = 未発現のまま次へ (結果は「未発現の冒涜が付いた」)。
 * 高貴・カオスの窓と同じ並び (狙う MOD の ☑ = 完成の狙い → これ → 狙い無し、10-28 オーナー「誰がそこに表示しろって」)。
 * PC: ☑ を付けた時点で「このベースに付く MOD」の窓 (共通の ModTable、完成形の設定と同じ表) を開き、発現で出うる MOD の段から選ばせる
 *     (出ない MOD は灰色で選べない。選んだ物は ☑ の一覧に足して当たり、選ばずに閉じたら ☑ は外れたまま。10-28 オーナー「発現させるチェックで MOD を選ばせよう」)。
 * スマホ (big): ☑ を付けた時点で、いつもの MOD を選ぶ窓 (TreeModPick) を開く。オンの時は「ほかの MOD を選ぶ」で置き石を足せる。
 * 発現させると狙い無しは同時にオンにならない (狙い無し = 未発現のまま次へ、最後の ☑ を外すと発現させるも外れる。TreeHandShelf、10-28 オーナー)。
 * noCheck = 後から打つ発現の手 (☑ は出さず、選ぶボタンだけ)
 */
import { computed, ref } from "vue";
import ModTable from "../../../components/for-share/mod-list/ModTable.vue";
import TreeModPick from "./TreeModPick.vue";
import { revealAimsOf } from "./tree-reveal-aims";
import { useTree } from "./use-tree";
import { craftStage as s } from "../../../state/craft-stage";
import type { Aim, Hand } from "../../../services/simulator/tree/tree-model";
import type { ListRow, StageItem } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";

const props = defineProps<{ modelValue: boolean; big?: boolean; noCheck?: boolean; boxId: string; item: StageItem | null; hand: Hand | null }>();
const emit = defineEmits<{ "update:modelValue": [boolean]; add: [Aim] }>();
const t = useTree();
const picking = ref(false);
/** 発現で出うる MOD (完成の狙いは窓の ☑ にもあるが、窓では全部から選べる) */
const allow = computed(() => { const d = s.data.value; return picking.value && d && props.item && props.hand ? revealAimsOf(d, t.doc.value, props.boxId, props.item, { ...props.hand, veil: "pick" }).map((a) => a.modId) : []; });
const can = (r: ListRow, modId?: string): boolean => allow.value.includes(modId ?? r.id);
function pick(a: Aim): void { picking.value = false; emit("add", a); }
/** PC は ☑ を付けた時点で窓を開く (選ぶまで ☑ は付けない)。外すのはそのまま */
function onCheck(e: Event): void {
  const on = (e.target as HTMLInputElement).checked;
  // 発現させるなら必ず MOD を選ぶ (スマホも、10-28 オーナー「発現させるオンで狙い無しは無し」)
  if (on) { (e.target as HTMLInputElement).checked = false; picking.value = true; return; }
  emit("update:modelValue", on);
}
</script>

<template>
  <!-- 並びと形は隣の狙いの行と同じ (PC は min-h-7 gap-2、スマホは枠付きの min-h-11 gap-3) -->
  <label v-if="!noCheck" data-tree-hand-veil class="flex cursor-pointer items-center" :class="big ? 'min-h-11 gap-3 rounded-lg border border-white/10 bg-black/20 px-3' : 'min-h-7 gap-2'">
    <input type="checkbox" class="shrink-0" :class="big ? 'size-5' : ''" :checked="modelValue" @change="onCheck" />
    <span class="min-w-0 break-words">{{ tr("発現させる (無しなら未発現のまま次へ)", "Reveal it now (off = leave it unrevealed)") }}</span>
  </label>
  <button v-if="(big && modelValue) || noCheck" type="button" data-tree-hand-veil-more class="g-btn sm self-start" :class="big ? '!min-h-11' : ''" @click="picking = true">{{ tr("ほかの MOD を選ぶ (完成形に無い MOD)", "Pick another mod (not in the final item)") }}</button>
  <div v-if="picking" data-tree-hand-veil-pick class="fixed inset-0 z-[340] flex items-center justify-center bg-black/60 p-3" @click.self="picking = false">
    <!-- スマホ: いつもの MOD を選ぶ窓 -->
    <div v-if="big" class="g-panel flex max-h-[85vh] w-full max-w-[520px] min-w-0 flex-col p-3">
      <TreeModPick class="min-h-0 flex-1" mode="hit" :current="null" :allow="allow" :title="tr('発現で選ぶ MOD (完成形に無い物も)', 'Mod to pick when revealing (including ones not in the final item)')" autofocus @pick="pick" @close="picking = false" />
    </div>
    <!-- PC: 「このベースに付く MOD」の窓 (完成形の設定と同じ表)。発現で出うる MOD の段だけ「発現で選ぶ」 -->
    <div v-else class="g-panel flex h-[85vh] w-full max-w-[1240px] min-w-0 flex-col p-4">
      <div class="mb-2 flex items-center gap-3">
        <b class="text-[16px] text-[#f0e4c8]">{{ tr("このベースに付く MOD", "Mods on this base") }}</b>
        <span class="text-[12px] opacity-70">{{ tr("発現で選ぶ MOD (灰色は発現で出ない)", "Mod to pick when revealing (greyed = can't be revealed)") }}</span>
        <button type="button" data-tree-hand-veil-close class="ml-auto px-2 text-[20px] leading-none opacity-70 hover:opacity-100" :title="tr('閉じる (選ばない)', 'Close (pick nothing)')" @click="picking = false">×</button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <ModTable overlay :data="s.data.value" :item="item" :row-dim="(r) => !can(r)">
          <template #tier-actions="{ row: r, tier: tt }">
            <td class="w-32 whitespace-nowrap py-0.5 text-right">
              <button v-if="can(r, tt.modId)" type="button" data-mod-pick data-tree-hand-veil-tier class="tbtn" :title="tr(`${tt.rank} 以上が発現で選べたら当たり`, `A hit if ${tt.rank}+ is revealed`)" @click.stop="pick({ modId: tt.modId ?? r.id, tier: tt.tier })">{{ tr("発現で選ぶ", "Pick") }}</button>
            </td>
          </template>
        </ModTable>
      </div>
    </div>
  </div>
</template>
