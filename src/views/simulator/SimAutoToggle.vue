<!--
  SimAutoToggle.vue — ② 狙う MOD の見出しの右の「自動で組む」(2026-10-20 S2 の手 4、設計 auto-flow-design の 1)。
  自動 = 付け方・付ける順番・打ち方を最善手で埋める。T1 だけの狙いがあると押せない (オーナー 10-20、理由の 1 行は StageSimPanel が見出しの下に出す)。
  決まりは ? の中 (既定で閉じる。feedback-minimal-text-ui)
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import HelpTip from "../../components/ui/HelpTip.vue";

defineProps<{ auto: boolean; disabled: boolean }>();
const emit = defineEmits<{ toggle: [to: boolean] }>();
</script>

<template>
  <span data-sim-auto class="inline-flex items-center gap-1 text-[13px]">
    <label class="inline-flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 hover:bg-white/5 max-md:min-h-10" :class="disabled ? 'cursor-not-allowed opacity-50' : ''">
      <input type="checkbox" data-sim-auto-check class="accent-amber-400" :checked="auto" :disabled="disabled" @change="emit('toggle', ($event.target as HTMLInputElement).checked)" />
      {{ tr("自動で組む", "Plan automatically") }}
    </label>
    <HelpTip :width="300">
      <ul class="list-disc space-y-1 pl-4">
        <li>{{ tr("付け方 (高貴 / カオス)・付ける順番・打ち方を最善手で埋める。決まりは ④・⑤ の ? に書いてある", "Fills the methods (Exalted Orb / Chaos Orb), order and crafting steps with the best moves. The rules are in the ? of steps 4 and 5") }}</li>
        <li>{{ tr("自動で選べる段は T2 以上まで (フラクチャーで固定する MOD は T1 でもよい)", "Auto plans tiers T2 and above (a fractured mod may be T1)") }}</li>
        <li>{{ tr("手動に戻すと、自動で決めた付け方・順番・答えは消える", "Switching back to manual clears the methods, order and answers chosen automatically") }}</li>
      </ul>
    </HelpTip>
  </span>
</template>
