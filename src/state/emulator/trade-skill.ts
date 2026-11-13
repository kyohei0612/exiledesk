/**
 * trade-skill.ts — エミュの付与スキルの選び (M-05・U-12f、スイッチ tradeSkill)。品の上の帯の 2 行目で選び (CraftStage.vue)、
 * 「今の MOD を取引所で検索」(StageSettings.vue) がその選びを検索に入れる。英語の名前、null = どれでも
 */
import { ref } from "vue";

export const tradeSkill = ref<string | null>(null);
