<!--
  TreeKeepList.vue — 手の窓の「残したい MOD」の並び (TreeHandShelf.vue から分けた、2026-10-31)。PC の欄 (小) とスマホの 2 ページ目 (big) で同じ部品。
  消去 (S-27) と、スイッチ keepAll では消える手 (カオス・パーフェクトエッセンス・満杯の側の骨、S-27d)。動きは use-hand-keep.ts。
  adds = 上の段「付ける狙い」で持ったら自動の ☑ (エッセンスの MOD、外せない。10-31 朝オーナー「エッセンス持ったら自動チェックで、その下に残したいMOD選ばせる」)
-->
<script setup lang="ts">
import { aimKey } from "../../../services/simulator/tree/tree-model";
import { handName } from "./tree-names";
import type { HandKeep } from "./use-hand-keep";
import { modText, tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

defineProps<{ k: HandKeep; big?: boolean; adds?: string[] }>();
</script>

<template>
  <div v-if="adds?.length" data-tree-hand-adds :class="big ? 'mb-2 flex flex-col gap-1.5 text-left' : 'flex flex-col gap-1 text-[12px]'">
    <span class="opacity-80">{{ tr("付ける狙い (持ったら自動で ☑)", "Target added (☑ automatically)") }}</span>
    <label v-for="a in adds" :key="a" data-tree-hand-add class="flex min-w-0 items-center gap-2 opacity-90" :class="big ? 'min-h-11 rounded-lg border border-white/10 bg-black/20 px-3' : 'min-h-7'">
      <input type="checkbox" :class="big ? 'size-5 shrink-0' : ''" checked disabled /><span class="min-w-0 break-words">{{ a }}</span>
    </label>
  </div>
  <div data-tree-hand-keep :class="big ? 'flex flex-col gap-1.5 text-left' : 'flex flex-col gap-1 text-[12px]'">
    <span v-if="!big" class="opacity-80">{{ k.isRemove.value ? tr("残したい MOD (☑ の MOD が消えたら「狙いが消えた」。☑ の無い MOD は外れ MOD)", "Mods to keep (a ☑ mod removed = Target lost; unchecked mods are misses)") : tr("残したい MOD (☑ の MOD が消えたら「狙いが消えた」。☑ の無い MOD は消えても外れ MOD)", "Mods to keep (a ☑ mod removed = Target lost; unchecked mods count as misses even if removed)") }}</span>
    <label v-if="!big" data-tree-hand-keep-none class="flex min-h-7 cursor-pointer items-center gap-2 max-md:min-h-11">
      <input type="checkbox" :checked="!k.aims.value.length" @change="k.none($event)" />{{ k.isRemove.value ? tr(`全部消えてよい (同じ形の箱になるまで${handName("annul")}の箱を並べる)`, `Anything may go (${handName("annul")} boxes until a box of the same shape)`) : tr("全部消えてよい (どれが消えても「狙いが消えた」にしない)", "Anything may go (no Target lost box)") }}
    </label>
    <span v-if="!big && !k.aims.value.length && k.isRemove.value && !flag('goalShape')" data-tree-hand-keep-junk class="pl-6 text-[#e0a060]">{{ tr(`${k.choices.value.length} MOD 外れ MOD`, `${k.choices.value.length} mods: misses`) }}</span>
    <label v-for="c in k.choices.value" :key="aimKey(c.aim)" data-tree-hand-keep-mod :data-mod="aimKey(c.aim)" class="flex min-w-0 cursor-pointer items-center" :class="big ? 'min-h-11 gap-3 rounded-lg border border-white/10 bg-black/20 px-3' : 'min-h-7 gap-2 max-md:min-h-11'">
      <input type="checkbox" :class="big ? 'size-5 shrink-0' : ''" :checked="k.checked.value.includes(aimKey(c.aim))" :disabled="k.last(c.aim)" :title="k.last(c.aim) ? k.lastText : undefined" @change="k.toggle(c.aim)" /><span class="min-w-0" :class="big ? 'break-words' : 'truncate max-md:overflow-visible max-md:whitespace-normal max-md:break-words'" :title="modText(c.mod)">{{ k.label(c) }}</span>
    </label>
    <label v-if="big" data-tree-hand-keep-none class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3">
      <input type="checkbox" class="size-5 shrink-0" :checked="!k.aims.value.length" @change="k.none($event)" /><span class="min-w-0 break-words">{{ k.isRemove.value ? tr(`全部消えてよい (同じ形の箱になるまで${handName("annul")}の箱を並べる)`, `Anything may go (${handName("annul")} boxes until a box of the same shape)`) : tr("全部消えてよい (どれが消えても「狙いが消えた」にしない)", "Anything may go (no Target lost box)") }}</span>
    </label>
  </div>
</template>
