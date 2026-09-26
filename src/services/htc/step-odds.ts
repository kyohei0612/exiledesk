/**
 * step-odds.ts — 今の指輪に、次に 1 つ MOD を付ける打ち方と確率 (2026-09-24)
 *
 * オーナー:「1 手進むごとに作る MOD を選択したらいいんじゃね。今全部忍者始動の動きだからね」。
 * 完成品 (忍者) から道を逆算するのをやめ、**今の状態 + 次に狙う MOD 1 つ**だけで打ち方を並べる。
 *
 * 打ち方 (どれも 1 回ぶんの確率と値段):
 *   - 高貴 (素 / 上級 35 / 完全 50) × 側のお告げ (あり / なし) × 触媒の高貴のお告げ + カタリスト (効く物だけ)
 *   - カオス (素 / 上級 / 完全): 外せる MOD 1 つが一様に消えて 1 つ付く (付いている狙いが消えることもある)
 *   - パーフェクトエッセンス + 側の結晶化のお告げ: 確定。その側の外せる MOD 1 つと入れ替わる
 *   - 冒涜 (保存された / 古代の骨) + 側のネクロマンシーのお告げ (+ 反響): 3 択。外れは光のお告げで消す
 * 外れを消す手 (消去 / 消去 + 側の消去のお告げ) も、何が消えるかの確率付きで出す。
 *
 * 重みは [[weight-overrides.ts]] を通した poe2db の値、カタリストの倍率は [[catalysing.ts]]。
 * 「カレンシーランキングに無い物は使えない」(オーナー) ので、値段の無い手は出さない。
 */
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import { catalysingMultiplier, catalystCountFor, catalystPriceKey } from "./catalysing";
import { CATALYSTS, catalystsFor } from "./quality";
import { jaOfOmen, jaOfPriceKey } from "./labels";
import { OMEN } from "./omens";

export type Side = "prefix" | "suffix";

/** 指輪に付いている物 1 つ。modId が null なら外れ */
export interface Slot {
  modId: string | null;
  side: Side;
  /** 固定済み・樹 MOD (消えない) */
  fixed: boolean;
  /** 画面の名前 (樹 MOD など、エンジンに無い物) */
  label?: string;
}

export interface ItemState {
  slots: Slot[];
  /** ブリーチの MOD がプレに居る (品質の上限 40%)。消去・カオスで消えうる */
  breach: boolean;
}

export interface StepCtx {
  data: PatchData;
  cls: ItemBase;
  prices: Prices;
  itemLevel: number;
  limits: { prefix: number; suffix: number };
  /** カタリストを使うか (tag → bool) */
  catalystOk: (tag: string) => boolean;
}

export interface StepMethod {
  kind: "exalt" | "chaos" | "essence" | "desecrate";
  label: string;
  /** 1 回で狙いが付く確率 */
  p: number;
  perTry: number;
  /**
   * 当たるまでの平均。外れ 1 回ごとに「その外れを消す一番安い手 ÷ 外れが消える確率」を足す
   * (素の高貴が一番安く見えていた 2026-09-24)。消去で付いた狙いが消えた時の作り直しは含まない。冒涜は光のお告げ込み
   */
  avg: number;
  /** 外れた時に付く側 (高貴の側のお告げ / 冒涜)。null ならどちらもある */
  missSide: Side | null;
  /** 冒涜の外れを消す 1 回 (消去のオーブ + 光のお告げ) */
  light?: number;
  /** 外れた後、一番安い消去 1 回で付いている狙い (かブリーチの MOD) が消える確率。平均には入っていない */
  loseRisk?: number;
  note?: string;
}

export interface Cleanup {
  label: string;
  perTry: number;
  /** 何が消えるか。slot は ItemState.slots の添字、-1 はブリーチの MOD */
  removes: Array<{ slot: number; p: number }>;
  /** 外れが消える確率 */
  pJunk: number;
}

const EXALTS: ReadonlyArray<[string, number, string]> = [
  ["exalt", 0, "高貴なオーブ"], ["exalt_greater", 35, "高貴なオーブ (上級)"], ["exalt_perfect", 50, "高貴なオーブ (完全)"],
];
const CHAOS: ReadonlyArray<[string, number, string]> = [
  ["chaos", 0, "カオスオーブ"], ["chaos_greater", 35, "カオスオーブ (上級)"], ["chaos_perfect", 50, "カオスオーブ (完全)"],
];
const SIDE_JA: Record<Side, string> = { prefix: "左", suffix: "右" };

