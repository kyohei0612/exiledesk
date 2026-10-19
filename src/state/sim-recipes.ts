/**
 * sim-recipes.ts — シミュレーターの途中とレシピの保存 (localStorage・ファイル)。state/craft-stage.ts から分けた (2026-10-16、500 行の決まり)
 */
import { isTauriRuntime } from "../utils/isTauriRuntime";
import type { Pattern } from "../services/craft-stage/pattern";
import type { StageItem } from "../services/craft-stage/types";
import type { SimStart, SimTargets } from "./sim-state";

/**
 * シミュレーションの途中 (ベース・狙う MOD・工程の「決めた」・順番計画・パターン) を覚えて、開き直した時にそのまま出す
 * (2026-10-07 オーナー「変わってない所はキャッシュでパッと表示させろ」)。工程の「決めた」は StageSimPanel が持つので flags に入れてもらう
 */
export const SIM_SESSION_KEY = "exiledesk.craftStageSim.session";
export interface SimSession {
  base: string; itemLevel: number; targets: SimTargets; sockets: number | null; order: string[]; patterns: Pattern[];
  /** 始め方 (無ければ白から) と、手打ちから持ってきた始めの状態 */
  start?: SimStart;
  startItem?: StageItem | null;
  startCost?: number;
  /** 入れたベース代 (高貴建て)。呼び出した時に、そのベースの覚えた値段が無ければこれを入れる */
  prices?: { white?: number | null; four?: number | null; bought?: number | null; item?: number | null; magic?: number | null; rare?: number | null };
  flags: Record<string, boolean>;
}
export function readSimSession(): SimSession | null {
  try { const v = JSON.parse(localStorage.getItem(SIM_SESSION_KEY) ?? "null") as SimSession | null; return v && v.base ? v : null; } catch { return null; }
}
export function writeSimSession(v: SimSession | null): void {
  try { if (v) localStorage.setItem(SIM_SESSION_KEY, JSON.stringify(v)); else localStorage.removeItem(SIM_SESSION_KEY); } catch { /* 覚えられなくても動く */ }
}

/**
 * レシピ: シミュレーションの途中 (ベース・狙い・順番・パターン・工程の「決めた」) を名前を付けて残す
 * (2026-10-07 オーナー「このガチャの仕組みシミュレーターで保管しときたい」「レシピ保存ボタンで管理、名前も自分で変えて」)
 */
export const SIM_RECIPES_KEY = "exiledesk.craftStageSim.recipes";
/** 直前の一覧の控え (保存・名前替え・削除の前に置く。本体が読めなかった時はここから戻す) */
const SIM_RECIPES_BAK = "exiledesk.craftStageSim.recipes.bak";
/** 読み替えられなかった物 (捨てずにここへ。いつか読める版で拾い直せるように) */
const SIM_RECIPES_UNREAD = "exiledesk.craftStageSim.recipes.unread";
/**
 * レシピの形の版。形を変えたら上げて、normalizeRecipe で古い形を読み替える (2026-10-07 オーナー「更新でレシピがなくならないように」)。
 * キー (SIM_RECIPES_KEY) は変えない
 */
export const RECIPE_FORMAT = 1;
export interface SimRecipe { id: string; name: string; savedAt: number; session: SimSession; /** 一覧に出すベースの日本語名 */ baseJa?: string; /** 形の版 */ v?: number; /** 上書きした時刻 (無ければ savedAt。2026-10-21 上書き保存) */ updatedAt?: number }

/** 古い形・欠けた所のあるレシピを今の形に。ベースが無い物は読めない (null) */
export function normalizeRecipe(x: unknown): SimRecipe | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Partial<SimRecipe> & Record<string, unknown>;
  const ses = (r.session ?? {}) as Partial<SimSession> & Record<string, unknown>;
  if (typeof ses.base !== "string" || !ses.base) return null;
  const patterns = Array.isArray(ses.patterns) ? ses.patterns.filter((p) => p && typeof p === "object").map((p) => ({ ...p, name: String((p as Pattern).name ?? "パターン"), steps: Array.isArray((p as Pattern).steps) ? (p as Pattern).steps : [] })) as Pattern[] : [];
  return {
    ...r,
    id: typeof r.id === "string" && r.id ? r.id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: typeof r.name === "string" && r.name ? r.name : ses.base,
    savedAt: typeof r.savedAt === "number" ? r.savedAt : Date.now(),
    v: RECIPE_FORMAT,
    session: {
      ...ses,
      base: ses.base,
      itemLevel: typeof ses.itemLevel === "number" ? ses.itemLevel : 82,
      targets: Array.isArray(ses.targets) ? ses.targets : [],
      sockets: typeof ses.sockets === "number" ? ses.sockets : null,
      order: Array.isArray(ses.order) ? ses.order : [],
      patterns,
      flags: ses.flags && typeof ses.flags === "object" ? ses.flags : {},
    } as SimSession,
  };
}

