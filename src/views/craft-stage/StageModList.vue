<!--
  StageModList.vue — クラフトステージの「このベースに付く MOD」一覧 (2026-09-29)。表の土台は共通管理の ModTable.vue (for-share、2026-10-23 に分けた)、
  ここはエミュの物だけを差す: 持っているカレンシーで次に付く確率 (2026-10-09)・狙いのチェック欄とどれかが付く確率 (要望 c9dee700)・
  段の表の「次の手で狙う」(StageAimPicker)・「付ける」(ModAddPicker、要望 ⑱-2)・重みの札と直す 1 行 (StageWeightEdit)・カードの MOD から飛ぶ (modJump)。

  オーナー「そのベースに付く MOD 全て、アイテムレベルは無視して重み付きで。DB にならって。DB は見づらいので UI はシンプルに、色や形にこだわって」。
  置き場所: ステージの下 (カレンシーを打ちながら見られる)。見出しを押すと畳める。overlay = 手で打つ画面の重ね (MOD 一覧のボタン・Tab) の中
-->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { aimTierKey, heldAnyOf, heldOdds, type ListRow, type ListTier } from "../../services/craft-stage/engine";
import { fmtPct } from "../../utils/format-pct";
import { baseNameOf, tr } from "../../i18n/lang";
import { keepPlace, scrollToTop } from "../../utils/keep-place";
import { AIM_MAX, craftStage, nameOf } from "../../state/craft-stage";
import HelpTip from "../../components/ui/HelpTip.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import ModTable, { type ModSection } from "../../components/for-share/mod-list/ModTable.vue";
import StageWeightEdit from "./StageWeightEdit.vue"; // 重みの札 (推定・直した) と直す 1 行
import ModAddPicker from "./ModAddPicker.vue";

const props = defineProps<{ embedded?: boolean; overlay?: boolean }>();
const s = craftStage;
const item = computed(() => s.item.value);
const table = ref<InstanceType<typeof ModTable> | null>(null);
/** 始めの状態を組める (まだ打っていない・再生でない) */
const canStart = computed(() => !s.log.value.length && !s.replay.value);
/**
 * 持っているカレンシーで次に付く確率 (エミュレーターでカレンシーを持っている時だけ。2026-10-09 オーナー「持った時の挙動が UI 的に全然足りてない」)。
 * 計算はエンジンの heldOdds (打つ処理・計算機と同じ決まり。tests/held-odds-parity.test.ts)。null = 持っていない / MOD を足さない物
 */
