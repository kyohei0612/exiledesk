/**
 * ユニークの見た目 (ゲーム内の絵、2026-09-29)。scripts/build-unique-art-from-client.mjs がクライアントの
 * UniqueStashLayout から取り出して public/unique-art/ に置く。本番のアプリは画像パック (asset-packs.ts) から読む。
 * 英語のユニーク名で引く。絵が無い・画像パックがまだ無い時は null
 */
import art from "./unique-art.json";
import { assetUrl } from "./asset-packs";

const MAP = art as Record<string, string>;
export const uniqueArt = (en: string | null | undefined): string | null => (en && MAP[en] ? assetUrl("unique-art", `${MAP[en]}.webp`) : null);
