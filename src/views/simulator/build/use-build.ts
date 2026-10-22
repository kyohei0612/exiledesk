/**
 * シミュレーターの入口の動き (2026-10-22、設計 docs/org/simulator/notes/2026-10-22-entry-design.md)。
 * ① MOD 決め: カードの MOD = 完成品。6 MOD で自動で ②③ (カレンシーを打つ) へ。アイテムレベルの「適正」= 選んだ段が全部付く一番低いレベル。
 * ②③ 打つ: クラフト台の use への差し込み (setUseHook) で、カレンシーを打つと乱数の代わりにお告げの欄の所 (PathPick.vue) に行き先を出し、
 * 選んだ行き先になる手の種をエンジンで探して use(key, { seed }) で普通に打つ (工程・費用・再生はクラフト台のまま)。空打ち = 狙いの付かない行き先を 1 つ。
 * アイテムを組むのはクラフト台 (addStartMod・reset、付けられるかはエンジンのまま)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s, setUseHook } from "../../../state/craft-stage";
import { allMods, omensFor, type StageItem, type StageMod, type StepOutcome } from "../../../services/craft-stage/engine";
import { heldTargets, hitsTarget, missOutcome, pickGroups, seedFor, type PathTarget } from "../../../services/simulator/build/path-pick";
import { buildStage, finished, ilvlFit, pathAsk, simBuild, type BuildMod } from "../../../state/simulator/build-state";
import { modText, tr } from "../../../i18n/lang";
import type { RowTag } from "../../craft-stage/stage-item-row-tag";
import { openTreePage } from "../../../web/page";
import { useTree } from "../tree/use-tree";
import type { TreeStart } from "../../../services/simulator/tree/tree-model";

/** 今のカードの MOD (未発現は数えない) */
export function modsOfItem(it: StageItem | null = s.item.value): BuildMod[] {
  const d = s.data.value;
  if (!d || !it) return [];
  return allMods(it).filter((m) => !m.unrevealed).map((m: StageMod): BuildMod => ({
    modId: m.modId, tierName: m.tierName, tierIndex: m.tierIndex, tier: (d.mods.get(m.modId)?.tiers.length ?? m.tierIndex + 1) - m.tierIndex, side: m.side, textJa: m.textJa, textEn: m.textEn,
    ...(m.fractured ? { fractured: true as const } : {}), ...(m.desecrated ? { desecrated: true as const } : {}),
  }));
}
/** ① のカードの MOD の数 (6 で自動で次へ) */
export const buildCount = computed(() => (s.item.value ? allMods(s.item.value).filter((m) => !m.unrevealed).length : 0));
/** 適正のアイテムレベル: 段の MOD レベルの一番高い物 (① はカードの MOD、②③ は狙い)。MOD が無ければ null */
export const fitIlvl = computed<number | null>(() => {
  const d = s.data.value;
  if (!d) return null;
  const ms = buildStage.value === "build" ? modsOfItem() : finished.value;
  const lv = ms.map((m) => d.mods.get(m.modId)?.tiers[m.tierIndex]?.ilvl ?? 1);
  return lv.length ? Math.max(1, ...lv) : null;
});

/** ① → ②③: カードの MOD を狙いに写し、適正ならそのレベルの白から打ち始める */
export function toPlay(): void {
  finished.value = modsOfItem();
  if (!finished.value.length) return;
  if (ilvlFit.value && fitIlvl.value) s.itemLevel.value = fitIlvl.value;
  s.hold(null);
  s.reset();
  buildStage.value = "play";
}
/** ②③ → ①: 狙いの MOD でカードを組み直す (付けられない物は足さない) */
export function backToBuild(): void {
  buildStage.value = "build";
  s.hold(null);
  s.reset();
  for (const m of finished.value) s.addStartMod({ mod: m.modId, tier: m.tierName, ...(m.fractured ? { fractured: true } : {}), ...(m.desecrated ? { desecrated: true } : {}) });
}
// ②③ で「適正」を押し直した時: まだ打っていなければ適正のレベルの白から (打った後は手で決めたレベルのまま)
watch(ilvlFit, (on) => { if (on && buildStage.value === "play" && !s.log.value.length && fitIlvl.value && s.itemLevel.value !== fitIlvl.value) { s.itemLevel.value = fitIlvl.value; s.reset(); } });
// 6 MOD 揃ったら自動で次へ (オーナー 10-22)
watch(buildCount, (n, old) => { if (simBuild.value && buildStage.value === "build" && n >= 6 && old < 6) toPlay(); });

