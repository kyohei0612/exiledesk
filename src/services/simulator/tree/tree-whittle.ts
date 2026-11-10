/**
 * tree-whittle.ts — 削減のお告げを含む手の枝を外れ MOD の MOD レベルで分ける (S-65b)。
 * 見本のアイテムの外れ MOD は 1 つの MOD レベルしか持たないので、そのまま打つと外れの MOD レベルの違いで枝が分かれない (前の作り)。
 * ランダムに付いた外れ MOD を、データ (その部位・アイテムレベル・側で付きうる MOD と重み) の MOD レベルの範囲ごとの代わりに差し替えて打ち直す (①):
 * 範囲 = 消せる欲しい MOD (フラクチャー以外の狙い) の MOD レベルのどれより低い / 同じ / 間 / どれより高い。割合はその範囲の重みの和 ÷ 付きうる外れ全部の重み。
 * 消える的は MOD レベルだけで決まる (エンジンの whittleTargets、✦ 以外は何でも。11-07 オーナー「削減はMODレベルだったらなんでも対象よ」)。
 * 差し替えるのは MOD レベルが乱数の外れ (一般・ルーンの池・狙い無しで発現した冒涜)。エッセンス (段が決まる) と未発現 (MOD レベル 1、E-33) は見本のまま (③)。
 * 前は冒涜とルーンの池の外れも差し替えず、見本の 1 つの MOD レベルの枝しか出なかった。一番上で並ぶ物の無い MOD は消えないので、その枝はエンジンの枝に出ない (②)。
 * 結果の箱は、打つ前からあって残った外れの順位 (欲しい MOD に対して) を鍵に持つ (④、TreeBox.junkKey の `w:` の部分、側の鍵 `s:` とは `;` で並べる)。
 * 次の削減は鍵の順位に合う外れを差し替えない (見本の MOD レベルがその順位の代わり)
 */
import { candidates, makeStageMod, OMEN_KEY, omenSideOf, sideOfMod, whittleLevel, type PatchData, type StageItem, type StageMod, type StageSide } from "../../craft-stage/engine";
import { effectiveCls, without } from "../../craft-stage/stage-core";
import { engineOmens } from "./tree-hands";
import { isMissMod, missAims, type MissAims } from "./tree-miss";
import type { Aim } from "./tree-model";
import { originOf } from "./tree-rolls";

export const WHITTLE = OMEN_KEY.whittling;
/** 削減のお告げを含む手か ( が閉じていれば false = 今のまま見本の MOD レベルで決まる) */
export const isWhittleHand = (h: { omens: readonly string[] } | null | undefined): boolean => !!h && engineOmens(h).includes(WHITTLE);
/** お告げで消える側が決まる時のその側 (左側の抹消 = プレフィックス・右側 = サフィックス)。決まらなければ null (エンジンの whittleTargets と同じ見方) */
export const whittleSide = (omens: readonly string[]): StageSide | null => omens.map((o) => omenSideOf(o).remove).find((s): s is StageSide => !!s) ?? null;
/** 削減の手の消える側 (削減でない手・側の決まらない手は null) */
export const handWhittleSide = (h: { omens: readonly string[] } | null | undefined): StageSide | null => (isWhittleHand(h) ? whittleSide(engineOmens(h!)) : null);
/**
 * 削減の比べで使う ☑ の印: 削減の手で残したい MOD を決めていれば (S-27b 11-10、枠に分かれる時の窓)、消える側の印のうち残したい MOD に無い物を外す
 * = ☑ を外した MOD は外れとして比べる (11-10 オーナー「狙いＭＯＤを名前ありＭＯＤなら残しＭＯＤとして選べるようにしてあげたら？」)。決めていない手はそのまま
 */
