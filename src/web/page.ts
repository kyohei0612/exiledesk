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
 *   - クラフトの道 (ツリー): ?page=sim-tree (2026-10-22、開発版だけ。工程の sim-○○ より先に見分ける)
 *   - デイリークラフトチャレンジ: ?page=daily (一覧)・?page=daily&q=<id> (お題)・?page=daily-start&q=<id> (フラクチャー選び) (2026-10-22、開発版だけ。ヘッダーの「デイリー」から)
 *   - シミュレーターの工程: ?page=sim-mods / sim-start / sim-order / sim-play / sim-result (2026-10-19、1 工程 1 ページ)
 * 移るたびに履歴に積む (ブラウザの戻るで前のページへ)。URL から開いた時もそのページで始める (計算機は今のアイテムが要るので URL からは開かない)。
 * ページを移るたびに広告の枠を出し直す (utils/ads.ts の pageTick)。MOD 一覧は重ねる窓のまま、ページにしない (2026-10-12)
 */
import { computed, watch } from "vue";
import { craftStage as s } from "../state/craft-stage";
import { topic } from "../state/tutorial/craft-topic";
import { course } from "../state/tutorial/craft-course";
import { endLesson, inLesson, startTopicAt } from "../state/tutorial/craft-lesson";
import { basePage, baseUnpicked, dailyPage, DAILY_ON, type DailyView, feedbackPage, recipesPage, routesOpen, TREE_ON, treePage, routesTarget, SIM_STEPS, simStep, type SimStep } from "../state/web-page";
import { SIM_LOCKED } from "../state/craft-stage";
import { TOPIC_COURSES } from "../services/tutorial/topic-courses";
import { courseShown } from "../services/tutorial/course-release";
import { pageTick } from "../utils/ads";
import { tr } from "../i18n/lang";
import { track } from "./track";

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
  leaveSubPages();
  s.hold(null);
  endLesson();
  s.mode.value = "tutorial";
}

/** 要望・バグを送るのページを開く (ヘッダーのボタン・返事の窓から) */
export function openFeedback(): void {
  s.hold(null);
  recipesPage.value = false;
  treePage.value = false;
  dailyPage.value = null;
  feedbackPage.value = true;
}

/** レシピのページを開く (シミュレーターの右上・ベースを選ぶページから) */
export function openRecipesPage(): void {
  if (SIM_LOCKED) return;
  s.hold(null);
  feedbackPage.value = false;
  treePage.value = false;
  dailyPage.value = null;
  recipesPage.value = true;
}

/** クラフトの道 (ツリー) のページを開く (開発版だけ) */
export function openTreePage(): void {
  if (!TREE_ON) return;
  s.hold(null);
  feedbackPage.value = false;
  recipesPage.value = false;
  dailyPage.value = null;
  treePage.value = true;
}

/** デイリークラフトチャレンジのページを開く (ヘッダーの「デイリー」・ページの中の移動。開発版だけ)。既定は一覧 */
export function openDailyPage(to: DailyView = { view: "list" }): void {
  if (!DAILY_ON) return;
  s.hold(null);
  feedbackPage.value = false;
  recipesPage.value = false;
  treePage.value = false;
  dailyPage.value = { ...to };
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
  s.hold(null);
  recipesPage.value = false;
  treePage.value = false;
  dailyPage.value = null;
  basePage.value = true;
}

/** ベースを選ぶ画面が自分で出ている (まだ選んでいない。人が開いたのではない) */
const autoBase = computed(() => baseUnpicked.value && !basePage.value);

/** 今のページ (URL の query の 1 組。空 = エミュレーターなど今までの画面) */
export const page = computed((): string => {
  if (feedbackPage.value) return "page=feedback";
  if (recipesPage.value) return "page=recipes";
  if (treePage.value) return "page=sim-tree";
  if (dailyPage.value) return dailyQuery(dailyPage.value);
  if (routesOpen.value) return "page=routes";
  const id = topic.value?.id ?? course.value?.id;
  if (id) return `course=${id}`;
  if (s.mode.value === "tutorial") return "page=guide";
  if (s.replay.value) return "";
  if (basePage.value || baseUnpicked.value) return "page=base";
  if (s.mode.value === "sim" && s.simPicked.value) return `page=sim-${simStep.value}`;
  return "";
});
/** シミュレーターの工程の題 */
const SIM_TITLE: Record<SimStep, [string, string]> = {
  mods: ["狙う MOD", "Target mods"], start: ["ベースの値段", "Base prices"], order: ["付ける順番", "Order"], play: ["打ち方", "Crafting steps"], result: ["回す・結果", "Run & results"],
};

