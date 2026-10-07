/**
 * Web 版の接続先 (2026-10-07)。サーバーは server/live (Cloudflare Workers): 相場の中継 (/api/poe2scout/…) と配信中のチャンネル (/live.json)。
 * 変える時は .env の VITE_WEB_API (ビルド時に入る)。アプリ版 (Tauri) はここを使わない
 */
export const WEB_API_BASE: string = ((import.meta.env.VITE_WEB_API as string | undefined) ?? "https://exiledesk-live.kyohei0612.workers.dev").replace(/\/$/, "");
/** アプリ版の配布 (Web 版の上の「アプリ版」リンク) */
export const APP_DOWNLOAD_URL = "https://github.com/kyohei0612/exiledesk/releases/latest";
