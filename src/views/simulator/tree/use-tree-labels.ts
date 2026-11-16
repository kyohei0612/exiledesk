/**
 * use-tree-labels.ts — 当たりの札・狙いの MOD の文・始まりの MOD の文 (use-tree.ts が 500 行を超えたので分けた、11-16 整理 ③)。
 * 行は木のベースの MOD 一覧 (use-tree の rows) から引く。呼ぶ所は useTree() の aimLabel・aimShort・boxAimLabel・startModLabel
 */
import { tierRankLabel } from "../../../services/craft-stage/engine";
import type { Aim, StartMod } from "../../../services/simulator/tree/tree-model";
import { eleAnyText } from "../../../services/simulator/tree/tree-ele-any";
import { tr } from "../../../i18n/lang";
import type { ModRow } from "./use-tree";

/** rowOfMod = MOD の id → 木のベースの MOD 一覧の行、tiersOf = その行のうちその MOD の段 (まとめ行は段ごとに modId がある。比べは use-tree に 1 つ) */
export function makeAimLabels(rowOfMod: (modId: string) => ModRow | undefined, tiersOf: (r: ModRow, modId: string) => ModRow["tiers"]) {
  /** 当たりの札の文 (「T2 以上」+ MOD の文。箱の幅で切れても段が見えるよう段が先) */
  function aimLabel(a: Aim | null): string {
    if (!a) return "";
    const r = rowOfMod(a.modId);
    const side = r ? (r.side === "prefix" ? tr("プレ", "Prefix") : tr("サフィ", "Suffix")) : "";
    return `${tierRankLabel(a.tier)} ${side} ${aimText(a)}`;
  }
  /** 段の文の数値 ((a-b) か 1 つの数) */
  const NUM = /\((-?[\d.]+)-(-?[\d.]+)\)|(-?\d+(?:\.\d+)?)/g;
  /**
   * 狙いの MOD の文を段の幅で (「最大ライフ #」でなく「最大ライフ (85-119)」= 狙いの段の下限〜一番上の段の上限。狙いは「その段以上」、10-25 オーナー「おすすめの2つで進めて」)。
   * 文は MOD の一覧の段の文 (ListTier.text) から。数値の並びが段どうしで合わない時は狙いの段の文のまま
   */
  function aimText(a: Aim): string { return a.anyEle ? eleAnyText(aimText0(a), a.anyEle) : aimText0(a); } function aimText0(a: Aim): string { // いずれかの元素耐性は元素の語を替える (S-10h ③)
    const r = rowOfMod(a.modId);
    if (!r) return NOT_ON_BASE();
    const ts = tiersOf(r, a.modId);
    const at = ts[a.tier - 1], top = ts[0];
    if (!at || !top) return r.template;
    const hi = [...top.text.matchAll(NUM)].map((m) => m[2] ?? m[3]!);
    const n = [...at.text.matchAll(NUM)].length;
    if (a.tier === 1 || hi.length !== n) return at.text;
    let i = 0;
    return at.text.replace(NUM, (_m, lo: string | undefined, _h: string | undefined, one: string | undefined) => {
      const low = lo ?? one!, high = hi[i++]!;
      return low === high ? low : `(${low}-${high})`;
    });
  }
  /** 木のベースの MOD 一覧に無い MOD (前のベースの狙いが残った等) の文。MOD の id はそのまま出さない (10-24 デザイン部長の気づき) */
  const NOT_ON_BASE = (): string => tr("(このベースに無い MOD)", "(mod not on this base)");
  /** 狙いの MOD の短い名前 (戻り先の札で、どの狙いの所の箱かを添える) */
  const aimShort = (a: Aim): string => aimText(a);
  /** 当たりの箱の名前 (「どれか」の箱 = 同じ側の狙いの一覧、anyOf。10-26) */
  const boxAimLabel = (b: { aim: Aim | null; anyOf?: Aim[] }): string => (b.anyOf && b.anyOf.length > 1 ? tr(`どれか: ${b.anyOf.map(aimShort).join("・")}`, `Any of: ${b.anyOf.map(aimShort).join(", ")}`) : aimLabel(b.aim));
  /** 始まりの MOD の文 (その段の数値で埋めた文 + 段)。atLeast = 完成の狙い (✦ の印など) で段を「T2 以上」と言う (10-24 オーナー「T2 を選んだら T2 以上」) */
  function startModLabel(a: Aim | StartMod | null, atLeast = false): string {
    if (!a) return "";
    const r = rowOfMod(a.modId);
    // まとめ行 (同じ系統の別の MOD) は段ごとに modId がある。その MOD の段だけで数える
    const t = r ? tiersOf(r, a.modId)[a.tier - 1] : undefined;
    return `${atLeast ? tierRankLabel(a.tier) : `T${a.tier}`} ${t?.text ?? r?.text ?? NOT_ON_BASE()}`;
  }
  return { aimLabel, aimShort, boxAimLabel, startModLabel };
}
