/**
 * auto-group.ts — シミュレーターの狙いを自動で「この中のどれか N つ」にまとめる (2026-10-09)
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";

/** シミュレーターの狙い (state/craft-stage.ts の simTargets の 1 つ) */
export interface SimTarget { modId: string; minTierIndex: number; method?: "exalt" | "chaos" | "desecrate" | "essence" | "fracture"; alts?: Array<{ modId: string; minTierIndex: number }>; need?: number }

/**
 * 足した MOD と同じ側・同じ付け方 (高貴ガチャ同士 / カオススパム同士) の普通の MOD は、1 つの「この中のどれか N つ」にまとめる
 * (N = 全部の数なので、全部付けば完成は同じ。順番を問わなくなる)。2026-10-09 オーナー「まとめるの知らない人向けに、選んだ MOD で同じカテゴリなら
 * まとめちゃっていいよね。高貴ガチャなら高貴ガチャでまとめる。そしたら、あ、まとまるんだってなる」。
 * まとめるのは 単独の MOD と、全部付ける「どれか N つ」(N = 候補の数) だけ。「どれか 1 つ」などの選んだ組はそのまま
 */
export function autoGroup<T extends SimTarget>(d: PatchData, list: T[], added: string): T[] {
  const sideOf = (id: string): string => (d.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const planOf = (t: T): string => t.method ?? "exalt"; // 普通の MOD の付け方の既定は高貴ガチャ (StageSimPanel の methodsFor)
  const normal = (id: string): boolean => d.mods.get(id)?.source === "normal" && !d.mods.get(id)?.rune;
  const me = list.find((t) => t.modId === added);
  if (!me || !normal(added) || (me.method && me.method !== "exalt" && me.method !== "chaos")) return list;
  const ids = (t: T): string[] => [t.modId, ...(t.alts ?? []).map((a) => a.modId)];
  // 全部付ける組 (候補の数と同じだけコピーがある) か単独
  const fullOrPlain = (t: T): boolean => {
    if (!t.alts?.length) return true;
    const sig = ids(t).sort().join(",");
    return list.filter((x) => ids(x).sort().join(",") === sig).length === ids(t).length;
  };
  const pick = list.filter((t) => t.method !== "fracture" && normal(t.modId) && sideOf(t.modId) === sideOf(added) && planOf(t) === planOf(me) && fullOrPlain(t));
  if (pick.length < 2) return list;
  const members = pick.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex }));
  const at = list.indexOf(pick[0]!);
  const rest = list.filter((t) => !pick.includes(t));
  const group = pick.map((t) => ({ ...t, alts: members.filter((m) => m.modId !== t.modId) }));
  return [...rest.slice(0, at), ...group, ...rest.slice(at)];
}
