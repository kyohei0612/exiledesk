/**
 * tree-sample.ts — ツリーの箱に「着いた時のアイテム」の見本を 1 個作る・箱の手を 1 回打つ (2026-10-22 オーナー「エンジンでカレンシーを使えるように。
 * 外れのやり方を決める時にカレンシーを打たせて決める」)。打つのは全部エンジンの入口 (engine.ts の applyCurrency)、ここで結果は作らない。
 *
 * 見本の作り方: 始まり = 金の指輪のレア + フラクチャー (指名の手 force:…|f をエンジンで打つ。創生の樹の MOD も置ける)。
 * その下の箱 = 親の見本に親の手を打ち、結果がその箱 (当たり X / 外れ / 外れが消えた / 狙いが消えた) になるまで引き直す (TRIES 回まで)。
 * 引けなかった当たりは、親の見本に指名で付けて作る (note に書く)。分け方は設計 11 の表 (付いた > 消えた > 外れが減った > 外れ)
 */
import { aimHits as hits, applyCurrency, baseSocketsOf, catalystOf, forceKey, freshItem, kindOf, mulberry32, omenBlock, OMEN_FOR, revealOffers, runeIdByName, tierIndexOf, unrevealedOf, type AimHitOpts, type AimTarget, type PatchData, type StageApply, type StageItem, type StageMod } from "../../craft-stage/engine";
import { fractureStart, stepOutcomes } from "../../craft-stage/engine-sim";
import { catalystFull, catalystTagOf, fillCatalyst } from "../../craft-stage/engine-sim";
import { aimHeldOn, isAimMod, junkOf } from "./tree-aim";
import { CATALYSING as CATALYSING_OMEN, ECHO, ECHO as ABYSSAL_ECHO_OMEN, effectOf, engineOmens, isCatalyst } from "./tree-hands";
import { tr } from "../../../i18n/lang";
import { fractureMarks, START_JUNK, startOf, startRarity, type Aim, type Hand, type OutKind, type TreeBox, type TreeDoc } from "./tree-model";
import { withTreeTune } from "./tree-tune";
import { splitTo } from "./tree-run";

const TRIES = 3000;

export interface Sample { item: StageItem; note: string | null }

/** 木の狙い (段 T) → エンジンの入口の狙いの形 (段の位置)。当たりの判定はエンジンの入口 (aimHeldOn・isAimMod・junkOf) に sameText で聞く (決まり 8) */
export const targetsOf = (data: PatchData, aims: readonly Aim[]): AimTarget[] => aims.map((a) => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) }));
/** 木の当たりの判定の設定 (同じ系統・同じ文も当たり。系統だけで合わせると「スペルスキルのレベル」にミニオン・近接・投射物のスキルレベルが当たった、10-22 #3) */
export const aimOpts = (data: PatchData): AimHitOpts => ({ data, sameText: true });
/**
 * その箱の手で「当たり」と数える札。繰り返し (当たるまで) は、その箱の結果の当たりの箱の札だけで止める
 * (10-22 プレフィックスをつないだら、始まりのカオスがプレフィックスのレアリティで止まり、行き先が無く 87 人止まった)。ほかの手はツリー全部の札
 */
export function handAims(doc: TreeDoc, id: string, aims: readonly Aim[]): readonly Aim[] {
  const b = doc.boxes[id];
  if (!b?.hand?.repeat) return aims;
  const own = b.outs.flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" && c.aim ? [c.aim] : []; });
  return own.length ? own : aims;
}
/**
 * このツリーで使っている当たりの札 (重ならない物)。エッセンスの当たりの箱の札は付いた MOD の名前なので、完成の狙いに無い物は数えない
 * (10-24 不在のアミュ B: 右側の結晶化 + 無限のエッセンスで冒涜の外れを消す。% 能力値を狙いに数えると、次の冒涜で置き換わった時に「狙いが消えた」になった)
 */
export function aimsOf(doc: TreeDoc): Aim[] {
  const out: Aim[] = [];
  // 完成形の設定 (memoAims) にフラクチャーの印でない狙いがある木だけ (印だけの古い見本 = 金の指輪はエッセンスの札も狙いのまま)
  const goals = doc.memoAims ?? [];
  const byGoals = goals.some((g) => !g.fractured);
  const label = (b: TreeBox): boolean => {
    const h = b.parent ? doc.boxes[b.parent]?.hand : null;
    return byGoals && !!h && effectOf(h.currency) === "essence" && !goals.some((g) => g.modId === b.aim!.modId);
  };
  for (const b of Object.values(doc.boxes)) if (b.out === "hit" && b.aim && !label(b) && !out.some((x) => x.modId === b.aim!.modId && x.tier === b.aim!.tier)) out.push(b.aim);
  return out;
}

