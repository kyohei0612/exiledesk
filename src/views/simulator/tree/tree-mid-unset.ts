/**
 * tree-mid-unset.ts — 木の途中の未設定 (S-107d: 要確認の印の箱が手を持つ = 下が組めているのに印) の見分けと文 (U-05f、文と色はデザイン部長 8 の渡し 11-14)。
 * 途中の未設定は赤い「未設定 n つ」に数えず、100 人回すも止めない (無視して回せる)。印は琥珀の「?」、開いた時に 1 枚で要望へ誘う。スイッチ actLog の間だけ
 */
import type { CheckIssue } from "../../../services/simulator/tree/tree-check";
import type { TreeBox } from "../../../services/simulator/tree/tree-model";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";
import { orphanText } from "./use-tree-check";

/** 箱の「!」の文が要確認だけで、箱が手を持つ = 途中の未設定 (箱は issueOf の文しか知らないので文で見る) */
export const isMidMark = (b: TreeBox, issue: string | null | undefined): boolean =>
  flag("actLog") && !!b.hand && !!issue && issue.split(" / ").every((x) => x === orphanText());
/** 途中の未設定の箱の id の集まり (一覧・下の札の数え分け) */
export const midIdsOf = (mid: readonly CheckIssue[]): ReadonlySet<string> => new Set(flag("actLog") ? mid.map((x) => x.boxId) : []);

export const midMarkTitle = (): string => tr("途中の未設定 (サイトの不具合)。直さなくても 100 人回せます", "Unset in the middle of the tree (a site bug). You can still run 100 players");
export const midCardHead = (n: number): string => tr(`木の途中に未設定が ${n} つ出ています (サイトの不具合)`, `${n} unset ${n === 1 ? "box" : "boxes"} appeared in the middle of the tree (a site bug)`);
export const midCardSub = (): string => tr("直さなくても 100 人回せます。木を触る前に、このまま送ってもらえると原因を直せます", "You can still run 100 players. Send it as-is before changing the tree and we can fix the cause");
export const midSendAsIs = (): string => tr("このまま送る", "Send as-is");
export const midWhere = (): string => tr("どこ？", "Where?");
export const midChip = (n: number): string => tr(`途中の未設定 ${n} つ`, `${n} unset mid-tree`);
export const midListHead = (n: number): string => tr(`途中の未設定 ${n} つ (サイトの不具合)`, `${n} unset mid-tree (a site bug)`);
export const midListWhat = (): string => tr("手が決まっていて下も組めているのに印が出た箱です。直さなくても 100 人回せます。行を押すとその箱へ移ります", "These boxes already have a hand and the tree continues below, but got a mark. You can still run 100 players. Click a row to jump to it");
/** 行の 2 行目 (訳と消し方。前の版の決めが今の木で行き場を失った物、S-107d) */
export const midRowWhy = (): string => tr("前の版の印が、今の木で行き場を失ってこの箱に付いた。この箱の手を置き直すと消えます", "A mark from an older version lost its place in the current tree and landed here. Re-placing this box's hand clears it");
export const midListFoot = (): string => tr("サイトの不具合です。直す前にこのまま送ってください (木と開いた時の形が付きます)", "This is a site bug. Please send it as-is before fixing (the tree and how it opened are attached)");
export const midBugNote = (): string => tr("木と開いた時の形は一緒に届きます。何をしたら出たか (いつ作ったレシピか) を書いて送ってください", "The tree and how it opened are sent along. Write what you did (when the recipe was made) and send");