/**
 * MOD の重み (minIdx の段より上で、ilvl で出る段の合計)。floor = 上級・完全のオーブや古代の骨の段の足切り。
 * シミュレーター・1 手ずつ・自動の組み立て・確率の実験室で同じ式を使う
 */
export function tierWeight(m: Mod, minIdx: number, ilvl: number, floor = 0): number {
  return m.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= ilvl && t.ilvl >= floor ? t.weight : 0), 0);
}

export function stepHelpers(ctx: StepCtx) {
  const { data, cls, prices, itemLevel } = ctx;
  const cur = (k: string): number => prices.currency[k] ?? prices.omens[k] ?? Infinity;
  const mod = (id: string): Mod | undefined => data.mods.get(id);
  const sw = (m: Mod, minIdx: number, floor: number): number => tierWeight(m, minIdx, itemLevel, floor);
  const count = (s: ItemState, side: Side): number => s.slots.filter((x) => x.side === side).length + (side === "prefix" && s.breach ? 1 : 0);
  const room = (s: ItemState, side: Side): boolean => count(s, side) < ctx.limits[side];
  const families = (s: ItemState, skip = -1): Set<string> =>
    new Set(s.slots.flatMap((x, i) => (i !== skip && x.modId ? [mod(x.modId)?.family ?? ""] : [])));
  /** その側で付きうる普通の MOD の重み (付いている系統を除く)。tag のカタリストが効く物は mult 倍 */
  const poolW = (side: Side, occ: Set<string>, floor: number, tag: string | null, mult: number): number =>
    cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"].reduce((a, id) => {
      const m = mod(id);
      if (!m || occ.has(m.family)) return a;
      return a + sw(m, 0, floor) * (tag && catalystsFor(m).some((c) => c.tag === tag) ? mult : 1);
    }, 0);
  const quality = (s: ItemState): number => (s.breach ? 40 : 20);

  /** 外れが 1 つ付いた後、それを消す費用の見込み (一番安い消去 ÷ 外れが消える確率)。side が null なら両側の平均 */
  function junkCost(s: ItemState, side: Side | null): { cost: number; risk: number } {
    const one = (x: Side): { cost: number; risk: number } => {
      const cl = cleanups({ ...s, slots: [...s.slots, { modId: null, side: x, fixed: false }] });
      if (!cl.length) return { cost: Infinity, risk: 0 };
      const best = cl.reduce((a, c) => (c.perTry / c.pJunk < a.perTry / a.pJunk ? c : a));
      return { cost: best.perTry / best.pJunk, risk: 1 - best.pJunk };
    };
    if (side) return one(side);
    const sides = (["prefix", "suffix"] as Side[]).filter((x) => room(s, x));
    const all = sides.map(one);
    const n = Math.max(1, all.length);
    return { cost: all.reduce((a, x) => a + x.cost, 0) / n, risk: all.reduce((a, x) => a + x.risk, 0) / n };
  }

  /** 狙い 1 つの打ち方。平均 (外れの後始末込み) の安い順 */
  function methodsFor(s: ItemState, modId: string, minTier: number): StepMethod[] {
    const t = mod(modId);
    if (!t) return [];
    const side = t.type as Side;
    const out: StepMethod[] = [];
    const occ = families(s);
    if (occ.has(t.family)) return [];
    const q = quality(s);
    if (t.source === "normal" && room(s, side)) {
      const tags = catalystsFor(t).map((c) => c.tag).filter((tag) => ctx.catalystOk(tag) && Number.isFinite(cur(catalystPriceKey(tag))));
      for (const [k, floor, ja] of EXALTS) {
        for (const omen of [true, false]) {
          const sides: Side[] = omen ? [side] : (["prefix", "suffix"] as Side[]).filter((x) => room(s, x));
          for (const tag of [null, ...tags]) {
            const mult = tag ? catalysingMultiplier(q) : 1;
            const W = sides.reduce((a, x) => a + poolW(x, occ, floor, tag, mult), 0);
            const p = (sw(t, minTier, floor) * (tag ? mult : 1)) / W;
            const perTry = cur(k) + (omen ? cur(OMEN.exalt[side]) : 0)
              + (tag ? cur("OmenofCatalysingExaltation") + catalystCountFor(q) * cur(catalystPriceKey(tag)) : 0);
            if (!(p > 0) || !Number.isFinite(perTry)) continue;
            const cja = tag ? CATALYSTS.find((c) => c.tag === tag)?.ja ?? tag : "";
            const missSide = omen ? side : sides.length === 1 ? sides[0]! : null;
            const jc = junkCost(s, missSide);
            out.push({ kind: "exalt", p, perTry, avg: (perTry + (1 - p) * jc.cost) / p, missSide, loseRisk: jc.risk,
              label: `${ja}${omen ? ` + ${SIDE_JA[side]}側の高貴なお告げ` : ""}${tag ? ` + 触媒の高貴のお告げ + ${cja} (品質 ${q}%)` : ""}` });
          }
        }
      }
      // カオス: 外せる物 1 つが消えて 1 つ付く (消えた後の空きに付く)
      const removable = s.slots.map((x, i) => (x.fixed ? -1 : i)).filter((i) => i >= 0);
      const rem = [...removable, ...(s.breach ? [-1] : [])];
      if (rem.length) {
        for (const [k, floor, ja] of CHAOS) {
          let p = 0;
          for (const r of rem) {
            const after: ItemState = r === -1 ? { ...s, breach: false } : { ...s, slots: s.slots.filter((_, i) => i !== r) };
            const occ2 = families(after);
            const sides = (["prefix", "suffix"] as Side[]).filter((x) => room(after, x));
            if (!sides.includes(side)) continue;
            const W = sides.reduce((a, x) => a + poolW(x, occ2, floor, null, 1), 0);
            p += sw(t, minTier, floor) / W / rem.length;
          }
          const perTry = cur(k);
          const lose = removable.filter((i) => s.slots[i]!.modId).length;
          if (p > 0 && Number.isFinite(perTry)) {
            // 外れた時: 外せる物 1 つが外れに入れ替わった状態。後始末はその外れを消す分で見る
            const jc = junkCost(s, null);
            out.push({ kind: "chaos", p, perTry, avg: (perTry + (1 - p) * jc.cost) / p, missSide: null, loseRisk: jc.risk, label: ja,
              ...(lose ? { note: `付いている狙い ${lose} つも消えうる (外せる ${rem.length} つから 1 つ消える)` } : {}) });
          }
        }
      }
    }
    // パーフェクトエッセンス: その側の外せる物 1 つと入れ替わる (外れが居れば外れと)
    if (t.source === "perfect_essence") {
      const price = cur(`essence:perfect:${modId}`) + cur(OMEN.crystallisation[side]);
      const onSide = s.slots.filter((x) => x.side === side && !x.fixed);
      const junk = onSide.filter((x) => !x.modId).length + (side === "prefix" && s.breach ? 1 : 0);
      if (Number.isFinite(price) && onSide.length + (side === "prefix" && s.breach ? 1 : 0) > 0) {
        const n = onSide.length + (side === "prefix" && s.breach ? 1 : 0);
        out.push({ kind: "essence", p: 1, perTry: price, avg: price, missSide: null,
          label: `パーフェクトエッセンス + ${SIDE_JA[side]}側の結晶化のお告げ`,
          note: junk === n ? "外れ (かブリーチの MOD) と入れ替わる" : `${SIDE_JA[side]}側の外せる ${n} つから 1 つと入れ替わる (狙いが消えることもある)` });
      } else if (Number.isFinite(price) && room(s, side)) {
        // 食わせる物が無い: 先に高貴 + 側のお告げで外れを 1 つ付ける (その分も 1 回の値段に入れる)
        const junk = cur("exalt") + cur(OMEN.exalt[side]);
        if (Number.isFinite(junk)) {
          out.push({ kind: "essence", p: 1, perTry: price + junk, avg: price + junk, missSide: null,
            label: `高貴なオーブ + ${SIDE_JA[side]}側の高貴なお告げ (外れを 1 つ) → パーフェクトエッセンス + ${SIDE_JA[side]}側の結晶化のお告げ`,
            note: "付けた外れと入れ替わる (狙いの MOD が付けば、その時はそのまま残してよい)" });
        }
      }
    }
    // 冒涜: 3 択。側のネクロマンシーのお告げで側を決める
    if ((t.source === "normal" || t.source === "desecrated") && room(s, side)) {
      const pool = [...cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"], ...cls.pools.desecrated[side === "prefix" ? "prefixes" : "suffixes"]];
      const necro = cur(OMEN.necromancy[side]);
      const light = cur("OmenofLight") + cur("annul");
      for (const [k, floor] of [["desecrate", 0], ["desecrate_ancient", 40]] as const) {
        // 骨の名前はベースで変わる (武器・装飾品 = 鎖骨 / 顎骨、防具 = 肋骨)
        const bone = jaOfPriceKey(k, cls) ?? k;
        const W = pool.reduce((a, id) => { const m = mod(id); return m && !occ.has(m.family) ? a + sw(m, 0, floor) : a; }, 0);
        const p1 = sw(t, minTier, floor) / W;
        if (!(p1 > 0)) continue;
        for (const echoes of [false, true]) {
          const miss3 = (1 - p1) ** 3;
          const p = echoes ? 1 - miss3 * miss3 : 1 - miss3;
          const perTry = cur(k) + necro + (echoes ? cur("OmenofAbyssalEchoes") : 0);
          if (!Number.isFinite(perTry)) continue;
          out.push({ kind: "desecrate", p, perTry, avg: perTry / p + light * (1 / p - 1), missSide: side, light,
            label: `冒涜 (${bone} + ${jaOfOmen(OMEN.necromancy[side]) ?? ""}${echoes ? ` + ${jaOfOmen("OmenofAbyssalEchoes") ?? ""}` : ""}) → 3 択から選ぶ` });
        }
      }
    }
    return out.sort((a, b) => a.avg - b.avg);
  }

  /** ブリーチの MOD を付ける手 (プレの外れを食わせる / 無ければ外れを付けてから)。付いていれば空 */
  function breachMethods(s: ItemState): StepMethod[] {
    if (s.breach) return [];
    const price = cur("essence:breach") + cur(OMEN.crystallisation.prefix);
    if (!Number.isFinite(price)) return [];
    const junk = s.slots.filter((x) => x.side === "prefix" && !x.fixed && !x.modId).length;
    const removable = s.slots.filter((x) => x.side === "prefix" && !x.fixed).length;
    const label = "ブリーチのエッセンス + 左側の結晶化のお告げ";
    if (removable) {
      return [{ kind: "essence", p: 1, perTry: price, avg: price, missSide: null, label,
        note: junk === removable ? "プレの外れと入れ替わる" : `プレの外せる ${removable} つから 1 つと入れ替わる (狙いが消えることもある)` }];
    }
    const pre = cur("exalt") + cur(OMEN.exalt.prefix);
    if (!room(s, "prefix") || !Number.isFinite(pre)) return [];
    return [{ kind: "essence", p: 1, perTry: price + pre, avg: price + pre, missSide: null,
      label: `高貴なオーブ + 左側の高貴なお告げ (外れを 1 つ) → ${label}`, note: "付けた外れと入れ替わる" }];
  }

  /** 外れを消す手。外れが消える確率の高い順 (同じなら安い順) */
  function cleanups(s: ItemState): Cleanup[] {
    const idx = s.slots.map((x, i) => (x.fixed ? -1 : i)).filter((i) => i >= 0);
    const out: Cleanup[] = [];
    const mk = (label: string, perTry: number, rem: number[]): void => {
      if (!rem.length || !Number.isFinite(perTry)) return;
      const removes = rem.map((slot) => ({ slot, p: 1 / rem.length }));
      const pJunk = removes.filter((r) => r.slot >= 0 && !s.slots[r.slot]!.modId).reduce((a, r) => a + r.p, 0);
      if (pJunk > 0) out.push({ label, perTry, removes, pJunk });
    };
    const withB = (side: Side | null): number[] =>
      [...idx.filter((i) => !side || s.slots[i]!.side === side), ...(s.breach && side !== "suffix" ? [-1] : [])];
    mk("消去のオーブ", cur("annul"), withB(null));
    for (const side of ["prefix", "suffix"] as Side[]) {
      mk(`消去のオーブ + ${SIDE_JA[side]}側の消去のお告げ`, cur("annul") + cur(OMEN.annul[side]), withB(side));
    }
    return out.sort((a, b) => b.pJunk - a.pJunk || a.perTry - b.perTry);
  }

  /** 次に狙える MOD (付いている系統を除き、枠が空いている側。エッセンス・冒涜の MOD も) */
  function candidates(s: ItemState): Mod[] {
    const occ = families(s);
    const ids = [
      ...cls.pools.normal.prefixes, ...cls.pools.normal.suffixes,
      ...cls.pools.desecrated.prefixes, ...cls.pools.desecrated.suffixes,
      ...cls.pools.essence.prefixes, ...cls.pools.essence.suffixes,
    ];
    return [...new Set(ids)].map((id) => mod(id)).filter((m): m is Mod => !!m && !occ.has(m.family)
      && (m.source === "normal" || m.source === "desecrated" || m.source === "perfect_essence"));
  }

  return { methodsFor, breachMethods, cleanups, candidates, room, count };
}