const heldCands = computed(() => {
  const k = s.held.value, d = s.data.value, it = item.value;
  if (!k || !d || !it || s.mode.value !== "hand" || s.replay.value) return null;
  const h = heldOdds(d, it, k, s.omens.value);
  return h ? { ...h, name: nameOf(k) } : null;
});
/** 段の番号はその MOD の段の表から (同じ系統をまとめた行は段が混ざるので、名前とレベルで引く) */
function tierIndexOf(modId: string, t: { name: string; ilvl: number }): number {
  return s.data.value?.mods.get(modId)?.tiers.findIndex((x) => x.name === t.name && x.ilvl === t.ilvl) ?? -1;
}
/** その行 (系統) が持っている物で付く確率。0 = 付かない */
function heldShare(r: ListRow): number {
  const h = heldCands.value;
  if (!h || !(h.total > 0)) return 0;
  const ids = new Set(r.tiers.map((t) => t.modId ?? r.id));
  let w = 0;
  for (const id of ids) w += h.byMod.get(id)?.w ?? 0;
  return w / h.total;
}
/** その段が持っている物で付く確率 (下限より下・アイテムレベルが届かない段は 0) */
function heldTierShare(r: ListRow, t: { name: string; ilvl: number; modId?: string }): number {
  const h = heldCands.value;
  if (!h || !(h.total > 0)) return 0;
  const id = t.modId ?? r.id;
  const idx = tierIndexOf(id, t);
  return (h.byMod.get(id)?.tiers.find((x) => x.index === idx)?.w ?? 0) / h.total;
}
/** 今は付かない行は 0% (同じ系統が付いている・差していないルーン。冒涜・異界は骨を持っている時だけ。2026-10-09 オーナー) */
const cannow = (r: ListRow): boolean => !r.blocked && !(r.group === "rune" && !r.socketed) && !((r.group === "desecrated" || r.group === "otherworldly") && !(heldCands.value && "bone" in heldCands.value));
/** 表の % と棒: 持っている時は付く確率、それ以外は出やすさ (同じ側の重みの割合) */
const shareOf = (r: ListRow): number => (!cannow(r) ? 0 : heldCands.value ? heldShare(r) : r.share);
const tierShareOf = (r: ListRow, t: ListTier): string => (!cannow(r) ? "0%" : heldCands.value ? fmtPct(heldTierShare(r, t)) : t.weight && r.weight ? fmtPct((r.share * t.weight) / r.weight) : "");
const rowDim = (r: ListRow): boolean => r.blocked || (!!heldCands.value && !heldShare(r)) || (r.group === "rune" && !r.socketed);
const rowTitle = (r: ListRow): string | undefined => (r.blocked ? tr("同じ系統の MOD が付いているので、今は付かない", "A mod from the same group is already on the item, so this cannot roll now") : heldCands.value && !heldShare(r) ? tr(`持っている ${heldCands.value.name} では付かない`, `Cannot roll with the held ${heldCands.value.name}`) : undefined);
const tierDim = (r: ListRow, t: ListTier): boolean => !!heldCands.value && !heldTierShare(r, t);
const tierTitle = (r: ListRow, t: ListTier): string | undefined => (heldCands.value && !heldTierShare(r, t) ? tr(`持っている ${heldCands.value.name} では付かない段 (強さの下限・アイテムレベル・同じ系統)`, `This tier cannot roll with the held ${heldCands.value.name} (minimum tier, item level, or same group)`) : undefined);
function shareTitle(r: ListRow): string {
  const h = heldCands.value;
  if (h) return "bone" in h ? tr(`持っている ${h.name} の次の発現で、候補 3 つに出る確率 (専用 MOD 1〜3 個 + 残り普通。計算機と同じ)`, `Chance to appear among the 3 options on the next reveal with the held ${h.name} (1-3 desecrated-only mods + the rest normal, same as the calculator)`) : tr(`持っている ${h.name} で次に付く確率`, `Chance to roll next with the held ${h.name}`);
  return r.group === "desecrated" || r.group === "otherworldly" ? tr("骨を使わないと付かない (骨を持つと候補に出る確率)", "Only rolls via a Bone (hold a Bone to see the chance to be offered)") : tr("出やすさ (同じ側の重みの割合)", "Chance (share of weight on the same side)");
}
const shareHead = computed(() => (heldCands.value ? ("bone" in heldCands.value ? tr("候補に出る", "Offered") : tr("付く確率", "Chance")) : tr("出やすさ", "Weight")));
/** カレンシーを持っている時は、それで付く節を上に、付かない節を下に (2026-10-11 オーナー)。持っていない時は差していないルーンだけ下 */
const sectionLate = (sec: ModSection): boolean => (heldCands.value ? !sec.columns.some((c) => c.items.some((r) => heldShare(r) > 0)) : sec.rune != null && !sec.socketed);

/**
 * 狙う MOD を幾つか選んで「どれか 1 つでも付く確率」(2026-10-12 要望 c9dee700、オーナー「カレンシー持ったら MOD の横にチェック欄、
 * キャンセルや付けたらリセット」)。持つ物を変えた・離した・打った・ベースを変えた時は空に戻す
 */
