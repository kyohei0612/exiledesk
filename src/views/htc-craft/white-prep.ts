/**
 * white-prep.ts — 白のベースからフラクチャーまでの 1 個あたりの費用 (2026-10-04)
 *
 * オーナー:「白ベースと素材ベースでいうと 5 個を基本としよう。必ず 5 でスタートして 1 個作れると仮定」「最初の増強・消去スパムは 1 MOD でも
 * 狙った MOD が出たら止めてフラクチャーまでの道」。1 個ぶんの手順:
 *   変成 → (外れなら) 増強 → (2 つとも外れなら) 消去 → 増強 … 狙いが 1 つ付いたら王者 (レア) → 高貴 (普通の MOD 3 つに) → 冒涜 (当て馬) → フラクチャー
 * マジックの段はシミュレーター ([[sim-route.ts]] の transmute / augment / regal) で回した平均。王者の後の高貴は 1 回 (費用は多め)。
 * 5 個とも ここまで進め、1 個だけ成功する前提なので、呼ぶ側が 5 倍する
 */
import { floorKeepIndex } from "../../vendor/poe2htc/engine/pool";
import { simulateTree, type SimNode, type SimCtx } from "../../services/htc/sim-route";

/** 5 個買って 1 個固定できる前提 (オーナー 2026-10-04) */
export const FRACTURE_BATCH = 5;

const memo = new WeakMap<object, Map<string, { magic: number; prep: number; tier: string } | null>>();

/** 等級の名前 (値段のキーの後ろ) と MOD レベルの下限 */
const TIERS = [["_perfect", 50, "完全"], ["_greater", 35, "上級"], ["", 0, ""]] as const;

/**
 * 1 個をフラクチャーまで進める費用 (高貴建て、ベース代は含まない)。magic = 王者まで、prep = フラクチャーのオーブまで。
 * 狙いの段に届く等級のうち一番上の物で変成・増強を打つ。届かない・相場が無ければ null
 */
export function whitePrep(ctx: SimCtx, modId: string, minTier: number): { magic: number; prep: number; tier: string } | null {
  let byCtx = memo.get(ctx.prices);
  if (!byCtx) { byCtx = new Map(); memo.set(ctx.prices, byCtx); }
  const key = `${modId}|${minTier}|${ctx.itemLevel}|${ctx.cls.id}`;
  if (byCtx.has(key)) return byCtx.get(key)!;
  const m = ctx.data.mods.get(modId);
  const cur = ctx.prices.currency;
  let out: { magic: number; prep: number; tier: string } | null = null;
  const tier = m && TIERS.find(([, floor]) => { const keep = floorKeepIndex(m, floor, ctx.itemLevel); return m.tiers.some((t, i) => i >= minTier && (t.ilvl >= floor || i === keep) && t.ilvl <= ctx.itemLevel && t.weight > 0); });
  if (m && tier) {
    const [suf, , ja] = tier;
    const tg = [{ modId, minTier }];
    const base = { keep: [] as string[], clean: false, maxMods: null };
    const nodes: SimNode[] = [
      { ...base, id: "t", action: { kind: "transmute", tier: `transmute${suf}` as "transmute" }, targets: tg, onHit: "r", onMiss: "a" },
      { ...base, id: "a", action: { kind: "augment", tier: `augment${suf}` as "augment" }, targets: tg, onHit: "r", onMiss: "x" },
      { ...base, id: "x", action: { kind: "annul", side: null }, targets: [], onHit: "a", onMiss: "a" },
      { ...base, id: "r", action: { kind: "regal", tier: "regal" }, targets: [], onHit: "done", onMiss: "done" },
    ];
    const r = simulateTree({ ctx, start: { slots: [], breach: false }, nodes, runs: 2000 });
    const extra = (cur.exalt ?? Infinity) + (cur.desecrate ?? Infinity) + (cur.fracture ?? Infinity);
    if (r.pDone > 0.5 && Number.isFinite(r.perDone) && Number.isFinite(extra)) out = { magic: r.perDone, prep: r.perDone + extra, tier: ja };
  }
  byCtx.set(key, out);
  return out;
}
