/**
 * 動作の部品 (2026-10-16、ADR-004)。部品は「何をするか」だけを持ち、カレンシーの名前・部位の名前で分けない。
 * お告げの効き目は Mods (側・保証する勢力・引き直し・消す物の絞り・普通の MOD だけ) で渡す。
 *
 * 乱数の引き方は、2026-10-16 に外した前の作り (applyBone / putrefy・オーブの switch など) と同じ順にしてある (同じ種なら同じ結果)。
 * 結果は tests/currency-spec-golden.test.ts の控えで見張る。違う引き方にする時は、先にどちらが正しいかを決めてから控えを取り直す
 */
import type { PatchData } from "../../../vendor/poe2htc/engine/types";
import { addForced, addOne, allMods, catalystBoosts, catalystOf, hasExtraCatalyst, removeForced, type Force, makeStageMod, maxQualityOf, overLimit, removeOne, replaced, room, SIDES, skip, skipRandom, unfracturable, withMod, withValues, without } from "../stage-core";
import { whittleTargets } from "../apply-currency";
import { tunedCatalysingMultiplier } from "../stage-tuning";
import { QUALITY_PER_CATALYST } from "../../htc/catalysing-setup";
import { htcBaseInfo } from "../../htc/patch";
import { hasImplicitRange } from "../roll-text";
import { applyRune } from "../stage-runes";
import { emotionNameOf } from "../apply-emotion";
import { jewelEmotionsOf } from "../../htc/patch";
import { FLUX } from "../apply-flux";
import { convertByTable } from "../element-convert";
import { applySanctify } from "../apply-vaal";
import { limitOf, listOf } from "../stage-core";
import type { StageApply, StageItem, StageMod, StageSide } from "../types";
import type { Action } from "./types";
import { addUnrevealed, reveal } from "./parts-unrevealed";
import { tr } from "../../../i18n/lang";
// チュートリアル (StageTopicGuide.vue) はここから読む
export { factionCandidates } from "./parts-unrevealed";

/** お告げで変わった分 (掛かっていなければ null / 0 / false) */
export interface Mods {
  /** 付ける側 (高貴・骨)。付けない手 (消去) では消す側 */
  side: StageSide | null;
  /** 消す側だけ (抹消・結晶化) */
  removeSide: StageSide | null;
  guaranteeTag: string | null;
  rerolls: number;
  pick: "desecrated" | null;
  /** 発現は普通の MOD だけ (腐食のお告げ) */
  plain: boolean;
  /** 足す数 (大いなる高貴) */
  addCount: number | null;
  /** MOD レベルの一番低い物を消す (削り) */
  pickLowest: boolean;
  /** 品質の種類の MOD を重く引いて品質を使い切る (触媒の高貴) */
  catalysing: boolean;
  /** 暗黙の MOD だけ振り直す (祝福) */
  implicitOnly: boolean;
}
export const NO_MODS: Mods = { side: null, removeSide: null, guaranteeTag: null, rerolls: 0, pick: null, plain: false, addCount: null, pickLowest: false, catalysing: false, implicitOnly: false };
export interface PartCtx {
  data: PatchData;
  rng: () => number;
  mods: Mods;
  /** 骨が異界の MOD も出す種類か (腐食のお告げで置き換えた時も、未発現の記録には骨の種類を残す) */
  altered: boolean;
  /** 発現の手の指定 (reveal:N / reveal:N:reroll) */
  reveal: { index: number; reroll: boolean } | { invalid: string } | null;
  /** エッセンスの MOD (打つ前に作る。値は今の関数と同じく消す前に振る) */
  essence?: { mod: StageMod; side: StageSide; clash: (it: StageItem) => boolean } | null;
  /** 触媒の品質の種類 (タグ) */
  catalystTag?: string | null;
  /** 手順の再生: 触媒は 1 手 = 1 個 +1% (手で打つ画面は 1 個 +1〜2%) */
  oneCatalyst?: boolean;
  /** 手の鍵そのもの (ルーン rune:<英語名>@n・感情 emotion:<英語名>・フラックス flux_<属性>) */
  runeKey?: string;
  /** この手で前の部品が消した MOD (アビサルロードの紋章は消した側に付く) */
  removedSoFar: StageMod[];
  /** 付く MOD の指名 (手順の再生、要望 ⑱-1)。足す順。足りない分は乱数。使った数は pickUsed */
  pick?: readonly Force[];
  pickUsed?: number;
  /** 消える MOD の指名 (カオス) */
  removeForce?: string;
}
/** 指名が通らなかった時 (理由つきで打てない、pickError。今の関数と同じ文) */
const pickFail = (item: StageItem, why: string): StageApply => ({ ...skip(item, tr(`指名できない: ${why}`, `Can't force: ${why}`)), pickError: true });