/**
 * 打つ前と後を比べて、どの箱の結果か (付いた狙いは hits に)。key = 打った手 (エッセンスは付く MOD が必ず付くので、狙いが消えたかを先に見る。
 * 付いた MOD は hits のまま、10-22 オーナー「エッセンスの道」)
 */
export function outcomeOf(data: PatchData, before: StageItem, after: StageItem, aims: readonly Aim[], key?: string): { out: OutKind; hits: Aim[] } {
  // 狙いの付いた・消えた・外れが減った・新しく ✦ になった MOD はエンジンの入口の aimDiff (B12 10-22)。ここは箱の分け方だけ
  const d = aimDiff(data, before, after, aims, { sameText: true });
  if (key && effectOf(key) === "essence" && d.lost.length) return { out: "lost", hits: d.hits };
  // エッセンスの道は 2 つだけ (10-24 オーナー): 狙いが消えていなければ当たりの道 (付く MOD が完成の狙いに無くても。外れを消すだけのエッセンス)
  if (key && effectOf(key) === "essence") return { out: "hit", hits: d.hits };
  // フラクチャー: 新しく ✦ になった MOD が狙いなら当たり (札 = その狙い)、ほかは外れ (MOD の数は変わらない)
  if (key && effectOf(key) === "fracture") return d.fracturedHits.length ? { out: "hit", hits: d.fracturedHits.slice(0, 1) } : { out: "junk", hits: [] };
  if (d.hits.length) return { out: "hit", hits: d.hits };
  if (d.lost.length) return { out: "lost", hits: [] };
  if (d.junkGone) return { out: "junkGone", hits: [] };
  return { out: "junk", hits: [] };
}

/**
 * 結果が 1 通りの手 (10-22 オーナー「光のお告げの場合ハズレとかないから、使った時点でその先には冒涜が消えた状態の枠しかない」
 * 「サフィ 3 MOD・プレ 1 MOD で左側の消去の時は狙いの MOD が無いから 1 通り。そういう判断は自動で」): 手を置く時に、この箱の見本を
 * SINGLE_SEEDS 個作り (同じ箱でも外れが左右どちらかなどで違う)、それぞれにエンジンの stepOutcomes で起こりうる行き先を全部たどる。
 * 全部の見本で結果の分け方 (outcomeOf) が同じ 1 つの時だけそれを返す (当たりは付く札も)。箱に着かなかった見本は数えない。
 * pre = 前に品質を最大まで入れるカタリスト (触媒の手の前の札)。
 * 繰り返し・狙い無し・品質だけの手・未発現が付く手と、エンジンが枝に分けられない手 (数値だけ変わる手など) は null (今までどおり手の種類の箱)。
 * extra = 棚の当たりの候補 (欲しい MOD のメモなど、木にまだ無い狙い)。足す・入れ替える手が「外れだけ」の 1 通りになる時も null
 * (10-22 白紙から 13 通り組んだ #1: 木にまだ無い狙いを足す手で当たりの箱が作れず、横の＋も出なかった。外れだけなら当たりの箱を作って MOD を選ばせる)
 */
