/**
 * use-sim-calc.ts — ③ ベースの値段の「白から作る」「MOD 付きレアを買う」「グレーターの道」の費用 (calc) と、反対側の狙いの取り方 (keep)。
 * use-sim-run.ts から分けた (2026-10-20、500 行の決まり)
 */
import { computed } from "vue";
import { craftStage, nameOf, priceOf } from "../../state/craft-stage";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import { effectiveCls } from "../../services/craft-stage/stage-core";
import { withRunes } from "../../vendor/poe2htc/engine/runes";
import { modTierWeight } from "../../vendor/poe2htc/engine/pool";
import { runeEnForId } from "../../services/simulator/pattern";
import { greaterRouteCost, type GreaterRoute } from "../../services/simulator/sim-greater";
import { keepCompare } from "../../services/simulator/keep-compare";
import type { SimTargetIn } from "../../services/simulator/quiz-build";
import type { SimTargetsCtx } from "./use-sim-targets";

/** フラクチャーの反対側の狙い 1 つの取り方 (白から自作は安い方、買う始め方はカオス) */
export interface KeepPlan { host: string; together: number; chaos: number; chaosKey: string | null; chaosN: number | null; use: "together" | "chaos"; detail: { p: number; q: number; share: number; augKey: string } }

export function useSimCalc(d0: SimTargetsCtx, simIn: () => SimTargetIn[]) {
  const { fracMembers, fractureRow, wholeRoute, whiteDivine, fourDivine, num } = d0;
  const s = craftStage;
  /**
   * 計算の費用 (2026-10-05 オーナー「3 個買って 1 個成功品と仮定して、最低完全変成 3、次の完全増強、消去はセットで使う、フラクチャー 3 つは
   * 絶対にいる。深淵エッセンスは 3 個、ネクロマンシー、結晶化、骨それぞれ 3 回、確率的に計算してくれ。平均コスト 1 個作るコスト分かれば 3 倍」
   * 「完全やね消去 2 つ使うのは」)。
   *   1 回分 = 白 + 完全の変成 + (完全の増強 + 消去 × 2) × リロールの回数 + 王者 (無印) + 高貴 × (1 − p) + 骨 (壁) + フラクチャー
   *   リロールの回数 = 1 ÷ (完全の増強 1 回で狙いが付く確率)。確率はその側の普通の置き場の重み (下限 = 完全の増強の段の下限)
   *   1 個 = 1 回分 × 3 (骨の壁でフラクチャーが 1/3) + 固定できた後の消去 × 2 (2026-10-05 オーナー「消去 2 は必ずいるよ、完成後」)
   * お告げの側は、壁を置く側 = 狙いの反対側
   */
  const calc = computed(() => {
    const d = s.data.value, it = s.item.value, f = fractureRow.value;
    // 白から全部 ⑤ で答える時 (増強スパムの狙いがある) は式で出さない (費用は ⑤ の答えで決まる。2026-10-21)
    if (!d || !it || !f || wholeRoute.value) return null;
    const m = d.mods.get(f.modId);
    if (!m) return null;
    /**
     * 変成・増強の等級は完全 (オーナー「最低完全変成、次の完全増強」)。完全の段の下限で狙いの段が出ない時 (兜のライフ T2 以上など) は
     * 上級 → 無印に落とす (2026-10-05、前は 0% と「—」で止まって見えた)
     */
    /**
     * その MOD の、下限 floor 以上・アイテムレベル以下・minIdx の段以上の重み。エンジンと同じ modTierWeight (下限に届く段が無い MOD も一番上の段は残る。
     * 前は丸ごと外していて、靴の増強で移動スピードが 30% と出た。エンジンは 18%。2026-10-20)
     */
    const wAt = (id: string, minIdx: number, floor: number): number => {
      const x = d.mods.get(id);
      return x ? modTierWeight(x, floor, s.itemLevel.value, minIdx) : 0;
    };
    // 置き場は狙いのルーンを差した物 (ウートレッドの時間術などルーンの MOD を狙う時、ルーンで増える MOD も割る方に入れる。前は差していない置き場で割り、
    // 靴の移動スピードが増強 1 回で 75% と出ていた。2026-10-20 見本の靴。2 の付きやすさ shareOf と同じ)
    const runeIds = [...new Set(s.simTargets.value.flatMap((t) => [t, ...(t.alts ?? [])]).map((t) => d.mods.get(t.modId)?.rune).filter((r): r is string => !!r))];
    const pools = (runeIds.length ? withRunes(effectiveCls(it), runeIds) : it.cls).pools.normal;
    // 同じ MOD は 1 回だけ (エミュレーターから来たルーン差し済みのアイテムに、もう一度ルーンの置き場を足すと 2 重になる)
    const totalAt = (k: "prefixes" | "suffixes", floor: number): number => [...new Set(pools[k])].reduce((a, id) => a + wAt(id, 0, floor), 0);
    const pAt = (floor: number) => {
      const w = (id: string, minIdx: number): number => wAt(id, minIdx, floor);
      // 候補ごとに自分の側の重みで割る (候補は両側でも良い)
      const totalOf = (k: "prefixes" | "suffixes"): number => totalAt(k, floor);
      const each = fracMembers.value.map((r) => {
        const total = totalOf(d.mods.get(r.modId)?.type === "suffix" ? "suffixes" : "prefixes");
        return { modId: r.modId, name: `${r.text} (${r.rank} 以上)`, p: total > 0 ? w(r.modId, r.minTierIndex) / total : 0 };
      });
      return { each, pHit: Math.min(1, each.reduce((a, x) => a + x.p, 0)) };
    };
    const grades = [
      { g: "perfect", floor: CURRENCY_FLOOR.augment.perfect, aug: "augment_perfect", tra: "transmute_perfect", ja: "完全" },
      { g: "greater", floor: CURRENCY_FLOOR.augment.greater, aug: "augment_greater", tra: "transmute_greater", ja: "上級" },
      { g: "base", floor: CURRENCY_FLOOR.augment.base, aug: "augment", tra: "transmute", ja: "無印" },
    ] as const;
    const gr = grades.find((x) => pAt(x.floor).pHit > 0) ?? grades[0];
    // 狙いのルーン (ルーンの MOD をフラクチャーで狙う時は、作り直すたびに白へ差す。2026-10-20 見本の靴: ウートレッドの代金が入っていなかった)
    const fracRunes = [...new Set(fracMembers.value.map((r) => d.mods.get(r.modId)?.rune).filter((r): r is string => !!r))].map((id) => runeEnForId(id)).filter((r): r is string => !!r);
    const runeLines = fracRunes.map((en) => ({ name: nameOf(`rune:${en}`), n: 1, each: priceOf(`rune:${en}`) }));
    // 候補ごとの付きやすさと合計 (どれか 1 つで良い)
    const { each, pHit } = pAt(gr.floor);
    const abyss = `essence:perfect:${it.cls.id}/PerfectEssence_EssenceAbyss`;
    const rerolls = pHit > 0 ? 1 / pHit : Infinity;
    const white = num(whiteDivine.value) ?? 0;
    // buy = 4 MOD のベースを買っても要る物 (壁とフラクチャー)
    // 1 から (自前): 壁は王者の後に骨 1 本だけ (側を選ばないのでお告げも深淵のエッセンスも要らない)。増強のリロールで狙いの 1 つだけ
    // になった時 (最初の増強で付かなかった時、確率 1 − p) は、王者で 2 つにしかならないので高貴で 3 つにしてから骨
    // (2026-10-05 オーナー「1 からの場合骨壁は単純で王者後は骨 1 個でいい、選ぶ必要ない」「増強リロールで 1 個だけ付いたら王者すると 1 個足りないから高貴打って 3 つに」)
    const lines: Array<{ name: string; n: number; each: number }> = [
      { name: "白のベース", n: 1, each: white },
      ...runeLines,
      { name: nameOf(gr.tra), n: 1, each: priceOf(gr.tra) },
      { name: `${nameOf(gr.aug)} (リロール)`, n: rerolls, each: priceOf(gr.aug) },
      { name: `${nameOf("annul")} (リロールに 2 つ)`, n: rerolls * 2, each: priceOf("annul") },
      // マジック → レアにする王者 (等級は問わないので無印。2026-10-05 オーナー「適当な王者がいるのか、レア化に。チャレンジ品作る時だから 3 個か」)
      { name: nameOf("regal"), n: 1, each: priceOf("regal") },
      { name: `${nameOf("exalt")} (リロールで 1 つだけの時)`, n: Math.max(0, 1 - pHit), each: priceOf("exalt") },
      { name: `${nameOf("desecrate")} (壁)`, n: 1, each: priceOf("desecrate") },
      { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
    ];
    const once = lines.reduce((a, l) => a + l.n * l.each, 0);
    /** 固定できた後に 1 度だけ: 消去 × 2 (固定した物と骨の壁のほかの外れ 2 つ) */
    const after = 2 * priceOf("annul");
    /**
     * 4 MOD・当たり 1 のベースを買う時の 1 回分 = ベース代 + フラクチャー。× 3 (2026-10-21 オーナー「4MOD の方はフラクチャー 3 とベース代 3 で計算」。
     * 前は壁 (深淵のエッセンス・結晶化・骨・ネクロマンシー) と固定後の消去 × 2 も足していた)
     */
    const buyLines: Array<{ name: string; n: number; each: number }> = [
      { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
    ];
    const buyRest = buyLines.reduce((a, l) => a + l.n * l.each, 0);
    const breakEven = once - buyRest;
    const fourN = num(fourDivine.value);
    const fourB = fourN;
    const buyOnce = fourB != null ? fourB + buyRest : null;
    /** 4 MOD を買う道の 1 個 (フラクチャー済みになるまで) = (ベース代 + フラクチャー) × 3 */
    const fourTotal = buyOnce != null ? buyOnce * 3 : null;
    // 適当なレアを消去で 1 MOD → カオスの道は 2026-10-21 に外した (オーナー「誤差やろもはや消してくれ」。白からは増強スパムの道だけ)
    const g = greaterRouteCost({ data: d, targets: simIn(), fracSide: m.type === "suffix" ? "suffix" : "prefix", p: pHit, grade: gr, wAt, totalAt, white, runeLines, price: priceOf, name: nameOf });
    if (g) {
      // グレーターエッセンスを巻き込む道: 自前のフラクチャーだけ (買う始め方・適当なレアの道は無し)。固定の後に消さない (残す MOD を持ったまま進む)
      return { pHit, each, rerolls: g.augment, lines: g.lines, buyLines, once: g.once, after: 0, total: g.once * 3, noAbyss: false, cantRoll: pHit === 0 || g.cantKeep, grade: gr.ja, buyRest, breakEven: 0, buyOnce: null, fourTotal: null as number | null,
        greater: g, keep: null as KeepPlan | null, augKey: gr.aug };
    }
    /**
     * フラクチャーの反対側の狙い (1 つ) をどう取るか (keep-compare.ts、2026-10-20 オーナー「白から自作の費用に入れて、買う始め方と並べて一番安い始め方」)。
     * 白から自作 = 「マジックで一緒に揃える」と「固定してから 2 MOD のレアにカオス」の安い方、買う始め方 = 固定してからカオス。
     * 反対側の狙いが複数ある時は、揃えると一番得になる 1 つ (マジックの枠は 1 つ)
     */
    const kc = keepCompare({ data: d, item: it, itemLevel: s.itemLevel.value, targets: simIn(), price: priceOf }).filter((x) => x.chaos != null && Number.isFinite(x.together));
    const kBest = kc.length ? kc.reduce((a, x) => (x.chaos! - x.together > a.chaos! - a.together ? x : a)) : null;
    const keep = kBest ? { host: kBest.host, together: kBest.together, chaos: kBest.chaos!, chaosKey: kBest.chaosKey, chaosN: kBest.chaosN, use: kBest.together < kBest.chaos! ? "together" as const : "chaos" as const, detail: kBest.detail } : null;
    return { pHit, each, rerolls, lines, buyLines, once, after, total: once * 3 + after, noAbyss: !(priceOf(abyss) > 0), cantRoll: pHit === 0, grade: gr.ja, buyRest, breakEven, buyOnce, fourTotal,
      greater: null as GreaterRoute | null, keep, augKey: gr.aug };
  });
  return { calc };
}