type Remove = Extract<Action, { remove: unknown }>["remove"];
/**
 * 固定以外から消す。冒涜だけ (光のお告げ) は側を見ない (左右の消去は光と一緒には使えない、run-spec.ts の omensOf。2026-10-17 オーナー)。
 * 側: お告げ (抹消・結晶化・左右の消去) → それ。付ける側が埋まっている完全エッセンスは、その側から (sideWhenFull)。
 * 削りのお告げは MOD レベルの一番低い物から (未発現の枠は 1 として数える、apply-currency.ts の whittleTargets)
 */
function remove(ctx: PartCtx, item: StageItem, a: Remove): StageApply {
  if (a.n === "all") {
    const removed = allMods(item).filter((m) => !m.fractured);
    return { applied: true, item: { ...item, prefixes: item.prefixes.filter((m) => m.fractured), suffixes: item.suffixes.filter((m) => m.fractured) }, added: [], removed };
  }
  const pick = ctx.mods.pick ?? a.pick;
  if (pick === "desecrated") {
    const ds = allMods(item).filter((m) => m.desecrated && !m.fractured);
    if (!ds.length) return skip(item, tr("光のお告げ: 冒涜の MOD が無い", "Omen of Light: no Desecrated mod"));
    // 冒涜の MOD は 1 つまでなので、ふつうは 1 つから選ぶ (乱数を使わない)
    const d = ds.length === 1 ? ds[0]! : ds[Math.floor(ctx.rng() * ds.length)]!;
    return { applied: true, item: without(item, d), added: [], removed: [d] };
  }
  const nothing: StageApply = { applied: true, item, added: [], removed: [] };
  if (a.ifAny && !allMods(item).length) return nothing;
  const side = ctx.mods.removeSide ?? ctx.mods.side;
  // 未発現の冒涜 MOD があればそれを消す (深淵のエッセンスは未発現に入れ替わる、2026-10-16 オーナーがゲームで確認)
  if (a.unrevealedFirst && !ctx.removeForce) {
    const us = allMods(item).filter((m) => m.unrevealed && !m.fractured && (!side || m.side === side));
    if (us.length) {
      const u = us.length === 1 ? us[0]! : us[Math.floor(ctx.rng() * us.length)]!;
      return { applied: true, item: without(item, u), added: [], removed: [u] };
    }
  }
  let sides: readonly StageSide[] = side ? [side] : SIDES;
  const e = ctx.essence;
  if (a.sideWhenFull && e && !room(item, e.side)) {
    if (side && side !== e.side) return skip(item, tr("足す側が埋まっているので、お告げの側からは消せない", "The Essence's side is full, so it can't remove from the Omen's side"));
    sides = [e.side];
  }
  let cur = item;
  const removed: StageMod[] = [];
  for (let i = 0; i < a.n; i++) {
    let r: { item: StageItem; mod: StageMod } | null;
    if (ctx.removeForce) {
      // 消える MOD の指名 (要望 ⑱-1)。お告げより先
      const f = removeForced(cur, ctx.removeForce);
      if ("error" in f) return pickFail(item, f.error);
      r = f;
    } else if (ctx.mods.pickLowest) {
      const lows = whittleTargets(cur, side);
      const mod = lows[Math.floor(ctx.rng() * lows.length)];
      r = mod ? { item: without(cur, mod), mod } : null;
    } else r = removeOne(cur, ctx.rng, sides);
    if (!r) break;
    // 上限を超えている側 (侮蔑を外した後のサフィ 3 つ) に当たると付け直せずに弾かれる (2026-10-14 オーナーがゲームで確認、プレに空きがあっても同じ)
    if (a.overLimitVoids && overLimit(cur, r.mod.side)) return skipRandom(item, tr("上限を超えている側に当たったので追加できない (もう一度)", "Hit the side that is over its limit, so nothing can be added (try again)"));
    cur = r.item;
    removed.push(r.mod);
  }
  if (!removed.length) {
    if (a.optional) return nothing;
    return skip(item, side ? tr("お告げの側に外せる MOD が無い", "No removable mod on the Omen's side") : tr("外せる MOD が無い", "No mod can be removed"));
  }
  return { applied: true, item: cur, added: [], removed };
}

