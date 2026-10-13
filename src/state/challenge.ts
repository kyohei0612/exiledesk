/**
 * challenge.ts — 今日のお題の進み具合 (2026-10-13 オーナー「ニックネームで最速何手」「時間だけの順位も」「最速手も見れるように」
 * 「初手フラクチャーを選ぶところからスタート」「0 手目まで戻れるのは 3 回」)。
 *
 * 流れ: 挑戦する (intro。お題はまだ伏せる、オーナー「お題見えたらだめ、ライブ感」) → サーバーが時刻と乱数の種を決めて覚える
 *   → お題が出て、狙いの MOD から 1 つ選んでフラクチャー済みで始める (fracture)
 *   → 打つ (play、1 手戻すは無し。0 手目へのリセットは 3 回まで) → 狙いが全部揃ったら達成 (done) → 記録を送る。
 * 打つのはクラフトステージ (craft-stage.ts) を、お題の種で動かす。順位・手順は server/live の /challenge/*
 */
import { computed, ref, shallowRef, watch } from "vue";
import { craftStage } from "./craft-stage";
import { CHALLENGE_RESETS, dailyChallenge, jstDay, type ChallengeTarget, type DailyChallenge } from "../services/challenge/daily";
import { aimDone } from "../services/craft-stage/aim-odds";
import { WEB_API_BASE } from "../web/config";
import type { CraftStagePlan } from "../services/craft-stage/contract";

const NICK_KEY = "exiledesk.challenge.nick";
/** 達成した日 (上位の手順の再生はその日に 1 回達成してから。再生を見るとお題が分かるので) */
const DONE_KEY = "exiledesk.challenge.done";
const UID_KEY = "exiledesk.web.uid";
export const NICK_MAX = 12;

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* 覚えられなくても遊べる */ } };
/** 端末の id (分析の記録と同じ物。無ければ作る) */
function uidOf(): string {
  const v = read(UID_KEY);
  if (v) return v;
  const u = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  write(UID_KEY, u);
  return u;
}

export type Phase = "intro" | "fracture" | "play" | "done";
export interface BoardRow { nick: string; steps: number; cost: number; ms: number; me?: boolean }
export interface Board { steps: BoardRow[]; time: BoardRow[]; me: { stepsRank: number | null; timeRank: number | null; steps: number | null; ms: number | null } | null }

const day = ref(jstDay());
const phase = ref<Phase>("intro");
const nick = ref(read(NICK_KEY) ?? "");
const run = ref<string | null>(null);
/** この挑戦の乱数の種 (サーバーが返す。その日は全員同じ) とタイムの順位に入る最初の挑戦か */
const runSeed = ref<number | null>(null);
const firstRun = ref(true);
const doneDay = ref(read(DONE_KEY));
/** 始めた時刻 (画面の時計。順位の時間はサーバーが測る) */
const startedAt = ref<number | null>(null);
const resetsLeft = ref(CHALLENGE_RESETS);
/** 達成した時の手数・費用 (高貴)・サーバーが測った時間 */
const result = ref<{ steps: number; cost: number; ms: number | null; bestSteps?: boolean; bestTime?: boolean } | null>(null);
const sending = ref(false);
const error = ref<string | null>(null);
const board = shallowRef<Board | null>(null);
/** 上位の手順を見ている間、自分の打ちかけを覚えておく */
let mine: ReturnType<typeof craftStage.snapshot> | null = null;
const watching = ref<{ board: "steps" | "time"; rank: number; nick: string } | null>(null);

const daily = computed<DailyChallenge | null>(() => {
  const d = craftStage.data.value;
  if (!d) return null;
  try { return dailyChallenge(d, day.value); } catch { return null; }
});

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${WEB_API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error ?? String(r.status));
  return j;
}

function setAims(ts: readonly ChallengeTarget[]): void {
  craftStage.aims.value = ts.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex, label: `${t.text} (${t.rank}+)` }));
}

