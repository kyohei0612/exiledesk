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
import { addForced, boostedMod, effectiveCls, replaced, type Force } from "./stage-core";
import { socketCapOf, isUnsocket, UNSOCKET_PREFIX } from "./stage-runes";
import { isShard } from "./apply-act";
import { extraBaseFor, reqOfItem } from "./stage-bases";
import { DISPOSE_JA } from "./apply-dispose";
import { parseForce } from "./apply-force";
import { applyRune, isRune, parseRuneKey, runeOf } from "./stage-runes";
import { propRows } from "./stage-props";

/** スキルジェムのサポート枠の最初の数 (未確定。上の freshItem のコメント) */
export const GEM_START_SOCKETS = 2;
import type { CraftStagePlan, CraftStageResult, StageItem as OutItem, StageMod as OutMod, StageStep as OutStep } from "./contract";
import type { StageAugment, StageItem, StageMod, StageSide } from "./types";

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
    // 特殊 MOD のルーンの MOD (重みは公開データに無く仮定) / アルダーのルーンで属性を変えた MOD (要望 ㉙)
    ...(m.rune ? ({ rune: m.rune, assumed_weight: true } as object) : {}),
    ...(m.convertedFrom ? ({ converted_from: m.convertedFrom } as object) : {}),
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
    ...({ requirements: reqOfItem(it) } as object),
    // 要望 ⑰-2: 上の数値 (品質・ローカル MOD・ルーンを反映。up = 素の値から変わった = ゲームでは青)
    ...({ properties: propRows(it, true).map((r) => ({ key: r.key, label: r.label, value: r.value, up: r.up })) } as object),
    // 要望 ⑰-1: ソケットにはめたルーン (はめた順)
    ...({ augments: (it.augments ?? []).map(outAug) } as object),
    ...({ quality_tag: it.qualityTag ?? null, sockets: it.sockets ?? 0, enchant: it.enchant ? { id: it.enchant.id, text_ja: it.enchant.textJa, text_en: it.enchant.textEn } : null, enchant2: it.enchant2 ? { id: it.enchant2.id, text_ja: it.enchant2.textJa, text_en: it.enchant2.textEn } : null, sanctified: !!it.sanctified } as object),
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
  /** 付いた MOD ごとの、付いた瞬間のその段の確率 (乱数で付いた物・指名で付けた物。modId → 0〜1) */
  chances?: Record<string, number>;
}

export const splitOmens = (omen: string | null | undefined): string[] => (omen ? omen.split("+").filter(Boolean) : []);
/** 手の日本語名 (発現は「発現 (2 番目)」) */
export function stepJa(currency: string, item: StageItem): string {
  const fc = parseForce(currency);
  if (fc?.flag === "x") return "× で外す";
  if (fc) return `指名で付ける (${fc.rank ?? "T1"}${fc.flag === "e" ? "・エッセンス" : fc.flag === "d" ? "・冒涜" : fc.flag === "f" ? "・フラクチャー" : ""})`;
  const rv = /^reveal:(\d)(:reroll)?$/.exec(currency);
  if (rv) return `発現 (${rv[2] ? "引き直して " : ""}${rv[1]} 番目)`;
  if (DISPOSE_JA[currency]) return DISPOSE_JA[currency]!;
  if (isUnsocket(currency)) return `ルーンを外す (${currency.slice(UNSOCKET_PREFIX.length)} 番目のソケット)`;
  if (isRune(currency)) {
    // `rune:<名前>@<n>` は n 番目のソケットを指した手 (置き換え)
    const n = parseRuneKey(currency)?.socket;
    return n ? `${runeOf(currency)!.ja} (${n} 番目のソケット)` : runeOf(currency)!.ja;
  }
  return jaOfPriceKey(currency, item.cls) ?? currency;
}
/**
 * 手の英語名 (英語の画面用。指名・発現・解呪・ルーンなど、カレンシーの名前で引けない手だけ。それ以外は null)。
 * 手順の currency_ja は日本語のまま (stepJa)
 */
