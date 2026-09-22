/**
 * bridge-index.ts — 「クラス → その装備で出る MOD を文言で引く索引」(2026-09-22)
 *
 * `bridge.ts` から切り出し。索引の組み立てだけを持ちます (引く側は bridge.ts)。
 */
import { normalizeModTemplate, stripRichTextMarkers } from "../mods/normalize";
import { htcFamilyTexts } from "./patch";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** エンジンの MOD は効果ごとに改行で区切られている */
const NEWLINE = String.fromCharCode(10);

/** 突き合わせ用のキー。うちの正規化 + 小文字化 + 空白を 1 つに */
export function matchKey(text: string): string {
  return normalizeModTemplate(stripRichTextMarkers(text)).toLowerCase().replace(/\s+/g, " ");
}

/** 索引が返す物。ルーン由来なら、どのルーンで出るかが付く */
export interface IndexHit {
  mod: Mod;
  /** ルーンを差して初めて出る MOD なら、そのルーンの id */
  rune?: string;
}

export interface ClassIndex {
  /** MOD 全文で引く */
  full: Map<string, IndexHit>;
  /** 複数の効果を持つ MOD を 1 行ずつでも引けるようにした物 */
  line: Map<string, IndexHit>;
}

/** ルーンのプールを索引に入れるか。**読むか狙うかで答えが変わる** ([[bridge.ts]] の説明を参照) */
export type RuneMode = "include" | "exclude";

const cache = new WeakMap<ItemBase, Partial<Record<RuneMode, ClassIndex>>>();

/**
 * そのクラスで出る MOD を「文言 → MOD」で引けるようにする。
 *
 * プールは normal / desecrated / essence / rune に分かれています。同じ文言が normal と essence の
 * 両方にある時は **normal を優先**します。エッセンスは確定で乗せる別の作り方なので、狙う対象としては
 * 通常プールが素直です。
 */
export function modIndexOf(data: PatchData, cls: ItemBase, mode: RuneMode): ClassIndex {
  let slot = cache.get(cls);
  if (!slot) cache.set(cls, (slot = {}));
  const hit = slot[mode];
  if (hit) return hit;

  const full = new Map<string, IndexHit>();
  const line = new Map<string, IndexHit>();

  const add = (text: string | null | undefined, entry: IndexHit) => {
    if (!text) return;
    full.set(matchKey(text), entry);
    // 効果を 2 つ以上持つ MOD は、エンジンでは 1 件だが poe.ninja は効果ごとに別の行で出す。
    // 1 行だけでも引けるようにする (指すのは複合 MOD 1 個)
    const lines = text.split(NEWLINE);
    if (lines.length > 1) {
      for (const l of lines) {
        const k = matchKey(l);
        if (k) line.set(k, entry);
      }
    }
  };

  const pools = (cls.pools ?? {}) as Record<string, unknown>;
  // normal を最後に入れて上書き勝ちにする
  for (const poolName of ["essence", "desecrated", "normal"]) {
    const pool = pools[poolName] as { prefixes?: string[]; suffixes?: string[] } | undefined;
    if (!pool) continue;
    for (const ids of [pool.prefixes, pool.suffixes]) {
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        const mod = data.mods.get(id);
        if (mod) add(mod.text, { mod });
      }
    }
  }

  if (mode === "include") {
    const rune = pools.rune as Record<string, { prefixes?: string[]; suffixes?: string[] }> | undefined;
    for (const [runeId, pool] of Object.entries(rune ?? {})) {
      for (const ids of [pool.prefixes, pool.suffixes]) {
        if (!Array.isArray(ids)) continue;
        for (const id of ids) {
          const mod = data.mods.get(id);
          if (mod) add(mod.text, { mod, rune: runeId });
        }
      }
    }
  }

  // 同梱の文言は patch 0.5.0 のままなので、あとで行が増えた MOD が現物と突き合わない。
  // クライアントから取った**今の文言**を、同じ family の MOD に向けて足す (既にある鍵は上書きしない)。
  applyCurrentTexts(data, cls, full, line, add);

  slot[mode] = { full, line };
  return slot[mode]!;
}

/** `extra-bases.json` の familyTexts を、そのクラスのプールにいる同 family の MOD に結びつける */
function applyCurrentTexts(
  data: PatchData,
  cls: ItemBase,
  full: Map<string, IndexHit>,
  line: Map<string, IndexHit>,
  add: (text: string | null | undefined, entry: IndexHit) => void,
): void {
  const perFamily = htcFamilyTexts()[cls.id];
  if (!perFamily) return;
  const byFamily = new Map<string, Mod>();
  const pools = (cls.pools ?? {}) as Record<string, unknown>;
  for (const poolName of ["normal", "desecrated", "essence"]) {
    const pool = pools[poolName] as { prefixes?: string[]; suffixes?: string[] } | undefined;
    if (!pool) continue;
    for (const ids of [pool.prefixes, pool.suffixes]) {
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        const mod = data.mods.get(id);
        if (mod && !byFamily.has(mod.family)) byFamily.set(mod.family, mod);
      }
    }
  }
  for (const [family, texts] of Object.entries(perFamily)) {
    const mod = byFamily.get(family);
    if (!mod) continue;
    for (const t of texts) {
      // 既に引ける文言は触らない。同梱の対応を、新しい文言で上書きしないため
      const k = matchKey(t);
      if (full.has(k) || line.has(k)) continue;
      add(t, { mod });
    }
  }
}
