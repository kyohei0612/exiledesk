/**
 * 外部ブラウザで URL を開く (2026-09-12)。Tauri の opener が失敗した時は window.open に落とす。
 * オーナー報告「リンクが飛ばない」への保険。失敗理由は console に残す。
 */
import { openUrl } from "@tauri-apps/plugin-opener";

export async function openExternal(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    await openUrl(url);
  } catch (e) {
    console.warn("[open-external] opener failed, falling back to window.open:", e);
    try {
      window.open(url, "_blank", "noopener");
    } catch (e2) {
      console.warn("[open-external] window.open failed:", e2);
    }
  }
}
