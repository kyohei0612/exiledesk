/**
 * Web 版のページ (2026-10-18 オーナー「チュートリアルはタブに大々的に出さず、使い方にしまう。ページ遷移させて」)。
 * 広告はページで数えるので ([[ads-page-model]])、画面ごとに URL と題を変える:
 *   - エミュレーターなど: / (今までどおり)
 *   - 使い方・コツ (動画へのリンク + チュートリアルのコース一覧): ?page=guide
 *   - コースの途中: ?course=<id>
 *   - ベース選び: ?page=base (「ベースを変える」・まだ選んでいない時。2026-10-18 2 回目)
 *   - カオススパム計算機: ?page=spam (アイテムの下の「カオススパム計算機へ」・X のシェアから)
 *   - 要望・バグを送る: ?page=feedback
 * 移るたびに履歴に積む (ブラウザの戻るで前のページへ)。URL から開いた時もそのページで始める (計算機は今のアイテムが要るので URL からは開かない)。
 * ページを移るたびに広告の枠を出し直す (utils/ads.ts の pageTick)。MOD 一覧は重ねる窓のまま、ページにしない (2026-10-12)
 */
import { computed, watch } from "vue";
import { craftStage as s } from "../state/craft-stage";
import { topic } from "../state/craft-topic";
import { course } from "../state/craft-course";
import { endLesson, inLesson, startTopicAt } from "../state/craft-lesson";
import { closeChaosSpam, spamKey, spamming } from "../state/chaos-spam";
import { basePage, baseUnpicked, feedbackPage } from "../state/web-page";
import { TOPIC_COURSES } from "../services/craft-stage/topic-courses";
import { courseShown } from "../services/craft-stage/course-release";
import { pageTick } from "../utils/ads";
import { tr } from "../i18n/lang";
import { track } from "./track";

/** ベース選び・計算機・要望のページを閉じる (別のページへ移る時) */
function leaveSubPages(): void {
  feedbackPage.value = false;
  basePage.value = false;
  closeChaosSpam();
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
  feedbackPage.value = true;
}

/** ベース選びのページを開く (「ベースを変える」) */
export function openBasePage(): void {
  s.hold(null);
  basePage.value = true;
}

/** ベースを選ぶ画面が自分で出ている (まだ選んでいない。人が開いたのではない) */
const autoBase = computed(() => baseUnpicked.value && !basePage.value);

/** 今のページ (URL の query の 1 組。空 = エミュレーターなど今までの画面) */
const page = computed((): string => {
  if (feedbackPage.value) return "page=feedback";
  const id = topic.value?.id ?? course.value?.id;
  if (id) return `course=${id}`;
  if (s.mode.value === "tutorial") return "page=guide";
  if (s.replay.value) return "";
  if (basePage.value || baseUnpicked.value) return "page=base";
  if (!inLesson.value && (spamKey.value || spamming.value)) return "page=spam";
  return "";
});

/** タブの題 */
export const pageTitle = computed((): string => {
  const p = page.value;
  if (p === "page=feedback") return tr("要望・バグを送る — ExileDesk", "Send feedback — ExileDesk");
  const t = topic.value?.title ?? course.value?.video.title;
  if (t) return `${tr(t[0], t[1])} — ExileDesk`;
  if (p === "page=guide") return tr("使い方・コツ — ExileDesk", "Guide & Tips — ExileDesk");
  if (p === "page=base") return tr("ベースを選ぶ — ExileDesk", "Choose a base — ExileDesk");
  if (p === "page=spam") return tr("カオススパム計算機 — ExileDesk", "Chaos spam calculator — ExileDesk");
  return tr("ExileDesk — PoE2 クラフトシミュレーター", "ExileDesk — PoE2 Craft Simulator");
});

const PAGE_KEYS = ["guide", "base", "spam", "feedback"];
function urlFor(p: string): string {
  const u = new URL(location.href);
  u.searchParams.delete("page");
  u.searchParams.delete("course");
  if (p) { const [k, v] = p.split("="); u.searchParams.set(k, v); }
  return u.pathname + u.search + u.hash;
}
function pageOfUrl(): string {
  const q = new URLSearchParams(location.search);
  const c = q.get("course");
  if (c) return `course=${c}`;
  const p = q.get("page");
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
    if (p.startsWith("course=")) {
      const c = TOPIC_COURSES.find((x) => x.id === p.slice(7) && courseShown(x));
      if (c) { if (topic.value?.id !== c.id) { leaveSubPages(); s.hold(null); endLesson(); startTopicAt(c, 0); } return; }
      p = "page=guide";
    }
    if (p === "page=guide") { if (page.value !== p) openGuide(); return; }
    // 計算機は URL からは開けない (今のアイテムが要る)。クラフトに戻す
    if (p === "page=spam" && page.value === p) return;
    if (s.mode.value === "tutorial" || inLesson.value) { s.hold(null); endLesson(); s.mode.value = "hand"; }
    if (p === "page=base") { closeChaosSpam(); openBasePage(); return; }
    leaveSubPages();
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
    // ページを移った印 (D1 の screen。広告のページの数を見る)。計算機は track.ts が spamKey で数える
    if (p === "page=guide") track("page:guide");
    else if (p.startsWith("course=")) track("page:course", p.slice(7));
    else if (p === "page=base") track("page:base");
    else if (p === "page=feedback") track("page:feedback");
    if (applying || pageOfUrl() === p) return;
    // 自分で出たベース選び (初めて・白に戻した後) と、そこから選んで出た時は積まない (戻るで選ぶ前に戻っても選び直しになるだけ)
    try {
      if (auto || autoBase.value) history.replaceState(history.state, "", urlFor(p));
      else history.pushState(history.state, "", urlFor(p));
    } catch { /* 積めなくても画面はそのまま */ }
  });
  window.addEventListener("popstate", () => apply(pageOfUrl()));
}
