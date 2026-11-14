/**
 * feedback-scene.ts — 要望の「送った画面」とその画面のまとめ (U-05e、スイッチ actLog。オーナー 11-14「デイリーやシミュでの要望統一せんとなずっと金の指輪でくるし」)。
 * 前はどのページから送っても本文のまとめ (feedback-summary.ts) をエミュの状態から作ったので、シミュ・デイリーから送るとエミュの始めのベース (金の指輪) が来た。
 * 要望のページは元のページを閉じずに上に重ねる (U-05c) ので、下に残っているページの印から送った画面を決め、まとめをその画面で作る。
 * シミュ・デイリーの木は作りかけの木 (feedback-tree.ts の treeDraft、木が変わってから 1.5 秒で写る) を開いて読むだけ (木の画面のファイルには触らない)。
 * まとめは画面の言語にかかわらず日本語 (受けるのはこちら)
 */
import { craftStage } from "../state/craft-stage";
import { dailyPage, recipesPage, routesOpen, treePage } from "../state/web-page";
import { topic } from "../state/tutorial/craft-topic";
import { course } from "../state/tutorial/craft-course";
import { skinsPage } from "./page";
import { treeDraftNow } from "./feedback-tree";
import { feedbackSummaryJa } from "./feedback-summary";
import { unpackJson } from "../services/craft-stage/share";
import { aimLabel, ESSENCE_KEYS, PRICE_KEYS, tierIndexOf } from "../services/craft-stage/engine";
import type { Aim, Hand } from "../services/simulator/tree/tree-model";
import type { RecipePick } from "../services/simulator/tree/tree-recipe-v1";

export type ScenePage = "emu" | "sim" | "daily" | "routes" | "tutorial" | "recipes" | "skins";
export type DailyState = "playing" | "submitted" | "gaveUp" | "timeUp" | "notYet";
export type Scene = {
  page: ScenePage;
  /** デイリーの見ている所 (一覧・お題・挑戦) とお題 (d<日付>)、挑戦の状態と始めてからの分 */
  daily?: { view: string; topicId: string | null; state: DailyState | null; minutes: number | null };
  /** 木の大きさ (作りかけの木から。手を置いた箱・完成・失敗) と、その木が写ってから何秒か */
  tree?: { picks: number; main: number; fail: number; ageSec: number } | null;
  /** 木を開いた直後の不具合の印 (途中の未設定・開いた直後からある打てない手の数と、開いてから何秒か。U-05f) */
  openIssues?: { midUnset: number; cantUse: number; agoSec: number } | null;
};

/**
 * 木を開いた直後の不具合の印 (U-05f、オーナー 11-14「いやまぁバグ何で変にツリー解体しちゃう前にバグですって要望書かせた方が良い」)。
 * シミュの木の画面が開いた時に、途中の未設定 (手が決まって下も組めているのに印が出た箱) と開いた直後からある打てない手 (S-107c) を数えてここへ書く。
 * 要望の窓が送った画面の欄に添える。どちらも 0・白紙の木は null で消す。開き直すたびに上書き
 */
let openHealth: { midUnset: number; cantUse: number; at: number } | null = null;
export function noteOpenHealth(h: { midUnset: number; cantUse?: number } | null): void {
  const cantUse = h?.cantUse ?? 0;
  openHealth = h && (h.midUnset > 0 || cantUse > 0) ? { midUnset: h.midUnset, cantUse, at: Date.now() } : null;
}

/** 窓の下にある画面 (要望のページを開く前のページ) */
export function scenePage(): ScenePage {
  if (treePage.value) return "sim";
  if (dailyPage.value) return "daily";
  if (recipesPage.value) return "recipes";
  if (skinsPage.value) return "skins";
  if (routesOpen.value) return "routes";
  if (topic.value || course.value || craftStage.mode.value === "tutorial") return "tutorial";
  return "emu";
}

/** エミュの欄 (base・item・hand・今のアイテムのまとめ) を付ける画面 */
export const emuScene = (p: ScenePage): boolean => p === "emu" || p === "routes";

type PackedTree = { base?: string; itemLevel?: number; memoAims?: Aim[]; picks?: RecipePick[] };
/** 作りかけの木を開く (無い・大きすぎる・読めない時は null) */
async function draftTree(): Promise<{ t: PackedTree; ageSec: number } | null> {
  const dr = treeDraftNow();
  if (!dr || !("code" in dr)) return null;
  try {
    const p = (await unpackJson(dr.code)) as { v?: unknown; t?: PackedTree } | null;
    return p?.t && typeof p.t === "object" ? { t: p.t, ageSec: dr.ageSec } : null;
  } catch { return null; }
}

