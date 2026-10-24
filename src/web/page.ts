/**
 * Web 版のページ (2026-10-18 オーナー「チュートリアルはタブに大々的に出さず、使い方にしまう。ページ遷移させて」)。
 * 広告はページで数えるので ([[ads-page-model]])、画面ごとに URL と題を変える:
 *   - エミュレーターなど: / (今までどおり)
 *   - 使い方・コツ (動画へのリンク + チュートリアルのコース一覧): ?page=guide
 *   - コースの途中: ?course=<id>
 *   - ベース選び: ?page=base (「ベースを変える」・まだ選んでいない時。2026-10-18 2 回目)
 *   - スパムシミュレーター: ?page=routes (カレンシーの見出しから・X のシェアから。旧カオススパム計算機 ?page=spam は 2026-10-19 に消した)
 *   - 要望・バグを送る: ?page=feedback
 *   - シミュレーターのレシピ (保存・上書き・共有): ?page=recipes (2026-10-21)
 *   - クラフトの道 (ツリー): ?page=sim-tree (2026-10-22、開発版だけ。工程の sim-○○ より先に見分ける)。最初のベース選び ?page=sim-base・完成の MOD ?page=sim-mods も同じツリーのページ (treeStep、2026-10-24)
 *   - デイリークラフトチャレンジ: ?page=daily (一覧)・?page=daily&q=<id> (お題)・?page=daily-start&q=<id> (フラクチャー選び) (2026-10-22、開発版だけ。ヘッダーの「デイリー」から)
 *   - 旧シミュレーターの工程 (?page=sim-mods など) は 10-22 に消した。古い URL はクラフトのまま開く
 * 移るたびに履歴に積む (ブラウザの戻るで前のページへ)。URL から開いた時もそのページで始める (計算機は今のアイテムが要るので URL からは開かない)。
 * ページを移るたびに広告の枠を出し直す (utils/ads.ts の pageTick)。MOD 一覧は重ねる窓のまま、ページにしない (2026-10-12)
 */
import { computed, ref, watch } from "vue";
import { craftStage as s } from "../state/craft-stage";
import { topic } from "../state/tutorial/craft-topic";
import { course } from "../state/tutorial/craft-course";
import { endLesson, inLesson, startTopicAt } from "../state/tutorial/craft-lesson";
import { basePage, baseUnpicked, dailyPage, DAILY_ON, type DailyView, feedbackPage, openRoutes, recipesPage, routesOpen, TREE_ON, treePage, routesTarget } from "../state/web-page";
import { SIM_LOCKED } from "../state/craft-stage";
import { TOPIC_COURSES } from "../services/tutorial/topic-courses";
import { courseShown } from "../services/tutorial/course-release";
import { pageTick } from "../utils/ads";
import { tr } from "../i18n/lang";
import { track } from "./track";
import { flag } from "./release-flags";

/**
 * ツリーのページの中の段 (2026-10-24 オーナー「シミュレーターのタブを押したら最初のベース選択のページへ (オーバーレイでなくページ全体)、MOD も別ページ」)。
 * tree = ツリー、base = 最初のベース選び、mods = 完成の MOD。どれも treePage = true で、SimTreePage が見て出し分ける
 */
export type TreeStep = "tree" | "base" | "mods";
export const treeStep = ref<TreeStep>("tree");
const TREE_PAGES: Record<string, TreeStep> = { "page=sim-tree": "tree", "page=sim-base": "base", "page=sim-mods": "mods" };

/**
 * 離れる時の確かめ (2026-10-24 オーナー「ツリー作成中は離れる時に保存せずに終了するか聞く」)。fn(to) が true = 聞く (保存していない変更あり)。
 * to = 移る先のページ (page の値。"" = クラフト、"unload" = 閉じる・読み直す・外のリンク)。
 * 登録中にツリーのページから外へ移る時 (open○○Page・closeTreePage・戻る / 進む) は LeaveConfirm.vue で聞く。ツリーの中の段の行き来 (treeStep だけ替わる) は聞かない
 */
