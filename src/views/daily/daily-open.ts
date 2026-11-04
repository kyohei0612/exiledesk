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
