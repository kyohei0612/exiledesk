/**
 * クラフトステージ: 冒涜 (骨) と発現 (2026-09-27、ADR-001)。打つ処理は 2026-10-16 から spec/ (ADR-004)。ここに残るのは発現の候補 (revealOffers)・
 * 骨の側の重み (boneSideWeights) など、確率表と spec が共通に使う物
 *
 * ゲームと同じく 2 手に分ける:
 *   1. 骨 (desecrate / desecrate_ancient / desecrate_altered。骨の種類は装備で決まる): **レア**に未発現の冒涜 MOD を 1 つ付ける。
 *      どちらの側に付くかは、その側で出うる MOD の重みの合計で決まる (計算機の desecrateAnyOutcomes と同じ割合)。
 *      左右のネクロマンシーのお告げで側を指せる。両側が埋まっていれば、その側の固定済み以外を 1 つ差し替える (計算機のオーナー判断)
 *   2. 発現 (reveal:N): 3 つの候補から N 番目を選ぶ。冒涜専用 MOD (+ 変質した鎖骨なら異界) を 1〜3 個 (実測の割合、DESECRATED_COUNT_RATES)、
 *      残りを普通の MOD から重みで、系統の被りを除いて 3 つ。アビスの反響のお告げがあれば 1 回引き直せる (reveal:N:reroll = 引き直した方)
 *   - 冒涜の MOD はアイテムに 1 つまで。古びた骨は段の下限 40 (ANCIENT_BONE_FLOOR)
 *   - 王 / 君主 / 黒血のお告げ: 候補をその勢力の冒涜の MOD だけに (MOD ごとに等しく。エンジンの desecrationBossProbability)。防具には使えない
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { ANCIENT_BONE_FLOOR, DESECRATION_EXCLUSIVE_COUNT } from "../../vendor/poe2htc/engine/probability";
import { allMods, candidates, makeStageMod, pickWeighted, type Candidate, effectiveCls } from "./stage-core";
import { FACTION_TAG } from "./omens";
import type { StageItem, StageMod, StageSide } from "./types";

const OFFERS = 3;

/** 発現で出うる置き場。plain (腐食のお告げ) は冒涜専用の MOD (勢力の MOD・異界) を出さない = 普通の MOD だけ */
function poolsFor(item: StageItem, altered: boolean, plain = false) {
  return (side: StageSide): string[] => {
    const k = side === "prefix" ? "prefixes" : "suffixes";
    // 普通の置き場は特殊 MOD のルーン込み (要望 ㉙)
    const p = { ...item.cls.pools, normal: effectiveCls(item).pools.normal };
    if (plain) return [...p.normal[k]];
    // 同じ MOD を 2 回数えない (置き場が重なっていると重みが倍になる)
    return [...new Set([...p.normal[k], ...p.desecrated[k], ...(altered ? p.otherworldly?.[k] ?? [] : [])])];
  };
}


/**
 * 両側が埋まったレアに骨を打つ時の、側ごとの重み (applyBone と同じ: 出うる冒涜の MOD の重みの和、勢力のお告げなら数)。
 * 確率表 (held-odds.ts) が同じ決まりで側を混ぜるのに使う
 */
export function boneSideWeights(data: PatchData, item: StageItem, key: string, used: readonly string[]): Record<StageSide, number> {
  const altered = key === "desecrate_altered";
  const floor = key === "desecrate_ancient" ? ANCIENT_BONE_FLOOR : 0;
  const factionOmen = used.find((o) => FACTION_TAG[o]);
  const faction = factionOmen ? FACTION_TAG[factionOmen]! : null;
  const gnawed = key === "desecrate_gnawed";
  const fw = (side: StageSide) => pool(data, item, side, floor, altered, faction, undefined, false, gnawed).reduce((a, c) => a + c.w, 0);
  if (faction && !(fw("prefix") > 0) && !(fw("suffix") > 0)) {
    const nw = (side: StageSide) => pool(data, item, side, floor, altered, null, undefined, true, gnawed).reduce((a, c) => a + c.w, 0);
    return { prefix: nw("prefix"), suffix: nw("suffix") };
  }
  return { prefix: fw("prefix"), suffix: fw("suffix") };
}

