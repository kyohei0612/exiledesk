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

/** URL の # の頭 */
export const RECIPE_SHARE_PREFIX = "#recipe=";
/** 縮める形: v = 形の版、n = 名前、j = ベースの日本語名、s = 中身 (SimSession) */
type Packed = { v: 1; n: string; j?: string; s: SimRecipe["session"] };

/** レシピの URL (アプリからは Web 版のアドレスで) */
export async function recipeShareUrl(r: Pick<SimRecipe, "name" | "baseJa" | "session">): Promise<string> {
  const code = await packJson({ v: 1, n: r.name, ...(r.baseJa ? { j: r.baseJa } : {}), s: r.session } satisfies Packed);
  const base = isTauriRuntime() ? "https://exiledesk.com/web.html" : `${location.origin}${location.pathname}`;
  return `${base}${RECIPE_SHARE_PREFIX}${code}`;
}

/** 今の URL の # にレシピがあれば、保存したレシピに足して (同じ中身があればそれを使う)、そのレシピでシミュレーターを始める */
export async function openSharedRecipe(): Promise<void> {
  const m = /^#recipe=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return;
  // 開いた後は URL から外す (読み直すたびに足されないように)
  try { history.replaceState(null, "", location.pathname + location.search); } catch { /* 外せなくても開く */ }
  if (SIM_LOCKED) return;
  let r: SimRecipe | null = null;
  try {
    const p = (await unpackJson(m[1]!)) as Partial<Packed>;
    r = p && p.v === 1 ? normalizeRecipe({ name: p.n, baseJa: p.j, savedAt: Date.now(), session: p.s }) : null;
  } catch { r = null; }
  if (!r) return;
  if (!s.data.value) await new Promise<void>((res) => { const stop = watch(s.data, (d) => { if (d) { stop(); res(); } }); });
  const list = readSimRecipes();
  const key = JSON.stringify(r.session);
  const same = list.find((x) => JSON.stringify(x.session) === key);
  if (!same) writeSimRecipes([r, ...list]);
  basePage.value = false;
  s.mode.value = "sim";
  useStageBase().startFromRecipe(same ?? r);
  logRecord("sim_recipe_shared", { base: r.session.base, n: r.session.targets.length, saved: !!same });
}