export function whittleAimed<T extends ReadonlySet<string> | null | undefined>(data: PatchData, h: { omens: readonly string[]; keep?: readonly { modId: string }[] } | null | undefined, aimed: T, item?: StageItem | null): T | Set<string> {
  if (!aimed || !h?.keep || !isWhittleHand(h)) return aimed;
  const side = handWhittleSide(h), keep = new Set(h.keep.map((a) => a.modId));
  // この手で消えない狙い (S-27e) も残したい MOD: 削減は MOD レベルが一番低い MOD を消すので、ほかの名前ありの狙いより MOD レベルが高い狙いは消えない。
  // 窓は自動で ☑ と見せるのに保存の手 (Hand.keep) に入っていない木 (11-10 の前に置いた手) でも、品から同じ答えにする (要望 0b039a19、11-10 オーナー
  // 「別にハズレMODとして扱おうがさ名前ありMODなんだから一緒でしょうに」。前は外れに数え、外れが差し替えの上限を超えて枠が割れなかった)
  if (item) {
    const named = loose(item, side).filter((m) => aimed.has(m.modId));
    const low = named.length ? Math.min(...named.map(lv)) : Infinity;
    for (const m of named) if (lv(m) > low) keep.add(m.modId);
  }
  return new Set([...aimed].filter((id) => keep.has(id) || (!!side && sideOfMod(data, id) !== side)));
}

/** 削減の MOD レベル (未発現は 1) はエンジンの whittleLevel (whittleTargets と同じ物) */
const lv = whittleLevel;
/** 削減で消えうる MOD (✦ 以外)。side = お告げで消える側が決まる時はその側だけ (11-10、左側の抹消でサフィの残したい MOD と比べて枠が割れなかった) */
const loose = (it: StageItem, side?: StageSide | null): StageMod[] => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured && (!side || m.side === side));
/** 差し替えの途中の品で同じ MOD を探す (当たりの判定ではない) */
const sameMod = (a: StageMod, b: StageMod): boolean => a.modId === b.modId && a.tierIndex === b.tierIndex && a.side === b.side;
type AimLike = Pick<Aim, "modId" | "tier">;
/**
 * 差し替え (rankVariants) で見る欲しい MOD = 見本の ☑ の印 (打つ前の aimed、tree-judge の sampleAimed) の付いた狙いだけ (S-65b)。
 * 印の無い完成形の MOD は外れ MOD (S-22・S-60) なので、付いていれば差し替え、付いていなければ付きうる外れの重みに入れる。回す人の順位 (boxOutcomeOf の mineOf) と同じ見方。印が無ければ今のまま
 */
export const aimedAims = <T extends AimLike>(aims: readonly T[], aimed: ReadonlySet<string> | null | undefined): readonly T[] => (aimed ? aims.filter((a) => aimed.has(a.modId)) : aims);
/** 欲しい MOD の MOD レベル (低い順)。欲しい MOD か = 外れの式 (tree-miss の isMissMod、当たり方はエンジンの aimHits の sameText) */
const wantedLevels = (it: StageItem, miss: MissAims, side?: StageSide | null): number[] => loose(it, side).filter((m) => !isMissMod(m, miss)).map(lv).sort((a, b) => a - b);
/** 順位 = 欲しい MOD のうち MOD レベルがそれより低い物の数。同じ MOD レベルの物があれば「=」(E-33 どおりどちらも等しく消える) */
export function rankCode(wanted: readonly number[], x: number): string {
  const below = wanted.filter((w) => w < x).length;
  return wanted.includes(x) ? `${below}=` : `${below}`;
}
/** 鍵の外れの順位の部分 (無ければ空) */
const codesOf = (key: string | undefined): string[] => key?.split(";").find((s) => s.startsWith("w:"))?.slice(2).split(",").filter(Boolean) ?? [];

/** 側の鍵と順位の鍵を 1 つに (どちらも無ければ undefined) */
export const joinKeys = (side: string | undefined, rank: string | undefined): string | undefined => [side, rank].filter(Boolean).join(";") || undefined;

/** 順位の鍵があるか */
export const hasRank = (key: string | undefined): boolean => codesOf(key).length > 0;
/** 箱の題の付け足し (順位の鍵から、残った欲しい MOD と並べた MOD レベルの低い方からの位置)。例「外れは一番下」「外れは下から 2 番目」「外れは 1 番目と同じ」 */
export function rankLabel(key: string): [string, string] | null {
  const cs = codesOf(key);
  if (!cs.length) return null;
  const one = (c: string): [string, string] => {
    const n = Number.parseInt(c, 10);
    if (c.endsWith("=")) return [`${n + 1} 番目と同じ`, `ties #${n + 1}`];
    return n === 0 ? ["一番下", "lowest"] : [`下から ${n + 1} 番目`, `#${n + 1} from bottom`];
  };
  const l = cs.map(one);
  return [`外れは${l.map((x) => x[0]).join("・")}`, `miss ${l.map((x) => x[1]).join(", ")}`];
}

