/**
 * stage-session.ts — 記事など別のページへ行って戻った時に、行く前のクラフト画面をそのまま出す (2026-10-22 オーナー「記事から戻ると必ずベース選択の画面に戻るのは意味わからん。
 * 前のページの状態で戻して。アイコンを押しても」)。ブラウザの戻る・記事のロゴ・ヘッダーの入口のどれで戻っても同じ。
 *
 * 画面を離れる時 (pagehide・見えなくなった時) に sessionStorage (このタブの中だけ、サーバーには送らない) へ写し、次に読み込んだ時に戻す。
 * アイテムと工程は手順 JSON (plan()、手ごとの seed・設定入り) で持ち、戻す時は最後まで再生してから「手で打つ」に続ける (同じアイテム・同じ工程になる)。
 * シミュレーターの狙い・順番などの値も一緒に写す。新しいタブ・初めての人は写しが無いので、これまでどおりの入口。チュートリアルの中身 (lesson) は写さない
 */
import { ref } from "vue";
import { craftStage as s } from "./craft-stage";
import { simStep, type SimStep } from "./web-page";
import type { CraftStagePlan } from "../services/craft-stage/contract";

const KEY = "exiledesk.stage.session.v1";
/** 写したシミュレーターの値 (どれも JSON にできる値) */
const SIM_KEYS = ["simTargets", "simPicked", "simGrant", "simShowMods", "simAltFor", "simSockets", "simStart", "simStartItem", "simStartCost", "simOrder", "simPatterns", "simPlayLeft", "simQuizActive"] as const;
type SimKey = (typeof SIM_KEYS)[number];

interface Snapshot {
  v: 1;
  mode: "hand" | "sim" | "tutorial";
  base: string;
  itemLevel: number;
  /** 工程があれば手順 JSON、無ければ null (ベースだけ選んだ所) */
  plan: CraftStagePlan | null;
  sim: Partial<Record<SimKey, unknown>>;
  simStep: SimStep;
}

/** 写しから戻した (ベース選びを開かない印。use-stage-base.ts が見る) */
export const restoredFromSession = ref(false);

function save(): void {
  try {
    if (s.play.value !== "emu" || s.replay.value || !s.data.value || !s.item.value) return;
    const hasSteps = s.log.value.length > 0;
    const snap: Snapshot = {
      v: 1, mode: s.mode.value, base: s.base.value, itemLevel: s.itemLevel.value,
      plan: hasSteps ? s.plan() : null,
      sim: Object.fromEntries(SIM_KEYS.map((k) => [k, (s[k] as { value: unknown }).value])),
      simStep: simStep.value,
    };
    sessionStorage.setItem(KEY, JSON.stringify(snap));
  } catch { /* 写せなくても動く (次は初めからになるだけ) */ }
}

/** 写しがあれば戻す (データを読んだ後、URL の指定が無い時に init から)。戻したら true */
export function restoreStageSession(): boolean {
  let snap: Snapshot | null = null;
  try { snap = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Snapshot | null; } catch { return false; }
  if (!snap || snap.v !== 1 || !s.data.value) return false;
  try {
    s.mode.value = snap.mode;
    s.base.value = snap.base;
    s.itemLevel.value = snap.itemLevel;
    for (const k of SIM_KEYS) if (k in snap.sim) (s[k] as { value: unknown }).value = snap.sim[k];
    if (snap.plan) {
      s.loadReplay(snap.plan, 9999);
      if (!s.replay.value) return false; // 手順が読めなかった
      s.continueFromReplay();
    } else s.reset();
    simStep.value = snap.simStep;
    restoredFromSession.value = true;
    return true;
  } catch {
    return false;
  }
}

/** Web の入口で 1 回。画面を離れる時に写す */
export function startStageSession(): void {
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
}
