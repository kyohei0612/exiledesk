<!--
  BuildDiff.vue — 比べる相手との差 (2026-10-03 オーナー「自分に足りない MOD をそれぞれ出したい。ユニークは装備ごと、
  レアは足りない MOD だけ『これからこれ』。火力比較で」)

  上: 相手のキャラと、上のバーのスキルの DPS (自分 → 相手の同じ名前のスキル、無ければ相手の一番高いスキル)。
      「相手のビルドをゲームのビルドプランナーに書き出す」(2026-10-03) もここ。
  中: ジェム (2026-10-03 オーナー「ジェムも」): 相手の組ごとに、自分に無い組は組ごと、ある組は足りないジェム / 低いレベル・品質だけ。
  下: 欄ごとに ユニーク = 「名前 → 名前」、レア = 足りない / 弱い MOD の行だけ「自分の行 → 相手の行」。差の無い欄は出さない。
  決まりは services/pob-check/build-diff.ts

  取り入れたら (2026-10-03 オーナー「まんま真似できないけど部分的に真似できる所、ここだけ真似しようかな」): 「試算する」で差の 1 項目ずつ
  (相手の装備 1 つ / 組 1 つ / ツリーのまとまり 1 つ) を自分に当てた時の DPS とライフ等の変化を PoB で計算し (ビルドは変えない)、
  大きい順に並べる。「取り入れる」で本当に自分のビルドに入れる。ユニークは行ごとの効き (「ここが効く」) と「取引所で探す」、
  レアは足りない MOD で「取引所で探す」(代替品 B。値段の自動取得は入れない = 外部 API は叩かず URL を開くだけ)
-->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import itemsJaClient from "../../i18n/items-ja-client.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import { gemJa, type GemView, type ItemView, type Summary } from "../../services/pob-check/api";
import { diffBuilds, diffGems, type AdoptCandidate } from "../../services/pob-check/build-diff";
import { linesToJa, rareNameJa } from "../../services/pob-check/item-text";
import { slotJa } from "../../services/pob-check/slots";
import { openTradeQuery, prepareTradeLinks, rareModsSearchQuery, uniqueSearchQuery } from "../../services/pob-check/trade-links";
import { pobRawToCopy } from "../../services/pob-check/to-craft";
import { openCraftPaste } from "../../state/app-nav";
import type { Estimate, EstimateAll, SkillRow } from "./usePobCheck";
import { fmtNum } from "./fmt";
import DiffBadge from "./DiffBadge.vue";
import GemName from "../../components/decor/GemName.vue";
import GemIcon from "../../components/decor/GemIcon.vue";
import ItemArt from "../../components/decor/ItemArt.vue";
import BuildItemName from "../../components/build-copy/BuildItemName.vue";
import { toBuildItem } from "../../services/pob-check/hover-item";

const props = defineProps<{
  mine: Summary;
  target: Summary;
  targetFrom: string;
  focus: SkillRow | null;
  /** 相手のビルドプランナーの中身があるか (読み込んだ時に作れなかったら押せない) */
  canPlan: boolean;
  /** 書き出した後に出す文 */
  planMsg: string;
  busy: boolean;
  /** 取り入れの試算 (usePobCheck)。candidates = 対象の数 (0 なら「試算する」を出さない) */
  candidates: AdoptCandidate[];
  estimates: { list: Estimate[]; dps: number; quiet: number; all: EstimateAll | null; treeBased: boolean } | null;
  estimating: boolean;
  /** 裏の順番待ちが回っている (まだのスキルは「順番待ち」、止まっていれば「未試算」) */
  queued?: boolean;
  cancelling?: boolean;
  estimateProgress: string;
  /** 試算した後に自分を変えた = もう一度試算 */
  adopted: Set<string>;
}>();
const emit = defineEmits<{ (e: "clear"): void; (e: "plan"): void; (e: "cancel"): void; (e: "adopt", c: AdoptCandidate, done: (err: string | null) => void): void; (e: "focus", key: string): void }>();


