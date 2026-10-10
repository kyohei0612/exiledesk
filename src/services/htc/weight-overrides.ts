/**
 * weight-overrides.ts — 重みが仮置きの 1 のままの MOD を、別の出どころで埋める (2026-09-23)
 *
 * ## 何が起きていたか
 * PoE2 のクライアントは MOD の重みを持っていません (0/1 だけ)。同梱エンジンの重みは poe2db から
 * 取っていますが、poe2db も「PoE1 で同じ系統の MOD の重み」を当てはめた推定で、**PoE2 の新 MOD は
 * 1 = 不明のまま**です (2026-09-29 に消した scripts/build-mod-weights-poe2db.mjs の注意書き。規格外の賭けも今はこのエンジンの重み)。
 *
 * その 1 を本物の重みとして計算していました。指輪のキャストスピード (5 段とも重み 1) は、
 * 知性 (1 段 1,000) の 1,000 分の 1 扱いになり、「サフィ 1 個で 1/20,964」「カオスで出すと 1 万神」
 * という数字が出ていました。**全部仮置きのせい**です。本家 poe2htc.com もキャスピの段が 0.0% と
 * 出ていて、同じ仮置きを使っていると見られます。
 *
 * ## 埋める値 — Craft of Exile (beta, PoE2) の重み (2026-09-23 確定)
 * CoE の普通 MOD の重みは私たちの表 (poe2db) と全部一致する (指輪の普通 MOD 30 種で確認)。
 * 仮置きの所だけ CoE で埋める。キャスピは**指輪 1 段 1,000 / 首飾り 1 段 800**。
 *
 * 経緯: 一度「動画でカオス約 500 回に 1 回」から 1 段 60 に下げたが、その 500 回はキャスピ **T1** の
 * 回数だった。CoE のシミュレーターで、固定済みの樹 MOD 1 つ + 外れ 1 つのニーモニックリングに
 * カオスを打つと T1 は 152 回に 1 回 (55 個、最悪 566 回)。オーナー判断で CoE に合わせる。
 *
 * ## 他の仮置き MOD (2026-09-23 オーナー:「他の MOD で同じような奴も合わせて重さ変えよう」)
 * 普通 MOD で仮置きのままだったのは 14 個。2 通りで埋める:
 * 1. **同じ系統の MOD が他の部位で本物の重みを持っている物 (11 個) は、そこから借りる**
 *    (ES リチャージ率 / アイテムレアリティ / 矢筒の追加の矢)。借りる先は、同じ部位 → 同じ能力値の組
 *    (例: `_int`) → どこでも、の順。段は同じ ilvl、無ければそれ以下で一番近い段。候補が複数なら
 *    **一番小さい重み** (つきにくい側に倒す)。
 * 2. **どこにも数字が無い物 (クロスボウのグレネード 3 個) は、CoE の値をそのまま使う**。
 */
import { tr } from "../../i18n/lang";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** 画面に出す断り書き (英語は weightOverrideNote()) */
export const WEIGHT_OVERRIDE_NOTE =
  "重みはコミュニティのデータから参照しています (この MOD の重みはゲームのデータに無い)。他の部位に同じ MOD がある物はそこの重みを借り、"
  + "無い物 (キャストスピードなど) は Craft of Exile の値を使っています。";

/** 断り書きを今の言語で (2026-10-10 英語版) */
export const weightOverrideNote = (): string => tr(WEIGHT_OVERRIDE_NOTE, "This mod's weight isn't in the game data, so it comes from community data: borrowed from the same mod on other item types, or Craft of Exile's value where none exists (e.g. Cast Speed).");

/** MOD id → 段の出始め ilvl ごとの重み */
const OVERRIDES: Record<string, { source: string; byIlvl: Record<number, number> }> = {
  "Rings/IncreasedCastSpeed": {
    source: "Craft of Exile (beta, PoE2) CastSpeedJewellery1-5 / ring",
    byIlvl: { 1: 1000, 18: 1000, 35: 1000, 51: 1000, 60: 1000 },
  },
  "Amulets/IncreasedCastSpeed": {
    source: "Craft of Exile (beta, PoE2) CastSpeedJewellery1-6 / amulet",
    byIlvl: { 1: 800, 18: 800, 35: 800, 51: 800, 60: 800, 66: 800 },
  },
  "Crossbows_cannon/GrenadeCooldownUse": {
    source: "Craft of Exile GrenadeSkillAdditionalCooldownUse1-2 (500 / 250)",
    byIlvl: { 72: 500, 81: 250 },
  },
  "Crossbows_cannon/AdditionalProjectiles": {
    source: "Craft of Exile GrenadeSkillAdditionalProjectile1-2 (250 / 125)",
    byIlvl: { 72: 250, 81: 125 },
  },
  "Crossbows_cannon/CooldownRecovery": {
    source: "Craft of Exile GrenadeSkillCooldownRecovery1-6 (1,000)",
    byIlvl: { 4: 1000, 16: 1000, 33: 1000, 46: 1000, 60: 1000, 81: 1000 },
  },
};

