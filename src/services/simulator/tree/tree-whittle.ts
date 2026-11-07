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
import { candidates, makeStageMod, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { effectiveCls, without } from "../../craft-stage/stage-core";
import { engineOmens } from "./tree-hands";

export const WHITTLE = "OmenofWhittling";
/** 削減のお告げを含む手か ( が閉じていれば false = 今のまま見本の MOD レベルで決まる) */
export const isWhittleHand = (h: { omens: readonly string[] } | null | undefined): boolean => !!h && engineOmens(h).includes(WHITTLE);

/** MOD レベル (未発現は 1、apply-currency の whittleTargets と同じ) */
const lv = (m: StageMod): number => (m.unrevealed ? 1 : m.modLevel);
const loose = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes].filter((m) => !m.fractured);
const sameMod = (a: StageMod, b: StageMod): boolean => a.modId === b.modId && a.tierIndex === b.tierIndex && a.side === b.side;
type AimLike = { modId: string };
const isAim = (aims: readonly AimLike[], m: StageMod): boolean => aims.some((a) => a.modId === m.modId);
/**
 * 差し替え (rankVariants) で見る欲しい MOD = 見本の ☑ の印 (打つ前の aimed、tree-judge の sampleAimed) の付いた狙いだけ (S-65b)。
 * 印の無い完成形の MOD は外れ MOD (S-22・S-60) なので、付いていれば差し替え、付いていなければ付きうる外れの重みに入れる。回す人の順位 (boxOutcomeOf の mineOf) と同じ見方。印が無ければ今のまま
 */
export const aimedAims = <T extends AimLike>(aims: readonly T[], aimed: ReadonlySet<string> | null | undefined): readonly T[] => (aimed ? aims.filter((a) => aimed.has(a.modId)) : aims);
/** 欲しい MOD の MOD レベル (低い順) */
const wantedLevels = (it: StageItem, aims: readonly AimLike[]): number[] => loose(it).filter((m) => isAim(aims, m)).map(lv).sort((a, b) => a - b);
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
export function rankVariants(data: PatchData, item: StageItem, aims: readonly AimLike[], boxKey?: string): Array<{ p: number; item: StageItem }> {
  const w = wantedLevels(item, aims);
  if (!w.length) return [{ p: 1, item }];
  // 前の削減で順位の決まった箱 (④): 見本の一番低い外れの順位が鍵と同じなら、見本の MOD レベルがその順位の代わり (差し替えない)
  const junk = loose(item).filter((m) => !isAim(aims, m));
  const code = codesOf(boxKey)[0];
  if (code !== undefined && junk.length && rankCode(w, Math.min(...junk.map(lv))) === code) return [{ p: 1, item }];
  const free = junk.filter((m) => !m.crafted && !m.unrevealed);
  if (!free.length || free.length > FREE_MAX) return [{ p: 1, item }];
  let states: Array<{ p: number; item: StageItem }> = [{ p: 1, item }];
  for (const j of free) {
    const next: Array<{ p: number; item: StageItem }> = [];
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
        if (aims.some((a) => a.modId === c.mod.id)) continue;
        for (const t of c.tiers) {
          if (!(t.w > 0)) continue;
          const sm0 = makeStageMod(c.mod, c.side, t.index, () => 0.5);
          const sm = j.desecrated ? { ...sm0, desecrated: true } : sm0;
          const code = rankCode(w, lv(sm));
          const e = by.get(code);
          total += t.w;
          if (!e) by.set(code, { w: t.w, top: t.w, mod: sm });
          else { e.w += t.w; if (t.w > e.top) { e.top = t.w; e.mod = sm; } }
        }
      }
      if (!(total > 0)) { next.push(s); continue; }
      for (const e of by.values()) next.push({ p: (s.p * e.w) / total, item: withSame(base, e.mod, cur) });
    }
    states = next;
  }
  return states;
}
/** 外れを差し替えたアイテム (元の外れと同じ並びの位置へ) */
function withSame(base: StageItem, m: StageMod, was: StageMod): StageItem {
  const key = was.side === "prefix" ? "prefixes" : "suffixes";
  return { ...base, [key]: [...base[key], m] };
}
