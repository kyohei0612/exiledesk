<!--
  StageFracturePicker.vue — シミュレーションの「① フラクチャーの候補」をポップアップの MOD 一覧から選ぶ (2026-10-05、実験)

  オーナー「フラクチャーで付けたい MOD だけど、例の MOD 一覧表から選択式でやろうか。チェックボックスでポップアップで表示させて。
  ティア選びたいなら MOD 名クリックして展開できる今の形。MOD は 1 か所管理だからそこから取得するように」。
  一覧は「このベースに付く MOD」と同じ modListFor ([[mod-list.ts]]) の普通の MOD。チェックで候補にする (段は届く一番上)、
  名前を押すと段の表で「この段以上」を選べる。候補は同じ側だけ (1 つ目を選ぶと反対側は選べない)。

  altFor を渡すと ② のその手順の「あるいは」を選ぶ (2026-10-05 オーナー「選んだ MOD の所にプラスマーク付けといて、そこで選ぶと
  その MOD あるいはの扱いに」)。一覧はその MOD と同じ種類 (普通 / 冒涜) の同じ側、本体は外せない (段は変えられる)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { craftStage } from "../../state/craft-stage";
import { modListFor, shownTags, TAG_STYLE, type ListRow, type ListTier } from "../../services/craft-stage/mod-list";

const props = defineProps<{ /** ② の手順の本体の modId (あれば「あるいは」を選ぶ) */ altFor?: string | null }>();
const emit = defineEmits<{ close: [] }>();
const s = craftStage;

/** 「あるいは」を選ぶ手順 */
const host = computed(() => (props.altFor ? s.simTargets.value.find((t) => t.modId === props.altFor) ?? null : null));
const hostGroup = computed(() => (host.value && s.data.value?.mods.get(host.value.modId)?.source === "desecrated" ? "desecrated" : "normal"));
/** 見出しに出す元の MOD の名前 (段の幅の付いた文) */
const hostName = computed(() => rows.value.find((r) => isHost(r))?.text ?? "");
const rows = computed(() => (s.data.value && s.item.value ? modListFor(s.data.value, s.item.value).filter((r) => r.group === hostGroup.value) : []));
const columns = computed(() => (["prefix", "suffix"] as const).map((side) => ({
  side, title: side === "prefix" ? "プレフィックス" : "サフィックス",
  items: rows.value.filter((r) => r.side === side).sort((a, b) => b.share - a.share),
})));
const candidates = computed((): Array<{ modId: string; minTierIndex: number }> => (host.value
  ? [{ modId: host.value.modId, minTierIndex: host.value.minTierIndex }, ...(host.value.alts ?? [])]
  : s.simTargets.value.filter((t) => t.method === "fracture")));
/**
 * ほかの手順で使っている MOD (ここでは選べない)。コピーして並べた同じ候補のグループ (元の MOD を候補に持つ手順) は除く
 */
const usedElsewhere = (r: ListRow): boolean => !!host.value && s.simTargets.value.some((t) => t !== host.value
  && !(t.alts ?? []).some((a) => a.modId === host.value!.modId)
  && [t, ...(t.alts ?? [])].some((x) => r.tiers.some((y) => (y.modId ?? r.id) === x.modId)));
const isHost = (r: ListRow): boolean => !!host.value && r.tiers.some((t) => (t.modId ?? r.id) === host.value!.modId);
/**
 * グレーにした理由 (ホバーで出す。2026-10-05 オーナー「注意書きは全部ホバー時に出るように、グレーアウトの奴全て」)。選べるなら undefined
 */
function whyBlocked(r: ListRow): string | undefined {
  if (isHost(r)) return "元の MOD (この手順の本体なので、あるいはには入れない)";
  if (usedElsewhere(r)) return "ほかの手順で使っている MOD";
  if (lockedSide.value && lockedSide.value !== r.side && !pickedOf(r)) return "候補と違う側 (どれか 1 つの候補は同じ側だけ)";
  return undefined;
}
const blocked = (r: ListRow): boolean => (!!lockedSide.value && lockedSide.value !== r.side && !pickedOf(r)) || usedElsewhere(r);
const lockedSide = computed(() => {
  const first = candidates.value[0];
  const m = first ? s.data.value?.mods.get(first.modId) : null;
  return m ? (m.type === "suffix" ? "suffix" : "prefix") : null;
});

