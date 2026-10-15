/**
 * challenge.ts — 今日のお題の進み具合 (2026-10-13 オーナー「初手フラクチャーを選ぶところからスタート」「0 手目まで戻れるのは 3 回」、
 * 2026-10-16 docs/craft-challenge.md の形に直した)。
 *
 * 流れ: 開く (intro。お題はまだ伏せる、オーナー「お題見えたらだめ、ライブ感」) → 挑戦する: サーバーが時刻を覚え、乱数の種を返す
 *   → お題が出て、狙いの MOD から 1 つ選んでフラクチャー済みで始める (fracture、0 手目)
 *   → 打つ (play、1 手戻すは無し。0 手目へのリセットは 3 回まで、時間は止まらない) → 狙いが全部揃ったら達成 (done) → すぐ記録を送る。
 *   やめる = 記録無し (次は 2 回目扱い)。
 * 打つのはクラフトステージ (craft-stage.ts) を、お題の種で動かす。順位・手順は server/live の /challenge/* (challenge.ts)
 */
import { computed, ref, shallowRef, watch } from "vue";
import { craftStage } from "./craft-stage";
import { CHALLENGE_RESETS, dailyChallenge, jstDay, type ChallengeTarget, type DailyChallenge } from "../services/challenge/daily";
import { countSwamp, doneCount, type Swamp } from "../services/challenge/swamp";
import { aimDone } from "../services/craft-stage/aim-odds";
import { CHALLENGE_API_BASE } from "../web/config";
import { rememberName, webName, webUid } from "../services/web/identity";
import type { CraftStagePlan } from "../services/craft-stage/contract";
import { lang } from "../i18n/lang";

/** 達成した日 (上位の手順の再生はその日に 1 回達成してから。再生を見るとお題が分かるので) */
const DONE_KEY = "exiledesk.challenge.done";
/** ニックネームの長さ (md「12 字まで、URL は不可」。サーバーの NICK_MAX と同じ) */
export const NICK_MAX = 12;
const NICK_BAD = /https?:|www\.|\.(com|net|org|jp|gg|io|tv|me|xyz)\b|discord\.gg/i;
/** 使えないニックネームなら理由の印 (null = 使える) */
export const nickProblem = (v: string): "empty" | "long" | "url" | null => {
  const s = v.trim();
  return !s ? "empty" : [...s].length > NICK_MAX ? "long" : NICK_BAD.test(s) ? "url" : null;
};

const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* 覚えられなくても遊べる */ } };

export type Phase = "intro" | "fracture" | "play" | "done";
export interface BoardRow { id: string; pos: number; nick: string; cost: number; steps: number; ms: number; swamp: Swamp; me?: true }
export interface Board { players: number; rows: BoardRow[]; swamp: BoardRow[]; me: BoardRow | null }

const day = ref(jstDay());
const phase = ref<Phase>("intro");
const run = ref<string | null>(null);
/** この挑戦の乱数の種 (サーバーが返す。その日は全員同じ) と、その日の最初の挑戦か */
const runSeed = ref<number | null>(null);
const firstRun = ref(true);
const doneDay = ref(read(DONE_KEY));
/** 始めた時刻 (画面の時計。順位の時間はサーバーが測る) */
const startedAt = ref<number | null>(null);
const resetsLeft = ref(CHALLENGE_RESETS);
/** 達成した時の手数・費用 (高貴)・沼・サーバーが測った時間と順位 */
const result = ref<{ steps: number; cost: number; swamp: Swamp; ms: number | null; best?: boolean; rank?: number | null; first?: boolean } | null>(null);
const sending = ref(false);
const error = ref<string | null>(null);
const board = shallowRef<Board | null>(null);
const yesterday = shallowRef<Board | null>(null);
/** 上位の手順を見ている間、自分の打ちかけを覚えておく */
let mine: ReturnType<typeof craftStage.snapshot> | null = null;
const watching = ref<{ id: string; nick: string; day: string } | null>(null);

