/**
 * daily-check.ts — 投稿の機械の確かめ (D-20)。画面 (投稿の前) と 16:00 の台本 (scripts/_daily-roll-entry.ts) が同じ物を読む。
 * Vue・localStorage・fetch に触らない (台本が import する)。悪口の表は server/live/src/daily/nick.ts と同じ (直す時は両方)
 */
import type { PatchData } from "../../services/craft-stage/engine";
import { goalBlock } from "../../services/simulator/sim-engine";
import type { GenAim } from "./daily-gen";

/** 悪口の表 (D-20・D-51)。名前と一言の両方で見る */
const BAD = /死ね|しね|氏ね|殺す|ころす|くそ|クソ|ゴミ|カス|きもい|キモい|fuck|shit|bitch|cunt|nigg|retard/i;
export const hasBadWord = (s: string): boolean => BAD.test(s.normalize("NFKC"));

/** 機械の確かめ (D-20)。エンジンで作れるか (同じ系統の重なりも goalBlock が見る)・名前と一言に悪口が無いか。落ちたら訳、通れば null */
export function boxCheck(data: PatchData, item: { base: string; ilvl: number; aims: GenAim[]; note: string }, nick: string): string | null {
  if (!item.aims.length) return "no-mods";
  if (hasBadWord(item.note) || hasBadWord(nick)) return "bad-word";
  const done: GenAim[] = [];
  for (const a of item.aims) {
    const why = goalBlock(data, item.base, item.ilvl, done.map((x) => ({ modId: x.modId, tier: x.tier })), { modId: a.modId, tier: a.tier });
    if (why) return why;
    done.push(a);
  }
  return null;
}
