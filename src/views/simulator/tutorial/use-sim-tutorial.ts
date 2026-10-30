/**
 * use-sim-tutorial.ts — シミュのチュートリアルの状態と進み (手順と文は src/data/sim-tutorial.json = tut-data.ts、箱の見分けと下書きは tut-route.ts、
 * 出し方は SimTutorialGuide.vue、入口は SimTutorialEntry.vue、スマホの場面は use-sim-tutorial-phone.ts)。
 * 今どの一手かは覚えずに、毎回「木の中身 + 開いている窓 (DOM)」から求める: 違う所を押しても壊れず、案内がそこから戻すだけ (T-10、オーナー 10-26 夜「違う所を押した時は案内に戻す」)。
 * 覚えるのは木に出ない 3 つだけ: 帯の「次へ」を押した・テストを押した・100 人回した (どれも押した所を見るだけで、手順の番号は覚えない)。
 * 札の文は「手順の id.場面」の鍵で JSON から引く (オーナーが dev で打つ)。無ければ下書き (場面の一言 + 手順のなぜ)。
 * 木は変えない (前の「残りを自動で付ける」は 10-31 朝 Q1 A で消した)。打つ・確率・当たりはエンジン
 */
import { computed, nextTick, ref } from "vue";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import type { TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { headOf, modShort } from "../tree/tree-names";
import { useTree } from "../tree/use-tree";
import { openTreePage, treeStep } from "../../../web/page";
import { simOp } from "../../../web/track";
import { HOLE_CHECK } from "../tree/hole-check";
import { DRAFT_WHY, SPELL, isTutorialDoc, rolesOf, tutorialDoc, type Role, type TutNames } from "./tut-route";
import { tutData, type TutStepDef } from "./tut-data";
import { aimSel, aimsChecked, checked, handOpen, holding, inView, keepSel, omenOn, omensOnNow, shelfSel, shown } from "./tut-dom";
import { overviewOpen, phoneIndex, phoneNow } from "./use-sim-tutorial-phone";

/** 案内中か */
export const tutOn = ref(false);
/** 窓・棚の DOM の変わり目を拾う刻み (SimTutorialGuide が 0.25 秒ごとに足す) */
export const tutTick = ref(0);
/** スマホの形 (1280 未満、U-53・isPhoneWidth) で案内している (SimTutorialGuide が刻みで合わせる) */
export const tutPhone = ref(false);
/** 100 人回した (結果のまとめが出た) */
const ran = ref(false);
/** 帯「! 未設定 ▸ 次へ」を押した (手順 8)・テストを押した (手順 12) */
const barUsed = ref(false), testPressed = ref(false), runPressed = ref(false);
/** スマホ: 全体図を開いた (P11) */
const mapSeen = ref(false);
/** 「次へ」で済ませた文だけの手順 (note) */
const notesDone = ref<string[]>([]);

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
export type Roles = Partial<Record<Role, string>>;
type HandStep = Extract<TutStepDef, { kind: "hand" }>;
/** 箱に付いた手がその手順の手と同じか (カレンシー・お告げ・☑ の狙い・狙い無し・残したい MOD) */
export function handMatches(d: TreeDoc, id: string, st: HandStep): boolean {
  const b = d.boxes[id], h = b?.hand;
  if (!b || !h || h.currency !== st.key || !sameSet(h.omens, st.omens)) return false;
  if (st.free && !h.free) return false;
  if (st.aim && (h.free || !(b.outs ?? []).some((k) => d.boxes[k]?.out === "hit" && d.boxes[k]?.aim?.modId === st.aim))) return false;
  if (st.keep && !(h.keep ?? []).some((a) => a.modId === st.keep)) return false;
  return true;
}
const goalOk = (d: TreeDoc): boolean => (d.memoAims ?? []).every((a) => !!a.fractured === (a.modId === SPELL)) && !!d.goalQualityNo && !d.goalQualityOn;
/** 始め方: フラクチャー済みから (✦ の MOD は start.mods でなく完成形の印から読む = tree-start-choice) */
const startOk = (d: TreeDoc): boolean => !!d.fracAsked && d.start?.from === "fractured" && (d.memoAims ?? []).some((a) => a.fractured && a.modId === SPELL);
/** 完成形の設定がページで開いている (?page=sim-mods。ツリーの上の窓の形は「決めた」が下の帯に隠れるので数えない) */
export const goalPageShown = (): boolean => !!shown("[data-tree-goal-mods]") && treeStep.value === "mods";
/** 始め方の窓が開いている */
export const startAskOpen = (): boolean => !!document.querySelector("[data-tree-start-ask]");
/** その一手が済んだか (木の中身で決める。帯・テスト・100 人・文だけの手順は押したか) */
export function stepDone(d: TreeDoc, r: Roles, st: TutStepDef): boolean {
  if (st.kind === "goal") return goalOk(d) && (!!d.fracAsked || startAskOpen());
  if (st.kind === "start") return startOk(d);
  if (st.kind === "hand") return !!r[st.box] && handMatches(d, r[st.box]!, st);
  // スマホは完成が自動 (S-91) なので札の「次へ」で済み (P10)、帯の代わりは全体図を開いて閉じる (P11)
  if (st.kind === "done") return tutPhone.value ? notesDone.value.includes(st.id) : !!r[st.box] && d.boxes[r[st.box]!]?.done === "main";
  if (st.kind === "unset" && tutPhone.value) return mapSeen.value && !overviewOpen();
  // 帯の「次へ」を押した (または押した先の dj にもう手がある = 前に押した)
  if (st.kind === "unset") return barUsed.value || !!(r.dj && d.boxes[r.dj]?.hand);
  if (st.kind === "test") return (testPressed.value && !!document.querySelector("[data-tree-test-ok], [data-phone-test-ok]")) || ran.value;
  if (st.kind === "note") return notesDone.value.includes(st.id);
  return false;
}
/** 押した所を拾う (SimTutorialGuide が document に capture で付ける) */
export function noteClick(e: Event): void {
  const el = e.target as Element | null;
  if (!tutOn.value || !el?.closest) return;
  if (el.closest("[data-tree-unset-bar]")) barUsed.value = true;
  if (el.closest("[data-phone-map-unfold]")) mapSeen.value = true;
  if (el.closest("[data-tree-test], [data-phone-test]")) testPressed.value = true;
  if (el.closest(`[data-tree-run], [data-phone-main][data-main="run"]`)) runPressed.value = true;
}

/**
 * 今の場面: key = 文と光らせる所の鍵 (「手順の id.場面」)、target = 既定の光らせる所 (CSS。{box} = その手順の箱、done:<箱> = 箱の「完成」)、
 * draft = 下書きの一言、wrong = 違う手が付いている
 */
export type TutNow = { key: string; target: string | null; draft: [string, string]; wrong?: boolean;
  /** 札の中に出すボタン: undo = 1 つ戻す (スマホに Ctrl+Z が無い)、goal = 完成形の設定をページで開く (ツリーの上の窓は「決めた」が下の帯に隠れた、モンキー 7 の 1) */
  act?: "undo" | "goal" };
/** 場面を求める口に渡す物 (PC とスマホで同じ) */
export type TutCtx = { st: TutStepDef; d: TreeDoc; r: Roles; names: TutNames; boxName: (role: Role, en?: boolean) => string; ran: boolean; testPressed: boolean };
const say = (ja: string, en: string): [string, string] => [ja, en];
export const WRONG = (bn: string, be: string): [string, string] => say(`「${bn}」の箱に違う手が付いている。下の「1 つ戻す」で戻してください`, `The "${be}" box has a different craft. Use "Undo" below to go back`);
export const MISSING = say("1 つ前の手の結果の箱がまだ無い。下の「1 つ戻す」で戻してください", "The box from the previous step is missing. Use \"Undo\" below to go back");

/** 手の窓の中 (持つ → お告げ → ☑ → 残したい MOD) で、まだの所を 1 つ (PC とスマホで同じ。スマホは use で先へ進む所だけ違う) */
export function inHand(st: HandStep, k: (s: string) => string, names: TutNames, use: () => TutNow): TutNow {
  if (!holding(st.key)) return { key: k("hold"), target: shelfSel(st.key), draft: say(`棚の「${names.item(st.key)}」を押して持つ`, `Click "${names.item(st.key)}" on the shelf to hold it`) };
  const extra = omensOnNow().find((o) => !st.omens.includes(o));
  if (extra) return { key: k("omen-off"), target: `[data-held-omens] [data-key="${extra}"]`, draft: say(`「${names.item(extra)}」は使わないので押して外す`, `"${names.item(extra)}" isn't used here; click it to turn it off`) };
  const need = st.omens.find((o) => !omenOn(o));
  if (need) return { key: k("omen"), target: `[data-held-omens] [data-key="${need}"]`, draft: say(`お告げ「${names.item(need)}」を押して掛ける`, `Click "${names.item(need)}" to apply it`) };
  return use();
}
/** ☑ の欄 (狙う MOD・狙い無し・残したい MOD) で、まだの所を 1 つ。全部済めば null */
export function inChecks(st: HandStep, k: (s: string) => string, names: TutNames): TutNow | null {
  const off = aimsChecked().find((m) => m !== st.aim);
  if (off) return { key: k("aim-off"), target: aimSel(off), draft: say(`「${names.mod(off)}」の ☑ を外す`, `Uncheck "${names.mod(off)}"`) };
  if (st.aim && shown(aimSel(st.aim)) && !checked(aimSel(st.aim))) return { key: k("aim"), target: aimSel(st.aim), draft: say(`狙う MOD の「${names.mod(st.aim)}」に ☑ を入れる`, `Check "${names.mod(st.aim)}" under target mods`) };
  if (st.free && shown("[data-tree-hand-free]") && !checked("[data-tree-hand-free]")) return { key: k("free"), target: "[data-tree-hand-free]", draft: say("「狙い無し」に ☑ を入れる (何が付いても次へ)", "Check \"No target\" (anything counts)") };
  if (st.keep && shown(keepSel(st.keep)) && !checked(keepSel(st.keep))) return { key: k("keep"), target: keepSel(st.keep), draft: say(`残したい MOD の「${names.mod(st.keep)}」に ☑ を入れる`, `Check "${names.mod(st.keep)}" under mods to keep`) };
  return null;
}

/** PC (1280 以上) の場面 (T-21・T-22) */
function pcNow(c: TutCtx): TutNow {
  const { st, d, r, names } = c;
  const k = (scene: string): string => `${st.id}.${scene}`;
  if (st.kind === "goal") {
    if (!goalPageShown()) return { key: k("open"), target: null, act: "goal", draft: say("下の「完成形の設定へ」で完成形の MOD を開く", "Open the final mods with \"Final item\" below") };
    const extra = (d.memoAims ?? []).find((a) => a.fractured && a.modId !== SPELL);
    if (extra) return { key: k("frac-off"), target: `[data-tree-goal-card] [data-card-mod="${extra.modId}"]`, draft: say(`「${names.mod(extra.modId)}」の ✦ は外す (もう一度押す)`, `Remove the ✦ from "${names.mod(extra.modId)}" (click it again)`) };
    if (!(d.memoAims ?? []).some((a) => a.fractured && a.modId === SPELL)) return { key: k("frac"), target: `[data-tree-goal-card] [data-card-mod="${SPELL}"]`, draft: say(`カードの「${names.mod(SPELL)}」の行を押して ✦ を付ける`, `Click the "${names.mod(SPELL)}" row on the card to mark it ✦`) };
    if (!d.goalQualityNo || d.goalQualityOn) return { key: k("quality"), target: "[data-tree-goal-quality-no]", draft: say("「品質は狙わない」に ☑ を入れる", "Check \"No quality\"") };
    return { key: k("main"), target: "[data-tree-goal-done]", draft: say("「決めた (ツリーへ)」を押す", "Click \"Done (back to the tree)\"") };
  }
  if (st.kind === "start") return startScene(c, k);
  if (st.kind === "hand") {
    const id = r[st.box];
    if (!id) return { key: k("missing"), target: null, act: "undo", draft: MISSING };
    const b = d.boxes[id]!;
    if (b.hand && !handOpen()) return { key: k("wrong"), target: `[data-box-id="{box}"]`, wrong: true, act: "undo", draft: WRONG(c.boxName(st.box), c.boxName(st.box, true)) };
    if (!handOpen()) {
      // 箱が画面の外 (帯の「次へ」で寄っていない) なら帯を指す
      if (!inView(shown(`[data-box-id="${CSS.escape(id)}"]`)) && shown("[data-tree-unset-bar]")) return { key: k("bar"), target: "[data-tree-unset-bar]", draft: say(`帯の「次へ」で「${c.boxName(st.box)}」の箱へ寄る`, `Use the bar's "Next" to go to the "${c.boxName(st.box, true)}" box`) };
      return { key: k("plus"), target: `[data-box-id="{box}"] [data-tree-next]`, draft: say(`「${c.boxName(st.box)}」の箱の下の ＋ を押す`, `Click + under the "${c.boxName(st.box, true)}" box`) };
    }
    return inHand(st, k, names, () => inChecks(st, k, names) ?? { key: k("use"), target: "[data-tree-hand-card]", draft: say("左のアイテムのカードを押して、この手にする", "Click the item card on the left to make it this craft") });
  }
  if (st.kind === "done") return { key: k("main"), target: r[st.box] ? `done:${r[st.box]}` : null, draft: say(`「${c.boxName(st.box)}」の箱の「完成」を押す`, `Click "Done" on the "${c.boxName(st.box, true)}" box`) };
  if (st.kind === "unset") return { key: k("main"), target: "[data-tree-unset-bar]", draft: say("上の帯「! 未設定 ▸ 次へ」を押す", "Click the \"! Not set ▸ Next\" bar at the top") };
  if (st.kind === "test") return testScene(c, k, "[data-tree-test]");
  if (st.kind === "run") return runScene(c, k, "[data-tree-run]");
  if (st.kind === "note") return { key: k("main"), target: null, draft: ["", ""] };
  return { key: k("main"), target: null, draft: say("お疲れさまでした。完成まで組めました", "Well done. The route is complete") };
}
/** 始め方の窓 (PC・スマホ共通の窓 TreeStartAsk) */
export function startScene(c: TutCtx, k: (s: string) => string): TutNow {
  if (!startAskOpen()) {
    // 始め方を選び直す = 完成形の設定 (ページ) の「決めた」から始め方の窓をもう一度 (窓の形は「決めた」が下の帯に隠れるのでページで開く)
    if (!goalPageShown()) return { key: k(c.d.fracAsked ? "wrong" : "reopen"), target: null, wrong: !!c.d.fracAsked, act: "goal", draft: c.d.fracAsked ? say("始め方が「フラクチャー済みから」でない。下の「完成形の設定へ」から選び直す", "The start isn't \"From fractured\". Pick it again from \"Final item\" below") : say("下の「完成形の設定へ」から始め方の窓を開く", "Open the start window from \"Final item\" below") };
    return { key: k("reopen"), target: "[data-tree-goal-done]", draft: say("「決めた (ツリーへ)」を押して始め方を選ぶ", "Click \"Done (back to the tree)\" to pick the start") };
  }
  const mods = [...document.querySelectorAll<HTMLElement>("[data-tree-start-ask-mod]")];
  const on = mods.filter((l) => !!l.querySelector("input:checked"));
  if (on.length !== 1 || !mods[0]?.querySelector("input:checked")) return { key: k("mod"), target: "[data-tree-start-ask-mod]", draft: say(`✦ は「${c.names.mod(SPELL)}」の 1 つだけ ☑ にする`, `Check only "${c.names.mod(SPELL)}" as ✦`) };
  if (!checked(`[data-tree-start-ask-from-k="fractured"]`)) return { key: k("from"), target: `[data-tree-start-ask-from-k="fractured"]`, draft: say("「(a) フラクチャー済みから」を選ぶ", "Pick \"(a) From fractured\"") };
  return { key: k("main"), target: "[data-tree-start-ask-go]", draft: say("「これで始める (ツリーへ)」を押す", "Click \"Start (to the tree)\"") };
}
export function testScene(c: TutCtx, k: (s: string) => string, btn: string): TutNow {
  // 木を変えるたびに穴チェックが自動で回る。回っている間はボタンが押せない (押しても数えない) ので待つ
  if (document.querySelector<HTMLButtonElement>(btn)?.disabled) return { key: k("busy"), target: null, draft: HOLE_CHECK ? say("穴チェックが回っている。終わるまで待つ", "The gap check is going. Wait for it to finish") : say("テストが回っている。終わるまで待つ", "The test run is going. Wait for it to finish") };
  if (!c.testPressed) return { key: k("main"), target: btn, draft: HOLE_CHECK ? say("「穴チェック」を押す (止まる所・打てない手を探す)", "Click \"Gap check\" (finds dead ends and unusable crafts)") : say("「テストで回す」を押す (止まる所・打てない手を探す)", "Click the test run (finds dead ends and unusable crafts)") };
  return { key: k("wait"), target: null, draft: HOLE_CHECK ? say("穴チェックが終わるのを待つ (✓ 合格が出たら次へ)", "Wait for the gap check (✓ Passed)") : say("テストが終わるのを待つ (✓ 合格が出たら次へ)", "Wait for the test run (✓ Passed)") };
}
export function runScene(c: TutCtx, k: (s: string) => string, btn: string): TutNow {
  // 穴チェックに通っていない間も押せない (S-70)。回している時の文にしない
  if (document.querySelector("[data-run-locked]")) return { key: k("locked"), target: null, draft: say("穴チェックに合格すると「100 人回す」が押せる。合格を待つ", "\"Run 100\" unlocks when the gap check passes. Wait for it") };
  // 回している間 (ボタンが押せない) は待つだけ (光らせたままだと 2 回押された)
  if (c.ran) return { key: k("end"), target: null, draft: say("結果のまとめを見たら、下の「終わる」を押す", "After reading the summary, click \"Finish\" below") };
  if (document.querySelector<HTMLButtonElement>(btn)?.disabled) return { key: k("running"), target: null, draft: say("100 人を回している。終わるまで待つ", "Running 100 times. Wait for it to finish") };
  return { key: k("main"), target: btn, draft: say("「100 人回す」を押す", "Click \"Run 100\"") };
}

export function useSimTutorial() {
  const t = useTree();
  const names: TutNames = {
    item: (k) => nameOfKey(k, t.goalItem.value?.item ?? null),
    // 英語の短い名前は頭の「+ to」「increased」を外す (「+ to Spirit」→「Spirit」)
    mod: (modId) => modShort(t.aimShort({ modId, tier: 1 })).replace(/^\+?\s*to\s+/i, "").replace(/^(increased|reduced)\s+/i, ""),
  };
  const steps = computed(() => tutData.value.steps);
  const roles = computed(() => rolesOf(t.doc.value));
  const onRoute = computed(() => isTutorialDoc(t.doc.value));
  const index = computed(() => {
    void tutTick.value;
    const d = t.doc.value, r = roles.value;
    if (tutPhone.value) return phoneIndex(steps.value, d, r, (st) => stepDone(d, r, st));
    const i = steps.value.findIndex((st) => !stepDone(d, r, st));
    return i < 0 ? steps.value.length - 1 : i;
  });
  /** 札の「n / 14」の n (スマホは聞かれる順が並びと違うので、済んだ手順の数 + 1) */
  const pos = computed(() => {
    void tutTick.value;
    if (!tutPhone.value) return index.value + 1;
    const d = t.doc.value, r = roles.value;
    return Math.min(steps.value.length, steps.value.filter((st) => stepDone(d, r, st)).length + 1);
  });
  const step = computed(() => steps.value[index.value] ?? null);
  const boxName = (role: Role, en = false): string => { const id = roles.value[role]; const b = id ? t.doc.value.boxes[id] : null; return !b ? "" : b.out === "start" ? (en ? "Start" : "スタート") : headOf(b as TreeBox, t.aimShort); };
  const now = computed((): TutNow | null => {
    void tutTick.value;
    const st = step.value;
    if (!st) return null;
    const c: TutCtx = { st, d: t.doc.value, r: roles.value, names, boxName, ran: ran.value, testPressed: testPressed.value };
    return tutPhone.value ? phoneNow(c) : pcNow(c);
  });
  /** 光らせる所 (人が選び直した物があればそれ。{box} は今の手順の箱) */
  const target = computed((): string | null => {
    const n = now.value, st = step.value;
    if (!n) return null;
    const sel = tutData.value.targets[n.key] ?? n.target;
    const box = st && (st.kind === "hand" || st.kind === "done") ? roles.value[st.box] : undefined;
    return sel && sel.includes("{box}") ? (box ? sel.split("{box}").join(box) : null) : sel;
  });
  /** 札の文 (日 / 英)。打った文が無ければ下書き = 場面の一言 + 手順のなぜ */
  const text = computed((): { say: [string, string]; why: [string, string]; written: boolean } => {
    const n = now.value, st = step.value;
    if (!n || !st) return { say: ["", ""], why: ["", ""], written: false };
    const w = tutData.value.texts[n.key];
    if (w && (w.ja || w.en)) return { say: [w.ja, w.en], why: ["", ""], written: true };
    return { say: n.draft, why: DRAFT_WHY[st.id]?.(names) ?? ["", ""], written: false };
  });
  /** 文だけの手順・スマホの自動の完成 (P10) の「次へ」 */
  function nextNote(): void { const st = step.value; if (st && (st.kind === "note" || st.kind === "done") && !notesDone.value.includes(st.id)) notesDone.value = [...notesDone.value, st.id]; }
  return { names, roles, onRoute, index, pos, step, now, target, text, nextNote, total: computed(() => steps.value.length) };
}

/** 始める: チュートリアルの木 (完成形の 4 つだけ入った木) を開いて完成形の設定へ (今の木は 1 つ戻すで戻せる) */
export function startTutorial(): void {
  const t = useTree();
  t.open(tutorialDoc());
  // ベース選びから来たので「ベースを選んで」の印 (needBase) が立っている。ベースは決めてあるので下ろし、完成形のページは開き直す
  // (開いたままのページは開いた時の「まだ選んでいない」を覚えていて、閉じる時に印を立て直し、ツリーの ＋ を幕が覆った)
  t.needBase.value = false;
  t.goalPage.value = 0;
  ran.value = false; barUsed.value = false; testPressed.value = false; runPressed.value = false; mapSeen.value = false;
  notesDone.value = [];
  tutOn.value = true;
  void nextTick(() => { t.goalPage.value = 2; openTreePage("mods"); });
  simOp("tutorial-start", tutData.value.course);
}
/** 完成形の設定をページで開く (ツリーの上の窓で開いていても開き直す。札の「完成形の設定へ」) */
export function openGoalPage(): void {
  const t = useTree();
  t.goalPage.value = 0;
  void nextTick(() => { t.goalPage.value = 2; openTreePage("mods"); });
}
/** 札の「1 つ戻す」(画面の 1 つ戻すと同じ。スマホには Ctrl+Z が無い、モンキー 7 の 2) */
export function undoOne(): void { useTree().undo(); }
/** 進みがあるか (「最初から」で消える物。始め方を決めた・手を足した) */
export function tutHasProgress(): boolean { const d = useTree().doc.value; return !!d.fracAsked || Object.keys(d.boxes).length > 1; }
/** やめる (木はそのまま)。done = 最後まで進んで「終わる」を押した */
export function stopTutorial(done = false): void {
  if (done) simOp("tutorial-done", tutData.value.course);
  tutOn.value = false;
  ran.value = false;
}
/** 「100 人回す」を押した後に結果のまとめが出たら 100 人回しの一手を済みに (SimTutorialGuide が見る。テストの結果だけでもまとめの箱が立つ事がある) */
export function markRan(): void { if (runPressed.value) ran.value = true; }
