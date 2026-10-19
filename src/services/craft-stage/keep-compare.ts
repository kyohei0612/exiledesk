/**
 * keep-compare.ts — フラクチャーの反対側の狙いを「マジックで一緒に揃える」か「1 つ固定してからカオススパム」かの費用の比べ (2026-10-20 オーナー
 * 「1 MOD フラクチャーと 1 MOD 狙いなら MOD の総数は同じだから比べられる、ただし反対側になる、絶対に」「確率より費用、どっちも勝たないといけない」)。
 *
 *   一緒に揃える = (2 つ揃えるループ − 候補だけのループ) × 3 (フラクチャーは 3 本に 1 本)
 *   カオススパム = 固定 + 1 MOD のレアにカオス (外すのは固定していない 1 つだけ、付く物は両側の重みから)。1 個あたりが一番安い等級で、狙いが付くまでの平均
 * どちらも式 (人数で回さない)。ループの式とエンジンの重み (modTierWeight・ルーンを差した置き場) は ③ の費用と同じ。
 * マジックはプレ 1・サフィ 1 なので、比べるのはフラクチャーの候補と反対側の、高貴ガチャ・カオススパムの狙いだけ
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import { modTierWeight } from "../../vendor/poe2htc/engine/pool";
import { withRunes } from "../../vendor/poe2htc/engine/runes";
import { effectiveCls } from "./stage-core";
import type { StageItem } from "./types";
import { methodOfTarget, type SimTargetIn } from "./quiz-build";
import { magicEssenceTarget, magicLoopCounts } from "./sim-greater";

export interface KeepCompare {
  /** 狙いの手順の本体の modId */
  host: string;
  /** マジックで一緒に揃える分の費用 (フラクチャー 3 本分) */
  together: number;
  /** 固定の後にカオススパムで付ける費用 (無ければ null = カオスで付かない) */
  chaos: number | null;
  chaosKey: string | null;
  chaosN: number | null;
  /** グレーター系のエッセンスを使うので揃えるのが必須 (比べない) */
  forced: boolean;
  best: "together" | "chaos";
  /** 中身 (確かめ用): 増強 1 回で候補・狙いが付く確率、両側が空の時に候補の側に付く割合、ループ 1 回分の費用 (候補だけ / 2 つ) */
  detail: { p: number; q: number; share: number; one: number; two: number };
}

export function keepCompare(o: { data: PatchData; item: StageItem; itemLevel: number; targets: readonly SimTargetIn[]; price: (k: string) => number }): KeepCompare[] {
  const { data: d, item: it } = o;
  const side = (id: string): "prefix" | "suffix" => (d.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const frac = o.targets.filter((t) => methodOfTarget(d, t) === "fracture").flatMap((t) => [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])]);
  if (!frac.length) return [];
  const fracSide = side(frac[0]!.modId);
  const runeIds = [...new Set(o.targets.flatMap((t) => [t, ...(t.alts ?? [])]).map((t) => d.mods.get(t.modId)?.rune).filter((r): r is string => !!r))];
  const pools = (runeIds.length ? withRunes(effectiveCls(it), runeIds) : it.cls).pools.normal;
  const wAt = (id: string, minIdx: number, floor: number): number => { const m = d.mods.get(id); return m ? modTierWeight(m, floor, o.itemLevel, minIdx) : 0; };
  // 同じ MOD は 1 回だけ (差したルーンの置き場にもう一度足すと 2 重になる。2026-10-20)
  const totalAt = (k: "prefixes" | "suffixes", floor: number): number => [...new Set(pools[k])].reduce((a, id) => a + wAt(id, 0, floor), 0);
  const own = fracSide === "prefix" ? "prefixes" : "suffixes", other = fracSide === "prefix" ? "suffixes" : "prefixes";
  // 増強の等級: 候補が付く一番上の物 (③ と同じ)
  const grades = [
    { aug: "augment_perfect", floor: CURRENCY_FLOOR.augment.perfect },
    { aug: "augment_greater", floor: CURRENCY_FLOOR.augment.greater },
    { aug: "augment", floor: CURRENCY_FLOOR.augment.base },
  ];
  const pOf = (floor: number): number => { const t = totalAt(own, floor); return t > 0 ? Math.min(1, frac.reduce((a, c) => a + wAt(c.modId, c.minTierIndex, floor), 0) / t) : 0; };
  const g = grades.find((x) => pOf(x.floor) > 0) ?? grades[0]!;
  const p = pOf(g.floor);
  const ownT = totalAt(own, g.floor), otherT = totalAt(other, g.floor);
  const share = ownT + otherT > 0 ? ownT / (ownT + otherT) : 0.5;
  const loopCost = (q: number | null): number => { const c = magicLoopCounts(p, q, share); return c.augment * o.price(g.aug) + c.annul * o.price("annul"); };
  const base = loopCost(null);
  const forced = !!magicEssenceTarget(d, o.targets);
  const chaosGrades = [
    { key: "chaos", floor: CURRENCY_FLOOR.exalt.base },
    { key: "chaos_greater", floor: CURRENCY_FLOOR.exalt.greater },
    { key: "chaos_perfect", floor: CURRENCY_FLOOR.exalt.perfect },
  ];
  const out: KeepCompare[] = [];
  for (const t of o.targets) {
    const m = methodOfTarget(d, t);
    if (m !== "exalt" && m !== "chaos") continue;
    const members = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
    if (members.some((x) => side(x.modId) === fracSide)) continue;
    const q = otherT > 0 ? Math.min(1, members.reduce((a, x) => a + wAt(x.modId, x.minTierIndex, g.floor), 0) / otherT) : 0;
    const together = q > 0 ? 3 * (loopCost(q) - base) : Infinity;
    // カオス: 固定 + 1 MOD のレア。外れの 1 つを外して両側の重みから 1 つ付く
    let chaos: number | null = null, chaosKey: string | null = null, chaosN: number | null = null;
    for (const c of chaosGrades) {
      const all = totalAt("prefixes", c.floor) + totalAt("suffixes", c.floor);
      const px = all > 0 ? members.reduce((a, x) => a + wAt(x.modId, x.minTierIndex, c.floor), 0) / all : 0;
      const pr = o.price(c.key);
      if (!(px > 0) || !(pr > 0)) continue;
      const cost = pr / px;
      if (chaos == null || cost < chaos) { chaos = cost; chaosKey = c.key; chaosN = 1 / px; }
    }
    out.push({ host: t.modId, together, chaos, chaosKey, chaosN, forced, best: forced || chaos == null || together <= chaos ? "together" : "chaos", detail: { p, q, share, one: base, two: q > 0 ? loopCost(q) : Infinity } });
  }
  return out;
}
