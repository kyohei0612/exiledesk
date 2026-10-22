<!--
  StageAimPicker.vue — エミュレーターの「次の手で狙う」の選ぶ窓 (2026-10-09)

  オーナー「狙う → 次の手で狙う に変更。押したらチェックボックスで複数狙えるように別でポップアップだして、選択しなくて単体でも進めるように。
  その方がわかり易い。そしたら次の手で狙うにはどれが一番確率高いかわかるでしょ、今ついてる MOD の状態から何が一番いいのか」。
  一覧は「このベースに付く MOD」と同じ modListFor ([[mod-list.ts]])。チェックで狙いに入れる (どの段でも = 一番下の段以上)、
  名前を押すと段の表で「T○ 以上」を選べる。押した段 (seed) は最初からチェック済みで、そのまま「確率を見る」で進める。
  決めるまでは s.aims を触らない (やめるで元のまま)。
-->
<script setup lang="ts">
import { fmtPct } from "../../utils/format-pct";
import { computed, ref } from "vue";
import { AIM_MAX, craftStage as s, type AimPick } from "../../state/craft-stage";
import { aimLabel, groupLabelOf, modListFor, tierIdOf, type ListRow, type ListTier, type ModGroup } from "../../services/craft-stage/mod-list";
import { revealOpened, scrollToTop } from "../../utils/keep-place";
import { ROUTES_MAX, routesTarget } from "../../state/web-page";
import { nextTick } from "vue";
import Icon from "../../components/ui/Icon.vue";
import ModalShell from "../../components/ui/ModalShell.vue";
import { tr } from "../../i18n/lang";

const seed = s.aimPicker.value?.seed ?? null;
/** 選んでいる物 (決めるまで手元だけ) */
/** スパムシミュレーターの当たり (web-page.ts の routesTarget。どれか 1 つが付いたら止める。2 つ以上は開発版だけ ROUTES_MAX) */
const forRoutes = !!s.aimPicker.value?.routes;
/** 選べる数: スパムシミュレーターは ROUTES_MAX (本番は 1 つ)、次の手で狙うは AIM_MAX まで */
const MAX = forRoutes ? ROUTES_MAX : AIM_MAX;
/** 1 つだけの時は選び直しで入れ替える (今まで通り) */
const single = MAX === 1;
const draft = ref<AimPick[]>(forRoutes ? (single ? [] : (routesTarget.value ?? []).map((t) => ({ ...t, label: "" }))) : [...s.aims.value].slice(0, MAX));
if (seed && !draft.value.some((a) => a.modId === seed.modId)) draft.value = [...draft.value, seed].slice(-MAX);
else if (seed) draft.value = draft.value.map((a) => (a.modId === seed.modId ? seed : a));

// 狙えるのは打って付く種類 (ルーンは差すだけなので外す)
// スパムシミュレーターではルーンの特殊 MOD も狙える (嵌めて打つ。2026-10-19 オーナー「ルーン嵌めた状態でスパムシミュレーター」)
const GROUPS: ModGroup[] = forRoutes ? ["normal", "rune", "essence", "desecrated", "otherworldly"] : ["normal", "essence", "desecrated", "otherworldly"];
const inGroup = (r: ListRow, g: ModGroup): boolean => r.group === g || (g === "essence" && r.group === "perfect_essence");
const rows = computed(() => (s.data.value && s.item.value ? modListFor(s.data.value, s.item.value) : []));
const groups = computed(() => GROUPS.filter((g) => rows.value.some((r) => inGroup(r, g))));
/** 最初の種類: 押した段の種類 (無ければ普通) */
const seedRow = seed ? rows.value.find((r) => r.tiers.some((t) => (t.modId ?? r.id) === seed.modId)) : undefined;
const group = ref<ModGroup>(seedRow ? (GROUPS.find((g) => inGroup(seedRow, g)) ?? "normal") : "normal");
const columns = computed(() => (["prefix", "suffix"] as const).map((side) => ({
  side, title: side === "prefix" ? tr("プレフィックス", "Prefix") : tr("サフィックス", "Suffix"),
  items: rows.value.filter((r) => inGroup(r, group.value) && r.side === side).sort((a, b) => b.share - a.share || b.topLevel - a.topLevel),
})));

