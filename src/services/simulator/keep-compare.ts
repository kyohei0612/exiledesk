/**
 * keep-compare.ts — フラクチャーの反対側の狙いを「マジックで一緒に揃える」か「1 つ固定してからカオススパム」かの費用の比べ (2026-10-20 オーナー
 * 「1 MOD フラクチャーと 1 MOD 狙いなら MOD の総数は同じだから比べられる、ただし反対側になる、絶対に」「確率より費用、どっちも勝たないといけない」)。
 *
 *   一緒に揃える = (2 つ揃えるループ − 候補だけのループ) ÷ フラクチャーの当たり (3 MOD + 壁なら 3 本に 1 本)
 *   カオススパム = 固定 + 1 MOD のレアにカオス (外すのは固定していない 1 つだけ、付く物は固定した系統を除いた両側から)。1 個あたりが一番安い等級で、狙いが付くまでの平均
 * どちらも式 (人数で回さない)。ループの式は ③ の費用と同じ。1 手の確率はエンジンの入口 (sim-odds.ts、2026-10-20 手 4。前は modTierWeight を自分で組んでいた)。
 * マジックはプレ 1・サフィ 1 なので、比べるのはフラクチャーの候補と反対側の、高貴ガチャ・カオススパムの狙いだけ
 */
import type { PatchData, StageItem } from "../craft-stage/engine";
import { methodOfTarget, type SimTargetIn } from "./quiz-build";
import { magicEssenceTarget, magicLoopCounts } from "./sim-greater";
import { blankWith, chaosAfterFix, fractureOdds, magicAugOdds } from "./sim-odds";

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
  detail: { p: number; q: number; share: number; one: number; two: number; augKey: string };
}

export function keepCompare(o: { data: PatchData; item: StageItem; itemLevel: number; targets: readonly SimTargetIn[]; price: (k: string) => number }): KeepCompare[] {
  const { data: d, item: it } = o;
  const side = (id: string): "prefix" | "suffix" => (d.mods.get(id)?.type === "suffix" ? "suffix" : "prefix");
  const frac = o.targets.filter((t) => methodOfTarget(d, t) === "fracture").flatMap((t) => [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])]);
  if (!frac.length) return [];
  const fracSide = side(frac[0]!.modId);
  const otherSide = fracSide === "prefix" ? "suffix" : "prefix";
  // 狙いのルーンを差した MOD の無いマジック (ルーンの MOD も割る方に入る)
  const blank = blankWith(d, it, o.itemLevel, "magic", o.targets.flatMap((t) => [t, ...(t.alts ?? [])]));
  // 増強の等級: 候補が付く一番上の物 (③ と同じ)
  const grades = ["augment_perfect", "augment_greater", "augment"].map((aug) => ({ aug, odds: magicAugOdds(d, blank, aug) }));
  const g = grades.find((x) => x.odds.hit(fracSide, frac) > 0) ?? grades[0]!;
  const p = g.odds.hit(fracSide, frac);
  const share = g.odds.share[fracSide];
  // フラクチャーは狙い・反対側・王者の 3 MOD + 壁 (3 本に 1 本)
  const fracP = fractureOdds(d, blank, frac);
  const loopCost = (q: number | null): number => { const c = magicLoopCounts(p, q, share); return c.augment * o.price(g.aug) + c.annul * o.price("annul"); };
  const base = loopCost(null);
  const forced = !!magicEssenceTarget(d, o.targets);
  const chaosGrades = ["chaos", "chaos_greater", "chaos_perfect"];
  const out: KeepCompare[] = [];
  for (const t of o.targets) {
    const m = methodOfTarget(d, t);
    if (m !== "exalt" && m !== "chaos") continue;
    const members = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
    if (members.some((x) => side(x.modId) === fracSide)) continue;
    const q = g.odds.hit(otherSide, members);
    const together = q > 0 && fracP > 0 ? (loopCost(q) - base) / fracP : Infinity;
    // カオス: 固定 + 1 MOD のレア。外れの 1 つを外して、固定した系統を除いた両側から 1 つ付く
    let chaos: number | null = null, chaosKey: string | null = null, chaosN: number | null = null;
    for (const key of chaosGrades) {
      const px = chaosAfterFix(d, blank, key, frac[0]!, members);
      const pr = o.price(key);
      if (!(px > 0) || !(pr > 0)) continue;
      const cost = pr / px;
      if (chaos == null || cost < chaos) { chaos = cost; chaosKey = key; chaosN = 1 / px; }
    }
    out.push({ host: t.modId, together, chaos, chaosKey, chaosN, forced, best: forced || chaos == null || together <= chaos ? "together" : "chaos", detail: { p, q, share, one: base, two: q > 0 ? loopCost(q) : Infinity, augKey: g.aug } });
  }
  return out;
}