export function singleOutOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, pre: string | null = null, extra: readonly Aim[] = []): { out: OutKind; aim: Aim | null } | null {
  if (h.repeat || h.free || isCatalyst(h.currency)) return null;
  const aims = [...aimsOf(doc), ...extra.filter((a) => !aimsOf(doc).some((x) => x.modId === a.modId && x.tier === a.tier))];
  const k = effectOf(h.currency);
  let one: { out: OutKind; hits: Aim[] } | null = null;
  const key = (r: { out: OutKind; hits: Aim[] }): string => `${r.out}:${r.hits.map((a) => `${a.modId}/${a.tier}`).join(",")}`;
  for (let seed = 1; seed <= SINGLE_SEEDS; seed++) {
    const smp = sampleOf(data, doc, boxId, seed);
    if (smp.note === "none" || smp.note?.startsWith("cant:")) continue;
    const item = pre ? fillCatalyst(data, smp.item, pre, mulberry32(seed)).item : smp.item;
    // 消す手は、見本にまだ無い狙いを 1 つ足した形でも見る (見本は初めて着いた人の形。戻りで狙いを持って来た人は狙いが消えうる、10-22 #8 の後:
    // 分かれ目の行の見本が外れだけになり、素の消去が「外れが消えた」1 通りにまとまって 96 人止まった)
    const forms = [item, ...(k === "remove" || k === "essence" ? aims.filter((a) => !aimHeldOn(data, item, a, { sameText: true })).map((a) => applyCurrency(data, item, forceKey(a.modId, `T${a.tier}`, "n"), mulberry32(seed))).filter((r) => r.applied).map((r) => r.item) : [])];
    for (const it of forms) {
      const outs = stepOutcomes(data, it, h.currency, engineOmens(h))?.filter((o) => !o.void);
      // 未発現が付く手 (冒涜の骨) は、発現で選ぶ候補で当たり / 外れが分かれる
      if (!outs?.length || outs.some((o) => unrevealedOf(o.item))) return null;
      for (const o of outs) {
        const r = outcomeOf(data, it, o.item, aims, h.currency);
        if (r.hits.length > 1 || (one && key(one) !== key(r))) return null;
        one = r;
      }
    }
  }
  if (one?.out === "junk" && (k === "add" || k === "swap")) return null;
  return one ? { out: one.out, aim: one.hits[0] ?? null } : null;
}
/** 分かれ目の行の箱の見本を引き直す回数 */
const SPLIT_TRIES = 40;
/** 結果が 1 通りかを見る見本の数 */
const SINGLE_SEEDS = 8;


/**
 * フラクチャーの手で ✦ にするアイテムの MOD (10-24 オーナー「フラクチャーは必ずどれか 1 つを固定」)。選んだ狙い (fractureOf) に当たる付いている MOD、
 * 選んでいない前の木は狙いの札の並びで最初に付いている物。どれも付いていなければ null (エンジンの乱数のまま)
 */
export function fractureTarget(data: PatchData, item: StageItem, h: Hand, aims: readonly Aim[]): string | null {
  if (effectOf(h.currency) !== "fracture") return null;
  const mods = [...item.prefixes, ...item.suffixes].filter((m) => !m.fractured);
  const want = h.fractureOf ? [{ modId: h.fractureOf, tier: aims.find((a) => a.modId === h.fractureOf)?.tier ?? 99 }, ...aims] : aims;
  for (const a of want) { const m = mods.find((x) => isAimMod(x, targetsOf(data, [a]), aimOpts(data))); if (m) return m.modId; }
  return null;
}

/** フラクチャーで固定できる MOD の数 (エンジンの stepOutcomes の行き先の数。2 つ以上なら外れうる) */
export const fractureChoices = (data: PatchData, item: StageItem): number => (stepOutcomes(data, item, "fracture") ?? []).filter((o) => !o.void).length;

/** 繰り返し (カオススパム) の上限が無い時の見張り */
const SPAM_CAP = 5000;

/**
 * 箱の手を 1 回打つ (触媒の時はカタリストで品質を上げてから。台本の while と同じ)。
 * 繰り返しの手 (repeat) は、当たりの札 (aims) のどれかが新しく付くまで (か上限まで) 打ち続けた結果を 1 回分として返す。
 * use を渡すと使った物 (カタリストの数・カレンシー・お告げ) を数える (100 人回し tree-run)
 */
export function playHand(data: PatchData, item: StageItem, h: Hand, rng: () => number, aims: readonly Aim[] = [], use?: (key: string, n?: number) => void, miss = false): StageApply {
  if (h.repeat) {
    const cap = h.repeat.max ?? SPAM_CAP;
    let r: StageApply = { applied: false, item, added: [], removed: [] };
    let it = item;
    for (let i = 0; i < cap; i++) {
      r = playHand(data, it, { ...h, repeat: null }, rng, aims, use, miss);
      if (!r.applied) return i ? { ...r, applied: true, item: it } : r;
      it = r.item;
      if (outcomeOf(data, item, it, aims, h.currency).out === "hit") break;
    }
    return { ...r, item: it };
  }
  // 1 回分はエンジンの入口の applyHand (B6〜B8 10-22): カタリストの手は品質を今の最大まで (もう最大なら通る)・触媒の前のカタリスト・
  // フラクチャーで ✦ にする MOD・骨の後はそのまま発現 (反響は骨に掛けず発現で使う)。
  // 発現は当たりの札に合う候補、無ければ 1 つ目 (2026-10-22 オーナー「冒涜は冒涜で付与かな」)。miss = 外れの箱の見本 (狙いでない候補を選ぶ。黒き血は狙いが必ず候補に入り、見本が外れの箱に着かなかった、10-22)
  const ts = targetsOf(data, aims);
  const r = applyHand(data, item, h.currency, rng, { omens: h.omens, catalyst: h.catalyst, fractureOf: fractureTarget(data, item, h, aims), reveal: (m) => isAimMod(m, ts, aimOpts(data)) !== miss });
  if (use) {
    if (r.catalystCount) use(isCatalyst(h.currency) ? h.currency : h.catalyst!, r.catalystCount);
    if (r.applied && !isCatalyst(h.currency)) {
      use(h.currency);
      for (const o of r.handOmensUsed) use(o);
      if (r.echoUsed) use(ECHO);
    }
  }
  return r;
}

