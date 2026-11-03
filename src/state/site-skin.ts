/**
 * site-skin.ts — サイト全体の色の皮 (shared-ui.md U-49b、スイッチ siteLook)。
 * 既定 = 今のサイトの色 (何も書かない) / 日替わり = デイリーと同じその日の皮 / 固定 = 皮の 1 つ。
 * 色の札はデイリーの skin.ts の 1 か所 (D-60)。選んだ皮の skinVars を <html> の style に書くだけで、部品は --exile-color-* を読む。
 * 覚える所は端末の localStorage だけ (読み書きできない端末は既定)
 */
import { ref, watch } from "vue";
import { skinById, skinOfDay, skinVars, usableSkins, type Skin } from "../views/daily/skin/skin";
import { flag } from "../web/release-flags";
import { tr } from "../i18n/lang";

export const SITE_SKIN_KEY = "exiledesk.site.skin";
/** "default" | "daily" | 皮の id */
export type SiteSkinChoice = string;

/** 7:00 JST 区切りの日の番号 (views/daily/daily-api.ts の dayNoOf と同じ式。あちらはお題の部品まで読むので、入口からは読まない) */
const JST = 9 * 3600_000, H7 = 7 * 3600_000, DAY = 24 * 3600_000;
const dayNoOf = (now: number): number => Math.floor((now + JST - H7) / DAY);

function read(): SiteSkinChoice {
  try { return localStorage.getItem(SITE_SKIN_KEY) ?? "default"; } catch { return "default"; }
}
export const siteSkin = ref<SiteSkinChoice>(read());

/** 選んだ物 → 皮 (既定は null = 何も書かない) */
export function skinOfChoice(c: SiteSkinChoice, now = Date.now()): Skin | null {
  if (c === "daily") return skinOfDay(dayNoOf(now));
  return c === "default" ? null : skinById(c);
}

export function setSiteSkin(c: SiteSkinChoice): void {
  siteSkin.value = c;
  try { if (c === "default") localStorage.removeItem(SITE_SKIN_KEY); else localStorage.setItem(SITE_SKIN_KEY, c); } catch { /* 覚えられなくてもその場は替わる */ }
}

/** プルダウンの並び: 既定・日替わり (今日の皮の名前つき)・固定 (文字の濃さの見張りを通る皮だけ、D-60a) */
export function siteSkinOptions(now = Date.now()): { value: SiteSkinChoice; label: string }[] {
  const today = skinOfDay(dayNoOf(now));
  return [
    { value: "default", label: tr("既定", "Default") },
    { value: "daily", label: tr(`日替わり (今日: ${today.ja})`, `Daily (today: ${today.en})`) },
    ...usableSkins().map((k) => ({ value: k.id, label: tr(k.ja, k.en) })),
  ];
}

let written: string[] = [];
function apply(): void {
  const root = document.documentElement;
  for (const n of written) root.style.removeProperty(n);
  written = [];
  const k = skinOfChoice(siteSkin.value);
  if (!k) { root.removeAttribute("data-site-skin"); return; }
  for (const [n, v] of Object.entries(skinVars(k))) { root.style.setProperty(n, v); written.push(n); }
  root.setAttribute("data-site-skin", k.id);
}

/** 入口で 1 回。日替わりは開いたままでも 7:00 JST で替わるよう 10 分ごとに見直す */
export function initSiteSkin(): void {
  if (!flag("siteLook")) return;
  apply();
  watch(siteSkin, apply);
  setInterval(() => { if (siteSkin.value === "daily") apply(); }, 10 * 60_000);
}
