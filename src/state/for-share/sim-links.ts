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
 * 「エミュで試す」で白から開いた訳 (M-06d。エミュの画面が上に一言出す、× かベースを変えると消える)。null = 出さない
 */
export const simEmuNote = ref<string | null>(null);
/**
 * シミュの完成形をエミュで試す (S-211・M-06d、スイッチ simToEmu、オーナー 11-13「完成形の見本通りにエミュで表示させたらおk」):
 * 完成形のカードの品 (use-tree の goalItem、段・値・フラクチャー・冒涜の印ごと) を工程なしの品としてエミュに載せる (狙いには入れない)。
 * 完成形が枠 (プレ / サフィの上限) を超えている・エンジンがそのまま付けられない時は、同じベース・アイテムレベルの白で開き、上に訳を出す。
 * goals は数だけ見る (0 なら何もしない)。シミュの画面はここだけを呼び、エミュの中 (views/craft-stage) は読まない
 */
export async function openEmuWithGoals(base: string, itemLevel: number, goals: ReadonlyArray<{ modId: string; tier: number }>): Promise<void> {
  if (!flag("simToEmu") || !goals.length) return;
  const [{ craftStage: s }, { forcesOf }, { useStageBase }, { useTree }, { tr }] = await Promise.all([
    import("../craft-stage"),
    import("../../services/emulator/emu-engine"),
    import("../../views/craft-stage/use-stage-base"),
    import("../../views/simulator/tree/use-tree"),
    import("../../i18n/lang"),
  ]);
  // エミュをまだ開いていない時も載せた後に init (写しの戻し・白) で上書きされないよう、先にデータを読む (済みなら何もしない)
  await s.init();
  const g = useTree().goalItem.value;
  closeTreePage(() => {
    s.play.value = "emu";
    s.mode.value = "hand";
    s.aims.value = [];
    const sb = useStageBase();
    sb.pickSimBase(base); // ベースを選んだ印・白に戻す (s.reset)
    s.itemLevel.value = itemLevel;
    if (!g) { s.reset(); simEmuNote.value = null; return; }
    const over = g.left.length > 0;
    const why = over ? null : s.startWith(base, itemLevel, forcesOf(g.item));
    if (over || why) {
      s.reset();
      simEmuNote.value = over
        ? tr("既定の MOD 数を超えているため、エミュレーターで初めから作り直してください", "This build has more mods than the item can hold, so craft it from scratch in the emulator")
        : tr(`この完成形はそのままでは載せられないため (${why})、エミュレーターで初めから作り直してください`, `This build can't be loaded as is (${why}), so craft it from scratch in the emulator`);
    } else simEmuNote.value = null;
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
