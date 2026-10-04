/**
 * クラフトステージ: 手順 JSON (POE2Tube → ExileDesk) を 1 手ずつ打って、結果 JSON を組む (2026-09-27、ADR-001)
 *
 * 受け渡しの形は POE2Tube の contracts が正 (contract.ts は自動生成)。決まり (contracts/README.md):
 *   - steps は plan.steps の times を展開した数と 1:1。steps[i].before == steps[i-1].after、final == 最後の after
 *   - 使えない手は飛ばさず applied:false + reason、before == after
 *   - 1 手ごとの seed は plan.seed + 手の番号 (1 から)。同じ手順 JSON なら結果 JSON も同じ
 *   - 費用は price_unit (ここでは高貴) の相場。キーは price-keys.json のカレンシー
 * 画面 (手で打つ) も同じ playStep を使うので、画面で打った手を手順 JSON にして流すと同じ結果になる。
 * お告げは 1 手に何枚でも重ねられるので、omen は id を「+」でつなぐ (例 "OmenofGreaterExaltation+OmenofSinistralExaltation")。
 * 結果の omen はその手で実際に食った物 (関係の無いお告げは食わない)。費用はカレンシー + 食ったお告げ。
 */
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { itemBaseFor } from "../htc/bridge";
import { jaOfOmen, jaOfPriceKey } from "../htc/labels";
import { mulberry32 } from "../htc/rng";
import { jaTypeName } from "../trade2/localize";
import { applyCurrency, type ApplyHint } from "./apply-currency";
import { revealOffers } from "./apply-desecrate";
import { addForced, boostedMod, type Force } from "./stage-core";
import { socketCapOf } from "./stage-runes";
import { isShard } from "./apply-act";
import { extraBaseFor, reqOf } from "./stage-bases";
import { DISPOSE_JA } from "./apply-dispose";
import { isRune, parseRuneKey, runeOf } from "./stage-runes";
import { propRows } from "./stage-props";

/** スキルジェムのサポート枠の最初の数 (未確定。上の freshItem のコメント) */
export const GEM_START_SOCKETS = 2;
import type { CraftStagePlan, CraftStageResult, StageItem as OutItem, StageMod as OutMod, StageStep as OutStep } from "./contract";
import type { StageAugment, StageItem, StageMod } from "./types";

/** 白 (か手順の開始のレアリティ) の新品 */
export function freshItem(data: PatchData, base: string, itemLevel: number, rarity: StageItem["rarity"] = "normal"): StageItem {
  // 計算機のベースに無ければ、フラスコ・スキルジェムの仮のベース (要望 ⑧)
  const extra = itemBaseFor(data, base) ? null : extraBaseFor(base);
  const cls = itemBaseFor(data, base) ?? extra?.cls;
  if (!cls) throw new Error(`ベースが見つからない: ${base}`);
  const baseJa = extra?.ja ?? jaTypeName(base);
  const gem = cls.category === "SkillGem";
  // スキルジェムのサポート枠の最初の数: **一次ソースなし (未確定)**。宝飾職人のオーブ (見習い) の「3 つ未満にだけ使える」から 2 と置く
  return { base, baseJa, cls, itemLevel, rarity: gem ? "normal" : rarity, prefixes: [], suffixes: [], quality: 0, corrupted: false, ...(gem ? { gemSockets: GEM_START_SOCKETS } : {}) };
}

export function outMod(m: StageMod): OutMod {
  return {
    mod_id: m.modId,
    family: m.family,
    side: m.side,
    tier_name: m.tierName,
    mod_level: m.modLevel,
    text_ja: m.textJa,
    text_en: m.textEn,
    values: m.values,
    ranges: m.ranges,
    ...(m.fractured ? { fractured: true } : {}),
    ...(m.desecrated ? { desecrated: true } : {}),
    ...(m.crafted ? { crafted: true } : {}),
    ...(m.unrevealed ? ({ unrevealed: true } as object) : {}),
    // 足したキー (POE2Tube は無視してよい): 段の添字と接頭 / 接尾語
    ...({ tier_index: m.tierIndex, affix: m.affix } as object),
  } as OutMod;
}
/**
 * そのアイテムの中の MOD として書き出す。カタリストの品質で伸びる MOD は text_ja / text_en / values を伸びた後に、
 * 元は raw_values / raw_text_ja / raw_text_en に残す (POE2Tube 要望 ㉔-4)
 */
