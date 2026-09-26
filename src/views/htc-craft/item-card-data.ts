/**
 * item-card-data.ts — アイテム画面の絵 ([[ItemCard.vue]]) に渡す中身を作る (2026-09-26)
 *
 *   cardOfTarget(c)        … 完成図 (貼り付けの狙い: 樹 MOD・固定済み・段)
 *   cardOfState(c, state)  … 作り方の STEP の時の形 (シミュレーターの状態。外れ・触らない・ブリーチの MOD も)
 * MOD の見出しはゲームの詳細表示に合わせる: 『プレフィックス MOD "Sagacious" (T2) — マナ, キャスター』
 */
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { CATALYSTS } from "../../services/htc/quality";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import type { SimState } from "../../services/htc/sim-route";
import { zeroStart } from "./craft-settings";
import { socketEffects, socketLabel, socketOnOf } from "../../services/htc/sockets";
import type { useHtcCraft } from "./useHtcCraft";

export interface CardMod {
  key: string;
  text: string;
  side: "P" | "S" | null;
  /** 小さい見出し (『プレフィックス MOD "名前" (T2) — マナ, キャスター』) */
  head?: string;
  tone?: "normal" | "fixed" | "desecrated" | "crafted" | "tree" | "junk" | "keep" | "cannot";
  fixed?: boolean;
}
export interface CardData {
  name: string | null;
  base: string;
  ilvl: number | null;
  quality: number | null;
  qualityLabel: string | null;
  implicits: string[];
  mods: CardMod[];
  /** ソケットに差す物の 1 行 (「ソケット: アストリッドの創造性」)。差さなければ null (2026-09-26) */
  socket: string | null;
  /** 差したルーンの効果の行 (ゲームの日本語) */
  socketEffects: string[];
}

/** MOD のタグの日本語。クライアント由来の辞書の言い回しに合わせる (元素 496 件 vs エレメント 6 件、アタック 1224 vs 攻撃 45。2026-09-26 オーナー「タグの日本語訳をチェック」) */
const TAG_JA: Record<string, string> = {
  mana: "マナ", life: "ライフ", caster: "キャスター", attack: "アタック", speed: "スピード", elemental: "元素",
  fire: "火", cold: "冷気", lightning: "雷", chaos: "混沌", physical: "物理", resistance: "耐性", defences: "防御",
  armour: "アーマー", evasion: "回避", energy_shield: "エナジーシールド", minion: "ミニオン", critical: "クリティカル",
  damage: "ダメージ", attribute: "属性", resource: "リソース", gem: "ジェム", curse: "呪い", aura: "オーラ", ailment: "状態異常",
  bleed: "出血", poison: "毒", block: "ブロック", flask: "フラスコ", charm: "チャーム", drop: "ドロップ",
  elemental_damage: "元素ダメージ", physical_damage: "物理ダメージ", chaos_damage: "混沌ダメージ", caster_damage: "キャスターダメージ",
  caster_speed: "キャストスピード", caster_critical: "スペルクリティカル", fire_resistance: "火耐性", cold_resistance: "冷気耐性",
  lightning_resistance: "雷耐性", elemental_resistance: "元素耐性", chaos_resistance: "混沌耐性", flat_life_regen: "ライフ再生",
};
/** 見出しに出す主なタグ (細かい派生タグは省く) */
const HEAD_TAGS = ["mana", "life", "caster", "attack", "speed", "elemental", "fire", "cold", "lightning", "chaos", "physical", "resistance", "defences", "armour", "evasion", "energy_shield", "minion", "critical", "attribute", "gem", "curse", "aura"];

const SIDE_JA = { P: "プレフィックス", S: "サフィックス" } as const;

/** 品質の表記 (『品質 (マナモッド)』)。種類が無ければ『品質』 */
export function qualityLabelOf(tag: string | null | undefined): string {
  const k = tag ? CATALYSTS.find((x) => x.tag === tag) : undefined;
  return k?.label?.ja ?? "品質";
}

/** MOD の見出し: 側 + 段の名前 + T + 主なタグ */
function headOf(c: ReturnType<typeof useHtcCraft>, modId: string, tierIndex: number | undefined, side: "P" | "S" | null): string | undefined {
  const m = c.data.value?.mods.get(modId);
  if (!m) return undefined;
  const tiers = m.tiers ?? [];
  const i = tierIndex ?? (c.targets.value.find((t) => t.modId === modId)?.minTierIndex ?? 0);
  const tier = tiers[i];
  const tags = (m.tags ?? []).filter((t) => HEAD_TAGS.includes(t)).map((t) => TAG_JA[t] ?? t);
  // オーナー 2026-09-26:「詳細の中身はプレフィックス T● — その MOD に付いているタグ。無ければ表示なし」
  void tier;
  const parts = [side ? SIDE_JA[side] : "MOD", tiers.length ? `T${tiers.length - i}` : ""].filter(Boolean).join(" ");
  return tags.length ? `${parts} — ${tags.join(", ")}` : parts;
}
function toneOf(c: ReturnType<typeof useHtcCraft>, modId: string): CardMod["tone"] {
  const src = c.data.value?.mods.get(modId)?.source;
  if (src && CRAFTED_SOURCES.has(src)) return "crafted";
  return src === "desecrated" ? "desecrated" : "normal";
}
function sideOfMod(c: ReturnType<typeof useHtcCraft>, modId: string): "P" | "S" | null {
  const t = c.data.value?.mods.get(modId)?.type;
  return t === "prefix" ? "P" : t === "suffix" ? "S" : null;
}
const ja = (t: string): string => jaOfPastedLine(t) ?? t;