type Add = Extract<Action, { add: unknown }>["add"];
/**
 * 普通の MOD の置き場から n 個 (大いなる高貴のお告げで 2 個)。側はお告げの側か両側、空きの無い側には付かない。
 * 候補は付いている系統を除き、アイテムレベル以下・段の下限以上の段の重み (stage-core の addOne = 計算機と同じ)。
 * 触媒の高貴のお告げは品質の種類の MOD を重く引き (tunedCatalysingMultiplier、既定は catalysingMultiplier。stage-tuning.ts)、品質を使い切る
 */
function add(ctx: PartCtx, item: StageItem, a: Add): StageApply {
  const ok = (it: StageItem): StageApply => ({ applied: true, item: it, added: [], removed: [] });
  if (a.emptyOk && !SIDES.some((s) => room(item, s))) return ok(item);
  const n = ctx.mods.addCount ?? a.n;
  const sides = ctx.mods.side ? [ctx.mods.side] : SIDES;
  const { tag, pct } = catalystOf(item);
  const boost = ctx.mods.catalysing && tag ? { test: (m: { id: string; tags?: readonly string[] }) => catalystBoosts(item, { modId: m.id, tags: m.tags }, tag, ctx.data), mult: tunedCatalysingMultiplier(pct) } : undefined;
  const pick = ctx.pick?.slice(ctx.pickUsed ?? 0) ?? [];
  if (pick.length > n) return pickFail(item, tr(`この手で付く MOD は ${n} つまで`, `this adds at most ${n} mod${n === 1 ? "" : "s"}`));
  let cur = item;
  const added: StageMod[] = [];
  const rolled: NonNullable<StageApply["rolled"]> = [];
  const picked: NonNullable<StageApply["picked"]> = [];
  for (let i = 0; i < n; i++) {
    const f = pick[i];
    if (f) {
      const r = addForced(ctx.data, cur, a.floor, ctx.rng, f, { sides, boost });
      if ("error" in r) return pickFail(item, r.error);
      ctx.pickUsed = (ctx.pickUsed ?? 0) + 1;
      cur = r.item;
      added.push(r.mod);
      picked.push({ modId: r.mod.modId, tierName: r.mod.tierName, chance: r.chance });
      continue;
    }
    const r = addOne(ctx.data, cur, a.floor, ctx.rng, { sides, boost });
    if (!r) break;
    cur = r.item;
    added.push(r.mod);
    rolled.push({ modId: r.mod.modId, tierName: r.mod.tierName, chance: r.chance });
  }
  if (!added.length) return a.optional ? ok(item) : skip(item, tr("付けられる MOD が無い", "No mod can be added"));
  // 触媒の高貴は品質を使い切る (グラスピングメイルはカタリストの欄だけ)
  if (ctx.mods.catalysing) cur = hasExtraCatalyst(item.base) ? { ...cur, catalystQuality: 0 } : { ...cur, quality: 0 };
  return { applied: true, item: cur, added, removed: [], ...(picked.length ? { picked } : {}), ...(rolled.length ? { rolled } : {}) };
}

/**
 * 数値を振り直す (神のオーブ)。固定・未発現の枠は変わらない。暗黙の MOD の数値も振り直す (poe2db、2026-10-12 オーナー「暗黙も数値の変動はある」)。
 * ユニークは効果の値を振る種 (rollSeed) を変える。祝福のお告げは暗黙だけ
 */
function reroll(ctx: PartCtx, item: StageItem): StageApply {
  const implicit = hasImplicitRange((htcBaseInfo()[item.base]?.implicits ?? []).map((l) => l.en));
  if (ctx.mods.implicitOnly) {
    if (!implicit) return skip(item, tr("振り直せる暗黙 MOD が無い", "No implicit mod to reroll"));
    return { applied: true, item: { ...item, implicitRoll: (item.implicitRoll ?? 0) + 1, implicitFixed: undefined }, added: [], removed: [], note: tr("祝福のお告げ: 暗黙 MOD だけを振り直した", "Omen of the Blessed: rerolled implicit values only") };
  }
  if (item.rarity === "unique") return { applied: true, item: { ...item, rollSeed: 1 + Math.floor(ctx.rng() * 2 ** 30) }, added: [], removed: [], note: tr("ユニークの数値を振り直し", "Rerolled Unique values") };
  const mods = allMods(item).filter((m) => !m.fractured && !m.unrevealed && m.ranges.length);
  if (!mods.length && !implicit) return skip(item, tr("転がし直せる MOD が無い", "No mod to reroll"));
  let cur: StageItem = implicit ? { ...item, implicitRoll: (item.implicitRoll ?? 0) + 1, implicitFixed: undefined } : item;
  const added: StageMod[] = [];
  for (const m of mods) {
    const mod = ctx.data.mods.get(m.modId);
    if (!mod) continue;
    const next = withValues(m, mod, ctx.rng);
    cur = replaced(cur, m, next);
    added.push(next);
  }
  return { applied: true, item: cur, added, removed: mods };
}

