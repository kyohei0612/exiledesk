// 数え上げ (sim-engine/outcomes.ts の stepOutcomes = シミュの木の結果の箱) と、打つ処理 (applyCurrency = エミュ) の突き合わせ (2026-11-07 ジン jin-base)。
// 洗い出し base-audit-1107 の G-0-2 の 3: この見張りが 0 件で、E-30a (11-06) と E-25 (骨) の直し漏れが 2 回起きた。
// 部位 × 状態 × 棚の全カレンシー × お告げ (無し・1 枚・一緒に効く 2 枚) を並べ、数え上げの行き先 (品の形 → 割合、不成立) と、
// 同じ手を決まった種で何回も打った結果を比べる。見るのは 3 つ:
//   ① 打った結果の形が数え上げの行き先に無い (数え上げに無い結果 = 木の結果の箱が足りない) → その場で失敗
//   ② 数え上げで打てない ([]) のに打つと付く / 打つ前に分かって弾かれる手なのに数え上げは行き先を出す → 失敗
//      (数え上げの [] は、全部の枝が当たり所で不成立の手も含む約束。打つ処理はその手を「打てるが必ず不成立」と返す)
//   ③ 行き先ごとの割合 (不成立を含む) が打った割合と合わない (400 回で 5 σ + 5 回)
// 数値 (値) は比べない (数え上げは段の下限、S-202 ②)。数え上げの外の手 (発現・神・品質・ルーン・錬金のような多すぎ) は null で数だけ数える。
// これは「エンジンの 2 つの道が同じ答えか」の見張りで、外の正解 (poe2db・E-01) ではない (G-22)
import { applyCurrency, kindOf } from "../../src/services/craft-stage/apply-currency";
import { OMEN_FOR } from "../../src/services/craft-stage/omens";
import { omenRivals } from "../../src/services/craft-stage/spec/omen-layer";
import { stepOutcomes } from "../../src/services/simulator/sim-engine/outcomes";
import { emotionKeysFor } from "../../src/services/craft-stage/apply-emotion";
import { mulberry32 } from "../../src/services/htc/rng";
import { BONES, CATALYSTS, ORBS, essenceShelf } from "../../src/state/for-share/craft-stage-shelf";
import type { StageItem } from "../../src/services/craft-stage/types";
import { BASES as ALL_BASES, data, moreStatesOf, statesOf as baseStates } from "../helpers/spec-parity";

const N = 400;
/** 行き先ごとの回数の許し: 5 σ + 5 回 (割合の小さい行き先が多いので、回数で少し余らせる。同じ種の偏りで落ちないように種は組ごとにずらす) */
const off = (count: number, p: number): boolean => Math.abs(count - N * p) > 5 * Math.sqrt(N * p * (1 - p)) + 5;
const seed = (s: number, k: number): number => (Math.imul(s, 2654435761) ^ Math.imul(k, 0x5bd1e995)) >>> 0;
const hashOf = (x: string): number => { let h = 2166136261; for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619); return h >>> 0; };

/** 部位ごとに 1 つ (spec-parity と同じ並び。フラスコは MOD の手が無いので外す) */
export const BASES = ALL_BASES.filter((n) => !/Flask$/.test(n));
/** 状態: 前後の比べと同じ物 (ノーマル〜満杯・未発現・紋章・腐食・コラプト …) と、上限を超えた側・エッセンス済み・マジック 2 つ・触媒の品質 */
const MORE = new Set(["サフィが上限超え", "エッセンス済み", "マジック 2 つ", "品質 (ライフ) 20"]);
export function statesOf(base: string): Array<[string, StageItem]> {
  return [...baseStates(base, 82), ...moreStatesOf(base, 82).filter(([l]) => MORE.has(l))];
}

/** 品の形 (値は見ない)。不成立は "void" */
const sig = (it: StageItem): string => JSON.stringify([it.rarity, !!it.corrupted, it.quality, it.catalystQuality ?? 0, ...[...it.prefixes, ...it.suffixes].map((m) => `${m.side}:${m.modId}#${m.tierIndex}${m.fractured ? "f" : ""}${m.unrevealed ? "u" : ""}${m.crafted ? "c" : ""}${m.abyssMark ? "a" : ""}`).sort()]);

/** お告げの組: 無し・1 枚・一緒に効く 2 枚 (同じ排他の組は除く = 画面で一緒に掛けられない) */
export function omenSets(key: string): string[][] {
  const os = [...(OMEN_FOR[kindOf(key)] ?? [])];
  const out: string[][] = [[], ...os.map((o) => [o])];
  for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) if (!omenRivals(os[i]!).includes(os[j]!)) out.push([os[i]!, os[j]!]);
  return out;
}
/** 棚の全カレンシー (オーブ・骨・エッセンス・触媒・感情・発現) */
const keysOf = (item: StageItem): string[] => [...ORBS.flatMap((g) => g.keys), ...BONES, ...CATALYSTS, ...emotionKeysFor(item), "reveal:1", ...essenceShelf(data, item).flatMap((g) => g.keys)];

export interface Tally { compared: number; outside: number; blocked: number }
function check(item: StageItem, key: string, omens: string[], bad: string[], t: Tally): void {
  const label = `${key} [${omens.join("+") || "-"}]`;
  const so = stepOutcomes(data, item, key, omens);
  if (so === null) { t.outside++; return; }
  if (!so.length) {
    // 数え上げの [] は「打てない」と「全部の枝が当たり所で不成立」(上限を超えた側しか消せないカオスなど) の両方 (outcomes.ts の約束)。どちらも何回打っても付かない
    t.blocked++;
    for (let s = 1; s <= 24; s++) {
      const r = applyCurrency(data, item, key, mulberry32(seed(s, 9)), omens);
      if (r.applied) { bad.push(`${label}: 数え上げは打てない ([]) のに打つと付いた (${s} 回目)`); return; }
    }
    return;
  }
  t.compared++;
  const want = new Map<string, number>();
  for (const x of so) { const k = x.void ? "void" : sig(x.item); want.set(k, (want.get(k) ?? 0) + x.p); }
  const sum = [...want.values()].reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-6) bad.push(`${label}: 数え上げの割合の和が ${sum.toFixed(6)}`);
  const seen = new Map<string, number>();
  const k0 = hashOf(`${sig(item)}|${label}`);
  for (let s = 1; s <= N; s++) {
    const r = applyCurrency(data, item, key, mulberry32(seed(s, k0)), omens);
    if (!r.applied && !r.random) { bad.push(`${label}: 数え上げは行き先を出すのに打つ処理は打てない (${r.reason})`); return; }
    const k = r.applied ? sig(r.item) : "void";
    if (!want.has(k)) { bad.push(`${label}: 数え上げに無い結果 ${k === "void" ? "(当たり所で不成立)" : k} (${s} 回目)`); return; }
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  for (const [k, p] of want) {
    const c = seen.get(k) ?? 0;
    if (off(c, p)) bad.push(`${label}: ${k === "void" ? "不成立" : k} 数え上げ ${p.toFixed(4)} / 打った ${(c / N).toFixed(4)} (${N} 回)`);
  }
}

/** 1 つの状態の全部 (棚の手 × お告げ)。手ごとに一度手を離す (held-odds-all と同じく vitest の連絡が時間切れにならないように) */
export async function sweepState(item: StageItem, t: Tally): Promise<string[]> {
  const bad: string[] = [];
  for (const key of keysOf(item)) {
    for (const om of omenSets(key)) check(item, key, om, bad, t);
    await new Promise((r) => setImmediate(r));
  }
  return bad;
}
