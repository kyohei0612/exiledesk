<!--
  StageTopicGuide.vue — 動作を学ぶコースの案内 (2026-10-17、[[topic-courses.ts]] / [[craft-topic.ts]])。
  並べた手を 1 つずつ。今の手のアイコンを押すと持つ (お告げも掛ける)。要点 1 行をカードの頭と同じ大きな枠で (下限・付く MOD も)、カードの「このステージでの動き」は「詳しく」に畳む。
  前の手で何が起きたか (付いた / 消えた MOD) も出す。名前・説明はエミュレーターの物 (nameOf / stageHelp)
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage as s, iconOf, nameOf } from "../../state/craft-stage";
import { canRetry, lessonJump, quitLesson, prepareStep, prepared, restartCourse, retryStep, rigRare } from "../../state/tutorial/craft-lesson";
import { topic, topicAt, topicCur, topicSub, topicDone, topicNext, topicReset, topicStep, topicUsed } from "../../state/tutorial/craft-topic";
import { stageAdds, stageFloor, stageHelp } from "../../state/emulator/craft-stage-help";
import { aimLabel, modListFor } from "../../services/craft-stage/mod-list";
import { factionCandidates } from "../../services/craft-stage/spec/parts";
import { allMods, boostedMod, catalystOf } from "../../services/craft-stage/stage-core";
import { qualityLabelOf } from "../../services/htc/quality";
import { ALL_OMEN_SPECS } from "../../services/craft-stage/spec/run-spec";
import { freshItem } from "../../services/craft-stage/run-plan";
import { currencyHoverOf } from "../../services/currency/currency-hover";
import { enOf } from "../../state/emulator/craft-stage-shelf";
import { modText, tr } from "../../i18n/lang";
import Icon from "../../components/ui/Icon.vue";
import type { JaEn } from "../../services/tutorial/quiz-tutorials";
import { topicKey, type TopicStep } from "../../services/tutorial/topic-courses";
import type { StageMod } from "../../services/craft-stage/types";

/** now = 今の手の枠 (棚の上) / course = コースの枠 (アイテムの下、既定) */
defineProps<{ part?: "now" | "course" }>();
const t2 = (x: JaEn): string => tr(x[0], x[1]);
const LEVEL: Record<number, { label: JaEn; chip: string }> = {
  1: { label: ["入門", "Intro"], chip: "bg-emerald-500/25 text-emerald-100" },
  2: { label: ["初級", "Easy"], chip: "bg-sky-500/25 text-sky-100" },
  3: { label: ["中級", "Medium"], chip: "bg-amber-500/25 text-amber-100" },
  4: { label: ["上級", "Advanced"], chip: "bg-rose-500/25 text-rose-100" },
};
/** エッセンスの手の実際のキー (今のアイテムの棚から。一覧の先の手も日本語の名前で出す) */
/** エッセンスの名前は、その手のベース (手ごとの base) の棚から引く (別のベースの手が英語の名前のまま出ていた) */
const essKey = (st: TopicStep): string | null => {
  const d = s.data.value, c = topic.value;
  if (!d || !c) return null;
  const base = st.base ?? c.base;
  const it = s.item.value?.base === base ? s.item.value : freshItem(d, base, c.itemLevel, "rare");
  return topicKey(st, d, it);
};
/** 手の名前 (エミュレーターの名前。白に戻す・発現は言葉で) */
function stepName(st: TopicStep): string {
  const main = st.use === "reset" ? tr("白に戻す", "Reset to white") : st.use === "reveal" ? tr("MOD を選んで発現", "Pick a mod and Reveal") : st.use.startsWith("ess:") ? (essKey(st) ? nameOf(essKey(st)!) : st.use.split(":")[1]!) : nameOf(st.use);
  return [main, ...(st.omens ?? []).map(nameOf)].join(" + ");
}
/** 手の一覧の名前: 続きの手 (chain) で掛けるお告げも入れる (2026-10-17 オーナー「6 手目もタイトルからそうだけど骨 + 反響のお告げだよね」) */
// 同じお告げは 1 回だけ (エッセンスやり直しは 2 周目にも同じお告げを掛けるので 2 回並んでいた。2026-10-18)
const listName = (st: TopicStep): string => [...new Set([stepName(st), ...(st.chain ?? []).flatMap((c) => c.omens ?? []).map(nameOf)])].join(" + ");
/**
 * 続きのある手のボタン: 発現に掛けるお告げは発現と分けて 1 つのボタンにする (骨 → 反響のお告げ → 発現)。
 * 2026-10-17 オーナー「お告げが分かりづらいから反響と一緒にしないで分けてあげた方が分かりやすい」
 */
