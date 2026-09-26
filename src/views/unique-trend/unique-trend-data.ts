/**
 * ユニーク装備価格推移の型・定数・行の変換・一覧のキャッシュ (メモリ + localStorage)
 *
 * useUniqueTrend.ts から切り出し (2026-09-26)。キャッシュ (`cache`) はここにだけ置く (1 つきり)。
 */
import type { HistoryPoint } from "../../api/poe2scout";
import type { NinjaLine, NinjaModLine, NinjaUniqueKind } from "../../api/ninja-economy";
import { favKey } from "../../state/unique-favorites";
import { jaTypeName, jaUniqueName } from "../../services/trade2/localize";

export interface UniqueRow {
  /** poe.ninja の行 ID */
  itemId: number;
  kind: NinjaUniqueKind;
  nameEn: string;
  nameJa: string;
  baseEn: string;
  baseJa: string;
  /** カテゴリ欄の ID (weapon / armour …) */
  category: string;
  icon: string;
  /** 高貴建て */
  exalted: number;
  listings: number;
  corrupted: boolean;
  /** お気に入りのキー */
  fav: string;
  /** ホバーのカード用 (poe.ninja の行そのまま) */
  hover: {
    implicit: NinjaModLine[];
    explicit: NinjaModLine[];
    properties: NinjaModLine[];
    requirements: NinjaModLine[];
    flavour: string;
  };
}

/** 7 日の推移 (古→新)。changePct は 7 日の変化率、qty は出品数。points は使わない (詳細で日ごとに取る) */
export interface UniqueTrend {
  spark: number[];
  changePct: number;
  qty: number | null;
  points: HistoryPoint[];
}

export type SortKey = "price" | "rise" | "fall" | "name";
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "price", label: "値段" },
  { key: "rise", label: "高騰率" },
  { key: "fall", label: "下落率" },
  { key: "name", label: "名前" },
];

/** poe.ninja の種類 → カテゴリ欄の ID (日本語は categories-ja) */
export const CAT_OF: Record<NinjaUniqueKind, string> = {
  UniqueWeapons: "weapon",
  UniqueArmours: "armour",
  UniqueAccessories: "accessory",
  UniqueJewels: "jewel",
  UniqueFlasks: "flask",
  UniqueCharms: "charm",
  UniqueSanctumRelics: "relic",
  UniqueTablets: "tablet",
};
export const FAV_CATEGORY = "favorites";
/** 高騰率 / 下落率で信用しない出品数 (これ未満は後ろ) */
export const THIN_LISTINGS = 3;
/** 一覧を覚えておく時間 */
export const TTL_MS = 30 * 60 * 1000;
/** 画面に一度に出す行数 (「もっと見る」で増やす) */
export const LIMIT_STEP = 100;

/** 7 日の変化率 (欠けた日は null) → 折れ線用の値 (100 基準、欠けは前の日で埋める) */
export function sparkOf(data: Array<number | null>): number[] {
  const out: number[] = [];
  let last: number | null = null;
  for (const v of data) {
    if (v != null) last = 100 + v;
    if (last != null) out.push(last);
  }
  return out;
}

export function toRow(kind: NinjaUniqueKind, l: NinjaLine, exPerDiv: number): UniqueRow | null {
  if (!l.name || !(l.primaryValue > 0)) return null;
  const base = l.baseType ?? "";
  // ルーンの熟達品 (Runemastered …) は出さない (オーナー 2026-09-26「ルーンマスターはいらん」)
  if (/^Runemastered /.test(base)) return null;
  return {
    itemId: l.id,
    kind,
    nameEn: l.name,
    nameJa: jaUniqueName(l.name),
    baseEn: base,
    baseJa: base ? jaTypeName(base) : "",
    category: CAT_OF[kind],
    icon: l.icon,
    exalted: l.primaryValue * exPerDiv,
    listings: l.listingCount ?? 0,
    corrupted: !!l.corrupted,
    fav: favKey(l.name, base),
    hover: {
      implicit: l.implicitModifiers ?? [],
      explicit: l.explicitModifiers ?? [],
      properties: l.propertyModifiers ?? [],
      requirements: l.requirementModifiers ?? [],
      flavour: l.flavourText ?? "",
    },
  };
}

export interface KindCache { at: number; rows: UniqueRow[]; trends: Map<number, UniqueTrend> }
/** リーグ → 種類 → 一覧 (画面を作り直しても残す) */
export const cache = new Map<string, Map<NinjaUniqueKind, KindCache>>();

/**
 * 取った一覧を localStorage にも残す (30 分)。読み込み直しても poe.ninja から取り直さない
 * (オーナー 2026-09-26「開発版キャッシュでユニーク表示おｋだよ、取り直すと手間でしょ」)。
 * 残せない環境 (容量など) では今までどおりメモリだけ
 */
const LS_KEY = "exiledesk.uniqueTrend.cache.v1";
export function saveLs(league: string, lc: Map<NinjaUniqueKind, KindCache>): void {
  try {
    const kinds = Object.fromEntries([...lc.entries()].map(([k, c]) => [k, { at: c.at, rows: c.rows, trends: [...c.trends.entries()] }]));
    localStorage.setItem(LS_KEY, JSON.stringify({ league, kinds }));
  } catch {
    /* 残せなくても動く */
  }
}
export function loadLs(league: string): Map<NinjaUniqueKind, KindCache> | null {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "null") as
      | { league: string; kinds: Record<string, { at: number; rows: UniqueRow[]; trends: Array<[number, UniqueTrend]> }> }
      | null;
    if (!raw || raw.league !== league) return null;
    const m = new Map<NinjaUniqueKind, KindCache>();
    for (const [k, c] of Object.entries(raw.kinds)) {
      if (Date.now() - c.at > TTL_MS) continue;
      m.set(k as NinjaUniqueKind, { at: c.at, rows: c.rows, trends: new Map(c.trends) });
    }
    return m.size ? m : null;
  } catch {
    return null;
  }
}
