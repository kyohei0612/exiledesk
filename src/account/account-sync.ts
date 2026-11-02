/**
 * account-sync.ts — localStorage の保存物と /account/sync の間 (docs/spec/account.md A-40〜43、2026-11-03 案)。
 * 運ぶ物ごとに運び手 (Carrier) を 1 つ持つ。今はツリーのレシピだけ (A-40)。足す時は ⑥ の手順
 * 決まり: 1 件ずつ新しい方が勝つ・消した物は印で運ぶ・負けた物は捨てずに控えへ (A-41)
 */
import { myAccount, syncRaw } from "./account-client";
import { changes, merge, type LocalItem } from "./account-merge";
export type { LocalItem };

export interface Carrier {
  kind: string;
  read(): LocalItem[];
  write(items: LocalItem[]): void;
  /** 負けた・消された物を捨てずに置く */
  keepLost(items: LocalItem[]): void;
}

/** 前回そろえた時の id → updatedAt (ここに有って今無い物 = この端末で消した物) */
const snapKey = (kind: string): string => `exiledesk.account.synced.${kind}`;
function readSnap(kind: string): Record<string, number> {
  try { return (JSON.parse(localStorage.getItem(snapKey(kind)) ?? "{}") as Record<string, number>) ?? {}; } catch { return {}; }
}
function writeSnap(kind: string, s: Record<string, number>): void {
  try { localStorage.setItem(snapKey(kind), JSON.stringify(s)); } catch { /* 次の同期で全部上げ直すだけ */ }
}

export type SyncReport = { ok: true; up: number; down: number } | { ok: false; error: string };
/** 1 回同期する (押した時だけ呼ぶ、A-42)。上げるのは 50 件ずつ (A-43) */
export async function syncCarrier(c: Carrier, base?: string, now = Date.now()): Promise<SyncReport> {
  if (!myAccount()) return { ok: false, error: "アカウントにつないでいない" };
  const put = changes(c.kind, c.read(), readSnap(c.kind), now);
  let down = 0;
  for (let i = 0; i === 0 || i < put.length; i += 50) {
    const r = await syncRaw(put.slice(i, i + 50), base);
    if (!r.ok) return { ok: false, error: `${r.error} (端末の物は消えていない)` };
    const { next, lost } = merge(c.read(), r.value.items.filter((x) => x.kind === c.kind));
    if (lost.length) c.keepLost(lost);
    c.write(next);
    down += r.value.items.length;
  }
  writeSnap(c.kind, Object.fromEntries(c.read().map((l) => [l.id, l.updatedAt])));
  return { ok: true, up: put.length, down };
}

/** ツリーのレシピ (exiledesk.tree.recipes、包みは tree-recipes.ts の TreeRecipe のまま運ぶ) */
const RECIPES = "exiledesk.tree.recipes";
const LOST = "exiledesk.account.lost.recipe";
export const recipeCarrier: Carrier = {
  kind: "recipe",
  read() {
    try {
      const list = JSON.parse(localStorage.getItem(RECIPES) ?? "[]") as Array<{ id?: unknown; name?: unknown; updatedAt?: unknown; savedAt?: unknown }>;
      return (Array.isArray(list) ? list : []).filter((r) => typeof r?.id === "string").map((r) => ({
        id: r.id as string, name: typeof r.name === "string" ? r.name : undefined,
        updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : typeof r.savedAt === "number" ? r.savedAt : 0, body: JSON.stringify(r),
      }));
    } catch { return []; }
  },
  write(items) {
    try {
      const prev = localStorage.getItem(RECIPES);
      if (prev) localStorage.setItem(`${RECIPES}.bak`, prev);
      localStorage.setItem(RECIPES, JSON.stringify(items.map((i) => JSON.parse(i.body) as unknown)));
      // 同じタブの tree-recipes.ts に読み直させる (storage の合図を聞いている。正式な口はシミュ部長へ、A-80)
      window.dispatchEvent(new StorageEvent("storage", { key: RECIPES }));
    } catch { /* 書けなければ次の同期でもう一度 */ }
  },
  keepLost(items) {
    try {
      const cur = JSON.parse(localStorage.getItem(LOST) ?? "[]") as unknown[];
      localStorage.setItem(LOST, JSON.stringify([...cur, ...items.map((i) => ({ at: Date.now(), ...(JSON.parse(i.body) as object) }))].slice(-100)));
    } catch { /* 無くてよい */ }
  },
};