const KEY_JA = new Map<string, string>(
  (["currency", "bones", "omens"] as const).flatMap((g) => Object.entries((PRICE_KEYS as unknown as Record<string, Record<string, { ja?: string }>>)[g] ?? {}).map(([k, v]) => [k, v.ja ?? k] as [string, string])),
);
const keyJa = (k: string): string => KEY_JA.get(k) ?? ESSENCE_KEYS[k]?.ja ?? k;
function handJa(h: Hand): string {
  const om = h.omens?.length ? ` (${h.omens.map(keyJa).join("・")})` : "";
  return `${keyJa(h.currency)}${om}${h.catalyst ? ` + ${keyJa(h.catalyst)}` : ""}${h.repeat ? " を当たりまで繰り返し" : ""}${h.free ? " (狙い無し)" : ""}`;
}
function aimJa(a: Aim): string {
  const data = craftStage.data.value;
  const label = data ? aimLabel(data, { modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier), label: a.modId }) : `${a.modId} (T${a.tier})`;
  return `${label}${a.fractured ? " ✦" : ""}${a.via === "desecrated" ? " (冒涜)" : ""}`;
}

async function dailyOf(): Promise<Scene["daily"]> {
  const v = dailyPage.value;
  if (!v) return undefined;
  const topicId = v.q && /^d\d{4}-\d{2}-\d{2}$/.test(v.q) ? v.q : null;
  if (!topicId) return { view: v.view, topicId: null, state: null, minutes: null };
  // デイリーの控え (端末) は daily-api が持つ。デイリーのページを開いている時はもう読み込まれている
  const { getTry, TIME_LIMIT_MS } = await import("../views/daily/daily-api");
  const t = getTry(topicId);
  if (!t) return { view: v.view, topicId, state: "notYet", minutes: null };
  const minutes = Math.max(0, Math.round((Date.now() - t.startedAt) / 60_000));
  const state: DailyState = t.submitted ? "submitted" : t.ended ? "gaveUp" : Date.now() > t.startedAt + TIME_LIMIT_MS ? "timeUp" : "playing";
  return { view: v.view, topicId, state, minutes };
}

const DAILY_STATE_JA: Record<DailyState, string> = { playing: "挑戦中", submitted: "提出済み", gaveUp: "諦めた", timeUp: "時間切れ", notYet: "まだ挑戦していない" };
const DAILY_VIEW_JA: Record<string, string> = { list: "一覧", detail: "お題", start: "挑戦の画面" };

/** 送った画面とそのまとめ (本文の行)。エミュはエミュのまとめ (今どおり) */
export async function sceneNow(): Promise<{ scene: Scene; summaryJa: string[] }> {
  const page = scenePage();
  if (page !== "sim" && page !== "daily") {
    let summaryJa: string[] = [];
    try { summaryJa = emuScene(page) ? feedbackSummaryJa() : []; } catch { /* まとめが作れなくても送れる */ }
    return { scene: { page }, summaryJa };
  }
  const out: string[] = [];
  const daily = page === "daily" ? await dailyOf().catch(() => undefined) : undefined;
  if (daily) {
    const day = daily.topicId ? `お題 ${daily.topicId.slice(1)}` : "";
    out.push(`デイリー: ${[DAILY_VIEW_JA[daily.view] ?? daily.view, day, daily.state ? DAILY_STATE_JA[daily.state] : "", daily.minutes != null && daily.state === "playing" ? `始めて ${daily.minutes} 分` : ""].filter(Boolean).join(" · ")}`);
  }
  const dr = await draftTree();
  let tree: Scene["tree"] = null;
  if (dr) {
    const { t, ageSec } = dr;
    const picks = t.picks ?? [];
    tree = { picks: picks.filter((p) => p.hand).length, main: picks.filter((p) => p.done === "main").length, fail: picks.filter((p) => p.done === "fail").length, ageSec };
    out.push(`作っている物: ${t.base ?? "?"}${t.itemLevel ? ` · アイテムレベル ${t.itemLevel}` : ""}`);
    const aims = t.memoAims ?? [];
    out.push(aims.length ? `完成形:\n${aims.map((a) => `　${aimJa(a)}`).join("\n")}` : "完成形: まだ決めていない");
    out.push(`木: 手を置いた箱 ${tree.picks} · 完成 ${tree.main} · 失敗 ${tree.fail}${ageSec > 120 ? ` (${Math.round(ageSec / 60)} 分前の木)` : ""}`);
    // 最後に置いた手 = 人が最後に手を置いた時刻 (touched) の一番新しい決め。無ければ並びの最後
    const withHand = picks.filter((p) => p.hand);
    const last = withHand.reduce<RecipePick | null>((a, p) => (!a || (p.touched ?? 0) >= (a.touched ?? 0) ? p : a), null);
    if (last?.hand) out.push(`最後に置いた手: ${handJa(last.hand)}`);
  } else out.push("木: 端末に作りかけの木が無い");
  const openIssues = openHealth ? { midUnset: openHealth.midUnset, cantUse: openHealth.cantUse, agoSec: Math.round((Date.now() - openHealth.at) / 1000) } : null;
  if (openIssues) out.push(`開いた時: 途中の未設定 ${openIssues.midUnset} · 打てない手 ${openIssues.cantUse} (サイトの不具合の印、${openIssues.agoSec >= 60 ? `${Math.round(openIssues.agoSec / 60)} 分前に開いた` : `${openIssues.agoSec} 秒前に開いた`})`);
  return { scene: { page, ...(daily ? { daily } : {}), tree, openIssues }, summaryJa: out };
}