export function outModIn(it: StageItem, m: StageMod, data?: PatchData): OutMod {
  const o = outMod(m);
  // data があれば伸びた後の文を雛形から作り直す (「#」の位置だけ変わる)。無ければ数字の差し替え (stage-core の retext)
  const b = boostedMod(it, m, data);
  if (!b) return o;
  return { ...o, text_ja: b.textJa, text_en: b.textEn, values: b.values, ...({ quality_boosted: true, raw_values: m.values, raw_text_ja: m.textJa, raw_text_en: m.textEn } as object) } as OutMod;
}
export function outItem(it: StageItem, data?: PatchData): OutItem {
  return {
    name: it.baseJa,
    base: it.base,
    base_ja: it.baseJa,
    item_level: it.itemLevel,
    rarity: it.rarity,
    quality: it.quality,
    corrupted: it.corrupted,
    identified: it.identified !== false,
    destroyed: !!it.destroyed,
    // 足したキー (POE2Tube は無視してよい): 品質の種類・ソケットの数 (sockets は POE2Tube の型にもある)・ユニーク名・ジェムの枠・シャード
    ...({ unique: it.unique ?? null, gem_sockets: it.gemSockets ?? null, shards: it.shards ?? null } as object),
    // 要望 ⑰-5: 解呪 / サルベージで無くなった ("disenchant" / "salvage") と、手に入った品質カレンシー
    ...({ disposed: it.disposed ?? null, gained: it.gained ?? null } as object),
    // 要望 ⑱-3: 装備に必要なレベル・能力値 (PoB の req。要求レベル = ドロップレベル)
    ...({ requirements: reqOf(it.base) } as object),
    // 要望 ⑰-2: 上の数値 (品質・ローカル MOD・ルーンを反映。up = 素の値から変わった = ゲームでは青)
    ...({ properties: propRows(it).map((r) => ({ key: r.key, label: r.label, value: r.value, up: r.up })) } as object),
    // 要望 ⑰-1: ソケットにはめたルーン (はめた順)
    ...({ augments: (it.augments ?? []).map(outAug) } as object),
    ...({ quality_tag: it.qualityTag ?? null, sockets: it.sockets ?? 0, enchant: it.enchant ? { id: it.enchant.id, text_ja: it.enchant.textJa, text_en: it.enchant.textEn } : null, sanctified: !!it.sanctified } as object),
    prefixes: it.prefixes.map((m) => outModIn(it, m, data)) as OutItem["prefixes"],
    suffixes: it.suffixes.map((m) => outModIn(it, m, data)) as OutItem["suffixes"],
  };
}

/** はめたオーグメント 1 つ (結果 JSON の augments の 1 つと同じ形) */
const outAug = (a: StageAugment) => ({ key: a.key, en: a.en, ja: a.ja, category: a.cat, text_ja: a.textJa, text_en: a.textEn, stats: a.stats });

/** 1 手の記録 (画面の履歴にも使う) と、打った後のアイテム */
export interface PlayedStep {
  out: OutStep;
  before: StageItem;
  after: StageItem;
  added: StageMod[];
  removed: StageMod[];
}

export const splitOmens = (omen: string | null | undefined): string[] => (omen ? omen.split("+").filter(Boolean) : []);
/** 手の日本語名 (発現は「発現 (2 番目)」) */
export function stepJa(currency: string, item: StageItem): string {
  const rv = /^reveal:(\d)(:reroll)?$/.exec(currency);
  if (rv) return `発現 (${rv[2] ? "引き直して " : ""}${rv[1]} 番目)`;
  if (DISPOSE_JA[currency]) return DISPOSE_JA[currency]!;
  if (isRune(currency)) {
    // `rune:<名前>@<n>` は n 番目のソケットを指した手 (置き換え)
    const n = parseRuneKey(currency)?.socket;
    return n ? `${runeOf(currency)!.ja} (${n} 番目のソケット)` : runeOf(currency)!.ja;
  }
  return jaOfPriceKey(currency, item.cls) ?? currency;
}

/**
 * 1 手打つ。seed はその手の種 (開始の seed + 手の番号)。price はキー (カレンシー・お告げ) → 1 個の値段 (高貴)、cumulative は前の手までの累計
 */
