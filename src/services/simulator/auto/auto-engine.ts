/**
 * auto-engine.ts — 消す・光・骨・完璧なエッセンスの行き先を、エンジンの入口の stepOutcomes から組む (解析君、2026-10-20 手 5)。
 *
 * build の時 (画面の側、エンジンのデータがある所) に 1 回: 始めの形から、打てる手と ⑤ の見え方 (札 → 外れ) でたどれる形を全部回り、
 * 形の「中身の鍵」ごとに代表のアイテム (startFrom で固定・札・外れの MOD、未発現は骨を打って) を組んで stepOutcomes を打つ。
 * 行き先は「どの役の MOD を消した・何を付けた」の差分 (Op) にして model.eng に入れる。ワーカーの solveOrder はこの表を読むだけ (エンジンを読まない)。
 *   - 中身の鍵 = 固定の候補・札ごとの有無と候補 (段の高い低いは見ない: 消す・骨・エッセンスの行き先は段に関係ない)・外れの数・冒涜の印
 *   - カオスの消す部分は消去の表を使う: 打つ処理のスペックはカオス { remove: n 1, equal, overLimitVoids } と消去 { remove: n 1, equal } で、
 *     抹消 (removeSide) と消去のお告げ (side) は removeStep で同じ側の決め方。上限を超えた側に当たる不成立は形では起きない
 *   - 付ける (高貴・カオスの付ける部分) は auto-model の置き場の重み (エンジンの candidates) のまま。stepOutcomes で手ごとに組むと手袋で 20 秒を超える
 *   - 発現は選択なので stepOutcomes の外 (auto-actions の revealOuts のまま)
 * 近似: 外れの MOD は代表 (狙いとも互いとも系統が重ならない物) で置く。エッセンスの札が付いている時の代表は外れと同じ代わりの MOD
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { startFrom, stepOutcomes, type StageItem, type StageMod } from "../../craft-stage/engine";
import type { AutoModel } from "./auto-model";
import { actionsOf, engActs, engKey, junkToView, Shape, type EngAct, type State } from "./auto-actions";

/** 代表を組む材料 */
export interface EngCtx {
  data: PatchData; base: string; itemLevel: number; sockets?: number; runes: string[];
  /** 側ごとの外れの代表 (狙い・固定の候補と系統が重ならない、互いにも重ならない MOD) */
  junk: [string[], string[]];
}

const SIDE = ["prefix", "suffix"] as const;
const NECRO = ["OmenofSinistralNecromancy", "OmenofDextralNecromancy"] as const;
/** 形の数の上限 (これを超えたら対応外) */
const MAX_STATES = 40000;

/** 始めの形から、手と見え方でたどれる形を全部回って model.eng を埋める。null = 組めた、文字列 = 組めない理由 */
export function fillEngine(m: AutoModel, ctx: EngCtx): string | null {
  const sh = new Shape(m);
  const seen = new Set<string>();
  const queue: State[] = [];
  const push = (s: State) => { const k = sh.key(s); if (!seen.has(k)) { seen.add(k); queue.push(s); } };
  for (const [, s] of sh.starts()) push(sh.canon(s));
  while (queue.length) {
    if (seen.size > MAX_STATES) return "形が多すぎる";
    const s = queue.pop()!;
    const ek = engKey(sh, s);
    if (!(ek in m.eng)) m.eng[ek] = engineRows(sh, s, ctx);
    if (sh.goal(s)) continue;
    for (const a of actionsOf(sh, s)) for (const [, t] of a.out) push(t);
    for (let k = 0; k < sh.K; k++) if (s[1 + k]) push(junkToView(sh, s, k));
  }
  return null;
}

const actsOf = new WeakMap<AutoModel, EngAct[]>();
const acts = (m: AutoModel): EngAct[] => { let a = actsOf.get(m); if (!a) { a = engActs(m); actsOf.set(m, a); } return a; };

type Role = { r: "slot"; k: number } | { r: "junk"; side: 0 | 1; des: boolean } | { r: "u" } | { r: "frac" };
const modKey = (x: StageMod): string => `${x.modId}|${x.side}|${x.unrevealed ? "u" : ""}|${x.desecrated ? "d" : ""}`;

