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
import passivesJa from "../../i18n/passives-ja-client.json";
import { gemJa, type ItemView, type Summary } from "../../services/pob-check/api";
import { diffBuilds, diffGems, type AdoptCandidate, type GemLineDiff } from "../../services/pob-check/build-diff";
import { linesToJa, rareNameJa } from "../../services/pob-check/item-text";
import { slotJa } from "../../services/pob-check/slots";
import { openTradeQuery, prepareTradeLinks, rareModsSearchQuery, uniqueSearchQuery } from "../../services/pob-check/trade-links";
import type { Estimate, SkillRow } from "./usePobCheck";
import { fmtNum } from "./fmt";
import DiffBadge from "./DiffBadge.vue";

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
  estimates: { list: Estimate[]; dps: number } | null;
  estimating: boolean;
  estimateProgress: string;
  /** 試算した後に自分を変えた = もう一度試算 */
  estimatesStale: boolean;
  adopted: Set<string>;
}>();
const emit = defineEmits<{ (e: "clear"): void; (e: "plan"): void; (e: "estimate"): void; (e: "adopt", c: AdoptCandidate, done: (err: string | null) => void): void }>();

// ---------------------------------------------------------------- 取り入れたら
const PASSIVE_JA = passivesJa as Record<string, string>;
/** 試算の行の「何を」 */
const what = (c: AdoptCandidate): string => {
  if (c.kind === "item") return `${slotJa(c.slot)} ${c.unique ? "(ユニーク)" : "(レア)"}`;
  if (c.kind === "gems") return `${gemJa(c.active.name)} の組${c.gi ? "" : " (組を足す)"}`;
  return `${c.names.map((n) => PASSIVE_JA[n] ?? n).join(" / ")} (${c.ids.length} ノード)`;
};
/** 試算の行の「自分 → 相手」(短く) */
const fromTo = (c: AdoptCandidate): { from: string; to: string } => {
  if (c.kind === "item") return { from: nameJa(c.from), to: nameJa(c.to) };
  if (c.kind === "gems") return c.gi ? { from: `差 ${c.lines.length} 件`, to: "相手の構成" } : { from: "無し", to: c.gems.map((g) => gemJa(g.name)).join("、") };
  return { from: "取っていない", to: "ツリーに足す" };
};
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
/** ジェムの差の行の文 (「無し → 名前」「Lv 20 → Lv 21」「品質 0% → 20%」) */
const gemLine = (l: GemLineDiff): { gem: string; from: string; to: string } => {
  const gem = gemJa(l.gem);
  if (l.kind === "missing") return { gem, from: "無し", to: gem };
  if (l.kind === "level") return { gem, from: `Lv ${l.from}`, to: `Lv ${l.to}` };
  return { gem, from: `品質 ${l.from}%`, to: `品質 ${l.to}%` };
};

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
    <!-- 相手と火力 -->
    <section class="card p-4">
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
      <!-- DPS の変化 (主役) -->
      <div v-if="focus && targetSkill" class="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
        <div>
          <p class="note">自分 — {{ gemJa(focus.s.name) }}</p>
          <p class="text-3xl font-black leading-none tabular-nums text-amber-200">{{ fmtNum(focus.s.game.dps) }}</p>
        </div>
        <p class="pb-0.5 text-2xl leading-none text-[var(--exile-color-text-tertiary)]">→</p>
        <div>
          <p class="note">相手 — {{ gemJa(targetSkill.name) }}<span v-if="targetSkill.name !== focus.s.name"> (同じスキルが無いので一番高い物)</span></p>
          <p class="text-3xl font-black leading-none tabular-nums text-sky-200">{{ fmtNum(targetSkill.game.dps) }}</p>
        </div>
        <DiffBadge class="mb-0.5" :now="targetSkill.game.dps" :before="focus.s.game.dps" size="lg" />
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <span v-for="s in STATS" :key="s.k" class="chip">
          <span class="chip-label">{{ s.label }}</span>
          <span class="chip-value">{{ Math.round(stat(mine, s.k)) }}</span>
          <span class="text-[var(--exile-color-text-tertiary)]">→</span>
          <span class="chip-value text-sky-200">{{ Math.round(stat(target, s.k)) }}</span>
        </span>
      </div>
    </section>

    <!-- 取り入れたら: 差の 1 項目ずつを自分に当てた時の変化 (PoB で試算、ビルドは変えない) -->
    <section v-if="focus && candidates.length">
      <h2 class="sec-title items-center">
        取り入れたら
        <span class="sec-note">差の {{ candidates.length }} 項目 (装備 / 組 / ツリーのまとまり) を 1 つずつ自分に当てた時の {{ gemJa(focus.s.name) }} の DPS</span>
        <span class="ml-auto flex items-center gap-2">
          <span v-if="estimatesStale && !estimating" class="rounded-full bg-amber-500/15 px-2 py-px text-[11px] font-normal text-amber-200">自分のビルドを変えたので数字が古い</span>
          <button
            type="button"
            class="btn btn-sm btn-outline btn-accent"
            :disabled="estimating || busy"
            :title="'1 項目 1〜3 秒。PoB の中で計算するだけで、ビルドは変えません'"
            @click="emit('estimate')"
          >{{ estimating ? `試算中… ${estimateProgress}` : estimates ? "もう一度試算" : "試算する" }}</button>
        </span>
      </h2>
      <div v-if="estimates" class="card overflow-hidden">
        <table class="w-full text-[12px]">
          <thead>
            <tr class="border-b border-white/10 text-left text-[10px] text-[var(--exile-color-text-tertiary)]">
              <th class="px-3 py-1.5 font-semibold">何を</th>
              <th class="py-1.5 pr-3 font-semibold">自分 → 相手</th>
              <th class="py-1.5 pr-3 text-right font-semibold">DPS</th>
              <th class="py-1.5 pr-3 text-right font-semibold">ライフ / ES</th>
              <th class="py-1.5 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="e in estimates.list" :key="e.c.key">
              <tr class="border-t border-white/[0.06] align-top first:border-t-0">
                <td class="px-3 py-2 font-semibold text-[var(--exile-color-text-secondary)]">{{ what(e.c) }}</td>
                <td class="py-2 pr-3">
                  <span :class="e.c.kind === 'item' && !e.c.from ? 'text-rose-300/80' : 'text-[var(--exile-color-text-tertiary)]'">{{ fromTo(e.c).from }}</span>
                  <span class="mx-1.5 text-[var(--exile-color-text-tertiary)]">→</span>
                  <span class="text-amber-200">{{ fromTo(e.c).to }}</span>
                </td>
                <!-- DPS の変化 (この表の主役なので大きく) -->
                <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                  <template v-if="e.error"><span class="text-rose-300">—</span></template>
                  <template v-else>
                    <span class="text-[15px] font-bold">{{ fmtNum(e.dps) }}</span>
                    <DiffBadge class="ml-1.5" :now="e.dps" :before="estimates.dps" />
                  </template>
                </td>
                <td class="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                  <template v-if="!e.error">
                    <span v-if="delta(e.stats.Life)" :class="e.stats.Life > 0 ? 'text-emerald-300' : 'text-rose-300'">ライフ {{ delta(e.stats.Life) }}</span>
                    <span v-if="delta(e.stats.EnergyShield)" class="ml-2" :class="e.stats.EnergyShield > 0 ? 'text-emerald-300' : 'text-rose-300'">ES {{ delta(e.stats.EnergyShield) }}</span>
                    <span v-if="!delta(e.stats.Life) && !delta(e.stats.EnergyShield)" class="text-[var(--exile-color-text-tertiary)]">—</span>
                  </template>
                </td>
                <td class="whitespace-nowrap py-1.5 pr-3 text-right">
                  <button
                    v-if="!e.error"
                    type="button"
                    class="btn btn-sm btn-outline"
                    :disabled="busy || estimating || adopting === e.c.key || adopted.has(e.c.key)"
                    :title="e.c.kind === 'nodes' ? '束のノードを 1 つずつ取る (始点からの道も取る。つながらないノードがあれば止めて理由を出す)' : e.c.kind === 'gems' ? (e.c.gi ? '自分の組のジェムを相手の構成に差し替える' : '相手の組を自分に足す (装着先の欄は無し)') : '相手の物を自分の欄に入れる (元に戻すは装備のタブ)'"
                    @click="onAdopt(e.c)"
                  >{{ adopted.has(e.c.key) ? "取り入れた" : adopting === e.c.key ? "入れています…" : "取り入れる" }}</button>
                </td>
              </tr>
              <!-- 行の下: 失敗 / ここが効く / 取引所で探す / 注記 (薄く小さく) -->
              <tr v-if="e.error || adoptErr[e.c.key] || tradeMsg[e.c.key] || e.lines?.length || e.c.kind === 'item' || e.displaced || e.unknown || e.focusLost || e.c.kind === 'nodes'">
                <td></td>
                <td colspan="4" class="note pb-2 pr-3 leading-snug">
                  <p v-if="e.error" class="text-rose-300">試算できませんでした: {{ e.error }}</p>
                  <p v-if="adoptErr[e.c.key]" class="text-rose-300">{{ adoptErr[e.c.key] }}</p>
                  <p v-if="e.lines?.length">
                    ここが効く:
                    <span v-for="(l, i) in e.lines" :key="i" class="ml-1.5 text-emerald-200/90">{{ lineJa(l.line) }} <span class="text-emerald-300">(+{{ (l.loss * 100).toFixed(1) }}%)</span></span>
                  </p>
                  <p v-if="e.displaced" class="text-amber-200/80">両手武器なので {{ e.displaced.map((s) => slotJa(s)).join("、") }} が外れます</p>
                  <p v-if="e.unusedSet" class="text-amber-200/80">使っていない武器セットの欄なので、今の DPS は変わりません (装備のタブで武器セットを切り替えると効く)</p>
                  <p v-if="e.focusLost" class="text-rose-300">この構成にすると {{ gemJa(focus?.s.name ?? "") }} がこの組から無くなります (DPS は出せない)</p>
                  <p v-if="e.unknown" class="text-amber-200/80">PoB が知らないジェムは計算に入っていません: {{ e.unknown.map(gemJa).join("、") }}</p>
                  <p v-if="e.c.kind === 'nodes'">全部取れたとしての数字です (つながる道は見ていない。取り入れる時は始点からの道も一緒に取る)</p>
                  <p v-if="e.c.kind === 'item'">
                    <button type="button" class="btn-link" :title="e.c.unique ? '相手のユニーク (名前 + ベース) を取引所で探す (URL を開くだけ)' : '足りない MOD の行を条件にして取引所で探す (数値はそのまま下限。URL を開くだけ)'" @click="onTrade(e.c)">取引所で探す ↗</button>
                    <span v-if="tradeMsg[e.c.key]" class="ml-2">{{ tradeMsg[e.c.key] }}</span>
                  </p>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p v-if="estimates" class="note mt-2">
        DPS は上のバーのスキルの、取り入れた後の見込み (自分の行と同じ物差し)。1 項目ずつの数字なので、2 つ以上を取り入れた時の合計ではありません。
      </p>
    </section>

    <!-- ジェムの差 (相手の組ごと) -->
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
        <template v-for="(g, gi) in gems.groups" :key="gi">
          <div v-if="g.kind === 'missing'" class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">{{ gemJa(g.active.name) }} — 自分に無い組</p>
            <p class="mt-1.5 text-[13px]">
              <span class="text-rose-300/80">無し</span>
              <span class="mx-2 text-[var(--exile-color-text-tertiary)]">→</span>
              <span class="font-bold text-amber-200">{{ gemJa(g.active.name) }}</span>
              <span v-if="g.others.length" class="text-emerald-200"> + {{ g.others.map((x) => gemJa(x.name)).join("、") }}</span>
            </p>
          </div>
          <div v-else class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">{{ gemJa(g.active.name) }} の組 — 足りない / 低い {{ g.lines.length }} 件</p>
            <ul class="mt-1.5 space-y-1 text-[12px] leading-snug">
              <li v-for="(l, i) in g.lines" :key="i" class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-2">
                <span :class="l.kind === 'missing' ? 'text-rose-300/80' : 'text-[var(--exile-color-text-secondary)]'">{{ l.kind === "missing" ? "無し" : `${gemLine(l).gem} ${gemLine(l).from}` }}</span>
                <span class="text-[var(--exile-color-text-tertiary)]">→</span>
                <span class="text-emerald-200">{{ l.kind === "missing" ? gemLine(l).to : `${gemLine(l).gem} ${gemLine(l).to}` }}</span>
              </li>
            </ul>
          </div>
        </template>
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
            <p class="mt-1.5 text-[13px]">
              <span :class="d.from ? 'text-[var(--exile-color-text-secondary)]' : 'text-rose-300/80'">{{ nameJa(d.from) }}</span>
              <span class="mx-2 text-[var(--exile-color-text-tertiary)]">→</span>
              <span class="font-bold text-amber-200">{{ nameJa(d.to) }}</span>
            </p>
          </div>
          <div v-else-if="d.kind === 'mods'" class="card p-3">
            <p class="text-[11px] font-semibold text-[var(--exile-color-text-tertiary)]">
              {{ slotJa(d.slot) }} — 足りない MOD {{ d.mods.length }} 行
              <span class="ml-1 font-normal">({{ nameJa(d.from) }} → {{ nameJa(d.to) }})</span>
            </p>
            <ul class="mt-1.5 space-y-1 text-[12px] leading-snug">
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
</template>
