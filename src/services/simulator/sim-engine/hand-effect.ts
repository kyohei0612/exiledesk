/**
 * hand-effect.ts — カタリストを品質が最大になるまで打つ (シミュの要望、sim-own-logic.md の B5)。核の applyCurrency は 1 回 = 1 個 (品質の上がり方は乱数) で、
 * 「最大まで何個」を数える手は核に無いので engine-sim/ に置く (2026-10-23 オーナー: 元からある物の言い換えは外し、新しい物だけ残す)
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { applyCurrency } from "../../craft-stage/apply-currency";
import { allMods, catalystRoom, withValues } from "../../craft-stage/stage-core";
import { mulberry32 } from "../../htc/rng";
import { parseKey } from "../../craft-stage/key";
import type { StageApply, StageItem } from "../../craft-stage/types";
import { tr } from "../../../i18n/lang";

/** カタリストの種類 (タグ)。catalyst_<タグ>・jcatalyst_<タグ> (エンジンの鍵の読み parseKey。カタリストでない鍵は "") */
export const catalystTagOf = (key: string): string => { const k = parseKey(key); return k.type === "catalyst" ? k.tag : ""; };
/** そのカタリストの種類で品質が最大か (エンジンの catalystRoom。指輪・アミュレットなどは別の欄のカタリストの品質) */
export const catalystFull = (item: StageItem, key: string): boolean => catalystRoom(item, catalystTagOf(key)).full;
/** カタリストを打つ上限 (見張り。品質の上限より十分大きい) */
const CAT_MAX = 200;
/**
 * カタリストを品質が最大になるまで打つ (1 回 = 1 個、oneCatalyst)。別の種類が入っていれば 0 から (エンジンどおり)。count = 打った個数 (費用はこの分)。
 * 1 個も打てなければ count 0 と、その理由 (もう最大なら「品質はもう最大」)
 */
/** to = 「何 % まで」(S-31b、無ければ最大まで) */
export function fillCatalyst(data: PatchData, item: StageItem, key: string, rng: () => number, to?: number): StageApply & { count: number } {
  let it = item, count = 0, last: StageApply = { applied: false, item, added: [], removed: [] };
  const tag = catalystTagOf(key);
  const reached = (x: StageItem): boolean => !!to && catalystRoom(x, tag).now >= to;
  for (let i = 0; i < CAT_MAX && !catalystFull(it, key) && !reached(it); i++) {
    last = applyCurrency(data, it, key, rng, [], { oneCatalyst: true });
    if (!last.applied) break;
    it = last.item;
    count++;
  }
  return count ? { ...last, applied: true, item: it, count } : { ...last, count: 0, ...(last.applied || last.reason ? {} : { reason: tr("品質はもう最大", "Quality is already at max") }) };
}

/** MOD の並び (MOD・側・✦・未発現・冒涜とレアリティ。値は見ない) */
const modsSig = (it: StageItem): string => `${it.rarity}|${[...it.prefixes, ...it.suffixes].map((m) => `${m.modId}.${m.fractured ? 1 : 0}${m.unrevealed ? 1 : 0}${m.desecrated ? 1 : 0}`).join(",")}`;
const KEEPS = new Map<string, boolean>();
/**
 * MOD が付かない・消えない・入れ替わらない手か (神のオーブ・ヒネコラなど)。applyCurrency で何度か打って MOD の並びが変わらないかで決める
 * (11-05 オーナー「MODがつかない消えない変わらない奴に狙いMOD等の選択肢が入ることが間違い」)。覚えは手と品の MOD の並びごと
 * (前の木の keepsMods は手ごとに最初の品で 1 回だけ決めて覚え、品が変わっても聞き直さなかった)。打てない品では決めない (false、覚えない)
 */
export function keepsMods(data: PatchData, item: StageItem, currency: string, omens: readonly string[] = []): boolean {
  const before = modsSig(item);
  const k = `${currency}|${[...omens].sort().join("+")}|${item.base}|${before}`, hit = KEEPS.get(k);
  if (hit !== undefined) return hit;
  let applied = 0, same = true;
  for (let i = 0; i < 6 && same; i++) {
    const r = applyCurrency(data, item, currency, mulberry32(0x1e5 + i * 7919), omens);
    if (!r.applied) continue;
    applied++;
    same = modsSig(r.item) === before;
  }
  if (!applied) return false;
  if (KEEPS.size > 2000) KEEPS.clear();
  KEEPS.set(k, same);
  return same;
}

/** 神のオーブの目標 (その MOD の vi 番目の値が value 以上) */
export interface DivineGoal { modId: string; vi: number; value: number }
/**
 * 神 1 回で目標に全部届く割合。打つ処理と同じ転がし (withValues) を乱数の目盛り 0〜1 の N 刻みで数える。値は 1 つずつ別に転がるので掛け算
 * (前は木の tree-divine.ts が持っていた、11-07 オーナー「ゲームシステムはジンだけ」)。目標の MOD が無い (固定は振り直さない) なら 0
 */
export function divineChance(data: PatchData, item: StageItem, goals: readonly DivineGoal[], N = 400): number {
  let p = 1;
  for (const t of goals) {
    const m = allMods(item).find((x) => x.modId === t.modId && !x.fractured), mod = data.mods.get(t.modId);
    if (!m || !mod) return 0;
    let ok = 0;
    for (let k = 0; k < N; k++) if ((withValues(m, mod, () => (k + 0.5) / N).values[t.vi] ?? -Infinity) >= t.value) ok++;
    p *= ok / N;
  }
  return p;
}
