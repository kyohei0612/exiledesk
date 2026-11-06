/**
 * tree-frame-check.ts — 最終チェックの木のチェック (S-201 ②、11-06 オーナー「全パターン通しで1回回してみてループするところないかとかのチェックを最終チェックにしたらいいんじゃね…何人とかじゃなくてツリーのチェックって名目で」)。
 * 打たずに配置の木 (tree-frame の代表の品と枝) を 1 回辿って、精査の人が通らなかった所も箱ごとに出す: 行き先の無い結果・代表の品で打てない手・完成の箱の代表が完成の条件に届かない。
 * 輪・完成に着かない道は精査の 2) (矢印を逆に辿る) がもう見ている。精査の 30 人を残す間 (S-201 の (f) はオーナーの答え待ち) は、精査で確かめられない物 (行き先の無い結果・完成の条件) は合格を止めない知らせ (frameMiss・frameDone)
 */
import { mulberry32, type PatchData } from "../../craft-stage/engine";
import { frameOfDoc } from "./tree-frame";
import { handProblem, playHand } from "./tree-sample";
import { qualityOk } from "./tree-unbounded";
import type { TreeDoc } from "./tree-model";
import { tr } from "../../../i18n/lang";

export interface FrameIssue { boxId: string; kind: "frameMiss" | "cantUse" | "frameDone"; text: string }

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
  for (const b of Object.values(doc.boxes)) {
    const f = fr.frames.get(b.id);
    if (!f || f.note) continue;
    // お告げが効かないだけ (打てば進む) は精査と同じく止まりにしない
    const why = b.hand ? handProblem(data, f.item, b.hand) : null;
    if (why && b.hand && !playHand(data, f.item, { ...b.hand, repeat: null }, mulberry32(1)).applied) add({ boxId: b.id, kind: "cantUse", text: tr(`この箱の形では手が打てない: ${why}`, `The craft can't be used in this box's shape: ${why}`) });
    // 代表のカタリストは 1 個 +1% (S-200 ③) なので、品質の値では比べず、品質の無い形で完成の条件に品質がある時だけ
    if (b.done === "main" && !(f.item.quality ?? 0) && !(f.item.catalystQuality ?? 0) && !qualityOk(doc, f.item)) add({ boxId: b.id, kind: "frameDone", text: tr("この箱の形には品質が無く、完成の条件 (品質) に届かない", "This box's shape has no quality, so it can't meet the done condition (quality)") });
  }
  return out;
}
