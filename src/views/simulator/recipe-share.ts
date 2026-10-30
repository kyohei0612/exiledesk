/**
 * recipe-share.ts — クラフトの道 (ツリー) のレシピを URL で渡す・URL から開く (2026-10-18 オーナー「ファイルじゃなくて URL から始めるようにする予定、シェア機能」)。
 * 木を縮めて URL の # に全部乗せる。# はサーバーに送られないので、サーバーも KV も使わない (エミュレーターの共有 share.ts と同じ形)。
 * 開いた人は木のレシピに足して、クラフトの道で開く。旧シミュレーターのレシピ (v 1) は工程ページと一緒に 10-22 に消した
 */
import { nextTick, ref } from "vue";
import { SIM_LOCKED } from "../../state/craft-stage";
import { packJson, unpackJson } from "../../services/craft-stage/share";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { logRecord } from "../../utils/log-record";
import type { TreeDoc } from "../../services/simulator/tree/tree-model";
import { migrateTreeDoc } from "../../services/simulator/tree/tree-migrate";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import { addTreeRecipe, removeTreeRecipe, sameTree, setCurrentTreeRecipe, treeRecipes } from "../../state/simulator/tree-recipes";
import { DEV_BUILD } from "../../web/release-flags";
import { recipeCardOf } from "./recipe-card";
import { DEV_RECIPES } from "./dev-recipes";
import { useTree } from "./tree/use-tree";
import { openTreePage } from "../../web/page";
import { setMapFold } from "./phone/map-fold";
import { tr } from "../../i18n/lang";
import { simAct } from "../../web/track";

/** URL の # の頭 */
const RECIPE_SHARE_PREFIX = "#recipe=";
/** ツリーのレシピ (2026-10-21、クラフトの道): v = 2、n = 名前、t = 木 (TreeDoc) */
type PackedTree = { v: 2; n: string; t: TreeDoc };

/** ツリーのレシピの URL (#recipe= の頭は同じ。開くと読む側が v で見分ける) */
export async function treeShareUrl(r: { name: string; tree: TreeDoc }): Promise<string> {
  // スイッチ recipeV1 の下は打ち方だけ (v1、S-104)。開く側は v1 も前の木も migrateTreeDoc で読む
  const code = await packJson({ v: 2, n: r.name, t: toRecipeV1(r.tree) } satisfies PackedTree);
  const base = isTauriRuntime() ? "https://exiledesk.com/" : `${location.origin}${location.pathname}`;
  return `${base}${RECIPE_SHARE_PREFIX}${code}`;
}

/** 短い URL の受け口 (サーバー 5 の server/web/recipe-share.js、10-26 夜オーナー OK)。アプリでも本番の住所 (短い URL は本番でしか開かない。開発版は短くしない = S-103b) */
const SHORT_HOST = "https://exiledesk.com";
/**
 * レシピの短い URL (https://exiledesk.com/r/<id>)。#recipe= の後ろの code をそのまま POST /r/new に送り { id } を受ける。
 * 届かない・400 (形が違う・長すぎ)・429 (混んでいる) の時は今の長い URL (共有メモ recipe-short-url-api.md)
 */
export async function treeShortUrl(r: { name: string; tree: TreeDoc }): Promise<string> {
  const long = await treeShareUrl(r);
  // 開発版の作りは今の住所の長い URL (短い URL は本番へ飛び、本番に無い手から先を読めず止まる。S-103b、10-29 深夜オーナー「URLから開いたらなんかそこでとまってた」)
  if (DEV_BUILD && !isTauriRuntime()) return long;
  const code = long.slice(long.indexOf(RECIPE_SHARE_PREFIX) + RECIPE_SHARE_PREFIX.length);
  try {
    // カード絵の値も一緒に (JSON { code, card }、スイッチ recipeCard。閉じている間はただの code)
    let card: ReturnType<typeof recipeCardOf> | null = null;
    try { card = recipeCardOf(r.tree); } catch { card = null; }
    const res = await fetch(`${SHORT_HOST}/r/new`, { method: "POST", body: card ? JSON.stringify({ code, card }) : code }); // ヘッダーは付けない (サーバーは本文の頭の { で見分ける。付けると別の住所からは事前の問い合わせが要る)
    if (!res.ok) return long;
    const id = ((await res.json()) as { id?: unknown }).id;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(id) ? `${SHORT_HOST}/r/${id}` : long;
  } catch {
    return long;
  }
}
/**
 * レシピの URL をクリップボードへ (短い URL、だめなら長い URL)。Safari は await の後の writeText を断るので、押した瞬間に
 * ClipboardItem に Promise を渡して書く (無ければ・断られたら writeText)。ok = 書けた、short = 短い URL だった
 */
export async function copyRecipeUrl(r: { name: string; tree: TreeDoc }): Promise<{ ok: boolean; short: boolean }> {
  const url = treeShortUrl(r);
  void url.then((u) => simAct("copy", u.startsWith(`${SHORT_HOST}/r/`) ? "short" : "long")); // シミュの操作の流れ (web/sim-trail)
  const short = (u: string): boolean => u.startsWith(`${SHORT_HOST}/r/`);
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("no ClipboardItem");
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": url.then((u) => new Blob([u], { type: "text/plain" })) })]);
    return { ok: true, short: short(await url) };
  } catch {
    const u = await url;
    return navigator.clipboard.writeText(u).then(() => ({ ok: true, short: short(u) }), () => ({ ok: false, short: false }));
  }
}