const daily = computed<DailyChallenge | null>(() => {
  const d = craftStage.data.value;
  // MOD の文面は言語で変わるので、言語を変えたら作り直す
  void lang.value;
  if (!d) return null;
  try { return dailyChallenge(d, day.value); } catch { return null; }
});

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${CHALLENGE_API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "omit" });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error ?? String(r.status));
  return j;
}
const prevDay = (d: string): string => new Date(Date.parse(`${d}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
async function fetchBoard(d: string): Promise<Board | null> {
  try {
    const r = await fetch(`${CHALLENGE_API_BASE}/challenge/board?day=${d}&uid=${encodeURIComponent(webUid())}`, { credentials: "omit" });
    return r.ok ? ((await r.json()) as Board) : null;
  } catch { return null; }
}

function setAims(ts: readonly ChallengeTarget[]): void {
  craftStage.aims.value = ts.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex, label: `${t.text} (${t.rank}+)` }));
}
/** 挑戦を始める前の普段のクラフトステージ (やめた・ページを離れた時に戻す。打ちかけを消さない) */
let normal: { snap: ReturnType<typeof craftStage.snapshot>; base: string; itemLevel: number; aims: typeof craftStage.aims.value } | null = null;
function enterStage(base: string, itemLevel: number, seed: number): void {
  if (craftStage.challenge.value == null) normal = { snap: craftStage.snapshot(), base: craftStage.base.value, itemLevel: craftStage.itemLevel.value, aims: craftStage.aims.value };
  craftStage.startChallenge({ base, itemLevel, seed });
}
/** 普段のクラフトステージに戻す (お題の種・狙いを外し、前の打ちかけへ) */
function leaveStage(): void {
  if (craftStage.challenge.value == null) return;
  craftStage.startChallenge(null);
  craftStage.aims.value = normal?.aims ?? [];
  if (normal) {
    craftStage.base.value = normal.base;
    craftStage.itemLevel.value = normal.itemLevel;
    craftStage.restore(normal.snap);
  }
  normal = null;
}

export const challenge = {
  day, phase, run, startedAt, firstRun, resetsLeft, result, sending, error, board, yesterday, daily, watching,
  nick: webName,
  /** 今日 1 回達成したか (今日の上位の手順を見られる) */
  canWatch: computed(() => doneDay.value === day.value),
  /** 狙いが揃っている数 */
  doneCount: computed(() => { const it = craftStage.item.value, c = daily.value; return it && c ? doneCount(it, c.targets) : 0; }),
  /** 今の沼 (打ちながら出す) */
  swamp: computed(() => countSwamp(craftStage.log.value, daily.value?.targets ?? [], CHALLENGE_RESETS - resetsLeft.value)),
  setNick(v: string): void { rememberName(v.trim()); },
  /** 挑戦する: サーバーに時刻を測ってもらい、お題を出して白のベースから (次はフラクチャーを選ぶ) */
  async start(): Promise<void> {
    // 日付が変わっていたら今日のお題に
    day.value = jstDay();
    const c = daily.value;
    if (!c || nickProblem(webName.value) || sending.value) return;
    rememberName(webName.value.trim());
    sending.value = true;
    error.value = null;
    try {
      const r = await post<{ run: string; seed: number; first: boolean }>("/challenge/start", { day: c.day, uid: webUid() });
      run.value = r.run;
      runSeed.value = r.seed;
      firstRun.value = r.first;
      startedAt.value = Date.now();
      resetsLeft.value = CHALLENGE_RESETS;
      result.value = null;
      enterStage(c.base, c.itemLevel, r.seed);
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
  /** 0 手目 (フラクチャーを選ぶ所) へ戻す。3 回まで。時間は止めない。乱数の順番は同じ */
  fullReset(): void {
    const c = daily.value;
    if (!c || runSeed.value == null || resetsLeft.value <= 0 || phase.value !== "play") return;
    resetsLeft.value--;
    enterStage(c.base, c.itemLevel, runSeed.value);
    setAims(c.targets);
    phase.value = "fracture";
  },
  /** やめる (記録無し。次は 2 回目扱い) */
  giveUp(): void {
    run.value = null;
    startedAt.value = null;
    result.value = null;
    phase.value = "intro";
    leaveStage();
  },
  /** 達成を送る (手順と沼も。サーバーが種と手の数を確かめ、時間を測る) */
  async send(): Promise<void> {
    if (!run.value || !result.value || sending.value) return;
    sending.value = true;
    error.value = null;
    try {
      const plan = craftStage.plan();
      const r = await post<{ ms: number; best: boolean; rank: number | null; first: boolean }>("/challenge/finish", {
        run: run.value, uid: webUid(), nick: webName.value.trim(), steps: result.value.steps, cost: result.value.cost, plan, swamp: result.value.swamp,
      });
      result.value = { ...result.value, ms: r.ms, best: r.best, rank: r.rank, first: r.first };
      run.value = null;
      write(DONE_KEY, day.value);
      doneDay.value = day.value;
      void challenge.loadBoard();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally { sending.value = false; }
  },
  /** 達成の後に順位の画面へ (結果は残す。もう一度は「挑戦する」から、時間は 0 から) */
  again(): void {
    run.value = null;
    startedAt.value = null;
    phase.value = "intro";
    leaveStage();
  },
  /** 今日と昨日の順位 */
  async loadBoard(): Promise<void> {
    const [a, b] = await Promise.all([fetchBoard(day.value), fetchBoard(prevDay(day.value))]);
    board.value = a;
    yesterday.value = b;
  },
  /** 順位の行の手順を 1 手ずつ見る (自分の打ちかけは覚えておき、閉じたら戻す)。今日の分は今日 1 回達成してから */
  async watch(d: string, row: BoardRow): Promise<void> {
    if (d === day.value && doneDay.value !== day.value) return;
    try {
      const r = await fetch(`${CHALLENGE_API_BASE}/challenge/plan?day=${d}&id=${row.id}&uid=${encodeURIComponent(webUid())}`, { credentials: "omit" });
      const j = (await r.json()) as { plan?: CraftStagePlan; error?: string };
      if (!j.plan) { error.value = j.error ?? String(r.status); return; }
      if (!watching.value) mine = craftStage.snapshot();
      watching.value = { id: row.id, nick: row.nick, day: d };
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
  /** ページを離れる時 (普段のクラフトステージへ) */
  leave(): void {
    challenge.stopWatching();
    if (phase.value !== "done") challenge.giveUp();
    else challenge.again();
  },
};

// 狙いが全部揃ったら達成 (その時点の手数・費用・沼で止めて、すぐ送る)
watch(() => craftStage.item.value, (it) => {
  const c = daily.value;
  if (!it || !c || phase.value !== "play" || watching.value) return;
  if (aimDone(it, c.targets)) {
    phase.value = "done";
    result.value = { steps: craftStage.log.value.length, cost: craftStage.total.value, swamp: countSwamp(craftStage.log.value, c.targets, CHALLENGE_RESETS - resetsLeft.value), ms: null };
    void challenge.send();
  }
});
