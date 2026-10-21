/**
 * auto-model.ts — シミュレーターの狙い (QuizSimIn) から動的計画法の材料を組み立てる (解析君、2026-10-20)。入口の型は auto-solve.ts
 *
 * 札 (狙いの枠) は ⑤ と同じ quizFromSim で組む (札の分け方・関門の打ち止め・始めの形を ⑤ と食い違わせない)。
 * 重みはエンジンの candidates (= modTierWeight と同じ段の数え方。下限はエンジンの入口の orbFloor・ANCIENT_BONE_FLOOR) を、MOD のない始めのアイテム
 * (ルーンは差した状態) で引いて、札ごとの「当たり (狙いの段以上)」「段が低い」と外れの重みの素の表にする。
 * 近似 (中身は auto-actions.ts の頭): 外れの系統は置き場を減らさない・狙いと同じ系統の別の MOD は外れ (系統を塞がない)
 */
import { ANCIENT_BONE_FLOOR, candidates, DESECRATION_EXCLUSIVE_COUNT, effectiveCls, familiesOf, limitOf, occupiedFamiliesOf, orbFloor, REVEAL_SPEC, sideOfMod, startFrom, type OrbStrength, type PatchData, type StageItem, type StageSide } from "../../craft-stage/engine";
import { quizFromSim } from "../quiz-build";
import type { QuizSlot } from "../quiz-recipe";
import { runeEnForId } from "../pattern";
import { fillEngine, startStates } from "./auto-engine";
import { Shape } from "./auto-actions";
import type { AutoBuilt, AutoInput, AutoModel, Grade, MCand, MSlot } from "./auto-types";

export type { Grade, MCand, MSlot, AutoModel } from "./auto-types";
export const GRADES: readonly Grade[] = ["a0", "a1", "a2", "b0", "b4"];

const PRICE_KEYS = [
  "exalt", "exalt_greater", "exalt_perfect", "chaos", "chaos_greater", "chaos_perfect", "annul", "desecrate", "desecrate_ancient", "reveal",
  "OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofGreaterExaltation", "OmenofSinistralErasure", "OmenofDextralErasure",
  "OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofSinistralCrystallisation", "OmenofDextralCrystallisation",
  "OmenofSinistralNecromancy", "OmenofDextralNecromancy", "OmenofAbyssalEchoes", "OmenofLight",
];
const ASTRID = "Astrid's Creativity";
const no = (ja: string, en: string): AutoBuilt => ({ ok: false, reason: { ja, en } });

