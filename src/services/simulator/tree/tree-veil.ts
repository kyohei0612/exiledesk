/**
 * tree-veil.ts — 骨 (冒涜) の手の発現の分け方 (10-27 夜オーナー、スイッチ boneLater)。
 * ゲームどおり未発現のまま次の手を打てる (veil keep)。発現させる時 (骨の手の「発現させる」☑ = veil pick、後から打つ発現の手 REVEAL_KEY) は、
 * 発現で出うる MOD から ☑ の物が出て選べたら当たり、出なければ外れ。発現の 3 つの出方・アビスの反響はエンジンの revealOffers / reveal:N のまま (tree-sample の revealBy)。
 * ☑ の MOD が完成の狙いに無い物 (置き石。例: 全耐性の前に冷気耐性で系統を埋める) は、その手の時だけ当たりで、以降は冒涜の外れ MOD (aimsOf で数えない)。
 * スイッチ keepOutside の下は付いている間その MOD として箱の中身に持つ (S-33、placedAims。完成の狙いには入らないので aimsOf では今のまま数えない)
 */
import { aimHits, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { isInfiniteEssence } from "../../craft-stage/apply-essence";
import { effectOf, isBone } from "./tree-hands";
import type { Aim, Hand, TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

/** 後から打つ発現の手のキー (エンジンの発現は reveal:N。どれを選ぶかは tree-sample の revealBy が ☑ で決める) */
export const REVEAL_KEY = "reveal";
/** 後から打つ発現の手か */
export const isRevealHand = (key: string | undefined): boolean => key === REVEAL_KEY;
/**
 * 骨の手の発現の読み方 (S-59、スイッチ oldBone)。前の版の骨の手 (veil の無い物 = 打ったら発現まで進む) は、☑ (当たりの札) が無ければ「未発現のまま」(keep。
 * 10-31 朝オーナー決め 4「A 今は違うけど古いやつどーするって話なら」)。☑ のある前の手は開いた時の組み直し (tree-rebuild の oldVeil) が「発現させる」(pick) を付ける
 * (10-30 オーナー「59は修正で」)。閉じている間は veil のまま (無ければ前の分け方)
 */
const veilOf = (h: Pick<Hand, "currency" | "veil">): Hand["veil"] => h.veil ?? (flag("oldBone") && isBone(h.currency) ? "keep" : undefined);
/** 前の版の骨の手 (veil 無し) に、保存の ☑ (aims) の有無で読み方を付ける (S-59、スイッチ oldBone。組み直しの tree-rebuild が呼ぶ) */
/** ☑ の無い (狙い無し free の印・当たりの札の無い) 前の骨は未発現のまま */
export const oldVeil = (h: Hand, aims: readonly unknown[]): Hand => (flag("oldBone") && isBone(h.currency) && !h.veil ? { ...h, veil: aims.length && !h.free ? "pick" : "keep" } : h);
/** 骨の手を未発現のまま次へ (結果は「未発現の冒涜が付いた」1 つ) */
export const veilKeep = (h: Pick<Hand, "currency" | "veil"> | null | undefined): boolean => !!h && flag("boneLater") && isBone(h.currency) && veilOf(h) === "keep";
/** 発現で ☑ の MOD を選ぶ手 (骨の「発現させる」☑・後から打つ発現の手) */
export const veilPick = (h: Pick<Hand, "currency" | "veil"> | null | undefined): boolean => !!h && flag("boneLater") && (isRevealHand(h.currency) || (isBone(h.currency) && veilOf(h) === "pick"));
/** エッセンスの「ブロックに使う」☑ のある手 (S-33b、スイッチ keepOutside) */
export const blockHand = (h: Pick<Hand, "currency" | "block"> | null | undefined): boolean => !!h?.block && flag("keepOutside") && effectOf(h.currency) === "essence";
/** 木の発現で選ぶ手・ブロックに使うエッセンスの当たりの札のうち、完成形に無い物 = 置き石 (S-33・S-33b、スイッチ keepOutside。閉じていれば無し = 以降は冒涜の外れ MOD) */
export function placedAims(doc: TreeDoc): Aim[] {
  if (!flag("keepOutside")) return [];
  const goals = doc.memoAims ?? [];
  const plain = Object.values(doc.boxes).flatMap((b) => (b.out === "hit" && b.aim && b.parent && (veilPick(doc.boxes[b.parent]?.hand) || blockHand(doc.boxes[b.parent]?.hand)) && !goals.some((g) => g.modId === b.aim!.modId) ? [b.aim] : []));
  return [...plain, ...midAims(doc).filter((a) => !plain.some((x) => x.modId === a.modId))];
}
/** 置き石 = 発現で選んだ・ブロックに使う MOD (途中の狙いは除く)。残したい MOD の既定に入らず、消えても「狙いが消えた」にしない (S-33) */
export const stoneAims = (doc: TreeDoc): Aim[] => { const mid = new Set(midAims(doc).map((a) => a.modId)); return placedAims(doc).filter((a) => !mid.has(a.modId)); };
/** 手で付ける MOD が 1 つに決まるエッセンスの MOD (無限のエッセンスは決まらないので無し) */
const ESSENCE_MOD = new Map<string, string | null>();
const essenceModOf = (key: string | undefined): string | null => { const had = ESSENCE_MOD.get(key ?? ""); if (had !== undefined) return had; const r = essenceModRaw(key); ESSENCE_MOD.set(key ?? "", r); return r; };
const essenceModRaw = (key: string | undefined): string | null => { const m = /^essence:(?:lesser|normal|greater|perfect):(.+)$/.exec(key ?? ""); return m && !isInfiniteEssence(key!) ? m[1]! : null; };
/**
 * 途中の狙い (S-33b): 木の手で打つエッセンスの MOD のうち完成形に無い物。付けた時・付け直した時に印が付き、道の上では狙いと同じ (S-27e・S-60)。
 * 完成の数えには入らない。11-01 オーナー「またループで付けた際は当然必要MODとしてつけてるから狙いMODとしてのあつかいでいいんじゃないか他の狙いMODもそういう立ち位置でしょ」
 */
export function midAims(doc: TreeDoc): Aim[] {
  const goals = doc.memoAims ?? [], out = new Map<string, Aim>();
  for (const b of Object.values(doc.boxes)) { const k = essenceModOf(b.hand?.currency); if (k && !goals.some((g) => g.modId === k)) out.set(k, { modId: k, tier: 99 }); }
  return [...out.values()];
}
/** 手 h で印が付く途中の狙いの modId (エッセンスの手で完成形に無い MOD。無ければ null) */
export function midMark(doc: TreeDoc, h: Hand | null | undefined): string | null {
  const k = essenceModOf(h?.currency);
  return k && !(doc.memoAims ?? []).some((g) => g.modId === k) ? k : null;
}

/** 打った前後で、発現して付いた MOD (前に無く、後で未発現でない冒涜の MOD)。発現していなければ null */
export function revealedOf(before: StageItem, after: StageItem): StageMod | null {
  const had = new Set([...before.prefixes, ...before.suffixes].filter((m) => !m.unrevealed).map((m) => m.modId));
  return [...after.prefixes, ...after.suffixes].find((m) => m.desecrated && !m.unrevealed && !had.has(m.modId)) ?? null;
}
/** 発現した MOD が当たる ☑ の札 (段は「その段以上」、同じ文の別の modId も当たり = 木の当たりの判定と同じ) */
export function revealHitOf(data: PatchData, m: StageMod | null, own: readonly Aim[]): Aim | null {
  if (!m) return null;
  return own.find((a) => aimHits(m, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }, { data, sameText: true })) ?? null;
}
