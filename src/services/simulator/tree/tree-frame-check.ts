/**
 * tree-frame-check.ts — 最終チェックの木のチェック (S-201 ②、11-06 オーナー「全パターン通しで1回回してみてループするところないかとかのチェックを最終チェックにしたらいいんじゃね…何人とかじゃなくてツリーのチェックって名目で」)。
 * 打たずに配置の木 (tree-frame の代表の品と枝) を 1 回辿って、精査の人が通らなかった所も箱ごとに出す: 行き先の無い結果・代表の品で打てない手・完成の箱の代表が完成の条件に届かない。
 * 輪・完成に着かない道は精査の 2) (矢印を逆に辿る) がもう見ている。11-11 から最終チェックは人を回さずこれと精査の形の見方だけ (S-201 ②)。前の 30 人を残していた間の書き置き: 精査で確かめられない物 (行き先の無い結果・完成の条件) は合格を止めない知らせ (frameMiss・frameDone)
 */
import { mulberry32, type PatchData } from "../../craft-stage/engine";
import { frameOfDoc } from "./tree-frame";
import { handProblem, playHand } from "./tree-sample";
import { sureFracWhy, sureFracWhyText } from "./tree-sure-frac";
import type { TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";

export interface FrameIssue { boxId: string; kind: "frameMiss" | "cantUse" | "frameDone" | "frameMix"; text: string }

/**
 * 箱の代表の品に打てない手の理由 (エンジンが断る手。打てるなら null)。お告げが効かないだけ (打てば進む) は精査と同じく打てる扱い。
 * 開いた時の組み直しは保存の手を打てるか見ずに置き直すので、箱にも出す (S-107c、11-07 ブラック 54 の頼み 7: 手袋の木の左の道のプリズム)
 */
export function cantHandOf(data: PatchData, doc: TreeDoc, id: string): string | null {
  const b = doc.boxes[id], f = b?.hand ? frameOfDoc(data, doc).frames.get(id) : undefined;
  if (!b?.hand || !f || f.note) return null;
  const why = handProblem(data, f.item, b.hand);
  if (why && !playHand(data, f.item, { ...b.hand, repeat: null }, mulberry32(1)).applied) return why;
  // デイリーの確定フラクチャーが置けない品 (選んだ MOD が無い・冒涜で付いた) に残っている手 = 直す前に置いた木を開いた時 (S-43a)
  const sf = sureFracWhy(data, doc, f.item, b.hand);
  return sf ? sureFracWhyText(sf) : null;
}

const OUT_JA: Record<string, string> = { hit: "当たり", junk: "外れ", lost: "狙いが消えた", any: "打った後", junkGone: "外れが消えた" };
const OUT_EN: Record<string, string> = { hit: "hit", junk: "miss", lost: "target lost", any: "after", junkGone: "miss removed" };

export function frameIssues(data: PatchData, doc: TreeDoc): FrameIssue[] {
  const fr = frameOfDoc(data, doc), out: FrameIssue[] = [];
  const add = (x: FrameIssue): void => { if (!out.some((y) => y.boxId === x.boxId && y.kind === x.kind)) out.push(x); };
  for (const m of fr.miss) {
    // 当たるまでの手は外れでも同じ手を打ち直すので、当たり以外の行き先は要らない
    if (!doc.boxes[m.box] || doc.boxes[m.box]!.hand?.repeat) continue;
    const ja = OUT_JA[m.oc.out] ?? m.oc.out, en = OUT_EN[m.oc.out] ?? m.oc.out;
    add({ boxId: m.box, kind: "frameMiss", text: m.from
      ? tr(`↩ で着く人がこの手で「${ja}」になると行く箱が無い (回すとここで止まる)`, `Runs arriving by ↩ can end up "${en}" here with no box to go to (they stop here)`)
      : tr(`この手で「${ja}」になると行く箱が無い (回すとここで止まる)`, `This craft can end up "${en}" with no box to go to (runs stop here)`) });
  }
  // 代表のほかの形 (↩ で着く人・外れが狙いの系統を塞いでいる枝 = S-200 ② の (g)) で手が打てない・当たるまでが当たらない
  for (const c of fr.cant) {
    if (!doc.boxes[c.box]) continue;
    add({ boxId: c.box, kind: "cantUse", text: c.why === "noHit"
      ? tr("この形では当たるまで打っても当たらない (外れが狙いの系統を塞いでいる・狙いが ☑ 無しで付いているなど。回すとここで止まる)", "Repeating this craft never hits in this shape (a miss blocks the target's family, or the target is on without ☑; runs stop here)")
      : tr("この箱へ来る形の一部で手が打てない (外れが狙い・エッセンスの系統を塞いでいるなど。回すとここで止まる)", "Some shapes reaching this box can't use the craft (a miss blocks the target's or essence's family; runs stop here)") });
  }
  // 1 つの箱に中身 (枠) の違う形が着く = 結果を分けきれていない (S-27d (ア)、11-11 ごめんね 41 人)。合格は止めない知らせ
  for (const id of fr.mixed) if (doc.boxes[id]) add({ boxId: id, kind: "frameMix", text: tr("この箱に中身の違う形の人が着く (結果が 2 通り以上なのに箱が 1 つ。下の手が片方の形にしか合わないと止まる)", "Runs with different contents arrive at this box (two or more outcomes share one box; the next craft may fit only one of them)") });
  for (const b of Object.values(doc.boxes)) {
    const why = cantHandOf(data, doc, b.id);
    if (why) add({ boxId: b.id, kind: "cantUse", text: tr(`この箱の形では手が打てない: ${why}`, `The craft can't be used in this box's shape: ${why}`) });
  }
  return out;
}
