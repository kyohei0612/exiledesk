/**
 * auto-pick.ts — 自動で組むツリーの候補をいくつか作り、短く回して安い方を採る (2026-09-24)
 *
 * オーナー:「(偉大なる高貴のお告げは) 他にも使えそうな場面があるなら計算して」。偉大なる高貴の使い方は指輪によって得な方が
 * 違った (段は問わず: 死体の円環 カタリストが同じ時だけ 135 神 / 同じ側をまとめる 490 神、金の指輪 1,466 / 1,339 神)。
 * なので両方組んで、完成 90% 以上の中で平均の安い方 (どれも届かなければ完成の多い方)。カオスを使う / 使わないも同じく比べる。
 */
import { simulateTreeChunked, type SimNode, type SimState } from "../../services/htc/sim-route";
import { autoTree, chaosSideFor, magicEssenceFor, type AutoTreeInput } from "./tree-auto";
import { spawnChance } from "./craft-estimate";
import { planByRedoCost, type RedoPlan } from "./redo-cost";
import type { useHtcCraft } from "./useHtcCraft";

type Ctx = Parameters<typeof simulateTreeChunked>[0]["ctx"];

/** 比べる時の回す回数 (候補ごと) */
const PICK_RUNS = 150;

export interface AutoPick { nodes: SimNode[]; greater: string; plan: RedoPlan | null; /** 比べた時の平均 (高貴建て) と完成の割合 (候補が 1 つなら null) */ simExpected: number | null; simDone: number | null }

export async function pickAutoTree(inp: AutoTreeInput, ctx: Ctx, start: SimState): Promise<AutoPick> {
  // やり直しの費用から取り方を決める ([[redo-cost.ts]])。カオスで引く物・冒涜に回す物・骨・外れの回し方はここで決め、
  // 残り (偉大なる高貴の使い方、側の消去か素の消去か) はシミュレーターで比べる。決めた物が組めない時の保険に、
  // 今までの決め打ち (一番出にくい物をカオス・冒涜) も候補に入れる
  // 候補を作る所は同期で重い (見積もり + 候補ごとの autoTree)。途中で画面に手を返す (2026-09-26: 前回の続きで最初に 0.2 秒固まった)
  const yieldUi = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
  const plan = planByRedoCost(inp, ctx.cls, ctx.itemLevel);
  await yieldUi();
  const chaosVariants = inp.chaosOk || inp.chaosSide ? [true, false] : [false];
  // 外れの消し方 (側のお告げ / 素の消去) も候補にする。見積もりの側ごとの選択に加え、全部側 / 全部素 も比べる
  // 候補が多いと組むのに数分かかる (30 通り × 150 回)。見積もりの側ごと (undefined) と 素の消去 の 2 通り
  const annuls = ([undefined, "plain"] as const);
  const canOverwrite = !!inp.limits && (inp.fixedSides ?? []).some((sd) => inp.limits![sd] === 2);
  const picks: Array<Partial<AutoTreeInput> & { label: string }> = [];
  if (plan) picks.push({ label: "やり直しの費用から", chaosPick: plan.chaosPick, desecratePick: plan.desecratePick, exaltTiers: plan.exaltTiers, annul: plan.annulSides, ...(plan.reroll ? { reroll: plan.reroll } : {}), ...(plan.bone ? { bone: plan.bone } : {}), ...(plan.faction === false ? { faction: false } : {}), ...(plan.echoes === false ? { echoes: false } : {}), ...(plan.chaosPick ? {} : { chaosOk: false, chaosSide: null }) });
  // 決め打ちの骨は、上書きの輪が組める形 (固定 1 + 外れ 1 の枠 2 つの側) だけ普通の骨も試す (天体で回すなら普通の骨が安い)
  const bones = canOverwrite ? ([undefined, "preserved"] as const) : ([undefined] as const);
  for (const ch of chaosVariants) for (const bn of bones) picks.push({ label: `決め打ち${ch ? "" : "・カオス無し"}${bn ? "・普通の骨" : ""}`, ...(bn ? { bone: bn } : {}), ...(ch ? {} : { chaosOk: false, chaosSide: null }) });
  // 深淵の印の輪 (アストリッドで 2 つ持てる時だけ。組めない形なら autoTree が普通の輪にする = 同じ形は下でまとまる)
  if ((inp.craftedLimit ?? 1) >= 2) picks.push({ label: "深淵の印", reroll: "abyss" });
  // 白のベースなら 変成 → 普通のエッセンス で 1 つ確定させる形も比べる (段が届く時だけ。2026-10-03 その 2)
  const me = magicEssenceFor(inp, ctx.cls, ctx.itemLevel);
  if (me) picks.push({ label: "変成 → エッセンス", magicEssence: me, chaosOk: false, chaosSide: null });
  // 特別な MOD のルーンは、その MOD を狙う直前に差す形も比べる (差す前は普通の狙いの分母にルーンの MOD が入らない。2026-10-03 その 3)。
  // 候補が倍になると回すのが重いので、先頭の 2 つだけ
  const raw = ctx.rawCls;
  const runeIds = raw ? inp.targets.map((t) => t.modId).filter((id) => {
    const k = (ctx.data.mods.get(id)?.type ?? "prefix") === "prefix" ? "prefixes" : "suffixes";
    return ctx.cls.pools.normal[k].includes(id) && !raw.pools.normal[k].includes(id);
  }) : [];
  // 形: 普通の狙いを先に作り、差してから、ルーンの MOD を最後の冒涜で取る (冒涜の 3 択は普通の置き場も引くので差した後なら出る)。
  // ルーンの狙いが 1 つで、冒涜の MOD (冒涜でしか付かない狙い) が無い時だけ
  const desecOnly = inp.targets.some((t) => ctx.data.mods.get(t.modId)?.source === "desecrated");
  if (runeIds.length === 1 && !desecOnly) {
    for (const pk of picks.slice(0, 2)) picks.push({ ...pk, label: `${pk.label}・ルーンは後で差す`, lateSocket: runeIds, desecratePick: runeIds[0]! });
  }
  // 白のベースから (開始の指輪が空): 変成・増強 (完全 / 上級) → 消去スパム → 王者 の形だけを比べる (レアでないと高貴・カオスは打てない)。
  // 変成 → エッセンス の形も残す (2026-10-04 オーナー「変成・増強 (パーフェクト) 打ってからダメなら消去スパム」「1 つ揃えば王者」)
  if (!start.slots.length && !start.breach) {
    const white: typeof picks = [];
    for (const tier of ["perfect", "greater"] as const) {
      const ms = magicSpamTargets(inp, ctx.itemLevel, tier === "perfect" ? 50 : 35);
      if (ms.length) white.push({ label: `変成・増強 (${tier === "perfect" ? "完全" : "上級"}) → 王者`, magicSpam: { tier, targets: ms } });
    }
    if (me) white.push({ label: "変成 → エッセンス", magicEssence: me, chaosOk: false, chaosSide: null });
    picks.splice(0, picks.length, ...white);
  }
  const variants: Array<{ greater: string; nodes: ReturnType<typeof autoTree> }> = [];
  for (const pk of picks) {
    for (const g of ["catalyst", "all"] as const) for (const an of annuls) variants.push({
      greater: `${pk.label}・${g}${an === "plain" ? "・素の消去" : an === "side" ? "・側の消去" : pk.annul ? "・側ごと" : ""}`,
      nodes: autoTree({ ...inp, ...pk, greater: g, ...(an ? { annul: an } : {}) }),
    });
    await yieldUi();
  }
  // 同じ形になった候補は 1 つにする (回す手間の節約)
  const uniq = variants.filter((v, i) => variants.findIndex((w) => JSON.stringify(w.nodes) === JSON.stringify(v.nodes)) === i);
  if (uniq.length === 1) return { ...uniq[0]!, plan, simExpected: null, simDone: null };
  const scored: Array<{ v: (typeof uniq)[number]; pDone: number; expected: number }> = [];
  for (const v of uniq) {
    const r = await simulateTreeChunked({ ctx, start, nodes: v.nodes, runs: PICK_RUNS });
    scored.push({ v, pDone: r.pDone, expected: r.perDone });
  }
  const ok = scored.filter((x) => x.pDone >= 0.9);
  const best = ok.length ? ok.reduce((a, b) => (b.expected < a.expected ? b : a)) : scored.reduce((a, b) => (b.pDone > a.pDone ? b : a));
  return { ...best.v, plan, simExpected: best.expected, simDone: best.pDone };
}

