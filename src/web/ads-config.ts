/**
 * 広告の設定 (2026-10-16)。本物の広告に差し替える時に触るのはここと components/ui/AdSlot.vue だけ。
 *
 *   AD_CLIENT … AdSense のサイト運営者 ID (ca-pub-…)。空なら全部の枠が仮の枠 (「広告 (仮)」)
 *   AD_UNITS  … 枠 (utils/ads.ts の adLayout の id) ごとの AdSense の広告ユニットの番号 (data-ad-slot)。空の枠は仮の枠
 *
 * ビルドの時の .env (VITE_ADSENSE_CLIENT / VITE_ADSENSE_UNITS = {"side-1":"123…"} の JSON) でも上書きできる。
 * 審査中 (2026-10-13 申し込み) は空のまま。web.html の頭の adsbygoogle.js の読み込み (審査とサイトの紐付け用) はそのまま残す。
 * 本番で枠を出すのは AD_CLIENT が入った時だけ (仮の枠は開発版だけ。adsWanted)
 */
const env = import.meta.env as Record<string, string | undefined>;

export const AD_CLIENT: string = env.VITE_ADSENSE_CLIENT ?? "";

export const AD_UNITS: Record<string, string> = {
  "side-1": "",
  "side-2": "",
  "base-left": "",
  "base-right": "",
  "fb-left": "",
  "phone-top": "",
  ...(() => { try { return env.VITE_ADSENSE_UNITS ? (JSON.parse(env.VITE_ADSENSE_UNITS) as Record<string, string>) : {}; } catch { return {}; } })(),
};

/** この枠は本物の広告を出せるか (運営者 ID と広告ユニットの番号が両方ある) */
export const adUnitOf = (id: string): string | null => (AD_CLIENT && AD_UNITS[id] ? AD_UNITS[id]! : null);

/**
 * 広告の枠を出すか。本番は運営者 ID が入った時だけ。開発版は仮の枠を出す (?ads=0 で消す、?ads=1 で戻す。このタブの間は覚える)
 */
export function adsWanted(dev: boolean = !!import.meta.env.DEV): boolean {
  try {
    const q = new URLSearchParams(location.search).get("ads");
    if (q === "0") sessionStorage.setItem("exiledesk.ads", "0");
    if (q === "1") sessionStorage.removeItem("exiledesk.ads");
    if (sessionStorage.getItem("exiledesk.ads") === "0") return false;
  } catch { /* 覚えられない時は既定 */ }
  return !!AD_CLIENT || dev;
}
