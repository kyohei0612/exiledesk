/**
 * changelog.ts — 更新内容 / 更新履歴 (2026-10-10 オーナー「更新したらポップアップで更新内容出して 1 回だけ、バージョン押したら更新履歴見れるように」)
 *
 * 元は src/data/changelog.json (scripts/build-changelog.mjs がリリースの時にタグから作る)。アプリと Web で同じ物。
 * 前に見た版を localStorage に覚え、版が変わっていたら起動した時に 1 回だけ「その版から今の版まで」の更新内容を出す。
 * 初めて使う人 (ExileDesk の保存が何も無い) には出さない (Web は「はじめに」の窓が出る)
 */
import { lang } from "../i18n/lang";
import { ref } from "vue";
import pkg from "../../package.json";
import log from "../data/changelog.json";

export interface ChangelogEntry { v: string; date: string; items: Array<{ kind: string; area: string; text: string }> }
export const APP_VERSION: string = pkg.version;

const cmp = (a: string, b: string): number => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
/** 今の版までの更新履歴 (新しい順。まだ出していない版の分は出さない) */
export const CHANGELOG = (log as ChangelogEntry[]).filter((e) => cmp(e.v, APP_VERSION) <= 0);

const SEEN_KEY = "exiledesk.changelog.seen";
/** 出している窓: new = 今回の更新内容 / all = 更新履歴 */
export const changelogOpen = ref<"new" | "all" | null>(null);
/** 今回の更新内容に出す版 (前に見た版より新しい物) */
export const changelogNew = ref<ChangelogEntry[]>([]);

/** 起動した時に呼ぶ。skip = 他の窓 (はじめに) を出している時は出さずに見た事にする */
export function initChangelog(skip = false): void {
  let seen: string | null = null;
  let used = false;
  try {
    seen = localStorage.getItem(SEEN_KEY);
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) ?? ""; if (k.startsWith("exiledesk") && k !== SEEN_KEY) { used = true; break; } }
    localStorage.setItem(SEEN_KEY, APP_VERSION);
  } catch { return; }
  // 英語の画面には更新内容 (日本語だけ) を勝手に出さない (2026-10-10 英語版。版を押せば見られる)
  if (skip || seen === APP_VERSION || lang.value === "en") return;
  // 前に見た版が無い = この仕組みより前から使っている人 (保存がある) には今の版の分だけ。初めての人には出さない
  if (!seen && !used) return;
  const list = seen ? CHANGELOG.filter((e) => cmp(e.v, seen!) > 0).slice(0, 5) : CHANGELOG.filter((e) => e.v === APP_VERSION);
  if (!list.length) return;
  changelogNew.value = list;
  changelogOpen.value = "new";
}