/** 差し替えて見る外れの数の上限 (掛け算で増えるので。超えたら見本のまま) */
const FREE_MAX = 2;
/**
 * 削減の手で見る見本の差し替え (割合 p 付き、p の和 1)。boxKey = 手の箱の junkKey (前の削減で順位の決まった外れは差し替えない)。
 * 欲しい MOD が無い・差し替える外れが無ければ見本 1 つ (p 1)
 */
export function rankVariants(data: PatchData, item: StageItem, aims: readonly AimLike[], boxKey?: string, lvMiss?: MissAims, side?: StageSide | null): Array<{ p: number; item: StageItem }> {
  const all = rankVariantsAll(data, item, aims, boxKey, side), want = lvPart(boxKey);
  if (!want || all.length < 2) return all;
  // 削減の手前の枠 (S-65c) の箱は、その枠の組の出方だけ (枠に着く人は外れの MOD レベルがその組)。組の合う出方が無ければ今のまま。
  // 組の比べの相手は lvMiss (外れの式 aimedMiss = 回す時・判定と同じ)、無ければ aims
  const miss = lvMiss ?? missAims(data, aims), fit = all.filter((v) => lvClassOf(v.item, miss, side) === want), t = fit.reduce((n, v) => n + v.p, 0);
  return fit.length && t > 0 ? fit.map((v) => ({ p: v.p / t, item: v.item })) : all;
}
/** side = お告げで消える側 (handWhittleSide)。その側の残したい MOD とだけ比べ、その側の外れだけ差し替える (ほかの側は削減で消えない) */
function rankVariantsAll(data: PatchData, item: StageItem, aims: readonly AimLike[], boxKey?: string, side?: StageSide | null): Array<{ p: number; item: StageItem }> {
  const miss = missAims(data, aims);
  const w = wantedLevels(item, miss, side);
  if (!w.length) return [{ p: 1, item }];
  // 前の削減で順位の決まった箱 (④): 見本の一番低い外れの順位が鍵と同じなら、見本の MOD レベルがその順位の代わり (差し替えない)
  const junk = loose(item, side).filter((m) => isMissMod(m, miss));
  const code = codesOf(boxKey)[0];
  if (code !== undefined && junk.length && rankCode(w, Math.min(...junk.map(lv))) === code) return [{ p: 1, item }];
  const free = junk.filter((m) => !m.crafted && !m.unrevealed);
  if (!free.length || free.length > FREE_MAX) return [{ p: 1, item }];
  let states: Array<{ p: number; item: StageItem; fl: Map<string, number> }> = [{ p: 1, item, fl: new Map(floorsOf(item) ?? []) }];
  for (const j of free) {
    const next: typeof states = [];
    // 前の削減を越えて残った外れは、その時に消えた MOD の MOD レベル以上の段だけ (③)
    const floor = floorsOf(item)?.get(fKey(j)) ?? 0;
    for (const s of states) {
      const cur = s.item.prefixes.concat(s.item.suffixes).find((m) => sameMod(m, j));
      if (!cur) { next.push(s); continue; }
      const base = without(s.item, cur);
      // 順位ごとに重みの和と、代わりの MOD (一番重い段)
      const by = new Map<string, { w: number; top: number; mod: StageMod }>();
      let total = 0;
      // 冒涜の外れは発現で出うる池 (冒涜専用 + 一般、E-62 = run-plan の発現と同じ) から、冒涜の印のまま
      const k = j.side === "prefix" ? "prefixes" : "suffixes";
      const pool = j.desecrated ? { pools: () => [...(base.cls.pools.desecrated?.[k] ?? []), ...effectiveCls(base).pools.normal[k]] } : {};
      for (const c of candidates(data, base, [j.side], 0, pool)) {
        for (const t of c.tiers) {
          if (!(t.w > 0)) continue;
          const sm0 = makeStageMod(c.mod, c.side, t.index, () => 0.5);
          const sm = j.desecrated ? { ...sm0, desecrated: true } : sm0;
          // 代わりは外れだけ (狙いに当たる段は入れない)
          if (!isMissMod(sm, miss) || lv(sm) < floor) continue;
          const code = rankCode(w, lv(sm));
          const e = by.get(code);
          total += t.w;
          if (!e) by.set(code, { w: t.w, top: t.w, mod: sm });
          else { e.w += t.w; if (t.w > e.top) { e.top = t.w; e.mod = sm; } }
        }
      }
      if (!(total > 0)) { next.push(s); continue; }
      for (const e of by.values()) {
        // 差し替えた外れは元の外れの下限を引き継ぐ
        const fl = new Map(s.fl);
        fl.delete(fKey(cur));
        if (floor) fl.set(fKey(e.mod), floor);
        next.push({ p: (s.p * e.w) / total, item: withSame(base, e.mod, cur), fl });
      }
    }
    states = next;
  }
  return states.map((s) => { if (s.item !== item && s.fl.size) FLOORS.set(s.item, s.fl); return { p: s.p, item: s.item }; });
}

