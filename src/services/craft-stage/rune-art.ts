/**
 * ルーンの絵 (ゲーム内と同じ画像、2026-09-29、POE2Tube 要望 ⑰-1)。scripts/build-skill-art-from-client.mjs がクライアントから取り出して
 * public/rune-art/*.webp に置く。本番のアプリは画像パック (asset-packs.ts) から読む。無ければ null
 */
import art from "./rune-art.json";
import { assetUrl } from "../assets/asset-packs";

const MAP = art as Record<string, string>;
export const runeArt = (en: string): string | null => (MAP[en] ? assetUrl("rune-art", `${MAP[en]}.webp`) : null);