const idOf = (r: ListRow, t: ListTier): { modId: string; idx: number } => tierIdOf(s.data.value, r, t);
const pickedOf = (r: ListRow): AimPick | undefined => draft.value.find((a) => r.tiers.some((t) => (t.modId ?? r.id) === a.modId));
const pickOf = (r: ListRow, t: ListTier): AimPick | null => {
  const { modId, idx } = idOf(r, t);
  return idx < 0 ? null : { modId, minTierIndex: idx, label: `${t.text} (${tr(`${t.rank} 以上`, `${t.rank}+`)})`, at: `${modId}:${t.rank}` };
};
const full = computed(() => draft.value.length >= MAX);
/** 選べない理由 (灰色の行の下に文で。スマホはホバーが無い) */
function whyNot(r: ListRow): string | null {
  if (r.on) return tr("付いている", "On item");
  if (r.blocked) return tr("同じ系統が付いている", "Same group on item");
  if (full.value && !pickedOf(r) && !single) return tr(`${MAX} つまで`, `Max ${MAX}`);
  return null;
}
/** チェック: どの段でも (付けば当たり) = このアイテムレベルで付く一番下の段以上 */
function toggle(r: ListRow, e?: Event): void {
  const cur = pickedOf(r);
  if (cur) { draft.value = draft.value.filter((a) => a !== cur); return; }
  if (whyNot(r)) return;
  // 同じ系統をまとめた行 (スペル / ミニオン / 近接 / 投射物のスキルのレベルなど) は、どれを狙うか段の表で選んでもらう
  // (2026-10-16 アミュレットのスペルスキル +3 の確かめ: 前は並びの最後の投射物 +1 が狙いになっていた)
  if (new Set(r.tiers.map((t) => t.modId ?? r.id)).size > 1) { expanded.value = r.id; if (e?.target instanceof HTMLInputElement) { e.target.checked = false; revealOpened(e.target.closest("[data-tier-row]")); } return; }
  const t = [...r.tiers].reverse().find((x) => x.ilvl <= s.itemLevel.value) ?? r.tiers[r.tiers.length - 1];
  const p = t ? pickOf(r, t) : null;
  if (p) draft.value = single ? [p] : [...draft.value, p];
}
function pickTier(r: ListRow, t: ListTier): void {
  const cur = pickedOf(r);
  if (!cur && whyNot(r)) return;
  const p = pickOf(r, t);
  if (!p) return;
  draft.value = cur ? draft.value.map((a) => (a === cur ? p : a)) : single ? [p] : [...draft.value, p];
}
const isPickedTier = (r: ListRow, t: ListTier): boolean => { const c = pickedOf(r), { modId, idx } = idOf(r, t); return !!c && c.modId === modId && c.minTierIndex === idx; };
const isCoveredTier = (r: ListRow, t: ListTier): boolean => { const c = pickedOf(r), { modId, idx } = idOf(r, t); return !!c && c.modId === modId && idx >= c.minTierIndex; };
const rankOf = (a: AimPick): string => { const n = s.data.value?.mods.get(a.modId)?.tiers.length ?? 0; return `T${n - a.minTierIndex}`; };
/** 段の表を開いている行 (押した段の行は最初から開く) */
const expanded = ref<string | null>(seedRow?.id ?? null);
/** 確率の % (2026-10-10 動きの揃え 5: 書き方は utils/format-pct.ts の 1 つ) */
const pct = (x: number): string => fmtPct(x, { zero: "" });

function close(): void { s.aimPicker.value = null; }
function decide(): void {
  if (!draft.value.length) return;
  if (forRoutes) { routesTarget.value = draft.value.map((a) => ({ modId: a.modId, minTierIndex: a.minTierIndex })); close(); s.modOverlay.value = false; return; }
  s.aims.value = draft.value;
  close();
  // 決めたら後ろの MOD 一覧の窓も閉じて、確率の一覧を見せる (やめる時は残す。POE2Tube 要望 ㊴)
  s.modOverlay.value = false;
  // 確率の一覧の見出し (と狙いの札) が見える所へ
  void nextTick(() => scrollToTop(document.querySelector("[data-aim-panel]")));
}
</script>

