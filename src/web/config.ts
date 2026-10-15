/**
 * Web 版の接続先 (2026-10-07)。サーバーは server/live (Cloudflare Workers): 相場の中継 (/api/poe2scout/…) と配信中のチャンネル (/live.json)。
 * 変える時は .env の VITE_WEB_API (ビルド時に入る)。アプリ版 (Tauri) はここを使わない
 */
export const WEB_API_BASE: string = ((import.meta.env.VITE_WEB_API as string | undefined) ?? "https://exiledesk-live.exiledesk.workers.dev").replace(/\/$/, "");
/** アプリ版の配布先 (今は使わない: サブスク限定で配る予定なので Web 版は「近日公開」の表示だけ。2026-10-07) */
export const APP_DOWNLOAD_URL = "";
/**
 * 今日のお題 (/challenge/*) の接続先。開発で手元の wrangler dev (D1 は --local) に向ける時だけ .env の VITE_CHALLENGE_API に
 * (VITE_WEB_API ごと向けると /boot.json が手元で相場を取りに外へ出るので、お題だけ分ける)。無ければ WEB_API_BASE
 */
export const CHALLENGE_API_BASE: string = ((import.meta.env.VITE_CHALLENGE_API as string | undefined) ?? WEB_API_BASE).replace(/\/$/, "");
