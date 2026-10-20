/**
 * auto-model.ts — シミュレーターの狙い (QuizSimIn) から動的計画法の材料を組み立てる (解析君、2026-10-20)。入口の型は auto-solve.ts
 *
 * 札 (狙いの枠) は ⑤ と同じ quizFromSim で組む (札の分け方・関門の打ち止め・始めの形を ⑤ と食い違わせない)。
 * 重みはエンジンの candidates (= modTierWeight と同じ段の数え方。下限はエンジンの入口の orbFloor・ANCIENT_BONE_FLOOR) を、MOD のない始めのアイテム
 * (ルーンは差した状態) で引いて、札ごとの「当たり (狙いの段以上)」「段が低い」と外れの重みの素の表にする。
 * 近似 (中身は auto-actions.ts の頭): 外れの系統は置き場を減らさない・狙いと同じ系統の別の MOD は外れ (系統を塞がない)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { orbFloor, type OrbStrength } from "../../craft-stage/engine";
import { familiesOf, occupiedFamiliesOf } from "../../../vendor/poe2htc/engine/pool";
import { ANCIENT_BONE_FLOOR, DESECRATION_EXCLUSIVE_COUNT } from "../../../vendor/poe2htc/engine/probability";
import { REVEAL_SPEC } from "../../craft-stage/spec/desecrate-specs";
import { candidates, effectiveCls, limitOf } from "../../craft-stage/stage-core";
import { startFrom } from "../../craft-stage/run-plan";
import type { StageItem, StageSide } from "../../craft-stage/types";
import { quizFromSim } from "../quiz-build";
import type { QuizSlot } from "../quiz-recipe";
import { runeEnForId } from "../pattern";
import { fillEngine } from "./auto-engine";
import type { AutoBuilt, AutoInput } from "./auto-solve";

/** 重みの等級: 高貴・カオスの 普通 / 上級 / 完全 (a0〜a2)、骨の 保存 / 古代 (b0・b4) */
export type Grade = "a0" | "a1" | "a2" | "b0" | "b4";
export const GRADES: readonly Grade[] = ["a0", "a1", "a2", "b0", "b4"];
/** 置き場の 1 つの MOD: 系統 (番号)、全部の重み、札の候補なら札ごとの当たり・段が低い重み、冒涜専用か */
export interface MCand { fams: number[]; w: number; ex: boolean; refs: Array<{ k: number; m: number; hit: number; low: number }> }
/** 札 (フラクチャー以外)。members の m 番目が付いたら fams[m] を塞ぐ。ess = 完璧なエッセンスの鍵 (エッセンスの札だけ) */
export interface MSlot { id: string; side: 0 | 1; kind: QuizSlot["kind"]; members: Array<{ modId: string; fams: number[]; ess: string | null }>; group: number; cap: number }

/** 計算の材料 (組み立て済み、構造化複製できる素の物)。中身は auto-model・auto-actions・auto-solve だけが見る */
export interface AutoModel {
  /** 並べる行のキー (④ の simOrder のうち自動で並べる物: "mod:<id>"・"rest:frac"・"rest:<id>") */
  keys: string[];
  /** 始め 1 個の代金 (高貴建て) */
  R: number;
  /** 始めに入っていないルーンの代金 (1 本ごと、⑤ の最初に差す) */
  runeCost: number;
  /** 側ごとの枠 [プレ, サフィ] */
  cap: [number, number];
  slots: MSlot[];
  /** キー → 札の番号 */
  keyIds: Record<string, number[]>;
  /** フラクチャーの側と、固定された候補ごとの割合・塞ぐ系統 */
  frac: { side: 0 | 1; picks: Array<{ p: number; fams: number[]; modId: string }> };
  /** 等級 → [プレの置き場, サフィの置き場]。使えない等級 (アイテムレベルが足りない) は無い */
  pools: Partial<Record<Grade, [MCand[], MCand[]]>>;
  /** 値段 (高貴建て)。0 以下・無い物はその手を使わない (発現は 0 でよい) */
  prices: Record<string, number>;
  /** 発現の冒涜専用 MOD の個数 1 / 2 / 3 の割合 (エンジンの DESECRATION_EXCLUSIVE_COUNT) */
  exRates: number[];
  /** 発現の候補の数 (エンジンの REVEAL_SPEC) */
  offers: number;
  /** 消去・光・骨・完璧なエッセンスの行き先の表 (形の中身の鍵 → 手の名前 → [p, 差分…] の並び)。build の時に stepOutcomes で作る (auto-engine.ts) */
  eng: Record<string, Record<string, number[][]>>;
  /** 形の版 (中身を変えたら上げる。ワーカーの持つ写しの見分け) */
  version: 3;
}

const PRICE_KEYS = [
  "exalt", "exalt_greater", "exalt_perfect", "chaos", "chaos_greater", "chaos_perfect", "annul", "desecrate", "desecrate_ancient", "reveal",
  "OmenofSinistralExaltation", "OmenofDextralExaltation", "OmenofGreaterExaltation", "OmenofSinistralErasure", "OmenofDextralErasure",
  "OmenofSinistralAnnulment", "OmenofDextralAnnulment", "OmenofSinistralCrystallisation", "OmenofDextralCrystallisation",
  "OmenofSinistralNecromancy", "OmenofDextralNecromancy", "OmenofAbyssalEchoes", "OmenofLight",
];
const no = (ja: string, en: string): AutoBuilt => ({ ok: false, reason: { ja, en } });

/** 形と重みを組み立てる。対応していなければ ok: false と理由 */
export function buildAutoModel(input: AutoInput): AutoBuilt {
  const x = input.sim, d: PatchData = x.data;
  if (x.start !== "fractured") return no("自動の順番はフラクチャー済みから始める時だけ", "Auto order needs a fractured start");
  if (x.greater) return no("グレーターエッセンスの道は自動の順番に未対応", "Greater Essence routes aren't supported yet");
  if (x.targets.some((t) => t.method === "augment")) return no("増強スパムの狙いは自動の順番に未対応", "Augmentation spam isn't supported yet");
  const { recipe, error } = quizFromSim({ ...x, order: undefined }, null);
  if (error) return no(error, "These targets can't be built");
  if (recipe.routes.length !== 1 || recipe.start.kind !== "bought") return no("両側のどれかの狙いは自動の順番に未対応", "Either-side targets aren't supported yet");
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
    if (s.kind === "essence" && members.some((m) => !m.ess)) return no("完璧なエッセンス以外のエッセンスの狙いは未対応", "Only Perfect Essence targets are supported");
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
    keys, R: x.startPrice, runeCost, cap: [limitOf(rare, "prefix"), limitOf(rare, "suffix")], slots, keyIds, frac, pools, prices,
    exRates: DESECRATION_EXCLUSIVE_COUNT.map((c) => c.rate), offers: REVEAL_SPEC.actions.flatMap((a) => ("reveal" in a ? [a.reveal.offers] : []))[0] ?? 3, eng: {}, version: 3,
  };
  const err = fillEngine(model, { data: d, base: x.base, itemLevel: x.itemLevel, ...(x.sockets ? { sockets: x.sockets } : {}), runes: runeAll, junk });
  if (err) return no(err, "Too many shapes for auto order");
  return { ok: true, model };
}
