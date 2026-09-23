<script setup lang="ts">
/**
 * ActionPicker.vue — 打つ物の選び方: お告げを先に、合うオーブだけ後に (2026-09-24)
 *
 * オーナー:「カレンシー追加した際の UI は、お告げ系とオーブ系分けて表示したい。お告げ先選んでそれに合ったオーブを表示。
 * 右側高貴なお告げ選んだら高貴 3 つしか選択肢出ないとか。アクティブ系は 2、3 個アクティブにできるから、デフォルトは指定なし
 * だけどプルダウンで選べる。1 個選んだらその下にお告げを追加ボタン、一緒に組み合わせができるお告げのみ表示。
 * 例えば結晶化のお告げ選んだら消去やら削減やら冒涜系選べんよな」。
 *
 * - お告げは同じ組 (高貴 / 消去 / カオス / エッセンス / 冒涜) の中でだけ重ねられる。側 (左 / 右) のお告げは 1 つだけ
 * - オーブはお告げの組に合う物だけ。お告げ無しならカオス・高貴・消去・確認だけ
 * - その手に来た時の指輪で打てない物・カレンシーランキングに値段が無い物は出さない
 * 選び終わったら打つ物 ([[sim-route.ts]] の SimAction) にして親へ返す。
 */
import { computed, ref, watch } from "vue";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { CATALYSTS, catalystsFor } from "../../services/htc/quality";
import type { SimAction, SimState } from "../../services/htc/sim-route";
import type { Side } from "../../services/htc/step-odds";
import type { useCraftTree } from "./useCraftTree";
import type { useHtcCraft } from "./useHtcCraft";

type Group = "exalt" | "annul" | "chaos" | "essence" | "desecrate";
interface Omen { key: string; ja: string; group: Group; side?: Side; tag?: "catalyst" | "light" | "whittle" | "echoes" }
const OMENS: Omen[] = [
  { key: "OmenofSinistralExaltation", ja: "左側の高貴なお告げ", group: "exalt", side: "prefix" },
  { key: "OmenofDextralExaltation", ja: "右側の高貴なお告げ", group: "exalt", side: "suffix" },
  { key: "OmenofCatalysingExaltation", ja: "触媒の高貴のお告げ", group: "exalt", tag: "catalyst" },
  { key: "OmenofSinistralErasure", ja: "左側の消去のお告げ", group: "annul", side: "prefix" },
  { key: "OmenofDextralErasure", ja: "右側の消去のお告げ", group: "annul", side: "suffix" },
  { key: "OmenofLight", ja: "光のお告げ (冒涜だけ消す)", group: "annul", tag: "light" },
  { key: "OmenofWhittling", ja: "削減のお告げ (一番レベルの低い MOD を消す)", group: "chaos", tag: "whittle" },
  { key: "OmenofSinistralCrystallisation", ja: "左側の結晶化のお告げ", group: "essence", side: "prefix" },
  { key: "OmenofDextralCrystallisation", ja: "右側の結晶化のお告げ", group: "essence", side: "suffix" },
  { key: "OmenofSinistralNecromancy", ja: "左手のネクロマンシーのお告げ", group: "desecrate", side: "prefix" },
  { key: "OmenofDextralNecromancy", ja: "右手のネクロマンシーのお告げ", group: "desecrate", side: "suffix" },
  { key: "OmenofAbyssalEchoes", ja: "反響のお告げ (冒涜を 1 回引き直し)", group: "desecrate", tag: "echoes" },
];

const props = defineProps<{
  c: ReturnType<typeof useHtcCraft>; t: ReturnType<typeof useCraftTree>;
  action: SimAction | null; state: SimState; targets: Array<{ modId: string }>;
}>();
const emit = defineEmits<{ (e: "change", a: SimAction | null): void }>();
const h = computed(() => props.t.helpers.value);
const priced = (key: string): boolean => Number.isFinite(h.value?.cur(key) ?? Infinity);

