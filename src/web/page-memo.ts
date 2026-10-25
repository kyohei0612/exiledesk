/**
 * page-memo.ts — 戻って来た時だけ、離れる前の画面に戻す (10-25 オーナー「開き直したら全部最初の画面、ブクマから来たら絶対最初、
 * リロードはそのページを読み込み直したのと一緒」「戻るは前の画面」)。スイッチ emuFresh の下 (切れている本番は今まで通り何も戻さない)。
 *
 * - cameBack(): 戻って来た読み込みか。ブラウザの戻る・進む (back_forward)、このサイトの中のリンク (記事のロゴ・ヘッダー = 同じ origin の referrer)、
 *   版が替わった後の自動の読み直し (web.html の __staleReload、印 exiledesk-stale-reload の 1 分の窓。人が押したのではない) は true。
 *   リロード・アドレスの打ち直し・ブックマーク・外のサイトから来た時は false
 * - remember(name, get): ページごとに要る物だけ写す。離れる時 (pagehide・見えなくなった時) に get() を sessionStorage (このタブだけ) へ書き、
 *   戻って来た読み込みで、離れた時と同じ URL の時だけ 1 回返す (記事のロゴで web.html に来た時は、スキンなど別のページの写しは返さない)。
 *   エミュのアイテムと工程は stage-session.ts (前からある写し) で、見分けはここの cameBack を使う
 */
import { flag } from "./release-flags";

const KEY = "exiledesk.page.memo.v1";

export function cameBack(): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "back_forward") return true;
    if (nav?.type === "reload") {
      const [f, n] = (sessionStorage.getItem("exiledesk-stale-reload") ?? "").split(":").map(Number);
      return !!n && Date.now() - (f ?? 0) < 90_000;
    }
    return !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
}

interface Memo { search: string; data: Record<string, unknown> }
const ON = typeof window !== "undefined" && flag("emuFresh");
/** 読み込んだ時に返せる写し (戻って来た時・同じ URL の時だけ)。返したら消す */
const restored: Record<string, unknown> = (() => {
  if (!ON) return {};
  try {
    const m = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Memo | null;
    sessionStorage.removeItem(KEY);
    return m && cameBack() && m.search === location.search ? m.data : {};
  } catch {
    return {};
  }
})();
const getters = new Map<string, () => unknown>();
function save(): void {
  try {
    const data: Record<string, unknown> = {};
    for (const [k, get] of getters) { const v = get(); if (v != null) data[k] = v; }
    sessionStorage.setItem(KEY, JSON.stringify({ search: location.search, data } satisfies Memo));
  } catch { /* 写せなくても動く (戻った時にそのページの最初になるだけ) */ }
}
if (ON) {
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
}

/** name の物を離れる時に写す。戻って来た読み込みなら前の値を 1 回だけ返す (無ければ undefined)。get が null を返す時は写さない */
export function remember<T>(name: string, get: () => T | null): T | undefined {
  if (!ON) return undefined;
  getters.set(name, get);
  const v = restored[name] as T | undefined;
  delete restored[name];
  return v;
}
/** そのページを閉じた時に写すのをやめる (閉じたページの写しが、別のページから離れる時に混ざらないように) */
export function forget(name: string): void { getters.delete(name); }
