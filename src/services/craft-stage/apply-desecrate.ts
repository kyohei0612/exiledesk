/**
 * クラフトステージ: 冒涜 (骨) と発現 (2026-09-27、ADR-001)
 *
 * ゲームと同じく 2 手に分ける:
 *   1. 骨 (desecrate / desecrate_ancient / desecrate_altered。骨の種類は装備で決まる): **レア**に未発現の冒涜 MOD を 1 つ付ける。
 *      どちらの側に付くかは、その側で出うる MOD の重みの合計で決まる (計算機の desecrateAnyOutcomes と同じ割合)。
 *      左右のネクロマンシーのお告げで側を指せる。両側が埋まっていれば、その側の固定済み以外を 1 つ差し替える (計算機のオーナー判断)
 *   2. 発現 (reveal:N): 3 つの候補から N 番目を選ぶ。冒涜専用 MOD (+ 変質した鎖骨なら異界) を 1〜3 個 (実測の割合、DESECRATED_COUNT_RATES)、
 *      残りを普通の MOD から重みで、系統の被りを除いて 3 つ。深淵の残響のお告げがあれば 1 回引き直せる (reveal:N:reroll = 引き直した方)
 *   - 冒涜の MOD はアイテムに 1 つまで。古びた骨は段の下限 40 (ANCIENT_BONE_FLOOR)
 *   - 王 / 君主 / 黒血のお告げ: 候補をその勢力の冒涜の MOD だけに (MOD ごとに等しく。エンジンの desecrationBossProbability)。防具には使えない
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { ANCIENT_BONE_FLOOR, bossOmenAllowed, DESECRATION_EXCLUSIVE_COUNT } from "../../vendor/poe2htc/engine/probability";
import { allMods, candidates, makeStageMod, pickWeighted, removeOne, replaced, room, SIDES, skip, withMod, without, type Candidate, effectiveCls } from "./stage-core";
import { ABYSS_MARK_FLOOR } from "../htc/omens";
import { FACTION_TAG } from "./omens";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
import { jaOfOmen } from "../htc/labels";

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

export function applyBone(data: PatchData, item: StageItem, key: string, rng: () => number, used: readonly string[]): StageApply {
  if (item.rarity !== "rare") return skip(item, "レアのアイテムにだけ使える");
  if (used.includes("OmenofPutrefaction")) return putrefy(item, key);
  if (allMods(item).some((m) => m.desecrated)) return skip(item, "冒涜の MOD はアイテムに 1 つまで");
  const altered = key === "desecrate_altered";
  if (altered && !item.cls.pools.otherworldly) return skip(item, "変質した鎖骨はアミュレット・指輪・ベルトだけ");
  // 深淵の王の印があれば、骨は必ず印を置き換える (側は印の側)。段の下限 33 (仮)。古代の骨とは重ならない (高い方)
  // 固定 (フラクチャー) した印は置き換えない (2026-10-10 点検: 骨が固定済みの印を消していた)。その時は普通の骨と同じ
  const mark = allMods(item).find((m) => m.abyssMark && !m.fractured);
  const floor = Math.max(key === "desecrate_ancient" ? ANCIENT_BONE_FLOOR : 0, mark ? ABYSS_MARK_FLOOR : 0);
  // 古代の骨も最低 MOD レベルのあるカレンシー (用語集 BetterCurrencyMinimumLevel、要望 ㉝ の 3)。深淵の王の印の下限 (仮) は別
  if (key === "desecrate_ancient" && item.itemLevel < ANCIENT_BONE_FLOOR) return skip(item, `アイテムレベルが ${ANCIENT_BONE_FLOOR} 未満には使えない`);
  const factionOmen = used.find((o) => FACTION_TAG[o]);
  if (factionOmen && !bossOmenAllowed(item.cls.category)) return skip(item, "勢力のお告げは武器または宝飾品だけ");
  const faction = factionOmen ? FACTION_TAG[factionOmen]! : null;

  // 側: お告げ → それ、無ければ出うる MOD の重みで
  const omenSide: StageSide | null = mark ? mark.side : used.includes("OmenofSinistralNecromancy") ? "prefix" : used.includes("OmenofDextralNecromancy") ? "suffix" : null;
  const weightOf = (side: StageSide) => pool(data, item, side, floor, altered, faction, undefined).reduce((a, c) => a + c.w, 0);
  let side: StageSide;
  if (omenSide) side = omenSide;
  else {
    const open = SIDES.filter((s) => room(item, s));
    const pick = pickWeighted((open.length ? open : SIDES).map((s) => ({ s, w: weightOf(s) })), rng);
    if (!pick) return skip(item, "付けられる冒涜の MOD が無い");
    side = pick.s;
  }
  if (!(weightOf(side) > 0)) return skip(item, "その側に付けられる冒涜の MOD が無い");
  let cur = item;
  const removed: StageMod[] = [];
  if (mark) {
    cur = without(cur, mark);
    removed.push(mark);
  } else if (!room(cur, side)) {
    const r = removeOne(cur, rng, [side]);
    if (!r) return skip(item, "その側に空きが無い");
    cur = r.item;
    removed.push(r.mod);
  }
  const hidden: StageMod = {
    modId: "unrevealed", family: "unrevealed", side, tierIndex: 0, tierName: "", affix: "", modLevel: 1,
    values: [], ranges: [], textJa: `未発現の冒涜 MOD (${side === "prefix" ? "プレフィックス" : "サフィックス"})`,
    textEn: `Unrevealed Desecrated ${side === "prefix" ? "Prefix" : "Suffix"}`,
    desecrated: true, unrevealed: { floor, altered, faction },
  };
  return { applied: true, item: withMod(cur, hidden), added: [hidden], removed };
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
  const w = (side: StageSide) => pool(data, item, side, floor, altered, faction, undefined).reduce((a, c) => a + c.w, 0);
  return { prefix: w("prefix"), suffix: w("suffix") };
}

/** 発現の候補の置き場 (勢力のお告げなら、その勢力の冒涜の MOD だけを MOD ごとに等しく) */
function pool(data: PatchData, item: StageItem, side: StageSide, floor: number, altered: boolean, faction: string | null, except: StageMod | undefined, plain = false): Candidate[] {
  const c = candidates(data, item, [side], floor, { pools: poolsFor(item, altered, plain), except });
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
 * 発現の候補 3 つ (と、深淵の残響で引き直した 3 つ)。同じ rng から順に引くので、画面で見せる候補と手順の結果が一致する。
 * 組み方 (勢力のお告げ・腐食のお告げ以外): 専用 MOD の個数を DESECRATED_COUNT_RATES で決め、その数を専用 MOD から重みで (指輪だけ実測、
 * 他の部位は全部同じ値なので等しい)、残りを普通の MOD から普通の重みで引いて、並びを混ぜる。専用 MOD が出せない (アイテムレベル 65 未満など) 時は 3 つとも普通
 */
export function revealOffers(data: PatchData, item: StageItem, rng: () => number): { first: StageMod[]; reroll: StageMod[] } {
  const hidden = unrevealedOf(item);
  if (!hidden?.unrevealed) return { first: [], reroll: [] };
  const { floor, altered, faction, plain } = hidden.unrevealed;
  const toMod = (c: Candidate): StageMod => {
    const t = pickWeighted(c.tiers, rng)!;
    return { ...makeStageMod(c.mod, c.side, t.index, rng), desecrated: true };
  };
  // 勢力のお告げ (その勢力の専用だけ) と腐食のお告げ (普通だけ) は 1 つの置き場から重みで
  const drawOne = (): StageMod[] => {
    let rest = pool(data, item, hidden.side, floor, altered, faction, hidden, plain);
    const out: StageMod[] = [];
    for (let i = 0; i < OFFERS && rest.length; i++) {
      const c = pickWeighted(rest, rng)!;
      rest = notClashing(rest, c);
      out.push(toMod(c));
    }
    return out;
  };
  const draw = (): StageMod[] => {
    if (faction || plain) return drawOne();
    const all = pool(data, item, hidden.side, floor, altered, null, hidden);
    const isExclusive = (c: Candidate) => c.mod.source === "desecrated" || (item.cls.pools.otherworldly?.[hidden.side === "prefix" ? "prefixes" : "suffixes"] ?? []).includes(c.mod.id);
    // 専用 MOD どうしは重みで (指輪は実測、他の部位は仮の値が全部同じなので等しい。2026-10-09)
    let ex = all.filter(isExclusive);
    let normal = all.filter((c) => !isExclusive(c));
    if (!ex.length) return drawOne();
    const u = rng();
    const want = u < DESECRATED_COUNT_RATES[0]! ? 1 : u < DESECRATED_COUNT_RATES[0]! + DESECRATED_COUNT_RATES[1]! ? 2 : 3;
    const picked: Candidate[] = [];
    for (let i = 0; i < want && ex.length; i++) {
      const c = pickWeighted(ex, rng)!;
      picked.push(c);
      ex = notClashing(ex, c);
      normal = notClashing(normal, c);
    }
    while (picked.length < OFFERS && (normal.length || ex.length)) {
      const c = normal.length ? pickWeighted(normal, rng)! : pickWeighted(ex, rng)!;
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
  return { first, reroll: draw() };
}
/** reveal:N (N は 1 から) / reveal:N:reroll */
export function applyReveal(data: PatchData, item: StageItem, key: string, rng: () => number, used: readonly string[]): StageApply {
  const hidden = unrevealedOf(item);
  if (!hidden) return skip(item, "未発現の冒涜 MOD が無い");
  const m = /^reveal:(\d)(:reroll)?$/.exec(key);
  if (!m) return skip(item, `発現の手の形が違う (${key})`);
  const reroll = !!m[2];
  if (reroll && !used.includes("OmenofAbyssalEchoes")) return skip(item, `引き直しには${jaOfOmen("OmenofAbyssalEchoes") ?? "アビスの反響のお告げ"}が要る`);
  const offers = revealOffers(data, item, rng);
  const list = reroll ? offers.reroll : offers.first;
  const pick = list[Number(m[1]) - 1];
  if (!pick) return skip(item, "その番号の候補が無い");
  return { applied: true, item: replaced(item, hidden, pick), added: [pick], removed: [hidden] };
}

const unrevealedMod = (side: StageSide, u: NonNullable<StageMod["unrevealed"]>): StageMod => ({
  modId: "unrevealed", family: "unrevealed", side, tierIndex: 0, tierName: "", affix: "", modLevel: 1,
  values: [], ranges: [], textJa: `未発現の冒涜 MOD (${side === "prefix" ? "プレフィックス" : "サフィックス"})`,
  textEn: `Unrevealed Desecrated ${side === "prefix" ? "Prefix" : "Suffix"}`,
  desecrated: true, unrevealed: u,
});

/**
 * 腐食のお告げ: 固定済み (フラクチャー) 以外の MOD を全部外し、枠いっぱいまで未発現の MOD にしてコラプトする (普通 6 つ、フラクチャーがあれば 5 つ)。
 * 発現で出るのは普通の MOD だけ (冒涜専用の勢力の MOD は出ない)。古びた骨でも段の下限は掛からない (PoE2 Wiki の Omen of Putrefaction)
 */
function putrefy(item: StageItem, key: string): StageApply {
  const removed = allMods(item).filter((m) => !m.fractured);
  let cur: StageItem = { ...item, prefixes: item.prefixes.filter((m) => m.fractured), suffixes: item.suffixes.filter((m) => m.fractured) };
  const u = { floor: 0, altered: key === "desecrate_altered", faction: null, plain: true };
  const added: StageMod[] = [];
  for (const side of SIDES) {
    while (room(cur, side)) {
      const m = unrevealedMod(side, u);
      cur = withMod(cur, m);
      added.push(m);
    }
  }
  return { applied: true, item: { ...cur, corrupted: true }, added, removed };
}