/**
 * マジックで狙える物 (白のベースから、2026-10-04): 普通の MOD の狙いで、等級の下限 (上級 35 / 完全 50) 以上・ilvl 以下に狙いの段がある物。
 * 狙いの中で一番出にくい物から 1 つ付けば良いので、届く物は全部 (どれか 1 つ付いたら王者)
 */
function magicSpamTargets(inp: AutoTreeInput, itemLevel: number, floor: number): AutoTreeInput["targets"] {
  const fixed = new Set(inp.fixedIds);
  return inp.targets.filter((t) => {
    const m = inp.data.mods.get(t.modId);
    if (!m || fixed.has(t.modId) || m.source !== "normal") return false;
    return m.tiers.some((x, i) => i >= (t.minTierIndex ?? 0) && x.ilvl >= floor && x.ilvl <= itemLevel && x.weight > 0);
  });
}

/** 自動で組む入力を、計算機の状態と開始の指輪から作る (作り方のツリーと作る見込みで共通) */
export function autoInputFor(c: ReturnType<typeof useHtcCraft>, ctx: Ctx, start: SimState, fixedIds: readonly string[]): AutoTreeInput | null {
  const d = c.data.value, p = c.prices.value;
  if (!d || !p) return null;
  return {
    data: d, prices: p, targets: c.targets.value, fixedIds,
    qualityTag: c.item.value?.catalystTag ?? null,
    qualityPct: c.item.value?.quality ?? null,
    baseQuality: ctx.baseQuality,
    chaosOk: !start.slots.some((x) => x.keep),
    protectedSides: [...new Set(start.slots.filter((x) => x.keep).map((x) => x.side))],
    desecratedTaken: start.slots.some((x) => x.desec),
    chaosSide: chaosSideFor(start, ctx.limits),
    chance: (t) => spawnChance(c, t.modId, t.minTierIndex ?? 0),
    limits: ctx.limits,
    craftedLimit: ctx.craftedLimit ?? 1,
    fixedSides: [...new Set(start.slots.filter((x) => x.fixed).map((x) => x.side))],
    startCount: { prefix: start.slots.filter((x) => x.side === "prefix").length, suffix: start.slots.filter((x) => x.side === "suffix").length },
    startLoose: { prefix: start.slots.filter((x) => x.side === "prefix" && !x.fixed).length, suffix: start.slots.filter((x) => x.side === "suffix" && !x.fixed).length },
    startKeep: { prefix: start.slots.filter((x) => x.side === "prefix" && x.keep && !x.modId).length, suffix: start.slots.filter((x) => x.side === "suffix" && x.keep && !x.modId).length },
  };
}
