/**
 * use-sim-result.ts — シミュレーションの画面 (StageSimPanel.vue) の結果の比べ・内訳・運の幅・レシピのカード。
 * StageSimPanel.vue から分けた (2026-10-16、500 行の決まり)。画面の 1 つごとに呼ぶ (状態は画面ごと)
 */
import { fmtPct } from "../../utils/format-pct";
import { computed, onBeforeUnmount, ref } from "vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { rateOf, simCurrency } from "../../state/display-currency";
import { quizFromSim, ROUTE_NAME } from "../../services/craft-stage/quiz-build";
import { actionText, slotName, whenText } from "./quiz-text";
import { tr } from "../../i18n/lang";
import { drawRecipeCard, type RecipeCardData } from "../../services/craft-stage/recipe-card";
import { baseArt } from "../../services/craft-stage/base-art";
import type { SimTargetsCtx } from "./use-sim-targets";
import type { SimSearchCtx } from "./use-sim-search";
import type { SimRunCtx } from "./use-sim-run";
import type { SimRecipesCtx } from "./use-sim-recipes";


export function useSimResult(d: SimTargetsCtx & SimSearchCtx & SimRunCtx & SimRecipesCtx) {
  const { MAX_STEPS_CHOICES, baseJa, boughtDivine, rareDivine, calc, doneDivine, fmtDate, fourDivine, fractureRow, wholeRoute, itemDivine, maxSteps,
    modShort, num, quizBase, recipeOut, restBases, restCost, results, rows, shown, shownName, startOnce, whiteDivine } = d;
  const s = craftStage;
  /**
   * 4 最安値スタート: フラクチャー済みのベースを手に入れるまでの 3 ルート (回さずに計算。高貴建て)。流れが一緒になるのはフラクチャーの後
   *   self   … 自作 (白から増強・消去スパム → 王者 → 骨の壁 → フラクチャー)。1 回分 × 3 (1/3) + 固定後の消去 × 2
   *   rare   … 自作 (適当なレアを消去で 1 MOD → カオスで狙いまで → 高貴 × 2 → 骨の壁 → フラクチャー)。1 回分 × 3 + 消去 × 2 (use-sim-run の calc)
   *   four   … レアのフラクチャー無しベース (3 MOD + 狙い 1 MOD、2026-10-05 オーナー「3 MOD + 1 MOD (狙い) で表示」) を買う → 壁 → フラクチャー。1 回分 × 3 + 消去 × 2
   *   bought … フラクチャー済みのベースを買う (× 1)
   */
  const routes = computed(() => {
    const c = calc.value;
    const fourN = num(fourDivine.value), bN = num(boughtDivine.value);
    const list = [
      { key: "self", name: "① 自作 (白から増強・消去スパム)", cost: c ? c.total : null },
      { key: "rare", name: "① 自作 · 適当なレアから (消去で 1 MOD → カオス)", cost: c ? c.rareTotal : null },
      { key: "four", name: "② レアのフラクチャー無しベース (3 MOD + 狙い 1 MOD) を買う", cost: c && fourN != null ? (fourN + c.buyRest) * 3 + c.after : null },
      { key: "bought", name: "③ フラクチャー済みのベースを買う", cost: bN },
    ];
    const known = list.filter((x) => x.cost != null && Number.isFinite(x.cost));
    const best = known.length ? known.reduce((a, b) => (b.cost! < a.cost! ? b : a)).key : null;
    return { list, best };
  });
  onBeforeUnmount(() => { s.simShowMods.value = false; });
  /** 合計金額はシミュレーションだけの表示通貨で (既定は適正。display-currency.ts の simCurrency) */
  const money = (x: number): string => (Number.isFinite(x) ? simCurrency.money(x) : "—");
  /** 確率の % (2026-10-10 動きの揃え 5: 書き方は utils/format-pct.ts の 1 つ) */
  const pct = (x: number): string => fmtPct(x);
  /**
   * 始め方の比べ (2026-10-05 オーナー「作った方が安いか、ベースから作った方が安いのか、完成品の方が安いのか」)。
   * 作り方を探す自動は無いので、出るのは「この作り方なら」の比べ。値段は全部 高貴建て
   *   白から作る          … 回した平均 (フラクチャーも確率込み)
   *   4 MOD のベースを買う … (ベース代 + 壁 + フラクチャー) × 3 + 消去 × 2 + 固定済みから残りを作る平均
   *   固定済みを買う       … 入れた値段 + 固定済みから残りを作る平均
   *   完成品を買う         … 入れた値段
   */
  const compare = computed(() => {
    const out = recipeOut.value;
    const dv = 1; // 手で入れた値段は高貴建て
    const list: Array<{ key: string; name: string; cost: number | null; note: string }> = [];
    // フラクチャーがある時: 白から作る = 4 の自作 (1 回分 × 3 + 消去 × 2) + 固定済みから先の平均
    const nb = restBases.value;
    const selfCost = fractureRow.value ? (calc.value && restCost.value != null ? calc.value.total * nb + restCost.value : null) : out ? out.r.perDone : null;
    list.push({ key: "make", name: fractureRow.value ? "白から作る (フラクチャーまでの手順込み)" : "白から作る", cost: selfCost, note: "回すと出ます" });
    if (fractureRow.value) {
      const rest = restCost.value;
      const c = calc.value;
      const four = c && c.buyOnce != null && rest != null ? (c.buyOnce * 3 + c.after) * nb + rest : null;
      const rare = c && c.rareTotal != null && rest != null ? c.rareTotal * nb + rest : null;
      list.push({ key: "rare", name: "適当なレアから作る (消去で 1 MOD → カオス、フラクチャーまでの手順込み)", cost: rare, note: num(rareDivine.value) == null ? "無し" : "回すと出ます" });
      list.push({ key: "four", name: "レアのフラクチャー無しベース (3 MOD + 狙い 1 MOD) を買う", cost: four, note: num(fourDivine.value) == null ? "無し" : "回すと出ます" });
      const bN = num(boughtDivine.value);
      const bought = bN != null && rest != null ? bN * dv * nb + rest : null;
      list.push({ key: "bought", name: "フラクチャー済みを買う", cost: bought, note: num(boughtDivine.value) == null ? "無し" : "回すと出ます" });
    }
    list.push({ key: "done", name: "完成品を買う", cost: num(doneDivine.value) != null ? num(doneDivine.value)! * dv : null, note: "無し" });
    // 値段が空のベース・完成品は「無し」(取引所に出ていない) として比べから外す (2026-10-06 オーナー「無いパターンもあるから、未入力で無しとしてカウント」)
    const known = list.filter((x) => x.cost != null && Number.isFinite(x.cost));
    const best = known.length ? known.reduce((a, b) => (b.cost! < a.cost! ? b : a)).key : null;
    return { list, best };
  });
  /** 付いていた割合の MOD の名前 (2 狙う MOD の行と同じ文と色。候補は短く) */
  function hitName(id: string): { text: string; tone: string } {
    const r = rows.value.find((x) => x.modId === id);
    if (r) return { text: `${r.text} ${r.rank}+`, tone: r.tone };
    const a = rows.value.flatMap((x) => x.alts).find((x) => x.modId === id);
    return { text: a ? `${a.text} ${a.rank}+` : id, tone: "" };
  }
  /**
   * 合計の内訳: ベース (フラクチャーがあれば 4 最安値スタートの一番安い始め方、無ければ白のベース × 使った数) とクラフト (残り)。
   * baseAdd は半分・8 割・9 割の人の金額に足すベース (フラクチャーの時だけ。白は回した費用に入っている)
   */
  const split = computed(() => {
    const r = recipeOut.value?.r;
    if (!r) return { base: 0, craft: 0, baseAdd: 0, baseNote: "" };
    // 1 人も完成していない時は 1 個あたりが出ないので、内訳も出さない (40 人分の出費が「ベース」に積まれて見えた)
    if (!Number.isFinite(r.perDone)) return { base: NaN, craft: NaN, baseAdd: 0, baseNote: "" };
    const qp = results.value[shown.value]?.startPrice;
    if (qp != null) { const b = qp * r.bases; return { base: b, craft: r.perDone - b, baseAdd: 0, baseNote: tr(`始めのベース × ${r.bases.toFixed(1)} 個`, `Starting base × ${r.bases.toFixed(1)}`) }; }
    if (s.simStart.value === "item") {
      // 1 個目は手元にあるので費用はこの状態から先 (作り直した分だけベース)。2026-10-08 オーナー「費用もそこから表示」
      const price = num(itemDivine.value) ?? 0;
      const b = price * Math.max(0, r.bases - 1);
      return { base: b, craft: r.perDone - price * r.bases, baseAdd: -price, baseNote: `この状態の作り直し × ${Math.max(0, r.bases - 1).toFixed(1)} 個` };
    }
    if (fractureRow.value) {
      // ベース代は回した費用に入っている (やり直しの買い直し・作り直しの分も)
      const b = (startOnce.value ?? 0) * r.bases;
      const name = s.simStart.value === "fractured" ? "1 で決めた: フラクチャー済みを買う" : s.simStart.value === "four" ? "1 で決めた: 4 MOD のレアを買う" : `4 最安値スタート: ${routes.value.list.find((x) => x.key === routes.value.best)?.name.replace(/\s*\(.*$/, "") ?? ""}`;
      return { base: b, craft: r.perDone - b, baseAdd: 0, baseNote: `フラクチャー済みのベース × ${r.bases.toFixed(1)} 個 (${name})` };
    }
    const b = (num(whiteDivine.value) ?? 0) * r.bases;
    return { base: b, craft: r.perDone - b, baseAdd: 0, baseNote: `白のベース × ${r.bases.toFixed(1)} 個` };
  });
  /** 結果の金額の単位: 適正の時は合計に合わせて神でそろえる (内訳の行ごとに神・カオス・高貴が混ざって比べにくかった) */
  function moneyT(x: number): string {
    if (!Number.isFinite(x)) return "—";
    if (simCurrency.choice.value !== "fair") return money(x);
    const v = x / rateOf("divine");
    // 0.01 神に満たない (0.00 神と出ていた) 時は高貴で
    if (v > 0 && v < 0.01) return money(x);
    return `${v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v.toFixed(2)} 神`;
  }
  const fmtCount = (n: number): string => (n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1));
  /** 運の幅の印 (半分・8 割・9 割の人。合計で) */
  /** 付いていた割合の札の短い名前 (数値を外して段だけ) */
  const hitShort = (id: string): string => { const t = s.simTargets.value.find((x) => x.modId === id) ?? s.simTargets.value.find((x) => x.alts?.some((a) => a.modId === id)); const a = t?.modId === id ? t : t?.alts?.find((x) => x.modId === id); return a ? modShort(id, a.minTierIndex) : hitName(id).text; };
  /**
   * 手順の画像 (打って作るパターンを回して、完成した人がいる時。2026-10-09 オーナー「無事完走出来たら、その手順を分かりやすく画像とかにまとめて出力できるようにしたい。やさしさ」)
   */
  const shownQuiz = computed(() => s.simPatterns.value.find((p) => p.name === shownName.value)?.quiz ?? null);
  const cardOk = computed(() => !!shownQuiz.value && !!quizBase.value && !!summary.value && summary.value.pDone > 0);
  const cardNote = ref("");
  function cardData(): RecipeCardData | null {
    const q = shownQuiz.value, qb = quizBase.value, sm = summary.value, out = recipeOut.value;
    if (!q || !qb || !sm || !out) return null;
    const { recipe } = quizFromSim(qb, q);
    const multi = recipe.routes.length > 1;
    const KIND_JA: Record<string, [string, string]> = { fractured: ["固定", "fractured"], desecrated: ["冒涜", "desecrated"], essence: ["エッセンス", "essence"], crafted: ["作った", "crafted"], normal: ["", ""] };
    const goalSlots = recipe.routes.flatMap((r) => r.goal).filter((g, i, all) => all.findIndex((x) => x.id === g.id && x.side === g.side) === i);
    const startJa = s.simStart.value === "white" ? "白ベースから" : s.simStart.value === "fractured" ? "フラクチャー済みを買う" : s.simStart.value === "four" ? "4 MOD のレアを買う" : s.simStart.value === "magic" ? "マジックを買う" : "エミュレーターの状態から";
    return {
      title: `${baseJa.value} のクラフト手順`,
      art: baseArt(s.base.value) ?? null,
      subtitle: `アイテムレベル ${s.itemLevel.value} · 始め方: ${startJa} · ${shownName.value}`,
      goals: goalSlots.map((g) => { const k = KIND_JA[g.kind]?.[0]; return `${g.id} ${slotName(g, (id) => modShort(id, g.mods.find((m) => m.modId === id)?.minTierIndex ?? 0))}${k ? ` (${k})` : ""}`; }),
      moves: recipe.routes.flatMap((r) => r.rules.map((x) => {
        const a = x.do;
        const keys = "use" in a ? [a.use, ...(a.omens ?? [])] : "reveal" in a && a.reveal.echoes ? ["OmenofAbyssalEchoes"] : [];
        return {
          icons: keys.map((k) => iconOf(k)).filter((u): u is string => !!u),
          label: actionText(a),
          sub: `${multi ? `${tr(ROUTE_NAME[r.id]?.[0] ?? "", ROUTE_NAME[r.id]?.[1] ?? "")} · ` : ""}${whenText(r.goal, x.when, (id) => modShort(id, 0))}`,
          aim: false,
          rules: [],
        };
      })),
      result: {
        total: moneyT(split.value.base + split.value.craft), base: moneyT(split.value.base), craft: moneyT(split.value.craft), done: sm.pDone >= 0.995 ? `完成 ${pct(sm.pDone)}` : `完成 ${pct(sm.pDone)} (${pct(1 - sm.pDone)} は打ち切り)`, doneOk: sm.pDone >= 0.995,
        ...(luck.value[0] ? { median: moneyT(luck.value[0].v) } : {}),
        luck: luck.value.filter((q) => !q.top).slice(1).map((q) => ({ label: q.label, value: `${moneyT(q.v)} ${q.tail}` })),
        usage: [...out.r.usage].sort((a, b) => b.cost - a.cost).slice(0, 6).map((u) => ({ icon: iconOf(u.key) ?? null, name: nameOf(u.key), count: u.count >= 10 ? Math.round(u.count).toLocaleString() : u.count.toFixed(1), cost: moneyT(u.cost) })),
      },
      footer: `ExileDesk のシミュレーション · ${fmtDate(Date.now())} · ${sm.runs.toLocaleString()} 人が作ってみた結果 (確率は重みからの目安)`,
    };
  }
  async function cardCanvas(): Promise<HTMLCanvasElement | null> { const d = cardData(); return d ? drawRecipeCard(d) : null; }
  async function saveCard(): Promise<void> {
    const cv = await cardCanvas();
    if (!cv) return;
    const name = `exiledesk-${baseJa.value}-${shownName.value}-${new Date().toISOString().slice(0, 10)}.png`.replace(/[\/:*?"<>|\s]+/g, "_");
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png"); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    cardNote.value = `${name} に保存しました`;
  }
  async function copyCard(): Promise<void> {
    const cv = await cardCanvas();
    if (!cv) return;
    try {
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
      if (!blob) throw new Error("no blob");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      cardNote.value = "画像をコピーしました (貼り付けて使えます)";
    } catch { cardNote.value = "コピーできなかったので保存してください"; }
  }
  const luck = computed(() => {
    const sm = summary.value;
    if (!sm) return [];
    const add = split.value.baseAdd;
    const xs = [
      { label: "完成した 2 人に 1 人は", v: sm.p50 + add, bar: "bg-emerald-400", text: "text-emerald-300", tail: "以内", top: false },
      { label: "完成した 10 人に 8 人は", v: sm.p80 + add, bar: "bg-amber-400", text: "text-amber-200", tail: "以内", top: false },
      { label: "完成した 10 人に 9 人は", v: sm.p90 + add, bar: "bg-rose-400", text: "text-rose-300", tail: "以内", top: false },
      // 平均は線の上に (運の悪い人の高い金額に引っ張られて、真ん中の人より高くなる。2026-10-07 オーナー「半分とか 8 割とか分かりづらい、平均？」)
      // 平均 = 全員の出費 ÷ 完成した数 (完成が少ないと、完成した人の分位よりずっと高くなる。2026-10-08 使い倒しテスト 3)
      { label: "平均 (全員の出費 ÷ 完成した数)", v: split.value.base + split.value.craft, bar: "bg-white", text: "text-white/80", tail: "", top: true },
    ];
    const max = Math.max(...xs.map((x) => x.v)) * 1.15 || 1;
    return xs.map((x) => ({ ...x, left: `${Math.min(92, Math.max(6, (x.v / max) * 100))}%` }));
  });
  /**
   * 何にお金がかかったか: ベース (フラクチャー済みにするまで、4 の一番安い始め方の内訳) とクラフト (回した結果の使った物)。
   * 金額の多い順、小さい物は「ほか N つ」
   */
  const costGroups = computed(() => {
    const r = recipeOut.value?.r;
    if (!r || !Number.isFinite(r.perDone)) return [];
    const top = (items: Array<{ name: string; n: number; cost: number }>, total: number) => {
      const xs = items.filter((x) => x.cost > 0).sort((a, b) => b.cost - a.cost);
      const head = xs.slice(0, 6);
      const rest = xs.slice(6);
      const list = rest.length ? [...head, { name: `ほか ${rest.length} つ`, n: 0, cost: rest.reduce((a, x) => a + x.cost, 0) }] : head;
      return list.map((x) => ({ ...x, share: total > 0 ? x.cost / total : 0 }));
    };
    const out: Array<{ name: string; note: string; total: number; bar: string; items: Array<{ name: string; n: number; cost: number; share: number }> }> = [];
    const c = calc.value;
    // 白から全部 ⑤ で答えた時 (増強スパム。2026-10-21) はベースは白だけ (フラクチャーも ⑤ の答えの中)
    if (fractureRow.value && !wholeRoute.value && s.simStart.value !== "item") {
      // 1 で始め方を決めた時はその始め方 (前は一番安い始め方の内訳が出て、足し算も合わなかった。2026-10-08 完成判定 4)
      const best = s.simStart.value === "fractured" ? "bought" : s.simStart.value === "four" ? "four" : routes.value.best;
      const name = s.simStart.value === "fractured" ? "1 で決めた: フラクチャー済みを買う" : s.simStart.value === "four" ? "1 で決めた: 4 MOD のレアを買う" : routes.value.list.find((x) => x.key === best)?.name.replace(/\s*\(.*$/, "") ?? "";
      let items: Array<{ name: string; n: number; cost: number }> = [];
      if (best === "self" && c) items = [...c.lines.map((l) => ({ name: l.name, n: l.n * 3, cost: l.n * l.each * 3 })), { name: `${nameOf("annul")} (固定の後)`, n: 2, cost: c.after }];
      else if (best === "four" && c) items = [{ name: "レアのベース (3 MOD + 狙い 1)", n: 3, cost: (num(fourDivine.value) ?? 0) * 3 }, ...c.buyLines.map((l) => ({ name: l.name, n: l.n * 3, cost: l.n * l.each * 3 })), { name: `${nameOf("annul")} (固定の後)`, n: 2, cost: c.after }];
      else if (best === "bought") items = [{ name: "フラクチャー済みのベース", n: 1, cost: num(boughtDivine.value) ?? 0 }];
      // 内訳は 1 個分 × 使った数 (作り直し・買い直し込み)
      const nb = r.bases;
      items = items.map((x) => ({ ...x, n: x.n * nb, cost: x.cost * nb }));
      out.push({ name: "ベース", note: `フラクチャー済みまで (${name}) × ${nb.toFixed(1)} 個`, total: split.value.base, bar: "bg-stone-400/80", items: top(items, split.value.base) });
    } else {
      out.push({ name: "ベース", note: s.simStart.value === "item" ? "エミュレーターの状態" : "白のベース", total: split.value.base, bar: "bg-stone-400/80", items: top([{ name: s.simStart.value === "item" ? "この状態の作り直し (累計 + 白ベース)" : "白のベース", n: s.simStart.value === "item" ? Math.max(0, r.bases - 1) : r.bases, cost: split.value.base }], split.value.base) });
    }
    const craft = r.usage.filter((u) => u.key !== "reveal").map((u) => ({ name: usageName(u.key), n: u.count, cost: u.cost }));
    out.push({ name: "クラフト", note: fractureRow.value && !wholeRoute.value ? "フラクチャー済みから完成まで" : wholeRoute.value ? "白から完成まで" : "", total: split.value.craft, bar: "bg-amber-400/80", items: top(craft, craft.reduce((a, x) => a + x.cost, 0)) });
    return out;
  });
  /** 上の 5 つの数 (どちらの回し方でも同じ形) */
  const summary = computed(() => {
    if (recipeOut.value) { const r = recipeOut.value.r; return { perDone: r.perDone, pDone: r.pDone, runs: r.runs, p50: r.p50, p80: r.p80, p90: r.p90, maxSteps: recipeOut.value.spec.maxSteps ?? 4_000 }; }
    return null;
  });
  /** 手の上限で止まった人の割合 (1 割を超えたら結果の上に出す) */
  const tooManySteps = computed(() => {
    const p = recipeOut.value?.r.stops.filter((x) => /手が多すぎる/.test(x.reason)).reduce((a, x) => a + x.p, 0) ?? 0;
    return p >= 0.1 ? p : 0;
  });
  const nextMaxSteps = computed(() => (MAX_STEPS_CHOICES as readonly number[]).find((n) => n > maxSteps.value) ?? null);
  const usageName = (k: string): string => (k === "reveal" ? "発現 (選ぶだけ)" : nameOf(k));
  return { routes, money, pct, compare, hitName, split, moneyT, fmtCount, hitShort, shownQuiz, cardOk, cardNote, cardData,
    cardCanvas, saveCard, copyCard, luck, costGroups, summary, tooManySteps, nextMaxSteps, usageName };
}
