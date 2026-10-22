/**
 * tree-play.ts — ツリーが打つ・当たりを見る時の組み合わせ (2026-10-23、エンジンの for-sim から戻した。オーナー「元からエンジンにあった物をシミュが勝手に自前で作っただけ」)。
 * 中身は全部エンジンの核 (engine.ts) の関数を呼ぶだけ: 当たり = aimHits (sameText)・段 = tierIndexOf、打つ = applyCurrency・omenBlock・revealOffers・forceKey (f = その MOD を固定)、
 * 付きうる = heldOdds (クラフト台の % と同じ)、MOD の一覧 = modListFor、ルーン = RUNES。カタリストを最大まで入れる fillCatalyst は engine-sim.ts (核に無い物)。
 * 決まりや確率の式はここに書かない (足りない物はブラック経由でジン部長に頼む)
 */
import { aimHits as hits, applyCurrency, catalystBoosts, catalystOf, forceKey, freshItem, heldOdds, kindOf, makeStageMod, modListFor, mulberry32, omenBlock, OMEN_FOR, revealOffers, runeEffectFor, runeIdByName, RUNES, stepOutcomes, tierIndexOf, unrevealedOf, type AimHitOpts, type AimTarget, type HeldOdds, type ListRow, type ModGroup, type PatchData, type RuneEffect, type RuneRow, type StageApply, type StageItem, type StageMod, type StepOutcome } from "../../craft-stage/engine";
import { catalystFull, catalystTagOf, fillCatalyst } from "../../craft-stage/engine-sim";
import { tr } from "../../../i18n/lang";

/** その MOD がどれかの狙いに当たる */
export const isAimMod = (m: StageMod, ts: readonly AimTarget[], o?: AimHitOpts): boolean => ts.some((t) => hits(m, t, o));
/**
 * 外れ = 固定 (フラクチャー) でも狙いでもない MOD、側ごと (2026-10-22 シミュの自前の式を入口へ、sim-own-logic.md の B2。
 * ツリーの junkCount・分かれ目の数え・形の鍵・満杯の文・行の札が同じ数え方)
 */
export function junkOf(item: StageItem, ts: readonly AimTarget[], o?: AimHitOpts): { prefix: StageMod[]; suffix: StageMod[] } {
  const junk = (ms: readonly StageMod[]): StageMod[] => ms.filter((m) => !m.fractured && !isAimMod(m, ts, o));
  return { prefix: junk(item.prefixes), suffix: junk(item.suffixes) };
}
/**
 * アイテムに狙い (modId と段の名前の T) が付いているか (2026-10-22 シミュの aimHeld の橋渡しを入口へ)。アイテムの MOD を全部見て、T を段の番号に直して aimHits。
 * sameText = 同じ系統で文も同じ別の modId も当たり (シミュの aimHeld と同じ)
 */
export function aimHeldOn(data: PatchData, item: StageItem, a: { modId: string; tier: number }, o?: { sameText?: boolean }): boolean {
  const t: AimTarget = { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) };
  const opts = o?.sameText ? { data, sameText: true } : undefined;
  return [...item.prefixes, ...item.suffixes].some((m) => hits(m, t, opts));
}
/** 付いている狙いの組 = 狙いのうちアイテムに付いている物 (並びは ts のまま。sim-own-logic.md の B3) */
export const heldSetOf = (item: StageItem, ts: readonly AimTarget[], o?: AimHitOpts): AimTarget[] => ts.filter((t) => [...item.prefixes, ...item.suffixes].some((m) => hits(m, t, o)));

/** 段の名前の T で言う狙い (T1 が一番上) */
export interface TierAim { modId: string; tier: number }
export interface AimDiffOpts { sameText?: boolean }

const targetOf = (data: PatchData, a: TierAim): AimTarget => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) });
const modsOf = (item: StageItem): StageMod[] => [...item.prefixes, ...item.suffixes];
const heldOn = (data: PatchData, mods: readonly StageMod[], a: TierAim, o: AimDiffOpts): boolean => {
  const t = targetOf(data, a), opts = o.sameText ? { data, sameText: true } : undefined;
  return mods.some((m) => hits(m, t, opts));
};