/** 固定以外の 1 つを等しく固定する。未発現の枠と冒涜の MOD は選ばれない (stage-core の unfracturable、2026-10-10 オーナーが実測) */
function fracture(ctx: PartCtx, item: StageItem): StageApply {
  const pool = allMods(item).filter((m) => !unfracturable(ctx.data, item, m));
  if (!pool.length) return skip(item, tr("固定できる MOD が無い (冒涜の MOD は固定されない)", "No mod can be Fractured (Desecrated mods can't be)"));
  const m = pool[Math.floor(ctx.rng() * pool.length)]!;
  const next = { ...m, fractured: true };
  // 固定は消えて付いたのではない (＋ と － に同じ MOD が並んで分かりづらかった。2026-10-08 完成判定)
  return { applied: true, item: replaced(item, m, next), added: [next], removed: [] };
}

type AddEssence = Extract<Action, { addEssence: unknown }>["addEssence"];
/**
 * エッセンスの MOD を付ける。ofMod: その MOD の側 (空きが無ければ弾く、クラフト MOD どうしの系統がぶつかれば弾く)。
 * removedSide: アビサルロードの紋章 = 消した側、消していなければお告げの側か空いている側 (2026-10-03 SaVeQ 0.5.5 / poe2fun)
 */
function addEssence(ctx: PartCtx, item: StageItem, a: AddEssence): StageApply {
  const e = ctx.essence!;
  const gone = ctx.removedSoFar[0];
  if (a.side === "removedSide") {
    const omen = ctx.mods.removeSide;
    if (omen && !gone && !room(item, omen)) return skip(item, tr("お告げの側に外せる MOD も空きも無い", "No removable mod or open slot on the Omen's side"));
    const side: StageSide | undefined = gone ? gone.side : omen ?? SIDES.find((x) => room(item, x));
    if (!side) return skip(item, tr("外せる MOD も空きも無い", "No removable mod or open slot"));
    const mark: StageMod = { ...e.mod, side, abyssMark: true };
    return { applied: true, item: withMod(item, mark), added: [mark], removed: [] };
  }
  if (!room(item, e.side)) return skip(item, tr("足す側に空きが無い", "No open slot on that side"));
  // 消えたのがぶつかる MOD でなかった時だけ (アストリッドで作った MOD が 2 つ以上ある時に当たり所で決まる)
  if (e.clash(item)) return (gone ? skipRandom : skip)(item, tr("同じ系統の MOD が付いている", "A mod of the same group is already on the item"));
  return { applied: true, item: withMod(item, e.mod), added: [e.mod], removed: [] };
}

type Quality = Extract<Action, { quality: unknown }>["quality"];
/** 品質を上げる。上がる量は候補から等分で引く (候補が 1 つなら乱数を使わない)。上限は超えない */
function quality(ctx: PartCtx, item: StageItem, a: Quality): StageApply {
  const step = a.steps.length === 1 ? a.steps[0]! : a.steps[Math.min(a.steps.length - 1, Math.floor(ctx.rng() * a.steps.length))]!;
  return { applied: true, item: { ...item, quality: Math.min(a.max, item.quality + step) }, added: [], removed: [] };
}

/**
 * 触媒の品質: 種類を変えると 0 から (「Replaces other quality types」)。手で打つ画面は 1 個ずつ +1% か +2% (等分。
 * 2026-10-17 オーナー「1% から 2% の完全ランダムで手動で」。前は 1 手で上限まで)。
 * 手順の再生は 1 手 = 1 個 +1% (手順の times は上げた分の数で書く)。上限はベースの最大品質 + 「品質の最大値 +N%」の MOD
 */
