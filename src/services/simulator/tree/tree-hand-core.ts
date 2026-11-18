/**
 * tree-hand-core.ts — 木の打ち方の組み合わせ (1 回分の手・打てるか・始めの形・打つ前後の比べ)。中身はエンジンの核の関数を呼ぶだけ
 * (2026-10-23 エンジンの for-sim から戻した。11-07 tree-sample.ts から分けた、1 ファイル 500 行まで)
 */
import { applyCurrency, baseSocketsOf, forceKey, freshItem, isCraftedSource, mulberry32, omenBlock, revealKey, revealOffers, sameAimTarget, unrevealedOf, useReason, type AimTarget, type PatchData, type StageApply, type StageItem, type StageMod } from "../../craft-stage/engine";
import { heldOn, junkOf, type AimDiffOpts, type TierAim } from "./tree-aim";
import { missAims } from "./tree-miss";
import { ECHO as ABYSSAL_ECHO_OMEN, splitOmens } from "./tree-hands";
import { tr } from "../../../i18n/lang";
import { isRevealHand } from "./tree-veil";
import { aimTargetOf } from "./tree-ele-any";

const targetOf = (data: PatchData, a: TierAim): AimTarget => aimTargetOf(data, a);
const modsOf = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];

interface AimDiff<A extends TierAim = TierAim> {
  /** 前に無く後に付いている狙い (並びは aims のまま) */
  hits: A[];
  /** 前に付いていて後に無い狙い */
  lost: A[];
  /** 外れ (固定でも狙いでもない MOD) の数が減った */
  junkGone: boolean;
  /** 新しく ✦ (フラクチャー) になった MOD (無ければ null) と、それが当たる狙い */
  fractured: StageMod | null;
  fracturedHits: A[];
}

/** 1 手の前 (before) と後 (after) で狙いがどう変わったか */
export function aimDiff<A extends TierAim>(data: PatchData, before: StageItem, after: StageItem, aims: readonly A[], o: AimDiffOpts = {}): AimDiff<A> {
  const bm = modsOf(before), am = modsOf(after);
  const had = aims.filter((a) => heldOn(data, bm, a, o));
  const has = aims.filter((a) => heldOn(data, am, a, o));
  // 外れは外れの式 1 本 (tree-miss、いつも同じ文の別 modId も当たり)
  const miss = missAims(data, aims);
  const junk = (it: StageItem): number => { const j = junkOf(it, miss); return j.prefix.length + j.suffix.length; };
  const was = new Set(bm.filter((m) => m.fractured).map((m) => m.modId));
  const fractured = am.find((m) => m.fractured && !was.has(m.modId)) ?? null;
  return {
    hits: has.filter((a) => !had.includes(a)),
    lost: had.filter((a) => !has.includes(a)),
    junkGone: junk(after) < junk(before),
    fractured,
    fracturedHits: fractured ? aims.filter((a) => heldOn(data, [fractured], { ...a, anyEle: a.anyEle ? 1 : undefined, eleTiers: undefined } as TierAim, o)) : [], // 固定された 1 つが段を満たすか (割り当ての段の並びは渡さない)
  };
}

/** いずれかの元素耐性の札は番号も同じ時だけ同じ札 (1 番だけ付いた人が 2 番の箱に入らない、S-10h ②。エンジンの sameAimTarget は番号を見ない) */
const sameEleNo = (x: TierAim, a: TierAim): boolean => (x.anyEle ?? 0) === (a.anyEle ?? 0);
/** 札どうしが同じ MOD か (段は見ない、同じ文の別 modId も同じ) = エンジンの sameAimTarget (aimHits の sameText と同じ見方) */
export const sameAimMod = (data: PatchData, x: TierAim, a: TierAim): boolean => sameEleNo(x, a) && sameAimTarget(data, targetOf(data, x), targetOf(data, a));
/** 札どうしが同じ狙いか = 同じ MOD で段も同じ (エンジンの sameAimTarget の tier) */
export const sameAim = (data: PatchData, x: TierAim, a: TierAim): boolean => sameEleNo(x, a) && sameAimTarget(data, targetOf(data, x), targetOf(data, a), { tier: true });

