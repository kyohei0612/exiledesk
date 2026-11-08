<!--
  RuneforgedRows.vue — カードのベースの数値をルーンフォージ版 (ルーンワード) で出す切り替え (2026-11-08 深夜オーナー「装備品にワード量での表示チェックボックス」「オンにしたらルーニックモードに切り替わって表示」)。
  値はエンジンの入口だけ (runeforgedOf = 版の一覧、runicWardOf = 品質・ワードの MOD 込みのワード、E-78)。版の無いベースはチェックボックスを出さない。
  版が 2 つ以上のベース (6 つ) は版を選ぶ、既定は 1 つ目。オフの時は今までの数値の行 (rows) をそのまま出す。
  ワードはその品の今の品質のままの値だけ (品質 20% の時などの別表示・ベース選びへの表示はしない。オーナー 11-09「エミュで品質上げれるから普通に」)。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { runeforgedOf, runicWardOf, type StageItem } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";

/** カードの数値の行 (stage-props の propRows と同じ形) */
interface PropRow { key: string; label: string; value: string; up: boolean }

const props = defineProps<{ item: StageItem; rows: readonly PropRow[] }>();
const on = ref(false);
const pick = ref(0);
const forms = computed(() => runeforgedOf(props.item.base));
watch(() => props.item.base, () => { pick.value = 0; });
const form = computed(() => forms.value[pick.value] ?? forms.value[0]);
const DEF_KEYS = ["armour", "evasion", "es"];
/** オンの時の行: ルーンワード + 版に残る防御 + 防御でない行 (ブロック率など) はそのまま */
const shown = computed((): PropRow[] => {
  if (!on.value || !form.value) return [...props.rows];
  const f = form.value;
  const ward = runicWardOf(props.item, pick.value) ?? f.ward;
  const out = [{ key: "ward", label: tr("ルーンワード", "Runic Ward"), value: String(ward), up: ward !== f.ward }];
  const left: [number | undefined, string, string][] = [[f.armour, "アーマー", "Armour"], [f.evasion, "回避力", "Evasion Rating"], [f.es, "エナジーシールド", "Energy Shield"]];
  for (const [v, ja, en] of left) if (v != null) out.push({ key: en, label: tr(ja, en), value: String(v), up: false });
  return [...out, ...props.rows.filter((r) => !DEF_KEYS.includes(r.key))];
});
</script>

<template>
  <label v-if="forms.length" data-runeforged class="mx-auto mt-0.5 flex w-fit cursor-pointer items-center gap-1.5 text-[11px] text-white/60 hover:text-white/85" @click.stop>
    <input v-model="on" type="checkbox" class="size-3.5 accent-amber-400" />
    {{ tr("ルーンフォージ版 (ワード) で表示", "Show as Runeforged (Ward)") }}
  </label>
  <div v-if="on && forms.length > 1" data-runeforged-forms class="flex flex-wrap justify-center gap-1 py-0.5" @click.stop>
    <button v-for="(f, i) in forms" :key="i" type="button" class="rounded border px-1.5 py-px text-[11px] tabular-nums" :class="i === pick ? 'border-amber-300/70 bg-amber-500/15 text-amber-100' : 'border-white/15 text-white/55 hover:bg-white/5'" :aria-pressed="i === pick" :title="tr(`ルーンフォージ版 ${i + 1} (${f.name})`, `Runeforged version ${i + 1} (${f.name})`)" @click="pick = i">{{ tr(`版 ${i + 1}`, `V${i + 1}`) }}</button>
  </div>
  <p v-for="r in shown" :key="r.key" class="text-[12px] text-white/50">{{ r.label ? `${r.label}: ` : "" }}<span :class="r.key === 'ward' ? 'text-sky-200' : r.up ? 'text-rarity-magic' : 'text-white/85'">{{ r.value }}</span></p>
</template>
