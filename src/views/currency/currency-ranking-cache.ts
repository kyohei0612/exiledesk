/**
 * カレンシーランキングの前回表示の保存・読み出し、カテゴリ欄の集計、絞り込み、7 日トレンドの並列取得
 *
 * useCurrencyRanking.ts から切り出し (2026-09-26)。
 */
import { fetchItemTrend7d, type ItemTrend, type League, type RankedItem } from "../../api/poe2scout";
import { jaCurrency } from "../../i18n/currencies-ja";
import { categoryOrderIndex } from "./format";

export interface CategoryDisplay {
  id: string;
  count: number;
  icon: string;
  /** アイコンの代わりに出す 1 文字 (お気に入りの ♥ など) */
  glyph?: string;
}

/** 前回の表示内容を残しておく場所 (取得中に画面が真っ白になるのを防ぐ) */
const CACHE_KEY = "exiledesk.currency.snapshot";
const CACHE_VERSION = 1;
export interface Snapshot {
  v: number;
  league: string;
  leagues: League[];
  ranking: RankedItem[];
  snapshotEpoch: number | null;
  savedAt: number;
}

/**
 * 前回の取得結果を保存する。
 *
 * オーナー指摘 (2026-09-17):「更新中でも前のキャッシュを読み込んで表示してほしい。
 * 何も表示がない現象をやめたい」。トレンド (履歴) は数秒で埋まり量も多いので保存しない。
 */
export function writeSnapshot(s: Omit<Snapshot, "v" | "savedAt">): void {
  try {
    const snap: Snapshot = {
      v: CACHE_VERSION,
      league: s.league,
      leagues: s.leagues,
      ranking: s.ranking,
      snapshotEpoch: s.snapshotEpoch,
      savedAt: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    /* 容量超過などで保存できなくても表示は続く */
  }
}

/** 前回の保存分を読む。無い・版が違う・形が違う時は null (形違いは消す) */
export function readSnapshot(): Snapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    if (snap?.v !== CACHE_VERSION || !Array.isArray(snap.ranking) || snap.ranking.length === 0) return null;
    // 形が違う (古い版で保存した等) キャッシュで画面を壊さない。1 件検査して駄目なら捨てる
    const sample = snap.ranking[0] as Partial<RankedItem>;
    const shapeOk =
      typeof sample?.apiId === "string" &&
      typeof sample?.itemId === "number" &&
      typeof sample?.text === "string" &&
      typeof sample?.groupId === "string" &&
      typeof sample?.exaltedPrice === "number";
    if (!shapeOk) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return snap;
  } catch {
    /* 壊れていたら無視して普通に取得する */
    return null;
  }
}

/** カテゴリ別の表示用リスト。ranking は神換算降順なので各カテゴリ最初のアイテム = 最高額を代表アイコンに使う。 */
export function buildCategoryDisplayList(ranking: RankedItem[]): CategoryDisplay[] {
  const acc = new Map<string, { count: number; icon: string }>();
  for (const r of ranking) {
    const entry = acc.get(r.groupId);
    if (entry) entry.count += 1;
    else acc.set(r.groupId, { count: 1, icon: r.icon });
  }
  return Array.from(acc.entries())
    .map(([id, e]) => ({ id, count: e.count, icon: e.icon }))
    .sort((a, b) => {
      const d = categoryOrderIndex(a.id) - categoryOrderIndex(b.id);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });
}

/** カテゴリ + 検索で絞る */
export function filterRanking(ranking: RankedItem[], categoryFilter: string, searchQuery: string): RankedItem[] {
  let list = ranking;
  if (categoryFilter !== "all") {
    list = list.filter((r) => r.groupId === categoryFilter);
  }
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter((r) => r.text.toLowerCase().includes(q) || jaCurrency(r.text).toLowerCase().includes(q));
  }
  // 表示順は「神換算」降順 (オーナー指示 2026-06-01)。同一参照になりうるので slice() してから sort
  return list.slice().sort((a, b) => b.divinePrice - a.divinePrice);
}

/**
 * 「本物 7 日」を個別履歴から並列 (8 本) で取り、取れた物から onTrend で渡す。
 * stillCurrent() が false になったら (リーグ切替) 中断。
 */
export async function fetchTrends7dPooled(
  lg: string,
  todo: number[],
  stillCurrent: () => boolean,
  onTrend: (id: number, t: ItemTrend) => void,
): Promise<void> {
  const CONC = 8;
  let idx = 0;
  const worker = async () => {
    while (idx < todo.length) {
      const id = todo[idx++];
      if (!stillCurrent()) return;
      const t = await fetchItemTrend7d(lg, id);
      if (stillCurrent() && t) onTrend(id, t);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, () => worker()));
}
