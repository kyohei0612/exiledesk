<!--
  AttemptsSelect.vue — 「N 回やった場合」の回数を選ぶ (2026-09-20)

  オーナー指示:「回数は 5 ずつプルダウンに出して 100 まで出せるように。勿論同期して
  他の場所でも同時に入るように。また 100 超えて手入力した場合や、そもそも普通に
  手入力した際に同期されないからそこもチェックして修正して」。

  同期そのものは効いていた (素材の表も収支も同じ ref を見ている) が、
  **収支で 37 のような一覧に無い数を入れると、この select が空欄に落ちて**
  「同期されていない」ように見えていた。一覧に無い数はその場で足して必ず出す。
-->
<script setup lang="ts">
import { computed } from "vue";
import { ATTEMPT_OPTIONS } from "../views/gem-corrupt/ui";

const model = defineModel<number>({ required: true });

/** 一覧 + 今の値 (一覧に無ければ足して昇順に並べる) */
const options = computed<number[]>(() => {
  const n = model.value;
  // 0 も足す (収支で空欄にすると 0 になる。足さないと select だけ空欄に落ちて「ずれた」ように見える)
  if (!Number.isFinite(n) || n < 0 || ATTEMPT_OPTIONS.includes(n)) return ATTEMPT_OPTIONS;
  return [...ATTEMPT_OPTIONS, n].sort((a, b) => a - b);
});
</script>

<template>
  <select v-model.number="model" class="num w-24">
    <option v-for="n in options" :key="n" :value="n">{{ n }} 回</option>
  </select>
</template>