/**
 * その手 (key + お告げ) がこのアイテムに打てない理由。打てるなら null。
 * - お告げ: 1 枚ずつ omenBlock。消せる物が無い側のお告げ・効かないお告げ (オーナー 10-22「進行不能」)
 * - 手そのもの: エンジンの useReason (クラフト台の棚の灰色と同じ判定。乱数で決まる物は打てる扱い、10-25 置き換え)
 */
export function canUse(data: PatchData, item: StageItem, key: string, omens: readonly string[] = []): string | null {
  const now = splitOmens(key, omens).now;
  // 後から打つ発現の手: エンジンの発現 (reveal:1、反響があれば引き直した組) が打てるか。revealFirst と同じ鍵
  if (isRevealHand(key)) return revealReason(data, item, now.includes(ABYSSAL_ECHO_OMEN));
  for (const o of now) { const why = omenBlock(data, item, key, now, o); if (why) return why; } // エミュと同じ判定 (「今は意味なし」も止める。S-20b は 11-06 撤回)
  return useReason(data, item, key, now);
}

interface HandSpec {
  /** 手に付けたお告げ (反響は tree-hands の splitOmens で発現の側へ) */
  omens?: readonly string[];
  /** 未発現が付いた時、そのまま発現まで打つ */
  reveal?: boolean;
  /** 発現で選ぶ手 (S-35) の ☑ に当たる MOD か。候補にあればそれを選ぶ (無ければ 1 つ目) */
  want?: (m: StageMod) => boolean;
}
interface HandResult extends StageApply {
  /** 手そのもので使ったお告げ (発現の前。発現の物は omensUsed) */
  handOmensUsed: string[];
  /** 反響を発現に使った */
  echoUsed: boolean;
}

/**
 * 発現 (魂の井戸) を打つ。want (発現で選ぶ手の ☑、S-35「☑ の物が選べたら当たり」) があれば、エンジンの候補 3 つ (revealOffers) に ☑ の MOD が出ればそれを選び、
 * 出なければ反響を掛けた手は引き直した 3 つから選ぶ (エンジンの reveal:N / reveal:N:reroll。窓の % = heldOdds の候補に出る確率と同じ数え)。どれにも無ければ 1 つ目。
 * want が無い手 (狙い無しの発現) は 1 つ目 (反響を掛けた手は引き直しの 1 つ目)。発現できなければ r のまま
 */
function revealFirst(data: PatchData, r: StageApply, rng: () => number, echo: boolean, want?: (m: StageMod) => boolean): StageApply {
  let n = 0, re = echo;
  // 候補は同じ種から引くので、見た候補と reveal:N の結果が一致する (エンジンの revealOffers の約束)
  const seed = Math.floor(rng() * 2 ** 31), at = (): (() => number) => mulberry32(seed);
  if (want) {
    const off = revealOffers(data, r.item, at());
    const i = off.first.findIndex(want), k = i < 0 && echo ? off.reroll.findIndex(want) : -1;
    if (i >= 0) { n = i; re = false; } else if (k >= 0) n = k;
  }
  const x = re ? applyCurrency(data, r.item, revealKey(n + 1, true), at(), [ABYSSAL_ECHO_OMEN]) : applyCurrency(data, r.item, revealKey(n + 1), at());
  return x.applied ? { ...x, added: [...r.added, ...x.added], removed: [...r.removed, ...x.removed] } : r;
}
/** 発現が打てない理由 (エンジンの useReason。打てるなら null) */
const revealReason = (data: PatchData, item: StageItem, echo: boolean): string | null =>
  echo ? useReason(data, item, revealKey(1, true), [ABYSSAL_ECHO_OMEN]) : useReason(data, item, revealKey(1));

