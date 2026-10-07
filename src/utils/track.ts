/**
 * 操作の印 (2026-10-07)。Web 版では src/web/track.ts が受け口 (window.__exiledeskTrack) を登録して、サーバーの /event にまとめて送る。
 * アプリ版 (Tauri) では受け口が無いので何もしない。画面の部品からはこれを呼ぶだけ (Web の都合を部品に持ち込まない)
 */
export function track(name: string, extra?: string): void {
  try {
    (globalThis as { __exiledeskTrack?: (n: string, x?: string) => void }).__exiledeskTrack?.(name, extra);
  } catch { /* 印は落としてよい */ }
}
