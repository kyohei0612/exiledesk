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
import { addTreeRecipe, removeTreeRecipe, sameTree, setCurrentTreeRecipe, treeRecipes } from "../../state/simulator/tree-recipes";
import { DEV_BUILD } from "../../web/release-flags";
import { DEV_RECIPES } from "./dev-recipes";
import { useTree } from "./tree/use-tree";
import { openTreePage } from "../../web/page";
import { tr } from "../../i18n/lang";

/** URL の # の頭 */
const RECIPE_SHARE_PREFIX = "#recipe=";
/** ツリーのレシピ (2026-10-21、クラフトの道): v = 2、n = 名前、t = 木 (TreeDoc) */
type PackedTree = { v: 2; n: string; t: TreeDoc };

/** ツリーのレシピの URL (#recipe= の頭は同じ。開くと読む側が v で見分ける) */
export async function treeShareUrl(r: { name: string; tree: TreeDoc }): Promise<string> {
  const code = await packJson({ v: 2, n: r.name, t: r.tree } satisfies PackedTree);
  const base = isTauriRuntime() ? "https://exiledesk.com/" : `${location.origin}${location.pathname}`;
  return `${base}${RECIPE_SHARE_PREFIX}${code}`;
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

/** 今の URL の # にレシピがあれば、保存したレシピに足して (同じ中身があればそれを使う)、そのレシピでシミュレーターを始める */
export async function openSharedRecipe(): Promise<void> {
  const m = /^#recipe=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  // 開いた後は URL から外す (読み直すたびに足されないように)
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* 外せなくても開く */ }
  await openRecipeCode(m[1]!);
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