function header(c: ReturnType<typeof useHtcCraft>): Pick<CardData, "name" | "base" | "ilvl" | "quality" | "qualityLabel" | "implicits" | "socket" | "socketEffects"> {
  const it = c.item.value;
  const base = it?.baseText ?? c.bases.value.find((b) => b.current)?.ja ?? it?.baseType ?? zeroStart.value.baseType ?? "";
  return {
    name: null,
    base,
    ilvl: it?.itemLevel ?? zeroStart.value.itemLevel ?? null,
    quality: it?.quality ?? zeroStart.value.quality ?? null,
    qualityLabel: qualityLabelOf(it?.catalystTag ?? zeroStart.value.qualityTag),
    implicits: c.implicits.value.map(ja),
    socket: socketLabel(socketOnOf(c)),
    socketEffects: socketEffects(socketOnOf(c)),
  };
}
const byside = (a: CardMod, b: CardMod): number => (a.side === b.side ? 0 : a.side === "P" ? -1 : b.side === "P" ? 1 : 0);

/** 完成図: 樹 MOD (固定済みで買う) + 狙い (段つき)。作れない行はそのまま赤で */
export function cardOfTarget(c: ReturnType<typeof useHtcCraft>): CardData {
  const fixed = new Set(c.fracturedTargets.value.map((t) => t.modId));
  const tree = new Set(c.dropOnly.value.map((d) => d.text));
  const mods: CardMod[] = [
    ...c.dropOnly.value.map((d, i): CardMod => ({
      key: `tree-${i}`, text: ja(d.text), side: d.side ?? null, tone: "tree", fixed: true,
      head: `${d.side ? SIDE_JA[d.side] : ""} MOD (創生の樹${d.tier ? ` T${d.tier.of - d.tier.index}` : ""})`,
    })),
    ...c.skipped.value.filter((t) => !tree.has(t)).map((t, i): CardMod => {
      const desecrated = c.item.value?.lines.find((l) => l.text === t)?.kind === "desecrated";
      return { key: `cannot-${i}`, text: ja(t), side: null, tone: desecrated ? "desecrated" : "cannot", head: desecrated ? "MOD (冒涜で付いた物)" : "MOD (このベースでは作れない)" };
    }),
    ...c.targets.value.map((t): CardMod => ({
      key: t.modId, text: c.stepTarget([t.modId]), side: sideOfMod(c, t.modId), head: headOf(c, t.modId, t.minTierIndex, sideOfMod(c, t.modId)),
      tone: fixed.has(t.modId) ? "fixed" : toneOf(c, t.modId), fixed: fixed.has(t.modId),
    })),
  ].sort(byside);
  return { ...header(c), mods };
}

/** STEP の時の形: シミュレーターの状態 (外れ・触らない・固定・ブリーチ) */
export function cardOfState(c: ReturnType<typeof useHtcCraft>, s: SimState): CardData {
  const h = header(c);
  const mods: CardMod[] = s.slots.map((x, i): CardMod => {
    const side: "P" | "S" | null = x.side === "prefix" ? "P" : x.side === "suffix" ? "S" : null;
    if (!x.modId) {
      return { key: `slot-${i}`, side, text: x.label ?? (x.desecrated ? "冒涜の外れ MOD (消す)" : "外れ MOD (消す)"), tone: "junk", head: `${side ? SIDE_JA[side] : ""} MOD (狙いではない)` };
    }
    const tone: CardMod["tone"] = x.fixed ? "fixed" : x.keep ? "keep" : x.crafted ? "crafted" : x.desecrated ? "desecrated" : toneOf(c, x.modId);
    const head = x.keep ? `${side ? SIDE_JA[side] : ""} MOD (触らない: 消えたら付け直せない)` : headOf(c, x.modId, undefined, side);
    return { key: `slot-${i}`, side, text: c.stepTarget([x.modId]), tone, fixed: !!x.fixed, head };
  }).sort(byside);
  if (s.breach) mods.unshift({ key: "breach", side: "P", text: "品質の最大値 +20% (ブリーチのエッセンス)", tone: "crafted", head: "プレフィックス MOD (クラフト MOD: ブリーチ)" });
  const quality = s.quality ?? h.quality;
  const qualityLabel = s.qualityTag !== undefined ? qualityLabelOf(s.qualityTag) : h.qualityLabel;
  return { ...h, quality, qualityLabel, mods };
}