// ---------------------------------------------------------------- 取り入れたら
/** 試算の行の「何を」 */
const what = (c: AdoptCandidate): string => {
  if (c.kind === "item") return `${slotJa(c.slot)} ${c.unique ? "(ユニーク)" : "(レア)"}`;
  if (c.kind === "jewel") return "ジュエル (ツリー)";
  if (c.kind === "gems") return `${gemJa(c.active.name)} の組にリネージュ`;
  return "ツリーを丸ごと";
};
/** 試算の結果のうちツリー (見出しの下に大きく 1 行) と、それ以外 (表) */
const treeEst = computed(() => props.estimates?.list.find((e) => e.c.kind === "tree") ?? null);
const rowEsts = computed(() => props.estimates?.list.filter((e) => e.c.kind !== "tree") ?? []);
/** 全部まとめて真似の段 */
const allSteps = computed(() => {
  const a = props.estimates?.all;
  if (!a || a.error) return [];
  // prev = 1 つ前の段 (% はその段からの伸び。行の % と比べやすい。2026-10-04 オーナー「% が合わないよ装備とジュエルで」)
  const base = props.estimates?.dps ?? 0;
  return [
    { label: "ツリーを相手と同じに", dps: a.tree, prev: base },
    { label: "＋ 装備・ジュエル", dps: a.items, prev: a.tree },
    { label: "＋ ジェム (Lv・サポート)", dps: a.gems, prev: a.items },
    ...(a.config != null ? [{ label: "＋ 設定 (チャージ・バフ等)", dps: a.config, prev: a.gems }] : []),
  ];
});
/** 全部真似した後に残る相手との差 (%) */
const restGap = computed(() => {
  const a = props.estimates?.all;
  const t = targetSkill.value;
  const last = a?.config ?? a?.gems ?? 0;
  if (!a || !t || last <= 0) return "";
  const d = (t.game.dps / last - 1) * 100;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`;
});
/** 試算する前の数 (見出しの説明) */
const candCount = computed(() => ({
  items: props.candidates.filter((c) => c.kind === "item").length,
  lineage: props.candidates.filter((c) => c.kind === "gems").length,
  jewels: props.candidates.filter((c) => c.kind === "jewel").length,
  tree: props.candidates.some((c) => c.kind === "tree"),
}));
/** 取り入れの失敗 (行の下に出す) */
const adoptErr = ref<Record<string, string>>({});
const adopting = ref<string | null>(null);
function onAdopt(c: AdoptCandidate): void {
  adopting.value = c.key;
  emit("adopt", c, (err) => {
    adopting.value = null;
    adoptErr.value = { ...adoptErr.value, [c.key]: err ?? "" };
  });
}
/** 取引所で探す (URL を開くだけ)。レアは足りない行、ユニークは名前 + ベース。条件にできない時は理由を行の下に */
const tradeMsg = ref<Record<string, string>>({});
onMounted(() => void prepareTradeLinks().catch(() => undefined));
async function onTrade(c: AdoptCandidate): Promise<void> {
  if (c.kind !== "item") return;
  try {
    if (c.unique) {
      await openTradeQuery(uniqueSearchQuery(c.to));
      return;
    }
    const q = rareModsSearchQuery(c.to.base, c.mods.map((m) => m.to));
    if (!q) {
      tradeMsg.value = { ...tradeMsg.value, [c.key]: "足りない行を取引所の条件にできませんでした" };
      return;
    }
    if (q.missing.length) tradeMsg.value = { ...tradeMsg.value, [c.key]: `条件にできない行は外しました: ${q.missing.map(lineJa).join("、")}` };
    await openTradeQuery(q.query);
  } catch (e) {
    tradeMsg.value = { ...tradeMsg.value, [c.key]: e instanceof Error ? e.message : String(e) };
  }
}
/** ライフ等の変化の表示 (0 は出さない) */
const delta = (v: number | undefined): string | null => (v && Math.round(v) !== 0 ? `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v))}` : null);

const gems = computed(() => diffGems(props.mine, props.target));
/**
 * ジェムの差のカード (2026-10-03 オーナー「全部『無し』になるし、自分と相手が分かりづらい」): 差の行だけ「無し → 名前」と並べるのをやめ、
 * 組の中身を **自分 | 相手** の 2 列に全部並べる。相手だけにある物は右を緑・左を「—」、自分だけの物は左を普通・右を「—」(薄く)、
 * 両方にあって相手が高い (Lv / 品質) 物は右の数字を緑、同じ物は薄く。何が足りて何が余っているかが一目で分かる
 */
interface GemCell {
  name: string;
  level: number;
  quality: number;
  support: boolean;
}
interface GemRow {
  mine: GemCell | null;
  target: GemCell | null;
  /** 相手の方が Lv か品質が高い */
  weaker: boolean;
}
const cellOf = (g: GemView): GemCell => ({ name: g.name, level: g.level, quality: g.quality, support: g.support });
const gemCards = computed(() => {
  const mineGroups = new Map(props.mine.groups.map((g) => [g.i, g]));
  return gems.value.groups.map((d) => {
    const targetGems = d.gems.map(cellOf);
    const mineGems = d.kind === "changes" ? (mineGroups.get(d.gi)?.gems.filter((x) => x.enabled).map(cellOf) ?? []) : [];
    const left = new Map<string, GemCell[]>();
    for (const x of mineGems) left.set(x.name, [...(left.get(x.name) ?? []), x]);
    const rows: GemRow[] = [];
    for (const t of targetGems) {
      const m = left.get(t.name)?.shift() ?? null;
      rows.push({ mine: m, target: t, weaker: !!m && (t.level > m.level || t.quality > m.quality) });
    }
    for (const rest of left.values()) for (const m of rest) rows.push({ mine: m, target: null, weaker: false });
    const diffCount = rows.filter((r) => !r.mine || !r.target || r.weaker).length;
    return { title: gemJa(d.active.name), en: d.active.name, missingGroup: d.kind === "missing", fromItem: d.fromItem, diffCount, rows };
  });
});
/** セルの数字 (Lv と品質。品質 0 は出さない)。名前はアイコン + GemName で出す */
const gemCellNums = (c: GemCell): string => `Lv${c.level}${c.quality ? ` 品質${c.quality}%` : ""}`;

const JA_BASE = itemsJaClient as Record<string, string>;
const JA_UNIQUE = uniqueNamesJa as Record<string, string>;
const nameJa = (it: ItemView | null): string => {
  if (!it) return "無し";
  const r = it.rarity.toUpperCase();
  const base = JA_BASE[it.base] ?? it.base;
  if (r === "UNIQUE") return `${JA_UNIQUE[it.title] ?? it.title} (${base})`;
  if (r === "RARE") return `${rareNameJa(it.title) ?? it.title} (${base})`;
  return base;
};

/** 名前にカーソルで開くカード (値段のタブと同じ BuildItemHoverCard) の中身。欄の名前も入る */
const hoverOf = (it: ItemView, slot: string) => toBuildItem(it, slot);

const diff = computed(() => diffBuilds(props.mine, props.target));

/** 相手のスキル: 上のバーと同じ名前の物、無ければ DPS が一番高い物 */
const targetSkill = computed(() => {
  const all = props.target.groups.filter((g) => g.enabled && !g.duplicateOf).flatMap((g) => g.skills);
  const same = props.focus ? all.filter((s) => s.name === props.focus!.s.name).sort((a, b) => b.game.dps - a.game.dps)[0] : undefined;
  return same ?? all.sort((a, b) => b.game.dps - a.game.dps)[0] ?? null;
});

/** MOD の行の日本語 (英語 → 日本語は辞書の逆引き。まとめて 1 回) */
const ja = shallowRef<Map<string, string>>(new Map());
/** 英語の行をまとめて日本語にして ja に足す */
async function addJa(lines: Iterable<string>): Promise<void> {
  const arr = [...new Set(lines)].filter((l) => !ja.value.has(l));
  if (!arr.length) return;
  const out = await linesToJa(arr);
  ja.value = new Map([...ja.value, ...arr.map((l, i): [string, string] => [l, out[i] ?? l])]);
}
watch(
  diff,
  (d) => {
    const lines = new Set<string>();
    for (const s of d.slots) if (s.kind === "mods") for (const m of s.mods) { if (m.from) lines.add(m.from); lines.add(m.to); }
    void addJa(lines);
  },
  { immediate: true },
);
// ユニークの「ここが効く」の行も日本語に
watch(
  () => props.estimates,
  (e) => void addJa((e?.list ?? []).flatMap((x) => (x.lines ?? []).map((l) => l.line))),
  { immediate: true },
);
const lineJa = (l: string): string => ja.value.get(l) ?? l;
const stat = (s: Summary, k: string): number => (typeof s.stats[k] === "number" ? (s.stats[k] as number) : 0);
const STATS = [
  { k: "Life", label: "ライフ" },
  { k: "EnergyShield", label: "ES" },
  { k: "Mana", label: "マナ" },
  { k: "FireResist", label: "火" },
  { k: "ColdResist", label: "冷" },
  { k: "LightningResist", label: "雷" },
  { k: "ChaosResist", label: "混" },
];
</script>

<template>
  <!--
    2026-10-03 見た目の整理: 3 節 (取り入れたら / ジェム / 装備) の見出しは .sec-title で同じ字・同じ余白、枠は .card で同じ。
    主役は DPS の変化 (上の「自分 → 相手」の大きな数字と、取り入れたらの DPS の列)。注記は .note で薄く小さく、取引所は小さなリンク
  -->
  <div class="mb-6 space-y-5">
    <!-- 相手 (細い 1 段)。DPS の 自分 → 相手 は画面の上のバーに出す (2026-10-04 作り直し) -->
    <section class="card px-4 py-3">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p class="text-[13px] font-bold">
          比べる相手: {{ target.char.ascendancy || target.char.class }}
          <span class="ml-1 font-normal text-[var(--exile-color-text-tertiary)]">Lv {{ target.char.level }}</span>
          <span class="note ml-2 font-normal">{{ targetFrom }} から</span>
        </p>
        <span class="ml-auto flex items-center gap-1.5">
          <!-- 相手のツリーとジェムをゲームのビルドプランナー (.build) に。中身は相手を読み込んだ時に作ってある -->
          <button
            type="button"
            class="btn btn-sm btn-outline"
            :disabled="!canPlan || busy"
            :title="canPlan ? '相手のパッシブとジェムを Documents/My Games/Path of Exile 2/BuildPlanner に .build で書く。ゲームのビルドプランナーの一覧に出る' : '相手を読み込んだ時にビルドプランナーの中身を作れませんでした (相手を読み直す)'"
            @click="emit('plan')"
          >相手をビルドプランナーに書き出す</button>
          <button type="button" class="btn btn-sm btn-ghost" @click="emit('clear')">相手を外す</button>
        </span>
        <span v-if="planMsg" class="basis-full text-[11px] text-emerald-200">{{ planMsg }}</span>
      </div>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span v-for="s in STATS" :key="s.k" class="chip">
          <span class="chip-label">{{ s.label }}</span>
          <span class="chip-value">{{ Math.round(stat(mine, s.k)) }}</span>
          <span class="text-[var(--exile-color-text-tertiary)]">→</span>
          <span class="chip-value text-sky-200">{{ Math.round(stat(target, s.k)) }}</span>
        </span>
      </div>
    </section>

    <!--
      火力の差 試算 (2026-10-04 オーナー「試算をわかりやすく、ちっさすぎてこれメインなのに」「試算は火力の差試算って感じ」): この画面の主役。
      ツリーは丸ごと真似した時の 1 行 (振り直しで真似するので 1 つずつは出さない)、表は装備 (火力が変わらない物は出さない) / リネージュ / ジュエル
    -->
    <section v-if="focus && candidates.length" class="card border-amber-400/40 p-4">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <!-- 試算は「比較する」・スキルの選び直しで自動 (2026-10-04 オーナー「試算ボタンいらんよな設計上」)。見出しと進み具合だけ -->
        <h2 class="text-lg font-bold text-amber-100">火力の差</h2>
        <span v-if="estimating" class="flex items-center gap-1.5 text-[12px] text-amber-200/90"><span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />試算中… {{ estimateProgress }}
          <button type="button" class="ml-1 rounded-md border border-white/20 px-2 py-px text-[11px] text-[var(--exile-color-text-secondary)] hover:bg-white/10" :disabled="cancelling" @click="emit('cancel')">{{ cancelling ? "止めています…" : "中止" }}</button></span>
        <span v-else-if="!estimates && queued" class="flex items-center gap-1.5 text-[12px] text-sky-200/80"><span class="h-2 w-2 animate-pulse rounded-full bg-sky-300" />順番待ち (今のスキルが済んだら次に試算)</span>
        <span v-else-if="!estimates" class="text-[12px] text-[var(--exile-color-text-tertiary)]">まだ試算していません (中止した時など。スキルを選び直すと試算します)</span>
        <p class="note">
          相手の物を自分に入れたら {{ gemJa(focus.s.name) }} の DPS がどう変わるか (PoB の中で計算するだけで、ビルドは変えません)。
          対象: 装備 {{ candCount.items }} ・ リネージュ {{ candCount.lineage }} ・ ジュエル {{ candCount.jewels }}{{ candCount.tree ? " ・ ツリー" : "" }}
        </p>
      </div>

      <!-- 装備 / リネージュ / ジュエル、一番下に「その他: パッシブツリーのノード」(まとめて真似した時の 1 行) -->
      <table v-if="estimates && (rowEsts.length || treeEst)" class="mt-3 w-full text-[13px]">
        <thead>
          <tr class="border-b border-white/10 text-left text-[11px] text-[var(--exile-color-text-tertiary)]">
            <th class="py-1.5 pr-3 font-semibold">何を</th>
            <th class="py-1.5 pr-3 font-semibold">自分 → 相手</th>
            <th class="py-1.5 pr-3 text-right font-semibold">DPS</th>
            <th class="py-1.5 pr-3 text-right font-semibold">ライフ / ES</th>
            <th class="py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="e in rowEsts" :key="e.c.key">
            <tr class="border-t border-white/[0.06] align-top first:border-t-0">
              <td class="py-2 pr-3 font-semibold text-[var(--exile-color-text-secondary)]">
                <!-- 何を は文字だけ (2026-10-04 オーナー「アイコン有ったり無かったりするの統一感持たせて」)。絵とカードは右の 自分 → 相手 に -->
                <template v-if="e.c.kind === 'gems'">リネージュ <span class="note">({{ gemJa(e.c.active.name) }} の組)</span></template>
                <template v-else>{{ what(e.c) }}</template>
              </td>
              <td class="py-2 pr-3">
                <span v-if="e.c.kind === 'item' || e.c.kind === 'jewel'" class="inline-flex flex-wrap items-center gap-1.5">
                  <ItemArt v-if="e.c.from" :name="e.c.from.title" :base="e.c.from.base" :rarity="e.c.from.rarity" :size="28" />
                  <BuildItemName v-if="e.c.from" :item="hoverOf(e.c.from, e.c.slot)" :label="nameJa(e.c.from)" class="text-[var(--exile-color-text-tertiary)]" />
                  <span v-else class="text-rose-300/80">無し</span>
                  <span class="text-[var(--exile-color-text-tertiary)]">→</span>
                  <ItemArt :name="e.c.to.title" :base="e.c.to.base" :rarity="e.c.to.rarity" :size="28" />
                  <BuildItemName :item="hoverOf(e.c.to, e.c.slot)" :label="nameJa(e.c.to)" class="text-amber-200" />
                </span>
                <!-- 装備の行と同じ形: 無し → 絵 + 名前 (名前と絵どちらでもカード) -->
                <span v-else-if="e.c.kind === 'gems'" class="inline-flex flex-wrap items-center gap-1.5">
                  <span class="text-rose-300/80">無し</span>
                  <span class="text-[var(--exile-color-text-tertiary)]">→</span>
                  <template v-for="g in e.c.lineage ?? []" :key="g">
                    <span class="inline-flex items-center gap-1"><GemIcon :en="g" :size="28" kind="gem" hover /><GemName :en="g" :label="gemJa(g)" class="text-amber-200" /></span>
                  </template>
                </span>
              </td>
              <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                <template v-if="e.error"><span class="text-rose-300">—</span></template>
                <template v-else>
                  <span class="text-[17px] font-bold">{{ fmtNum(e.dps) }}</span>
                  <DiffBadge class="ml-1.5" :now="e.dps" :before="e.baseDps ?? estimates.dps" />
                  <p v-if="e.baseDps != null" class="note text-right">ツリーとジェムを相手と同じにした時 {{ fmtNum(e.baseDps) }} から</p>
                </template>
              </td>
              <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                <template v-if="!e.error">
                  <span v-if="delta(e.stats.Life)" :class="e.stats.Life > 0 ? 'text-emerald-300' : 'text-rose-300'">ライフ {{ delta(e.stats.Life) }}</span>
                  <span v-if="delta(e.stats.EnergyShield)" class="ml-2" :class="e.stats.EnergyShield > 0 ? 'text-emerald-300' : 'text-rose-300'">ES {{ delta(e.stats.EnergyShield) }}</span>
                  <span v-if="!delta(e.stats.Life) && !delta(e.stats.EnergyShield)" class="text-[var(--exile-color-text-tertiary)]">—</span>
                </template>
              </td>
              <td class="whitespace-nowrap py-1.5 text-right">
                <button
                  v-if="!e.error"
                  type="button"
                  class="btn btn-sm btn-outline"
                  :disabled="busy || estimating || adopting === e.c.key || adopted.has(e.c.key)"
                  :title="e.c.kind === 'gems' ? '自分の組にリネージュのサポートを足す' : e.c.kind === 'jewel' ? '相手のジュエルを同じ穴に入れる (穴を取っていなければ始点からの道も取る)' : '相手の物を自分の欄に入れる (元に戻すは装備のタブ)'"
                  @click="onAdopt(e.c)"
                >{{ adopted.has(e.c.key) ? "取り入れた" : adopting === e.c.key ? "入れています…" : "取り入れる" }}</button>
              </td>
            </tr>
            <tr v-if="e.error || adoptErr[e.c.key] || tradeMsg[e.c.key] || e.lines?.length || e.c.kind === 'item' || e.displaced || e.unknown || e.focusLost || e.socketAdded || e.unusedSet">
              <td></td>
              <td colspan="4" class="note pb-2 pr-3 leading-snug">
                <p v-if="e.error" class="text-rose-300">試算できませんでした: {{ e.error }}</p>
                <p v-if="adoptErr[e.c.key]" class="text-rose-300">{{ adoptErr[e.c.key] }}</p>
                <p v-if="e.lines?.length">
                  ここが効く:
                  <span v-for="(l, i) in e.lines" :key="i" class="ml-1.5 text-emerald-200/90">{{ lineJa(l.line) }} <span class="text-emerald-300">(+{{ (l.loss * 100).toFixed(1) }}%)</span></span>
                </p>
                <p v-if="e.displaced" class="text-amber-200/80">両手武器なので {{ e.displaced.map((s) => slotJa(s)).join("、") }} が外れます</p>
                <p v-if="e.unusedSet" class="text-amber-200/80">使っていない武器セットの欄なので、今の DPS は変わりません (武器セットを切り替えると効く)</p>
                <p v-if="e.focusLost" class="text-rose-300">この構成にすると {{ gemJa(focus?.s.name ?? "") }} がこの組から無くなります (DPS は出せない)</p>
                <p v-if="e.unknown" class="text-amber-200/80">PoB が知らないジェムは計算に入っていません: {{ e.unknown.map(gemJa).join("、") }}</p>
                <p v-if="e.socketAdded">自分はこの穴を取っていないので、穴も取ったとして計算しています (道は見ていない)</p>
                <p v-if="e.c.kind === 'item'">
                  <button type="button" class="btn-link" :title="e.c.unique ? '相手のユニーク (名前 + ベース) を取引所で探す (URL を開くだけ)' : '足りない MOD の行を条件にして取引所で探す (数値はそのまま下限。URL を開くだけ)'" @click="onTrade(e.c)">取引所で探す ↗</button>
                  <span v-if="tradeMsg[e.c.key]" class="ml-2">{{ tradeMsg[e.c.key] }}</span>
                </p>
              </td>
            </tr>
          </template>
          <!-- その他: パッシブツリーのノード (2026-10-04 オーナー「ノードで変わる奴は一番下に、その他ノードで火力が変わる系の文言でまとめて」) -->
          <template v-if="treeEst">
            <tr class="border-t-2 border-white/15 align-top">
              <td class="py-2 pr-3 font-semibold text-[var(--exile-color-text-secondary)]">その他: パッシブツリー</td>
              <td class="py-2 pr-3">
                <span class="text-amber-200">ノードをまとめて相手と同じにする</span>
                <span class="note ml-1.5">(足す {{ treeEst.n ?? 0 }} ・ 外す {{ treeEst.removed ?? 0 }})</span>
              </td>
              <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                <template v-if="treeEst.error"><span class="text-rose-300">—</span></template>
                <template v-else>
                  <span class="text-[17px] font-bold">{{ fmtNum(treeEst.dps) }}</span>
                  <DiffBadge class="ml-1.5" :now="treeEst.dps" :before="estimates.dps" />
                </template>
              </td>
              <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                <template v-if="!treeEst.error">
                  <span v-if="delta(treeEst.stats.Life)" :class="treeEst.stats.Life > 0 ? 'text-emerald-300' : 'text-rose-300'">ライフ {{ delta(treeEst.stats.Life) }}</span>
                  <span v-if="delta(treeEst.stats.EnergyShield)" class="ml-2" :class="treeEst.stats.EnergyShield > 0 ? 'text-emerald-300' : 'text-rose-300'">ES {{ delta(treeEst.stats.EnergyShield) }}</span>
                  <span v-if="!delta(treeEst.stats.Life) && !delta(treeEst.stats.EnergyShield)" class="text-[var(--exile-color-text-tertiary)]">—</span>
                </template>
              </td>
              <td></td>
            </tr>
            <tr>
              <td></td>
              <td colspan="4" class="note pb-2 pr-3 leading-snug">
                <p v-if="treeEst.error" class="text-rose-300">試算できませんでした: {{ treeEst.error }}</p>
                <p v-else>ノードで火力が変わる分をまとめた数字です (振り直しで真似する前提。つながる道は見ていない)</p>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
      <!-- 全部まとめて真似すると (2026-10-04 オーナー「全部足したら 207% のはずが 30%」「基準はノード類は真似前提」): ツリー → 装備 → ジェム と重ねる -->
      <div v-if="estimates?.all" class="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-3">
        <p class="mb-2 text-[14px] font-bold text-amber-100">全部まとめて真似すると</p>
        <p v-if="estimates.all.error" class="text-rose-300">試算できませんでした: {{ estimates.all.error }}</p>
        <div v-else class="flex flex-wrap items-end gap-x-3 gap-y-2 tabular-nums">
          <div>
            <p class="note">今</p>
            <p class="text-[17px] font-bold">{{ fmtNum(estimates.dps) }}</p>
          </div>
          <template v-for="st in allSteps" :key="st.label">
            <span class="pb-1 text-[var(--exile-color-text-tertiary)]">→</span>
            <div>
              <p class="note">{{ st.label }}</p>
              <p class="text-[17px] font-bold text-amber-200">{{ fmtNum(st.dps) }} <DiffBadge :now="st.dps" :before="st.prev" /></p>
              <p class="note">前の段から・今から {{ estimates.dps > 0 ? `${st.dps >= estimates.dps ? "+" : "−"}${Math.abs((st.dps / estimates.dps - 1) * 100).toFixed(1)}%` : "" }}</p>
            </div>
          </template>
          <template v-if="targetSkill && targetSkill.name === focus.s.name">
            <span class="pb-1 text-[var(--exile-color-text-tertiary)]">／</span>
            <div>
              <p class="note">相手</p>
              <p class="text-[17px] font-bold text-sky-200">{{ fmtNum(targetSkill.game.dps) }} <DiffBadge :now="targetSkill.game.dps" :before="estimates.dps" /></p>
            </div>
          </template>
        </div>
        <p v-if="!estimates.all.error && targetSkill && targetSkill.name === focus.s.name" class="note mt-2">
          全部真似しても相手と {{ restGap }} 違う分は、真似できない所の差です<template v-if="mine.char.level !== target.char.level"> (キャラのレベル 自分 {{ mine.char.level }} ／ 相手 {{ target.char.level }}。レベルでライフ・マナ・属性が変わる)</template>。ツリーは属性ノードの選び方まで相手と同じにしています。DPS はゲーム内の表記と同じ物差しで、仮想敵 (敵の設定) は見ていません。
        </p>
      </div>
      <p v-if="estimates" class="note mt-2">
        DPS は上のバーのスキルの、入れた後の見込み (自分の行と同じ物差し)。1 項目ずつの数字なので合計ではありません。
        <template v-if="estimates.treeBased">装備・ジュエル・リネージュの行は、ツリー・装備・ジュエル・ジェム (サポート込み) を全部相手と同じにした中での効きです (それだけ自分の物に戻す・外すと下がる分。揃って初めて効く分も入る)。数字は「ツリーとジェムを相手と同じにした時」の DPS に、その効きを掛けた物です。</template>
        <template v-if="estimates.quiet">火力が変わらない装備・ジュエル {{ estimates.quiet }} 個は出していません。</template>
      </p>
    </section>

    <!-- 細かい差 (ジェムの Lv・サポート / 装備の MOD)。火力の差 試算と被るので畳む (2026-10-04 オーナー「相手との差で装備とかジェムとか被ってる」) -->
    <details class="card px-4 py-3">
      <summary class="cursor-pointer select-none text-[13px] font-semibold text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]">細かい差 (装備の MOD・ジェムの Lv / サポート)</summary>
      <div class="mt-3 space-y-5">
    <section>
      <h2 class="sec-title">
        ジェム
        <span class="sec-note">
          <template v-if="!gems.groups.length">差はありません (相手の組は全部あって、ジェムも足りている)</template>
          <template v-else>相手の組 {{ gems.groups.length }} 個に差</template>
          <template v-if="gems.onlyMine"> ・ 自分だけの組 {{ gems.onlyMine }} 個</template>
        </span>
      </h2>
      <div v-if="gems.groups.length" class="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <div v-for="(c, ci) in gemCards" :key="ci" class="card p-3">
          <p class="flex items-center gap-2 text-[12px]">
            <GemIcon :en="c.en" :size="20" />
            <span class="font-bold text-amber-200"><GemName :en="c.en" :label="c.title" /></span>
            <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ c.missingGroup ? "自分に無い組" : `の組 ・ 差 ${c.diffCount} 件` }}</span>
            <span v-if="c.fromItem" class="text-[10px] text-sky-300/70" title="アミュレットやセプターなど装備が与えるスキル。アクティブの Lv / 品質は装備で決まるので、付けているサポートだけ比べる">装備が与えるスキル ・ サポートだけ比べる</span>
          </p>
          <!-- 自分 | 相手 の 2 列。見出しを毎カードに付けて、どちらが誰かを迷わせない -->
          <div class="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-[11px] leading-snug">
            <p class="diff-col-head">自分</p>
            <p class="diff-col-head diff-col-head-target">相手</p>
            <!-- 各セル: アイコン + 名前 (カーソルでカード。サポートも) + Lv / 品質。行の高さは 1 行のまま (アイコンは字の高さ) -->
            <template v-for="(r, ri) in c.rows" :key="ri">
              <p class="flex min-w-0 items-center gap-1" :class="r.mine ? (r.weaker ? 'text-[var(--exile-color-text-tertiary)]' : r.target ? 'text-[var(--exile-color-text-secondary)]' : 'text-[var(--exile-color-text-primary)]') : 'text-[var(--exile-color-text-tertiary)]'">
                <template v-if="r.mine">
                  <GemIcon :en="r.mine.name" :size="16" />
                  <GemName :en="r.mine.name" :label="gemJa(r.mine.name)" class="truncate" />
                  <span class="shrink-0 tabular-nums">{{ gemCellNums(r.mine) }}</span>
                </template>
                <template v-else>—</template>
              </p>
              <p class="flex min-w-0 items-center gap-1" :class="r.target ? (!r.mine || r.weaker ? 'font-semibold text-emerald-200' : 'text-[var(--exile-color-text-secondary)]') : 'text-[var(--exile-color-text-tertiary)]'">
                <template v-if="r.target">
                  <GemIcon :en="r.target.name" :size="16" />
                  <GemName :en="r.target.name" :label="gemJa(r.target.name)" class="truncate" />
                  <span class="shrink-0 tabular-nums">{{ gemCellNums(r.target) }}</span>
                </template>
                <template v-else>—</template>
              </p>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- 欄ごとの差 -->
    <section>
      <h2 class="sec-title">
        装備
        <span class="sec-note">
          <template v-if="!diff.slots.length">差はありません (同じユニーク、または相手より弱い MOD が無い)</template>
          <template v-else>欄 {{ diff.slots.length }} つに差 ・ ユニークは装備ごと、レアは足りない MOD の行だけ</template>
        </span>
      </h2>
      <div v-if="diff.slots.length" class="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <template v-for="d in diff.slots" :key="d.slot">
          <div v-if="d.kind === 'unique'" class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">{{ slotJa(d.slot) }} — ユニーク (装備ごと)</p>
            <!-- 絵を左右に並べて真ん中に → (2026-10-03 オーナー「アイコンで比較できる UI」)。名前にカーソルでアイテムのカード -->
            <div class="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 text-[12px]">
              <div class="flex min-w-0 items-center gap-1.5">
                <ItemArt v-if="d.from" :name="d.from.title" :base="d.from.base" :rarity="d.from.rarity" :size="36" />
                <BuildItemName v-if="d.from" :item="hoverOf(d.from, d.slot)" :label="nameJa(d.from)" class="min-w-0 text-[var(--exile-color-text-secondary)]" />
                <span v-else class="text-rose-300/80">無し</span>
              </div>
              <span class="text-[var(--exile-color-text-tertiary)]">→</span>
              <div class="flex min-w-0 items-center gap-1.5">
                <ItemArt :name="d.to.title" :base="d.to.base" :rarity="d.to.rarity" :size="36" />
                <BuildItemName :item="hoverOf(d.to, d.slot)" :label="nameJa(d.to)" class="min-w-0 font-bold text-amber-200" />
              </div>
            </div>
          </div>
          <div v-else-if="d.kind === 'mods'" class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">{{ slotJa(d.slot) }} — 足りない MOD {{ d.mods.length }} 行</p>
            <!-- 自分の物 → 相手の物 (絵と名前。名前にカーソルでアイテムのカード) -->
            <div class="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 text-[11px]">
              <div class="flex min-w-0 items-center gap-1.5">
                <ItemArt v-if="d.from" :name="d.from.title" :base="d.from.base" :rarity="d.from.rarity" :size="28" />
                <BuildItemName v-if="d.from" :item="hoverOf(d.from, d.slot)" :label="nameJa(d.from)" class="min-w-0 text-[var(--exile-color-text-secondary)]" />
                <span v-else class="text-rose-300/80">無し</span>
              </div>
              <span class="text-[var(--exile-color-text-tertiary)]">→</span>
              <div class="flex min-w-0 items-center gap-1.5">
                <ItemArt :name="d.to.title" :base="d.to.base" :rarity="d.to.rarity" :size="28" />
                <BuildItemName :item="hoverOf(d.to, d.slot)" :label="nameJa(d.to)" class="min-w-0 text-amber-200" />
                <!-- 相手の装備をまるごとクラフト計算機へ (2026-10-03、その 5) -->
                <button v-if="d.to.raw" type="button" class="btn-link ml-auto shrink-0" title="相手のこの装備 (MOD 全部) をクラフト計算機に貼って、作り方と費用を出す" @click="openCraftPaste(pobRawToCopy(d.to.raw))">この装備を作る ↗</button>
              </div>
            </div>
            <div class="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 text-[11px]">
              <p class="diff-col-head">自分</p>
              <span />
              <p class="diff-col-head diff-col-head-target">相手</p>
            </div>
            <ul class="mt-1 space-y-1 text-[12px] leading-snug">
              <li v-for="(m, i) in d.mods" :key="i" class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2">
                <span :class="m.from ? 'text-[var(--exile-color-text-secondary)]' : 'text-rose-300/80'">{{ m.from ? lineJa(m.from) : "無し" }}</span>
                <span class="text-[var(--exile-color-text-tertiary)]">→</span>
                <span class="text-emerald-200">{{ lineJa(m.to) }}</span>
              </li>
            </ul>
          </div>
        </template>
      </div>
      <p class="note mt-2">
        ジュエル: 自分 {{ diff.jewels.mine }} 個 / 相手 {{ diff.jewels.target }} 個 (穴の位置が人ごとに違うので数だけ)。相手の装備は読み込んだ時の写しで、相手の DPS はゲーム内の表記に寄せた同じ物差しです。
      </p>
    </section>
      </div>
    </details>
  </div>
</template>
