/**
 * tree-start-choice.ts — ツリーへ行く時の始め方 (TreeStartAsk の中身、PC とスマホで共用。10-26 夜オーナー「OK それで作って」の最終形):
 * フラクチャーから = 1 つの MOD に ✦ (ほかの印は外す) + (a) フラクチャー済みから (fractured) / (b) 白から確定フラクチャーのコース + 費用 (four、木の始まりと費用は前の作り)。
 * 白ベースから = 印を全部外す (フラクチャー無し)。1 回の編集 (1 つ戻すで戻せる)
 */
import { aimKey, migrateStart, multiFracWhite, startRarity, type Aim, type StartFrom, type TreeDoc } from "../../../services/simulator/tree/tree-model";

/** 窓の形: marked = 印のある狙い (② で ✦ を付けた・貼り付け / エミュから ✦ 付きで来た) があれば MOD 選びを飛ばして (a) / (b) だけ (パターン 2・3)。無ければ MOD 選び + 白ベース (パターン 1) */
export const markedGoal = (goals: readonly Aim[]): Aim | null => goals.find((a) => a.fractured) ?? null;

/** 決める: key = ✦ にする狙い (aimKey。複数可 = スイッチ fracMulti、null・空 = 白ベースから)、from = (a) / (b) */
export function applyStartChoice(d: TreeDoc, key: string | readonly string[] | null, from: StartFrom): void {
  const list: Aim[] = d.memoAims ?? [], keys = key == null ? [] : typeof key === "string" ? [key] : key;
  for (const a of list) { if (keys.includes(aimKey(a))) a.fractured = true; else delete a.fractured; }
  d.memoAims = list;
  migrateStart(d);
  // ✦ が 2 つ以上の窓は選んでいない (白ベースからだけ) ので、自動の印は残す (✦ が 1 つに戻ったらフラクチャー済みからへ、スイッチ fracOne)
  if (keys.length && !multiFracWhite(d)) { d.start!.from = from; delete d.start!.autoWhite; }
  d.start!.mods = d.start!.mods.filter((m) => !list.some((a) => a.fractured && a.modId === m.modId));
  d.start!.rarity = startRarity(d);
}
