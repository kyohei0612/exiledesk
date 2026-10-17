<!--
  ModAddPicker.vue — MOD 一覧の段の行の「付ける」(2026-10-17、オーナーの残りのタスク「付け方を選べるように」)。
  押すと付け方 (普通 / フラクチャー / 冒涜 / エッセンス) を、棚の高貴・カオスの段 (普通 / 上級 / 完全) と同じく並べて選ぶ。
  付け方が 1 つだけなら押してすぐ付ける。アイテムにもうフラクチャー (冒涜) がある時は、その付け方を出さない。
  冒涜で付けられるのは冒涜の置き場の MOD だけ (2026-10-08 オーナー「冒涜 MOD しか冒涜は付けれない」、apply-force.ts)。
  打ち始める前 (始めの状態を組む時) は addStartMod、打ち始めた後は指名の手 (force:…、費用 0・1 手戻すで外せる)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { forceKey, type ForceFlag } from "../../services/craft-stage/apply-force";
import { allMods } from "../../services/craft-stage/stage-core";
import type { ModGroup } from "../../services/craft-stage/mod-list";
import { tr } from "../../i18n/lang";
import Icon from "../../components/ui/Icon.vue";

const props = defineProps<{ group: ModGroup; modId: string; rank: string }>();
/** 始めの状態を組める (まだ打っていない・再生でない) */
const canStart = computed(() => !s.log.value.length && !s.replay.value);
const desecratedPool = computed(() => props.group === "desecrated" || props.group === "otherworldly");
const essence = computed(() => props.group === "essence" || props.group === "perfect_essence");
/** 始めの状態に入れられる種類 (普通・冒涜)。エッセンス・ルーン・異界は打ち始めた後と同じ指名の手 */
const startable = computed(() => canStart.value && (props.group === "normal" || props.group === "desecrated"));

interface Way { flag: ForceFlag; label: string; why: string | null; run: () => void }
const ways = computed<Way[]>(() => {
  const it = s.item.value;
  const hasFr = startable.value ? s.startMods.value.some((f) => f.fractured) : !!it && allMods(it).some((m) => m.fractured);
  const hasDe = startable.value ? s.startMods.value.some((f) => f.desecrated) : !!it && allMods(it).some((m) => m.desecrated);
  const base: Array<{ flag: ForceFlag; label: string }> = desecratedPool.value
    ? (hasDe ? [] : [{ flag: "d", label: tr("冒涜", "Desecrated") }])
    : [{ flag: essence.value ? "e" : "n", label: essence.value ? tr("エッセンス", "Essence") : tr("普通", "Normal") }, ...(hasFr ? [] : [{ flag: "f" as ForceFlag, label: tr("フラクチャー", "Fracture") }])];
  return base.map(({ flag, label }) => {
    if (startable.value) {
      const run = (): void => s.addStartMod({ mod: props.modId, tier: props.rank, ...(flag === "f" ? { fractured: true } : flag === "d" ? { desecrated: true } : {}) });
      return { flag, label, why: null, run };
    }
    const key = forceKey(props.modId, props.rank, flag);
    return { flag, label, why: s.replay.value ? tr("再生中は打てない", "Cannot use during replay") : s.usable(key), run: () => s.use(key) };
  });
});
const open = ref(false);
/** 押した時: 付け方が 1 つだけならすぐ付ける、2 つ以上なら並べる */
function onAdd(): void {
  const ok = ways.value.filter((w) => !w.why);
  if (ways.value.length === 1 && ok.length === 1) { ok[0]!.run(); return; }
  open.value = !open.value;
}
function pick(w: Way): void { w.run(); open.value = false; }
const none = computed(() => !ways.value.length || ways.value.every((w) => w.why));
const why = computed(() => (!ways.value.length ? (desecratedPool.value ? tr("冒涜の MOD はアイテムに 1 つまで (もう付いている)", "Only one desecrated mod per item (already added)") : tr("付けられない", "Can't add")) : ways.value.every((w) => w.why) ? ways.value[0]!.why : null));
</script>

<template>
  <span class="inline-flex items-center gap-1" data-mod-add-picker>
    <template v-if="open">
      <button v-for="w in ways" :key="w.flag" type="button" class="tbtn" :data-rec="`mod-add-${w.flag}:${modId}:${rank}`" :disabled="!!w.why" :title="w.why ?? tr(`${rank} を${w.label}で付ける`, `Add ${rank} as ${w.label}`)" @click.stop="pick(w)">{{ w.label }}</button>
      <button type="button" class="tbtn" :title="tr('やめる', 'Cancel')" @click.stop="open = false">×</button>
    </template>
    <button v-else type="button" class="tbtn" :data-rec="`mod-add:${modId}:${rank}`" :disabled="none" :title="why ?? (ways.length > 1 ? tr(`${rank} を付ける (付け方を選ぶ: ${ways.map((w) => w.label).join(' / ')})`, `Add ${rank} (choose how: ${ways.map((w) => w.label).join(' / ')})`) : tr(`${rank} を${ways[0]?.label ?? ''}で付ける`, `Add ${rank} as ${ways[0]?.label ?? ''}`))" @click.stop="onAdd">{{ tr("付ける", "Add") }}<Icon v-if="ways.length > 1" name="chevron-down" class="ml-0.5 size-3" /></button>
  </span>
</template>
