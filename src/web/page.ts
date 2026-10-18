/**
 * Web 版のページ (2026-10-18 オーナー「チュートリアルはタブに大々的に出さず、使い方にしまう。ページ遷移させて」)。
 * 広告はページで数えるので ([[ads-page-model]])、画面ごとに URL と題を変える:
 *   - エミュレーターなど: / (今までどおり)
 *   - 使い方・コツ (動画へのリンク + チュートリアルのコース一覧): ?page=guide
 *   - コースの途中: ?course=<id>
 * 移るたびに履歴に積む (ブラウザの戻るで前のページへ)。URL から開いた時もそのページで始める
 */
import { computed, watch } from "vue";
import { craftStage as s } from "../state/craft-stage";
import { topic } from "../state/craft-topic";
import { course } from "../state/craft-course";
import { endLesson, startTopicAt } from "../state/craft-lesson";
import { TOPIC_COURSES } from "../services/craft-stage/topic-courses";
import { courseShown } from "../services/craft-stage/course-release";
import { tr } from "../i18n/lang";
import { track } from "./track";

/** 使い方・コツを開く (ヘッダーのボタン)。コースの途中なら抜ける */
export function openGuide(): void {
  s.hold(null);
  endLesson();
  s.mode.value = "tutorial";
}

/** 今のページ (URL の query の 1 組。空 = エミュレーターなど今までの画面) */
const page = computed((): string => {
  const id = topic.value?.id ?? course.value?.id;
  if (id) return `course=${id}`;
  return s.mode.value === "tutorial" ? "page=guide" : "";
});

/** タブの題 */
export const pageTitle = computed((): string => {
  const t = topic.value?.title ?? course.value?.video.title;
  if (t) return `${tr(t[0], t[1])} — ExileDesk`;
  if (page.value === "page=guide") return tr("使い方・コツ — ExileDesk", "Guide & Tips — ExileDesk");
  return tr("ExileDesk — PoE2 クラフトシミュレーター", "ExileDesk — PoE2 Craft Simulator");
});

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
  return q.get("page") === "guide" ? "page=guide" : "";
}

/** URL のページを画面に出す (開いた時・戻る / 進む) */
let applying = false;
function apply(p: string): void {
  applying = true;
  try {
    if (p.startsWith("course=")) {
      const c = TOPIC_COURSES.find((x) => x.id === p.slice(7) && courseShown(x));
      if (c) { if (topic.value?.id !== c.id) { s.hold(null); endLesson(); startTopicAt(c, 0); } return; }
      p = "page=guide";
    }
    if (p === "page=guide") { if (page.value !== p) openGuide(); return; }
    if (page.value) { s.hold(null); endLesson(); s.mode.value = "hand"; }
  } finally {
    applying = false;
    // 出せなかった物 (無いコースなど) は URL を今の画面に合わせる
    if (pageOfUrl() !== page.value) try { history.replaceState(history.state, "", urlFor(page.value)); } catch { /* 変えられなくても開く */ }
  }
}

export function startPages(): void {
  // 読み込み (s.ready) を待ってから URL のページへ (コースはデータが要る)
  const first = pageOfUrl();
  if (first) {
    const stop = watch(() => s.ready.value, (r) => { if (!r) return; stop(); apply(first); }, { immediate: true });
  }
  watch(page, (p, old) => {
    if (p === old || applying || pageOfUrl() === p) return;
    try { history.pushState(history.state, "", urlFor(p)); } catch { /* 積めなくても画面はそのまま */ }
    // ページを移った印 (D1 の screen。広告のページの数を見る)
    if (p === "page=guide") track("page:guide");
    else if (p.startsWith("course=")) track("page:course", p.slice(7));
  });
  window.addEventListener("popstate", () => apply(pageOfUrl()));
}