const aimSel = ref<Set<string>>(new Set());
watch([() => s.held.value, () => s.log.value[s.log.value.length - 1]?.out.index ?? 0, () => s.base.value], () => { if (aimSel.value.size) aimSel.value = new Set(); });
const rowAimKeys = (r: ListRow): string[] => r.tiers.filter((t) => heldTierShare(r, t) > 0).map((t) => aimTierKey(t.modId ?? r.id, tierIndexOf(t.modId ?? r.id, t)));
const rowAimState = (r: ListRow): "all" | "some" | "none" => {
  const ks = rowAimKeys(r);
  const n = ks.filter((k) => aimSel.value.has(k)).length;
  return n && n === ks.length ? "all" : n ? "some" : "none";
};
/** 行のチェック: 付きうる段を全部入れる / 全部外す */
function toggleAimRow(r: ListRow): void {
  const next = new Set(aimSel.value);
  const ks = rowAimKeys(r);
  if (rowAimState(r) === "all") for (const k of ks) next.delete(k); else for (const k of ks) next.add(k);
  aimSel.value = next;
}
const rankNum = (rank: string): number => Number(String(rank).replace(/^T/, "")) || 0;
/** 段のチェック: 入れる時はその段以上 (T4 なら T1〜T4) も入れる、外す時はその段だけ (2026-10-12 オーナー) */
function toggleAimTier(r: ListRow, t: ListTier): void {
  const next = new Set(aimSel.value);
  const k = aimTierKey(t.modId ?? r.id, tierIndexOf(t.modId ?? r.id, t));
  if (next.has(k)) next.delete(k);
  else for (const u of r.tiers) if (rankNum(u.rank) <= rankNum(t.rank) && heldTierShare(r, u) > 0) next.add(aimTierKey(u.modId ?? r.id, tierIndexOf(u.modId ?? r.id, u)));
  aimSel.value = next;
}
const isAimTier = (r: ListRow, t: ListTier): boolean => aimSel.value.has(aimTierKey(t.modId ?? r.id, tierIndexOf(t.modId ?? r.id, t)));
/** 選んだ系統の数 (帯の「選んだ N 個」) */
const aimRows = computed(() => {
  let n = 0;
  for (const sec of table.value?.sections ?? []) for (const col of sec.columns) for (const r of col.items) if (rowAimState(r) !== "none") n++;
  return n;
});
const aimAny = computed(() => {
  const h = heldCands.value, d = s.data.value, it = item.value, k = s.held.value;
  if (!h || !d || !it || !k || !aimSel.value.size) return null;
  return heldAnyOf(d, it, k, s.omens.value, aimSel.value, h);
});
/** 骨を持っているが、この部位に冒涜専用の MOD (変質した鎖骨なら異界も) が無い */
const noDesecrated = computed(() => {
  const h = heldCands.value, c = table.value?.counts;
  if (!h || !("bone" in h) || !c) return false;
  return !c.desecrated && !(s.held.value === "desecrate_altered" && c.otherworldly);
});

/** エミュレーターの「次の手で狙う」(その段以上)。狙い中の段をもう一度押すとやめる。押したら選ぶ窓 (StageAimPicker.vue) を開く */
function isAim(modId: string, t: { name: string; ilvl: number }): boolean {
  const idx = tierIndexOf(modId, t);
  return s.aims.value.some((a) => a.modId === modId && a.minTierIndex === idx);
}
/** 窓では押した段が最初からチェック済み (ほかの MOD も足せる。1 つだけならそのまま「確率を見る」) */
function aimAt(modId: string, t: { name: string; ilvl: number; rank: string; text: string }, el: Element): void {
  // やめる: 上の確率の一覧が消えて押した段が上へずれ、次のタップが棚に当たっていた (2026-10-09 スマホで確認)。押した段を同じ高さに残す
  if (isAim(modId, t)) { keepPlace(el, () => { s.aims.value = s.aims.value.filter((a) => a.modId !== modId); }); return; }
  const idx = tierIndexOf(modId, t);
  if (idx < 0) return;
  s.aimPicker.value = { seed: { modId, minTierIndex: idx, label: `${t.text} (${tr(`${t.rank} 以上`, `${t.rank}+`)})`, at: `${modId}:${t.rank}` } };
}