export const challenge = {
  day, phase, nick, run, startedAt,
  /** 今日 1 回達成したか (上位の手順を見られる) */
  canWatch: computed(() => doneDay.value === day.value),
  /** タイムの順位に入る挑戦か (その日の最初だけ) */
  firstRun, resetsLeft, result, sending, error, board, daily, watching,
  /** 始める: ニックネームを覚え、サーバーに時刻を測ってもらい、白のベースから (次はフラクチャーを選ぶ) */
  async start(): Promise<void> {
    const c = daily.value;
    const n = nick.value.trim().slice(0, NICK_MAX);
    if (!c || !n || sending.value) return;
    write(NICK_KEY, n);
    nick.value = n;
    sending.value = true;
    error.value = null;
    try {
      const r = await post<{ run: string; seed: number; first: boolean }>("/challenge/start", { day: c.day, uid: uidOf() });
      run.value = r.run;
      runSeed.value = r.seed;
      firstRun.value = r.first;
      startedAt.value = Date.now();
      resetsLeft.value = CHALLENGE_RESETS;
      result.value = null;
      craftStage.startChallenge({ base: c.base, itemLevel: c.itemLevel, seed: r.seed });
      setAims(c.targets);
      phase.value = "fracture";
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally { sending.value = false; }
  },
  /** 初手: 狙いの MOD の 1 つを、下限の段でフラクチャー済みにして始める (0 手目、手数に数えない) */
  chooseFracture(t: ChallengeTarget): void {
    if (phase.value !== "fracture") return;
    craftStage.addStartMod({ mod: t.modId, tier: t.rank, fractured: true }, true);
    if (craftStage.startMods.value.length) phase.value = "play";
  },
  /** 0 手目 (フラクチャーを選ぶ所) へ戻す。3 回まで。時間は止めない */
  fullReset(): void {
    const c = daily.value;
    if (!c || runSeed.value == null || resetsLeft.value <= 0 || phase.value !== "play") return;
    resetsLeft.value--;
    craftStage.startChallenge({ base: c.base, itemLevel: c.itemLevel, seed: runSeed.value });
    setAims(c.targets);
    phase.value = "fracture";
  },
  /** 達成を送る (手順も。サーバーが種と手の数を確かめ、時間を測る) */
  async send(): Promise<void> {
    if (!run.value || !result.value || sending.value) return;
    sending.value = true;
    error.value = null;
    try {
      const plan = craftStage.plan();
      const r = await post<{ ms: number; bestSteps: boolean; bestTime: boolean }>("/challenge/finish", { run: run.value, uid: uidOf(), nick: nick.value, steps: result.value.steps, cost: result.value.cost, plan });
      result.value = { ...result.value, ms: r.ms, bestSteps: r.bestSteps, bestTime: r.bestTime };
      run.value = null;
      write(DONE_KEY, day.value);
      doneDay.value = day.value;
      void challenge.loadBoard();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally { sending.value = false; }
  },
  /** もう一度 (新しい挑戦。時間は 0 から) */
  again(): void {
    phase.value = "intro";
    result.value = null;
    run.value = null;
    startedAt.value = null;
  },
  async loadBoard(): Promise<void> {
    try {
      const r = await fetch(`${WEB_API_BASE}/challenge/board?day=${day.value}&uid=${encodeURIComponent(uidOf())}`, { credentials: "omit" });
      board.value = (await r.json()) as Board;
    } catch { /* 出せなくても遊べる */ }
  },
  /** 順位の行の手順を 1 手ずつ見る (自分の打ちかけは覚えておき、閉じたら戻す) */
  async watch(b: "steps" | "time", rank: number, who: string): Promise<void> {
    if (doneDay.value !== day.value) return;
    try {
      const r = await fetch(`${WEB_API_BASE}/challenge/plan?day=${day.value}&board=${b}&rank=${rank}`, { credentials: "omit" });
      const j = (await r.json()) as { plan?: CraftStagePlan };
      if (!j.plan) return;
      if (!watching.value) mine = craftStage.snapshot();
      watching.value = { board: b, rank, nick: who };
      craftStage.loadReplay(j.plan, 0, true);
    } catch { /* 見られなくても遊べる */ }
  },
  stopWatching(): void {
    if (!watching.value) return;
    watching.value = null;
    if (mine) craftStage.restore(mine);
    else craftStage.leaveReplay();
    mine = null;
  },
};

// 狙いが全部揃ったら達成 (その時点の手数・費用で止める)
watch(() => craftStage.item.value, (it) => {
  const c = daily.value;
  if (!it || !c || phase.value !== "play" || watching.value) return;
  if (aimDone(it, c.targets)) {
    phase.value = "done";
    result.value = { steps: craftStage.log.value.length, cost: craftStage.total.value, ms: null };
    void challenge.send();
  }
});
