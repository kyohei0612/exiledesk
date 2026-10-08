<!--
  StageOutcomeTree.vue — 形の表 (2026-10-09 オーナーと決めた形)。
  狙いの側の「今の形」(狙い h・狙い以外 j・空き) ごとに 1 行。行ごとに打つ物を 1 つ選ぶと、その下に「打つとこうなる」を確率付きで出し、
  行き先は表の別の行 (クリックで飛ぶ)。通ってきた道ではなく今の形だけで決める: 打った結果は今の形だけで決まるので、同じ形なら同じ手でいい
  (道ごとに決める木は同じ形に違う手が付き、枝が増え続けた)。
  計算は recipe-sim の policy (キー `${h}-${j}` → 打つ物 / 次の手 / 最初から)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { iconOf, nameOf } from "../../state/craft-stage";
import { setByKey, type PatternSet, type PolicyAct } from "../../services/craft-stage/pattern";

const props = defineProps<{
  /** この手の打つ物 */
  set: PatternSet;
  /** 狙いの側 */
  side: "prefix" | "suffix";
  /** 側の枠 (3) */
  limit: number;
  /** この側で揃える狙いの数 (揃ったらこの手は終わり) */
  need: number;
  /** 打つ前の狙い・狙い以外 */
  h0: number;
  j0: number;
  policy: Record<string, PolicyAct>;
  /** 選べる打つ物 (全部のセット) */
  sets: readonly PatternSet[];
  /** 高貴で 1 つ付けた時に狙いが出る確率 (打つ物の通貨・今の狙いの数で)。分からなければ null */
  pHit?: (currency: string, h: number) => number | null;
  steps?: Array<{ n: number; label: string }>;
  /**
   * 反対の側の消せる MOD の数 (固定は消えない)。0 なら素の消去も必ず狙いの側に刺さる
   * (2026-10-09 オーナー「プレフィックスから作るんだからサフィはフラクチャーされてる、普通に消去」)
   */
  otherRemovable?: number;
  /** 決めていない形の動き (付かなかったらの札) */
  fallback?: string;
  locked?: boolean;
}>();
const emit = defineEmits<{ change: [policy: Record<string, PolicyAct>] }>();