let leaveGuard: ((to: string) => boolean) | null = null;
export function setLeaveGuard(fn: ((to: string) => boolean) | null): void {
  leaveGuard = fn;
}
/** 聞いている間の「保存せずに終了」で移る先 (null = 聞いていない)。LeaveConfirm.vue が出す */
export const leaveAsk = ref<(() => void) | null>(null);
function mustAsk(to: string): boolean {
  // シミュのレシピのページから外へ出る時も聞く (StageRecipesPage も登録する。10-24 夜 シミュ部長 21 本目)
  return (treePage.value || recipesPage.value) && !(to in TREE_PAGES) && !!leaveGuard?.(to);
}
/** to へ移る前に、確かめが要れば聞いてから、要らなければすぐ移る */
function leaveThen(to: string, go: () => void): void {
  if (mustAsk(to)) leaveAsk.value = go;
  else go();
}
/** LeaveConfirm.vue のボタン (true = 保存せずに終了) */
export function answerLeave(ok: boolean): void {
  const go = leaveAsk.value;
  leaveAsk.value = null;
  if (ok) go?.();
}
/** 戻る / 進むで聞いて「保存せずに終了」になった時の 1 回は聞かずに通す。popBack = 聞くために元の位置へ戻した 1 回は何もしない */
let popThrough = false, popBack = false;
/** 履歴の何番目か (history.state の edIdx。戻る / 進むでどちらへ何歩動いたかを知り、聞く間は元の位置へ戻すため) */
function histOf(): number {
  const n = (history.state as { edIdx?: unknown } | null)?.edIdx;
  return typeof n === "number" ? n : 0;
}
let histAt = histOf();
function stateAt(i: number): Record<string, unknown> {
  const st = history.state as unknown;
  return { ...(st && typeof st === "object" ? st : {}), edIdx: i };
}

/** ベース選び・計算機・要望のページを閉じる (別のページへ移る時) */
function leaveSubPages(): void {
  feedbackPage.value = false;
  recipesPage.value = false;
  treePage.value = false;
  dailyPage.value = null;
  routesOpen.value = false;
  routesTarget.value = null;
  basePage.value = false;
}

/** 使い方・コツを開く (ヘッダーのボタン)。コースの途中なら抜ける */
export function openGuide(): void {
  leaveThen("page=guide", () => {
    leaveSubPages();
    s.hold(null);
    endLesson();
    s.mode.value = "tutorial";
  });
}

/** 要望・バグを送るのページを開く (ヘッダーのボタン・返事の窓から) */
export function openFeedback(): void {
  leaveThen("page=feedback", () => {
    s.hold(null);
    recipesPage.value = false;
    treePage.value = false;
    dailyPage.value = null;
    feedbackPage.value = true;
  });
}

/** レシピのページを開く (シミュレーターの右上・ベースを選ぶページから) */
export function openRecipesPage(): void {
  if (SIM_LOCKED) return;
  leaveThen("page=recipes", () => {
    s.hold(null);
    feedbackPage.value = false;
    treePage.value = false;
    dailyPage.value = null;
    recipesPage.value = true;
  });
}

/** クラフトの道 (ツリー) のページを開く (開発版だけ)。step = ツリーの中のどの段か (段だけ替えるのも、これ。履歴に積む) */
export function openTreePage(step: TreeStep = "tree"): void {
  if (!TREE_ON) return;
  s.hold(null);
  feedbackPage.value = false;
  recipesPage.value = false;
  dailyPage.value = null;
  treeStep.value = step;
  treePage.value = true;
}
/** ツリーのページを閉じてクラフトへ (上の切り替えタブの「エミュレーター」)。then = 閉じた後 (やめたら呼ばない) */
export function closeTreePage(then?: () => void): void {
  leaveThen("", () => {
    treePage.value = false;
    then?.();
  });
}

