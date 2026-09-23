/**
 * weight-overrides.ts — 重みが仮置きの 1 のままの MOD を、別の出どころで埋める (2026-09-23)
 *
 * ## 何が起きていたか
 * PoE2 のクライアントは MOD の重みを持っていません (0/1 だけ)。同梱エンジンの重みは poe2db から
 * 取っていますが、poe2db も「PoE1 で同じ系統の MOD の重み」を当てはめた推定で、**PoE2 の新 MOD は
 * 1 = 不明のまま**です ([[scripts/build-mod-weights-poe2db.mjs]] の注意書き)。
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
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** 画面に出す断り書き */
export const WEIGHT_OVERRIDE_NOTE =
  "この MOD の重みはデータに無いので推定値です。他の部位に同じ MOD がある物はそこの重みを借り、"
  + "無い物 (キャストスピードなど) は Craft of Exile の値を使っています。";

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
function donorsFor(mod: Mod, all: Mod[]): Mod[] {
  const [cls, fam] = mod.id.split("/") as [string, string];
  const pool = all.filter((m) => m.id !== mod.id && m.source === "normal" && m.id.split("/")[1] === fam && !isPlaceholderWeight(m));
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
  for (const m of all) {
    if (m.source !== "normal" || !isPlaceholderWeight(m) || overridden.has(m.id)) continue;
    const donors = donorsFor(m, all);
    if (!donors.length) continue;
    const tiers = m.tiers.map((t) => ({ ...t, weight: Math.min(...donors.map((d) => weightAt(d, t.ilvl))) }));
    mods.set(m.id, { ...m, tiers });
    overridden.add(m.id);
    applied.push(m.id);
  }
  return { data: { ...data, mods }, applied };
}