function parseList(raw: string | null): unknown[] | null {
  if (raw == null) return null;
  try { const v = JSON.parse(raw) as unknown; return Array.isArray(v) ? v : null; } catch { return null; }
}
/** 読めない物は捨てずに控えに足す (同じ物は重ねない) */
function keepUnread(xs: unknown[]): void {
  if (!xs.length) return;
  try {
    const cur = parseList(localStorage.getItem(SIM_RECIPES_UNREAD)) ?? [];
    const seen = new Set(cur.map((x) => JSON.stringify(x)));
    localStorage.setItem(SIM_RECIPES_UNREAD, JSON.stringify([...cur, ...xs.filter((x) => !seen.has(JSON.stringify(x)))]));
  } catch { /* 無くてよい */ }
}
/**
 * 2026-10-10 オーナー「レシピリセット」: 試しで作ったレシピを 1 回だけ空にする (アプリだけ。Web の人のレシピは触らない)。
 * 消す前の一覧は before-reset に残す (戻す時用)
 */
const SIM_RECIPES_RESET = "exiledesk.craftStageSim.recipes.reset-2026-10-10";
function resetRecipesOnce(): void {
  if (!isTauriRuntime() || localStorage.getItem(SIM_RECIPES_RESET)) return;
  const prev = localStorage.getItem(SIM_RECIPES_KEY);
  if (prev) localStorage.setItem("exiledesk.craftStageSim.recipes.before-reset", prev);
  localStorage.setItem(SIM_RECIPES_KEY, "[]");
  localStorage.removeItem(SIM_RECIPES_BAK);
  localStorage.setItem(SIM_RECIPES_RESET, "1");
}
export function readSimRecipes(): SimRecipe[] {
  try {
    resetRecipesOnce();
    // 本体が読めなければ控えから
    const main = parseList(localStorage.getItem(SIM_RECIPES_KEY));
    const list = main ?? parseList(localStorage.getItem(SIM_RECIPES_BAK)) ?? [];
    const ok: SimRecipe[] = [], bad: unknown[] = [];
    for (const x of list) { const r = normalizeRecipe(x); if (r) ok.push(r); else bad.push(x); }
    keepUnread(bad);
    return ok;
  } catch { return []; }
}
export function writeSimRecipes(v: SimRecipe[]): void {
  try {
    // 書き換える前の一覧を控えに (読める時だけ。壊れた物で控えを上書きしない)
    const prev = localStorage.getItem(SIM_RECIPES_KEY);
    if (parseList(prev)) localStorage.setItem(SIM_RECIPES_BAK, prev!);
    localStorage.setItem(SIM_RECIPES_KEY, JSON.stringify(v.map((r) => ({ ...r, v: RECIPE_FORMAT }))));
  } catch { /* 覚えられなくても動く */ }
}

/** 書き出し (ファイル 1 つ。URL を移す時・PC を替える時に持っていく) */
export const RECIPE_FILE_KIND = "exiledesk-recipes";
export function recipesToFile(v: readonly SimRecipe[]): string {
  return JSON.stringify({ kind: RECIPE_FILE_KIND, v: RECIPE_FORMAT, exportedAt: new Date().toISOString(), recipes: v }, null, 1);
}
/** 読み込み: 書き出したファイル (か、レシピの配列) から。今の一覧に無い物だけ足す (同じ id・同じ時刻は重ねない、id だけ同じなら新しい id で) */
export function mergeRecipesFromFile(text: string, cur: readonly SimRecipe[]): { list: SimRecipe[]; added: number; skipped: number; bad: number } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { list: [...cur], added: 0, skipped: 0, bad: 1 }; }
  const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { recipes?: unknown }).recipes) ? (raw as { recipes: unknown[] }).recipes : [];
  const list = [...cur];
  let added = 0, skipped = 0, bad = 0;
  for (const x of arr) {
    const r = normalizeRecipe(x);
    if (!r) { bad++; continue; }
    const same = list.find((y) => y.id === r.id);
    if (same && same.savedAt === r.savedAt) { skipped++; continue; }
    list.push(same ? { ...r, id: `${r.id}-${Math.random().toString(36).slice(2, 6)}` } : r);
    added++;
  }
  list.sort((a, b) => b.savedAt - a.savedAt);
  return { list, added, skipped, bad };
}