/** 狙い (① の完成品) */
export const targets = computed<PathTarget[]>(() => finished.value.map((m) => ({ modId: m.modId, minTierIndex: m.tierIndex })));
export const held = computed(() => (s.item.value ? heldTargets(s.item.value, targets.value) : []));
export const allHeld = computed(() => held.value.length > 0 && held.value.every(Boolean));
/** ② = フラクチャーまで、③ = フラクチャーの後 (カードにフラクチャーの MOD があるか) */
export const phase = computed<2 | 3>(() => (s.item.value && allMods(s.item.value).some((m) => m.fractured) ? 3 : 2));
/** 狙いでも、付いた狙いでもない MOD = 外れ MOD (オーナー 10-22) */
export const isJunk = (m: StageMod): boolean => !targets.value.some((t) => hitsTarget(m, t));
/** カードの外れ MOD の札 (ツリーの tree-row-tags と同じ: 行の名前ごと「外れ MOD」、MOD の文は乗せた時。フラクチャーは付けない) */
export const junkTags = computed(() => {
  const out = new Map<string, RowTag>();
  if (buildStage.value !== "play" || !s.item.value) return out;
  for (const m of allMods(s.item.value)) if (!m.fractured && !m.unrevealed && isJunk(m)) out.set(m.modId, { text: tr("外れ MOD", "Miss"), tone: "bad", replace: true, title: tr(`狙いに当たらない MOD: ${modText(m)}`, `Not one of the target mods: ${modText(m)}`) });
  return out;
});

const lastIndex = (): number => s.log.value[s.log.value.length - 1]?.out.index ?? 0;
/** カレンシー以外の鍵 (スパムシミュの戻り・MOD を付ける・品質やレベルを決める・発現・ルーン) は差し込まない (ジン部長 10-22) */
const NOT_CURRENCY = /^(spam|force|qset|cqset|iset|qcap|ilvl|sset|reveal|rune|unrune)[:]/;
setUseHook((key) => {
  const d = s.data.value, it = s.item.value;
  if (!simBuild.value || buildStage.value !== "play" || !d || !it || NOT_CURRENCY.test(key)) return false;
  const omens = omensFor(key, s.omens.value);
  // 行き先が 1 通り・行き先で表せない手 (品質など) は普通に打つ
  if (!pickGroups(d, it, key, omens, targets.value)) return false;
  pathAsk.value = { key, omens, at: lastIndex() };
  return true;
});
// 打った・戻した・持ち替えた・お告げを替えた・段を移った時は欄を閉じる (出した時の手と違う)
watch([lastIndex, () => s.held.value, () => s.omens.value.join("+"), buildStage, simBuild], () => { pathAsk.value = null; });

export const pathGroups = computed(() => {
  const d = s.data.value, it = s.item.value, a = pathAsk.value;
  return d && it && a ? pickGroups(d, it, a.key, a.omens, targets.value) : null;
});
/** 探している間 (n = 試した種の数) と、見つからなかった時の一言 */
export const pathSearch = ref<{ n: number } | null>(null);
export const pathMiss = ref("");
const CHUNK = 4000, LIMIT = 400_000;
/** 選んだ行き先になる種を区切って探し、見つかったらクラフト台で打つ */
export function pickOutcome(o: StepOutcome): void {
  const d = s.data.value, it = s.item.value, a = pathAsk.value;
  if (!d || !it || !a || pathSearch.value) return;
  pathMiss.value = "";
  const from = 1 + Math.floor(Math.random() * 1e9);
  let tried = 0;
  const step = (): void => {
    if (pathAsk.value !== a || s.item.value !== it) { pathSearch.value = null; return; }
    const seed = seedFor(d, it, a.key, a.omens, o, from + tried, CHUNK);
    tried += CHUNK;
    if (seed != null) { pathSearch.value = null; s.use(a.key, { seed }); return; }
    if (tried >= LIMIT) { pathSearch.value = null; pathMiss.value = tr("この行き先は出にくすぎて見つからなかった (別の段・別の手で)", "This outcome is too rare to find (try another tier or hand)"); return; }
    pathSearch.value = { n: tried };
    setTimeout(step, 0);
  };
  pathSearch.value = { n: 0 };
  setTimeout(step, 0);
}
/** 空打ち: 狙いの付かない行き先を出る割合どおりに 1 つ */
export function pickMiss(): void {
  const o = pathGroups.value ? missOutcome(pathGroups.value, Math.random()) : null;
  if (o) pickOutcome(o);
}

/**
 * ④ ツリーへ: 始まりの箱 = フラクチャーが付いた時のアイテム (狙いの MOD は段を指名、外れ MOD は乱数の数)、欲しい MOD = 狙い。
 * ③ の手を背骨の箱にするのは次 (今は始まりだけ)
 */
export function toTree(): void {
  const it = s.item.value;
  if (!it) return;
  const at = s.log.value.find((p) => allMods(p.after).some((m) => m.fractured))?.after ?? it;
  const ms = allMods(at).filter((m) => !m.unrevealed);
  const start: TreeStart = { rarity: "rare", mods: modsOfItem(at).filter((m) => m.fractured || targets.value.some((t) => t.modId === m.modId && m.tierIndex >= t.minTierIndex)).map((m) => ({ modId: m.modId, tier: m.tier, ...(m.fractured ? { fractured: true as const } : {}) })) };
  const startRandom = ms.length - start.mods.length;
  useTree().startTreeWith(it.base, s.itemLevel.value, { aims: finished.value.map((m) => ({ modId: m.modId, tier: m.tier })), start, startRandom });
  simBuild.value = false;
  buildStage.value = "build";
  openTreePage();
}
