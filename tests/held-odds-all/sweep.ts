// 確率表 (held-odds.ts) の総当たり (2026-10-10 オーナー「手動でデバックしたくない、全パターン持ってみて確率しっかりチェックしないと」)。
// 部位 × 状態 (ノーマル / マジック / レア / 品質付き / 両側が埋まった) × 棚の MOD を足す手と骨の全部 × お告げ (無し・1 枚・掛けられる 2 枚) を自動で並べて、
// 表の確率と実際に打った結果 (付いた MOD / 骨は候補 3 つに出た MOD) を突き合わせる。表で 0% の物が出たら、その場で失敗
import { writeFileSync } from "node:fs";
import { loadPatch } from "../helpers/patch";
import { applyCurrency, kindOf } from "../../src/services/craft-stage/apply-currency";
import { revealOffers } from "../../src/services/craft-stage/apply-desecrate";
import { heldOdds } from "../../src/services/craft-stage/held-odds";
import { freshItem } from "../../src/services/craft-stage/run-plan";
import { OMEN_EXCLUSIVE, OMEN_FOR } from "../../src/services/craft-stage/omens";
import { mulberry32 } from "../../src/services/htc/rng";
import { BONES, CATALYSTS, CRAFT_RUNE_KEYS, ORBS, essenceShelf, runesFor } from "../../src/state/craft-stage-shelf";
import type { StageItem } from "../../src/services/craft-stage/types";

const data = loadPatch();
const N = 600;
/** 突き合わせの数が多いので 5 σ と 2.5 ポイントの大きい方 */
const tol = (p: number) => Math.max(0.025, 5 * Math.sqrt((p * (1 - p)) / N));

/** 種は散らす (続き番号の種だと、同じ重みの 2 つの MOD の出方が偏った。2026-10-10) */
const seed = (s: number, k: number) => (Math.imul(s, 2654435761) ^ Math.imul(k, 0x5bd1e995)) >>> 0;
const A = (it: StageItem, key: string, seed: number): StageItem | null => {
  const r = applyCurrency(data, it, key, mulberry32(seed), []);
  return r.applied ? r.item : null;
};

/** アイテムクラスごとに 1 つ (計算機のベースの全部。フラスコ・ジェムは MOD の手が無いので入らない) */
export const BASES = [...new Set([...data.bases.values()].map((c) => c.bases?.[0]).filter((b): b is string => !!b))];
/** 足す手 (候補の式がある物と、打って数える物) */
const ADD_KINDS = new Set(["transmute", "augment", "regal", "alchemy", "exalt", "chaos", "essence", "essence_perfect"]);
const ORB_KEYS = ORBS.flatMap((g) => g.keys).filter((k) => ADD_KINDS.has(kindOf(k)));

/** お告げの組: 無し・1 枚・一緒に掛けられる 2 枚 */
function omenSets(key: string): string[][] {
  const os = (OMEN_FOR[kindOf(key)] ?? []).filter((o) => o !== "OmenofPutrefaction");
  const ex = (a: string, b: string) => OMEN_EXCLUSIVE.some((g) => g.includes(a) && g.includes(b));
  const out: string[][] = [[], ...os.map((o) => [o])];
  for (let i = 0; i < os.length; i++) for (let j = i + 1; j < os.length; j++) if (!ex(os[i]!, os[j]!)) out.push([os[i]!, os[j]!]);
  return out;
}

function states(base: string): Array<[string, StageItem]> {
  const normal = freshItem(data, base, 82);
  const out: Array<[string, StageItem]> = [["ノーマル", normal]];
  const magic = A(normal, "transmute", 11);
  if (!magic) return out;
  out.push(["マジック", magic]);
  const rare = A(magic, "regal", 12);
  if (!rare) return out;
  out.push(["レア", rare]);
  // 品質: カタリストは付けられる物を全部 (触媒のお告げの伸び方が MOD のタグごとに違う)
  for (const c of CATALYSTS) {
    const q = A(rare, c, 13);
    if (q) out.push([`品質 ${c}`, q]);
  }
  // クラフトに関わるルーン (コルの狩りなど、置き場を変える物) を差したレア
  const fits = new Set(runesFor(rare).flatMap((g) => g.keys));
  for (const k of CRAFT_RUNE_KEYS.filter((x) => fits.has(x))) {
    const r = A(rare, k, 14);
    if (r) out.push([`ルーン ${k}`, r]);
  }
  let full = rare;
  for (let i = 0; i < 6; i++) full = A(full, "exalt", 80 + i) ?? full;
  out.push(["両側が埋まった", full]);
  const frac = A(full, "fracture", 15);
  if (frac) out.push(["両側が埋まった + フラクチャー", frac]);
  // 深淵の王の印 (深淵のエッセンス)
  const abyss = essenceShelf(data, rare).flatMap((g) => g.keys).find((k) => /EssenceAbyss/.test(k));
  const mark = abyss ? A(rare, abyss, 16) : null;
  if (mark) out.push(["深淵の王の印", mark]);
  const low = A(A(freshItem(data, base, 60), "transmute", 51) ?? normal, "regal", 52);
  if (low) out.push(["アイテムレベル 60 レア", low]);
  return out;
}

function check(item: StageItem, key: string, omens: string[], bad: string[]): void {
  const label = `${key} [${omens.join("+") || "-"}]`;
  const bone = kindOf(key) === "desecrate";
  const first = applyCurrency(data, item, key, mulberry32(3), omens);
  if (!first.applied) return;
  const h = heldOdds(data, item, key, omens);
  if (!h) {
    if ((first.added ?? []).length || bone) bad.push(`${label}: 打てるのに表が出ない`);
    return;
  }
  const seen = new Map<string, number>();
  for (let s = 1; s <= N; s++) {
    const r = applyCurrency(data, item, key, mulberry32(seed(s, 1)), omens);
    if (!r.applied) { bad.push(`${label}: ${r.reason}`); return; }
    let ids: string[];
    if (bone) {
      const o = revealOffers(data, r.item, mulberry32(seed(s, 2)));
      ids = o.first.map((m) => m.modId);
      if (omens.includes("OmenofAbyssalEchoes")) ids.push(...o.reroll.map((m) => m.modId));
    } else ids = (r.added ?? []).map((m) => m.modId);
    for (const id of new Set(ids)) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const id of seen.keys()) if (!h.byMod.has(id)) bad.push(`${label}: 表で 0% なのに出た ${id} (${seen.get(id)}/${N})`);
  for (const [id, x] of h.byMod) {
    const p = x.w / h.total;
    const q = (seen.get(id) ?? 0) / N;
    if (Math.abs(p - q) >= tol(p)) bad.push(`${label}: ${id} 表 ${p.toFixed(3)} / 実際 ${q.toFixed(3)}`);
  }
}

/** 1 つのベースの全部を突き合わせて、合わなかった物の一覧を返す */
export function sweepBase(base: string): string[] {
  const bad: string[] = [];
  for (const [st, item] of states(base)) {
    const keys = [...ORB_KEYS, ...BONES, ...essenceShelf(data, item).flatMap((g) => g.keys)];
    for (const key of keys) for (const om of omenSets(key)) {
      const before = bad.length;
      check(item, key, om, bad);
      for (let i = before; i < bad.length; i++) bad[i] = `${st}: ${bad[i]}`;
    }
  }
  if (process.env.ODDS_DUMP) writeFileSync(`${process.env.ODDS_DUMP}/${base}.txt`, bad.join("\n"));
  return bad;
}