/**
 * 始めのアイテム (10-23 オーナー「スタートは印で決まる」): 完成の狙いにフラクチャーの印があれば、印のどれか 1 つが ✦ のレア + ＋ の MOD + 外れ (合わせて 4 つ、エンジンの入口 fractureStart)。
 * 印が無ければ白 (ノーマル) に＋の MOD を付けた物 (＋が無ければ白のまま)。ルーンは先に差す。見本・ルート精査・100 人回し (tree-run) で同じ物。
 * note = 打てなかった理由 (無ければ null)
 */
export function startItemOf(data: PatchData, doc: TreeDoc, rng: () => number): Sample {
  const st = startOf(doc), marks = fractureMarks(doc);
  // 作り方 (ルーン → 指名の MOD、マジックはノーマルから) はエンジンの入口の startWith (B10 10-22)
  if (!marks.length) return startWith(data, doc.base, doc.itemLevel, { rarity: startRarity(doc), mods: st.mods, runes: st.runes }, rng);
  // ルーンを先に差したレア (ルーンの MOD の候補・＋の分のソケットも開ける) から
  const pre = startWith(data, doc.base, doc.itemLevel, { rarity: "rare", mods: [], runes: st.runes, socketFor: [...marks, ...st.mods] }, rng);
  if (pre.note) return pre;
  const from = pre.item;
  // 印の狙いは「その段以上」(10-24 オーナー「T2 を選んだら T2 以上」): 印の段から上の段 (T1 まで) を全部候補に渡す (アイテムレベルで付かない段はエンジンが外す)
  const cands = marks.flatMap((a) => Array.from({ length: a.tier }, (_, i) => ({ modId: a.modId, tier: i + 1 })));
  // 外れには完成の狙いを付けない (段は問わず。ライフを持ってスタートした人が外れの箱のカオススパムで当たらず止まった、10-24 モンキー初めての人の回)
  const avoid = (doc.memoAims ?? []).filter((a) => !a.fractured).map((a) => ({ modId: a.modId, tier: a.tier }));
  const r = fractureStart(data, doc.base, doc.itemLevel, cands, rng, { junk: START_JUNK, extra: st.mods, from, avoid });
  return { item: r.item, note: r.note };
}

/**
 * その手がこのアイテムに打てない理由 (打てるなら null。オーナー 10-22「進行不能」: 消せる物が無い側のお告げ・効かないお告げが掛かった手を確定させない)。
 * 判定はエンジンの入口の canUse (お告げ → 触媒の前のカタリスト → 手そのもの、繰り返しは 1 回分、乱数で決まる物は打てる扱い。B11 10-22)
 */
export function handProblem(data: PatchData, item: StageItem, h: Hand): string | null {
  return canUse(data, item, h.currency, { omens: h.omens, catalyst: h.catalyst });
}