export function stepEn(currency: string): string | null {
  const fc = parseForce(currency);
  if (fc?.flag === "x") return "Remove (×)";
  if (fc) return `Force (${fc.rank ?? "T1"}${fc.flag === "e" ? ", Essence" : fc.flag === "d" ? ", Desecrated" : fc.flag === "f" ? ", Fractured" : ""})`;
  const rv = /^reveal:(\d)(:reroll)?$/.exec(currency);
  if (rv) return `Reveal (${rv[2] ? "reroll, " : ""}#${rv[1]})`;
  if (currency === "disenchant") return "Disenchant";
  if (currency === "salvage") return "Salvage";
  if (isUnsocket(currency)) return `Remove rune (socket ${currency.slice(UNSOCKET_PREFIX.length)})`;
  const rk = isRune(currency) ? parseRuneKey(currency) : null;
  if (rk) return rk.socket ? `${rk.en} (socket ${rk.socket})` : rk.en;
  return null;
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
  const n = r.count ?? 1;
  const amount = r.applied ? n + used.length : 0;
  const subtotal = r.applied ? each * n + used.reduce((a, k) => a + o.price(k), 0) : 0;
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
    ...(r.note ? { note: r.note } : {}),
    // 指名で付けた手 (要望 ⑱-1): picked と、指名しなかったら付く確率 (動画で「本当は○% の当たり」と言うため)
    ...(r.picked ? ({ picked: true, pick_chance: r.picked.map((p) => ({ mod_id: p.modId, tier_name: p.tierName, chance: p.chance })) } as object) : {}),
    // オーグメント (ルーン) をはめた手 (2026-10-03、足したキー): どのソケット (1 から) に何を。置き換えた時は外れた物と、その行き先
    // (replaced_goes "destroyed" = 壊れて戻らない。src/services/augment-rules.ts)。POE2Tube は無視してよい
    // 発現の手 (要望 ㉕-2): 出た 3 つの候補と選んだ番号 (1 から)。:reroll (アビスの反響) は引き直す前 (first) と後 (rerolled) の両方。
    // applyReveal と同じ種で引くので、選んだ物は changed.added と同じ
    ...(revealOut(data, item, currency, o.seed, r.applied)),
    // 耐性のフラックス: converted = { element, mods: [{ from, to }] }
    ...(r.converted ? ({ converted: { element: r.converted.element, mods: r.converted.mods.map((x) => ({ from: outMod(x.from), to: outMod(x.to) })) } } as object) : {}),
    // 抽出のオーブで取り戻したオーグメント (要望 ㉝ の 13、足したキー)
    ...(r.returned?.length ? ({ returned_augments: r.returned.map(outAug) } as object) : {}),
    ...(r.augment ? ({ augment_change: { socket: r.augment.socket, put: outAug(r.augment.put), replaced: r.augment.replaced ? outAug(r.augment.replaced) : null, replaced_goes: r.augment.replacedGoes,
      // 傑作のルーン: upgraded = { from: 上げる前, to: 上げた後 } (POE2Tube 要望 ㉘)
      ...(r.augment.upgraded ? { upgraded: { from: outAug(r.augment.replaced!), to: outAug(r.augment.put) } } : {}),
      // アルダーのルーン: converted = { element, mods: [{ from, to }] } (要望 ㉙)
      ...(r.augment.converted ? { converted: { element: r.augment.converted.element, mods: r.augment.converted.mods.map((x) => ({ from: outMod(x.from), to: outMod(x.to) })) } } : {}) } } as object) : {}),
  };
  const ch = [...(r.rolled ?? []), ...(r.picked ?? [])];
  return { out, before: item, after: r.item, added: r.added, removed: r.removed, ...(ch.length ? { chances: Object.fromEntries(ch.map((x) => [x.modId, x.chance])) } : {}) };
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
/** runes = 始めから差しておくルーン (英語名、シミュレーションでコルの狩りなどの MOD を狙う時。MOD より先に差す) */
export interface StartSpec { rarity?: StageItem["rarity"]; mods?: Force[]; quality?: number; sockets?: number; runes?: string[] }
export function startFrom(data: PatchData, base: string, itemLevel: number, s: StartSpec, seed: number): StageItem {
  // フラクチャー・冒涜の MOD はレアにしか無い (マジックではフラクチャーも冒涜もできない。2026-10-06 オーナー「ノーマルの奴ならそこで付けたらレアに」)
  // 同じ側に 2 つ目を付けたらレア (マジックは側 1 つずつなので、プレ 2 つは王者を打たないと組めず 1 つずつ止まっていた。2026-10-08 オーナー
  // 「MOD 2 つ以上とかプレフィックス付けだしたらレアにしていいよ」)
  const sideOfKey = (k: string): string => [...data.mods.values()].find((m) => m.id === k || m.id.endsWith(`/${k}`) || m.family === k)?.type ?? "prefix";
  const sameSide = !!s.mods && s.mods.length >= 2 && new Set(s.mods.map((f) => sideOfKey(f.mod))).size < s.mods.length;
  const rarity = s.rarity ?? (s.mods?.some((f) => f.fractured || f.desecrated) || (s.mods && s.mods.length > 2) || sameSide ? "rare" : s.mods?.length ? "magic" : "normal");
  let item: StageItem = { ...freshItem(data, base, itemLevel), rarity, rollSeed: seed };
  const rng = mulberry32(seed);
  if (s.sockets != null) {
    const cap = socketCapOf(item.base, item.cls.category);
    if (s.sockets > cap + 1) throw new Error(`始めの状態のソケット ${s.sockets} は上限 (${cap}、コラプトで +1) を超える`);
    item = { ...item, sockets: s.sockets };
  }
  for (const en of s.runes ?? []) {
    const r = applyRune(item, `rune:${en}`, data);
    if (!r.applied) throw new Error(`始めの状態のルーン ${en}: ${r.reason ?? "差せない"}`);
    item = r.item;
  }
  for (const [i, f] of (s.mods ?? []).entries()) {
    const cur = item;
    // 冒涜は冒涜の置き場と普通の置き場から (骨の発現には普通の MOD も出る。2026-10-06 オーナー「普通の MOD も冒涜で付いたように」)
    const k = (sd: StageSide) => (sd === "prefix" ? "prefixes" : "suffixes") as "prefixes" | "suffixes";
    const r = addForced(data, item, 0, rng, f, f.desecrated ? { pools: (sd) => [...(cur.cls.pools.desecrated?.[k(sd)] ?? []), ...effectiveCls(cur).pools.normal[k(sd)]] } : {});
    if ("error" in r) throw new Error(`始めの状態の MOD ${i + 1} つ目: ${r.error}`);
    // 冒涜でフラクチャー済みの始まりは両方の印 (2026-10-10 オーナー「冒涜 MOD フラクチャーできない」)
    item = f.fractured || f.desecrated ? replaced(r.item, r.mod, { ...r.mod, ...(f.fractured ? { fractured: true } : {}), ...(f.desecrated ? { desecrated: true } : {}) }) : r.item;
  }
  if (s.quality != null) item = { ...item, quality: s.quality };
  return item;
}

export function startItem(data: PatchData, plan: CraftStagePlan): StageItem {
  const start = (plan as { start?: StartSpec }).start;
  if (start) return startFrom(data, plan.base, plan.item_level ?? 80, start, plan.seed - 1);
  const rarity = plan.start_rarity ?? "normal";
  let item: StageItem = { ...freshItem(data, plan.base, plan.item_level ?? 80), rollSeed: plan.seed - 1 };
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
      const x = ps as { outcome?: string; pick?: Force | Force[]; remove?: string; seed?: number };
      const pick = x.pick ? (Array.isArray(x.pick) ? x.pick : [x.pick]) : undefined;
      const hint = { collect: isShard(ps.currency), oneCatalyst: true, ...(x.outcome ? { outcome: x.outcome } : {}), ...(pick ? { pick } : {}), ...(x.remove ? { remove: x.remove } : {}) };
      // 手の乱数: 手に書いてあればそれ (エミュレーターは 2026-10-09 から手ごとに新しい乱数)、無ければ plan.seed + 手の番号 (前の手順 JSON)
      const p = playStep(data, item, ps.currency, { index, seed: x.seed ?? plan.seed + index, price: (k) => prices[k] ?? 0, cumulative, omen: ps.omen ?? null, hint });
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