/** 冒涜専用の MOD (冒涜の置き場の物と、変質した鎖骨の異界の MOD) */
const exclusiveTest = (item: StageItem, side: StageSide) => {
  const other = new Set(item.cls.pools.otherworldly?.[side === "prefix" ? "prefixes" : "suffixes"] ?? []);
  return (mod: { id: string; source?: string }): boolean => mod.source === "desecrated" || other.has(mod.id);
};
/**
 * 発現の候補の置き場 (勢力のお告げなら、その勢力の冒涜の MOD だけを MOD ごとに等しく)。
 * 冒涜専用の MOD はアイテムレベルを見ない (段は全部 Lv 65 だが、アクト 2 の装備でも T1 が出る。2026-10-10 要望 + reddit の動画、エッセンスと同じ例外)。
 * 噛み切られた骨 (アイテムレベル 64 以下だけ) は例外にしない = アイテムレベルの決まりのまま (2026-10-10 オーナー)
 */
function pool(data: PatchData, item: StageItem, side: StageSide, floor: number, altered: boolean, faction: string | null, except: StageMod | undefined, plain = false, gnawed = false): Candidate[] {
  const c = candidates(data, item, [side], floor, { pools: poolsFor(item, altered, plain), except, ...(gnawed ? {} : { anyLevel: exclusiveTest(item, side) }) });
  if (!faction) return c;
  return c.filter((x) => x.mod.tags.includes(faction)).map((x) => ({ ...x, w: 1 }));
}

/** 未発現の枠 */
export const unrevealedOf = (item: StageItem): StageMod | undefined => allMods(item).find((m) => m.unrevealed);

/**
 * 発現の候補 3 つのうち、冒涜専用 MOD (勢力の MOD・異界) が何個か。決まりはエンジンの DESECRATION_EXCLUSIVE_COUNT (probability.ts) に 1 つだけ置き、
 * 計算機 (markovActions の冒涜・plan.ts) とこのエミュレーターが同じ物を読む (2026-10-09 オーナー「参照してるエンジンは 1 つ、作り方おかしい」)。
 * 実測: Reddit「I desecrated more than 500 rings」563 回 — 1 個 85.3% / 2 個 13.9% / 3 個 0.9%、0 個は無し
 */
export const DESECRATED_COUNT_RATES = DESECRATION_EXCLUSIVE_COUNT.map((c) => c.rate);

/** 系統が被る候補を外す (同じ発現に同じ系統は 2 つ出ない) */
const famsOf = (c: Candidate): string[] => [...(c.mod.families ?? [c.mod.family])];
const notClashing = (rest: Candidate[], c: Candidate): Candidate[] => {
  const f = new Set(famsOf(c));
  return rest.filter((x) => x !== c && !famsOf(x).some((y) => f.has(y)));
};

/**
 * 発現の候補 3 つ (と、アビスの反響で引き直した 3 つ)。同じ rng から順に引くので、画面で見せる候補と手順の結果が一致する。
 * 組み方 (勢力のお告げ・腐食のお告げ以外): 専用 MOD の個数を DESECRATED_COUNT_RATES で決め、その数を専用 MOD から重みで (指輪だけ実測、
 * 他の部位は全部同じ値なので等しい)、残りを普通の MOD から普通の重みで引いて、並びを混ぜる。専用 MOD が出せない (アイテムレベル 65 未満など) 時は 3 つとも普通
 */
