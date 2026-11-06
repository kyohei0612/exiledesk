/**
 * tree-aim.ts — ツリーの当たりの小さな判定 (段の名前の T で持つ狙い・同じ系統で文も同じ別の modId も当たり)。中身はエンジンの核の aimHits と段の換算 tierIndexOf を呼ぶだけ
 * (2026-10-23 エンジンの for-sim から戻した。オーナー「元からエンジンにあった物をシミュが勝手に自前で作っただけ」)
 */
import { aimHits as hits, heldOdds, makeStageMod, tierIndexOf, type AimHitOpts, type AimTarget, type HeldOdds, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";

// 付きうる狙い (2026-10-23 エンジンの for-sim から戻した。中身はエンジンの核の heldOdds・aimHits を呼ぶだけ。10-25 に画面の tree-hand-plan から精査と一緒に使うここへ)
interface TierAim { modId: string; tier: number }
interface AimDiffOpts { sameText?: boolean }
const heldOn = (data: PatchData, mods: readonly StageMod[], a: TierAim, o: AimDiffOpts): boolean => {
  const t = { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, opts = o.sameText ? { data, sameText: true } : undefined;
  return mods.some((m) => hits(m, t, opts));
};
/**
 * この手で付きうる狙い = items (同じ箱の見本など) のどれかで、クラフト台でそのカレンシーを持った時に出る % (heldOdds。CoE と合わせ済み) が 0 より大きい段がある狙い
 * (並びは aims のまま。オーナー 10-22: 行き先は数え上げず heldOdds の答えをそのまま、錬金・大いなる高貴・骨の候補も heldOdds の物)。
 * もう付いている狙いは見ない (呼ぶ側が外して渡す)。どの見本でも heldOdds に % が 1 つも無い (打てない・確率の表が無い手) 時は null (呼ぶ側が決める)
 */
export function reachableAims<A extends TierAim>(data: PatchData, items: readonly StageItem[], key: string, omens: readonly string[], aims: readonly A[], o: AimDiffOpts = {}): A[] | null {
  const pools = items.flatMap((it) => { const h = heldOdds(data, it, key, omens), ms = h ? poolOf(data, h) : []; return ms.length ? [ms] : []; });
  if (!pools.length) return null;
  return aims.filter((a) => pools.some((ms) => heldOn(data, ms, a, o)));
}
/** heldOdds で % が 0 より大きい段の MOD (数値は段の真ん中、当たりの判定にだけ使う) */
function poolOf(data: PatchData, h: HeldOdds): StageMod[] {
  const out: StageMod[] = [];
  for (const [id, x] of h.byMod) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    for (const t of x.tiers) if (t.w > 0) out.push(makeStageMod(mod, mod.type === "suffix" ? "suffix" : "prefix", t.index, () => 0.5));
  }
  return out;
}

/** その MOD がどれかの狙いに当たる */
export const isAimMod = (m: StageMod, ts: readonly AimTarget[], o?: AimHitOpts): boolean => ts.some((t) => hits(m, t, o));
/**
 * 外れ = 固定 (フラクチャー) でも狙いでもない MOD、側ごと (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B2。
 * ツリーの junkCount・分かれ目の数え・形の鍵・満杯の文・行の札が同じ数え方)
 */
export function junkOf(item: StageItem, ts: readonly AimTarget[], o?: AimHitOpts): { prefix: StageMod[]; suffix: StageMod[] } {
  const junk = (ms: readonly StageMod[]): StageMod[] => ms.filter((m) => !m.fractured && !isAimMod(m, ts, o));
  return { prefix: junk(item.prefixes), suffix: junk(item.suffixes) };
}
/**
 * アイテムに狙い (modId と段の名前の T) が付いているか (2026-10-22 シミュの aimHeld の橋渡しを入口へ)。アイテムの MOD を全部見て、T を段の番号に直して aimHits。
 * sameText = 同じ系統で文も同じ別の modId も当たり (シミュの aimHeld と同じ)
 */
export function aimHeldOn(data: PatchData, item: StageItem, a: { modId: string; tier: number }, o?: { sameText?: boolean }): boolean {
  const t: AimTarget = { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) };
  const opts = o?.sameText ? { data, sameText: true } : undefined;
  return [...item.prefixes, ...item.suffixes].some((m) => hits(m, t, opts));
}
