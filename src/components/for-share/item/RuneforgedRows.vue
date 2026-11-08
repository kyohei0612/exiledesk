<!--
  RuneforgedRows.vue — カードのベースの数値をルーンフォージ版 (ルーンワード) で出す切り替え (2026-11-08 深夜オーナー「装備品にワード量での表示チェックボックス」「オンにしたらルーニックモードに切り替わって表示」)。
  値はエンジンの入口だけ (runeforgedOf = 版の一覧、runeforgedStatsOf = ワードと残る防御を今の MOD・品質込みで、E-78)。版の無いベースはチェックボックスを出さない。
  版が 2 つ以上のベースは版を選ぶ、既定は 1 つ目。オフの時は今までの数値の行 (rows) をそのまま出す。
  ワードはその品の今の品質のままの値だけ (品質 20% の時などの別表示・ベース選びへの表示はしない。オーナー 11-09「エミュで品質上げれるから普通に」)。
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { runeforgedOf, runeforgedStatsOf, type StageItem } from "../../../services/craft-stage/engine";
import { tr } from "../../../i18n/lang";
import DataNote from "../../ui/DataNote.vue";

/** ルーンフォージ版の数値の札の説明 (U-18 の「・」の縦の箇条書き) */
const WARD_NOTE = (): string[] => [
  tr("版ごとのワード・防御の素の値は poe2db の値", "Base Ward and defences per version are poe2db's values"),
  tr("品質と MOD での伸びはゲームでも確かめられていない", "How quality and mods scale them is not confirmed in game"),
  tr("ここではアーマーと同じ掛け方 (平の + を足してから % と品質を掛ける) の目安", "Here they scale like Armour (flat added, then % and quality) as an estimate"),
];

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
  const f = form.value;
  // ワードと残る防御はエンジンの runeforgedStatsOf (今の MOD・品質込み、版に無い防御は無い。11-09 ジン 8dcdef9f1)
  const s = on.value && f ? runeforgedStatsOf(props.item, pick.value) : null;
  if (!f || !s) return [...props.rows];
  const out: PropRow[] = [{ key: "ward", label: tr("ルーンワード", "Runic Ward"), value: String(s.ward), up: s.ward !== f.ward }];
  const left: [keyof typeof s & keyof typeof f, string, string][] = [["armour", "アーマー", "Armour"], ["evasion", "回避力", "Evasion Rating"], ["es", "エナジーシールド", "Energy Shield"]];
  for (const [k, ja, en] of left) {
    const v = s[k] as number | undefined;
    if (v != null) out.push({ key: en, label: tr(ja, en), value: String(v), up: v !== f[k] });
  }
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
  <!-- 品質での伸びはゲームでも確かでない (U-18 の青の札。11-09 オーナー「ルーンフォージアイテムの品質での伸びがよくわかってないけどね」) -->
  <div v-if="on && forms.length" data-runeforged-note class="flex flex-wrap justify-center py-0.5" @click.stop>
    <DataNote small tip="center" :text="tr('品質での伸びは目安', 'Quality scaling is an estimate')" :detail="WARD_NOTE()" />
  </div>
</template>