/** デイリークラフトチャレンジのページを開く (ヘッダーの「デイリー」・ページの中の移動。開発版だけ)。既定は一覧 */
export function openDailyPage(to: DailyView = { view: "list" }): void {
  if (!DAILY_ON) return;
  leaveThen(dailyQuery(to), () => {
    s.hold(null);
    feedbackPage.value = false;
    recipesPage.value = false;
    treePage.value = false;
    dailyPage.value = { ...to };
  });
}
/** デイリーのページを閉じてクラフトへ戻る (クラフト画面は隠していただけなので、前の状態のまま) */
export function closeDailyPage(): void {
  dailyPage.value = null;
}
/** デイリーのページ → URL の query (page と q) */
function dailyQuery(d: DailyView): string {
  const q = new URLSearchParams({ page: d.view === "start" ? "daily-start" : "daily" });
  if (d.view !== "list" && d.q) q.set("q", d.q);
  return q.toString();
}
/** URL の query → デイリーのページ (デイリーでなければ null) */
function dailyOf(p: string): DailyView | null {
  const q = new URLSearchParams(p);
  const k = q.get("page"), id = q.get("q") ?? undefined;
  if (k === "daily-start" && id) return { view: "start", q: id };
  if (k === "daily" || k === "daily-start") return id ? { view: "detail", q: id } : { view: "list" };
  return null;
}

/** ベース選びのページを開く (「ベースを変える」) */
export function openBasePage(): void {
  leaveThen("page=base", () => {
    s.hold(null);
    recipesPage.value = false;
    treePage.value = false;
    dailyPage.value = null;
    basePage.value = true;
  });
}

/**
 * ベースを選ぶ画面が自分で出ている (まだ選んでいない。人が開いたのではない)。今出ているページがベース選びの時だけ
 * (ツリーなど別のページを出している間も true だと、そこから「← 戻る」で出る時に履歴を積まず置き換え、ブラウザの戻るでツリーに戻れなかった。2026-10-23)
 */
const autoBase = computed(() => baseUnpicked.value && !basePage.value && page.value === "page=base");

/** 今のページ (URL の query の 1 組。空 = エミュレーターなど今までの画面) */
export const page = computed((): string => {
  if (feedbackPage.value) return "page=feedback";
  if (recipesPage.value) return "page=recipes";
  if (treePage.value) return `page=sim-${treeStep.value}`;
  if (dailyPage.value) return dailyQuery(dailyPage.value);
  if (routesOpen.value) return "page=routes";
  const id = topic.value?.id ?? course.value?.id;
  if (id) return `course=${id}`;
  if (s.mode.value === "tutorial") return "page=guide";
  if (s.replay.value) return "";
  if (basePage.value || baseUnpicked.value) return "page=base";
  return "";
});

/** タブの題 */
export const pageTitle = computed((): string => {
  const p = page.value;
  if (p === "page=feedback") return tr("要望・バグを送る — ExileDesk", "Send feedback — ExileDesk");
  if (p === "page=routes") return tr("スパムシミュレーター — ExileDesk", "Spam simulator — ExileDesk");
  if (p === "page=recipes") return tr("レシピ — シミュレーター — ExileDesk", "Recipes — Simulator — ExileDesk");
  if (p === "page=sim-tree") return tr("クラフトの道 (ツリー) — ExileDesk", "Craft route tree — ExileDesk");
  if (p === "page=sim-base") return tr("ベースを選ぶ — シミュレーター — ExileDesk", "Choose a base — Simulator — ExileDesk");
  if (p === "page=sim-mods") return tr("完成の MOD — シミュレーター — ExileDesk", "Target mods — Simulator — ExileDesk");
  const d = dailyOf(p);
  if (d) return d.view === "list" ? tr("デイリークラフトチャレンジ — ExileDesk", "Daily Craft Challenge — ExileDesk") : d.view === "detail" ? tr("お題 — デイリークラフトチャレンジ — ExileDesk", "Challenge — Daily Craft Challenge — ExileDesk") : tr("フラクチャー選び — デイリークラフトチャレンジ — ExileDesk", "Pick a fracture — Daily Craft Challenge — ExileDesk");
  const t = topic.value?.title ?? course.value?.video.title;
  if (t) return `${tr(t[0], t[1])} — ExileDesk`;
  if (p === "page=guide") return tr("使い方・コツ — ExileDesk", "Guide & Tips — ExileDesk");
  if (p === "page=base") return tr("ベースを選ぶ — ExileDesk", "Choose a base — ExileDesk");
  return tr("ExileDesk — PoE2 クラフトシミュレーター", "ExileDesk — PoE2 Craft Simulator");
});