/** 形と重みを組み立てる。対応していなければ ok: false と理由 */
export function buildAutoModel(input: AutoInput): AutoBuilt {
  const x = input.sim, d: PatchData = x.data;
  if (x.start !== "fractured") return no("自動の順番はフラクチャー済みから始める時だけ", "Auto order needs a fractured start");
  // グレーターエッセンスを巻き込む道 (greater、K3・K8): 始めの形が違うだけ (startStates が ⑤ の buildStart と同じ手順でたどる)。
  // そのエッセンスの MOD の札は始めに付いていて、消えたら付け直せない (マジックにしか打てない) = その形からは作り直し
  if (x.targets.some((t) => t.method === "augment")) return no("増強スパムの狙いは自動の順番に未対応", "Augmentation spam isn't supported yet");
  const { recipe, error } = quizFromSim({ ...x, order: undefined }, null);
  if (error) return no(error, "These targets can't be built");
  if (recipe.routes.length === 2 && recipe.start.kind === "bought") return buildSplit(input, recipe.routes.map((r) => ({ id: r.id, ids: r.goal.map((g) => g.id).sort().join(",") })));
  if (recipe.routes.length !== 1 || recipe.start.kind !== "bought") return no("この始め方は自動の順番に未対応", "This start isn't supported yet");
  const goal = recipe.routes[0]!.goal;
  const fracSlot = goal.find((s) => s.kind === "fractured");
  if (!fracSlot) return no("フラクチャーの狙いが無い", "No fracture target");
  const rest = goal.filter((s) => s !== fracSlot);
  if (!rest.length) return no("並べる狙いが無い", "No targets to order");
  if (rest.length > 8) return no("狙いが多すぎる (8 つまで)", "Too many targets (8 max)");
  if (rest.some((s) => s.temp || !s.mods.length)) return no("途中だけの札・何でも良い札は未対応", "Temporary or any-mod targets aren't supported");
  const sideN = (s: StageSide): 0 | 1 => (s === "prefix" ? 0 : 1);

  // ルーン: 狙い (と候補) の MOD に要るルーンは全部始めから差した扱い。始めに無い分は代金を 1 本ごとに足す
  const st = recipe.start;
  const runeAll = [...new Set(goal.flatMap((s) => s.mods).map((m) => d.mods.get(m.modId)?.rune).filter((r): r is string => !!r).map((r) => runeEnForId(r)).filter((r): r is string => !!r))];
  // エッセンスの MOD はアイテムに 1 つまで、アストリッドの創造性 1 つごとに 1 つ増える (エンジンの craftedLimitOf)。エッセンスの札が 2 つ以上ならその分を差す (K8)
  for (let i = goal.filter((s) => s.kind === "essence").length - 1; i > 0; i--) runeAll.push(ASTRID);
  const runes0 = new Set(st.runes ?? []);
  if (runeAll.length > (x.sockets ?? st.sockets ?? 0) && runeAll.length) return no("要るルーンがソケットより多い", "More runes needed than sockets");
  const runeCost = runeAll.filter((r) => !runes0.has(r)).reduce((a, r) => a + (x.runePrice?.(r) ?? 0), 0);
  let item: StageItem;
  try { item = startFrom(d, x.base, x.itemLevel, { rarity: "rare", ...(x.sockets ? { sockets: x.sockets } : {}), runes: runeAll }, 1); } catch { return no("ベースが見つからない", "Base not found"); }
  item = { ...item, rarity: "rare", prefixes: [], suffixes: [] };

  // 系統の番号
  const famIdx = new Map<string, number>();
  const fi = (f: string): number => { let i = famIdx.get(f); if (i == null) { i = famIdx.size; famIdx.set(f, i); } return i; };
  const occ = (modId: string): number[] => { const m = d.mods.get(modId); return m ? occupiedFamiliesOf(m).map(fi) : []; };

  const caps = recipe.routes[0]!.caps ?? {};
  // 中身が同じ札は区別しない (quiz-recipe の groupKey と同じ)
  const gk = (s: QuizSlot) => `${s.side}|${s.kind}|${s.mods.map((m) => `${m.modId}:${m.minTierIndex}`).sort().join(",")}`;
  const gids = new Map<string, number>();
  const slots: MSlot[] = [];
  for (const s of rest) {
    const members = s.mods.map((m) => {
      const mod = d.mods.get(m.modId);
      const ess = s.kind === "essence" && mod?.source === "perfect_essence" ? `essence:perfect:${m.modId}` : null;
      return { modId: m.modId, fams: occ(m.modId), ess };
    });
    const fromStart = !!x.greater?.essKey && members.every((m) => x.greater!.essKey!.endsWith(`:${m.modId}`));
    if (s.kind === "essence" && members.some((m) => !m.ess) && !fromStart) return no("完璧なエッセンス以外のエッセンスの狙いは未対応", "Only Perfect Essence targets are supported");
    if (s.kind === "crafted") return no("クラフト MOD の狙いは未対応", "Crafted targets aren't supported");
    const g = gk(s); if (!gids.has(g)) gids.set(g, gids.size);
    slots.push({ id: s.id, side: sideN(s.side), kind: s.kind, members, group: gids.get(g)!, cap: caps[s.id] ?? 3000 });
  }
  const idOf = new Map(slots.map((s, k) => [s.id, k]));

  // キー → 札: ⑤ の順番 (quizFromSim の route.order) と同じ組み方を、キー 1 つずつで引く
  const keys: string[] = [];
  const keyIds: Record<string, number[]> = {};
  for (const t of x.targets) for (const k of t.method === "fracture" ? (t.rest ? ["rest:frac"] : []) : [`mod:${t.modId}`, ...(t.rest ? [`rest:${t.modId}`] : [])]) {
    const r = quizFromSim({ ...x, order: [k] }, null).recipe.routes[0]!;
    const ks = (r.order ?? []).flatMap((id) => id.split("|")).map((id) => idOf.get(id)).filter((v): v is number => v != null);
    if (ks.length && !keyIds[k]) { keyIds[k] = ks; keys.push(k); }
  }

  // フラクチャーの候補ごとの割合 (買うたびに付きやすさの重みで 1 つ)
  const picks = st.pick?.length
    ? st.pick.map((p) => ({ w: Math.max(0, p.w), modId: p.mods[0]!.mod }))
    : [{ w: 1, modId: st.mods[0]!.mod }];
  const wSum = picks.reduce((a, p) => a + p.w, 0) || 1;
  const frac = { side: sideN(fracSlot.side), picks: picks.map((p) => ({ p: p.w / wSum, fams: occ(p.modId), modId: p.modId })) };

  // 置き場の重み (エンジンの candidates をそのまま。骨は普通 + 冒涜専用、冒涜専用はアイテムレベルを見ない)
  const desPool = (side: StageSide) => { const k = side === "prefix" ? "prefixes" : "suffixes"; return [...new Set([...effectiveCls(item).pools.normal[k], ...item.cls.pools.desecrated[k]])]; };
  const pools: AutoModel["pools"] = {};
  // 表の代表のアイテムの外れ: 狙い・固定の候補と系統が重ならない、互いにも重ならない MOD (重い順)
  const taken = new Set<number>([...frac.picks.flatMap((p) => p.fams), ...slots.flatMap((s) => s.members.flatMap((mb) => mb.fams))]);
  const junk: [string[], string[]] = [[], []];
  const junkCands: [Array<{ id: string; fams: number[]; w: number }>, Array<{ id: string; fams: number[]; w: number }>] = [[], []];
  // 段の下限はエンジンの入口 (orbFloor)。高貴とカオスは同じ置き場の表 (a0〜a2) を使うので、下限が食い違ったら対応外
  const STR: Record<"a0" | "a1" | "a2", OrbStrength> = { a0: "base", a1: "greater", a2: "perfect" };
  for (const g of ["a0", "a1", "a2"] as const) {
    if (orbFloor("exalt", STR[g]) !== orbFloor("chaos", STR[g])) return no("高貴とカオスの段の下限が違うので自動の順番に未対応", "Exalted and Chaos tier floors differ; auto order is not supported");
  }
  const floors: Record<Grade, number> = { a0: orbFloor("exalt", "base"), a1: orbFloor("exalt", "greater"), a2: orbFloor("exalt", "perfect"), b0: 0, b4: ANCIENT_BONE_FLOOR };
  for (const g of GRADES) {
    if (x.itemLevel < floors[g]) continue;
    const bone = g[0] === "b";
    const sides = (["prefix", "suffix"] as const).map((side) => {
      const cs = candidates(d, item, [side], floors[g], bone ? { pools: () => desPool(side), anyLevel: (m) => m.source === "desecrated" } : {});
      return cs.map((c): MCand => {
        const refs: MCand["refs"] = [];
        slots.forEach((s, k) => {
          if (s.side !== sideN(side)) return;
          s.members.forEach((m, mi) => {
            if (m.modId !== c.mod.id || s.kind === "essence") return;
            const minT = rest[k]!.mods[mi]!.minTierIndex;
            const hit = c.tiers.filter((t) => t.index >= minT).reduce((a, t) => a + t.w, 0);
            refs.push({ k, m: mi, hit, low: c.w - hit });
          });
        });
        const fams = familiesOf(c.mod).map(fi);
        if (g === "a0" && !refs.length && c.mod.source !== "desecrated" && !slots.some((s) => s.members.some((mb) => mb.modId === c.mod.id)) && fams.every((f) => !taken.has(f))) junkCands[sideN(side)].push({ id: c.mod.id, fams, w: c.w });
        return { fams, w: c.w, ex: c.mod.source === "desecrated", refs };
      });
    }) as [MCand[], MCand[]];
    pools[g] = sides;
  }
  const prices: Record<string, number> = {};
  for (const k of [...PRICE_KEYS, ...slots.flatMap((s) => s.members.map((m) => m.ess).filter((e): e is string => !!e))]) prices[k] = input.price(k);
  const rare = { ...item, rarity: "rare" as const };
  for (const sd of [0, 1] as const) {
    for (const c of junkCands[sd].sort((a, b) => b.w - a.w)) if (c.fams.every((f) => !taken.has(f))) { junk[sd].push(c.id); c.fams.forEach((f) => taken.add(f)); }
  }
  const model: AutoModel = {
    keys, R: x.startPrice, runeCost, runes: runeAll, cap: [limitOf(rare, "prefix"), limitOf(rare, "suffix")], slots, keyIds, frac, pools, prices,
    exRates: DESECRATION_EXCLUSIVE_COUNT.map((c) => c.rate), offers: REVEAL_SPEC.actions.flatMap((a) => ("reveal" in a ? [a.reveal.offers] : []))[0] ?? 3, starts: [], eng: {}, version: 3,
  };
  const ectx = { data: d, base: x.base, itemLevel: x.itemLevel, ...(x.sockets ? { sockets: x.sockets } : {}), runes: runeAll, junk };
  if (st.kind !== "bought") return no("この始め方は自動の順番に未対応", "This start isn't supported yet");
  const ss = startStates(new Shape(model), ectx, st, rest.map((r) => r.mods.map((mm) => mm.minTierIndex)));
  if (typeof ss === "string") return no(ss, "The start item can't be modelled");
  model.starts = ss;
  const err = fillEngine(model, ectx);
  if (err) return no(err, "Too many shapes for auto order");
  return { ok: true, model };
}

