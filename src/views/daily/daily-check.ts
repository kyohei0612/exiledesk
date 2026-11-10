/**
 * daily-check.ts — 投稿の機械の確かめ (D-20)。画面 (投稿の前) と 16:00 の台本 (scripts/_daily-roll-entry.ts) が同じ物を読む。
 * Vue・localStorage・fetch に触らない (台本が import する)。悪口の表は server/live/src/daily/nick.ts と同じ (直す時は両方)
 */
import type { PatchData } from "../../services/craft-stage/engine";
import { sideLimits } from "../../services/htc/bridge";
import { matchKey } from "../../services/htc/bridge-index";
import { matchModLine } from "../../services/htc/paste-parse";
import { goalBlock } from "../../services/simulator/sim-engine";
import type { GenAim } from "./daily-gen";
import { tr } from "../../i18n/lang";

/** 悪口の表 (D-20・D-51)。名前と一言の両方で見る */
const BAD = /死ね|しね|氏ね|殺す|ころす|くそ|クソ|ゴミ|カス|きもい|キモい|fuck|shit|bitch|cunt|nigg|retard/i;
export const hasBadWord = (s: string): boolean => BAD.test(s.normalize("NFKC"));

/**
 * そのベースのフル MOD 以上か (D-84)。数は決め打ちせず、MOD の数がベースのプレ / サフィの上限 (暗黙の増減込み、不在のアミュレットは 2 / 2) の合計以上かで見る。
 * 上限を超えた品 (限界突破したジュエル等) も通す (オーナー 11-05「そのベーすのフルMODね個数でやるとバグるから不在は4だし」「フルMODの定義もフルMOD以上にしようか」)
 */
export function fullMods(data: PatchData, base: string, aims: readonly { modId: string }[]): boolean {
  const lim = sideLimits(data, base);
  return aims.length >= lim.prefix + lim.suffix;
}

/** 創生の樹の MOD か (D-14)。見分けはエンジンの MOD のタグ (genesis_tree_caster / genesis_tree_minion、ハンドラップの特殊 MOD は持たない) */
export const isGenesis = (data: PatchData, modId: string): boolean => !!data.mods.get(modId)?.tags.some((t) => t.startsWith("genesis_tree_"));
/** 創生の樹の MOD が 2 つ以上か (D-14・D-04 の「お題に 1 つまで」)。投稿の画面 (daily-aims の読み) と 16:00 の boxCheck が同じ物を呼ぶ */
export const genesisOver = (data: PatchData, aims: readonly { modId: string }[]): boolean => aims.filter((a) => isGenesis(data, a.modId)).length > 1;
/** 創生の樹の 2 つ目の行・落とした訳 genesis-2 の文 (オーナー 11-10 の言葉どおり) */
export const genesisWhy = (): string => tr("やり直し不可能なMODは1つまでです", "Only 1 mod that can't be crafted again is allowed");

/** エンジンの創生の樹の MOD の文の鍵 (どの部位の物も)。貼った文の読めない行を見分ける用 */
const genesisKeys = new WeakMap<PatchData, Set<string>>();
/**
 * 貼った文の 1 行が創生の樹の MOD か (D-14)。貼る口の読みは創生の樹の行を MOD にせず読めない行にするので、行の型をエンジンの創生の樹の MOD の文と突き合わせる
 * (見分けの元はエンジンのタグのまま。そのベースに無い創生の樹の MOD でも当てる)
 */
export function isGenesisLine(data: PatchData, line: string): boolean {
  let keys = genesisKeys.get(data);
  if (!keys) {
    keys = new Set([...data.mods.values()].filter((m) => m.tags.some((t) => t.startsWith("genesis_tree_"))).map((m) => matchKey(m.text ?? "")));
    genesisKeys.set(data, keys);
  }
  // 段の幅の添え書き「10(8-10)%」は読みと同じく値だけにする (item-text の stripRangeHint と同じ)
  const hit = matchModLine(line.trim().replace(/(\d+(?:\.\d+)?)\((?:-?\d+(?:\.\d+)?)(?:-(?:\d+(?:\.\d+)?))?\)/g, "$1"));
  return !!hit && keys.has(matchKey(hit.template));
}

/** 機械の確かめ (D-20)。エンジンで作れるか (同じ系統の重なりも goalBlock が見る)・創生の樹の MOD が 1 つまでか (D-14)・フル MOD か (D-84)・名前と一言に悪口が無いか。落ちたら訳、通れば null */
export function boxCheck(data: PatchData, item: { base: string; ilvl: number; aims: GenAim[]; note: string }, nick: string): string | null {
  if (!item.aims.length) return "no-mods";
  if (hasBadWord(item.note) || hasBadWord(nick)) return "bad-word";
  if (genesisOver(data, item.aims)) return "genesis-2";
  const done: GenAim[] = [];
  for (const a of item.aims) {
    const why = goalBlock(data, item.base, item.ilvl, done.map((x) => ({ modId: x.modId, tier: x.tier })), { modId: a.modId, tier: a.tier });
    if (why) return why;
    done.push(a);
  }
  if (!fullMods(data, item.base, item.aims)) return "not-full";
  return null;
}
