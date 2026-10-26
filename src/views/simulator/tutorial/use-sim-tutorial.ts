/**
 * use-sim-tutorial.ts — シミュのチュートリアルの状態と進み (手順と文は src/data/sim-tutorial.json = tut-data.ts、箱の見分けと下書きは tut-route.ts、
 * 出し方は SimTutorialGuide.vue、入口は SimTutorialEntry.vue)。
 * 今どの一手かは覚えずに、毎回「木の中身 + 開いている窓 (DOM)」から求める: 違う所を押しても壊れず、案内がそこから戻すだけ (オーナー 10-26 夜「違う所を押した時は案内に戻す」)。
 * 札の文は「手順の id.場面」の鍵で JSON から引く (オーナーが dev で打つ)。無ければ下書き (場面の一言 + 手順のなぜ)。
 * 木の組み替えは画面と同じ関数 (tree-hand-plan の planPick・applyPick、tree-model の setBack) を呼ぶだけ。打つ・確率・当たりはエンジン
 */
import { computed, ref } from "vue";
import { craftStage as s } from "../../../state/craft-stage";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { setBack, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { tidy } from "../../../services/simulator/tree/tree-layout";
import { applyPick, planPick } from "../tree/tree-hand-plan";
import { headOf, modShort } from "../tree/tree-names";
import { useTree } from "../tree/use-tree";
import { openTreePage } from "../../../web/page";
import { simOp } from "../../../web/track";
import { DEX_ANNUL, DRAFT_WHY, SIN_EXALT, WARD_KEY, isTutorialDoc, rolesOf, tutorialDoc, type Role, type TutNames } from "./tut-route";
import { tutData, type TutStepDef } from "./tut-data";

/** 案内中か */
export const tutOn = ref(false);
/** 窓・棚の DOM の変わり目を拾う刻み (SimTutorialGuide が 0.25 秒ごとに足す) */
export const tutTick = ref(0);
/** 100 人回した (結果のまとめが出た) */
const ran = ref(false);
/** 「次へ」で済ませた文だけの手順 (note) */
const notesDone = ref<string[]>([]);

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x) => b.includes(x));
/** 打つ手の窓が開いているか */
const handOpen = (): boolean => !!document.querySelector("[data-tree-hand-pick]");
/** 手の窓の棚でその物を持っているか (棚のボタンの枠が光る = g-slot の on。お告げの欄の中は見ない) */
const holding = (key: string): boolean => [...document.querySelectorAll<HTMLElement>(`[data-tree-shelf] [data-shelf][data-key="${CSS.escape(key)}"]`)].some((b) => !b.closest("[data-held-omens]") && !!b.querySelector(".g-slot.on"));
/** 持っている物に掛けたお告げ (お告げの欄の「有効」) */
const omenOn = (key: string): boolean => !!document.querySelector(`[data-held-omens] [data-key="${CSS.escape(key)}"] .stage-omen-on`);
const omensOnNow = (): string[] => [...document.querySelectorAll<HTMLElement>("[data-held-omens] [data-key]")].filter((b) => !!b.querySelector(".stage-omen-on")).map((b) => b.dataset.key!);
/** 棚の物の CSS (エッセンスは同じ仲間の束の中にあることがある) */
const shelfSel = (key: string): string => `[data-tree-shelf] [data-shelf][data-key="${CSS.escape(key)}"], [data-tree-shelf] [data-ess-keys~="${CSS.escape(key)}"]`;

type Roles = Partial<Record<Role, string>>;
/** その一手が済んだか (木の中身だけで決める。文だけの手順は「次へ」を押したか) */
function stepDone(d: TreeDoc, r: Roles, st: TutStepDef): boolean {
  if (st.kind === "hand") { const h = r[st.box] ? d.boxes[r[st.box]!]?.hand : null; return !!h && h.currency === st.key && sameSet(h.omens, st.omens) && (!st.aim || !h.free); }
  if (st.kind === "done") return !!r[st.box] && d.boxes[r[st.box]!]?.done === "main";
  if (st.kind === "auto") return autoDone(d, r);
  if (st.kind === "run") return ran.value;
  if (st.kind === "note") return notesDone.value.includes(st.id);
  return false;
}
function autoDone(d: TreeDoc, r: Roles): boolean {
  const dj = r.dj ? d.boxes[r.dj] : null, s1 = r.s1 ? d.boxes[r.s1] : null, s1a = r.s1a ? d.boxes[r.s1a] : null, lost = r.rjLost ? d.boxes[r.rjLost] : null;
  // スタートの「スピリットが付いた」は狙いにチェックして打った時だけ出る
  return !!dj?.hand && (!s1 || (!!s1.hand && !!s1a?.hand)) && (!lost || lost.back === r.x1);
}