/** タブの題 */
export const pageTitle = computed((): string => {
  const p = page.value;
  if (p === "page=feedback") return tr("要望・バグを送る — ExileDesk", "Send feedback — ExileDesk");
  if (p === "page=routes") return tr("スパムシミュレーター — ExileDesk", "Spam simulator — ExileDesk");
  if (p === "page=recipes") return tr("レシピ — シミュレーター — ExileDesk", "Recipes — Simulator — ExileDesk");
  if (p === "page=sim-tree") return tr("クラフトの道 (ツリー) — ExileDesk", "Craft route tree — ExileDesk");
  const d = dailyOf(p);
  if (d) return d.view === "list" ? tr("デイリークラフトチャレンジ — ExileDesk", "Daily Craft Challenge — ExileDesk") : d.view === "detail" ? tr("お題 — デイリークラフトチャレンジ — ExileDesk", "Challenge — Daily Craft Challenge — ExileDesk") : tr("フラクチャー選び — デイリークラフトチャレンジ — ExileDesk", "Pick a fracture — Daily Craft Challenge — ExileDesk");
  const t = topic.value?.title ?? course.value?.video.title;
  if (t) return `${tr(t[0], t[1])} — ExileDesk`;
  if (p === "page=guide") return tr("使い方・コツ — ExileDesk", "Guide & Tips — ExileDesk");
  if (p === "page=base") return tr("ベースを選ぶ — ExileDesk", "Choose a base — ExileDesk");
  if (p.startsWith("page=sim-")) { const t = SIM_TITLE[p.slice(9) as SimStep]; if (t) return tr(`${t[0]} — シミュレーター — ExileDesk`, `${t[1]} — Simulator — ExileDesk`); }
  return tr("ExileDesk — PoE2 クラフトシミュレーター", "ExileDesk — PoE2 Craft Simulator");
});

const PAGE_KEYS = ["guide", "base", "feedback", "routes", "recipes", "sim-tree", "daily", "daily-start", ...SIM_STEPS.map((x) => `sim-${x}`)];
function urlFor(p: string): string {
  const u = new URL(location.href);
  u.searchParams.delete("page");
  u.searchParams.delete("course");
  u.searchParams.delete("q");
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
    if (p === "page=sim-tree" && TREE_ON) { treePage.value = true; return; }
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
    // 計算機・どのスパムが早いかは URL からは開けない (今のアイテム・狙いが要る)。クラフトに戻す
    if (p === "page=routes" && page.value === p) return;
    if (s.mode.value === "tutorial" || inLesson.value) { s.hold(null); endLesson(); s.mode.value = "hand"; }
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
  let wasAuto = autoBase.value;
  watch(page, (p, old) => {
    const auto = wasAuto;
    wasAuto = autoBase.value;
    if (p === old) return;
    pageTick.value++; // ページを移った = 広告の枠の出し直し (utils/ads.ts、60 秒に 1 回まで)
    // ページを移った印 (D1 の screen。広告のページの数を見る)。クラフト画面へ戻ったのも 1 ページ (広告の枠を出し直すので。2026-10-19 PV の点検で抜けていた)
    if (p === "page=guide") track("page:guide");
    else if (p.startsWith("course=")) track("page:course", p.slice(7));
    else if (p === "page=base") track("page:base");
    else if (p === "page=feedback") track("page:feedback");
    else if (p === "page=recipes") track("page:recipes");
    else if (p === "page=sim-tree") track("page:tree");
    else if (dailyOf(p)) track("page:daily", dailyOf(p)!.view);
    else if (p === "page=routes") track("page:routes");
    else if (p.startsWith("page=sim-")) track("page:sim", p.slice(9));
    else if (p === "") track("page:craft");
    if (applying || pageOfUrl() === p) return;
    // 自分で出たベース選び (初めて・白に戻した後) と、そこから選んで出た時は積まない (戻るで選ぶ前に戻っても選び直しになるだけ)
    try {
      if (auto || autoBase.value) history.replaceState(history.state, "", urlFor(p));
      else history.pushState(history.state, "", urlFor(p));
    } catch { /* 積めなくても画面はそのまま */ }
  });
  window.addEventListener("popstate", () => apply(pageOfUrl()));
}
