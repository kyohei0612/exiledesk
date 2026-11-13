/**
 * tree-tier-down.ts — 完成形の段を下げる (S-10f、スイッチ tierDown、11-13 オーナー「ティア下げなあかんな」「一旦作って見せて」)。
 * 完成形のカードの段の札から下限を選ぶと、完成形の狙い・木の当たりの箱の段・残す MOD の段を一緒に下げる。
 * オーブ (高貴の上級・完全など) は自動で替えない (11-13 オーナー「今のオーブで出なかったら注意書きでオーブのおすすめ」「変更加えたオーブだけいじったらええ」):
 * 今のオーブの段の下限 (E-11d、エンジンの orbFloor) では狙いの下限の段が出ない手だけを orbMisfits で拾い、画面が「オーブをどうしますか」とおすすめを出す。
 * ✦ (フラクチャーの印) の MOD は下げない。同じ MOD の ✦ 側 / 普通側の 2 つ持ちは後 (todo)。上げは無し。
 */
import { orbFloor, parseKey, type OrbStrength, type PatchData } from "../../craft-stage/engine";
import { sameAimMod } from "./tree-hand-core";
import type { Aim, TreeDoc } from "./tree-model";

/** 強い順 (下限の高い順) */
const STRONG_FIRST: readonly OrbStrength[] = ["perfect", "greater", "base"];

/** 鍵 → 種類と強さ (エンジンの parseKey。exalt_perfect → exalt / perfect)。オーブでない鍵は null */
function splitOrb(key: string): { kind: string; s: OrbStrength } | null {
  const k = parseKey(key);
  return k.type === "currency" ? { kind: k.kind, s: k.strength } : null;
}
/** オーブの段の下限 (MOD レベル、エンジンの orbFloor)。下限の無い物は 0 */
const floorOf = (key: string): number => { const o = splitOrb(key); return o ? orbFloor(o.kind, o.s) : 0; };

/** 段 (T 何以上) の MOD レベル。tiers は下の段から並ぶ (T1 = 最後) */
export const tierLevel = (data: PatchData, a: Aim): number => { const ts = data.mods.get(a.modId)?.tiers ?? []; return ts[ts.length - a.tier]?.ilvl ?? 0; };

/** 下限の段 (MOD レベル level) が出るオーブのうち一番強い物 (おすすめ)。今の物で出るなら今の物 */
export function fitOrb(key: string, level: number): string {
  const o = splitOrb(key);
  if (!o || orbFloor(o.kind, o.s) <= level) return key;
  const to = STRONG_FIRST.find((s) => orbFloor(o.kind, s) <= level) ?? "base";
  return to === "base" ? o.kind : `${o.kind}_${to}`;
}

/** 札の MOD (modId) が狙い a と同じ MOD か (sameAimMod を通す。画面が MOD を直に比べない)*/
export const isAimMod = (data: PatchData, a: Aim, modId: string): boolean => sameAimMod(data, { modId, tier: a.tier }, a);

/** 段を下げられるか (完成形の狙いで ✦ の印が無い。同じ MOD の ✦ 側があっても下げない = 2 つ持ちは後) */
export const canLowerGoal = (data: PatchData, doc: TreeDoc, goal: Aim): boolean =>
  !goal.fractured && !(doc.memoAims ?? []).some((a) => a.fractured && sameAimMod(data, a, goal));

/**
 * 完成形の狙い from を to (同じ MOD の下の段。to.tier > from.tier) に下げる。
 * 書き換える物: 完成形の狙い (貼り付けの値は外す)・当たりの箱の段 (aim と anyOf)・残す MOD (keep)。オーブは触らない (orbMisfits)。
 * 段を上げる・✦ の MOD は何もしない (false)
 */
export function lowerGoalTier(data: PatchData, d: TreeDoc, from: Aim, to: Aim): boolean {
  if (to.tier <= from.tier || !canLowerGoal(data, d, from)) return false;
  const same = (a: Aim): boolean => sameAimMod(data, a, from);
  const down = (a: Aim): Aim => (same(a) && !a.fractured ? { ...a, modId: to.modId, tier: to.tier } : a);
  d.memoAims = (d.memoAims ?? []).map((a) => (same(a) && !a.fractured ? { modId: to.modId, tier: to.tier } : a));
  for (const b of Object.values(d.boxes)) {
    if (b.aim) b.aim = down(b.aim);
    if (b.anyOf) b.anyOf = b.anyOf.map(down);
    if (b.hand?.keep) b.hand.keep = b.hand.keep.map(down);
  }
  return true;
}

/** 今のオーブでは狙いの下限の段が出ない手 (box = 手の箱、aim = 出ない狙い、level = その段の MOD レベル、to = おすすめのオーブ) */
export interface OrbMisfit { box: string; currency: string; aim: Aim; level: number; to: string }
/** その MOD (goal と同じ MOD) を当たりの箱に持つ手のうち、オーブの段の下限が狙いの段の MOD レベルを超える物 */
export function orbMisfits(data: PatchData, d: TreeDoc, goal: Aim): OrbMisfit[] {
  const out: OrbMisfit[] = [];
  for (const b of Object.values(d.boxes)) {
    if (!b.hand || !floorOf(b.hand.currency)) continue;
    const aims = b.outs.flatMap((id) => { const c = d.boxes[id]; return c ? [...(c.aim ? [c.aim] : []), ...(c.anyOf ?? [])] : []; }).filter((a) => sameAimMod(data, a, goal));
    // 一番下の段 (一番低い MOD レベル) で見る
    const low = aims.map((a) => ({ a, level: tierLevel(data, a) })).sort((x, z) => x.level - z.level)[0];
    if (low && floorOf(b.hand.currency) > low.level) out.push({ box: b.id, currency: b.hand.currency, aim: low.a, level: low.level, to: fitOrb(b.hand.currency, low.level) });
  }
  return out;
}
