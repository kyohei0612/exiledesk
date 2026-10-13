/**
 * 今日のお題 (2026-10-13 オーナー「また来て色々やりたいなって思う作り」「ニックネームで最速何手」)。
 *
 * 日付 (JST) から、よく作られるベース 1 つと狙う MOD (プレ 1・サフィ 1、半分の日はもう 1 つ) と段の下限を決める。
 * 乱数の種も日付から決めるので、全員が同じ手を打てば同じ結果になる (オーナー「乱数は一緒に」。n 手目の乱数は stepSeedOf)。
 * 種の式はサーバー (server/live/src/challenge.ts の daySeed) と同じ。tests/challenge.test.ts で突き合わせる
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { AimTarget } from "../craft-stage/aim-odds";
import { modListFor, type ListRow, type ListTier } from "../craft-stage/mod-list";
import { freshItem } from "../craft-stage/run-plan";
import { mulberry32 } from "../htc/rng";
import type { StageSide } from "../craft-stage/types";
import popular from "../../data/popular-bases.json";

export const CHALLENGE_ILVL = 82;
/** 0 手目に戻せる (完全リセット) 回数 (オーナー「0 手目まで戻れるのは 3 回」) */
export const CHALLENGE_RESETS = 3;

/** JST の日付 (YYYY-MM-DD) */
export const jstDay = (now = Date.now()): string => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
/** その日の乱数の種 (サーバーと同じ式) */
export function daySeed(day: string): number {
  let h = 0x811c9dc5;
  for (const c of `exiledesk-challenge:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return (h % 2_147_483_646) + 1;
}
/** n 手目を打つ時の乱数の種 (同じ日・同じ手目なら誰でも同じ。打つ物ごとの混ぜ方は craft-stage.ts の stepSeedFor) */
export function stepSeedOf(seed: number, n: number): number {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % 2_147_483_646 + 1;
}

export interface ChallengeTarget extends AimTarget { side: StageSide; /** 段の下限の名前 (T1 = 一番上) */ rank: string; text: string }
export interface DailyChallenge { day: string; seed: number; base: string; itemLevel: number; targets: ChallengeTarget[] }

/** 候補のベース: 分析の記録でよく作られている物から (多い順に 16 個) */
const BASES = Object.entries((popular as { users: Record<string, number> }).users).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([en]) => en);
/** 狙いにする MOD はよく付く物 (同じ側の重みの 3% 以上) */
const MIN_SHARE = 0.03;

export function dailyChallenge(data: PatchData, day: string): DailyChallenge {
  const seed = daySeed(day);
  const rng = mulberry32(seed);
  const pickW = <T,>(xs: readonly T[], w: (x: T) => number): T => {
    const total = xs.reduce((a, x) => a + w(x), 0);
    let r = rng() * total;
    for (const x of xs) { r -= w(x); if (r <= 0) return x; }
    return xs[xs.length - 1]!;
  };
  // ベースは日ごとに回す (作れない物は飛ばす)
  const bases = BASES.filter((b) => { try { freshItem(data, b, CHALLENGE_ILVL); return true; } catch { return false; } });
  const start = Math.floor(rng() * bases.length);
  for (let i = 0; i < bases.length; i++) {
    const base = bases[(start + i) % bases.length]!;
    const item = freshItem(data, base, CHALLENGE_ILVL);
    const rows = modListFor(data, item).filter((r) => r.group === "normal" && r.share >= MIN_SHARE && r.tiers.some((t) => t.ilvl <= CHALLENGE_ILVL));
    const pre = rows.filter((r) => r.side === "prefix");
    const suf = rows.filter((r) => r.side === "suffix");
    if (!pre.length || !suf.length) continue;
    const chosen: ListRow[] = [pickW(pre, (r) => r.share), pickW(suf, (r) => r.share)];
    // 半分の日は 3 つ目 (どちらかの側の、まだ選んでいない物)
    if (rng() < 0.5) {
      const rest = rows.filter((r) => !chosen.includes(r) && r.family !== chosen[0]!.family && r.family !== chosen[1]!.family);
      if (rest.length) chosen.push(pickW(rest, (r) => r.share));
    }
    const targets = chosen.map((r) => targetOf(data, r, rng)).filter((t): t is ChallengeTarget => !!t);
    if (targets.length === chosen.length) return { day, seed, base, itemLevel: CHALLENGE_ILVL, targets };
  }
  throw new Error("今日のお題を作れなかった");
}

/** 段の下限: このアイテムレベルで付く段のうち、上から 2 つ目か 3 つ目 (一番上だけだと厳しすぎる) */
function targetOf(data: PatchData, r: ListRow, rng: () => number): ChallengeTarget | null {
  const avail = r.tiers.filter((t) => t.ilvl <= CHALLENGE_ILVL);
  const t: ListTier | undefined = avail[Math.min(avail.length - 1, 1 + Math.floor(rng() * 2))];
  if (!t) return null;
  const modId = t.modId ?? r.id;
  const mod = data.mods.get(modId);
  const idx = mod?.tiers.findIndex((x) => x.name === t.name && x.ilvl === t.ilvl) ?? -1;
  if (!mod || idx < 0) return null;
  return { modId, minTierIndex: idx, side: r.side, rank: `T${mod.tiers.length - idx}`, text: t.text };
}
