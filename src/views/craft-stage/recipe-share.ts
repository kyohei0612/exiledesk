/**
 * recipe-share.ts — シミュレーターのレシピを URL で渡す・URL から始める (2026-10-18 オーナー「ファイルじゃなくて URL から始めるようにする予定、シェア機能」)。
 * レシピ (名前・ベース・狙い・始め方・値段・順番・パターン) を縮めて URL の # に全部乗せる。# はサーバーに送られないので、
 * サーバーも KV も使わない (エミュレーターの共有 share.ts と同じ形)。開いた人は保存したレシピに足して、そのレシピでシミュレーターを始める
 */
import { watch } from "vue";
import { craftStage as s, normalizeRecipe, readSimRecipes, SIM_LOCKED, writeSimRecipes, type SimRecipe } from "../../state/craft-stage";
import { packJson, unpackJson } from "../../services/craft-stage/share";
import { basePage } from "../../state/web-page";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { logRecord } from "../../utils/log-record";
import { useStageBase } from "./use-stage-base";
import { reloadRecipes } from "../../state/sim-recipe-store";
import { sendShare } from "./use-spam-share";
import { tr } from "../../i18n/lang";

/** URL の # の頭 */
export const RECIPE_SHARE_PREFIX = "#recipe=";
/** 縮める形: v = 形の版、n = 名前、j = ベースの日本語名、s = 中身 (SimSession) */
type Packed = { v: 1; n: string; j?: string; s: SimRecipe["session"] };

/** レシピの URL (アプリからは Web 版のアドレスで) */
export async function recipeShareUrl(r: Pick<SimRecipe, "name" | "baseJa" | "session">): Promise<string> {
  const code = await packJson({ v: 1, n: r.name, ...(r.baseJa ? { j: r.baseJa } : {}), s: r.session } satisfies Packed);
  // Web 版は / で開く (web.html は 404。2026-10-21 オーナー「URL でレシピ読み込まない」)
  const base = isTauriRuntime() ? "https://exiledesk.com/" : `${location.origin}${location.pathname}`;
  return `${base}${RECIPE_SHARE_PREFIX}${code}`;
}

/** 今の URL の # にレシピがあれば、保存したレシピに足して (同じ中身があればそれを使う)、そのレシピでシミュレーターを始める */
export async function openSharedRecipe(): Promise<void> {
  const m = /^#recipe=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  // 開いた後は URL から外す (読み直すたびに足されないように)
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* 外せなくても開く */ }
  await openRecipeCode(m[1]!);
}

/** 貼った物からレシピの中身を取り出す (URL の全体でも、#recipe= の後ろだけでも。開発版・本番どちらの URL でも中身は同じ) */
export const recipeCodeOf = (text: string): string | null => {
  const t = text.trim();
  const m = /#recipe=([A-Za-z0-9_-]+)/.exec(t) ?? /^([A-Za-z0-9_-]{20,})$/.exec(t);
  return m ? m[1]! : null;
};

/**
 * レシピの中身 (縮めた物) を開く: 保存したレシピに足して (同じ中身があればそれを使う)、そのレシピでシミュレーターを始める。
 * 読めない時は false (ベースを選ぶページの「URL を貼る欄」から呼ぶ。2026-10-21 オーナー「ここはレシピ URL 入力もしくは保存されてるレシピをプルダウン」)
 */
export async function openRecipeCode(code: string): Promise<boolean> {
  if (SIM_LOCKED) return false;
  let r: SimRecipe | null = null;
  try {
    const p = (await unpackJson(code)) as Partial<Packed>;
    r = p && p.v === 1 ? normalizeRecipe({ name: p.n, baseJa: p.j, savedAt: Date.now(), session: p.s }) : null;
  } catch { r = null; }
  if (!r) return false;
  if (!s.data.value) await new Promise<void>((res) => { const stop = watch(s.data, (d) => { if (d) { stop(); res(); } }); });
  const list = readSimRecipes();
  const key = JSON.stringify(r.session);
  const same = list.find((x) => JSON.stringify(x.session) === key);
  if (!same) writeSimRecipes([r, ...list]);
  reloadRecipes();
  basePage.value = false;
  s.mode.value = "sim";
  useStageBase().startFromRecipe(same ?? r);
  logRecord("sim_recipe_shared", { base: r.session.base, n: r.session.targets.length, saved: !!same });
  return true;
}

/** X に送る文 (レシピの名前・ベース・狙いの数) */
export function recipeShareText(r: Pick<SimRecipe, "name" | "baseJa" | "session">): string {
  const base = r.baseJa ?? r.session.base;
  const n = r.session.targets.length;
  return tr(`PoE2 のクラフトレシピ「${r.name}」(${base}・狙い ${n} つ)。開くとシミュレーターでそのまま回せます
#PoE2 #ExileDesk`,
    `PoE2 craft recipe "${r.name}" (${base}, ${n} target mods). Open it to run it in the simulator
#PoE2 #ExileDesk`);
}
/**
 * X へ送る (スパムシミュレーターと同じ送り方: アプリは外のブラウザ、スマホは X のアプリ)。レシピは URL の # に全部乗っているので短い URL は作らない
 * (X が t.co に縮める)。<a :href="web" target="_blank" @click="shareRecipeX($event, …)"> で使う
 */
export function recipeXUrl(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
export function shareRecipeX(e: MouseEvent, text: string, url: string, base: string): void {
  sendShare(e, { code: "", web: recipeXUrl(text, url), text, url, log: { kind: "recipe", base } });
}
