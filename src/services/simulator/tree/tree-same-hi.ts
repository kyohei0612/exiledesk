/**
 * tree-same-hi.ts — エッセンスの箱の下の「エッセンスと同じ MOD (同格以上)」の箱 (S-33e ⑦) の代表の品 (スイッチ sameHiSample)。
 * その箱の人は上の手で同じ系統の普通の MOD を同格以上で付けてエッセンスを打たない人。エッセンスの箱の代表にエッセンスを当てても枝が来ないので、
 * 前は作れない見本 = エッセンスの箱の代表のまま (雷耐性の無い品) が出た (11-16 オーナー「バグってるわエッセンス 名前ありMODで表示のはずこれ同格以上の値のティアで」)。
 * 上の手で付く同じ系統の普通の MOD (エンジンの数え上げの枝から) を、エッセンスの値の下限以上で一番低い段にして、エッセンスの箱の代表の同じ側の MOD 1 つと差し替える。
 * 見本の見た目だけ (回す人・判定・枠の分けは変えない)
 */
import { familiesOf, isCraftedSource, makeStageMod, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { essenceTarget, essenceTierIndex, isInfiniteEssence } from "../../craft-stage/apply-essence";
import { essenceHold } from "./tree-outcome";

/** エッセンス key で付く MOD の系統と値の下限 (無限のエッセンスは無し) */
function essenceLows(data: PatchData, item: StageItem, key: string): { fams: readonly string[]; lows: number[] } | null {
  const t = isInfiniteEssence(key) ? null : essenceTarget(data, item, key);
  const lows = t?.mod.tiers[essenceTierIndex(t.level, t.mod)]?.ranges.map((r) => r[0] ?? 0);
  return t && lows ? { fams: familiesOf(t.mod), lows } : null;
}

/** 品 held に付いた、エッセンス key と同じ系統の普通の MOD (held が同格以上 = エッセンスを打たない時だけ) */
export function sameHiHeld(data: PatchData, held: StageItem, key: string): StageMod | null {
  if (essenceHold(data, held, key) !== "skip") return null;
  const e = essenceLows(data, held, key);
  if (!e) return null;
  return [...held.prefixes, ...held.suffixes].find((m) => { const md = data.mods.get(m.modId); return !!md && !m.crafted && !isCraftedSource(md.source) && familiesOf(md).some((f) => e.fams.includes(f)); }) ?? null;
}

/**
 * 代表 item の m と同じ側の MOD を 1 つ、m の MOD の「エッセンスの値の下限以上で一番低い段」(アイテムレベルで付く段) に差し替えた品。
 * 差し替えるのは同じ系統の MOD、無ければ ☑ で付いた狙い (keep) とフラクチャーでない一番後ろの MOD、側に空きがあれば足す。差し替えても同格以上にならなければ null
 */
export function sameHiSwap(data: PatchData, item: StageItem, key: string, m: StageMod, keep: ReadonlySet<string>): StageItem | null {
  const md = data.mods.get(m.modId), e = essenceLows(data, item, key);
  if (!md || !e) return null;
  let best = -1;
  md.tiers.forEach((tr, i) => { if (tr.ilvl <= item.itemLevel && e.lows.every((lo, k) => (tr.ranges[k]?.[0] ?? lo) >= lo) && (best < 0 || tr.ilvl < md.tiers[best]!.ilvl)) best = i; });
  if (best < 0) return null;
  const nm = makeStageMod(md, m.side, best, () => 0), pre = m.side === "prefix", list = [...(pre ? item.prefixes : item.suffixes)];
  let at = list.findIndex((x) => x.family === md.family);
  for (let i = list.length - 1; at < 0 && i >= 0; i--) { const x = list[i]!; if (!keep.has(x.modId) && !x.fractured && !x.unrevealed) at = i; }
  if (at < 0 && list.length >= (item.rarity === "magic" ? 1 : 3)) return null;
  if (at < 0) list.push(nm); else list[at] = nm;
  const out: StageItem = pre ? { ...item, prefixes: list } : { ...item, suffixes: list };
  return essenceHold(data, out, key) === "skip" ? out : null;
}
