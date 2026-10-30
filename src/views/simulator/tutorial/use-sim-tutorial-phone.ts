/**
 * use-sim-tutorial-phone.ts — スマホの形 (1280 未満、U-53・isPhoneWidth) のシミュのチュートリアル (tutorial.md T-26)。
 * 木・打つ手・結果の箱は PC と同じ (手順は sim-tutorial.json の 14 段のまま)。違うのは聞かれる順と押す所だけ:
 * スマホは use-phone-quiz が始まりから順に「この箱で何を打つ?」「結果ごとにどうする?」を聞くので、手順の並びでなく
 * 「今聞かれている箱 ([data-phone-ask]・[data-phone-out] の data-box-id) = 役」から、その役の手の手順を案内する (T-26 の終わりの段落)。
 * PC の手順 7 (完成) はスマホでは自動の完成 (S-91) を指して「次へ」、手順 8 (帯の「次へ」) は全体図を開いて閉じる (P10・P11)。
 * スマホの結果の画面は、自動の ↩ が付いた外れ・消えた の箱も「この状態で打つカレンシーを選ぶ」まで次へ進めない (S-93、10-27 オーナー)。
 * その箱が聞かれたら、戻り先の箱の手 (手順) と同じ手を選ばせる (同じ手は戻りになる = 木は PC と同じ)。この「戻りの選び」は 14 段に数えない
 */
import { SPELL } from "./tut-route";
import type { TutStepDef } from "./tut-data";
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { handOpen, inView, shown } from "./tut-dom";
import { MISSING, WRONG, goalPageShown, inChecks, inHand, runScene, startScene, testScene, type Roles, type TutCtx, type TutNow } from "./use-sim-tutorial";

const say = (ja: string, en: string): [string, string] => [ja, en];
/** 今聞かれている箱 (手の質問はその箱、結果の質問は今出している結果の行の箱) */
export function askedBox(): string | null {
  const ask = shown("[data-phone-ask]");
  if (!ask) return null;
  if (ask.dataset.ask === "outs") return shown("[data-phone-out]")?.dataset.boxId ?? null;
  return ask.dataset.boxId ?? null;
}
/**
 * スマホで今案内する手順: 完成形・始め方 → 聞かれている箱の手 (まだの物) → ほかのまだの手 (並びの順) → 完成 (P10) → 全体図 (P11) → テスト → 100 人。
 * done(st) = その手順が済んだか (use-sim-tutorial の stepDone)
 */
/** 聞かれている箱が自動の ↩ の付いた戻りの箱で、まだ手を選んでいない (S-93) なら、その戻り先の箱 */
function returnTo(d: TreeDoc): { box: string; to: string } | null {
  const asked = askedBox(), b = asked ? d.boxes[asked] : null, main = shown("[data-phone-main]");
  return b?.back && !b.hand && main?.dataset.main === "hand" ? { box: b.id, to: b.back } : null;
}
export function phoneIndex(steps: readonly TutStepDef[], d: TreeDoc, r: Roles, done: (st: TutStepDef) => boolean): number {
  const open = (k: TutStepDef["kind"]): number => steps.findIndex((s) => s.kind === k && !done(s));
  for (const k of ["goal", "start"] as const) { const i = open(k); if (i >= 0) return i; }
  // 戻りの箱が聞かれている = 戻り先の手の手順 (済んだ手順) を、その箱の上でもう一度案内する
  const back = returnTo(d);
  const backStep = back ? steps.findIndex((s) => s.kind === "hand" && r[s.box] === back.to) : -1;
  if (backStep >= 0) return backStep;
  const asked = askedBox();
  const hands = steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === "hand" && !done(s));
  const here = hands.find(([s]) => s.kind === "hand" && r[s.box] === asked);
  if (here) return here[1];
  if (hands.length) return hands[0]![1];
  for (const k of ["done", "unset", "test", "run"] as const) { const i = open(k); if (i >= 0) return i; }
  return steps.length - 1;
}