function catalyst(ctx: PartCtx, item: StageItem): StageApply {
  const tag = ctx.catalystTag!;
  const max = maxQualityOf(item);
  // 暗黙でカタリストを許すベース (グラスピングメイル) はベースの品質とは別の欄 (catalystQuality) に入る
  const extra = hasExtraCatalyst(item.base);
  const base = item.qualityTag === tag ? catalystOf(item).pct : 0;
  const put = (n: number): StageItem => (extra ? { ...item, catalystQuality: n, qualityTag: tag } : { ...item, quality: n, qualityTag: tag });
  const step = ctx.oneCatalyst ? QUALITY_PER_CATALYST : CATALYST_ROLLS[Math.floor(ctx.rng() * CATALYST_ROLLS.length)]!;
  return { applied: true, item: put(Math.min(max, base + step)), added: [], removed: [] };
}

/** 手で打つ触媒 1 個で上がる品質 (等分) */
const CATALYST_ROLLS = [1, 2] as const;

/** 液化した感情の作った MOD を付ける (消すのは前の部品)。2 つの版がある物は、空きのある側の版から等しく 1 つ */
function addEmotion(ctx: PartCtx, item: StageItem): StageApply {
  const entries = jewelEmotionsOf(item.cls.id).filter((e) => e.item === emotionNameOf(ctx.runeKey ?? ""));
  const fits = entries.filter((x) => listOf(item, x.side as StageSide).length < limitOf(item, x.side as StageSide));
  if (!fits.length) return skipRandom(item, tr("付ける側に空きが無いので追加できない (もう一度)", "No room on the side this mod goes to, so nothing can be added (try again)"));
  const e = fits.length === 1 ? fits[0]! : fits[Math.floor(ctx.rng() * fits.length)]!;
  const mod = ctx.data.mods.get(e.modId);
  if (!mod) return skip(item, tr("感情の MOD のデータが無い", "No data for this emotion's mod"));
  const added: StageMod = { ...makeStageMod(mod, e.side as StageSide, 0, ctx.rng), crafted: true };
  return { applied: true, item: withMod(item, added), added: [added], removed: [] };
}
/** 属性の MOD を変える (フラックス)。変える物が無ければ打てない */
function convertElements(ctx: PartCtx, item: StageItem, res: boolean): StageApply {
  const f = FLUX[ctx.runeKey ?? ""];
  if (!f) return skip(item, tr("フラックスの種類が分からない", "Unknown Flux"));
  const c = convertByTable(ctx.data, item, f.element, f.eats, res, "flux");
  if (!c.mods.length) return skip(item, tr("変換できる耐性モッドが無い", "No resistance mod to convert"));
  return { applied: true, item: c.item, added: c.mods.map((x) => x.to), removed: c.mods.map((x) => x.from), converted: { element: f.element, mods: c.mods } };
}

/** 部品を 1 つ打つ */
export function runPart(ctx: PartCtx, item: StageItem, a: Action): StageApply {
  if ("addUnrevealed" in a) return addUnrevealed(ctx, item, a.addUnrevealed);
  if ("reveal" in a) return reveal(ctx, item, a.reveal);
  if ("remove" in a) return remove(ctx, item, a.remove);
  if ("setRarity" in a) return { applied: true, item: { ...item, rarity: a.setRarity }, added: [], removed: [] };
  if ("add" in a) return add(ctx, item, a.add);
  if ("reroll" in a) return reroll(ctx, item);
  if ("fracture" in a) return fracture(ctx, item);
  if ("addEssence" in a) return addEssence(ctx, item, a.addEssence);
  if ("quality" in a) return quality(ctx, item, a.quality);
  if ("catalyst" in a) return catalyst(ctx, item);
  if ("addSocket" in a) return { applied: true, item: { ...item, sockets: (item.sockets ?? 0) + 1 }, added: [], removed: [] };
  // ルーンのはめ方は説明文から作った表 (augment-rules.json) に通す今の関数そのまま (部位・数・置き換え・コラプト後も表で決まる)
  if ("socketAugment" in a) return applyRune(item, ctx.runeKey!, ctx.data);
  if ("addEmotion" in a) return addEmotion(ctx, item);
  if ("convertElements" in a) return convertElements(ctx, item, a.convertElements.res);
  if ("sanctify" in a) return applySanctify(ctx.data, item, ctx.rng);
  return { applied: true, item: { ...item, corrupted: true }, added: [], removed: [] };
}