const PAGE_KEYS = ["guide", "base", "feedback", "routes", "recipes", "sim-tree", "sim-base", "sim-mods", "daily", "daily-start"];
function urlFor(p: string): string {
  const u = new URL(location.href);
  u.searchParams.delete("page");
  u.searchParams.delete("course");
  u.searchParams.delete("q");
  // sample はツリーの見本を開く鍵。ツリーを出る時は消す (残すと「← 戻る」で /?sample=… になっていた。2026-10-23 シミュのモンキー 2 回目)
  if (!(p in TREE_PAGES)) u.searchParams.delete("sample");
  for (const [k, v] of new URLSearchParams(p)) u.searchParams.set(k, v);
  return u.pathname + u.search + u.hash;
}
function pageOfUrl(): string {
  const q = new URLSearchParams(location.search);
  const c = q.get("course");
  if (c) return `course=${c}`;
  const p = q.get("page");
  if (p === "daily" || p === "daily-start") return dailyQuery(dailyOf(q.toString())!);
  return p && PAGE_KEYS.includes(p) ? `page=${p}` : "";
}
/** URL を今の画面に合わせる (出せなかったページ・自分で出たベース選び。履歴は積まない) */
function syncUrl(): void {
  if (pageOfUrl() !== page.value) try { history.replaceState(history.state, "", urlFor(page.value)); } catch { /* 変えられなくても開く */ }
}

/** URL のページを画面に出す (開いた時・戻る / 進む) */
let applying = false;
function apply(p: string): void {
  applying = true;
  try {
    if (p === "page=feedback") { feedbackPage.value = true; return; }
    feedbackPage.value = false;
    if (p === "page=recipes" && !SIM_LOCKED) { recipesPage.value = true; return; }
    recipesPage.value = false;
    if (p in TREE_PAGES && TREE_ON) { treeStep.value = TREE_PAGES[p]; treePage.value = true; return; }
    treePage.value = false;
    const d = dailyOf(p);
    if (d && DAILY_ON) { dailyPage.value = d; return; }
    dailyPage.value = null;
    if (p.startsWith("course=")) {
      const c = TOPIC_COURSES.find((x) => x.id === p.slice(7) && courseShown(x));
      if (c) { if (topic.value?.id !== c.id) { leaveSubPages(); s.hold(null); endLesson(); startTopicAt(c, 0); } return; }
      p = "page=guide";
    }
    if (p === "page=guide") { if (page.value !== p) openGuide(); return; }
    // スパムシミュレーターは URL からも開く (s.ready の後なので今のアイテムで「狙う MOD を選ぶ」から。途中の結果は再読み込みで消える。モンキー 10-23 の 2)
    if (p === "page=routes" && routesOpen.value) return;
    if (s.mode.value === "tutorial" || inLesson.value) { s.hold(null); endLesson(); s.mode.value = "hand"; }
    if (p === "page=routes" && flag("monkey1023")) { leaveSubPages(); openRoutes(); return; }
    if (p === "page=base") { openBasePage(); return; }
    leaveSubPages();
    // 旧シミュレーターの工程 (page=sim-<工程>) は 10-22 に消した。古い URL はクラフトのまま開く
  } finally {
    applying = false;
    syncUrl();
  }
}

