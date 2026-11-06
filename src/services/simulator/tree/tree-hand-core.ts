/**
 * tree-hand-core.ts — 木の打ち方の組み合わせ (1 回分の手・打てるか・始めの形・打つ前後の比べ)。中身はエンジンの核の関数を呼ぶだけ
 * (2026-10-23 エンジンの for-sim から戻した。11-07 tree-sample.ts から分けた、1 ファイル 500 行まで)
 */
import { aimHits as hits, applyCurrency, baseSocketsOf, forceKey, freshItem, kindOf, OMEN_FOR, omenBlock, runeIdByName, tierIndexOf, unrevealedOf, useReason, type AimTarget, type PatchData, type StageApply, type StageItem, type StageMod } from "../../craft-stage/engine";
import { junkOf } from "./tree-aim";
import { ECHO as ABYSSAL_ECHO_OMEN } from "./tree-hands";
import { tr } from "../../../i18n/lang";
import { isRevealHand } from "./tree-veil";

/** 段の名前の T で言う狙い (T1 が一番上) */
interface TierAim { modId: string; tier: number }
interface AimDiffOpts { sameText?: boolean }

const targetOf = (data: PatchData, a: TierAim): AimTarget => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) });
const modsOf = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];
const heldOn = (data: PatchData, mods: readonly StageMod[], a: TierAim, o: AimDiffOpts): boolean => {
  const t = targetOf(data, a), opts = o.sameText ? { data, sameText: true } : undefined;
  return mods.some((m) => hits(m, t, opts));
};

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
  const ts = aims.map((a) => targetOf(data, a)), opts = o.sameText ? { data, sameText: true } : undefined;
  const junk = (it: StageItem): number => { const j = junkOf(it, ts, opts); return j.prefix.length + j.suffix.length; };
  const was = new Set(bm.filter((m) => m.fractured).map((m) => m.modId));
  const fractured = am.find((m) => m.fractured && !was.has(m.modId)) ?? null;
  return {
    hits: has.filter((a) => !had.includes(a)),
    lost: had.filter((a) => !has.includes(a)),
    junkGone: junk(after) < junk(before),
    fractured,
    fracturedHits: fractured ? aims.filter((a) => heldOn(data, [fractured], a, o)) : [],
  };
}

/**
 * 手に付けたお告げを、その手に掛かる物 (now) と続けて打つ発現に掛かる物 (reveal = アビスの反響) に分ける。
 * 骨 (冒涜) の手に付けた反響は骨には掛からず (渡すとエンジンが弾く)、その後の発現で使う。発現の手そのものなら now
 */
function handOmens(key: string, omens: readonly string[]): { now: string[]; reveal: string[] } {
  if (kindOf(key) === "reveal") return { now: [...omens], reveal: [] };
  const rv = OMEN_FOR.reveal ?? [];
  return { now: omens.filter((o) => !rv.includes(o)), reveal: omens.filter((o) => rv.includes(o)) };
}

/**
 * その手 (key + お告げ) がこのアイテムに打てない理由。打てるなら null。
 * - お告げ: 1 枚ずつ omenBlock。消せる物が無い側のお告げ・効かないお告げ (オーナー 10-22「進行不能」)
 * - 手そのもの: エンジンの useReason (クラフト台の棚の灰色と同じ判定。乱数で決まる物は打てる扱い、10-25 置き換え)
 */
export function canUse(data: PatchData, item: StageItem, key: string, omens: readonly string[] = []): string | null {
  const now = handOmens(key, omens).now;
  // 後から打つ発現の手: 未発現の MOD があれば打てる
  if (isRevealHand(key)) return unrevealedOf(item) ? null : tr("未発現の MOD が無い", "No unrevealed mod");
  for (const o of now) { const why = omenBlock(data, item, key, now, o); if (why) return why; } // エミュと同じ判定 (「今は意味なし」も止める。S-20b は 11-06 撤回)
  return useReason(data, item, key, now);
}

