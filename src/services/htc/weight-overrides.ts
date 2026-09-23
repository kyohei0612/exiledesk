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
 * ## 埋める値 — 実際にやっている人の「カオス約 500 回に 1 回」から逆算 (2026-09-23)
 * 最初は Craft of Exile (beta, PoE2) の 1 段 1,000 (首飾り 800) を借りた。CoE の他の MOD の重みは
 * 私たちの表と全部一致する (指輪の普通 MOD 30 種) が、キャスピだけは CoE も出どころの無い推定値。
 * CoE のシミュレーターで回すと 4 MOD の指輪で 28 回に 1 回 (T2 以上 77 回に 1 回) と、その推定値の
 * 通りに出るだけで、実際の回数 (動画などで約 500 回に 1 回) と 16 倍ほど合わない。
 *
 * 逆算: プレ 3 / サフィ 3 の指輪にカオス 1 回 → サフィが外れる 1/2 × キャスピの重み ÷ (空いた
 * サフィに入れる重み、他のサフィ 2 系統を除いて約 74,000 + キャスピ)。これが 1/500 になるのは
 * キャスピ合計 ≒ 300 = **1 段 60**。同じ式で 1 段 1,000 なら 1/32 になり、CoE の結果と合う。
 * 首飾りは CoE の指輪との比 (800 / 1,000) を保って **1 段 48**。
 *
 * ## 断り
 * - 「約 500 回に 1 回」は動画で見た目安で、段を問わないキャスピとして扱っている。
 * - 首飾りは実測の目安が無く、指輪からの比で置いただけ。
 *
 * ## 他の仮置き MOD (2026-09-23 オーナー:「他の MOD で同じような奴も合わせて重さ変えよう」)
 * 普通 MOD で仮置きのままだったのは 14 個。2 通りで埋める:
 * 1. **同じ系統の MOD が他の部位で本物の重みを持っている物 (11 個) は、そこから借りる**
 *    (ES リチャージ率 / アイテムレアリティ / 矢筒の追加の矢)。借りる先は、同じ部位 → 同じ能力値の組
 *    (例: `_int`) → どこでも、の順。段は同じ ilvl、無ければそれ以下で一番近い段。候補が複数なら
 *    **一番小さい重み** (つきにくい側に倒す)。
 * 2. **どこにも数字が無い物 (クロスボウのグレネード 3 個) は、CoE の値 × 0.06**。0.06 は
 *    キャスピで見た「CoE の推定値と実際の回数の比」(60 / 1,000) を、同じ性質の推定値にも当てた物で、
 *    **一番根拠が弱い**。
 */
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** 画面に出す断り書き */
export const WEIGHT_OVERRIDE_NOTE =
  "この MOD の重みはデータに無いので推定値です。キャストスピードは実際の目安「カオス約 500 回に 1 回」から"
  + "逆算 (指輪 1 段 60 / 首飾り 1 段 48)、他の部位に同じ MOD がある物はそこの重みを借り、"
  + "どこにも無い物は Craft of Exile の値 × 0.06 です。";

/** CoE の推定値を実際の回数に合わせる比 (キャスピ: 実際 60 / CoE 1,000) */
export const COE_SCALE = 60 / 1000;
const coe = (w: number) => Math.round(w * COE_SCALE);

/** MOD id → 段の出始め ilvl ごとの重み */
const OVERRIDES: Record<string, { source: string; byIlvl: Record<number, number> }> = {
  "Rings/IncreasedCastSpeed": {
    source: "カオス約 500 回に 1 回 (プレ 3 / サフィ 3、段を問わない) から逆算",
    byIlvl: { 1: 60, 18: 60, 35: 60, 51: 60, 60: 60 },
  },
  "Amulets/IncreasedCastSpeed": {
    source: "指輪の 60 に Craft of Exile の首飾り / 指輪の比 (800 / 1,000) を掛けた値",
    byIlvl: { 1: 48, 18: 48, 35: 48, 51: 48, 60: 48, 66: 48 },
  },
  "Crossbows_cannon/GrenadeCooldownUse": {
    source: "Craft of Exile GrenadeSkillAdditionalCooldownUse1-2 (500 / 250) × 0.06",
    byIlvl: { 72: coe(500), 81: coe(250) },
  },
  "Crossbows_cannon/AdditionalProjectiles": {
    source: "Craft of Exile GrenadeSkillAdditionalProjectile1-2 (250 / 125) × 0.06",
    byIlvl: { 72: coe(250), 81: coe(125) },
  },
  "Crossbows_cannon/CooldownRecovery": {
    source: "Craft of Exile GrenadeSkillCooldownRecovery1-6 (1,000) × 0.06",
    byIlvl: { 4: coe(1000), 16: coe(1000), 33: coe(1000), 46: coe(1000), 60: coe(1000), 81: coe(1000) },
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
