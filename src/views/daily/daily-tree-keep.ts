/**
 * daily-tree-keep.ts — 今日の挑戦の木の写しを、このタブの置き場 (sessionStorage) にも残す (D-32「戻れば木の続きから」)。
 * 端末の控え (localStorage の exiledesk.daily.v4) は、シミュのレシピ (15 個 + 組み上がりの写し) で置き場が一杯だと書けずに黙って落ち、
 * 挑戦中に読み直す (F5・新しい版の強制更新) と木が最初からになった (11-18 オーナー「デイリーツリー中更新したら最初からになるんだが」)。
 * sessionStorage は localStorage と別の枠なので、同じタブの読み直しでは続きから開ける。使うのは同じ挑戦 (始めた時刻が同じ) で、端末の控えに木が無いか、控えの木より新しい時だけ (一杯になる前に書けた古い木が控えに残る)
 */
const KEY = "exiledesk.daily.tabTree";
type Kept = { id: string; startedAt: number; tree: string; builtZ?: string; /** 木を書いた時刻 (端末の控えの treeAt と新しい方を開く) */ at: number };

/** 木を写す。木が無い (やり直しで消した) 時は写しも消す */
export function keepTabTree(id: string, startedAt: number, tree: string | undefined, builtZ: string | undefined, at: number): void {
  try {
    if (tree) sessionStorage.setItem(KEY, JSON.stringify({ id, startedAt, tree, at, ...(builtZ ? { builtZ } : {}) } satisfies Kept));
    else sessionStorage.removeItem(KEY);
  } catch { /* 写せなくても画面は動く */ }
}

/** 同じ挑戦の写し。無ければ null */
export function tabTreeOf(id: string, startedAt: number): Kept | null {
  try {
    const k = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<Kept> | null;
    return k && k.id === id && k.startedAt === startedAt && typeof k.tree === "string" && typeof k.at === "number" ? (k as Kept) : null;
  } catch { return null; }
}
