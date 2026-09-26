/**
 * ja-gem-name.ts — 画面に出すジェムの日本語名 (無ければ英語名のまま)
 *
 * GemWatch.vue から切り出し (2026-09-26)。自動ジェム監視の画面と部品で共通に使う。
 */
import { GEMS } from "../gem-corrupt/useGemCorrupt";

/** 画面に出す日本語名 (無ければ英語名のまま) */
export const jaGemName = (en: string): string => GEMS.find((g) => g.en === en)?.ja ?? en;