/** 形の中身の鍵 1 つ分の行き先 (手の名前 → [p, Op…] の並び)。代表が組めなければ空 (その形では消す系の手を使わない) */
function engineRows(sh: Shape, s: State, ctx: EngCtx): Record<string, number[][]> {
  const built = repItem(sh, s, ctx);
  if (!built) return {};
  const { item, roles } = built;
  const out: Record<string, number[][]> = {};
  const d = s[sh.dx()]!;
  for (const a of acts(sh.m)) {
    if (a.kind === "es" && s[1 + a.k] !== 0) continue;
    if (a.kind === "bo" && d !== 0) continue;
    const key = a.kind === "es" ? sh.m.slots[a.k]!.members[a.m]!.ess : a.key;
    if (!key) continue;
    if (a.kind === "es" && sh.m.prices[key] == null) continue;
    const res = stepOutcomes(ctx.data, item, key, a.omens);
    if (!res || !res.length) continue;
    const rows: number[][] = [];
    let ok = true;
    for (const o of res) {
      if (o.void) { rows.push([o.p]); continue; }
      const ops: number[] = [];
      for (const x of o.removed) {
        const r = roles.get(modKey(x));
        if (!r) { ok = false; break; }
        if (r.r === "slot") ops.push(0, r.k);
        else if (r.r === "junk") ops.push(r.des ? 2 : 1, r.side);
        else if (r.r === "u") ops.push(3);
        else { ok = false; break; }
      }
      for (const x of o.added) {
        if (!ok) break;
        const side = x.side === "prefix" ? 0 : 1;
        if (x.unrevealed && a.kind === "bo") ops.push(4, (a.grade === "b4" ? 2 : 1) + 2 * side);
        else if (a.kind === "es" && x.modId === sh.m.slots[a.k]!.members[a.m]!.modId) ops.push(5, a.k, a.m);
        else ok = false;
      }
      if (!ok) break;
      rows.push([o.p, ...ops]);
    }
    if (ok) out[a.name] = rows;
  }
  return out;
}

/** 形の代表のアイテムと、MOD → 役 */
function repItem(sh: Shape, s: State, ctx: EngCtx): { item: StageItem; roles: Map<string, Role> } | null {
  const m = sh.m, d = s[sh.dx()]!;
  const mods: Array<{ mod: string; fractured?: boolean; desecrated?: boolean }> = [];
  const roles = new Map<string, Role>();
  const want: Array<{ modId: string; side: 0 | 1; des: boolean; role: Role }> = [];
  want.push({ modId: m.frac.picks[s[0]!]!.modId, side: m.frac.side, des: false, role: { r: "frac" } });
  const used = [0, 0];
  const nextJunk = (side: 0 | 1): string | null => ctx.junk[side][used[side]++] ?? null;
  for (let k = 0; k < sh.K; k++) {
    const v = s[1 + k]!;
    if (!v) continue;
    const sl = m.slots[k]!;
    const modId = sl.kind === "essence" ? nextJunk(sl.side) : sl.members[sh.member(k, v)]!.modId;
    if (!modId) return null;
    want.push({ modId, side: sl.side, des: d === 7 + k, role: { r: "slot", k } });
  }
  for (const side of [0, 1] as const) {
    for (let i = 0; i < s[sh.jx(side)]!; i++) {
      const modId = nextJunk(side);
      if (!modId) return null;
      const des = i === 0 && d === 5 + side;
      want.push({ modId, side, des, role: { r: "junk", side, des } });
    }
  }
  for (const w of want) mods.push({ mod: w.modId, ...(w.role.r === "frac" ? { fractured: true } : {}), ...(w.des ? { desecrated: true } : {}) });
  let item: StageItem;
  try { item = startFrom(ctx.data, ctx.base, ctx.itemLevel, { rarity: "rare", ...(ctx.sockets ? { sockets: ctx.sockets } : {}), runes: ctx.runes, mods }, 1); } catch { return null; }
  for (const x of [...item.prefixes, ...item.suffixes]) {
    const w = want.find((y) => y.modId === x.modId && SIDE[y.side] === x.side);
    if (!w) return null;
    roles.set(modKey(x), w.role);
  }
  // 未発現は骨を打って付ける (側はお告げで決める)
  if (d >= 1 && d <= 4) {
    const side = d <= 2 ? 0 : 1;
    const r = stepOutcomes(ctx.data, item, d === 2 || d === 4 ? "desecrate_ancient" : "desecrate", [NECRO[side]]);
    const o = r?.find((x) => !x.void && x.added.some((y) => y.unrevealed));
    if (!o || o.removed.length) return null;
    item = o.item;
    roles.set(modKey(o.added.find((y) => y.unrevealed)!), { r: "u" });
  }
  return { item, roles };
}
