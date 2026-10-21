/**
 * use-spam-share.ts — スパムシミュレーターの運試しの X のシェア (StageRouteLuck.vue。もとはカオススパム計算機の物、計算機は 2026-10-19 に消した)。
 * 運の言葉 (luck・rankWord) も PC の欄・スマホの帯・シェアの文で同じ物を使う
 */
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { openExternal } from "../../services/trade2/open-external";
import { logRecord } from "../../utils/log-record";
import { tr } from "../../i18n/lang";
import { packJson } from "../../services/craft-stage/share";


/** 運の言葉 (PC の欄とスマホの帯で同じ) */
export const luck = (r: number): string => (r <= 10 ? tr("かなりの強運", "very lucky") : r <= 50 ? tr("運がいい方", "lucky") : r <= 90 ? tr("運が悪い方", "unlucky") : tr("かなりの沼", "very unlucky"));
/** 順位の言葉: 半分より早ければ「上位」、遅ければ「下位」(85% → 下位 15%。2026-10-16 オーナー「運悪いのに上位はおかしい」) */
export const rankWord = (r: number): string => (r <= 50 ? tr(`上位 ${r}%`, `top ${r}%`) : tr(`下位 ${Math.max(1, 100 - r)}%`, `bottom ${Math.max(1, 100 - r)}%`));
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * 中身を縮めて URL に (server/web/og-card.js の PACK と同じ並び: [l, b, bn, m, n, a, r, md, u, c, setup] を deflate → base64url)。
 * setup = スパムを始めた時のアイテム・狙い・カオスの種類 (開いた人に同じ計算機を出す、state/spam-share-open.ts。2026-10-17)
 */
export async function packCard(v: Array<string | number | object | null>): Promise<string> {
  return packJson(v);
}
/**
 * 短い URL (2026-10-18 オーナー「スマホからシェアの URL 長くて怖い」): code の SHA-256 から 7 文字の id (server/web/og-card.js の shortIdOf と同じ式)。
 * 中身は押した時に POST /s/new で D1 に置く (サーバーはその時にカードの絵も作る)。押さなければ何も置かない
 */
export async function shortIdOf(code: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)));
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(h[i]!);
  let out = "";
  for (let i = 0; i < 7; i++) { out += B62[Number(n % 62n)]; n /= 62n; }
  return out;
}

/** シェアの URL の頭 (アプリは本番のサイト) */
export const shareOrigin = (): string => (isTauriRuntime() ? "https://exiledesk.com" : location.origin);
/**
 * X へ送る (カオススパム計算機とスパムシミュレーターで同じ)。短い URL の中身を置いて、アプリは外のブラウザ、スマホは X のアプリ
 * (2026-10-16 オーナー「スマホ版はそのままアプリに飛ばそうか」。アプリが無くて開けなかった時は 1.5 秒後に Web の投稿画面へ)
 */
export function sendShare(e: MouseEvent, o: { code: string; web: string; text: string; url: string; log: Record<string, unknown> }): void {
  const origin = shareOrigin();
  if (o.code) void fetch(`${origin}/s/new`, { method: "POST", body: o.code, keepalive: true, headers: { "content-type": "text/plain" } }).catch(() => { /* 置けなければ開いた人はトップへ */ });
  const mobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  logRecord("emu_spam_share", { to: mobile ? "x-app" : "x", ...o.log });
  if (isTauriRuntime()) { e.preventDefault(); void openExternal(o.web); return; }
  if (!mobile) return;
  e.preventDefault();
  let left = false;
  const onHide = (): void => { if (document.visibilityState === "hidden") left = true; };
  document.addEventListener("visibilitychange", onHide);
  setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!left && document.visibilityState === "visible") location.href = o.web;
  }, 1500);
  location.href = `twitter://post?message=${encodeURIComponent(`${o.text}\n${o.url}`)}`;
}