/** 畳んだかどうか (見る人ごとの好み。保存できなくても動く) */
const KEY = "exiledesk.craftStage.modListOpen";
const open = ref(true);
try { open.value = localStorage.getItem(KEY) !== "0"; } catch { /* 無くてよい */ }
watch(open, (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 無くてよい */ } });
/** クラフトへ: カードの頭 (ベースの枠の下) が画面の上に来るまで一気に戻る */
function toCraft(): void { scrollToTop(document.querySelector("[data-craft-top]"), "auto"); }
/** カードの MOD を押した: その MOD の行へ飛ぶ (アイテムに付いている段は枠で囲む)。窓は開いたばかりなので 1 枚待ち、済んだら消す (次に Tab で開いた時に同じ行へ飛ばない) */
watch(() => s.modJump.value, (j) => {
  if (!j || (!props.overlay && !props.embedded)) return;
  open.value = true;
  void nextTick(() => {
    const it = s.item.value;
    const on = it ? [...it.prefixes, ...it.suffixes].find((m) => m.modId === j.modId) : undefined;
    if (!table.value?.jumpTo(j.modId, on?.tierName ?? null)) return;
    if (props.overlay) s.modJump.value = null;
  });
}, { immediate: true });
</script>

<template>
  <section data-mod-list class="@container text-[12px]" :class="props.embedded || props.overlay ? '' : 'g-panel mt-4'">
    <!-- 見出し (押すと畳む) -->
    <div v-if="!props.overlay" role="button" tabindex="0" :aria-expanded="open" class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left" @click="open = !open" @keydown.enter="open = !open">
      <b class="g-sec-title">{{ tr("このベースに付く MOD", "Mods for this base") }}</b>
      <span class="g-sec-sub max-md:hidden">{{ item ? baseNameOf(item) : "" }}</span>
      <HelpTip :text="tr(`出やすさ = 同じ側の重みの割合 (アイテムレベルは見ない)。段 = 段の数、Lv = T1 の MOD レベル${canStart ? '。段の表の「付ける」で始めの状態を組める' : ''}`, `Chance = share of weight on the same side (ignores item level). T = number of tiers, Lv = mod level of T1${canStart ? '. Use “Add” in the tier table to build the starting item' : ''}`)" @click.stop />
      <Disclosure tag="span" kind="section" :open="open" class="ml-auto" />
    </div>

    <div v-if="open" :class="props.overlay ? '' : 'border-t border-white/10 px-3 pb-3 pt-2'">
      <ModTable
        ref="table" :data="s.data.value" :item="item" :overlay="props.overlay"
        :share="shareOf" :tier-share="tierShareOf" :row-dim="rowDim" :tier-dim="tierDim" :row-title="rowTitle" :tier-title="tierTitle" :share-title="shareTitle"
        :share-head="shareHead" :tone="heldCands ? 'sky' : 'amber'" :section-late="sectionLate"
        :to-craft="!props.embedded && !props.overlay ? toCraft : undefined" :keep-open="['[data-mod-add-menu]', '[data-helptip-pop]']"
      >
        <!-- 狙いに選んだ MOD のどれかが付く確率 (チェック欄、要望 c9dee700) -->
        <template #toc-extra>
          <span v-if="aimAny != null" class="ml-2 flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-0.5 text-sky-100 max-md:shrink-0">
            {{ heldCands && "bone" in heldCands ? tr(`選んだ ${aimRows} 個のどれかが候補に出る`, `Any of ${aimRows} offered`) : tr(`選んだ ${aimRows} 個のどれかが付く`, `Any of ${aimRows} rolls`) }}
            <b class="tabular-nums">{{ fmtPct(aimAny) }}</b>
            <button type="button" class="rounded px-1 text-[11px] text-white/50 hover:bg-white/10 hover:text-white/85" :title="tr('選んだ狙いを外す', 'Clear the selection')" @click="aimSel = new Set()">×</button>
          </span>
        </template>
        <!-- 骨を持っているのに冒涜の節が無い部位 (セプターなど): 候補が普通の MOD だけになる事を書く (2026-10-11 オーナー「ないなら注意書きいる」) -->
        <template #notes>
          <p v-if="noDesecrated" class="-mt-2 mb-3 text-[11px] text-amber-200/80">{{ tr("この部位には冒涜専用の MOD が無いので、発現の候補 3 つは普通の MOD から選ばれる", "This item class has no Desecrated-only mods, so all 3 reveal options are normal mods") }}</p>
        </template>
        <!-- チェック欄の上の ? (狙いは複数選べる。要望 c9dee700) -->
        <template #col-lead>
          <span v-if="heldCands" class="flex w-5 shrink-0 justify-center self-center"><HelpTip :text="tr('狙う MOD は複数選べます (段の表で「その段以上」も)。選んだどれか 1 つでも付く確率を上に出します (打つ・持つ物を変えると外れます)', 'You can tick several target mods (or a tier and better in the tier table). The chance that any one of them rolls is shown at the top (cleared when you use or change the held item)')" /></span>
        </template>
        <template #row-lead="{ row: r }">
          <label v-if="heldCands" class="flex w-5 shrink-0 cursor-pointer justify-center self-stretch" :class="heldShare(r) ? '' : 'pointer-events-none opacity-25'" :title="tr('狙いに入れる (付きうる段を全部。段の表で段ごとにも選べる)', 'Add to targets (all tiers that can roll; pick tiers in the tier table)')">
            <input type="checkbox" class="accent-sky-400" :checked="rowAimState(r) === 'all'" :indeterminate="rowAimState(r) === 'some'" :disabled="!heldShare(r)" @change="toggleAimRow(r)" />
          </label>
        </template>
        <!-- 重みを借りた MOD の印は文字の札で (2026-10-18 オーナーの UI 点検) -->
        <template #row-badge="{ row: r }"><StageWeightEdit :row="r" badge /></template>
        <!-- 段の表の上に重みを直す 1 行 -->
        <template #row-open="{ row: r }"><StageWeightEdit :row="r" /></template>
        <!-- 段のチェック: その段以上を狙いに (外す時はその段だけ) -->
        <template #tier-lead="{ row: r, tier: t }">
          <td v-if="heldCands" class="w-5 py-0.5 text-center"><input type="checkbox" class="accent-sky-400 align-middle" :checked="isAimTier(r, t)" :disabled="!heldTierShare(r, t)" :title="tr(`${t.rank} 以上を狙いに入れる`, `Target ${t.rank} or better`)" @click.stop @change="toggleAimTier(r, t)" /></td>
        </template>
        <template #tier-actions="{ row: r, tier: t }">
          <td v-if="!s.replay.value" class="py-0.5 pl-2">
            <!-- ボタンは乗せた段だけ (12 段全部に並ぶとボタンの壁だった。2026-10-18 オーナーの UI 点検)。狙い中・プルダウンを開いている段とスマホは出したまま -->
            <div class="flex flex-nowrap items-center justify-end gap-1 transition-opacity max-md:flex-wrap md:group-hover:opacity-100 md:focus-within:opacity-100 md:has-[[aria-expanded=true]]:opacity-100" :class="isAim(t.modId ?? r.id, t) ? '' : 'md:opacity-0'">
            <!-- 次の手で狙う (いつでも): 今の状態から打った時にこの段以上が付く確率を、打ち方ごとに棚の上へ (2026-10-09 オーナー)。押すと選ぶ窓 -->
            <button type="button" :data-aim-at="`${t.modId ?? r.id}:${t.rank}`" :data-rec="`aim:${t.modId ?? r.id}:${t.rank}`" class="tbtn" :class="isAim(t.modId ?? r.id, t) ? 'on' : ''" :title="isAim(t.modId ?? r.id, t) ? tr('もう一度押すとやめる', 'Click again to stop') : tr(`次の 1 手で ${t.rank} 以上が付く確率を打ち方ごとに出す (ほかの MOD も ${AIM_MAX} つまで一緒に狙える)`, `Show the chance of ${t.rank}+ rolling on the next move for each method (target up to ${AIM_MAX} mods together)`)" @click.stop="aimAt(t.modId ?? r.id, t, $event.currentTarget as Element)">{{ isAim(t.modId ?? r.id, t) ? tr("狙い中", "Targeting") : tr("次の手で狙う", "Target next move") }}</button>
            <!-- 付ける: 付け方 (普通 / フラクチャー / 冒涜 / エッセンス) を選ぶ (ModAddPicker.vue、2026-10-17) -->
            <ModAddPicker :group="r.group" :mod-id="t.modId ?? r.id" :rank="t.rank" />
            </div>
          </td>
        </template>
      </ModTable>
    </div>
  </section>
</template>
