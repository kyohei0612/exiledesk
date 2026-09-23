/**
 * craft-steps.ts — 「1 手ずつ」のカードを組み立てる (2026-09-23)
 *
 * オーナー:「1 個 1 個確率出していこう、次へ みたいな。最終完成品はトータルコストの期待値で予算予想」。
 * 計算は [[spam-plan.ts]] の結果をそのまま使う。ここは並べ替えるだけ。
 *
 * - 1 手 = 何を打つか / 1 回で当たる確率 / 1 回の値段。外れ無しで進んだ時の道 (`path`)
 * - 外れた時の消去ややり直しの費用は 1 手には書かず、**段階の平均**に入れる
 *   (段階 = サフィが揃う / プレを高貴で足し終わる / 品質・エッセンスまで / 完成)
 */
import type { SpamPlan } from "../../services/htc/spam-plan";
import type { MissPlan, PathStep } from "../../services/htc/spam-total";
import { DEFAULT_ATTEMPTS } from "./craft-settings";

export interface StepCard {
  title: string;
  /** 何を打つか */
  action: string;
  /** 1 回で当たる確率。確定の手は 1 */
  odds: number;
  /** 1 回の値段 (高貴換算) */
  perTry: number;
  /** この手が当たるまでの支出の期待値 (外れの後始末・やり直し込み) */
  spend: number;
  /** 外れた時にすること (無ければ null) */
  onMiss: string | null;
  /** 外れた時のリカバリー (消去が何に当たるか・外れ 1 回の損)。高貴の手だけ */
  miss: MissPlan | null;
  /** 選べる打ち方 (高貴の手だけ。他は空) */
  options: PathStep["options"];
  /** 外れ 1 回の後始末に打つ物の値段 (挑戦回数の予算に使う)。確定の手は 0 */
  missCost: number;
  /** 挑戦回数の既定 (カオススパムは 1 回が安いので 95% に届く回数、他は 10 回) */
  defaultAttempts: number;
  /** この手が属する段階 (`SpamTotal.stages` の label)。段階の平均と予算内の確率を引く */
  stage: string | null;
}

export function craftSteps(
  plan: SpamPlan, name: (ids: readonly string[]) => string, money: (exalted: number) => string,
): StepCard[] {
  const out: StepCard[] = [];
  const stages = plan.total?.stages.map((s) => s.label) ?? [];
  const has = (l: string): string | null => stages.find((x) => x.startsWith(l)) ?? null;
  const suffixStage = has("サフィが揃う");
  if (plan.spam) {
    out.push({
      title: `カオススパムで ${name([plan.spam.modId])}`,
      action: plan.spam.currency, odds: plan.spam.odds, perTry: plan.spam.expected * plan.spam.odds, spend: plan.spam.expected,
      onMiss: "そのままもう 1 回 (外せる MOD 1 つを入れ替えるだけ。損はその 1 回の値段だけ)", miss: null, options: [], stage: suffixStage,
      missCost: 0, defaultAttempts: Math.ceil(Math.log(0.05) / Math.log(1 - plan.spam.odds)),
    });
  }
  if (plan.phase?.breachOnce) {
    out.push({
      title: "ブリーチのエッセンスで品質の上限を 40% に",
      action: "高貴 + 左側の高貴なお告げでプレにゴミ → ブリーチのエッセンス + 左側の結晶化のお告げ (ゴミだけ食わせる)",
      odds: 1, perTry: plan.phase.breachOnce, spend: plan.phase.breachOnce, onMiss: null, miss: null, options: [], stage: suffixStage,
      missCost: 0, defaultAttempts: 1,
    });
  }
  for (const p of plan.phase?.path ?? []) {
    out.push({
      title: `高貴で ${name(p.want)}${p.want.length > 1 ? " のどれか" : ""}`, action: p.action, odds: p.odds, perTry: p.perTry, spend: p.spend,
      onMiss: null, miss: p.miss, options: p.options, stage: suffixStage, missCost: p.miss?.cost ?? 0, defaultAttempts: DEFAULT_ATTEMPTS,
    });
  }
  const f = plan.finish;
  if (f && !f.reason) {
    for (const p of f.exalt?.path ?? []) {
      out.push({
        title: `プレに ${name(p.want)}${p.want.length > 1 ? " のどれか" : ""}`, action: p.action, odds: p.odds, perTry: p.perTry, spend: p.spend,
        onMiss: null, miss: p.miss, options: p.options, stage: has("プレを高貴で"), missCost: p.miss?.cost ?? 0, defaultAttempts: DEFAULT_ATTEMPTS,
      });
    }
    const fixedStage = has("品質・エッセンス") ?? has("完成");
    for (const st of f.steps) {
      out.push({
        title: st.modId ? `確定で ${name([st.modId])}` : st.label.split(" (")[0]!,
        action: st.label, odds: 1, perTry: st.cost, spend: st.cost, onMiss: null, miss: null, options: [], stage: fixedStage, missCost: 0, defaultAttempts: 1,
      });
    }
    if (f.desecrate) {
      const d = f.desecrate;
      out.push({
        title: `冒涜で ${name([d.modId])}`,
        action: `${d.bone} + 左手のネクロマンシーのお告げ${d.echoes ? " + 反響のお告げ (外れたら 1 回引き直し)" : ""} → 3 択から選ぶ`,
        odds: d.odds, perTry: d.perTry, spend: d.perTry / d.odds + d.light * (1 / d.odds - 1),
        onMiss: `消去のオーブ + 光のお告げで冒涜だけ消して引き直し (外れ 1 回の損 ${money(d.light)}。他の MOD は消えない)`, miss: null, options: [], stage: has("完成"), missCost: d.light, defaultAttempts: DEFAULT_ATTEMPTS,
      });
    }
  }
  return out;
}

/**
 * 挑戦回数を決めた時の見込み (オーナー 2026-09-23:「基本沼っても 10 回だから、10 回挑戦した際の確率と予算」)。
 * 消去で前の狙いが消えた時の戻り分は含まない (その時は前の手に戻る。平均の方には入っている)
 */
export function withinAttempts(card: StepCard, n: number): { p: number; budget: number; expected: number } {
  if (card.odds >= 1) return { p: 1, budget: card.perTry, expected: card.perTry };
  const miss = 1 - card.odds;
  const p = 1 - miss ** n;
  // 打つ回数の期待値 (当たったら止める、最大 n 回) と、そのうち外れの回数
  const tries = p / card.odds;
  return { p, budget: n * (card.perTry + card.missCost), expected: tries * card.perTry + (tries - p) * card.missCost };
}