/** スマホの場面 (T-26) */
export function phoneNow(c: TutCtx): TutNow {
  const { st, d, r, names } = c;
  const k = (scene: string): string => `${st.id}.p-${scene}`;
  if (st.kind === "goal") {
    if (!goalPageShown()) return { key: k("open"), target: null, act: "goal", draft: say("下の「完成形の設定へ」で完成形の MOD を開く", "Open the final mods with \"Final item\" below") };
    if (!(d.memoAims ?? []).some((a) => a.fractured && a.modId === SPELL)) return { key: k("frac"), target: `[data-tree-goal-card] [data-card-mod="${SPELL}"]`, draft: say(`カードの「${names.mod(SPELL)}」の行を押して ✦ を付ける`, `Tap the "${names.mod(SPELL)}" row on the card to mark it ✦`) };
    const extra = (d.memoAims ?? []).find((a) => a.fractured && a.modId !== SPELL);
    if (extra) return { key: k("frac-off"), target: `[data-tree-goal-card] [data-card-mod="${extra.modId}"]`, draft: say(`「${names.mod(extra.modId)}」の ✦ は外す (もう一度押す)`, `Remove the ✦ from "${names.mod(extra.modId)}" (tap it again)`) };
    if (!d.goalQualityNo || d.goalQualityOn) return { key: k("quality"), target: "[data-tree-goal-quality-no]", draft: say("「品質は狙わない」に ☑ を入れる", "Check \"No quality\"") };
    return { key: k("main"), target: "[data-tree-goal-done]", draft: say("「決めた (ツリーへ)」を押す", "Tap \"Done (back to the tree)\"") };
  }
  if (st.kind === "start") return startScene(c, k);
  if (st.kind === "hand") {
    const id = r[st.box];
    if (!id) return { key: k("missing"), target: null, act: "undo", draft: MISSING };
    const b = d.boxes[id]!;
    const back = returnTo(d);
    if (back?.to === id) {
      // 戻りの箱: 戻り先と同じ手を選ぶ (手の窓の中は同じ案内、窓を開くまでは下の帯)
      const kb = (scene: string): string => `${st.id}.p-back-${scene}`;
      if (handOpen()) return inHand(st, kb, names, () => phoneUse(st, kb, names));
      return { key: kb("main"), target: "[data-phone-main]", draft: say(`この結果は「${c.boxName(st.box)}」と同じ中身。下の「この状態で打つカレンシーを選ぶ」で同じ手を選ぶと、その箱へ戻る`, `This result has the same mods as "${c.boxName(st.box, true)}". Tap "Choose the currency" at the bottom and pick the same craft to go back there`) };
    }
    if (handOpen()) return inHand(st, k, names, () => phoneUse(st, k, names));
    if (b.hand) return { key: k("wrong"), target: null, wrong: true, act: "undo", draft: WRONG(c.boxName(st.box), c.boxName(st.box, true)) };
    const asked = askedBox(), main = shown("[data-phone-main]");
    // 聞かれている箱がこの手順の箱 = 下の帯の「始める」/「この状態で打つカレンシーを選ぶ」
    if (asked === id && main?.dataset.main === "hand") return { key: k("plus"), target: "[data-phone-main]", draft: say(`下の「${main.textContent?.trim() ?? ""}」を押す`, `Tap "${main.textContent?.trim() ?? ""}" at the bottom`) };
    // ほかの結果を見ている (手の付いた箱・決めた結果) = 「次へ」で進む
    if (main && (main.dataset.main === "next" || main.dataset.main === "decide")) return { key: k("next"), target: "[data-phone-main]", draft: say(`下の「次へ」で「${c.boxName(st.box)}」まで進む`, `Tap "Next" at the bottom to reach "${c.boxName(st.box, true)}"`) };
    return { key: k("map"), target: "[data-phone-map-unfold]", draft: say(`全体図から「${c.boxName(st.box)}」の箱を押す`, `Open the overview and tap the "${c.boxName(st.box, true)}" box`) };
  }
  if (st.kind === "done") return { key: k("main"), target: null, draft: say(`狙いが全部そろった「${c.boxName(st.box)}」は自動で完成になった (答え直せる)。札の「次へ」で進む`, `"${c.boxName(st.box, true)}" has every target, so it was marked done automatically (you can change it). Tap "Next" on the note`) };
  if (st.kind === "unset") {
    if (shown("[data-phone-overview]")) return { key: k("close"), target: "[data-phone-overview-close]", draft: say("全体図で木の形を見たら閉じる", "Look over the tree, then close it") };
    return { key: k("main"), target: "[data-phone-map-unfold]", draft: say("「完成形と全体図」を開いて、組んだ木を見る", "Open \"Final item & overview\" to see the whole tree") };
  }
  if (st.kind === "test") return testScene(c, k, "[data-phone-test]");
  if (st.kind === "run") {
    // まだ見ていない結果 (自動でつないだ ↩ の箱など) は「次へ」で全部の道が決まるまで進む (100 人回すは全部決まってから出る)
    const main = shown("[data-phone-main]");
    if (main && (main.dataset.main === "next" || main.dataset.main === "decide")) return { key: k("rest"), target: "[data-phone-main]", draft: say("残りの結果は自動でつながっている。下の「次へ」で最後まで進む", "The remaining results are linked automatically. Tap \"Next\" at the bottom to the end") };
    // 回した後のまとめは「結果のまとめ ›」で開く
    if (!c.ran && shown("[data-phone-run-sum]") && !shown("[data-phone-report]")) return { key: k("sum"), target: "[data-phone-run-sum]", draft: say("「結果のまとめ ›」を押す", "Tap \"Summary ›\"") };
    return runScene(c, k, `[data-phone-main][data-main="run"]`);
  }
  if (st.kind === "note") return { key: k("main"), target: null, draft: ["", ""] };
  return { key: k("main"), target: null, draft: say("お疲れさまでした。完成まで組めました", "Well done. The route is complete") };
}
/** 手の窓 (スマホは画面いっぱい) で持った後: 2 段目のページ (狙う MOD / 残したい MOD) を開いて ☑ → 決める。2 段目の無い手は「使う」 */
function phoneUse(st: Extract<TutStepDef, { kind: "hand" }>, k: (s: string) => string, names: TutCtx["names"]): TutNow {
  const page = shown("[data-tree-hand-aim-page]") ? "aim" : shown("[data-tree-hand-keep-page]") ? "keep" : null;
  if (page) {
    const need = inChecks(st, k, names);
    if (need) return need;
    const go = page === "aim" ? "[data-tree-hand-aim-go]" : "[data-tree-hand-keep-go]";
    return { key: k(`${page}-go`), target: go, draft: say("「決める」を押す", "Tap \"Decide\"") };
  }
  if (shown("[data-tree-hand-aim-step]")) return { key: k("aim-step"), target: "[data-tree-hand-aim-step]", draft: say("「使う (狙いを選ぶ) ›」を押す", "Tap \"Use (pick targets) ›\"") };
  if (shown("[data-tree-hand-keep-step]")) return { key: k("keep-step"), target: "[data-tree-hand-keep-step]", draft: say("「使う ›」を押して残したい MOD を選ぶ", "Tap \"Use ›\" to pick the mods to keep") };
  // 2 段目の無い手 (ルーンの合金・お告げ付きの消去) は同じ窓の「使う」
  const use = shown("[data-tree-hand-use]");
  return { key: k("use"), target: use && inView(use) ? "[data-tree-hand-use]" : "[data-tree-hand-card]", draft: say("「使う (この手にする)」を押す", "Tap \"Use (make it this craft)\"") };
}
/** 全体図が開いている (P11 は開いて閉じたら済み。use-sim-tutorial の stepDone が見る) */
export const overviewOpen = (): boolean => !!shown("[data-phone-overview]");
