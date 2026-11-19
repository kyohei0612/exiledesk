/**
 * tree-veil.ts — 骨 (冒涜) の手の発現の分け方 (10-27 夜オーナー)。
 * ゲームどおり未発現のまま次の手を打てる (veil keep)。発現させる時 (骨の手の「発現させる」☑ = veil pick、後から打つ発現の手 REVEAL_KEY) は、
 * 発現で出うる MOD から ☑ の物が出て選べたら当たり、出なければ外れ。発現の 3 つの出方・アビスの反響はエンジンの revealOffers / reveal:N のまま (tree-sample の revealBy)。
 * ☑ の MOD が完成の狙いに無い物 (置き石。例: 全耐性の前に冷気耐性で系統を埋める) は、その手の時だけ当たりで、以降は冒涜の外れ MOD (aimsOf で数えない)。
 * 付いている間その MOD として箱の中身に持つ (S-33、placedAims。完成の狙いには入らないので aimsOf では今のまま数えない)
 */
import { aimHits, OMEN_KEY, parseKey, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { aimTargetOf } from "./tree-ele-any";
import { isInfiniteEssence } from "../../craft-stage/apply-essence"; import { flag } from "../../../web/release-flags";
import { addsRandomMod, effectOf, isBone } from "./tree-hands";
import type { Aim, Hand, TreeDoc } from "./tree-model";
import { docHeld, sampleOf } from "./tree-sample";
import { sameAimMod } from "./tree-hand-core";

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
export const onceHeld = <T>(m: WeakMap<TreeDoc, [number, T]>, doc: TreeDoc, make: () => T): T => {
  const n = docHeld(doc);
  if (!n) return make();
  const had = m.get(doc);
  if (had && had[0] === n) return had[1];
  const v = make();
  m.set(doc, [n, v]);
  return v;
};
/** 木の発現で選ぶ手 (と普通の手で足した狙い S-33f) の当たりの札のうち、完成形に無い物 = 置き石 (S-33。エッセンスの「ブロックに使う」S-33b は 11-07 に撤回 = 置き石は発現だけ)。完成形にあるかはエンジンの sameAimTarget */
export const placedAims = (data: PatchData, doc: TreeDoc): Aim[] => onceHeld(PLACED, doc, () => placedRaw(data, doc));
function placedRaw(data: PatchData, doc: TreeDoc): Aim[] {
  const goals = doc.memoAims ?? [];
  const plain = Object.values(doc.boxes).flatMap((b) => (b.out === "hit" && b.aim && b.parent && (veilPick(doc.boxes[b.parent]?.hand) || infinitePicked(doc.boxes[b.parent]?.hand?.currency) || addsRandomMod(doc.boxes[b.parent]?.hand?.currency)) && !goals.some((g) => sameAimMod(data, g, b.aim!)) ? [b.aim] : []));
  return plain;
}
/**
 * (S-33h) 完成形と同じ MOD を冒涜・発現の窓で選んだ置き石 (印 stone)。placedAims には入れない (名前の印の組は MOD の種類で数えるので、入れると完成形の狙いと混ざる)。
 * 代わりに、冒涜で付いたその MOD は完成形の狙いに数えない (goalsOn・stoneHeld) = 完成の数え・「狙いが消えた」に入らず、カードは置き石の名前 (tree-row-tags)
 */
const GOAL_STONES = new WeakMap<TreeDoc, [number, Aim[]]>();
export const goalStones = (data: PatchData, doc: TreeDoc): Aim[] => onceHeld(GOAL_STONES, doc, () => {
  const goals = doc.memoAims ?? [], out: Aim[] = [];
  for (const b of Object.values(doc.boxes)) if (b.out === "hit" && b.aim?.stone && goals.some((g) => sameAimMod(data, g, b.aim!)) && !out.some((x) => sameAimMod(data, x, b.aim!))) out.push(b.aim);
  return out;
});
/** 完成形の狙い g の MOD が、品 it に置き石 (冒涜で付いた、完成形と同じ MOD の置き石) として付いているか。冒涜で付ける完成形の狙い (via) は置き石にしない */
export const stoneHeld = (data: PatchData, doc: TreeDoc, g: Aim, it: StageItem): boolean => {
  if (g.via || g.stone) return false;
  const st = goalStones(data, doc);
  const mods = [...it.prefixes, ...it.suffixes].filter((m) => m.desecrated && !m.unrevealed);
  return mods.length > 0 && st.some((s) => sameAimMod(data, s, g) && mods.some((m) => aimHits(m, aimTargetOf(data, s), { data, sameText: true })));
};
/** 品 it に冒涜で付いている、完成形と同じ MOD の置き石 (S-33h)。スイッチ veilStoneAim の下では当たりに数える札 (外れにしない) */
export const stonesOn = (data: PatchData, doc: TreeDoc, it: StageItem): Aim[] =>
  (doc.memoAims ?? []).filter((g) => stoneHeld(data, doc, g, it)).flatMap((g) => goalStones(data, doc).filter((x) => sameAimMod(data, x, g)));
/**
 * (スイッチ veilStoneAim、S-33h ②) 箱 boxId が「置き石が消えた」か = 外れが消えたの箱で、親の見本に完成形と同じ MOD の置き石が付いていて、この箱の見本には無い
 * (光のお告げの消去などで消えた)。題だけ替える (結果の種類・人の行き先は外れが消えたのまま)
 */
export const stoneGoneAt = (data: PatchData, doc: TreeDoc, boxId: string): boolean => {
  const b = doc.boxes[boxId];
  if (!flag("veilStoneAim") || b?.out !== "junkGone" || !b.parent || !goalStones(data, doc).length) return false;
  const was = sampleOf(data, doc, b.parent, 1).item, now = sampleOf(data, doc, boxId, 1).item;
  return !!was && !!now && stonesOn(data, doc, was).length > 0 && stonesOn(data, doc, now).length === 0;
};
/** (スイッチ veilStoneAim) 箱 boxId で手 h を打つと置き石だけが消える (光のお告げの消去 = 冒涜の MOD だけ消す、冒涜は 1 品 1 つ E-60)。手の窓の「結果の箱」の文 */
export const stoneOnlyGoneBy = (data: PatchData, doc: TreeDoc, boxId: string, h: Pick<Hand, "currency" | "omens"> | null | undefined): boolean => {
  if (!flag("veilStoneAim") || !h || effectOf(h.currency) !== "remove" || !h.omens.includes(OMEN_KEY.light) || !goalStones(data, doc).length || !doc.boxes[boxId]) return false;
  const it = sampleOf(data, doc, boxId, 1).item;
  return !!it && stonesOn(data, doc, it).length > 0;
};
/** 無限のエッセンスの窓で ☑ した能力値の当たりの箱か (完成形に無くても選べる = 置き石と同じ扱い、S-33d。スイッチ treeInfinitePick) */
const infinitePicked = (key: string | undefined): boolean => !!key && flag("treeInfinitePick") && isInfiniteEssence(key);
/** 置き石 = 発現で選んだ MOD。残したい MOD の既定に入らず、消えても「狙いが消えた」にしない (S-33) */
export const stoneAims = (data: PatchData, doc: TreeDoc): Aim[] => placedAims(data, doc);
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
export const midAims = (data: PatchData, doc: TreeDoc): Aim[] => onceHeld(MID, doc, () => midRaw(data, doc));
function midRaw(data: PatchData, doc: TreeDoc): Aim[] {
  const goals = doc.memoAims ?? [], out = new Map<string, Aim>();
  for (const b of Object.values(doc.boxes)) { const k = essenceModOf(b.hand?.currency); const a: Aim = { modId: k ?? "", tier: 99 }; if (k && !goals.some((g) => sameAimMod(data, g, a))) out.set(k, a); }
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
  return own.find((a) => aimHits(m, aimTargetOf(data, a), { data, sameText: true })) ?? null;
}
