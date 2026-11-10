/**
 * site-skin.ts — サイト全体の色の皮 (shared-ui.md U-49b、スイッチ siteLook)。
 * 既定 = 今のサイトの色 (何も書かない) / 日替わり = 12 か月の色を日ごとに順に / 固定 = 12 か月の色の 1 つ。
 * 札の書き方と色の出し方はデイリーの skin.ts (D-60) と同じ。選んだ札の skinVars (字の色を除く) を <html> の style に書くだけで、部品は --exile-color-* を読み、絵は --skin-art で染まる (styles/site-look.css)。
 * 覚える所は端末の localStorage だけ (読み書きできない端末・今は無い札は既定)。URL の ?skin= はそれより先に効き、覚えない
 */
import { ref, watch } from "vue";
import { skinVars, type Skin } from "../views/daily/skin/skin";
import { flag } from "../web/release-flags";
import { tr } from "../i18n/lang";

export const SITE_SKIN_KEY = "exiledesk.site.skin";
/** "default" | "daily" | 札の id */
export type SiteSkinChoice = string;

/** 12 か月の色 (U-49b の表。オーナー 11-03「12色で…12月から1月まで表して」「霜月とか」)。g = 0.7、f = a。12 色とも文字の濃さの見張り 4.5 以上 */
const month = (id: string, ja: string, en: string, h: number, s: number, d: number, a: number): Skin => ({ id, ja, en, h, s, d, g: 0.7, a, f: a });
export const MONTH_SKINS: readonly Skin[] = [
  month("mutsuki", "睦月", "Mutsuki (Jan)", 356, 30, 0.9, 44),
  month("kisaragi", "如月", "Kisaragi (Feb)", 214, 12, 0.9, 335),
  month("yayoi", "弥生", "Yayoi (Mar)", 340, 26, 0.9, 345),
  month("uzuki", "卯月", "Uzuki (Apr)", 95, 22, 0.9, 75),
  month("satsuki", "皐月", "Satsuki (May)", 268, 28, 0.9, 280),
  month("minazuki", "水無月", "Minazuki (Jun)", 222, 34, 0.9, 232),
  month("fumizuki", "文月", "Fumizuki (Jul)", 238, 40, 0.93, 50),
  month("hazuki", "葉月", "Hazuki (Aug)", 186, 40, 0.9, 176),
  month("nagatsuki", "長月", "Nagatsuki (Sep)", 40, 20, 0.88, 48),
  month("kannazuki", "神無月", "Kannazuki (Oct)", 16, 38, 0.9, 24),
  month("shimotsuki", "霜月", "Shimotsuki (Nov)", 198, 20, 0.88, 192),
  month("shiwasu", "師走", "Shiwasu (Dec)", 0, 10, 0.93, 2),
];
const monthById = (id: string): Skin | null => MONTH_SKINS.find((k) => k.id === id) ?? null;

/** 16:00 JST 区切りの日の番号 = デイリーの切り替えと同じ (views/daily/daily-api.ts の dayNoOf と同じ式。あちらはお題の部品まで読むので、入口からは読まない。U-49b、11-10 オーナー「日替わりは任せる」→ デイリーと同じに) */
const JST = 9 * 3600_000, H16 = 16 * 3600_000, DAY = 24 * 3600_000;
const dayNoOf = (now: number): number => Math.floor((now + JST - H16) / DAY);
/** 日替わりの今日の札 (12 か月の色を日の番号で順に) */
const skinOfToday = (now: number): Skin => MONTH_SKINS[((dayNoOf(now) % 12) + 12) % 12]!;

/** URL の ?skin=1〜12 (月の番号) か ?skin=<札の id>・default・daily。見るだけで端末には覚えない (U-49b、オーナー 11-03「ちゃんとＵＲＬでくれ」) */
function fromUrl(): SiteSkinChoice | null {
  let v: string | null = null;
  try { v = new URLSearchParams(location.search).get("skin"); } catch { return null; }
  if (!v) return null;
  const n = Number(v);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return MONTH_SKINS[n - 1]!.id;
  return v === "default" || v === "daily" || monthById(v) ? v : null;
}
function read(): SiteSkinChoice {
  const u = fromUrl();
  if (u) return u;
  try { return localStorage.getItem(SITE_SKIN_KEY) ?? "default"; } catch { return "default"; }
}
export const siteSkin = ref<SiteSkinChoice>(read());

/** 選んだ物 → 札 (既定・今は無い札は null = 何も書かない) */
export function skinOfChoice(c: SiteSkinChoice, now = Date.now()): Skin | null {
  if (c === "daily") return skinOfToday(now);
  return c === "default" ? null : monthById(c);
}

export function setSiteSkin(c: SiteSkinChoice): void {
  siteSkin.value = c;
  try { if (c === "default") localStorage.removeItem(SITE_SKIN_KEY); else localStorage.setItem(SITE_SKIN_KEY, c); } catch { /* 覚えられなくてもその場は替わる */ }
}

/** プルダウンの並び: 既定・日替わり (今日の札の名前つき)・12 か月 (睦月から師走) */
export function siteSkinOptions(now = Date.now()): { value: SiteSkinChoice; label: string }[] {
  const today = skinOfToday(now);
  return [
    { value: "default", label: tr("既定", "Default") },
    { value: "daily", label: tr(`日替わり (今日: ${today.ja})`, `Daily (today: ${today.en})`) },
    ...MONTH_SKINS.map((k) => ({ value: k.id, label: tr(k.ja, k.en) })),
  ];
}

/** 字の色は今のサイトの色のまま (題・見出し・本文・薄い字。オーナー 11-03「てか文字の色はかえなくていいや」)。12 色とも薄い字と一番明るい地の差 5.37 以上 */
const KEEP_TEXT = /^--(exile-color-text-|skin-(title|text|dim)$)/;
let written: string[] = [];
function apply(): void {
  const root = document.documentElement;
  for (const n of written) root.style.removeProperty(n);
  written = [];
  const k = skinOfChoice(siteSkin.value);
  if (!k) { root.removeAttribute("data-site-skin"); return; }
  for (const [n, v] of Object.entries(skinVars(k))) {
    if (KEEP_TEXT.test(n)) continue;
    root.style.setProperty(n, v);
    written.push(n);
  }
  root.setAttribute("data-site-skin", k.id);
}

/** 入口で 1 回。日替わりは開いたままでも 16:00 JST で替わるよう 10 分ごとに見直す */
export function initSiteSkin(): void {
  if (!flag("siteLook")) return;
  apply();
  watch(siteSkin, apply);
  setInterval(() => { if (siteSkin.value === "daily") apply(); }, 10 * 60_000);
}
