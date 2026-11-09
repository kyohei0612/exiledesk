/**
 * daily-open.ts — 締めた日の順位の人のレシピをシミュで開く (D-50b)。共有のレシピの URL (#recipe=) と同じ道を通すので、
 * 開くのは保存したレシピの写し (触っても元は変わらない)。PC はシミュの木、スマホは見るだけの画面に着く (recipe-share の openSharedRecipe)
 */
import { ref } from "vue";
import { packJson } from "../../services/craft-stage/share";
import { openSharedRecipe } from "../../state/for-share/sim-links";
import { closeDailyPage } from "../../web/page";
import { rankRecipe } from "./daily-api";

/** 開けたら true。今日の分・木が無い・つながらない時は false (画面が一言出す) */
export async function openRankRecipe(id: string, name: string, day: string): Promise<boolean> {
  const recipe = await rankRecipe(id, name);
  if (!recipe) return false;
  let t: unknown;
  try { t = JSON.parse(recipe); } catch { return false; }
  const code = await packJson({ v: 2, n: `${name} (${day})`, t });
  closeDailyPage();
  history.replaceState(null, "", `${location.pathname}${location.search}#recipe=${code}`);
  openSharedRecipe();
  return true;
}

/**
 * 挑戦のページを直に開いた時 (別のタブ・ブックマーク・前の挑戦の URL) に、下へ一覧を敷く = ブラウザの戻るで 挑戦 → 一覧 (D-37k)。
 * 敷くのはこの読み込みの最初のページが挑戦の時の 1 回だけ (読み直し・戻る / 進むで来た時は前の履歴があるので敷かない)。
 * 履歴の番号 (edIdx) は page.ts が最初のページに付けた 0 のまま 2 つとも置く (page.ts の番号とずれない。0 どうしの戻るはそのまま移る)
 */
let seated = false;
export function seatListUnder(): void {
  if (seated) return;
  seated = true;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const st = history.state as { edIdx?: unknown } | null;
    if (nav?.type !== "navigate" || (st?.edIdx ?? 0) !== 0 || new URLSearchParams(location.search).get("page") !== "daily-start") return;
    const here = location.href;
    const list = new URL(here);
    list.searchParams.delete("q");
    list.searchParams.set("page", "daily");
    list.hash = "";
    history.replaceState(st, "", list);
    history.pushState(st, "", here);
  } catch { /* 積めなくても挑戦は開く */ }
}

/** 順位の表で使う: busy = 開いている途中の名前、failed = 開けなかった名前 (行の下に一言) */
export function useRankRecipe() {
  const busy = ref<string | null>(null);
  const failed = ref<string | null>(null);
  async function open(id: string, name: string, day: string): Promise<void> {
    if (busy.value) return;
    busy.value = name; failed.value = null;
    const ok = await openRankRecipe(id, name, day);
    busy.value = null;
    if (!ok) failed.value = name;
  }
  return { busy, failed, open };
}