/**
 * 削減で残った外れの MOD レベルの下限 (案の ③、11-07 オーナー「ハズレMOD次第で削減の標的が変わるから、そこ深掘りした方がええな」)。
 * 残った外れは消えた MOD より MOD レベルが低くなかった (同じなら E-33 で等しく消える) ので、下限 = 消えた MOD の MOD レベル。
 * 品ごとに MOD の鍵 → 下限を持ち (エンジンの StageMod は触らない)、次の削減の差し替え (rankVariants) で候補をその下限以上に絞る。
 * 下限はほかの手を打った後も残った MOD に持ち回る (carryFloors。配置の代表 = tree-frame、見本 = tree-sample)
 */
const FLOORS = new WeakMap<object, ReadonlyMap<string, number>>();
const fKey = (m: StageMod): string => `${m.side}|${m.modId}|${m.tierIndex}`;
const floorsOf = (it: StageItem): ReadonlyMap<string, number> | undefined => FLOORS.get(it) ?? FLOORS.get(originOf(it));
/** 持ち回っている下限の比べの文字 (品の JSON の外にあるので、品の答えを覚える鍵に足す。tree-frame の outsOf の覚え) */
export const floorKeyOf = (it: StageItem): string => { const f = floorsOf(it); return f?.size ? JSON.stringify([...f].sort()) : ""; };
/** before に手を打った after へ下限を持ち回る。wanted = 削減の手の欲しい MOD (削減でなければ null): 消えた MOD の MOD レベルを、残った外れの下限に足す */
export function carryFloors(data: PatchData, before: StageItem, after: StageItem, wanted: readonly AimLike[] | null): void {
  const was = floorsOf(before), bm = loose(before), am = loose(after), next = new Map<string, number>();
  const kept = am.filter((m) => bm.some((b) => fKey(b) === fKey(m)));
  for (const m of kept) { const f = was?.get(fKey(m)); if (f !== undefined) next.set(fKey(m), f); }
  const gone = wanted ? bm.filter((b) => !am.some((m) => fKey(m) === fKey(b))) : [];
  // 外れかは rankVariants と同じ isMissMod (sameText・段も見る)
  if (gone.length) { const low = Math.min(...gone.map(lv)), miss = missAims(data, wanted!); for (const m of kept) if (isMissMod(m, miss)) next.set(fKey(m), Math.max(next.get(fKey(m)) ?? 0, low)); }
  if (next.size) FLOORS.set(after, next);
}
/** 外れを差し替えたアイテム (元の外れと同じ並びの位置へ) */
function withSame(base: StageItem, m: StageMod, was: StageMod): StageItem {
  const key = was.side === "prefix" ? "prefixes" : "suffixes";
  return { ...base, [key]: [...base[key], m] };
}

