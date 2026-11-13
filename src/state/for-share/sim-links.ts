/**
 * sim-links.ts — クラフト台 (エミュの画面) からシミュ (クラフトの道 = ツリー) へ行く入口 (共通の差し込み口、2026-10-23 オーナー「コードが混ざらないように」)。
 * エミュの画面はここだけを読み、シミュの中 (views/simulator) は読まない。シミュの物はここで後から読む (最初の読み込みに入れない)
 */
import { ref } from "vue";
import { closeTreePage, openTreePage } from "../../web/page";
import { flag } from "../../web/release-flags";
import type { StageItem } from "../../services/craft-stage/types";

/** 今のベースとアイテムレベルで白紙のツリーを開く (前の木は 1 つ戻すで戻せる) */
export async function openTreeWith(base: string, itemLevel: number): Promise<void> {
  if (!flag("sim")) return; // 本番はシミュレーターを出さない (スイッチ sim)
  const { useTree } = await import("../../views/simulator/tree/use-tree");
  useTree().startTreeWith(base, itemLevel);
  openTreePage();
}

/** エミュで持っているアイテム (ベース・アイテムレベル・MOD 全部) をシミュへ渡し、② 完成の MOD のページを開く (スイッチ emuToSim、2026-10-26 夜オーナー) */
export async function openSimWithItem(item: StageItem): Promise<void> {
  if (!flag("sim")) return;
  const { requestEmuItem } = await import("../../views/simulator/tree/tree-paste");
  requestEmuItem(item);
}

/**
 * シミュの完成形をエミュで試す (S-147・M-06d、スイッチ simToEmu、オーナー 11-13「②案１」): エミュを同じベース・同じアイテムレベルの白で開き、
 * 完成の MOD をその段以上で「次の手で狙う」へ入れる (6 つまで = AIM_MAX)。シミュの画面はここだけを呼び、エミュの中 (views/craft-stage) は読まない
 */
export async function openEmuWithGoals(base: string, itemLevel: number, goals: ReadonlyArray<{ modId: string; tier: number }>): Promise<void> {
  if (!flag("simToEmu")) return;
  const [{ craftStage: s, AIM_MAX }, { tierIndexOf, aimLabel }, { useStageBase }] = await Promise.all([
    import("../craft-stage"),
    import("../../services/craft-stage/engine"),
    import("../../views/craft-stage/use-stage-base"),
  ]);
  closeTreePage(() => {
    s.play.value = "emu";
    s.mode.value = "hand";
    s.itemLevel.value = itemLevel;
    useStageBase().pickSimBase(base); // ベースを選んだ印・白に戻す (s.reset)
    const d = s.data.value;
    s.aims.value = d ? goals.slice(0, AIM_MAX).flatMap((g) => {
      const minTierIndex = tierIndexOf(d, g.modId, g.tier);
      if (minTierIndex < 0) return [];
      const a = { modId: g.modId, minTierIndex, label: "" };
      return [{ ...a, label: aimLabel(d, a) }];
    }) : [];
  });
}

/** レシピが読めない時の文 (レシピの URL を貼る欄と URL で開いた時で同じ言葉、S-103c) */
export const RECIPE_UNREADABLE: [string, string] = ["このレシピは読めませんでした", "Couldn't read this recipe"];
/**
 * URL の #recipe= が読めなかった (1 字欠けた・壊れた)。黙ってベース選びに着かず、全体の帯で一言出す (WebApp.vue、× で閉じる。S-103c、
 * 11-02 オーナー「修正、まぁこれはレシピURLだからよっぽどやと思うがな短いし」)
 */
export const recipeOpenFailed = ref(false);
/** 共有のレシピの URL (#recipe=、views/simulator/recipe-share.ts) から来た時に、そのレシピを開く */
export function openSharedRecipe(): void {
  if (!flag("sim")) return;
  void import("../../views/simulator/recipe-share").then((m) => m.openSharedRecipe());
}