export interface AimDiff<A extends TierAim = TierAim> {
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

/** 1 手の行き先 (stepOutcomes、消える枝 void は除く) を、狙いの変わり方と一緒に。エンジンが枝に分けられない手は null */
export function outcomesByAim<A extends TierAim>(data: PatchData, item: StageItem, key: string, omens: readonly string[], aims: readonly A[], o: AimDiffOpts = {}): Array<StepOutcome & { diff: AimDiff<A> }> | null {
  const outs = stepOutcomes(data, item, key, omens);
  if (!outs) return null;
  return outs.filter((x) => !x.void).map((x) => ({ ...x, diff: aimDiff(data, item, x.item, aims, o) }));
}

/**
 * この手で付きうる狙い = items (同じ箱の見本など) のどれかで、クラフト台でそのカレンシーを持った時に出る % (heldOdds。CoE と合わせ済み) が 0 より大きい段がある狙い
 * (並びは aims のまま。オーナー 10-22: 行き先は数え上げず heldOdds の答えをそのまま、錬金・大いなる高貴・骨の候補も heldOdds の物)。
 * もう付いている狙いは見ない (呼ぶ側が外して渡す)。どの見本でも heldOdds に % が 1 つも無い (打てない・確率の表が無い手) 時は null (呼ぶ側が決める)
 */
export function reachableAims<A extends TierAim>(data: PatchData, items: readonly StageItem[], key: string, omens: readonly string[], aims: readonly A[], o: AimDiffOpts = {}): A[] | null {
  const pools = items.flatMap((it) => { const h = heldOdds(data, it, key, omens), ms = h ? poolOf(data, h) : []; return ms.length ? [ms] : []; });
  if (!pools.length) return null;
  return aims.filter((a) => pools.some((ms) => heldOn(data, ms, a, o)));
}
/** heldOdds で % が 0 より大きい段の MOD (数値は段の真ん中、当たりの判定にだけ使う) */
function poolOf(data: PatchData, h: HeldOdds): StageMod[] {
  const out: StageMod[] = [];
  for (const [id, x] of h.byMod) {
    const mod = data.mods.get(id);
    if (!mod) continue;
    for (const t of x.tiers) if (t.w > 0) out.push(makeStageMod(mod, mod.type === "suffix" ? "suffix" : "prefix", t.index, () => 0.5));
  }
  return out;
}

/** 手の働き: quality = カタリスト (品質だけ)、essence = エッセンス、swap = カオス (1 つ消して 1 つ付く)、remove = 消去、fracture = フラクチャー、add = それ以外 (足す) */
export type CurrencyEffect = "quality" | "essence" | "swap" | "remove" | "fracture" | "add";
export function effectOf(key: string): CurrencyEffect {
  const k = kindOf(key);
  if (k === "catalyst") return "quality";
  if (k.startsWith("essence")) return "essence";
  return k === "chaos" ? "swap" : k === "annul" ? "remove" : k === "fracture" ? "fracture" : "add";
}

/** その MOD を伸ばすカタリスト (keys の並びで最初の物、伸ばす物が無ければ null)。伸びるかはエンジンの catalystBoosts (指輪・アミュレットは MOD の tags、ジュエル・上のベースは中身のタグ) */
export function catalystForMod(data: PatchData, item: StageItem, modId: string, keys: readonly string[]): string | null {
  const mod = data.mods.get(modId);
  if (!mod) return null;
  return keys.find((k) => catalystBoosts(item, { modId, tags: mod.tags }, catalystTagOf(k), data)) ?? null;
}

/** 触媒の高貴のお告げ (掛けると、高貴の前にカタリストで品質を入れる手になる) */
export const CATALYSING_OMEN = "OmenofCatalysingExaltation";

/**
 * 手に付けたお告げを、その手に掛かる物 (now) と続けて打つ発現に掛かる物 (reveal = アビスの反響) に分ける。
 * 骨 (冒涜) の手に付けた反響は骨には掛からず (渡すとエンジンが弾く)、その後の発現で使う。発現の手そのものなら now
 */
export function handOmens(key: string, omens: readonly string[]): { now: string[]; reveal: string[] } {
  if (kindOf(key) === "reveal") return { now: [...omens], reveal: [] };
  const rv = OMEN_FOR.reveal ?? [];
  return { now: omens.filter((o) => !rv.includes(o)), reveal: omens.filter((o) => rv.includes(o)) };
}

/** カタリスト (品質だけ上げる手。catalyst_<タグ>・jcatalyst_<タグ>) か */
export const isCatalystKey = (key: string): boolean => kindOf(key) === "catalyst";

export interface UseSpec {
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
export function canUse(data: PatchData, item: StageItem, key: string, spec: UseSpec = {}): string | null {
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

/** アビスの反響のお告げ (発現の候補を 1 回引き直せる。骨の手に付けると続けて打つ発現で使う) */
export const ABYSSAL_ECHO_OMEN = "OmenofAbyssalEchoes";

export interface HandSpec {
  /** 手に付けたお告げ (反響は handOmens で発現の側へ) */
  omens?: readonly string[];
  /** 触媒の高貴の前に品質を最大まで入れるカタリスト (お告げに触媒の高貴がある時だけ) */
  catalyst?: string | null;
  /** フラクチャーの手で ✦ にする MOD (付いていれば打った後にそれを固定。付いていない・打てない時はエンジンの乱数のまま) */
  fractureOf?: string | null;
  /** 未発現が付いた時、そのまま発現で選ぶ候補 (true の候補の最初の物、無ければ 1 つ目)。false = 発現しない。既定 = 1 つ目 */
  reveal?: false | ((m: StageMod) => boolean);
}
export interface HandResult extends StageApply {
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
export function revealBy(data: PatchData, r: StageApply, rng: () => number, want: (m: StageMod) => boolean, echo = false): StageApply {
  const seed = Math.floor(rng() * 2 ** 31);
  const offers = revealOffers(data, r.item, mulberry32(seed));
  const n = offers.first.findIndex(want);
  const k = n < 0 && echo ? offers.reroll.findIndex(want) : -1;
  // reveal:N の N は 1 から (エンジンの run-plan と同じ。0 は「その番号の候補が無い」)
  const x = k >= 0 ? applyCurrency(data, r.item, `reveal:${k + 1}:reroll`, mulberry32(seed), [ABYSSAL_ECHO_OMEN]) : applyCurrency(data, r.item, `reveal:${Math.max(0, n) + 1}`, mulberry32(seed));
  return x.applied ? { ...x, added: [...r.added, ...x.added], removed: [...r.removed, ...x.removed] } : r;
}

/** 手を 1 回打つ (上の HandSpec の順)。カタリストの手は品質を今の最大まで (もう最大なら打てた扱いで何もしない) */
export function applyHand(data: PatchData, item: StageItem, key: string, rng: () => number, spec: HandSpec = {}): HandResult {
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
export interface StartWith {
  /** 始まりのレアリティ。マジック・ノーマルはノーマルから付ける (付けるとマジック)。フラクチャーがあればレア (force がレアにする) */
  rarity: StageItem["rarity"];
  mods: readonly StartMod[];
  /** 先に差すルーン (英語名)。指名の MOD のルーンの分もソケットを開ける */
  runes?: readonly string[];
  /** 指名の後に乱数で足す MOD の数 (レアは素の高貴、ほかは増強) */
  random?: number;
}

/** フラクチャー (✦) は 1 つのアイテムに 1 つまで (ゲームのフラクチャーのオーブは 1 つだけ固定する) */
export const START_FRACTURE_MAX = 1;

/** 始めのアイテム。note = 打てなかった理由 (無ければ null、その時の item は打てた所まで) */
export function startWith(data: PatchData, base: string, itemLevel: number, s: StartWith, rng: () => number): { item: StageItem; note: string | null } {
  const magic = (s.rarity === "magic" || s.rarity === "normal") && !s.mods.some((m) => m.fractured);
  let item = freshItem(data, base, itemLevel, magic ? "normal" : "rare");
  if (s.mods.filter((m) => m.fractured).length > START_FRACTURE_MAX) return { item, note: tr("フラクチャーは 1 つまで", "Only one mod can be fractured") };
  // 選んだルーンを先に差す。ルーンの MOD はそのルーンを差して付く (force が差す)。差すソケットを要る数だけ開けておく (手袋の投射物 +2 = コルの狩り、10-22)
  const runes = s.runes ?? [];
  const byMod = new Set(s.mods.flatMap((m) => { const r = data.mods.get(m.modId)?.rune; return r ? [r] : []; }));
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
  for (let i = 0; i < (s.random ?? 0); i++) {
    const x = applyCurrency(data, item, item.rarity === "rare" ? "exalt" : "augment", rng);
    if (!x.applied) return { item, note: x.reason ?? null };
    item = x.item;
  }
  return { item, note: null };
}

/**
 * 使い方ごとの MOD の群れ (並びもこの順。2026-10-22 シミュの自前の式を入口へ、B13): hit = カレンシーで付く当たり (一般・冒涜専用・エッセンス。骨の手の当たりは冒涜で付与、10-22 オーナー)、
 * start = 始まりに置ける MOD (一般・エッセンス・創生の樹などカレンシーで付かない物・ルーンの MOD (付けると force がそのルーンを差す))
 */
export const MOD_USE_GROUPS: Readonly<Record<"hit" | "start", readonly ModGroup[]>> = { hit: ["normal", "desecrated", "essence"], start: ["normal", "essence", "special", "rune"] };
/** その使い方の行だけを、群れの順 → 出やすさ (share) の大きい順に (普通の MOD が先。10-22 靴・手袋を白紙から組んで、創生の樹が一番上に並び探しにくかった) */
export function modListForUse(data: PatchData, item: StageItem, use: "hit" | "start"): ListRow[] {
  const gs = MOD_USE_GROUPS[use];
  return modListFor(data, item).filter((r) => gs.includes(r.group)).sort((a, b) => gs.indexOf(a.group) - gs.indexOf(b.group) || b.share - a.share);
}

/** 今のゲームに有るルーン (ソウルコアなどは入れない) のうち、このアイテムのベースに差せる物 (RUNES の並び)。effect = このベースでの効果 */
export function runesFor(data: PatchData, item: StageItem): Array<{ en: string; rune: RuneRow; effect: RuneEffect | null }> {
  return Object.entries(RUNES).filter(([en, r]) => r.kind === "rune" && r.available !== false && applyCurrency(data, { ...item, sockets: 1 }, `rune:${en}`, mulberry32(1)).applied)
    .map(([en, rune]) => ({ en, rune, effect: runeEffectFor(rune, item.cls.category) }));
}
