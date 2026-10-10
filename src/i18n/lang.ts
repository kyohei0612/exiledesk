/**
 * lang.ts — 画面の言語 (2026-10-10 オーナー「ご要望いただいた奴 (英語版) どんな感じになるか、まずは英語から」「ほぼ英語だからなそもそも元から取ってんの」)。
 *
 * ゲームのデータ (MOD の文・ベース・カレンシー / お告げの名前) は元から英語を持っているので、ここを見て英語に切り替える。
 * 画面の言葉は tr("日本語", "English") で両方を並べて書く (訳の表を別に持たない。直す時に片方を忘れない)。
 * アプリ版は日本語だけ (Tauri)。Web は最初はブラウザの言語 (日本語以外は英語)、上の帯で切り替えて覚える
 */
import { computed, ref } from "vue";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export type Lang = "ja" | "en";
const KEY = "exiledesk.lang";

function initial(): Lang {
  // 画面の無い所 (テスト・Node。Node 21 からは navigator.language が en-US) とアプリは日本語
  if (typeof window === "undefined" || isTauriRuntime()) return "ja";
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ja" || v === "en") return v;
  } catch { /* 無くてよい */ }
  return typeof navigator !== "undefined" && /^ja\b/i.test(navigator.language ?? "") ? "ja" : "en";
}

export const lang = ref<Lang>(initial());
export const isEn = computed(() => lang.value === "en");
export function setLang(v: Lang): void {
  lang.value = v;
  try { localStorage.setItem(KEY, v); } catch { /* 無くてよい */ }
  if (typeof document !== "undefined") document.documentElement.lang = v;
}
if (typeof document !== "undefined") document.documentElement.lang = lang.value;

/** 画面の言葉: 日本語と英語を並べて書く */
export const tr = (ja: string, en: string): string => (lang.value === "en" ? en : ja);
/** 付いている MOD の文 (日本語 / 英語の両方を持っている物) */
export const modText = (m: { textJa: string; textEn: string }): string => (lang.value === "en" && m.textEn ? m.textEn : m.textJa);
/** 英語名と日本語名を持つ物 (ユニーク・ルーン・暗黙の効果) */
export const nameOf = (o: { en: string; ja: string }): string => (lang.value === "en" ? o.en : o.ja);
/** アイテムのベース名 (base は英語の名前) */
export const baseNameOf = (it: { base: string; baseJa: string }): string => (lang.value === "en" ? it.base : it.baseJa);