/**
 * 今の場面: key = 文と光らせる所の鍵 (「手順の id.場面」)、target = 既定の光らせる所 (CSS。{box} = その手順の箱、done:<箱> = 箱の「完成」)、
 * draft = 下書きの一言、wrong = 違う手が付いている
 */
export type TutNow = { key: string; target: string | null; draft: [string, string]; wrong?: boolean };

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
    const i = steps.value.findIndex((st) => !stepDone(d, r, st));
    return i < 0 ? steps.value.length - 1 : i;
  });
  const step = computed(() => steps.value[index.value] ?? null);
  const boxName = (role: Role, en = false): string => { const id = roles.value[role]; const b = id ? t.doc.value.boxes[id] : null; return !b ? "" : b.out === "start" ? (en ? "Start" : "スタート") : headOf(b as TreeBox, t.aimShort); };
  const now = computed((): TutNow | null => {
    void tutTick.value;
    const st = step.value, r = roles.value, d = t.doc.value;
    if (!st) return null;
    const k = (scene: string): string => `${st.id}.${scene}`;
    if (st.kind === "hand") {
      const id = r[st.box];
      if (!id) return { key: k("missing"), target: null, draft: ["1 つ前の手の結果の箱がまだ無い。1 つ戻す (Ctrl+Z) で戻してください", "The box from the previous step is missing. Undo (Ctrl+Z) to go back"] };
      const b = d.boxes[id]!, bn = boxName(st.box), be = boxName(st.box, true);
      if (b.hand && !handOpen()) return { key: k("wrong"), target: `[data-box-id="{box}"]`, wrong: true, draft: [`「${bn}」の箱に違う手が付いている。1 つ戻す (Ctrl+Z) で戻してください`, `The "${be}" box has a different craft. Undo (Ctrl+Z) to go back`] };
      if (!handOpen()) return { key: k("plus"), target: `[data-box-id="{box}"] [data-tree-next]`, draft: [`「${bn}」の箱の下の ＋ を押す`, `Click + under the "${be}" box`] };
      if (!holding(st.key)) return { key: k("hold"), target: shelfSel(st.key), draft: [`棚の「${names.item(st.key)}」を押して持つ`, `Click "${names.item(st.key)}" on the shelf to hold it`] };
      const extra = omensOnNow().find((o) => !st.omens.includes(o));
      if (extra) return { key: k("omen-off"), target: `[data-held-omens] [data-key="${extra}"]`, draft: [`「${names.item(extra)}」は使わないので押して外す`, `"${names.item(extra)}" isn't used here; click it to turn it off`] };
      const need = st.omens.find((o) => !omenOn(o));
      if (need) return { key: k("omen"), target: `[data-held-omens] [data-key="${need}"]`, draft: [`お告げ「${names.item(need)}」を押して掛ける`, `Click "${names.item(need)}" to apply it`] };
      const aimSel = st.aim ? `[data-tree-hand-aim][data-aim="${CSS.escape(`${st.aim}|1`)}"]` : null;
      if (aimSel && !document.querySelector(`${aimSel} input:checked`)) return { key: k("aim"), target: aimSel, draft: [`狙う MOD の「${names.mod(st.aim!)}」にチェックを入れる`, `Check "${names.mod(st.aim!)}" under target mods`] };
      return { key: k("use"), target: "[data-tree-hand-card]", draft: ["左のアイテムのカードを押して、この手にする", "Click the item card on the left to make it this craft"] };
    }
    if (st.kind === "done") return { key: k("main"), target: r[st.box] ? `done:${r[st.box]}` : null, draft: [`「${boxName(st.box)}」の箱の「完成」を押す`, `Click "Done" on the "${boxName(st.box, true)}" box`] };
    // 札の中のボタンは枠で囲まない (札が光る枠を避けて動き、枠もまた動いて揺れた。ボタンそのものを光らせる)
    if (st.kind === "auto") return { key: k("main"), target: null, draft: ["下の「残りを自動で付ける」を押す", "Click \"Fill in the rest\" below"] };
    if (st.kind === "run") {
      if (!document.querySelector("[data-tree-test-ok]")) return { key: k("wait-test"), target: "[data-tree-test]", draft: ["テストが終わるのを待つ (✓ 合格が出たら次へ)", "Wait for the test run (✓ Passed)"] };
      // 回している間 (ボタンが押せない) は待つだけ (光らせたままだと 2 回押された)
      if (document.querySelector<HTMLButtonElement>("[data-tree-run]")?.disabled) return { key: k("running"), target: null, draft: ["100 人を回している。終わるまで待つ", "Running 100 times. Wait for it to finish"] };
      return { key: k("main"), target: "[data-tree-run]", draft: ["「100 人回す」を押す", "Click \"Run 100\""] };
    }
    if (st.kind === "note") return { key: k("main"), target: null, draft: ["", ""] };
    return { key: k("main"), target: null, draft: ["お疲れさまでした。完成まで組めました", "Well done. The route is complete"] };
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
  /** 残り 3 か所を自動で付ける (画面の手の窓と同じ planPick → applyPick、戻り先は setBack。1 つ戻すで戻せる) */
  function autoFill(): void {
    const data = s.data.value;
    if (!data) return;
    const put = (id: string | undefined, key: string, omens: string[]): void => {
      if (!id || t.doc.value.boxes[id]?.hand) return;
      const it = sampleOf(data, t.doc.value, id, 1)?.item;
      if (!it) return;
      const p = planPick(data, t.doc.value, id, it, key, omens, { hitAims: [] }, t.goals.value);
      if (p.problem) return;
      t.edit((x) => { applyPick(x, id, p.hand, p.kind, p.aims, p.preCat, p.only); tidy(x); });
    };
    put(roles.value.dj, "annul", [DEX_ANNUL]);
    put(roles.value.s1, "exalt", [SIN_EXALT]);
    put(roles.value.s1a, WARD_KEY, []);
    const r = roles.value;
    if (r.rjLost && r.x1 && t.doc.value.boxes[r.rjLost]?.back !== r.x1) t.edit((x) => { setBack(x, r.rjLost!, r.x1!); });
  }
  /** 文だけの手順の「次へ」 */
  function nextNote(): void { const st = step.value; if (st?.kind === "note" && !notesDone.value.includes(st.id)) notesDone.value = [...notesDone.value, st.id]; }
  return { names, roles, onRoute, index, step, now, target, text, autoFill, nextNote, total: computed(() => steps.value.length) };
}

/** 始める: チュートリアルの木を開いてツリーへ (今の木は 1 つ戻すで戻せる) */
export function startTutorial(): void {
  const t = useTree();
  t.open(tutorialDoc());
  t.goalPage.value = 0;
  ran.value = false;
  notesDone.value = [];
  tutOn.value = true;
  openTreePage("tree");
  // 木のページで「最初から」を押した時は前の寄り (結果を見た 25% など) のままで箱が見えなかった。開いた後に全体表示を 1 回押す
  window.setTimeout(() => document.querySelector<HTMLButtonElement>("[data-tree-fit]")?.click(), 400);
  simOp("tutorial-start", tutData.value.course);
}
/** やめる (木はそのまま)。done = 最後まで進んで「終わる」を押した */
export function stopTutorial(done = false): void {
  if (done) simOp("tutorial-done", tutData.value.course);
  tutOn.value = false;
  ran.value = false;
}
/** 結果のまとめが出たら 100 人回しの一手を済みに (SimTutorialGuide が見る) */
export function markRan(): void { ran.value = true; }