/** need = 前に掛けるお告げのある手 (掛け終わるまでカレンシー・発現のボタンは押せない)。全部の手で お告げ → カレンシー の順 (2026-10-18 お告げのコースから) */
type ChainButton = { j: number; kind: "omen" | "reveal" | "step"; sub: TopicStep; need?: TopicStep };
const chainButtons = computed((): ChainButton[] => {
  const cur = topicStep.value;
  if (!cur) return [];
  return [cur.step, ...(cur.step.chain ?? [])].flatMap((sub, j): ChainButton[] =>
    sub.omens?.length
      ? [{ j, kind: "omen", sub }, { j, kind: sub.use === "reveal" ? "reveal" : "step", sub: { ...sub, omens: [] }, need: sub }]
      : [{ j, kind: sub.use === "reveal" ? "reveal" : "step", sub }]);
});
/**
 * 発現の番か: 今の手が発現で、まだ発現していない (お告げが要る手は掛け終えた後)。この時は光らせて、押すと候補の窓へ
 * (2026-10-17 オーナー「まだ発現してないのにグレーアウトしてる、まだならここは光るべき」)
 */
const revealTurn = (b: ChainButton): boolean => b.sub.use === "reveal" && !topicUsed.value && b.j === topicSub.value && (!b.need || omensOn(b.need));
function toReveal(): void { document.querySelector("[data-reveal-panel]")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
/** 発現のお告げが掛かっているか */
const omensOn = (sub: TopicStep): boolean => (sub.omens ?? []).every((o) => s.omens.value.includes(o));
/** お告げのボタン: 今の手のお告げを掛ける (最初の手なら、ここで打てるアイテムを用意する) */
function applyOmens(b: ChainButton): void {
  if (topicUsed.value) return;
  if (b.j === 0) prepareStep();
  for (const o of b.sub.omens ?? []) if (!s.omens.value.includes(o)) s.toggleOmen(o);
}
/** カレンシーのボタンが押せるか (今の手で、お告げが要る時は掛け終えた後) */
const stepReady = (b: ChainButton): boolean => !topicUsed.value && b.j === topicSub.value && (!b.need || omensOn(b.need));
const iconOfStep = (st: TopicStep): string => (st.use === "reset" || st.use === "reveal" ? "" : st.use.startsWith("ess:") ? (essKey(st) ? iconOf(essKey(st)!) : "") : iconOf(st.use));
/**
 * 今の手の動き (カレンシー・お告げごと): ゲームの公式の説明 (クライアントの原文、棚のカードの上と同じ) と、カードの「このステージでの動き」(条件・決まり) を畳まずに出す
 * (2026-10-17 オーナー「説明はしょりすぎ、挙動の説明はかならずいる。箇条書きでも」「フラクチャーとかも何個以上の MOD で適応とか全然書いてない」)。
 * この手で使わないお告げの案内 (「お告げ: …」の行) は外す
 */
const plain = (x: string): string => x.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");
const help = computed(() => {
  const cur = topicStep.value;
  if (!cur || cur.step.how) return []; // やさしい箇条書き (how) がある手はそれだけ出す (2026-10-17 オーナー「まんますぎる、赤ちゃんに説明するくらい簡単に」)
  const keys = cur.step.use === "reveal" ? ["reveal", ...(cur.step.omens ?? [])] : [...(cur.key ? [cur.key] : []), ...(cur.step.omens ?? [])];
  return keys.map((k) => ({
    k,
    official: k === "reveal" ? [] : (currencyHoverOf(enOf(k, s.item.value))?.e ?? []).map(plain),
    lines: stageHelp(k, s.data.value, s.item.value).filter((l) => !/^(お告げ|Omens):/.test(l)),
  })).filter((x) => x.official.length || x.lines.length);
});
/** カードの頭と同じ: 上級・完全の MOD レベルの下限と、付く MOD (エッセンス・ルーン・感情) */
const floor = computed(() => { const k = topicStep.value?.key; return k && topicStep.value?.step.use !== "reveal" ? stageFloor(k) : null; });
const adds = computed(() => { const k = topicStep.value?.key; return k && topicStep.value?.step.use !== "reveal" ? stageAdds(k, s.data.value, s.item.value) : null; });
/**
 * 上級・完全の例: このアイテムに出やすい MOD 1 つで、下限ぎりぎりで付く段と、すぐ下の付かない段 (エミュレーターの MOD 一覧の行から)。
 * 2026-10-17 オーナー「例も簡単に欲しい、これは付くけどこれは付かないみたいな」。
 * 境目に一番近い組 (付く段と付かない段の MOD レベルの差が一番小さい MOD) を選ぶ。同じ差なら出やすい MOD
 * (2026-10-17 オーナー「ぎりぎりのところせめてくれ、50 以上付く・25 は付かないみたいな離れた例だとイメージしづらい」)
 */
const example = computed(() => {
  const f = floor.value, d = s.data.value, it = s.item.value;
  if (!f || !d || !it) return null;
  const rows = modListFor(d, it).filter((r) => r.group === "normal" && !r.on && !r.blocked).sort((a, b) => b.weight - a.weight);
  type Tier = (typeof rows)[number]["tiers"][number];
  let best: { ok: Tier; ng: Tier } | null = null;
  // 行は同じ系統の MOD をまとめているので、MOD (modId) ごとの段で比べる
  for (const r of rows) for (const id of new Set(r.tiers.map((t) => t.modId))) {
    const ts = r.tiers.filter((t) => t.modId === id && t.ilvl <= s.itemLevel.value);
    const above = ts.filter((t) => t.ilvl >= f), below = ts.filter((t) => t.ilvl < f);
    if (!above.length || !below.length) continue;
    const ok = above.reduce((a, b) => (b.ilvl < a.ilvl ? b : a)), ng = below.reduce((a, b) => (b.ilvl > a.ilvl ? b : a));
    if (!best || ok.ilvl - ng.ilvl < best.ok.ilvl - best.ng.ilvl) best = { ok, ng };
  }
  return best;
});
/**
 * カタリストの手: 品質で数字が変わった MOD を 素の値 → 今の値 で並べる (変わらない MOD も薄く)。
 * ゲームの表示は品質を掛けた後の数字だけで、どこが上がったか分かりづらい (2026-10-18 オーナー「どこが変化したか分かりやすく」)
 */
/** 狙いの MOD (手の target): 今のアイテムの行と、固定されたか (フラクチャーの当たり / 外れ) */
const targetRow = computed(() => {
  const st = topicStep.value?.step, id = st?.target, it = s.item.value, d = s.data.value;
  if (!st || !id || !it || !d) return null;
  const side = d.mods.get(id)?.type === "suffix" ? "suffix" : "prefix";
  // 冒涜で狙う手 (wantReveal): 付いたら当たり。まだの間は狙いの文 (label) を出す (2026-10-18 オーナー「スピリット 50」)
  const want = st.wantReveal;
  if (want) {
    const m = allMods(it).find((x) => x.modId === id && (want.value == null || x.values[0] === want.value)) ?? null;
    return { text: m ? modText(m) : want.label ? t2(want.label) : "", side, state: m ? "got" : "none", head: tr("狙いの冒涜", "Target desecration") } as const;
  }
  // フラクチャーで狙う手: 固定された MOD で当たり / 外れ
  const m = allMods(it).find((x) => x.modId === id) ?? null;
  if (!m) return null;
  const fr = allMods(it).find((x) => x.fractured) ?? null;
  return { text: modText(m), side, state: !fr ? "none" : fr.modId === id ? "hit" : "miss", head: tr("狙いの MOD", "Target mod") } as const;
});
const qualityRows = computed(() => {
  const it = s.item.value, d = s.data.value, st = topicStep.value?.step;
  // カタリストの手と、品質の付いたアイテムを扱う手 (上級の「品質を上げてからカオス」) で出す
  if (!it || !d || !st || !(st.use.startsWith("catalyst") || (it.qualityTag && it.quality > 0))) return null;
  const { tag, pct } = catalystOf(it);
  return {
    head: tag && pct > 0 ? `${qualityLabelOf(tag)}: +${pct}%` : tr("品質はまだ 0%", "No quality yet"),
    rows: allMods(it).map((m) => { const b = boostedMod(it, m, d); return { m, after: b ? { ...m, ...b } : null }; }),
  };
});
const parts = (line: string): Array<{ t: string; b: boolean }> => line.split("**").map((t, i) => ({ t, b: i % 2 === 1 }));
/** 押すと持つ (お告げも掛ける)。発現の反響は掛けるだけ */
/** 次へ: 次の手に進み、打てるアイテムを用意する */
function next(): void { s.hold(null); topicNext(); prepareStep({ viaNext: true }); } // 次へで持っている物は離す (2026-10-17 オーナー)
function holdIt(): void {
  if (topicUsed.value) return; // 1 つの手は 1 回だけ (もう一度はボタンで)
  if (topicSub.value === 0) prepareStep(); // 今のアイテムにこの手が打てなければ、ここで打てるアイテムを用意する (続きの手では用意しない)
  const cur = topicCur.value;
  if (!cur) return;
  if (cur.step.use !== "reveal" && cur.key) { rigRare(cur.key); s.hold(cur.key); }
  for (const o of cur.step.omens ?? []) if (!s.omens.value.includes(o)) s.toggleOmen(o);
}
/** MOD 一覧の窓を開いて、その MOD の行へ (確認用。2026-10-17 オーナー「MOD 一覧もそこで出せるように」) */
function jump(modId: string): void { s.modOverlay.value = true; s.modJump.value = { modId, n: (s.modJump.value?.n ?? 0) + 1 }; }
const last = computed(() => s.log.value[s.log.value.length - 1] ?? null);
/**
 * 前の手で起きたこと: 同じ MOD (modId と側が同じ) が消えて付いたのは 1 行にまとめる (神 = 数字が変わった、フラクチャー = 固定された)。
 * 2026-10-17 点検: 神のオーブの後に「消えた 3 つ + 付いた 3 つ」に見えて、MOD が入れ替わったように読めた
 */
const lastRows = computed(() => {
  const l = last.value;
  if (!l) return null;
  const divine = l.out.currency.startsWith("divine");
  const same = (a: StageMod, b: StageMod): boolean => a.modId === b.modId && a.side === b.side && (divine || (!!a.fractured && !b.fractured));
  // フラクチャーの手は固定した MOD が「付いた」だけで記録される (消えた側は空)
  const fracOnly = (a: StageMod): boolean => l.out.currency === "fracture" && !!a.fractured && !l.removed.some((r) => same(r, a));
  const changed = [
    ...l.added.flatMap((a) => { const b = l.removed.find((r) => same(r, a)); return b ? [{ before: b, after: a, fractured: !!a.fractured && !b.fractured }] : []; }),
    ...l.added.filter(fracOnly).map((a) => ({ before: a, after: a, fractured: true })),
  ];
  return {
    added: l.added.filter((a) => !l.removed.some((r) => same(r, a)) && !fracOnly(a)),
    removed: l.removed.filter((r) => !l.added.some((a) => same(r, a))),
    changed,
  };
});
/**
 * 勢力のお告げの手: このアイテムに付くその勢力の MOD の一覧 (発現の候補はこの中から。2026-10-17 オーナー「アマナムとか付ける時はそのアイテムのアマナムだけ一覧で」)
 */
const FACTION: Record<string, [string, string]> = { ulaman_mod: ["ウラマン", "Ulaman"], amanamu_mod: ["アマナム", "Amanamu"], kurgal_mod: ["クルガル", "Kurgal"] };
const faction = computed(() => {
  const st = topicStep.value?.step, d = s.data.value, it = s.item.value;
  if (!st || !d || !it) return null;
  for (const o of st.omens ?? []) {
    const spec = ALL_OMEN_SPECS.find((x) => x.key === o);
    const tag = spec && "guaranteeTag" in spec.effect ? spec.effect.guaranteeTag : null;
    if (!tag) continue;
    const mods = factionCandidates(d, it, tag).map((c) => ({ side: c.side, text: aimLabel(d, { modId: c.mod.id, minTierIndex: 0, label: c.mod.id }).replace(/ \((T\d+ 以上|T\d+\+)\)$/, "") }));
    return { name: tr(FACTION[tag]?.[0] ?? nameOf(o), FACTION[tag]?.[1] ?? nameOf(o)), mods };
  }
  return null;
});
/** MOD の札: ティア · MOD レベル · プレ / サフィ */
const modInfo = (m: StageMod): string => [m.tierName, tr(`MOD レベル ${m.modLevel}`, `mod level ${m.modLevel}`), m.side === "prefix" ? tr("プレフィックス", "Prefix") : tr("サフィックス", "Suffix")].filter(Boolean).join(" · ");
/** 手の一覧はいつも元の順 (2026-10-17 オーナー「全容が見れるので並び替えずにそのまま」。前は済んだ手を最後尾に回していた) */
const order = computed(() => [...Array(topic.value?.steps.length ?? 0).keys()]);
</script>

<template>
  <!-- 今の手の枠 (使う物と動きの説明・前の手で起きたこと)。カレンシーの棚のすぐ上 (2026-10-17 オーナー「コースと打つ挙動の部分を隔離」) -->
  <section v-if="topic && part === 'now'" data-topic-now-panel class="g-panel p-3 text-[12px]">
    <!-- 操作のボタンは今の手の枠の上 (2026-10-17 オーナー「こっちのが良いな場所」) -->
    <!-- スマホは 2×2 の升目で幅をそろえる (2026-10-17 オーナー「スマホはズレて見える」) -->
    <div class="mb-2 flex flex-wrap justify-end gap-2 max-md:grid max-md:grid-cols-2">
      <!-- 次へは枠の左端にいつも出す。打ち終えるまでは押せない (2026-10-17 オーナー) -->
      <button type="button" data-topic-next class="g-btn-red sm max-md:w-full max-md:justify-center" :disabled="!topicUsed || !topicStep" :title="topicUsed ? undefined : tr('今の手を使うと押せる', 'Use this step first')" @click="next">{{ topic && topicAt + 1 >= topic.steps.length ? tr("完了", "Finish") : tr("次へ →", "Next →") }}</button>
      <button type="button" data-topic-retry class="g-btn sm max-md:w-full max-md:justify-center" :class="(topic?.steps.length ?? 0) > 1 ? '' : 'mr-auto max-md:mr-0'" :disabled="!canRetry" @click="retryStep">{{ tr("もう一度", "Try again") }}</button>
      <button v-if="(topic?.steps.length ?? 0) > 1" type="button" data-topic-restart class="g-btn sm mr-auto max-md:mr-0 max-md:w-full max-md:justify-center" @click="restartCourse">{{ tr("最初から", "Restart") }}</button>
      <button type="button" data-topic-mods class="g-btn sm max-md:w-full max-md:justify-center" :title="tr('このベースに付く MOD (Tab でも開く)', 'Mods for this base (Tab also opens it)')" @click="s.modOverlay.value = true">{{ tr("MOD 一覧", "Mod list") }}</button>
      <button type="button" class="g-btn sm max-md:w-full max-md:justify-center" @click="quitLesson">{{ tr("コースをやめる", "Quit course") }}</button>
    </div>
    <div v-if="topicStep" data-topic-now class="rounded-lg border-2 border-amber-300/50 bg-amber-500/[0.08] px-3 py-2">
      <p class="text-[11px] font-bold text-amber-200">{{ tr(`${topicAt + 1} 手目: これを使ってみる`, `Step ${topicAt + 1}: try this`) }}</p>
      <p v-if="prepared && !topicUsed" data-topic-prepared class="text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr("この手が使えるアイテムを用意しました", "We set up an item this can be used on") }}</p>
      <div class="mt-1 flex flex-wrap items-center gap-2">
        <button v-if="topicStep.step.use === 'reset'" type="button" data-topic-reset class="g-btn sm" @click="topicReset">{{ tr("白に戻す", "Reset to white") }}</button>
        <!-- 続きのある手 (アビス → 骨 → 発現) は並べて出し、今の手だけ押せる。済んだ手は ✓ (2026-10-17 オーナー「打つ前はグレーアウトで、付けたら表示」) -->
        <template v-else v-for="(b, n) in chainButtons" :key="n">
          <span v-if="n > 0" class="text-amber-300/60">→</span>
          <!-- お告げ: 押すと掛かる。掛けたら ✓。カレンシー・発現はその後 (2026-10-17 オーナー「お告げが分かりづらいから分けて」) -->
          <button v-if="b.kind === 'omen'" type="button" data-topic-omen :data-topic-hold="b.j === topicSub && !omensOn(b.sub) ? '' : undefined" class="g-plain flex items-center gap-1 rounded-md border border-amber-300/50 bg-black/30 px-2 py-1 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40" :disabled="topicUsed || b.j !== topicSub || omensOn(b.sub)" :title="tr('押すとお告げを掛ける', 'Click to apply the omen')" @click="applyOmens(b)">
            <span v-if="topicUsed || b.j < topicSub || (b.j === topicSub && omensOn(b.sub))" class="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-400 text-[10px] font-bold text-black">✓</span>
            <img v-for="o in b.sub.omens ?? []" :key="o" :src="iconOf(o)" alt="" class="size-7 shrink-0 object-contain" />
            <span class="text-[13px] text-[var(--exile-color-text-primary)]">{{ (b.sub.omens ?? []).map(nameOf).join(" + ") }}</span>
          </button>
          <button v-else type="button" :data-topic-hold="b.kind === 'step' && stepReady(b) ? '' : undefined" :data-topic-chain="b.j" class="g-plain flex items-center gap-1 rounded-md border border-amber-300/50 bg-black/30 px-2 py-1 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-40" :class="revealTurn(b) ? 'ring-2 ring-amber-300/80 shadow-[0_0_12px_rgba(251,191,36,0.45)]' : ''" :disabled="b.sub.use === 'reveal' ? !revealTurn(b) : !stepReady(b)" :title="b.sub.use === 'reveal' ? tr('アイテムの下の候補から選んで「発現」', 'Pick an option under the item, then Reveal') : b.need && !omensOn(b.need) ? tr('先にお告げを掛ける', 'Apply the omen first') : tr('押すと持つ', 'Click to hold')" @click="b.sub.use === 'reveal' ? toReveal() : holdIt()">
            <span v-if="topicUsed || b.j < topicSub" class="grid size-4 shrink-0 place-items-center rounded-full bg-emerald-400 text-[10px] font-bold text-black">✓</span>
            <img v-if="iconOfStep(b.sub)" :src="iconOfStep(b.sub)" alt="" class="size-7 shrink-0 object-contain" />
            <Icon v-else name="sparkles" class="size-6 shrink-0 text-violet-200" />
            <img v-for="o in b.sub.omens ?? []" :key="o" :src="iconOf(o)" alt="" class="size-6 shrink-0 object-contain" />
            <span class="text-[13px] text-[var(--exile-color-text-primary)]">{{ b.need?.omens?.includes("OmenofAbyssalEchoes") ? tr("リロールして MOD を選んで発現", "Reroll, pick a mod and Reveal") : stepName(b.sub) }}</span>
          </button>
        </template>
        <!-- 発現の案内はボタンの名前に入れた (「MOD を選んで発現」。2026-10-17 オーナー「発現ややこしいから」) -->
      </div>
      <!-- 要点はエミュレーターのカードの頭と同じ大きな枠で (2026-10-17 オーナー「入門は要点でっかく表示のみ、文章長くてだるい」) -->
      <!-- 狙いの MOD は要点の上 (下だと見づらい。2026-10-18 オーナー) -->
      <!-- 見た目はエッセンスのカードの「付く MOD」と同じ緑 (2026-10-18 オーナー「エミュのエッセンスで付く MOD みたいな色」)。当たりは札、外れは灰色 -->
      <div v-if="targetRow?.text" data-topic-target class="mt-2 rounded-lg border px-2.5 py-1.5" :class="targetRow.state === 'miss' ? 'border-white/20 bg-white/[0.05]' : 'border-emerald-400/40 bg-emerald-500/10'">
        <p class="flex items-center gap-1.5 text-[10px]" :class="targetRow.state === 'miss' ? 'text-white/50' : 'text-emerald-200/70'">{{ targetRow.head }} ({{ targetRow.side === "prefix" ? tr("プレフィックス", "Prefix") : tr("サフィックス", "Suffix") }})<span v-if="targetRow.state === 'got'" class="rounded bg-emerald-400 px-1.5 py-px text-[10px] font-black text-black">{{ tr("当たり", "Hit") }}</span><span v-else-if="targetRow.state === 'hit'" class="rounded bg-emerald-400 px-1.5 py-px text-[10px] font-black text-black">{{ tr("当たり・固定された", "Hit · Fractured") }}</span><span v-else-if="targetRow.state === 'miss'" class="rounded bg-white/20 px-1.5 py-px text-[10px] font-bold text-white/80">{{ tr("外れ (もう一度)", "Miss (Try again)") }}</span></p>
        <p class="text-[13px] font-semibold" :class="targetRow.state === 'miss' ? 'text-white/60' : 'text-emerald-200'">・{{ targetRow.text }}</p>
      </div>
      <p data-topic-point class="mt-2 rounded-lg border border-amber-300/50 bg-amber-400/10 px-2.5 py-1.5 text-center text-[15px] font-bold text-amber-100">{{ t2(topicStep.step.note) }}</p>
      <ul v-if="topicStep.step.how" data-topic-how class="mt-1.5 grid gap-1 rounded-lg bg-black/25 px-2.5 py-2">
        <li v-for="(l, i) in topicStep.step.how" :key="i" class="flex gap-1.5 text-[14px] text-[var(--exile-color-text-primary)]"><span class="text-amber-300/70">・</span><span>{{ t2(l) }}</span></li>
      </ul>
      <div v-if="faction" data-topic-faction class="mt-1.5 rounded-lg border border-violet-400/40 bg-violet-500/10 px-2.5 py-1.5">
        <p class="text-[11px] font-bold text-violet-200">{{ tr(`このアイテムに付く${faction.name}の MOD (${faction.mods.length} 種。発現の候補はこの中から)`, `${faction.name} mods this item can get (${faction.mods.length}; reveal options come from these)`) }}</p>
        <p v-for="(m, i) in faction.mods" :key="i" class="flex gap-1.5 text-[12px] text-violet-100"><span class="w-4 shrink-0 font-bold" :class="m.side === 'prefix' ? 'text-[#e0846a]' : 'text-[#6aa8e8]'">{{ m.side === "prefix" ? "P" : "S" }}</span><span>{{ m.text }}</span></p>
        <p v-if="!faction.mods.length" class="text-[12px] text-violet-100/70">{{ tr("このアイテムにはこの勢力の MOD が無い (発現は普通の MOD になる)", "No mods of this faction for this item (reveals use normal mods)") }}</p>
      </div>
      <div v-for="h in help" :key="h.k" data-topic-how class="mt-1.5 rounded-lg bg-black/25 px-2.5 py-1.5">
        <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ h.k === "reveal" ? tr("発現", "Reveal") : nameOf(h.k) }}</p>
        <p v-for="(l, i) in h.official" :key="'o' + i" class="text-[13px] text-[var(--exile-color-text-primary)]">{{ l }}</p>
        <p v-for="(l, i) in h.lines" :key="i" class="flex gap-1.5 text-[12px] text-[#cfc6ae]"><span class="text-amber-300/60">・</span><span><template v-for="(p, j) in parts(l)" :key="j"><b v-if="p.b" class="text-white">{{ p.t }}</b><template v-else>{{ p.t }}</template></template></span></p>
      </div>
      <p v-if="floor" class="mt-1.5 rounded-lg border border-amber-300/50 bg-amber-400/10 px-2.5 py-1.5 text-center text-[15px] font-bold text-amber-100">{{ tr(`MOD レベル ${floor} 以上だけ付く`, `Only mod level ${floor}+ tiers`) }}</p>
      <div v-if="example" data-topic-example class="mt-1.5 grid gap-0.5 rounded-lg bg-black/25 px-2.5 py-1.5 text-[12px]">
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ tr("例", "Example") }}</p>
        <p class="text-emerald-200"><b>{{ tr("付く", "Can roll") }}</b> {{ example.ok.text }} <span class="text-[11px] text-emerald-200/70">({{ example.ok.rank }} · {{ tr(`MOD レベル ${example.ok.ilvl}`, `mod level ${example.ok.ilvl}`) }})</span></p>
        <p class="text-rose-300"><b>{{ tr("付かない", "Can't roll") }}</b> <span class="line-through">{{ example.ng.text }}</span> <span class="text-[11px] text-rose-300/70">({{ example.ng.rank }} · {{ tr(`MOD レベル ${example.ng.ilvl}`, `mod level ${example.ng.ilvl}`) }})</span></p>
      </div>
      <div v-if="adds" class="mt-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5">
        <p class="text-[10px] text-emerald-200/70">{{ adds.head }}</p>
        <p v-for="(l, i) in adds.lines" :key="i" class="text-[13px] font-semibold text-emerald-200">・{{ l }}</p>
      </div>
      <div v-if="qualityRows" data-topic-quality class="mt-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1.5">
        <p class="text-[11px] font-bold text-emerald-200">{{ tr("品質で変わった MOD", "Mods changed by quality") }} <span class="text-emerald-100">({{ qualityRows.head }})</span></p>
        <p v-for="(r, i) in qualityRows.rows" :key="i" class="text-[13px]" :class="r.after ? 'font-semibold text-emerald-200' : 'text-[var(--exile-color-text-tertiary)]'">
          <template v-if="r.after"><span class="text-emerald-200/60">{{ modText(r.m) }}</span> → {{ modText(r.after) }}</template>
          <template v-else>{{ modText(r.m) }} <span class="text-[11px]">({{ tr("変わらない", "unchanged") }})</span></template>
        </p>
      </div>
    </div>
    <div v-else-if="topicDone" data-topic-done class="mt-3 rounded-xl border-2 border-amber-300/70 bg-gradient-to-b from-amber-400/[0.18] to-transparent px-4 py-3">
      <p class="text-[18px] font-black text-amber-100">{{ tr("チュートリアル完了！お疲れ様でした！！", "Tutorial complete! Great work!!") }}</p>
      <p class="mt-0.5 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("気になった手は、下の一覧から押すともう一度試せます", "Click any step below to try it again") }}</p>
    </div>

    <!-- 前の手で起きたこと -->
    <div v-if="last && topicAt > 0" class="mt-2 rounded-md bg-black/25 px-2.5 py-1.5">
      <p class="text-[11px] font-bold text-[var(--exile-color-text-tertiary)]">{{ tr("前の手で起きたこと", "What the last move did") }}: {{ nameOf(last.out.currency) }}</p>
      <!-- 付いた / 消えた MOD のティア・MOD レベル・側も出す (2026-10-17 オーナー「結局何レベルの奴がついてるかの体験ができない」) -->
      <p v-for="(c, i) in lastRows?.changed ?? []" :key="'c' + i" class="text-[12px] text-sky-200"><template v-if="c.fractured">{{ tr("固定された", "Fractured") }}: {{ modText(c.after) }}</template><template v-else>{{ tr("数字が変わった", "Numbers changed") }}: <span class="text-sky-200/60">{{ modText(c.before) }}</span> → {{ modText(c.after) }}</template> <span class="whitespace-nowrap text-[11px] text-sky-200/60">({{ modInfo(c.after) }})</span></p>
      <button v-for="(m, i) in lastRows?.added ?? []" :key="'a' + i" type="button" class="g-plain block text-left text-[12px] text-emerald-300 hover:underline" :title="tr('MOD 一覧のこの行へ', 'Show in the mod list')" @click="jump(m.modId)">＋ {{ modText(m) }} <span class="whitespace-nowrap text-[11px] text-emerald-200/70">({{ modInfo(m) }})</span></button>
      <p v-for="(m, i) in lastRows?.removed ?? []" :key="'r' + i" class="text-[12px] text-rose-300"><span class="line-through">－ {{ modText(m) }}</span> <span class="whitespace-nowrap text-[11px] text-rose-300/70">({{ modInfo(m) }})</span></p>
      <p v-if="!last.added.length && !last.removed.length && !lastRows?.changed.length" class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("MOD の出入りは無し (数値・品質・レアリティなどが変わる手)", "No mod added or removed (values, quality, rarity and so on changed)") }}</p>
    </div>
  </section>
  <!-- コースの枠 (題・ボタン・進み具合・手の一覧)。アイテムの下 -->
  <!-- 幅はアイテムのカードまで (長い手の名前で左の列が広がり、右の今の手の枠が押しつぶされていた。2026-10-18) -->
  <section v-if="topic && part !== 'now'" data-topic-guide class="g-panel w-full max-w-[480px] min-w-0 p-3 text-[12px] max-md:max-w-none">
    <header class="flex flex-wrap items-center gap-2">
      <span class="rounded px-2 py-0.5 text-[11px] font-bold" :class="LEVEL[topic.level]!.chip">{{ t2(LEVEL[topic.level]!.label) }}</span>
      <b class="text-[15px] text-[var(--exile-color-text-title)]">{{ t2(topic.title) }}</b>
      <span class="tabular-nums text-[11px] text-[var(--exile-color-text-tertiary)]">{{ Math.min(topicAt, topic.steps.length) }} / {{ topic.steps.length }}</span>
    </header>
    <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-500" :style="{ width: `${(topicAt / topic.steps.length) * 100}%` }" /></div>
    <!-- 手の一覧 (押すとその手から) -->
    <!-- 2 列は左の列を上から下へ、次に右の列 (並び順のまま読めるように) -->
    <ol class="mt-2 columns-2 gap-x-2">
      <li v-for="i in order" :key="i" class="mb-0.5 break-inside-avoid">
        <!-- 押すとその手から (次へと同じ動き。2026-10-17 オーナー「やっぱりクリックできるように、挙動は次へを押した時と同じ」) -->
        <button type="button" class="g-plain flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-0.5 text-left hover:bg-white/5" :class="i === topicAt ? 'bg-amber-500/10' : ''" @click="lessonJump(i)">
          <span class="grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold" :class="i < topicAt ? 'bg-emerald-400 text-black' : i === topicAt ? 'bg-amber-400 text-black' : 'border border-white/25 text-white/50'">{{ i < topicAt ? "✓" : "" }}</span>
          <span class="min-w-0 flex-1 truncate text-[12px] max-md:whitespace-normal max-md:text-[11px] max-md:leading-tight" :class="i < topicAt ? 'text-emerald-100/80' : 'text-[var(--exile-color-text-secondary)]'">{{ listName(topic.steps[i]!) }}</span>
        </button>
      </li>
    </ol>
  </section>
</template>