export function playStep(
  data: PatchData, item: StageItem, currency: string,
  o: { index: number; seed: number; price: (key: string) => number; cumulative: number; omen?: string | null; hint?: ApplyHint },
): PlayedStep {
  const r = applyCurrency(data, item, currency, mulberry32(o.seed), splitOmens(o.omen), o.hint);
  const used = r.omensUsed ?? [];
  // 使えない手は使っていない (費用も 0)。each はカレンシー 1 個、subtotal はお告げ込み
  const each = o.price(currency);
  const amount = r.applied ? 1 + used.length : 0;
  const subtotal = r.applied ? each + used.reduce((a, k) => a + o.price(k), 0) : 0;
  const cumulative = o.cumulative + subtotal;
  const out: OutStep = {
    index: o.index,
    currency,
    currency_ja: stepJa(currency, item),
    omen: used.length ? used.join("+") : null,
    omen_ja: used.length ? used.map((k) => jaOfOmen(k) ?? k).join("・") : null,
    seed: o.seed,
    applied: r.applied,
    reason: r.reason ?? null,
    before: outItem(item, data),
    after: outItem(r.item, data),
    changed: { added: r.added.map((m) => outModIn(r.item, m, data)), removed: r.removed.map((m) => outModIn(item, m, data)), rarity_from: item.rarity, rarity_to: r.item.rarity },
    cost: { each, amount, subtotal, cumulative },
    // 指名で付けた手 (要望 ⑱-1): picked と、指名しなかったら付く確率 (動画で「本当は○% の当たり」と言うため)
    ...(r.picked ? ({ picked: true, pick_chance: r.picked.map((p) => ({ mod_id: p.modId, tier_name: p.tierName, chance: p.chance })) } as object) : {}),
    // オーグメント (ルーン) をはめた手 (2026-10-03、足したキー): どのソケット (1 から) に何を。置き換えた時は外れた物と、その行き先
    // (replaced_goes "destroyed" = 壊れて戻らない。src/services/augment-rules.ts)。POE2Tube は無視してよい
    // 発現の手 (要望 ㉕-2): 出た 3 つの候補と選んだ番号 (1 から)。:reroll (アビスの反響) は引き直す前 (first) と後 (rerolled) の両方。
    // applyReveal と同じ種で引くので、選んだ物は changed.added と同じ
    ...(revealOut(data, item, currency, o.seed, r.applied)),
    ...(r.augment ? ({ augment_change: { socket: r.augment.socket, put: outAug(r.augment.put), replaced: r.augment.replaced ? outAug(r.augment.replaced) : null, replaced_goes: r.augment.replacedGoes,
      // 傑作のルーン: upgraded = { from: 上げる前, to: 上げた後 } (POE2Tube 要望 ㉘)
      ...(r.augment.upgraded ? { upgraded: { from: outAug(r.augment.replaced!), to: outAug(r.augment.put) } } : {}) } } as object) : {}),
  };
  return { out, before: item, after: r.item, added: r.added, removed: r.removed };
}

/** 発現の手の候補 (結果 JSON の reveal_offers)。発現の手でなければ空 */
function revealOut(data: PatchData, item: StageItem, currency: string, seed: number, applied: boolean): object {
  const m = /^reveal:(\d)(:reroll)?$/.exec(currency);
  if (!m || !applied) return {};
  const offers = revealOffers(data, item, mulberry32(seed));
  const rerolled = !!m[2];
  return {
    reveal_offers: {
      chosen: Number(m[1]),
      rerolled,
      first: offers.first.map((x) => outModIn(item, x, data)),
      after_reroll: rerolled ? offers.reroll.map((x) => outModIn(item, x, data)) : null,
    },
  };
}

export interface RunMeta {
  /** カレンシー 1 個の値段 (高貴建て、price-keys のキー → 値)。無ければ 0 */
  prices: Readonly<Record<string, number>>;
  exiledeskVersion: string;
  patch: string;
  league: string | null;
  /** 書き出し時刻 (ISO)。検算で固定するため外から渡せる */
  generatedAt?: string;
}

/**
 * 手順の始めのアイテム。start_rarity がマジック / レアなら、落ちた物のように MOD を付けて始める
 * (マジック = 変成 + 半分の確率で増強、レア = 錬金。seed は plan.seed - 1 で決まる)。
 * start_unidentified: true (手順 JSON の追加キー、要望 ⑧) なら未鑑定で始める (MOD は隠れ、鑑定の巻物で見える)
 */
/**
 * 始めの状態の指名 (要望 ⑱-2、2026-09-29 オーナー「指定 MOD 選んでからそこからクラフトできるように、動画用として」):
 *   手順 JSON の start: { rarity, mods: [{ mod, tier?, values? }], quality?, sockets? }。「拾ったレア」「高貴を打ちまくったレア」を手を見せずに出す。
 *   MOD は 1 つずつ付きうる物だけ (付く MOD の指名 pick と同じ決まり。強さの下限は無し)。付けられなければエラーで止める
 */
