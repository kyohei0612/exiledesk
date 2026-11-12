<!--
  DailyFracPick.vue — 始め方とフラクチャー予定の MOD を選ぶ画面 (D-37c・D-37j)。
  1 段目 = どこから始めるか: (a) フラクチャー付きのレアから / (b) ベースから (選んだ MOD は必ず付き、費用は 3 回に 1 回成功として数える、D-03)。
  2 段目 = フラクチャー予定の MOD。どちらの段も左にシミュ / エミュと同じ完成形のカード (StageItemCard、use-tree の goalItem)、右 (狭い幅は下) に選ぶ物 (D-37l)。
  右の MOD に乗せている間だけ、左のカードの同じ行をフラクチャーの色で見せる (下見、スイッチ dailyNoFracNote、11-12。その前は 11-09 オーナー「ハイライトいらんかもな」で強調なし)。始めの値段はどちらも数えない (D-03)
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { tr } from "../../i18n/lang";
import StageItemCard from "../../components/for-share/item/StageItemCard.vue";
import { useTree } from "../simulator/tree/use-tree";
import { startFromWords } from "../simulator/tree/tree-names";
import { tierRankLabel } from "../../services/craft-stage/engine";
import { craftStage as s } from "../../state/craft-stage";
import STAT_ORDER from "../../data/stat-order.json";
import type { StartFrom } from "../../services/simulator/tree/tree-model";
import type { DailyAim } from "./daily-api";
import { NO_FRAC } from "./daily-aims";
import { flag } from "../../web/release-flags";
import DailyEssNote from "./DailyEssNote.vue";

const props = defineProps<{ base: string; ilvl: number; aims: readonly DailyAim[]; /** 開発版の見本 (dev=frac) だけ: 2 段目から開く */ initialFrom?: StartFrom; /** (b) 白から確定フラクチャーだけの日 (D-03、fourOnlyOn)。1 段目を出さず、始め方を選び直させない */ fourOnly?: boolean; /** お題の id (注意書きの字を完成の物差しの日の門に合わせる、D-37e3) */ day?: string }>();
const emit = defineEmits<{ pick: [modId: string, from: StartFrom] }>();
const t = useTree();
/** 1 段目で選んだ始め方 (null = まだ選んでいない) */
const from = ref<StartFrom | null>(props.fourOnly ? "four" : (props.initialFrom ?? null));
/** 完成形のカードはお題の狙いを付けた形 (木の完成形と同じ作り)。選んだ後の木はお題から作り直すので、ここで狙いを入れても残らない */
onMounted(() => {
  t.startTreeWith(props.base, props.ilvl);
  t.edit((d) => { d.memoAims = props.aims.map((a) => ({ modId: a.modId, tier: a.tier })); d.goal = { rarity: "rare" }; delete d.ilvlFit; });
});
const card = computed(() => t.goalItem.value?.item ?? null);
const aimText = (a: DailyAim): string => t.aimShort({ modId: a.modId, tier: a.tier });
/** シミュの始め方の窓 (S-13) の (a) / (b) と同じ文 (1 か所 = tree-names の startFromWords、D-37j)。✦ は 1 つなので確定フラクチャーの素材は ×3 */
const FROMS: Array<{ k: StartFrom; title: [string, string]; sub: [string, string] }> = startFromWords(1);
/** 1 段目の文 (D-37l、11-09 夜にオーナーの言葉で言い直した)。細かい文 (FROMS の sub) は押す物の説明に */
const SHORT: Record<StartFrom, { title: [string, string]; sub: [string, string] }> = {
  fractured: { title: ["フラクチャー付きのレアから", "From a fractured rare"], sub: ["1 MOD をフラクチャーした状態から始める", "Start with one mod already fractured"] },
  four: { title: ["ベースから", "From the base"], sub: ["MOD の無い品から始める。フラクチャーは選んだ MOD が必ず付き、費用は 3 回に 1 回成功 (33%) として数える", "Start with no mods. Fracturing always fixes the chosen mod; its cost counts as 1 success in 3 tries (33%)"] },
};
/**
 * 2 段目の MOD の行はカードと同じ並び (D-37l、11-09 夜オーナー「完成と並びが一致しない」)。カード (StageItemCard の rowGroup 無し) の並べ方の写し:
 * 説明文の表の順 (stat-order.json)、表に無い MOD があればプレ → サフィで分ける (お題の狙いに冒涜は無い)。カードに無い狙いは後ろへ
 */