interface HandSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ) */
  omens?: readonly string[];
  /** 未発現が付いた時、そのまま発現まで打つ */
  reveal?: boolean;
}
interface HandResult extends StageApply {
  /** 手そのもので使ったお告げ (発現の前。発現の物は omensUsed) */
  handOmensUsed: string[];
  /** 反響を発現に使った */
  echoUsed: boolean;
}

/**
 * 発現 (魂の井戸) を打つ。候補は選ばない = 1 つ目 (候補を選ぶのは画面の箱で組む、11-05 オーナー「UIでその動きを再現できるように」)。
 * echo = アビスの反響を掛けた手は引き直した 3 つの 1 つ目 (エンジンの reveal:1:reroll)。発現できなければ r のまま
 */
function revealFirst(data: PatchData, r: StageApply, rng: () => number, echo: boolean): StageApply {
  const x = echo ? applyCurrency(data, r.item, "reveal:1:reroll", rng, [ABYSSAL_ECHO_OMEN]) : applyCurrency(data, r.item, "reveal:1", rng);
  return x.applied ? { ...x, added: [...r.added, ...x.added], removed: [...r.removed, ...x.removed] } : r;
}

/** 手を 1 回打つ (エンジンの applyCurrency を 1 回、骨の後は発現まで) */
export function applyHand(data: PatchData, item: StageItem, key: string, rng: () => number, spec: HandSpec = {}): HandResult {
  const { now, reveal } = handOmens(key, spec.omens ?? []);
  // 後から打つ発現の手。反響はこの手のお告げ
  if (isRevealHand(key)) {
    if (!unrevealedOf(item)) return { applied: false, item, added: [], removed: [], reason: tr("未発現の MOD が無い", "No unrevealed mod"), handOmensUsed: [], echoUsed: false };
    const echo = now.includes(ABYSSAL_ECHO_OMEN);
    return { ...revealFirst(data, { applied: true, item, added: [], removed: [] }, rng, echo), handOmensUsed: [], echoUsed: echo };
  }
  const r = applyCurrency(data, item, key, rng, now);
  const base = { handOmensUsed: r.omensUsed ?? [] };
  if (!r.applied || !unrevealedOf(r.item) || !spec.reveal) return { ...r, ...base, echoUsed: false };
  const echo = reveal.includes(ABYSSAL_ECHO_OMEN);
  return { ...revealFirst(data, r, rng, echo), ...base, echoUsed: echo };
}

interface StartMod { modId: string; tier: number; fractured?: boolean }
interface StartWith {
  /** 始まりのレアリティ。マジック・ノーマルはノーマルから付ける (付けるとマジック)。フラクチャーがあればレア (force がレアにする) */
  rarity: StageItem["rarity"];
  mods: readonly StartMod[];
  /** 先に差すルーン (英語名)。指名の MOD のルーンの分もソケットを開ける */
  runes?: readonly string[];
  /** ソケットだけ開けておく MOD (ルーンの MOD の分。印のスタートで後から付く ✦ の候補・＋の MOD) */
  socketFor?: readonly StartMod[];
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
  // 選んだルーンを先に差す。ルーンの MOD はそのルーンを差して付く (force が差す)。差すソケットを要る数だけ開けておく (手袋の投射物 +2 = コルの狩り、10-22)
  const runes = s.runes ?? [];
  const byMod = new Set([...s.mods, ...(s.socketFor ?? [])].flatMap((m) => { const r = data.mods.get(m.modId)?.rune; return r ? [r] : []; }));
  const need = runes.length + [...byMod].filter((id) => !runes.some((en) => runeIdByName(en) === id)).length;
  if (need) item = { ...item, sockets: Math.max(item.sockets ?? 0, need) };
  for (const en of runes) {
    const r = applyCurrency(data, item, `rune:${en}`, rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  for (const m of s.mods) {
    // エッセンスの MOD (グレーターの道の始まり) はクラフト MOD の印で付ける
    const src = data.mods.get(m.modId)?.source;
    const r = applyCurrency(data, item, forceKey(m.modId, `T${m.tier}`, m.fractured ? "f" : src === "essence" || src === "perfect_essence" ? "e" : "n"), rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  return { item, note: null };
}
