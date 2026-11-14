/**
 * tree-sure-frac.ts — デイリーの木だけの確定フラクチャー (D-03、11-09 オーナー「フラクチャーの際は確定でそのMODが付与され、ハズレは33％とする（3つに1回成功として費用はカウント）」→「おけ両方それでいい」)。
 * お題の木の印 (`TreeStart.sureFrac`、デイリーの fillTopicDoc が付ける) があり「ベースから」(start.from four) の時だけ、フラクチャーの手は
 * エンジンの起こりうる結果 (stepOutcomes) のうち ✦ の印の MOD が固定された物だけを残す (外れの枝なし)。費用はその手を FRACTURE_POOL (3) 回分。
 * エンジンは変えない。印の無いシミュの木は今のまま (S-43 は 11-05 に撤回、11-05 オーナー「ツリーに勝手に足しやがって2度とすんなまじで」)
 */
import { aimHits, allMods, type PatchData, type StageApply, type StageItem } from "../../craft-stage/engine";
import { aimTargetOf } from "./tree-ele-any";
import { stepOutcomes } from "../sim-engine";
import { FRACTURE_POOL } from "../sim-odds";
import { newlyFractured } from "./tree-frac-pick";
import { effectOf, engineOmens } from "./tree-hands";
import { fractureMarks, startsFractured, type Hand, type TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";
import { tr } from "../../../i18n/lang";

/** この木のこの手が確定フラクチャーか (デイリーの印・ベースから・フラクチャーの手・✦ の印がある) */
export const sureFracOn = (doc: TreeDoc, h: Hand | null | undefined): boolean =>
  !!h && !!doc.start?.sureFrac && effectOf(h.currency) === "fracture" && !startsFractured(doc) && fractureMarks(doc).length > 0;

/**
 * 確定フラクチャーの結果: エンジンの結果のうち ✦ の印の MOD が新しく固定された物 (一番起こりやすい物)。
 * 印の MOD が固定される結果が無い (打てない・印の MOD がまだ付いていない) 時は null = 呼ぶ側はいつもどおり打つ
 */
export function sureFracture(data: PatchData, doc: TreeDoc, item: StageItem, h: Hand): StageApply | null {
  const marks = fractureMarks(doc);
  const hits = (stepOutcomes(data, item, h.currency, engineOmens(h)) ?? []).filter((o) => {
    if (o.void) return false;
    const m = newlyFractured(item, o.item);
    return !!m && marks.some((a) => aimHits(m, aimTargetOf(data, a), { data, sameText: true }));
  });
  if (!hits.length) return null;
  const best = hits.reduce((x, y) => (y.p > x.p ? y : x));
  return { applied: true, item: best.item, added: [], removed: [] };
}

/**
 * 確定フラクチャーなのに、この品には ✦ の印の MOD が固定されえない (まだ付いていない・未発現の行だけ・冒涜で付いた = E-41) か。
 * true なら「選んだ MOD が固定された」の箱を作らず、手の窓で断る (S-43a、スイッチ treeSureFracNeedMod。
 * 要望 f38701c1: 未発現の付いた品にフラクチャーを置くと、付いていない選んだ MOD が固定された題の箱が出た)。
 * フラクチャーそのものが打てない品 (MOD が 4 つ無い等) はエンジンの断りに任せる = false
 */
export const sureFracMissing = (data: PatchData, doc: TreeDoc, item: StageItem, h: Hand | null | undefined): boolean =>
  flag("treeSureFracNeedMod") && sureFracOn(doc, h) && !!stepOutcomes(data, item, h!.currency, engineOmens(h!))?.some((o) => !o.void) && !sureFracture(data, doc, item, h!);

/**
 * 確定フラクチャーが置けない訳 (sureFracMissing の時だけ): "desecrated" = ✦ の MOD が冒涜で付いた物として品にある (E-41 で固定されない)、
 * "none" = ✦ の MOD が品に無い (未発現の行だけの時も)。置ける時は null。手の窓はこの訳ごとの短い文をポップアップで出す
 */
export function sureFracWhy(data: PatchData, doc: TreeDoc, item: StageItem, h: Hand | null | undefined): "desecrated" | "none" | null {
  if (!sureFracMissing(data, doc, item, h)) return null;
  const marks = fractureMarks(doc);
  const des = allMods(item).some((m) => !m.unrevealed && !!m.desecrated && marks.some((a) => aimHits(m, aimTargetOf(data, a), { data, sameText: true })));
  return des ? "desecrated" : "none";
}

/** 置けない訳の字 (ポップアップ・手の窓の一言・開いた木の箱の「打てない手」の印で同じ 1 つ) */
export const sureFracWhyText = (why: "desecrated" | "none"): string =>
  why === "desecrated" ? tr("冒涜で付いた MOD にはフラクチャーを打てません。", "Desecrated mods can't be fractured.") : tr("フラクチャー予定の MOD がまだ付いていません。", "The mod you chose to fracture isn't on this item yet.");

/** 確定フラクチャーで使う物: カレンシーとお告げを FRACTURE_POOL 回分 (3 回に 1 回成功 = 33%、文は tree-names の sureFracText と同じ数) */
export function useSureFrac(h: Hand, use: (key: string, n: number) => void): void {
  use(h.currency, FRACTURE_POOL);
  for (const o of engineOmens(h)) use(o, FRACTURE_POOL);
}