export function revealOffers(data: PatchData, item: StageItem, rng: () => number): { first: StageMod[]; reroll: StageMod[]; chances: Map<StageMod, number> } {
  const hidden = unrevealedOf(item);
  if (!hidden?.unrevealed) return { first: [], reroll: [], chances: new Map() };
  const { floor, altered, faction, plain, gnawed } = hidden.unrevealed;
  // 候補に出た瞬間の確率 = その段の重み ÷ 引いた置き場の全部の重み (ほかの手の「付いた瞬間の確率」と同じ決まり。
  // 2026-10-12 オーナー「冒涜で引いた時に確率が出てるはずなのにアイテムには出ない」)。和を取るだけで rng は使わないので、引く物は前と同じ
  const chances = new Map<StageMod, number>();
  const shareOf = new Map<Candidate, number>();
  const sumW = (xs: readonly { w: number }[]): number => xs.reduce((a, x) => a + x.w, 0);
  const take = (from: Candidate[]): Candidate => {
    const c = pickWeighted(from, rng)!;
    shareOf.set(c, c.w / (sumW(from) || 1));
    return c;
  };
  const toMod = (c: Candidate): StageMod => {
    const t = pickWeighted(c.tiers, rng)!;
    const m: StageMod = { ...makeStageMod(c.mod, c.side, t.index, rng), desecrated: true };
    chances.set(m, (shareOf.get(c) ?? 0) * (t.w / (sumW(c.tiers) || 1)));
    return m;
  };
  // 勢力のお告げ: その勢力の専用 MOD を MOD ごとに等しく 3 つまで、足りなければ残りは普通の MOD を普通の重みで
  // (ゲームの文面は「ランダムな <勢力> の MOD を保証」で「だけ」ではない。2026-10-11 オーナー「2 つしか付かない場合は一般 MOD が 1 個混じる」)
  const drawFaction = (): StageMod[] => {
    let fac = pool(data, item, hidden.side, floor, altered, faction, hidden, false, gnawed);
    let normal = pool(data, item, hidden.side, floor, altered, null, hidden, true, gnawed);
    const picked: Candidate[] = [];
    while (picked.length < OFFERS && fac.length) {
      const c = take(fac);
      picked.push(c);
      fac = notClashing(fac, c);
      normal = notClashing(normal, c);
    }
    while (picked.length < OFFERS && normal.length) {
      const c = take(normal);
      picked.push(c);
      normal = notClashing(normal, c);
    }
    return picked.map(toMod);
  };
  // 腐食のお告げ (普通だけ) は 1 つの置き場から重みで
  const drawOne = (): StageMod[] => {
    let rest = pool(data, item, hidden.side, floor, altered, faction, hidden, plain, gnawed);
    const out: StageMod[] = [];
    for (let i = 0; i < OFFERS && rest.length; i++) {
      const c = take(rest);
      rest = notClashing(rest, c);
      out.push(toMod(c));
    }
    return out;
  };
  const draw = (): StageMod[] => {
    if (faction) return drawFaction();
    if (plain) return drawOne();
    const all = pool(data, item, hidden.side, floor, altered, null, hidden, false, gnawed);
    const exclusive = exclusiveTest(item, hidden.side);
    const isExclusive = (c: Candidate) => exclusive(c.mod);
    // 専用 MOD どうしは重みで (指輪は実測、他の部位は仮の値が全部同じなので等しい。2026-10-09)
    let ex = all.filter(isExclusive);
    let normal = all.filter((c) => !isExclusive(c));
    if (!ex.length) return drawOne();
    const u = rng();
    const want = u < DESECRATED_COUNT_RATES[0]! ? 1 : u < DESECRATED_COUNT_RATES[0]! + DESECRATED_COUNT_RATES[1]! ? 2 : 3;
    const picked: Candidate[] = [];
    for (let i = 0; i < want && ex.length; i++) {
      const c = take(ex);
      picked.push(c);
      ex = notClashing(ex, c);
      normal = notClashing(normal, c);
    }
    while (picked.length < OFFERS && (normal.length || ex.length)) {
      const c = normal.length ? take(normal) : take(ex);
      picked.push(c);
      normal = notClashing(normal, c);
      ex = notClashing(ex, c);
    }
    // 並びはばらばら (実測で専用 MOD の行に偏りは無い)
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [picked[i], picked[j]] = [picked[j]!, picked[i]!];
    }
    return picked.map(toMod);
  };
  const first = draw();
  return { first, reroll: draw(), chances };
}