export function startPages(): void {
  // 読み込み (s.ready) を待ってから URL のページへ (コースはデータが要る)
  const first = pageOfUrl();
  const stop = watch(() => s.ready.value, (r) => {
    if (!r) return;
    stop();
    if (first) apply(first);
    else syncUrl();
  }, { immediate: true });
  // ページと「自分で出たベース選びか」を組で見る。auto = 移る直前のページが自分で出たベース選びだったか
  // (前は移った時にだけ覚え直していたので、?page=base を直に開いた時の「自分で出た → 人が開いた」(ページの文字は同じ) を取りこぼし、戻るで飛ばされていた。2026-10-23)
  watch(() => [page.value, autoBase.value] as const, ([p, nowAuto], [old, auto]) => {
    if (p === old) return;
    movedAt = performance.now();
    pageTick.value++; // ページを移った = 広告の枠の出し直し (utils/ads.ts、60 秒に 1 回まで)
    // ページを移った印 (D1 の screen。広告のページの数を見る)。クラフト画面へ戻ったのも 1 ページ (広告の枠を出し直すので。2026-10-19 PV の点検で抜けていた)
    if (p === "page=guide") track("page:guide");
    else if (p.startsWith("course=")) track("page:course", p.slice(7));
    else if (p === "page=base") track("page:base");
    else if (p === "page=feedback") track("page:feedback");
    else if (p === "page=recipes") track("page:recipes");
    else if (p === "page=sim-tree") track("page:tree");
    else if (p === "page=sim-base") track("page:sim-base");
    else if (p === "page=sim-mods") track("page:sim-mods");
    else if (dailyOf(p)) track("page:daily", dailyOf(p)!.view);
    else if (p === "page=routes") track("page:routes");
    else if (p.startsWith("page=sim-")) track("page:sim", p.slice(9));
    else if (p === "") track("page:craft");
    if (applying || pageOfUrl() === p) return;
    // 自分で出たベース選び (初めて・白に戻した後) と、そこから選んで出た時は積まない (戻るで選ぶ前に戻っても選び直しになるだけ)
    try {
      // 自分で出たベース選びへ移る時は、クラフトの画面が替わっただけの時 (白に戻した後など) だけ積まない。ツリーなどから出た時は積む (戻るでそのページへ)
      if (auto || (nowAuto && old === "")) history.replaceState(history.state, "", urlFor(p));
      else history.pushState(stateAt(++histAt), "", urlFor(p));
    } catch { /* 積めなくても画面はそのまま */ }
  });
  try { history.replaceState(stateAt(histAt), ""); } catch { /* 番号が無くても戻る / 進むはできる (聞いた時に URL を戻せないだけ) */ }
  window.addEventListener("popstate", () => {
    const to = pageOfUrl(), at = histOf();
    if (popBack) { popBack = false; return; } // 聞くために元の位置へ戻った分
    const step = histAt - at;
    if (popThrough || !mustAsk(to) || !step) { popThrough = false; histAt = at; apply(to); return; }
    // 保存していない変更がある: 履歴の元の位置 (ツリー) へ戻してから聞く (積み直さないので、やめた後の戻るもすぐ聞く)。「保存せずに終了」なら行こうとした所へ (その 1 回は聞かない)
    popBack = true;
    history.go(step);
    leaveAsk.value = () => { popThrough = true; history.go(-step); };
  });
  // 閉じる・読み直す・外のリンク (ブログなど) はブラウザの確かめ
  window.addEventListener("beforeunload", (e) => { if (mustAsk("unload")) e.preventDefault(); });
  // ページが替わった直後 (0.5 秒) のクリックは受けない (「← 戻る」のダブルクリックの 2 回目が、移った先の同じ位置のヘッダーの「ブログ」に当たって /blog/ へ飛んだ。モンキーテスト 10-23 の 3)
  // 比べるのは押された時刻 (e.timeStamp)。移った先の描画が重いと 2 回目のクリックが待たされ、配られる時には 300ms を過ぎていた (10-23 シミュ部長の確かめ)
  // 守っている間のクリックは守りを延ばす (8 連打だと 0.5 秒を過ぎた後ろのクリックがブログに当たった。10-23 ジン部長の確かめ)
  // 上の切り替えタブ (ModeTabs) は守らない。どのページでも同じ位置で、続けて押すとずっと捨てられて替わらなかった (10-23 オーナー「エミュとシミュを高速でタブ替えすると死ぬほど重い」)
  if (flag("monkey1023")) for (const ev of ["click", "pointerdown"]) window.addEventListener(ev, (e) => { if (e.timeStamp - movedAt < MOVE_GUARD_MS && !(e.target as Element | null)?.closest?.("[data-mode-tab]")) { movedAt = e.timeStamp; e.preventDefault(); e.stopPropagation(); } }, { capture: true });
}
/** ページが替わった時刻と、その後クリックを受けない長さ */
let movedAt = -Infinity;
const MOVE_GUARD_MS = 500;