/** 今の打つ物からお告げとオーブを読み直す (手を開き直した時) */
function omensOf(a: SimAction | null): string[] {
  if (!a) return [];
  switch (a.kind) {
    case "exalt": return [...(a.side ? [a.side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation"] : []), ...(a.catalyst ? ["OmenofCatalysingExaltation"] : [])];
    case "annul": return a.side ? [a.side === "prefix" ? "OmenofSinistralErasure" : "OmenofDextralErasure"] : [];
    case "light": return ["OmenofLight"];
    case "whittle": return ["OmenofWhittling"];
    case "essence": return [props.c.data.value?.mods.get(a.modId)?.type === "suffix" ? "OmenofDextralCrystallisation" : "OmenofSinistralCrystallisation"];
    case "breach": return ["OmenofSinistralCrystallisation"];
    case "desecrate": return [a.side === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy", ...(a.echoes ? ["OmenofAbyssalEchoes"] : [])];
    default: return [];
  }
}
function orbOf(a: SimAction | null): string {
  if (!a) return "";
  switch (a.kind) {
    case "chaos": case "exalt": return a.tier;
    case "annul": case "light": return "annul";
    case "whittle": return "chaos";
    case "essence": return `essence:${a.modId}`;
    case "breach": return "essence:breach";
    case "desecrate": return a.bone;
    case "check": return "check";
    case "quality": return "quality";
  }
}
const omens = ref<string[]>(omensOf(props.action));
const orb = ref<string>(orbOf(props.action));
const catOf = (a: SimAction | null): string | null => (a?.kind === "exalt" || a?.kind === "quality" ? a.catalyst : null);
const catalyst = ref<string | null>(catOf(props.action));
watch(() => props.action, (a) => { omens.value = omensOf(a); orb.value = orbOf(a); catalyst.value = catOf(a); });

const chosen = computed(() => OMENS.filter((o) => omens.value.includes(o.key)));
const group = computed<Group | null>(() => chosen.value[0]?.group ?? null);
const side = computed<Side | null>(() => chosen.value.find((o) => o.side)?.side ?? null);
const has = (tag: Omen["tag"]): boolean => chosen.value.some((o) => o.tag === tag);

/** お告げとオーブから打つ物を作る (揃っていなければ null) */
function build(orbKey: string, os: Omen[], cat: string | null): SimAction | null {
  const g = os[0]?.group ?? null;
  const sd = os.find((o) => o.side)?.side ?? null;
  const tag = (x: Omen["tag"]) => os.some((o) => o.tag === x);
  if (!orbKey) return null;
  if (orbKey === "check") return g ? null : { kind: "check" };
  if (orbKey === "quality") return g || !cat ? null : { kind: "quality", catalyst: cat };
  if (orbKey.startsWith("chaos")) {
    if (g && g !== "chaos") return null;
    return tag("whittle") ? { kind: "whittle" } : { kind: "chaos", tier: orbKey as "chaos" };
  }
  if (orbKey.startsWith("exalt")) {
    if (g && g !== "exalt") return null;
    if (tag("catalyst") && !cat) return null;
    return { kind: "exalt", tier: orbKey as "exalt", side: sd, catalyst: tag("catalyst") ? cat : null };
  }
  if (orbKey === "annul") {
    if (g && g !== "annul") return null;
    return tag("light") ? { kind: "light" } : { kind: "annul", side: sd };
  }
  if (orbKey === "essence:breach") return g === "essence" && sd === "prefix" ? { kind: "breach" } : null;
  if (orbKey.startsWith("essence:")) {
    const modId = orbKey.slice("essence:".length);
    const ms = props.c.data.value?.mods.get(modId)?.type as Side | undefined;
    return g === "essence" && sd === ms ? { kind: "essence", modId } : null;
  }
  if (orbKey === "desecrate" || orbKey === "desecrate_ancient") {
    if (g !== "desecrate" || !sd) return null;
    return { kind: "desecrate", side: sd, bone: orbKey, echoes: tag("echoes") };
  }
  return null;
}
/** 打てる物か (その指輪で打てて、値段がある) */
const ok = (a: SimAction | null): boolean => !!a && !!h.value && !h.value.usable(props.state, a) && Number.isFinite(h.value.priceOf(props.state, a));

/** オーブの候補 (お告げに合う物だけ) */
const ORBS: Array<{ key: string; ja: string }> = [
  { key: "chaos", ja: "カオスオーブ" }, { key: "chaos_greater", ja: "カオスオーブ (上級・段 35 以上)" }, { key: "chaos_perfect", ja: "カオスオーブ (完全・段 50 以上)" },
  { key: "exalt", ja: "高貴なオーブ" }, { key: "exalt_greater", ja: "高貴なオーブ (上級・段 35 以上)" }, { key: "exalt_perfect", ja: "高貴なオーブ (完全・段 50 以上)" },
  { key: "annul", ja: "消去のオーブ" },
  { key: "desecrate", ja: "保存された鎖骨 (冒涜)" }, { key: "desecrate_ancient", ja: "古代の鎖骨 (冒涜・段 40 以上)" },
];
const essenceOrbs = computed(() => [
  ...props.c.targets.value.filter((x) => props.c.data.value?.mods.get(x.modId)?.source === "perfect_essence")
    .map((x) => ({ key: `essence:${x.modId}`, ja: `パーフェクトエッセンス: ${props.c.stepTarget([x.modId])} (その側に外せる物が無ければ外れを付けてから)` })),
  { key: "essence:breach", ja: "ブリーチのエッセンス (品質の上限 40%。プレに外せる物が無ければ高貴 + 左側の高貴なお告げで外れを付けてから)" },
]);
/** 触媒の高貴のお告げのカタリスト (狙いに効く物) */
const catalysts = computed(() => {
  const seen = new Map<string, { tag: string; ja: string }>();
  for (const x of props.targets) { const m = props.c.data.value?.mods.get(x.modId); if (m) for (const k of catalystsFor(m)) seen.set(k.tag, k); }
  return [...seen.values()];
});
const anyCat = computed(() => catalysts.value[0]?.tag ?? null);
/** カタリストだけの手で選べるカタリスト (値段がある物全部) */
const allCatalysts = computed(() => CATALYSTS.filter((k) => priced(catalystPriceKey(k.tag))));
const orbs = computed(() => [...ORBS, ...essenceOrbs.value, { key: "quality", ja: "カタリストだけ (品質を上限まで)" }, { key: "check", ja: "確認だけ (打たない)" }]
  .filter((o) => ok(build(o.key, chosen.value, o.key === "quality" ? catalyst.value ?? anyCat.value ?? allCatalysts.value[0]?.tag ?? null
    : has("catalyst") ? catalyst.value ?? anyCat.value : null))));

/** 足せるお告げ (同じ組の中、側は 1 つ、値段がある、その組で打てるオーブがある) */
const addable = computed(() => OMENS.filter((o) => {
  if (omens.value.includes(o.key) || !priced(o.key)) return false;
  if (group.value && o.group !== group.value) return false;
  if (o.side && side.value) return false;
  if (o.tag === "light" && side.value) return false;
  if (o.side && has("light")) return false;
  const next = [...chosen.value, o];
  return [...ORBS, ...essenceOrbs.value].some((x) => ok(build(x.key, next, o.tag === "catalyst" || has("catalyst") ? anyCat.value : null)));
}));

function emitNow(): void {
  const a = build(orb.value, chosen.value, has("catalyst") || orb.value === "quality" ? catalyst.value : null);
  emit("change", a);
}
function addOmen(key: string): void {
  if (!key) return;
  omens.value = [...omens.value, key];
  if (key === "OmenofCatalysingExaltation" && !catalyst.value) catalyst.value = anyCat.value;
  if (!orbs.value.some((o) => o.key === orb.value)) orb.value = "";
  emitNow();
}
function removeOmen(key: string): void {
  omens.value = omens.value.filter((x) => x !== key);
  if (key === "OmenofCatalysingExaltation") catalyst.value = null;
  if (!orbs.value.some((o) => o.key === orb.value)) orb.value = "";
  emitNow();
}
function setOrb(key: string): void {
  orb.value = key;
  if (key === "quality" && !catalyst.value) catalyst.value = anyCat.value ?? allCatalysts.value[0]?.tag ?? null;
  emitNow();
}
function setCatalyst(tag: string): void { catalyst.value = tag; emitNow(); }
</script>

<template>
  <div class="mb-1 text-xs">
    <!-- お告げ (組み合わせられる物だけ足せる) -->
    <div class="flex flex-wrap items-center gap-1">
      <span class="opacity-60">お告げ:</span>
      <span v-for="o in chosen" :key="o.key" class="rounded border border-sky-600/60 px-1">
        {{ o.ja }} <button type="button" class="opacity-60 hover:opacity-100" @click="removeOmen(o.key)">×</button>
      </span>
      <select v-if="addable.length" class="rounded border border-white/20 bg-black/30 px-1" value="" @change="addOmen(($event.target as HTMLSelectElement).value)">
        <option value="">{{ chosen.length ? "+ お告げを追加" : "指定なし" }}</option>
        <option v-for="o in addable" :key="o.key" :value="o.key">{{ o.ja }}</option>
      </select>
      <select v-if="has('catalyst')" class="rounded border border-white/20 bg-black/30 px-1" :value="catalyst ?? ''" @change="setCatalyst(($event.target as HTMLSelectElement).value)">
        <option v-for="k in catalysts" :key="k.tag" :value="k.tag">{{ k.ja }}</option>
      </select>
    </div>
    <!-- オーブ (お告げに合う物だけ) -->
    <div class="mt-1 flex flex-wrap items-center gap-1">
      <span class="opacity-60">オーブ:</span>
      <select class="rounded border border-white/20 bg-black/30 px-1" :value="orb" @change="setOrb(($event.target as HTMLSelectElement).value)">
        <option value="" disabled>選ぶ</option>
        <option v-for="o in orbs" :key="o.key" :value="o.key">{{ o.ja }}</option>
      </select>
      <select v-if="orb === 'quality'" class="rounded border border-white/20 bg-black/30 px-1" :value="catalyst ?? ''" @change="setCatalyst(($event.target as HTMLSelectElement).value)">
        <option v-for="k in allCatalysts" :key="k.tag" :value="k.tag">{{ k.ja }}</option>
      </select>
      <span v-if="!orbs.length" class="text-rose-300">このお告げで打てるオーブがありません</span>
    </div>
  </div>
</template>
