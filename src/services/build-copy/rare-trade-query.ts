/**
 * 忍者ビルドコピーのレアの取引所の検索の本文 (2026-09-27、rare-query.ts から分けた)
 * 条件 (stats) と装備の条件 (防御値・ソケット・品質) を組む。組み方の方針は rare-query.ts / rare-auto.ts
 */
import { Rarity, SecurityStatus } from "../../constants/trade2";
import { statFilter } from "./prices";
import type { Equip, RareLine, RareLink } from "./rare-query";

export type Filter = { id: string; value?: { min?: number; max?: number; option?: number } };

/**
 * 取引所の検索。防御値は defScale 倍を下限に (null なら入れない = 数値なし)、ソケットは数を下限に。
 * 取引所の防御値は品質込みの表示の値で比べる。品質は完成品 (defScale = 1) の時だけ
 */
export function query(base: string, filters: Filter[], equip: Equip, defScale: number | null): unknown {
  const eq: Record<string, { min: number }> = {};
  if (defScale != null) {
    const d = (v: number) => Math.floor(v * defScale);
    if (equip.armour > 0) eq.ar = { min: d(equip.armour) };
    if (equip.evasion > 0) eq.ev = { min: d(equip.evasion) };
    if (equip.energyShield > 0) eq.es = { min: d(equip.energyShield) };
  }
  if (equip.sockets > 0) eq.rune_sockets = { min: equip.sockets };
  return {
    query: {
      status: { option: SecurityStatus.Securable },
      ...(base ? { type: base } : {}),
      stats: statGroups(filters),
      filters: {
        type_filters: { filters: { rarity: { option: Rarity.Rare }, ...(defScale === 1 && equip.quality > 0 ? { quality: { min: equip.quality } } : {}) } },
        ...(Object.keys(eq).length ? { equipment_filters: { filters: eq } } : {}),
      },
    },
    sort: { price: "asc" },
  };
}
/**
 * 条件の組: 普通の MOD (explicit.) は「普通 / 冒涜 / 固定済み のどれでも」(count 1)。取引所は同じ MOD を種類ごとに別の番号で持ち、
 * 冒涜で付いた物は冒涜の方に入る (2026-09-27 靴の「冷気と混沌耐性」が冒涜の MOD で 0 件になっていた)。クラフト計算機の完成品と同じ
 */
function statGroups(filters: Filter[]): unknown[] {
  if (!filters.length) return [];
  const plain = filters.filter((f) => !f.id.startsWith("explicit."));
  const any = filters.filter((f) => f.id.startsWith("explicit."));
  const bare = (id: string) => id.replace(/^explicit\./, "");
  return [
    ...(plain.length ? [{ type: "and", filters: plain }] : []),
    ...any.map((f) => ({ type: "count", value: { min: 1 }, filters: ["explicit", "desecrated", "fractured"].map((k) => ({ ...f, id: `${k}.${bare(f.id)}` })) })),
  ];
}
/** 段を下げた時の防御値の下限 (1 段ごとに 1 割) */
export const defScaleOf = (shift: number) => Math.max(0.5, 1 - shift * 0.1);

/**
 * 同じ条件の番号をまとめる。ローカルの「エナジーシールドが % 増加」が 2 つの MOD に分かれて付いている時など、
 * 取引所では合わせた 1 つの値で見えるので、下限は足し合わせる
 */
export function mergeSame(filters: Filter[]): Filter[] {
  const m = new Map<string, Filter>();
  for (const f of filters) {
    const cur = m.get(f.id);
    if (!cur) {
      m.set(f.id, { ...f, ...(f.value ? { value: { ...f.value } } : {}) });
      continue;
    }
    if (f.value?.min != null) cur.value = { ...(cur.value ?? {}), min: (cur.value?.min ?? 0) + f.value.min };
  }
  return [...m.values()];
}

/** 数値を外した条件 (選ぶ形の MOD の選択肢は残す) */
export function bareOf(f: Filter): Filter {
  return f.value?.option != null ? { id: f.id, value: { option: f.value.option } } : { id: f.id };
}

/**
 * ゆるさの違う 2 本: 完成品 → 数値なし (MOD は全部そろえる)。
 * MOD を欠けさせる検索は並べない (オーナー 2026-09-27「MOD 減らすと別のものになるでしょ」)
 */
export function ladder(base: string, raw: Filter[], equip: Equip): RareLink[] {
  const filters = mergeSame(raw);
  const bare = filters.map(bareOf);
  return [
    { label: "完成品", query: query(base, filters, equip, 1) },
    { label: "数値なし", query: query(base, bare, equip, null) },
  ];
}

/** 数値の行の下限 (数値 × 割合、固定の値はそのまま)。条件に数値を入れない時は null */
export function lineMin(l: RareLine, ratio: number): number | null {
  const v = l.value;
  if (v == null || v <= 0) return null;
  const lim = l.fixed ? Math.floor(v) : Math.floor((v * ratio) / 100);
  return lim >= 1 ? lim : null;
}

/** 数値の行 → 条件 (reduced は負の値の上限) */
export function lineFilters(lines: readonly RareLine[], ratio: number): Filter[] {
  const out: Filter[] = [];
  for (const l of lines) {
    const lim = lineMin(l, ratio);
    for (const id of l.ids) out.push(statFilter(id, lim == null ? undefined : l.negative ? { max: -lim } : { min: lim }));
  }
  return out;
}