const ordered = computed<readonly DailyAim[]>(() => {
  const c = card.value, d = s.data.value;
  if (!c) return props.aims;
  const rows = [...c.prefixes.map((m) => ({ m, suf: 0 })), ...c.suffixes.map((m) => ({ m, suf: 1 }))].map((r, i) => {
    const em = d?.mods.get(r.m.modId);
    const st = (r.m as { stats?: string[] }).stats?.[0] ?? (em?.tiers?.[0] as { stats?: string[] } | undefined)?.stats?.[0];
    return { ...r, i, ord: st != null ? (STAT_ORDER as Record<string, number>)[st] ?? 1e9 : 1e9 };
  });
  const bySide = rows.some((r) => r.ord >= 1e9);
  rows.sort((x, y) => (bySide ? x.suf - y.suf : 0) || x.ord - y.ord || x.i - y.i);
  const rank = new Map(rows.map((r, k) => [r.m.modId, k] as const));
  const at = (a: DailyAim): number => rank.get(a.modId) ?? rows.length + props.aims.indexOf(a);
  return [...props.aims].sort((x, y) => at(x) - at(y));
});
const chosen = computed(() => FROMS.find((o) => o.k === from.value) ?? null);
/**
 * 右の MOD に乗せている間 (キーボードで選んでいる間も)、左のカードの同じ MOD の行をフラクチャーの色で見せる = 「これを選ぶとこの行がフラクチャーになる」の下見。
 * 離したら戻る (D-37j、スイッチ dailyNoFracNote。11-12 オーナー「右のMODホバー時にカードではフラクチャーの色で合わせて表示してあげたらいい感じ」、11-09 の「ハイライトいらんかもな」はこの形に替えた)。
 * 共有のカード (StageItemCard) は触らず、行の印 data-card-mod に色の印を付け外しするだけ
 */
const peek = ref<string | null>(null);
const root = ref<HTMLElement | null>(null);
watch(peek, (id) => {
  const card = root.value?.querySelector("[data-daily-frac-card]");
  if (!card) return;
  for (const el of card.querySelectorAll("[data-frac-peek]")) el.removeAttribute("data-frac-peek");
  if (id && flag("dailyNoFracNote")) for (const el of card.querySelectorAll(`[data-card-mod="${CSS.escape(id)}"]`)) el.setAttribute("data-frac-peek", "");
});
</script>