const SIDE_JA = computed(() => (props.side === "prefix" ? "プレ" : "サフィ"));
const L = computed(() => (props.side === "prefix" ? "左" : "右"));
const sideOmen = (kind: "exalt" | "annul" | "chaos"): string => (kind === "exalt" ? (props.side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation") : kind === "annul" ? (props.side === "prefix" ? "OmenofSinistralAnnulment" : "OmenofDextralAnnulment") : props.side === "prefix" ? "OmenofSinistralErasure" : "OmenofDextralErasure");
const GREATER = "OmenofGreaterExaltation";

type K = "exalt" | "annul" | "chaos";
const KINDS: Array<{ k: K; ja: string; icon: string }> = [{ k: "exalt", ja: "高貴", icon: "exalt" }, { k: "annul", ja: "消去", icon: "annul" }, { k: "chaos", ja: "カオス", icon: "chaos" }];
const STRENGTHS: Record<K, Array<{ c: string; ja: string }>> = {
  exalt: [{ c: "exalt", ja: "無印" }, { c: "exalt_greater", ja: "上級" }, { c: "exalt_perfect", ja: "完全" }],
  annul: [{ c: "annul", ja: "" }],
  chaos: [{ c: "chaos", ja: "無印" }, { c: "chaos_greater", ja: "上級" }, { c: "chaos_perfect", ja: "完全" }],
};
/**
 * 付け外しできるお告げ (狙いの側のお告げと、側に関係ない物)。反対の側のお告げは出さない: 狙いの側の形が変わらない
 * (2026-10-09 オーナー「左側で高貴つけてんのに反対側についた場合どうしますか、みたいな選択肢は意味わからんから無くす」)
 */
const omenOpts = (k: K): Array<{ o: string; ja: string }> => (k === "exalt" ? [{ o: sideOmen("exalt"), ja: L.value }, { o: GREATER, ja: "偉大" }, { o: "OmenofCatalysingExaltation", ja: "触媒" }] : k === "annul" ? [{ o: sideOmen("annul"), ja: L.value }] : [{ o: sideOmen("chaos"), ja: L.value }, { o: "OmenofWhittling", ja: "削減" }]);
const find = (kind: string, currency: string, omens: readonly string[]): PatternSet | undefined => props.sets.find((x) => x.kind === kind && x.currency === currency && x.omens.length === omens.length && omens.every((o) => x.omens.includes(o)));
/** 種類を選んだ時の最初の形 (高貴は完全 + 側、消去は側、カオスは無印) */
const firstOf = (k: K): PatternSet | undefined => (k === "exalt" ? find("exalt", "exalt_perfect", [sideOmen("exalt")]) ?? find("exalt", "exalt", []) : k === "annul" ? find("annul", "annul", []) ?? find("annul", "annul", [sideOmen("annul")]) : find("chaos", "chaos", []));
const OMEN_JA: Record<string, string> = { OmenofSinistralExaltation: "左", OmenofDextralExaltation: "右", OmenofSinistralAnnulment: "左", OmenofDextralAnnulment: "右", OmenofSinistralErasure: "左", OmenofDextralErasure: "右", OmenofGreaterExaltation: "偉大", OmenofCatalysingExaltation: "触媒", OmenofWhittling: "削減", OmenofLight: "光" };
const CUR_JA: Record<string, string> = { exalt: "高貴", exalt_greater: "上級高貴", exalt_perfect: "完全高貴", chaos: "カオス", chaos_greater: "上級カオス", chaos_perfect: "完全カオス", annul: "消去" };
/** 打つ物の短い名前 (完全高貴 偉大 左 など) */
const labelOf = (key: string): string => { const x = setByKey(props.sets, key); if (!x) return key; return [CUR_JA[x.currency] ?? nameOf(x.currency), ...[...x.omens].sort((a, b) => (OMEN_JA[a] === L.value ? 1 : 0) - (OMEN_JA[b] === L.value ? 1 : 0)).map((o) => OMEN_JA[o] ?? o)].join(" "); };
/** 行の打つ物を変える (強さ・お告げの付け外し)。組み合わせの無い物は変えない */
function pick(key: string, k: K, currency?: string, toggle?: string): void {
  open.value[key] = true;
  const cur = setOfAct(key);
  const base = cur && cur.kind === k ? cur : null;
  if (!base) { const f = firstOf(k); if (f) setAct(key, { set: f.key }); return; }
  const c = currency ?? base.currency;
  const om = toggle ? (base.omens.includes(toggle) ? base.omens.filter((o) => o !== toggle) : [...base.omens, toggle]) : [...base.omens];
  const x = find(k, c, om);
  if (x) setAct(key, { set: x.key });
}
/** その形で打てない理由 (打てない物は畳む) */
function whyNot(x: PatternSet, h: number, j: number): string | null {
  if (x.kind === "exalt" && h + j >= props.limit) return `${SIDE_JA.value}が満杯`;
  if ((x.kind === "annul" || x.kind === "chaos") && h + j === 0) return "消せる物が無い";
  return null;
}

interface Out { label: string; h: number; j: number; p: number | null }
/** 打つ物 x を (h, j) で打った時の、狙いの側の結果 (同じ形はまとめ、確率は足す) */
function outcomes(x: PatternSet, h: number, j: number): Out[] {
  const f = props.limit - h - j;
  const out: Out[] = [];
  const push = (label: string, h2: number, j2: number, p: number | null): void => {
    const o = out.find((y) => y.h === h2 && y.j === j2);
    if (o) { o.p = o.p != null && p != null ? o.p + p : null; return; }
    out.push({ label, h: h2, j: j2, p });
  };
  if (x.kind === "exalt") {
    if (f <= 0) return [];
    const k = Math.min(x.omens.includes(GREATER) ? 2 : 1, f);
    const ph = (hh: number): number | null => props.pHit?.(x.currency, hh) ?? null;
    if (k === 1) {
      const p = ph(h);
      push("狙いが付いた", h + 1, j, p);
      push("狙い以外が付いた", h, j + 1, p != null ? 1 - p : null);
    } else {
      const p1 = ph(h), p2 = ph(h + 1);
      const ok = p1 != null && p2 != null;
      push("狙いが 2 つ", h + 2, j, ok ? p1 * p2 : null);
      push("狙い 1・狙い以外 1", h + 1, j + 1, ok ? p1 * (1 - p2) + (1 - p1) * p1 : null);
      push("狙い以外が 2 つ", h, j + 2, ok ? (1 - p1) * (1 - p1) : null);
    }
  } else if (x.kind === "annul") {
    if (h + j === 0) return [];
    // 側のお告げなら側の中から 1 つ。お告げ無しは反対の側に刺さることもあるので確率は出さない
    // 側のお告げなら側の中から 1 つ。素の消去は反対の側の消せる物も合わせた中から 1 つ (反対の側が固定だけなら側と同じ)
    const o = x.omens.includes(sideOmen("annul")) ? 0 : (props.otherRemovable ?? 0);
    const n = h + j + o;
    if (j > 0) push("狙い以外が消えた", h, j - 1, j / n);
    if (h > 0) push("狙いが消えた", h - 1, j, h / n);
    if (o > 0) push(`反対の側 (${props.side === "prefix" ? "サフィ" : "プレ"}) が消えた`, h, j, o / n);
  } else if (x.kind === "chaos") {
    if (h + j === 0) return [];
    // 1 つ消して 1 つ付く (付く側はランダムなので確率は出さない)。狙いの側が変わる形だけ
    const rem: Array<[number, number, string]> = [];
    if (j > 0) rem.push([0, -1, "狙い以外"]);
    if (h > 0) rem.push([-1, 0, "狙い"]);
    for (const [dh, dj, gone] of rem) for (const [ah, aj, got] of [[1, 0, "狙い"], [0, 1, "狙い以外"]] as const) {
      const h2 = h + dh + ah, j2 = j + dj + aj;
      if (h2 === h && j2 === j) continue;
      push(`${gone}が消えて${got}が付いた`, h2, j2, null);
    }
    // 反対の側に付いた時 (狙いの側は 1 つ減る)
    for (const [dh, dj, gone] of rem) push(`${gone}が消えた`, h + dh, j + dj, null);
    // お告げ無しは反対の側から消えて、狙いの側に付くこともある
    if (!x.omens.includes(sideOmen("chaos")) && h + j < props.limit) { push("狙いが付いた", h + 1, j, null); push("狙い以外が付いた", h, j + 1, null); }
  }
  return out.filter((o) => o.h + o.j <= props.limit && o.h >= 0 && o.j >= 0);
}

const keyOf = (h: number, j: number): string => `${h}-${j}`;
/**
 * 表の行 (この手を打った後に来うる形。決めた手の結果を辿って増える)。並びは来る順。
 * 打つ前の形の行は、この手 (props.set) の結果を出すだけ (選べない)
 */
const rows = computed(() => {
  const order: Array<{ h: number; j: number }> = [];
  const seen = new Set<string>();
  const queue: Array<[number, number]> = outcomes(props.set, props.h0, props.j0).map((o) => [o.h, o.j]);
  while (queue.length && order.length < 30) {
    const [h, j] = queue.shift()!;
    const k = keyOf(h, j);
    if (seen.has(k)) continue;
    seen.add(k);
    if (h >= props.need) continue;
    order.push({ h, j });
    const act = props.policy[k];
    const x = act?.set ? setByKey(props.sets, act.set) : undefined;
    if (x) for (const o of outcomes(x, h, j)) queue.push([o.h, o.j]);
  }
  return order;
});
/** まだ表に出ていない形 (手で足せる)。枠の中の全部の形から、揃った形と出ている形を除く */
const hidden = computed(() => {
  const out: Array<{ h: number; j: number }> = [];
  for (let h = 0; h < props.need; h++) for (let j = 0; h + j <= props.limit; j++) if (!rows.value.some((r) => r.h === h && r.j === j)) out.push({ h, j });
  return out;
});
const extra = ref<string[]>([]);
const shown = computed(() => [...rows.value, ...hidden.value.filter((r) => extra.value.includes(keyOf(r.h, r.j)))]);
const showMore = ref(false);

function setAct(key: string, act: PolicyAct | null): void {
  const next = { ...props.policy };
  if (act) next[key] = act; else delete next[key];
  emit("change", next);
}
const shapeText = (h: number, j: number): string => `狙い ${h} · 狙い以外 ${j} · 空き ${Math.max(0, props.limit - h - j)}`;
const pct = (p: number | null): string => (p == null ? "" : p >= 0.995 ? "100%" : p < 0.005 ? "1% 未満" : `${Math.round(p * 100)}%`);
const open = ref<Record<string, boolean>>({});
const flash = ref<string | null>(null);
function jump(key: string): void {
  if (!rows.value.some((r) => keyOf(r.h, r.j) === key) && !extra.value.includes(key)) extra.value = [...extra.value, key];
  flash.value = key;
  requestAnimationFrame(() => document.getElementById(`shape-${key}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  setTimeout(() => { if (flash.value === key) flash.value = null; }, 1200);
}
const actOf = (key: string): PolicyAct | undefined => props.policy[key];
const setOfAct = (key: string): PatternSet | undefined => { const a = actOf(key); return a?.set ? setByKey(props.sets, a.set) : undefined; };
const thenText = (a: PolicyAct | undefined): string => (!a ? "" : a.then === "next" ? "次の手へ" : a.then === "restart" ? "新しいベースで最初から" : a.then === "reset" ? `1 MOD 残し消去 → ${(a.goto ?? 0) + 1} 手目のスパムへ` : a.then === "goto" ? `${(a.goto ?? 0) + 1} 手目へ` : "");
const iconsOf = (x: PatternSet): string[] => [x.currency, ...x.omens].filter((i) => !!iconOf(i));
</script>

<template>
  <div class="text-[12px]">
    <p class="mb-1 font-bold text-sky-100">形ごとに次に打つ物を決める <span class="font-normal opacity-60">({{ SIDE_JA }}の形。同じ形なら同じ手)</span></p>
    <!-- 打つ前の形と、この手の結果 -->
    <div class="mb-2 rounded-md border border-white/10 bg-black/20 px-2 py-1">
      <div class="text-[11px] opacity-70">打つ前 {{ shapeText(h0, j0) }} → <img v-for="ic in iconsOf(set)" :key="ic" :src="iconOf(ic)" alt="" class="inline h-4 w-4 object-contain" /> {{ labelOf(set.key) }}</div>
      <div class="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
        <button v-for="o in outcomes(set, h0, j0)" :key="keyOf(o.h, o.j)" type="button" class="text-left hover:underline" :class="o.h >= need ? 'text-emerald-200' : 'text-sky-200'" @click="o.h < need && jump(keyOf(o.h, o.j))">
          <span v-if="o.p != null" class="mr-1 whitespace-nowrap tabular-nums opacity-70">{{ pct(o.p) }}</span>{{ o.label }} <span class="opacity-60">→ {{ o.h >= need ? "✓ 揃った" : shapeText(o.h, o.j) }}</span>
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <div v-for="r in shown" :id="`shape-${keyOf(r.h, r.j)}`" :key="keyOf(r.h, r.j)" class="rounded-md border px-2 py-1.5 transition" :class="[flash === keyOf(r.h, r.j) ? 'border-amber-300 bg-amber-500/10' : actOf(keyOf(r.h, r.j)) ? 'border-white/15 bg-black/30' : 'border-dashed border-white/15 bg-black/20']">
        <div class="flex flex-wrap items-center gap-2">
          <b class="tabular-nums">今: {{ shapeText(r.h, r.j) }}</b>
          <span v-if="!actOf(keyOf(r.h, r.j))" class="text-[11px] opacity-70">未設定 → {{ fallback ?? "付かなかったらの札" }}</span>
          <span v-else-if="thenText(actOf(keyOf(r.h, r.j)))" class="text-[11px] text-sky-200">→ {{ thenText(actOf(keyOf(r.h, r.j))) }}</span>
        </div>
        <!-- 選んだ物 + 結果 -->
        <div v-if="setOfAct(keyOf(r.h, r.j))" class="mt-1 flex flex-wrap items-start gap-2">
          <span class="flex items-center gap-1 rounded-lg border border-sky-300 bg-sky-500/20 px-1.5 py-0.5 text-sky-50"><img v-for="ic in iconsOf(setOfAct(keyOf(r.h, r.j))!)" :key="ic" :src="iconOf(ic)" alt="" class="h-4 w-4 object-contain" />{{ labelOf(setOfAct(keyOf(r.h, r.j))!.key) }}</span>
          <div class="flex flex-col gap-0.5">
            <button v-for="o in outcomes(setOfAct(keyOf(r.h, r.j))!, r.h, r.j)" :key="keyOf(o.h, o.j)" type="button" class="text-left hover:underline" :class="o.h >= need ? 'text-emerald-200' : 'text-sky-200'" @click="o.h < need && jump(keyOf(o.h, o.j))">
              <span v-if="o.p != null" class="mr-1 inline-block min-w-9 whitespace-nowrap text-right tabular-nums opacity-70">{{ pct(o.p) }}</span>{{ o.label }} <span class="opacity-60">→ {{ o.h >= need ? "✓ 揃った (次の手)" : shapeText(o.h, o.j) }}</span>
            </button>
          </div>
        </div>
        <!-- 選ぶ (決めた後は畳む) -->
        <div v-if="!locked && (!actOf(keyOf(r.h, r.j)) || open[keyOf(r.h, r.j)])" class="mt-1 flex flex-wrap items-center gap-1">
          <button v-for="kd in KINDS" :key="kd.k" type="button" class="flex items-center gap-1 rounded-lg border px-1.5 py-0.5 disabled:opacity-30 max-md:min-h-10" :class="setOfAct(keyOf(r.h, r.j))?.kind === kd.k ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-white/15 hover:border-white/40'" :disabled="!firstOf(kd.k) || !!whyNot(firstOf(kd.k)!, r.h, r.j)" :title="firstOf(kd.k) ? whyNot(firstOf(kd.k)!, r.h, r.j) ?? undefined : undefined" @click="pick(keyOf(r.h, r.j), kd.k)">
            <img v-if="iconOf(kd.icon)" :src="iconOf(kd.icon)" alt="" class="h-4 w-4 object-contain" />{{ kd.ja }}
          </button>
          <template v-if="setOfAct(keyOf(r.h, r.j)) && (['exalt', 'annul', 'chaos'] as const).includes(setOfAct(keyOf(r.h, r.j))!.kind as K)">
            <span class="mx-1 opacity-30">|</span>
            <button v-for="st in STRENGTHS[setOfAct(keyOf(r.h, r.j))!.kind as K].filter((x) => x.ja)" :key="st.c" type="button" class="rounded border px-1.5 py-0.5 text-[11px] disabled:opacity-30" :class="setOfAct(keyOf(r.h, r.j))!.currency === st.c ? 'border-amber-300 bg-amber-500/15' : 'border-white/10'" :disabled="!find(setOfAct(keyOf(r.h, r.j))!.kind, st.c, setOfAct(keyOf(r.h, r.j))!.omens)" @click="pick(keyOf(r.h, r.j), setOfAct(keyOf(r.h, r.j))!.kind as K, st.c)">{{ st.ja }}</button>
            <button v-for="om in omenOpts(setOfAct(keyOf(r.h, r.j))!.kind as K)" :key="om.o" type="button" class="flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[11px] disabled:opacity-30" :class="setOfAct(keyOf(r.h, r.j))!.omens.includes(om.o) ? 'border-orange-300 bg-orange-500/15' : 'border-white/10'" :disabled="!find(setOfAct(keyOf(r.h, r.j))!.kind, setOfAct(keyOf(r.h, r.j))!.currency, setOfAct(keyOf(r.h, r.j))!.omens.includes(om.o) ? setOfAct(keyOf(r.h, r.j))!.omens.filter((o) => o !== om.o) : [...setOfAct(keyOf(r.h, r.j))!.omens, om.o])" @click="pick(keyOf(r.h, r.j), setOfAct(keyOf(r.h, r.j))!.kind as K, undefined, om.o)"><img v-if="iconOf(om.o)" :src="iconOf(om.o)" alt="" class="h-3.5 w-3.5 object-contain" />{{ om.ja }}</button>
            <span class="mx-1 opacity-30">|</span>
          </template>
          <button type="button" class="rounded-lg border px-1.5 py-0.5 max-md:min-h-10" :class="actOf(keyOf(r.h, r.j))?.then === 'next' ? 'border-sky-300 bg-sky-500/20 text-sky-50' : 'border-white/15'" @click="setAct(keyOf(r.h, r.j), { then: 'next' }); open[keyOf(r.h, r.j)] = false">→ 次の手</button>
          <button type="button" class="rounded-lg border px-1.5 py-0.5 max-md:min-h-10" :class="actOf(keyOf(r.h, r.j))?.then === 'restart' ? 'border-orange-300 bg-orange-500/20 text-orange-50' : 'border-white/15'" @click="setAct(keyOf(r.h, r.j), { then: 'restart' }); open[keyOf(r.h, r.j)] = false">⟲ 新しいベースで最初から</button>
          <button v-if="actOf(keyOf(r.h, r.j))" type="button" class="ml-auto rounded border border-emerald-300/50 px-2 py-0.5 text-[11px] text-emerald-100" @click="open[keyOf(r.h, r.j)] = false">決めた</button>
        </div>
        <div v-else-if="!locked" class="mt-1 flex gap-2 text-[11px]">
          <button type="button" class="opacity-60 hover:opacity-100" @click="open[keyOf(r.h, r.j)] = true">変える</button>
          <button type="button" class="opacity-60 hover:opacity-100" title="決めた物を外す" @click="setAct(keyOf(r.h, r.j), null)">外す</button>
        </div>
      </div>
    </div>
    <div v-if="hidden.length && !locked" class="mt-1.5 text-[11px]">
      <button type="button" class="opacity-60 hover:opacity-100" @click="showMore = !showMore">今は来ない形 {{ hidden.length }} {{ showMore ? "▲" : "▼" }}</button>
      <div v-if="showMore" class="mt-1 flex flex-wrap gap-1">
        <button v-for="r in hidden" :key="keyOf(r.h, r.j)" type="button" class="rounded border border-white/10 px-1.5 py-0.5 hover:border-white/30" @click="jump(keyOf(r.h, r.j))">{{ shapeText(r.h, r.j) }}</button>
      </div>
    </div>
  </div>
</template>