/** 上書き・借用で重みを埋めた MOD の id (画面で「推定値」と断るため)。借用分は applyWeightOverrides で足す */
const overridden = new Set(Object.keys(OVERRIDES));
export const OVERRIDDEN: ReadonlySet<string> = overridden;

/** 重みが「全段 1 以下」= 仮置きのままか */
export function isPlaceholderWeight(mod: Mod): boolean {
  return mod.tiers.length > 0 && mod.tiers.every((t) => t.weight <= 1);
}

const ATTRS = /_((?:str|dex|int)(?:_(?:str|dex|int))*)$/;
const slotOf = (cls: string) => cls.replace(ATTRS, "");
const attrsOf = (cls: string) => ATTRS.exec(cls)?.[1] ?? "";

/** donor の段から、ilvl が同じ段 → それ以下で一番近い段 → 一番低い段、の重み */
function weightAt(donor: Mod, ilvl: number): number {
  const real = donor.tiers.filter((t) => t.weight > 1);
  const same = real.find((t) => t.ilvl === ilvl);
  if (same) return same.weight;
  const below = real.filter((t) => t.ilvl <= ilvl).sort((a, b) => b.ilvl - a.ilvl)[0];
  return (below ?? [...real].sort((a, b) => a.ilvl - b.ilvl)[0])!.weight;
}

/** 同じ系統 (id の "/" の後ろ) で本物の重みを持つ普通 MOD。同じ部位 → 同じ能力値の組 → どこでも */
function donorsFor(mod: Mod, byFam: ReadonlyMap<string, Mod[]>): Mod[] {
  const [cls, fam] = mod.id.split("/") as [string, string];
  const pool = (byFam.get(fam) ?? []).filter((m) => m.id !== mod.id);
  const slot = pool.filter((m) => slotOf(m.id.split("/")[0]!) === slotOf(cls));
  if (slot.length) return slot;
  const attrs = attrsOf(cls);
  const same = attrs ? pool.filter((m) => attrsOf(m.id.split("/")[0]!) === attrs) : [];
  return same.length ? same : pool;
}

/**
 * 仮置きの重みを上書きしたデータを返す。**仮置きのままの所だけ**上書きします
 * (本物の重みが入ってきたら、そちらが勝つ)。表の上書き → 同じ系統からの借用、の順。
 */
export function applyWeightOverrides(data: PatchData): { data: PatchData; applied: string[] } {
  const mods = new Map(data.mods);
  const applied: string[] = [];
  for (const [id, o] of Object.entries(OVERRIDES)) {
    const m = mods.get(id);
    if (!m || !isPlaceholderWeight(m)) continue;
    const tiers = m.tiers.map((t) => (o.byIlvl[t.ilvl] != null ? { ...t, weight: o.byIlvl[t.ilvl]! } : t));
    mods.set(id, { ...m, tiers });
    applied.push(id);
  }
  const all = [...mods.values()];
  // 借りる先の候補 (本物の重みの普通 MOD) を系統ごとに 1 回だけ並べる。MOD ごとに全部を見直すと、
  // クライアント由来の MOD が増えて 0.8 秒かかり、計算機を開くたびに画面が止まっていた (2026-10-07)
  const byFam = new Map<string, Mod[]>();
  for (const m of all) {
    if (m.source !== "normal" || isPlaceholderWeight(m)) continue;
    const fam = m.id.split("/")[1] ?? "";
    const list = byFam.get(fam);
    if (list) list.push(m); else byFam.set(fam, [m]);
  }
  for (const m of all) {
    if (m.source !== "normal" || !isPlaceholderWeight(m) || overridden.has(m.id)) continue;
    const donors = donorsFor(m, byFam);
    if (!donors.length) continue;
    const tiers = m.tiers.map((t) => ({ ...t, weight: Math.min(...donors.map((d) => weightAt(d, t.ilvl))) }));
    mods.set(m.id, { ...m, tiers });
    overridden.add(m.id);
    applied.push(m.id);
  }
  // 一部の段だけ仮置き (2026-09-29: 弓・クロスボウ・タリスマン等のリーチの一番上の段 65 だけ 1。メイスや槍の同じ段は 1,000)。
  // その段だけ、同じ MOD の本物の重みの段 (同じ ilvl → それ以下で一番近い段) から借りる
  for (const m of [...mods.values()]) {
    if (m.source !== "normal" || isPlaceholderWeight(m) || !m.tiers.some((t) => t.weight <= 1)) continue;
    const tiers = m.tiers.map((t) => (t.weight <= 1 ? { ...t, weight: weightAt(m, t.ilvl) } : t));
    mods.set(m.id, { ...m, tiers });
    overridden.add(m.id);
    applied.push(m.id);
  }
  return { data: { ...data, mods }, applied };
}
