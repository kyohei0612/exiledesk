/**
 * tree-reveal-aims.ts — 発現で選べる MOD の候補 (骨の手の「発現させる」☑・後から打つ発現の手。10-27 夜オーナー)。
 * 完成の狙いだけでなく、発現で出うる MOD 全部 (完成形に無い置き石の MOD も)。候補はエンジンの revealPool をこの箱の見本の未発現の形で聞いた物
 * (自前の置き場は作らない)。段は出うる中で一番低い段 = 「その段以上」で全部の段が当たり。
 * 窓の % と灰色 (S-38) はここで引かず、エミュと同じ for-share の useHeldShares (エンジンの heldOdds) と revealPool (TreeVeilCheck)
 */
import { revealPool, tierRankOf, unrevealedOf, type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { stepOutcomes } from "../../../services/simulator/sim-engine";
import { engineOmens } from "../../../services/simulator/tree/tree-hands";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { isRevealHand } from "../../../services/simulator/tree/tree-veil";
import type { Aim, Hand, TreeDoc } from "../../../services/simulator/tree/tree-model";

/** 未発現の付いた形 = 後から打つ発現はそのまま、骨はエンジンで打った結果 (起こりうる行き先の未発現の物)。この箱の見本 3 つから */
function veiledOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand): StageItem[] {
  const items = [item, ...[2, 3].map((seed) => sampleOf(data, doc, boxId, seed).item)];
  return items.flatMap((it) => (isRevealHand(h.currency) ? [it] : (stepOutcomes(data, it, h.currency, engineOmens(h)) ?? []).filter((o) => !o.void).map((o) => o.item))).filter((it) => unrevealedOf(it));
}

export function revealAimsOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand): Aim[] {
  const veiled = veiledOf(data, doc, boxId, item, h);
  const worst = new Map<string, number>(), goals = doc.memoAims ?? [];
  // 出うる MOD と段はエンジンの revealPool (重みが 0 より大きい段。前は revealOffers を 80 回引いて集め、重みの小さい MOD を落としえた)。反響の引き直しも同じ置き場
  for (const v of veiled.slice(0, 6)) for (const p of revealPool(data, v)) for (const ti of p.tiers) worst.set(p.modId, Math.max(worst.get(p.modId) ?? 0, tierRankOf(data, p.modId, ti)));
  // 完成の狙いを先に (完成形の設定の順)、ほかは見つかった順
  // 完成の狙いの MOD は完成形の段 (T1 など)、置き石は出うる一番低い段まで (どの段が出ても当たり)
  const out = [...worst].map(([modId, tier]) => ({ modId, tier: goals.find((g) => g.modId === modId)?.tier ?? tier }));
  const at = (a: Aim): number => { const i = goals.findIndex((g) => g.modId === a.modId); return i < 0 ? 999 : i; };
  return out.sort((a, z) => at(a) - at(z));
}

