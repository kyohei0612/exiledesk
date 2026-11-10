/**
 * tree-aim-why.ts — 次に打つ手の窓の狙いの欄で、完成形の狙いのうち今その箱で付けられない物の訳 (11-08 オーナー「狙いMODは必ず表示で付けれないならグレーアウトで
 * ホバーしたら付けれない理由を箇条書きで」、AR0Mgff7)。付けられるかの答えは画面と同じ hitChoicesOf (呼ぶ側)。ここは付けられない物の訳だけを、
 * エンジンの答え (modListFor の付け方・同じ系統 / タグ・ルーン、limitOf の枠、MOD の段のレベル、heldOdds のお告げ無しの答え) と箱の見本から並べる。決まりは自前で持たない
 */
import { limitOf, modListFor, tierIndexOf, groupLabelOf, type PatchData, type StageItem } from "../../../services/craft-stage/engine";
import { aimHeldOn, reachableAims } from "../../../services/simulator/tree/tree-aim";
import { aimKey, type Aim, type Hand } from "../../../services/simulator/tree/tree-model";
import { engineOmens } from "../../../services/simulator/tree/tree-hands";
import { tr } from "../../../i18n/lang";

/** 狙いの欄のグレーの行 = 完成形の狙いのうち、付けられる候補 (choices、画面と同じ hitChoicesOf) に無い物と、その訳 */
export function lockedAimRows(data: PatchData | null | undefined, item: StageItem | null, goals: readonly Aim[], choices: readonly Aim[], hand: Hand | null, label: (a: Aim) => string): Array<{ key: string; label: string; why: string[] }> {
  if (!data || !item || !hand) return [];
  const h = { key: hand.currency, omens: engineOmens(hand) };
  // 候補に有るかは狙いの鍵で引くだけ (当たりの判定はしない。判定は呼ぶ側の hitChoicesOf = エンジン)
  const can = new Set(choices.map(aimKey));
  // もう品に付いている狙いは出さない (付けられないのではなく済んでいるだけ。11-10 オーナー「そもそもグレーアウトしてる狙いＭＯＤだけど別についてるからそこグレーアウトってか非表示でいいんじゃねついたＭＯＤじゃまやろ」。
  // 残すかは「残したい MOD」の欄 = TreeKeepList で選ぶ)
  return goals.filter((a) => !can.has(aimKey(a)) && !aimHeldOn(data, item, a, { sameText: true })).map((a) => ({ key: aimKey(a), label: label(a), why: aimWhyNot(data, item, a, h) }));
}

/** その狙いが今付けられない訳 (箇条書きの行)。付けられる物・もう付いている物には呼ばない (lockedAimRows が外す)。どの訳にも当たらなければ「この手では付かない」1 行 */
export function aimWhyNot(data: PatchData, item: StageItem, a: Aim, hand: { key: string; omens: readonly string[] }): string[] {
  const out: string[] = [];
  // エンジンの MOD の表から、その狙いの MOD の行を名前で引く (束ねた行は段ごとの MOD の名前も)
  const rows = new Map(modListFor(data, item).flatMap((r) => [r.id, ...r.tiers.flatMap((x) => (x.modId ? [x.modId] : []))].map((id) => [id, r] as const)));
  const row = rows.get(a.modId);
  if (row) {
    // 付け方 (エッセンス・合金・冒涜・異界・創生の樹など) はカレンシーの手では付かない
    if (row.group !== "normal" && row.group !== "rune") out.push(tr(`${groupLabelOf(row.group, item)}の MOD (この手では付かない)`, `${groupLabelOf(row.group, item)} mod (this craft can't add it)`));
    if (row.group === "rune" && !row.socketed) out.push(tr(`ルーン「${row.runeJa ?? ""}」が刺さっていない`, `Rune "${row.runeJa ?? ""}" is not socketed`));
    if (row.blocked) out.push(row.blockedBy === "tag" ? tr("付いている MOD が止めている", "A mod on the item prevents it") : tr("同じ系統の MOD が付いている", "A mod from the same group is on the item"));
    const n = (row.side === "prefix" ? item.prefixes : item.suffixes).length, max = limitOf(item, row.side);
    if (n >= max) out.push(row.side === "prefix" ? tr(`プレフィックスの枠が埋まっている (${n}/${max})`, `Prefix slots are full (${n}/${max})`) : tr(`サフィックスの枠が埋まっている (${n}/${max})`, `Suffix slots are full (${n}/${max})`));
  }
  // 狙いの段以上で一番低い MOD レベル (段の添字は大きいほど上の段)
  const mod = data.mods.get(a.modId), lo = tierIndexOf(data, a.modId, a.tier);
  const need = mod ? Math.min(...mod.tiers.filter((_, i) => i >= lo).map((x) => x.ilvl)) : 0;
  if (Number.isFinite(need) && need > item.itemLevel) out.push(tr(`アイテムレベルが足りない (T${a.tier} 以上は Lv ${need} から、今は ${item.itemLevel})`, `Item level too low (T${a.tier}+ needs ${need}, now ${item.itemLevel})`));
  // お告げを外せば付く = お告げで側が決まっていて、この MOD の側には付かない
  if (!out.length && hand.omens.length && reachableAims(data, [item], hand.key, [], [a], { sameText: true })?.length) out.push(tr("掛けたお告げで、この MOD の側には付かない", "The chosen omen keeps this mod's side from rolling"));
  return out.length ? out : [tr("この手では付かない", "This craft can't add it")];
}