export interface StartSpec { rarity?: StageItem["rarity"]; mods?: Force[]; quality?: number; sockets?: number }
export function startFrom(data: PatchData, base: string, itemLevel: number, s: StartSpec, seed: number): StageItem {
  const rarity = s.rarity ?? (s.mods && s.mods.length > 2 ? "rare" : s.mods?.length ? "magic" : "normal");
  let item: StageItem = { ...freshItem(data, base, itemLevel), rarity };
  const rng = mulberry32(seed);
  for (const [i, f] of (s.mods ?? []).entries()) {
    const r = addForced(data, item, 0, rng, f);
    if ("error" in r) throw new Error(`始めの状態の MOD ${i + 1} つ目: ${r.error}`);
    item = r.item;
  }
  if (s.quality != null) item = { ...item, quality: s.quality };
  if (s.sockets != null) {
    const cap = socketCapOf(item.base, item.cls.category);
    if (s.sockets > cap + 1) throw new Error(`始めの状態のソケット ${s.sockets} は上限 (${cap}、コラプトで +1) を超える`);
    item = { ...item, sockets: s.sockets };
  }
  return item;
}

export function startItem(data: PatchData, plan: CraftStagePlan): StageItem {
  const start = (plan as { start?: StartSpec }).start;
  if (start) return startFrom(data, plan.base, plan.item_level ?? 80, start, plan.seed - 1);
  const rarity = plan.start_rarity ?? "normal";
  let item = freshItem(data, plan.base, plan.item_level ?? 80);
  const rng = mulberry32(plan.seed - 1);
  if (rarity === "magic") {
    item = applyCurrency(data, item, "transmute", rng).item;
    if (rng() < 0.5) item = applyCurrency(data, item, "augment", rng).item;
  } else if (rarity === "rare") {
    item = applyCurrency(data, item, "alchemy", rng).item;
  } else if (rarity === "unique") {
    item = { ...item, rarity: "unique" };
  }
  if ((plan as { start_unidentified?: boolean }).start_unidentified && (rarity === "magic" || rarity === "rare")) item = { ...item, identified: false };
  return item;
}

/** 手順を 1 手ずつ打って、全部の手の記録を返す (upTo まで。画面の再生モードの ?step=N) */
export function playPlan(data: PatchData, plan: CraftStagePlan, prices: Readonly<Record<string, number>>, upTo = Infinity): { steps: PlayedStep[]; final: StageItem } {
  if (plan.start_paste) throw new Error("途中からの開始 (start_paste) はまだ使えない (Phase 2)");
  let item = startItem(data, plan);
  const steps: PlayedStep[] = [];
  let cumulative = 0;
  let index = 0;
  for (const ps of plan.steps) {
    for (let k = 0; k < (ps.times ?? 1); k++) {
      if (index >= upTo) return { steps, final: item };
      index++;
      // シャードの手は「1 個拾う」、可能性のオーブは outcome で結果を指定できる (要望 ⑧。outcome は POE2Tube の手順 JSON の追加キー)
      // pick / remove: 付く MOD・消える MOD の指名 (要望 ⑱-1)。pick は 1 つか配列
      const x = ps as { outcome?: string; pick?: Force | Force[]; remove?: string };
      const pick = x.pick ? (Array.isArray(x.pick) ? x.pick : [x.pick]) : undefined;
      const hint = { collect: isShard(ps.currency), ...(x.outcome ? { outcome: x.outcome } : {}), ...(pick ? { pick } : {}), ...(x.remove ? { remove: x.remove } : {}) };
      const p = playStep(data, item, ps.currency, { index, seed: plan.seed + index, price: (k) => prices[k] ?? 0, cumulative, omen: ps.omen ?? null, hint });
      // 指名が通らない手順はエラーで止める (理由を返す)。指名の無い手の「打てない」は今まで通り記録して進む
      if ((pick || x.remove) && !p.out.applied) throw new Error(`手 ${index} (${ps.currency}): ${p.out.reason}`);
      steps.push(p);
      item = p.after;
      cumulative = p.out.cost.cumulative;
    }
  }
  return { steps, final: item };
}

/** 結果 JSON に組む */
export function resultOf(plan: CraftStagePlan, steps: readonly PlayedStep[], final: StageItem, meta: RunMeta, data?: PatchData): CraftStageResult {
  return {
    schema: "craft-stage-result/1",
    generated_at: meta.generatedAt ?? new Date().toISOString(),
    exiledesk_version: meta.exiledeskVersion,
    patch: meta.patch,
    league: meta.league,
    price_unit: "exalted",
    plan,
    steps: steps.map((s) => s.out) as CraftStageResult["steps"],
    final: outItem(final, data),
    total_cost: steps.length ? steps[steps.length - 1]!.out.cost.cumulative : 0,
  };
}

/** 手順を打って結果 JSON まで (CLI 用) */
export function runPlan(data: PatchData, plan: CraftStagePlan, meta: RunMeta): CraftStageResult {
  const { steps, final } = playPlan(data, plan, meta.prices);
  return resultOf(plan, steps, final, meta, data);
}