/** 手を 1 回打つ (エンジンの applyCurrency を 1 回、骨の後は発現まで) */
export function applyHand(data: PatchData, item: StageItem, key: string, rng: () => number, spec: HandSpec = {}): HandResult {
  const { now, reveal } = splitOmens(key, spec.omens ?? []);
  // 後から打つ発現の手。反響はこの手のお告げ。打てるかは canUse と同じエンジンの発現
  if (isRevealHand(key)) {
    const echo = now.includes(ABYSSAL_ECHO_OMEN), why = revealReason(data, item, echo);
    if (why) return { applied: false, item, added: [], removed: [], reason: why, handOmensUsed: [], echoUsed: false };
    return { ...revealFirst(data, { applied: true, item, added: [], removed: [] }, rng, echo, spec.want), handOmensUsed: [], echoUsed: echo };
  }
  const r = applyCurrency(data, item, key, rng, now);
  const base = { handOmensUsed: r.omensUsed ?? [] };
  if (!r.applied || !unrevealedOf(r.item) || !spec.reveal) return { ...r, ...base, echoUsed: false };
  const echo = reveal.includes(ABYSSAL_ECHO_OMEN);
  return { ...revealFirst(data, r, rng, echo, spec.want), ...base, echoUsed: echo };
}

interface StartMod { modId: string; tier: number; fractured?: boolean }
interface StartWith {
  /** 始まりのレアリティ。マジック・ノーマルはノーマルから付ける (付けるとマジック)。フラクチャーがあればレア (force がレアにする) */
  rarity: StageItem["rarity"];
  mods: readonly StartMod[];
  /** 先に差すルーン (英語名)。ソケットは規格外の数のまま (埋まっていれば入れ替わる) */
  runes?: readonly string[];
}

/** フラクチャー (✦) は 1 つのアイテムに 1 つまで (ゲームのフラクチャーのオーブは 1 つだけ固定する) */
const START_FRACTURE_MAX = 1;

/** 始めのアイテム。note = 打てなかった理由 (無ければ null、その時の item は打てた所まで) */
export function startWith(data: PatchData, base: string, itemLevel: number, s: StartWith, rng: () => number): { item: StageItem; note: string | null } {
  const magic = (s.rarity === "magic" || s.rarity === "normal") && !s.mods.some((m) => m.fractured);
  let item = freshItem(data, base, itemLevel, magic ? "normal" : "rare");
  // ソケットはエミュの手で打つ新品と同じく規格外の数から (エミュの fullSockets、2026-10-04 オーナー「ソケットも初めからデフォでマックス」)。
  // 前は 0 で、ツリーの棚に特別なルーン・その他のルーンが出なかった (10-23 オーナー「打つ中身はエミュと同じ」)
  const full = baseSocketsOf(item.base, item.cls.category);
  if (full > (item.sockets ?? 0)) item = { ...item, sockets: full };
  if (s.mods.filter((m) => m.fractured).length > START_FRACTURE_MAX) return { item, note: tr("フラクチャーは 1 つまで", "Only one mod can be fractured") };
  // 選んだルーンを先に差す。ルーンの MOD はそのルーンを差して付く (force が差す、手袋の投射物 +2 = コルの狩り、10-22)。
  // ソケットは規格外の数より開けない: 埋まっていればエンジンの applyRune どおり左から置き換えられる物と入れ替わる
  // (11-07 オーナー「ソケットバウンドないルーンとかは入れ替え可能」。前は要るルーンの数だけソケットを開けていた)
  const runes = s.runes ?? [];
  for (const en of runes) {
    const r = applyCurrency(data, item, `rune:${en}`, rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  for (const m of s.mods) {
    // エッセンスの MOD (グレーターの道の始まり) はクラフト MOD の印で付ける (エッセンスの MOD かはエンジンの isCraftedSource)
    const r = applyCurrency(data, item, forceKey(m.modId, `T${m.tier}`, m.fractured ? "f" : isCraftedSource(data.mods.get(m.modId)?.source) ? "e" : "n"), rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  return { item, note: null };
}