<template>
  <!-- 窓の動き (Esc・後ろを押す・×・後ろのページを止める) は ModalShell (2026-10-10 これが原点) -->
  <ModalShell :open="true" rec="aim-dialog" :title="forRoutes ? tr('スパムで狙う MOD', 'Mod to spam for') : tr('次の手で狙う', 'Target next move')" :close-title="tr('やめる', 'Cancel')" full-on-phone body-class="px-3 py-2" @close="close">
    <template #header>
      <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ draft.length }} / {{ MAX }} · {{ forRoutes ? (single ? tr("1 つ選ぶ", "Pick one") : tr("どれか 1 つ付いたら当たり", "Hit when any one rolls")) : tr("全部付いて当たり", "Hit when all roll") }}</span>
    </template>
    <template #subheader>
      <p v-if="draft.length" class="mt-1 flex flex-wrap gap-1">
        <span v-for="a in draft" :key="a.modId" class="inline-flex items-center gap-1 rounded bg-[rgba(136,136,255,0.14)] py-0.5 pl-1.5 text-[12px] text-[var(--color-rarity-magic)]">{{ aimLabel(s.data.value, a) }}<button type="button" class="g-plain grid size-7 place-items-center opacity-60 hover:opacity-100" :title="tr('外す', 'Remove')" @click="draft = draft.filter((x) => x !== a)">×</button></span>
      </p>
      <p v-else class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">{{ tr("狙う MOD にチェック (名前を押すと段を選べる)", "Check the mods to target (click a name to pick a tier)") }}</p>
      <nav v-if="groups.length > 1" class="mt-2 flex flex-wrap gap-1">
        <button v-for="g in groups" :key="g" type="button" class="g-tab !min-h-[30px] !px-3 !text-[12px]" :class="group === g ? 'on' : ''" @click="group = g">{{ groupLabelOf(g, s.item.value) }}</button>
      </nav>
    </template>
    <div class="grid grid-cols-2 gap-4 max-md:grid-cols-1 max-md:gap-2">
      <div v-for="col in columns" :key="col.side">
        <p class="mb-1 font-bold text-[var(--exile-color-text-secondary)]">{{ col.title }} <span class="font-normal opacity-50">{{ col.items.length }}</span></p>
        <p v-if="!col.items.length" class="text-[11px] opacity-50">{{ tr("無し", "None") }}</p>
        <div v-for="r in col.items" :key="r.id" data-tier-row class="mb-1">
          <div class="flex items-center gap-2 rounded px-2 py-1 max-md:py-1.5" :class="pickedOf(r) ? 'bg-[rgba(163,52,42,0.30)] ring-1 ring-[var(--exile-color-border-brass)]' : whyNot(r) ? 'opacity-40' : 'bg-white/[0.03] hover:bg-white/[0.06]'">
            <input type="checkbox" :checked="!!pickedOf(r)" :disabled="!pickedOf(r) && !!whyNot(r)" class="size-5 shrink-0 accent-amber-500" :aria-label="r.text" @change="toggle(r, $event)" />
            <button type="button" class="g-plain flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-left" @click="expanded = expanded === r.id ? null : r.id; if (expanded === r.id) revealOpened(($event.currentTarget as HTMLElement).closest('[data-tier-row]'))">
              <span class="text-[13px] text-[#c8c8ff]">{{ r.text }}</span>
              <span v-if="pickedOf(r)" class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ tr(`${rankOf(pickedOf(r)!)} 以上`, `${rankOf(pickedOf(r)!)}+`) }}</span>
              <span v-else-if="whyNot(r)" class="text-[10px]">{{ whyNot(r) }}</span>
              <Icon :name="expanded === r.id ? 'chevron-up' : 'chevron-down'" class="size-3.5 opacity-50" />
            </button>
            <span class="w-11 shrink-0 text-right font-bold tabular-nums text-amber-100" :title="tr('出やすさ (同じ側の重みの割合)', 'Chance (share of weight on the same side)')">{{ pct(r.share) }}</span>
          </div>
          <table v-if="expanded === r.id" class="mt-0.5 w-full text-[11px]">
            <tbody>
              <tr v-for="t in r.tiers" :key="t.rank" class="border-b border-white/5" :class="t.ilvl > s.itemLevel.value ? 'opacity-40' : ''">
                <td class="w-8 py-0.5 pl-2 font-bold text-amber-200">{{ t.rank }}</td>
                <td class="py-0.5 text-[#c8c8ff]">{{ t.text }}</td>
                <td class="w-14 py-0.5 text-right tabular-nums opacity-70">Lv {{ t.ilvl }}</td>
                <td class="w-20 py-0.5 text-right">
                  <button type="button" class="whitespace-nowrap rounded border px-1.5 text-[10px] disabled:opacity-30 max-md:min-h-9 max-md:px-2.5 max-md:text-[12px]" :class="isPickedTier(r, t) ? 'border-amber-300 bg-amber-500/35 font-bold text-amber-50' : isCoveredTier(r, t) ? 'border-amber-400/70 bg-amber-500/15 text-amber-100' : 'border-amber-400/50 text-amber-200 hover:bg-amber-500/15'" :disabled="!pickedOf(r) && !!whyNot(r)" @click="pickTier(r, t)">{{ isCoveredTier(r, t) ? "✓ " : "" }}{{ tr(`${t.rank} 以上`, `${t.rank}+`) }}</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <!-- 決める (下に固定。1 つだけでも進める) -->
    <template #footer>
      <button type="button" class="g-btn" @click="close">{{ tr("やめる", "Cancel") }}</button>
      <button type="button" data-rec="aim-decide" class="g-btn-red ml-auto min-w-40 disabled:opacity-35" :disabled="!draft.length" @click="decide">{{ forRoutes ? tr("比べる", "Compare") : tr("確率を見る", "See chances") }}{{ draft.length ? ` (${draft.length})` : "" }}</button>
    </template>
  </ModalShell>
</template>