/** 行の段 → その段の MOD とエンジンの段の番号 (同じ系統をまとめた行は段ごとに MOD が違う) */
function idOf(r: ListRow, t: ListTier): { modId: string; idx: number } {
  const modId = t.modId ?? r.id;
  const idx = s.data.value?.mods.get(modId)?.tiers.findIndex((x) => x.name === t.name && x.ilvl === t.ilvl) ?? -1;
  return { modId, idx };
}
/** 行の MOD のどれかが候補か */
const pickedOf = (r: ListRow) => candidates.value.find((c) => r.tiers.some((t) => (t.modId ?? r.id) === c.modId));
/** チェックした時の段: このアイテムレベルで届く一番上 */
function topTier(r: ListRow): ListTier | undefined {
  return r.tiers.find((t) => t.ilvl <= s.itemLevel.value) ?? r.tiers[r.tiers.length - 1];
}
function setCandidate(modId: string, idx: number | null): void {
  const h = host.value;
  if (h) {
    if (modId === h.modId) { if (idx != null) s.simTargets.value = s.simTargets.value.map((t) => (t === h ? { ...t, minTierIndex: idx } : t)); return; }
    const alts = (h.alts ?? []).filter((a) => a.modId !== modId);
    s.simTargets.value = s.simTargets.value.map((t) => (t === h ? { ...t, alts: idx == null ? alts : [...alts, { modId, minTierIndex: idx }] } : t));
    return;
  }
  const rest = s.simTargets.value.filter((t) => !(t.method === "fracture" && t.modId === modId));
  const fr = rest.filter((t) => t.method === "fracture");
  const others = rest.filter((t) => t.method !== "fracture" && t.modId !== modId);
  s.simTargets.value = idx == null ? [...fr, ...others] : [...fr, { modId, minTierIndex: idx, method: "fracture" as const }, ...others];
}
function toggle(r: ListRow): void {
  const cur = pickedOf(r);
  if (cur) { setCandidate(cur.modId, null); return; }
  if (blocked(r)) return;
  const t = topTier(r);
  if (!t) return;
  const { modId, idx } = idOf(r, t);
  if (idx >= 0) setCandidate(modId, idx);
}
function pickTier(r: ListRow, t: ListTier): void {
  if (blocked(r)) return;
  const cur = pickedOf(r);
  if (cur && !isHost(r)) setCandidate(cur.modId, null);
  const { modId, idx } = idOf(r, t);
  if (idx >= 0) setCandidate(modId, idx);
}
const isPickedTier = (r: ListRow, t: ListTier): boolean => {
  const c = pickedOf(r);
  if (!c) return false;
  const { modId, idx } = idOf(r, t);
  return c.modId === modId && c.minTierIndex === idx;
};
/** 選んだ段より上の段も入る (T2 以上なら T1 も) */
const isCoveredTier = (r: ListRow, t: ListTier): boolean => {
  const c = pickedOf(r);
  if (!c) return false;
  const { modId, idx } = idOf(r, t);
  return c.modId === modId && idx >= c.minTierIndex;
};
const expanded = ref<string | null>(null);
const pct = (x: number): string => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : x > 0 ? "<0.1%" : "—");
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 p-6" @click.self="emit('close')">
      <div class="flex max-h-[88vh] w-[1100px] max-w-full flex-col rounded-xl border border-emerald-400/40 bg-[#14120e] text-[12px] shadow-2xl">
        <div class="flex items-center gap-2 border-b border-white/10 px-4 py-2">
          <b v-if="host" class="text-sm text-amber-100">「{{ hostName }}」のあるいはを選ぶ</b>
          <b v-else class="text-sm text-emerald-100">① フラクチャーの候補を選ぶ</b>
          <span v-if="host" class="opacity-70">元の MOD とチェックした物のどれか 1 つが付けば当たり (1 MOD として数える。2 つ欲しい時は 3 の「⧉ コピー」) · 同じ側だけ</span>
          <span v-else class="opacity-60">{{ s.item.value?.baseJa }} · チェックで候補 (このアイテムレベルで届く一番上の段以上)、名前を押すと段を選べる · 候補は同じ側だけ · 出やすさは同じ側の重みの割合</span>
          <span class="ml-auto rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-100">{{ candidates.length }} 個</span>
          <button type="button" class="rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-1 font-bold text-emerald-100" @click="emit('close')">決定</button>
        </div>
        <div class="grid min-h-0 flex-1 grid-cols-2 max-md:grid-cols-1 gap-4 overflow-auto px-4 py-3">
          <div v-for="col in columns" :key="col.side" :class="lockedSide && lockedSide !== col.side ? 'opacity-35' : ''">
            <p class="mb-1 font-bold">{{ col.title }} <span class="font-normal opacity-50">{{ col.items.length }} 系統</span><span v-if="lockedSide && lockedSide !== col.side" class="ml-2 font-normal text-amber-300">候補と違う側は選べない</span></p>
            <div v-for="r in col.items" :key="r.id" class="mb-1">
              <!-- あるいはを選ぶ時は、元の MOD とほかの手順の MOD はグレー (2026-10-05 オーナー「＋を押したらその MOD はグレーアウトで、それ以外から探させる」) -->
              <div class="flex items-center gap-2 rounded px-2 py-1" :title="whyBlocked(r)" :class="isHost(r) || usedElsewhere(r) ? 'bg-white/[0.02] opacity-35' : pickedOf(r) ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50' : 'bg-white/[0.03] hover:bg-white/[0.06]'">
                <input type="checkbox" :checked="!!pickedOf(r) && !isHost(r)" :disabled="blocked(r) || isHost(r)" class="h-4 w-4 accent-emerald-400" @change="toggle(r)" />
                <button type="button" class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 text-left" @click="expanded = expanded === r.id ? null : r.id">
                  <span class="text-[13px] text-[#c8c8ff]">{{ r.text }}</span>
                  <span v-for="t in shownTags(r.tags)" :key="t" class="rounded-sm px-1 py-px text-[10px] leading-none" :class="TAG_STYLE[t]!.cls">{{ TAG_STYLE[t]!.ja }}</span>
                  <span v-if="isHost(r)" class="text-[10px] opacity-80">(元の MOD)</span><span v-if="pickedOf(r) && !isHost(r)" class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">T{{ (s.data.value?.mods.get(pickedOf(r)!.modId)?.tiers.length ?? 0) - pickedOf(r)!.minTierIndex }} 以上</span>
                </button>
                <span class="w-11 text-right font-bold tabular-nums text-amber-100">{{ pct(r.share) }}</span>
                <span class="min-w-[22px] rounded-sm bg-emerald-600/80 px-1 text-center text-[11px] font-bold text-white">{{ r.tiers.length }}</span>
              </div>
              <table v-if="expanded === r.id" class="mt-0.5 w-full text-[11px]">
                <tbody>
                  <tr v-for="t in r.tiers" :key="t.rank" class="border-b border-white/5" :class="t.ilvl > s.itemLevel.value ? 'opacity-40' : ''">
                    <td class="w-8 py-0.5 font-bold text-amber-200">{{ t.rank }}</td>
                    <td class="py-0.5 text-[#c8c8ff]">{{ t.text }}</td>
                    <td class="w-14 py-0.5 text-right tabular-nums opacity-70">Lv {{ t.ilvl }}</td>
                    <td class="w-20 py-0.5 text-right">
                      <button type="button" class="whitespace-nowrap rounded border px-1.5 text-[10px] disabled:opacity-30" :class="isPickedTier(r, t) ? 'border-emerald-400 bg-emerald-500/40 font-bold text-emerald-50' : isCoveredTier(r, t) ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-100' : 'border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/15'" :disabled="blocked(r)" :title="whyBlocked(r)" @click="pickTier(r, t)">{{ isCoveredTier(r, t) ? "✓ " : "" }}{{ t.rank }} 以上</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
