/**
 * tree-reveal-aims.ts — 発現で選べる MOD の候補 (骨の手の「発現させる」☑・後から打つ発現の手。10-27 夜オーナー、スイッチ boneLater)。
 * 完成の狙いだけでなく、発現で出うる MOD 全部 (完成形に無い置き石の MOD も)。候補の組み方はエンジンの revealOffers をこの箱の見本で何度も引いて集めた物
 * (自前の置き場は作らない。アビスの反響があれば引き直しの組も)。段は出た中で一番低い段 = 「その段以上」で全部の段が当たり。
 * 窓の灰色 (S-38) は引いて集めず、エンジンの revealPool (発現に出うる MOD と段、重み > 0) から = revealTiersOf
 */
import { mulberry32, revealOffers, revealPool, tierRankOf, unrevealedOf, type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { stepOutcomes } from "../../../services/simulator/sim-engine";
import { prepFor } from "../../../services/simulator/tree/tree-unbounded";
import { ECHO, engineOmens } from "../../../services/simulator/tree/tree-hands";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { isRevealHand } from "../../../services/simulator/tree/tree-veil";
import type { Aim, Hand, TreeDoc } from "../../../services/simulator/tree/tree-model";

/** 見本 1 つあたりに発現の候補を引く回数 (3 つずつ出るので、重みの小さい MOD もほぼ拾える) */
const DRAWS = 80;

/** 未発現の付いた形 = 後から打つ発現はそのまま、骨はエンジンで打った結果 (起こりうる行き先の未発現の物)。この箱の見本 3 つから */
function veiledOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand): StageItem[] {
  const items = [item, ...[2, 3].map((seed) => sampleOf(data, doc, boxId, seed).item)];
  return items.flatMap((it) => (isRevealHand(h.currency) ? [it] : (stepOutcomes(data, prepFor(data, it, h.currency), h.currency, engineOmens(h)) ?? []).filter((o) => !o.void).map((o) => o.item))).filter((it) => unrevealedOf(it));
}

export function revealAimsOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand): Aim[] {
  const echo = h.omens.includes(ECHO);
  const veiled = veiledOf(data, doc, boxId, item, h);
  const worst = new Map<string, number>(), goals = doc.memoAims ?? [];
  for (const v of veiled.slice(0, 6)) for (let s = 1; s <= DRAWS; s++) {
    const o = revealOffers(data, v, mulberry32(s * 7919));
    for (const m of [...o.first, ...(echo ? o.reroll : [])]) worst.set(m.modId, Math.max(worst.get(m.modId) ?? 0, tierRankOf(data, m.modId, m.tierIndex)));
  }
  // 完成の狙いを先に (完成形の設定の順)、ほかは見つかった順
  // 完成の狙いの MOD は完成形の段 (T1 など)、置き石は出うる一番低い段まで (どの段が出ても当たり)
  const out = [...worst].map(([modId, tier]) => ({ modId, tier: goals.find((g) => g.modId === modId)?.tier ?? tier }));
  const at = (a: Aim): number => { const i = goals.findIndex((g) => g.modId === a.modId); return i < 0 ? 999 : i; };
  return out.sort((a, z) => at(a) - at(z));
}

/**
 * 発現で出うる MOD → 段 (表の段の番号、tierRankOf) の組 (S-38)。この箱の見本で打った後の未発現の枠ごとにエンジンの revealPool を聞いて合わせる
 * (骨は両方の側に付きうるので側ごとの置き場が混ざる)。ここに無い MOD・段は発現で出ない = 窓で灰色
 */
export function revealTiersOf(data: PatchData, doc: TreeDoc, boxId: string, item: StageItem, h: Hand): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const v of veiledOf(data, doc, boxId, item, h)) for (const p of revealPool(data, v)) {
    const s = out.get(p.modId) ?? out.set(p.modId, new Set()).get(p.modId)!;
    for (const i of p.tiers) s.add(tierRankOf(data, p.modId, i));
  }
  return out;
}
