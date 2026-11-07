/**
 * tree-veil.ts — 骨 (冒涜) の手の発現の分け方 (10-27 夜オーナー)。
 * ゲームどおり未発現のまま次の手を打てる (veil keep)。発現させる時 (骨の手の「発現させる」☑ = veil pick、後から打つ発現の手 REVEAL_KEY) は、
 * 発現で出うる MOD から ☑ の物が出て選べたら当たり、出なければ外れ。発現の 3 つの出方・アビスの反響はエンジンの revealOffers / reveal:N のまま (tree-sample の revealBy)。
 * ☑ の MOD が完成の狙いに無い物 (置き石。例: 全耐性の前に冷気耐性で系統を埋める) は、その手の時だけ当たりで、以降は冒涜の外れ MOD (aimsOf で数えない)。
 * 付いている間その MOD として箱の中身に持つ (S-33、placedAims。完成の狙いには入らないので aimsOf では今のまま数えない)
 */
import { aimHits, parseKey, tierIndexOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { isInfiniteEssence } from "../../craft-stage/apply-essence";
import { isBone } from "./tree-hands";
import type { Aim, Hand, TreeDoc } from "./tree-model";
import { docHeld } from "./tree-sample";

/** 後から打つ発現の手のキー (エンジンの発現は reveal:N。どれを選ぶかは tree-sample の revealBy が ☑ で決める) */
export const REVEAL_KEY = "reveal";
/** 後から打つ発現の手か */
export const isRevealHand = (key: string | undefined): boolean => key === REVEAL_KEY;
/**
 * 骨の手の発現の読み方 (S-59)。前の版の骨の手 (veil の無い物 = 打ったら発現まで進む) は、☑ (当たりの札) が無ければ「未発現のまま」(keep。
 * 10-31 朝オーナー決め 4「A 今は違うけど古いやつどーするって話なら」)。☑ のある前の手は開いた時の組み直し (tree-rebuild の oldVeil) が「発現させる」(pick) を付ける
 * (10-30 オーナー「59は修正で」)。閉じている間は veil のまま (無ければ前の分け方)
 */
const veilOf = (h: Pick<Hand, "currency" | "veil">): Hand["veil"] => h.veil ?? (isBone(h.currency) ? "keep" : undefined);
/** 前の版の骨の手 (veil 無し) に、保存の ☑ (aims) の有無で読み方を付ける (S-59。組み直しの tree-rebuild が呼ぶ) */
/** ☑ の無い (狙い無し free の印・当たりの札の無い) 前の骨は未発現のまま */
export const oldVeil = (h: Hand, aims: readonly unknown[]): Hand => (isBone(h.currency) && !h.veil ? { ...h, veil: aims.length && !h.free ? "pick" : "keep" } : h);
/** 骨の手を未発現のまま次へ (結果は「未発現の冒涜が付いた」1 つ) */
export const veilKeep = (h: Pick<Hand, "currency" | "veil"> | null | undefined): boolean => !!h && isBone(h.currency) && veilOf(h) === "keep";
/** 発現で ☑ の MOD を選ぶ手 (骨の「発現させる」☑・後から打つ発現の手) */
export const veilPick = (h: Pick<Hand, "currency" | "veil"> | null | undefined): boolean => !!h && (isRevealHand(h.currency) || (isBone(h.currency) && veilOf(h) === "pick"));
/**
 * 木が変わらない間 (holdDocSig の 1 回の中) は 1 回だけ作る。どちらも箱を全部なめるので、回し・見本作りの 1 手ごとに呼ぶと 1 手の重さが箱の数に比例した
 * (11-06 sim-speed: ワンド 34 箱の 100 人回しの 4 割強)。外では毎回作る (木を書き換える途中で呼ばれる)
 */
const PLACED = new WeakMap<TreeDoc, [number, Aim[]]>(), MID = new WeakMap<TreeDoc, [number, Aim[]]>();
const onceHeld = (m: WeakMap<TreeDoc, [number, Aim[]]>, doc: TreeDoc, make: () => Aim[]): Aim[] => {
  const n = docHeld(doc);
  if (!n) return make();
  const had = m.get(doc);
  if (had && had[0] === n) return had[1];
  const v = make();
  m.set(doc, [n, v]);
  return v;
};
/** 木の発現で選ぶ手の当たりの札のうち、完成形に無い物 = 置き石 (S-33。エッセンスの「ブロックに使う」S-33b は 11-07 に撤回 = 置き石は発現だけ) */
export const placedAims = (doc: TreeDoc): Aim[] => onceHeld(PLACED, doc, () => placedRaw(doc));
function placedRaw(doc: TreeDoc): Aim[] {
  const goals = doc.memoAims ?? [];
  const plain = Object.values(doc.boxes).flatMap((b) => (b.out === "hit" && b.aim && b.parent && veilPick(doc.boxes[b.parent]?.hand) && !goals.some((g) => g.modId === b.aim!.modId) ? [b.aim] : []));
  return plain;
}
/** 置き石 = 発現で選んだ MOD。残したい MOD の既定に入らず、消えても「狙いが消えた」にしない (S-33) */
export const stoneAims = (doc: TreeDoc): Aim[] => placedAims(doc);
/** 手で付ける MOD が 1 つに決まるエッセンスの MOD (無限のエッセンスは決まらないので無し) */
const ESSENCE_MOD = new Map<string, string | null>();
export const essenceModOf = (key: string | undefined): string | null => { const had = ESSENCE_MOD.get(key ?? ""); if (had !== undefined) return had; const r = essenceModRaw(key); ESSENCE_MOD.set(key ?? "", r); return r; };
/** 鍵の読みはエンジンの parseKey (essence の modId。ブリーチは modId 無し) */
const essenceModRaw = (key: string | undefined): string | null => { const k = key ? parseKey(key) : null; return k?.type === "essence" && k.modId && !isInfiniteEssence(key!) ? k.modId : null; };
/**
 * 木の手で打つエッセンスの MOD のうち完成形に無い物。付いた時から外れ (S-33c、11-07 オーナー「そもそも狙いモッドじゃないエッセンスでしょ例外なくハズレMODと同じ扱いで
 * ハズレMOD エッセンスって表示でいいよ」。前の「途中の狙い」= 道の上で狙いと同じ印は撤回)。使うのはカードの行を「外れ MOD」にせず MOD の文のまま出す所だけ
 * (S-82、11-07 オーナー「つけたエッセンスはそのままカードに表示させよう」。前の札「外れ MOD (エッセンス)」と完成形のカードの「途中で消える」行 S-30d はやめた)
 */
export const midAims = (doc: TreeDoc): Aim[] => onceHeld(MID, doc, () => midRaw(doc));
function midRaw(doc: TreeDoc): Aim[] {
  const goals = doc.memoAims ?? [], out = new Map<string, Aim>();
  for (const b of Object.values(doc.boxes)) { const k = essenceModOf(b.hand?.currency); if (k && !goals.some((g) => g.modId === k)) out.set(k, { modId: k, tier: 99 }); }
  return [...out.values()];
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
