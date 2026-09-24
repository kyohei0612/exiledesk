/**
 * tree-presets.ts — 見本のツリー (2026-09-24)
 *
 * オーナー:「耐性付ける時はカタリスト安い奴、知性は適応で手を作ってみて。順不同どっち先でもええ。消去は全て普通の
 * (お告げ無し) 消去で動くかテスト。最後の仕上げでカタリスト 40% まで上げて、削減・カオスオーブ打って品質消して、
 * 変わったゴミ MOD を左側結晶化、マナ % 上昇のパーフェクト打って、最後冒涜リロールでマナ T1 まで」。
 *
 * 死体の円環 (ニーモニックリング、品質 40%) の流れ:
 *   1 カオス / キャスピ → ○2 ×1
 *   2 左側の結晶化 + ブリーチのエッセンス (確定) → ○3
 *   (q1 全耐性に効く一番安いカタリストで品質を上限まで)
 *   3 完全の高貴 + 右側 + 触媒の高貴のお告げ + 同じカタリスト / 全耐性 → ○4 ×消去 (自動)
 *   (q2 適応のカタリストで入れ直し。種類を替えると品質は 0 から、2026-09-24 オーナー)
 *   4 完全の高貴 + 右側 + 触媒の高貴のお告げ + 適応 / 知性 → ○5 ×消去 (自動)
 *     (3 で知性が先に付いても、揃っている手は飛ばすので順不同で動く)
 *   5 カタリストだけ (神経、品質 40% まで) → ○6
 *   6 カオス + 削減のお告げ (ブリーチの MOD を消して何か付く) → ○7
 *   7 左側の結晶化 + パーフェクトエッセンス (最大マナ %) で、6 で付いた外れを食わせる → ○8
 *   8 冒涜 (左手のネクロマンシー) / 最大マナ (貼り付けの段) → ○完成 ×9
 *   9 光のお告げ + 消去 (冒涜だけ消す) → ○8
 */
import { catalystPriceKey } from "../../services/htc/catalysing";
import { catalystsFor } from "../../services/htc/quality";
import type { SimNode } from "../../services/htc/sim-route";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

const CS = "Rings/IncreasedCastSpeed", INT = "Rings/Intelligence", RES = "Rings/AllResistances";
const MANA = "Rings/IncreasedMana", MANA_PCT = "Rings/PerfectEssence_MaximumManaIncreasePercent";

export interface TreePreset { id: string; label: string; applies: (targets: readonly TierTarget[]) => boolean; build: (d: PatchData, p: Prices, targets: readonly TierTarget[]) => SimNode[] }

export const TREE_PRESETS: readonly TreePreset[] = [{
  id: "corpse-ring-40",
  label: "死体の円環 (品質 40%、消去は全部素の消去)",
  applies: (ts) => [CS, INT, RES, MANA, MANA_PCT].every((id) => ts.some((t) => t.modId === id)),
  build: (d, p, ts) => {
    const tier = (id: string): number => ts.find((t) => t.modId === id)?.minTierIndex ?? 0;
    // 全耐性に効くカタリストのうち一番安い物
    const res = d.mods.get(RES);
    const resCat = (res ? catalystsFor(res) : []).map((k) => k.tag)
      .sort((a, b) => (p.currency[catalystPriceKey(a)] ?? Infinity) - (p.currency[catalystPriceKey(b)] ?? Infinity))[0] ?? null;
    const ex = (catalyst: string | null) => ({ kind: "exalt" as const, tier: "exalt_perfect" as const, side: "suffix" as const, catalyst });
    const base = { clean: false, maxMods: null, need: 1 };
    return [
      { ...base, id: "p1", action: { kind: "chaos", tier: "chaos" }, targets: [{ modId: CS, minTier: tier(CS) }], keep: [], onHit: "p2", onMiss: "p1" },
      { ...base, id: "p2", action: { kind: "breach" }, targets: [], keep: [CS, "__breach__"], onHit: "q1", onMiss: null },
      // 触媒の高貴のお告げの前に、そのカタリストで品質を上限 (ブリーチ込み 40%) まで。種類を替えると 0 から入れ直し
      { ...base, id: "q1", action: { kind: "quality", catalyst: resCat ?? "resistance" }, targets: [], keep: [CS, "__breach__"], onHit: "p3", onMiss: null },
      { ...base, id: "p3", action: ex(resCat), targets: [{ modId: RES, minTier: tier(RES) }], keep: [CS, "__breach__"], onHit: "q2", onMiss: "pa" },
      { ...base, id: "q2", action: { kind: "quality", catalyst: "attribute" }, targets: [], keep: [CS, RES, "__breach__"], onHit: "p4", onMiss: null },
      { ...base, id: "p4", action: ex("attribute"), targets: [{ modId: INT, minTier: tier(INT) }], keep: [CS, RES, "__breach__"], onHit: "p5", onMiss: "pa" },
      { ...base, id: "pa", action: { kind: "annul", side: null }, targets: [], keep: [], onHit: "auto", onMiss: "auto" },
      { ...base, id: "p5", action: { kind: "quality", catalyst: "mana" }, targets: [], keep: [CS, RES, INT], onHit: "p6", onMiss: null },
      { ...base, id: "p6", action: { kind: "whittle" }, targets: [], keep: [CS, RES, INT], onHit: "p7", onMiss: null },
      { ...base, id: "p7", action: { kind: "essence", modId: MANA_PCT }, targets: [{ modId: MANA_PCT, minTier: 0 }], keep: [CS, RES, INT], onHit: "p8", onMiss: null },
      { ...base, id: "p8", action: { kind: "desecrate", side: "prefix", bone: "desecrate_ancient", echoes: false }, targets: [{ modId: MANA, minTier: tier(MANA) }], keep: [CS, RES, INT, MANA_PCT], onHit: "done", onMiss: "p9" },
      { ...base, id: "p9", action: { kind: "light" }, targets: [], keep: [CS, RES, INT, MANA_PCT], onHit: "p8", onMiss: null },
    ] as SimNode[];
  },
}];
