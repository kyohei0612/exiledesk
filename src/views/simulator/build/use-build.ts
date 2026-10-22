/**
 * シミュレーターの入口 ①② の動き (2026-10-22): 完成品の写し・始め方のパターン・クラフト台のアイテムの組み直し・ツリーへ渡す。
 * アイテムを組むのはクラフト台の addStartMod (付けられるかはエンジンのまま)。② の間はカードの変化をそのパターンに写す
 */
import { computed, watch } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { modText } from "../../../i18n/lang";
import { openTreePage } from "../../../web/page";
import { useTree } from "../tree/use-tree";
import { modListFor, type StageMod } from "../../../services/craft-stage/engine";
import type { Aim, TreeStart } from "../../../services/simulator/tree/tree-model";
import { activePattern, buildStage, finished, patterns, simBuild, type BuildMod } from "../../../state/simulator/build-state";

/** 今のカードの MOD (未発現は数えない) */
export function modsOfItem(): BuildMod[] {
  const d = s.data.value, it = s.item.value;
  if (!d || !it) return [];
  return [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed).map((m: StageMod): BuildMod => ({
    modId: m.modId, tierName: m.tierName, tier: (d.mods.get(m.modId)?.tiers.length ?? m.tierIndex + 1) - m.tierIndex, side: m.side, textJa: m.textJa, textEn: m.textEn,
    ...(m.fractured ? { fractured: true as const } : {}), ...(m.desecrated ? { desecrated: true as const } : {}),
  }));
}
export const aimsOf = (ms: readonly BuildMod[]): Aim[] => ms.map((m) => ({ modId: m.modId, tier: m.tier }));
export const fracturedOf = (p: { mods: readonly BuildMod[] }): BuildMod | undefined => p.mods.find((m) => m.fractured);
export const nameOfMod = (m: BuildMod): string => modText(m);
/** タブの名前に使う段の文 (例「最大マナ (165-179)」。組み直すたびに数値が振り直されて名前が変わらないように。文はエンジンの入口の modListFor の段) */
const tierTexts = computed(() => {
  const d = s.data.value, it = s.item.value;
  const m = new Map<string, string>();
  if (d && it) for (const r of modListFor(d, it)) for (const t of r.tiers) m.set(`${t.modId ?? r.id}|${t.rank}`, t.text);
  return m;
});
export const shortOfMod = (m: BuildMod): string => tierTexts.value.get(`${m.modId}|${m.tierName}`) ?? modText(m);

let rebuilding = false;
/** カードを白から組み直す (クラフト台の「白に戻す」+ 始めの MOD を足す。付けられない物は足さない) */
function rebuild(ms: readonly BuildMod[]): void {
  rebuilding = true;
  try {
    s.hold(null);
    s.reset();
    for (const m of ms) s.addStartMod({ mod: m.modId, tier: m.tierName, ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}) });
  } finally { rebuilding = false; }
}
// ② の間はカードの MOD を開いているパターンに写す (MOD 一覧の「付ける」・カードの × をそのまま使う)
watch(() => s.item.value, () => {
  if (rebuilding || !simBuild.value || buildStage.value !== "start") return;
  const p = patterns.value[activePattern.value];
  if (p) { const mods = modsOfItem(); patterns.value = patterns.value.map((x, i) => (i === activePattern.value ? { mods, random: Math.min(x.random, Math.max(0, 6 - mods.length)) } : x)); }
});

/** ① → ②: 完成品を写す。完成品に ✦ があればそれでパターンを 1 つ */
export function toStart(): void {
  finished.value = modsOfItem();
  patterns.value = [];
  activePattern.value = 0;
  buildStage.value = "start";
  const fr = finished.value.find((m) => m.fractured);
  if (fr) addPattern(fr);
  else rebuild([]);
}
export function backToBuild(): void {
  buildStage.value = "build";
  rebuild(finished.value);
}
/** 「<MOD> スタート」のパターンを足す (その MOD だけに ✦ を付けて始める)。同じ MOD のパターンがあればそこへ */
export function addPattern(m: BuildMod): void {
  const at = patterns.value.findIndex((p) => fracturedOf(p)?.modId === m.modId);
  if (at >= 0) { selectPattern(at); return; }
  const { desecrated: _, ...plain } = m;
  patterns.value = [...patterns.value, { mods: [{ ...plain, fractured: true }], random: 0 }];
  selectPattern(patterns.value.length - 1);
}
export function selectPattern(i: number): void {
  activePattern.value = i;
  const p = patterns.value[i];
  rebuild(p ? p.mods : []);
}
export function removePattern(i: number): void {
  patterns.value = patterns.value.filter((_, k) => k !== i);
  selectPattern(Math.min(activePattern.value, patterns.value.length - 1));
}
/** 何でもよい MOD の数は、始めの MOD と合わせてレアの枠 (6) まで */
export const randomMax = computed(() => Math.max(0, 6 - (patterns.value[activePattern.value]?.mods.length ?? 0)));
export function setRandom(n: number): void {
  const v = Math.max(0, Math.min(randomMax.value, Math.floor(Number.isFinite(n) ? n : 0)));
  patterns.value = patterns.value.map((x, i) => (i === activePattern.value ? { ...x, random: v } : x));
}
export const current = computed(() => patterns.value[activePattern.value] ?? null);
/** 完成品のうち、まだパターンの ✦ にしていない物 (「✦ で始める」の候補。冒涜の MOD は固定できない) */
export const fractureChoices = computed(() => finished.value.filter((m) => !m.desecrated && !patterns.value.some((p) => fracturedOf(p)?.modId === m.modId)));

/** 開いているパターンで木を開く (始まりの箱 = レア・✦・始めから付いている MOD・何でもよい MOD の数、欲しい MOD = 完成品) */
export function patternToTree(): void {
  const p = current.value, it = s.item.value;
  if (!p || !it) return;
  const start: TreeStart = { rarity: "rare", mods: p.mods.map((m) => ({ modId: m.modId, tier: m.tier, ...(m.fractured ? { fractured: true as const } : {}) })) };
  useTree().startTreeWith(it.base, s.itemLevel.value, { aims: aimsOf(finished.value), start, startRandom: p.random });
  simBuild.value = false;
  buildStage.value = "build";
  openTreePage();
}