/** 箱の見本 (seed が同じなら同じ物。木の設定 tune で打つ) */
export function sampleOf(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  return withTreeTune(doc, () => sampleIn(data, doc, boxId, seed));
}
function sampleIn(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  const b = doc.boxes[boxId];
  if (!b) return { item: freshItem(data, doc.base, doc.itemLevel, "rare"), note: null };
  if (b.out === "start") return startItemOf(data, doc, mulberry32(seed));
  const p = doc.boxes[b.parent!]!;
  const base = sampleIn(data, doc, p.id, seed);
  // 分かれ目の行の箱: その行に合う形が出るまで親の見本を別の種で引き直す (10-22 13 通り組んだ #8: 「サフィの外れ 1 つ以上」の行の見本がプレに外れの形で、
  // 効くお告げが「今は意味なし」で押せなかった)。合う形が出なければ親の見本のまま
  if (p.split) {
    const aims = aimsOf(doc);
    for (let k = 0; k < SPLIT_TRIES; k++) {
      const smp = k ? sampleIn(data, doc, p.id, seed + 7919 * k) : base;
      if (splitTo(data, p.split, smp.item, aims) === boxId) return smp;
    }
    return base;
  }
  if (!p.hand) return base;
  const aims = aimsOf(doc);
  const rng = mulberry32(seed ^ 0x5eed ^ boxId.length * 7919);
  let last: StageApply | null = null;
  for (let i = 0; i < TRIES; i++) {
    const r = playHand(data, base.item, p.hand, rng, handAims(doc, p.id, aims), undefined, b.out === "junk" || b.out === "lost");
    if (!r.applied) { last = r; break; }
    last = r;
    const o = outcomeOf(data, base.item, r.item, aims, p.hand.currency);
    // 当たるまでの手が上限まで打っても当たらない = 付かない狙いだけ。引き直しても同じなのでやめる (1 回 5000 回 × 3000 で画面が固まった、10-22)
    if (p.hand.repeat && o.out !== "hit") break;
    if (b.out === "pass") return { item: r.item, note: null };
    if (b.out !== "any" && o.out !== b.out) continue;
    // エッセンスの当たりの箱は 1 つ (札は付いた MOD の名前、tree-run の outBoxOf と同じ)
    if (b.out === "hit" && b.aim && effectOf(p.hand.currency) !== "essence" && !o.hits.some((a) => a.modId === b.aim!.modId && a.tier === b.aim!.tier)) continue;
    return { item: r.item, note: null };
  }
  if (last && !last.applied) return { item: base.item, note: `cant:${last.reason ?? ""}` };
  if (b.out === "hit" && b.aim) {
    const r = applyCurrency(data, base.item, forceKey(b.aim.modId, `T${b.aim.tier}`, "n"), rng);
    return { item: r.item, note: r.applied ? "forced" : r.reason ?? null };
  }
  return { item: base.item, note: "none" };
}

// ここから下は木の打ち方の組み合わせ (2026-10-23 エンジンの for-sim から戻した。中身はエンジンの核の関数を呼ぶだけ)

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
function aimDiff<A extends TierAim>(data: PatchData, before: StageItem, after: StageItem, aims: readonly A[], o: AimDiffOpts = {}): AimDiff<A> {
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

interface UseSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ分ける) */
  omens?: readonly string[];
  /** 触媒の高貴の前に品質を最大まで入れるカタリスト (お告げに触媒の高貴がある時だけ使う) */
  catalyst?: string | null;
}

/**
 * その手 (key + お告げ + 触媒の前のカタリスト) がこのアイテムに打てない理由。打てるなら null。
 * - お告げ: 1 枚ずつ omenBlock (触媒の時はカタリストで品質を入れた後のアイテムで聞く)。消せる物が無い側のお告げ・効かないお告げ (オーナー 10-22「進行不能」)
 * - カタリストの手: 1 個でも入る・もう最大なら打てる
 * - 触媒の高貴: カタリストが入らず、別の種類の品質しか無ければ打てない
 * - 手そのもの: applyCurrency が打てる・乱数で決まる (random) なら打てる
 */
function canUse(data: PatchData, item: StageItem, key: string, spec: UseSpec = {}): string | null {
  const now = handOmens(key, spec.omens ?? []).now;
  const cat = spec.catalyst && now.includes(CATALYSING_OMEN) ? spec.catalyst : null;
  const filled = cat ? fillCatalyst(data, item, cat, mulberry32(1)).item : item;
  for (const o of now) { const why = omenBlock(data, filled, key, now, o); if (why) return why; }
  const rng = mulberry32(1);
  if (kindOf(key) === "catalyst") {
    const r = fillCatalyst(data, item, key, rng);
    return r.count || catalystFull(item, key) || r.random ? null : r.reason ?? tr("打てない", "Can't use");
  }
  let it = item;
  if (cat) {
    const r = fillCatalyst(data, it, cat, rng);
    if (!r.applied && r.count === 0 && catalystOf(it).tag !== catalystTagOf(cat)) return r.random ? null : r.reason ?? tr("打てない", "Can't use");
    it = r.item;
  }
  const r = applyCurrency(data, it, key, rng, now);
  return r.applied || r.random ? null : r.reason ?? tr("打てない", "Can't use");
}