/**
 * 削減の手前の枠 (S-65c、11-10 オーナー「削減打つ前の枠を1つ増やす必要あると思う」「探してから判断してね乱数で決まるんやからな」):
 * ランダムに付いた外れ MOD のある箱に削減の手を置くと、1 つ前の手の結果を外れの MOD レベルで「低い・同じ・高い」の枠に分ける (鍵 `l:lo` / `l:eq` / `l:hi`、側の鍵とは `;` で並べる)。
 * 比べる相手 = 残したい MOD (外れ以外の消せる MOD) のうち一番低い物 = 削減で次に消える MOD。外れが 2 つ以上なら外れのうち一番低い物で比べる。
 * 枠はデータ (その部位・アイテムレベル・側で付きうる外れと重み = rankVariants の差し替え) で付きうる組だけ。MOD レベルが決まっている外れ (エッセンス・未発現) だけなら分けない
 */
export type LvClass = "lo" | "eq" | "hi";
export const LV_ORDER: readonly LvClass[] = ["lo", "eq", "hi"];
/** 鍵の枠の組 (無ければ null) */
export const lvPart = (k: string | undefined): LvClass | null => { const s = k?.split(";").find((x) => x.startsWith("l:"))?.slice(2); return s === "lo" || s === "eq" || s === "hi" ? s : null; };
/** 枠の組を外した鍵 */
export const stripLv = (k: string | undefined): string | undefined => k?.split(";").filter((x) => !x.startsWith("l:")).join(";") || undefined;
/** 枠の組を付けた鍵 */
export const withLv = (k: string | undefined, c: LvClass): string => joinKeys(stripLv(k), `l:${c}`)!;
/** 品の組: 外れのうち一番低い MOD レベルと、残したい MOD の一番低い MOD レベルの比べ (外れか残したい MOD が無ければ null) */
export function lvClassOf(item: StageItem, miss: MissAims, side?: StageSide | null): LvClass | null {
  const l = loose(item, side), j = l.filter((m) => isMissMod(m, miss)).map(lv), w = l.filter((m) => !isMissMod(m, miss)).map(lv);
  if (!j.length || !w.length) return null;
  const a = Math.min(...j), b = Math.min(...w);
  return a < b ? "lo" : a === b ? "eq" : "hi";
}
/** MOD レベルが乱数の外れがあるか (エッセンス・未発現だけなら MOD レベルは決まっている) */
const hasFreeJunk = (item: StageItem, miss: MissAims, side?: StageSide | null): boolean => loose(item, side).some((m) => isMissMod(m, miss) && !m.crafted && !m.unrevealed);
/** データで付きうる組 (wanted = 残したい MOD の札、side = お告げで消える側)。乱数の外れが無い・残したい MOD が無ければ null (枠を分けない) */
export function lvClassesOf(data: PatchData, item: StageItem, wanted: readonly AimLike[], side?: StageSide | null): Set<LvClass> | null {
  const miss = missAims(data, wanted);
  if (!hasFreeJunk(item, miss, side) || !wantedLevels(item, miss, side).length) return null;
  const out = new Set<LvClass>();
  for (const v of rankVariantsAll(data, item, wanted, undefined, side)) { const c = lvClassOf(v.item, miss, side); if (c) out.add(c); }
  return out.size ? out : null;
}
/** 枠の題の付け足し */
export const lvLabel = (c: LvClass): [string, string] =>
  c === "lo" ? ["外れの MOD レベルが低い", "miss mod level lower"] : c === "eq" ? ["外れの MOD レベルが同じ", "miss mod level same"] : ["外れの MOD レベルが高い", "miss mod level higher"];
/** 枠の説明 (スマホの行の 2 行目・カードの説明) */
export const lvNote = (c: LvClass): [string, string] =>
  c === "lo" ? ["削減で外れが消える (外れの MOD レベルが残したい MOD より低い)", "Whittling removes the miss (its mod level is lower than the mods to keep)"]
  : c === "eq" ? ["削減で外れか残したい MOD が半々で消える (同じ MOD レベル)", "Whittling removes the miss or a mod to keep, half and half (same mod level)"]
  : ["削減で残したい MOD が消える (外れの MOD レベルが残したい MOD より高い)", "Whittling removes a mod to keep (the miss's mod level is higher)"];
