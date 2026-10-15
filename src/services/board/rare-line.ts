/**
 * rare-line.ts — 掲示板の「当たりの速報」の線 (ベースごとの「クソレア」の線。2026-10-14 オーナー、docs/roadmap-2026-10.md「掲示板の作り」)。
 *
 * 0.1% の一律だと指輪・防具・宝飾品は一生流れない (指輪の一番低い段でも 0.124%) ので、ベースごとに線を引く:
 *   - そのベースの白 (アイテムレベル 82) をレアにして、高貴のオーブ (下限なし) で 1 つ足す時の段ごとの確率 (その段の重み ÷ 付きうる全部の重み)
 *   - 各 MOD の T1 を珍しい順に足していき、確率の和が RARE_SUM (= 数千回に 1 回) を超えない所までを「クソレア」にする。一番珍しい T1 は必ず入れる
 *   - 線 = 入った段の一番高い確率。T1 が付いて、付いた瞬間の確率がこの線以下なら流す
 * 線の一覧は docs/board-rare-lines.md (tests/board-rare-line.test.ts の BOARD_LINES_OUT で書き出す。オーナーの確認用)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { freshItem } from "../craft-stage/run-plan";
import { candidates, SIDES } from "../craft-stage/stage-core";

/** 線を引くアイテムレベル (エミュレーターの既定) */
export const LINE_ILVL = 82;
/** クソレアの段の確率の和の上限 (目安: 1 回打って 1/2000 で流れる) */
export const RARE_SUM = 1 / 2000;

export interface TierChance { modId: string; tierIndex: number; tierName: string; side: "prefix" | "suffix"; p: number }
export interface RareLine {
  /** この確率以下で付いたら流す (0〜1) */
  line: number;
  /** 一番珍しい段 */
  rarest: TierChance;
  /** 線以下の段の数と、その確率の和 (白のレアに 1 回足して流れる見込み) */
  count: number;
  sum: number;
}

/** 白のレアに 1 つ足す時の段ごとの確率 (低い順) */
export function tierChances(data: PatchData, base: string, ilvl = LINE_ILVL): TierChance[] {
  const item = { ...freshItem(data, base, ilvl), rarity: "rare" as const };
  const cs = candidates(data, item, SIDES, 0);
  const total = cs.reduce((a, c) => a + c.w, 0);
  if (!(total > 0)) return [];
  return cs.flatMap((c) => c.tiers.map((t) => ({ modId: c.mod.id, tierIndex: t.index, tierName: `T${c.mod.tiers.length - t.index}`, side: c.side, p: t.w / total })))
    .sort((a, b) => a.p - b.p || a.modId.localeCompare(b.modId));
}

/**
 * 線を引く (段の確率は低い順)。見るのは各 MOD の一番上の段 (T1) だけ: 下の段まで入れると、重みの低い系統 (ベルトの混沌耐性など) は
 * T6 も T1 も同じ確率なので 6 段まとめて入り、80 回に 1 回流れてしまう (2026-10-16 一覧を出して分かった)。
 * T1 の和が MAX_SUM より大きい (= 珍しい段が無い、ジュエルは全部の MOD がほぼ同じ確率) ベースは流さない
 */
export const MAX_SUM = 1 / 100;
export function lineOf(all: readonly TierChance[]): RareLine | null {
  const ts = all.filter((t) => t.tierName === "T1");
  if (!ts.length) return null;
  let sum = 0, n = 0;
  for (const t of ts) {
    if (n > 0 && sum + t.p > RARE_SUM) break;
    sum += t.p;
    n++;
  }
  // 同じ確率の段は揃えて入れる (線ちょうどの段が入ったり入らなかったりしないように)
  const line = ts[n - 1]!.p;
  while (n < ts.length && ts[n]!.p <= line) { sum += ts[n]!.p; n++; }
  if (sum > MAX_SUM) return null;
  return { line, rarest: ts[0]!, count: n, sum };
}

const memo = new Map<string, RareLine | null>();
/** ベースの線 (MOD の置き場が無いベース・分からないベースは null = 流さない) */
export function rareLineOf(data: PatchData, base: string): RareLine | null {
  const k = `${data.patch}|${base}`;
  if (memo.has(k)) return memo.get(k)!;
  let out: RareLine | null = null;
  try { out = lineOf(tierChances(data, base)); } catch { out = null; }
  memo.set(k, out);
  return out;
}

/** 付いた段が T1 で、付いた瞬間の確率 p が線以下か (割り算の誤差で線ちょうどの段が漏れないよう、少しだけ甘く) */
export const belowLine = (p: number, tierName: string, l: RareLine | null): boolean => !!l && tierName === "T1" && p > 0 && p <= l.line * (1 + 1e-9);
