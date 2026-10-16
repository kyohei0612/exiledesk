/**
 * ベースの絵 (ゲーム内と同じ画像、2026-09-29)。scripts/build-base-art-from-client.mjs がクライアントから取り出して
 * public/base-art/*.webp に置く。本番のアプリは画像パック (asset-packs.ts、1 回だけ落とす) から読む。
 * 絵の無いベース (スキルジェムなど) と、画像パックがまだ無い時は null
 */
import art from "./base-art.json";
import { assetUrl } from "../assets/asset-packs";

const MAP = art as Record<string, string>;
export const baseArt = (en: string): string | null => (MAP[en] ? assetUrl("base-art", `${MAP[en]}.webp`) : null);
/** 絵のファイル名 (拡張子なし)。シェアのカード (server/web/og-card.js の public/og-art/<名前>.png) に渡す */
export const baseArtFile = (en: string): string | null => MAP[en] ?? null;