<template>
  <section ref="root" data-daily-frac :data-daily-frac-step="from ? 'mod' : 'from'" class="daily-frac">
    <h2 class="daily-frac-title">{{ chosen ? tr("フラクチャー予定の MOD を選択してください", "Choose the mod you plan to fracture") : tr("どこから始めるか", "Where to start") }}</h2>
    <div class="daily-frac-body">
      <!-- 完成形のカード (両方の段で同じ、D-37l) -->
      <div class="daily-frac-card" data-daily-frac-card>
        <StageItemCard v-if="card" :item="card" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="400" compact tier-at-least />
        <p v-else class="text-[14px] opacity-70">{{ tr("読み込み中", "Loading") }}</p>
        <DailyEssNote v-if="card" :day="day" style="max-width: 400px" />
      </div>
      <div v-if="!chosen" class="min-w-0">
        <ul class="daily-frac-from" :aria-label="tr('始め方', 'How to start')">
          <li v-for="o in FROMS" :key="o.k">
            <button type="button" class="daily-frac-opt" data-daily-frac-from :data-from="o.k" :title="tr(...o.sub)" @click="from = o.k">
              <b>{{ tr(...SHORT[o.k].title) }}</b><span>{{ tr(...SHORT[o.k].sub) }}</span>
            </button>
          </li>
        </ul>
        <p class="mt-3 text-[13px] opacity-70">{{ tr("どちらもベースの値段は数えない。次にフラクチャーする MOD を選ぶ。", "The base costs nothing either way. Next, pick the mod to fracture.") }}</p>
      </div>
      <div v-else class="min-w-0">
        <p class="daily-frac-now mb-3 text-[14px]">
          <span data-daily-frac-chosen>{{ tr(`始め方: ${SHORT[chosen.k].title[0]}`, `Start: ${SHORT[chosen.k].title[1]}`) }}</span>
          <button v-if="!fourOnly" type="button" class="g-btn sm" data-daily-frac-back @click="from = null">{{ tr("始め方を選び直す", "Change how to start") }}</button>
        </p>
        <!-- 上の説明も下と同じ注意書きの枠で (D-37j、11-12 オーナー「を注意書きで表示させてくれ」。「MOD の無い品から始める」は外した) -->
        <p v-if="fourOnly && flag('dailyNoFracNote')" class="daily-frac-none-note daily-frac-top-note" data-daily-frac-four-note role="note">
          <span aria-hidden="true">⚠</span>
          <span>{{ tr("下記で選んだ MOD が、", "The mod you pick below ") }}<b>{{ tr("フラクチャーの時に必ず付与されます。", "is always applied when you fracture.") }}</b>{{ tr("費用は 3 回に 1 回成功 (33%) として数えます。", " Its cost counts as 1 success in 3 tries (33%).") }}</span>
        </p>
        <p v-else-if="fourOnly" class="mb-3 text-[13px] opacity-70" data-daily-frac-four-note>{{ tr(...SHORT.four.sub) }}</p>
        <ul class="daily-frac-list" :aria-label="tr('フラクチャー予定の MOD', 'Mod to fracture')">
          <li v-for="a in ordered" :key="a.modId">
            <button type="button" class="daily-frac-row" data-daily-frac-pick :data-mod="a.modId" @mouseenter="peek = a.modId" @mouseleave="peek = null" @focus="peek = a.modId" @blur="peek = null" @click="emit('pick', a.modId, chosen.k)">
              <span>{{ aimText(a) }}</span><small>{{ tierRankLabel(a.tier) }}</small>
            </button>
          </li>
        </ul>
        <!-- フラクチャー無し (D-03・D-37j、11-12 のお題から): 並びと分けた金の枠のボタン (11-11 オーナー「ボタンがフラクチャー無しの目立つ感じで」)。白い品のまま始める、フラクチャーの費用は 0 -->
        <div v-if="fourOnly" class="daily-frac-none">
          <span class="daily-frac-none-or">{{ tr("または", "or") }}</span>
          <button type="button" class="g-btn" data-daily-frac-none :data-mod="NO_FRAC" @click="emit('pick', NO_FRAC, 'four')">{{ tr("フラクチャー無しで始める", "Start without fracturing") }}</button>
          <template v-if="flag('dailyNoFracNote')">
            <small>{{ tr("MOD の無い白い品のまま始める", "Start from the plain base with no mods") }}</small>
            <!-- 注意書き (D-37j、11-12 オーナー「目立たせて注意書き的な」): 金の縦線と一段明るい地。赤い光は残り時間だけ (D-60b) なので使わない -->
            <p class="daily-frac-none-note" data-daily-frac-none-note role="note">
              <span aria-hidden="true">⚠</span>
              <span>{{ tr("フラクチャーの費用は 0。", "Fracture cost is 0.") }}<b>{{ tr("代わりにフラクチャーオーブは打てません。", " In exchange, you cannot use a Fracturing Orb.") }}</b></span>
            </p>
          </template>
          <small v-else>{{ tr("MOD の無い白い品のまま始める (フラクチャーの費用は 0)", "Start from the plain base with no mods (no fracture cost)") }}</small>
        </div>
      </div>
    </div>
  </section>
</template>