/** 開発版だけ: 見本のレシピを保存したレシピに足す (dev-recipes。同じ名前があれば足さない。10-26 モンキー 7 の 23) */
/** 開発版の見本の名前 (「見本: …」「見本 2: …」) */
const DEV_NAME = /^見本( \d+)?: /;
export async function seedDevRecipes(): Promise<void> {
  if (!DEV_BUILD || SIM_LOCKED) return;
  for (const r of DEV_RECIPES) {
    try {
      const p = (await unpackJson(r.code)) as Partial<PackedTree>;
      const t = p?.v === 2 ? migrateTreeDoc(p.t)?.doc : null;
      if (!t) continue;
      // 同じ名前・同じ中身ならそのまま。違えば前の見本 (「見本:」「見本 2:」… の名前) を全部消して入れ直す。人が別の名前で保存したレシピは触らない
      // (10-26 オーナー「一旦整理して」: 見本 1・2・3 が並んでいた)
      const same = treeRecipes.value.find((x) => x.name === r.name);
      if (same && sameTree(same.tree, t)) continue;
      for (const x of treeRecipes.value.filter((y) => DEV_NAME.test(y.name))) removeTreeRecipe(x.id);
      addTreeRecipe(r.name, t);
    } catch { /* 読めない見本は足さない */ }
  }
}

/**
 * 開いたレシピの、今の作りに入っていない手 (スイッチの下の手。名前の一覧、無ければ空)。S-103b: 本番で開くとそこから先を組めず止まるので知らせる。
 * 今は無い (前のカタリストの「品質を n % まで」の手 catHand は本番に出た、R5)。スイッチの下の手が出来たら、保存の形 v1 は picks・前の形は箱の手を見てここに足す
 */
export function newerHands(_t: TreeDoc): string[] {
  return [];
}
/** 今開いたレシピの今の作りに無い手 (木の上のレシピの帯に出す。× で閉じる・保存しない、S-103b) */
export const sharedNewer = ref<string[]>([]);
export const closeNewer = (): void => { sharedNewer.value = []; };

/** 今の URL の # にレシピがあれば、保存したレシピに足して (同じ中身があればそれを使う)、そのレシピでシミュレーターを始める */
export async function openSharedRecipe(): Promise<void> {
  const m = /^#recipe=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  // 開いた後は URL から外す (読み直すたびに足されないように)
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* 外せなくても開く */ }
  // タップ 1 回で木まで: スマホは「完成形と全体図」の窓を開いて着く (PC は木のページがそのまま木。S-103、スイッチ recipeJump)
  if (await openRecipeCode(m[1]!)) setMapFold(false);
}

/** 貼った物からレシピの中身を取り出す (URL の全体でも、#recipe= の後ろだけでも。開発版・本番どちらの URL でも中身は同じ) */
const recipeCodeOf = (text: string): string | null => {
  const t = text.trim();
  const m = /#recipe=([A-Za-z0-9_-]+)/.exec(t) ?? /^([A-Za-z0-9_-]{20,})$/.exec(t);
  return m ? m[1]! : null;
};

/**
 * レシピの中身 (縮めた物) を開く: 保存したレシピに足して (同じ中身があればそれを使う)、そのレシピでシミュレーターを始める。
 * 読めない時は false (ベースを選ぶページの「URL を貼る欄」から呼ぶ。2026-10-21 オーナー「ここはレシピ URL 入力もしくは保存されてるレシピをプルダウン」)
 */
async function openRecipeCode(code: string): Promise<boolean> {
  if (SIM_LOCKED) return false;
  try {
    const p = (await unpackJson(code)) as Partial<PackedTree>;
    // ツリーのレシピ: 保存したレシピに足して (同じ中身があればそれ)、クラフトの道で開く
    if (p && p.v === 2) {
      // 古い版の木は今の形へ読み替える (読めない箱は要確認の印で残す、tree-migrate)
      const t = migrateTreeDoc((p as PackedTree).t)?.doc;
      if (!t) return false;
      sharedNewer.value = newerHands(t);
      const tr2 = addTreeRecipe(String((p as PackedTree).n ?? ""), t);
      setCurrentTreeRecipe(tr2.id);
      useTree().open(tr2.tree);
      openTreePage();
      logRecord("tree_recipe_shared", { boxes: Object.keys(t.boxes).length });
      return true;
    }
    // 旧シミュレーターのレシピ (v 1) は工程ページを 10-22 に消したので開かない (クラフトのまま)
    return false;
  } catch { return false; }
}

/**
 * レシピの URL を貼る欄 (レシピのページ・ベースを選ぶページの「レシピから始める」・ツリーの上の帯): 貼ったら (か Enter・開く) 読み込む。
 * 文はページごとに替えられる。開けた時は欄を空にして onOpened
 */
export function useRecipeUrl(o: { notUrl?: [string, string]; unreadable?: [string, string]; onOpened?: () => void } = {}) {
  const url = ref("");
  const urlNote = ref("");
  async function openUrl(): Promise<void> {
    const code = recipeCodeOf(url.value);
    if (!code) { urlNote.value = url.value.trim() ? tr(...(o.notUrl ?? ["レシピの URL ではありません (#recipe= の付いた URL を貼る)", "Not a recipe URL (paste one with #recipe=)"])) : ""; return; }
    const ok = await openRecipeCode(code);
    urlNote.value = ok ? "" : tr(...(o.unreadable ?? ["このレシピは読めませんでした", "Couldn't read this recipe"]));
    if (ok) { url.value = ""; o.onOpened?.(); }
  }
  function onPaste(): void { void nextTick(() => { if (recipeCodeOf(url.value)) void openUrl(); }); }
  return { url, urlNote, openUrl, onPaste };
}
/** レシピの日時 (保存の既定の名前・一覧): 「月/日 時:分」、今年でなければ頭に年 */
export const fmtDate = (t: number): string => { const d = new Date(t); return `${d.getFullYear() === new Date().getFullYear() ? "" : `${d.getFullYear()}/`}${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
