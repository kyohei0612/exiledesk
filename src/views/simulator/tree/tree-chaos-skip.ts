/**
 * tree-chaos-skip.ts — 「カオススパムまでスキップ」(S-22f、スイッチ chaosSkip。オーナー 11-15「ノーマル品から最初の手のみカオススパムまでスキップボタンが欲しいな」
 * 「手順は変性、増強、王者まで狙い無しで進行、消去打ったらサフィ１はずれの枠とプレ1ハズレの枠が出来るはず。そこの消去打つまで自動形成してあげたらクッソ楽」→ 消去の結果の箱で止める)。
 * スタートの箱 (ノーマル・MOD 無し・まだ手が無い) に、変成 → 増強 → 王者 を狙い無しで、その結果の箱に消去 (全部消えてよい) を置く。
 * 手の置き方は手の窓の決定と同じ applyPick (猿の口の place と同じ)。呼ぶ側が 1 つの edit で包む = 1 つ戻すで丸ごと戻る
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { stepOutcomes } from "../../../services/simulator/sim-engine";
import type { Hand, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { applyPick, holdLinks, kindOf, onlyOf } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";

/** 狙い無しの手 (消去は「残したい MOD」無し = 全部消えてよい、S-28f) */
const handOf = (currency: string): Hand => (currency === "annul"
  ? { currency, omens: [], catalyst: null, quality: 0, repeat: null, keep: [] }
  : { currency, omens: [], catalyst: null, quality: 0, repeat: null, free: true }) as Hand;
/** 置く順 (変成 → 増強 → 王者 → 消去) */
export const CHAOS_SKIP_STEPS = ["transmute", "augment", "regal", "annul"] as const;

/** この箱でボタンを出すか: スタートの箱・まだ手が無い・品がノーマルで MOD 無し・変成が打てる */
export function chaosSkipOk(data: PatchData | null, d: TreeDoc, id: string): boolean {
  const b = d.boxes[id];
  if (!flag("chaosSkip") || !data || !b || b.out !== "start" || b.hand) return false;
  const it = sampleOf(data, d, id, 1).item;
  if (it.rarity !== "normal" || it.prefixes.length + it.suffixes.length > 0) return false;
  return !!stepOutcomes(data, it, "transmute", [])?.some((o) => !o.void);
}

/** スタートから消去の結果の箱まで組む (呼ぶ側の edit の中で)。手の置けない箱 (もう手・↩・完成 / 失敗がある) は飛ばす */
export function chaosSkip(data: PatchData, x: TreeDoc, startId: string): void {
  let layer = [startId];
  for (const c of CHAOS_SKIP_STEPS) {
    const next: string[] = [];
    // 変成・増強・王者は右の箱から置く: 同じ中身の結果は後に置いた方 (左の箱の子) へまとまるので、組んだ道が左の列を縦に下りる (S-22f、11-16 オーナー「左から縦作っていって欲しい。斜めになる」)。
    // 消去は左の箱から置く: 消去の自動の続きが先に置いた箱の下に伸び、後の箱の結果はそこへ ↩ でまとまる = 未設定の箱も左の列に出る (11-16 オーナー「消去も左から打ってこれ？」)
    for (const id of c === "annul" ? layer : [...layer].reverse()) {
      const b = x.boxes[id];
      if (!b || b.hand || b.back || b.done) continue;
      const h = handOf(c);
      const at = holdLinks(() => applyPick(x, id, h, kindOf(h), [], null, onlyOf(data, x, id, h, null, [])));
      // 自動で組んだ手なので「人が手を置いた時刻」は残さない (要望の場面の「最後に置いた手」に数えない)
      delete x.boxes[id]?.touched;
      for (const o of x.boxes[at]?.outs ?? []) if (!next.includes(o)) next.push(o);
    }
    layer = next;
  }
}