interface HandSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ) */
  omens?: readonly string[];
  /** 触媒の高貴の前に品質を最大まで入れるカタリスト (お告げに触媒の高貴がある時だけ) */
  catalyst?: string | null;
  /** フラクチャーの手で ✦ にする MOD (付いていれば打った後にそれを固定。付いていない・打てない時はエンジンの乱数のまま) */
  fractureOf?: string | null;
  /** 未発現が付いた時、そのまま発現で選ぶ候補 (true の候補の最初の物、無ければ 1 つ目)。false = 発現しない。既定 = 1 つ目 */
  reveal?: false | ((m: StageMod) => boolean);
}
interface HandResult extends StageApply {
  /** 触媒の前 (かカタリストの手そのもの) で打ったカタリストの個数 */
  catalystCount: number;
  /** 手そのもので使ったお告げ (発現の前。発現の物は omensUsed) */
  handOmensUsed: string[];
  /** 反響を発現に使った */
  echoUsed: boolean;
}

/**
 * 発現 (魂の井戸) で候補を選んで打つ。候補 3 つ (revealOffers) のうち want に合う最初の物、無ければ 1 つ目。
 * echo = アビスの反響があれば、最初の 3 つに無い時に 1 回引き直した 3 つから (同じ種で引くのでエンジンの reveal:N:reroll と同じ候補、apply-desecrate.ts)。
 * r = 未発現が付いた手の結果 (付いた・消えた MOD は足し合わせる)。発現できなければ r のまま
 */
function revealBy(data: PatchData, r: StageApply, rng: () => number, want: (m: StageMod) => boolean, echo = false): StageApply {
  const seed = Math.floor(rng() * 2 ** 31);
  const offers = revealOffers(data, r.item, mulberry32(seed));
  const n = offers.first.findIndex(want);
  const k = n < 0 && echo ? offers.reroll.findIndex(want) : -1;
  // reveal:N の N は 1 から (エンジンの run-plan と同じ。0 は「その番号の候補が無い」)
  const x = k >= 0 ? applyCurrency(data, r.item, `reveal:${k + 1}:reroll`, mulberry32(seed), [ABYSSAL_ECHO_OMEN]) : applyCurrency(data, r.item, `reveal:${Math.max(0, n) + 1}`, mulberry32(seed));
  return x.applied ? { ...x, added: [...r.added, ...x.added], removed: [...r.removed, ...x.removed] } : r;
}

/** 手を 1 回打つ (上の HandSpec の順)。カタリストの手は品質を今の最大まで (もう最大なら打てた扱いで何もしない) */
function applyHand(data: PatchData, item: StageItem, key: string, rng: () => number, spec: HandSpec = {}): HandResult {
  if (kindOf(key) === "catalyst") {
    const r = fillCatalyst(data, item, key, rng);
    return { ...r, applied: r.applied || r.count > 0 || catalystFull(item, key), catalystCount: r.count, handOmensUsed: [], echoUsed: false };
  }
  const { now, reveal } = handOmens(key, spec.omens ?? []);
  let it = item, catalystCount = 0;
  if (spec.catalyst && now.includes(CATALYSING_OMEN)) {
    const c = fillCatalyst(data, it, spec.catalyst, rng);
    if (!c.applied && c.count === 0 && catalystOf(it).tag !== catalystTagOf(spec.catalyst)) return { ...c, catalystCount: 0, handOmensUsed: [], echoUsed: false };
    catalystCount = c.count;
    it = c.item;
  }
  let r = applyCurrency(data, it, key, rng, now);
  const fo = spec.fractureOf;
  if (r.applied && fo && effectOf(key) === "fracture" && [...it.prefixes, ...it.suffixes].some((m) => m.modId === fo)) {
    const f = applyCurrency(data, it, forceKey(fo, "T1", "f"), rng);
    if (f.applied) r = { ...r, item: f.item, added: f.added, removed: f.removed };
  }
  const base = { catalystCount, handOmensUsed: r.omensUsed ?? [] };
  if (!r.applied || !unrevealedOf(r.item) || spec.reveal === false) return { ...r, ...base, echoUsed: false };
  const echo = reveal.includes(ABYSSAL_ECHO_OMEN);
  return { ...revealBy(data, r, rng, spec.reveal ?? (() => false), echo), ...base, echoUsed: echo };
}

export interface StartMod { modId: string; tier: number; fractured?: boolean }
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
function startWith(data: PatchData, base: string, itemLevel: number, s: StartWith, rng: () => number): { item: StageItem; note: string | null } {
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
