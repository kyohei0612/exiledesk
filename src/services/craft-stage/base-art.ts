/**
 * ベースの絵 (ゲーム内と同じ画像、2026-09-29)。scripts/build-base-art-from-client.mjs がクライアントから取り出して
 * public/base-art/*.webp に置く (アプリに同梱、通信しない)。絵の無いベース (スキルジェムなど) は null
 */
import art from "./base-art.json";

const MAP = art as Record<string, string>;
export const baseArt = (en: string): string | null => (MAP[en] ? `/base-art/${MAP[en]}.webp` : null);