/**
 * 両側の「どれか」(K6、設計 auto-flow-design.md の 3-3 B・メモ sim-split-by-side): その札を側ごとの候補だけにした狙いで model を 2 つ組む。
 * ⑤ は札が付くまで 1 つ目の route (prefix) の答えで打ち、反対の側の候補が付いたらその route に移る。
 * 費用は 1 つ目の route の model の値 (反対の側にたまたま付いて移る得は見ない = 計算が少し高い向きの近似)。答えは route ごとにその model の方策から (auto-rules)
 */
function buildSplit(input: AutoInput, routes: Array<{ id: string; ids: string }>): AutoBuilt {
  const x = input.sim, d = x.data;
  const sideOf = (id: string): StageSide => sideOfMod(d, id);
  const t = x.targets.find((y) => y.method !== "fracture" && new Set([y.modId, ...(y.alts ?? []).map((a) => a.modId)].map(sideOf)).size > 1);
  if (!t) return no("両側のどれかの札が見つからない", "Either-side target not found");
  const members = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
  const out: Array<{ id: string; model: AutoModel }> = [];
  for (const r of routes) {
    const ms = members.filter((mm) => sideOf(mm.modId) === r.id);
    if (!ms.length) return no("両側のどれかの札の側が合わない", "Either-side target sides don't match");
    const t1 = { ...t, modId: ms[0]!.modId, minTierIndex: ms[0]!.minTierIndex, alts: ms.slice(1), need: 1 };
    const b = buildAutoModel({ ...input, sim: { ...x, targets: x.targets.map((y) => (y === t ? t1 : y)) } });
    if (!b.ok) return b;
    const m = b.model;
    // 札の id が ⑤ の route と同じか (答えの条件は札の id で書く)
    const want = r.ids.split(","), ids = m.slots.map((sl) => sl.id);
    if (want.length !== ids.length + 1 || !ids.every((id) => want.includes(id))) return no("両側のどれかの札の並びが ⑤ と合わない", "Either-side slots don't match the recipe");
    // 並べる行のキーは元の狙いの modId のまま (④ の表の行)
    const k0 = `mod:${t1.modId}`, k1 = `mod:${t.modId}`;
    if (k0 !== k1 && m.keyIds[k0]) { m.keyIds[k1] = m.keyIds[k0]!; delete m.keyIds[k0]; m.keys = m.keys.map((k) => (k === k0 ? k1 : k)); }
    out.push({ id: r.id, model: m });
  }
  return { ok: true, model: { ...out[0]!.model, routes: out } };
}
