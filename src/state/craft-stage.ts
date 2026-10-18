/**
 * craft-stage.ts — クラフトステージの画面の状態 (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)
 *
 * オーナー:「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」
 * 「操作は Craft of Exile 仕様 (アイコンを持ってアイテムをクリック)」「カレンシーっていうかクラフトに使える奴全部」。
 *   - 手で打つ: 棚の物を持って (held) アイテムを押すと 1 手。お告げは押すと「掛けておく」(何枚でも)。次の手に関係する物だけ食う。
 *     seed は 開始の seed + 手の番号 なので、打った手をそのまま手順 JSON にして scripts/craft-stage-run.mjs に流すと同じ結果になる
 *   - 冒涜: 骨で未発現の MOD が付き、発現の候補 3 つ (revealOffers) から選ぶと reveal:N の手になる
 *   - 再生: 手順 JSON と step (URL の ?stage-plan=…&step=N) で、その手まで進めた状態を出す (POE2Tube の撮影用)
 *   - 動画モード: 打った手 (か手順 JSON) を 16:9 の撮影用画面で 1 手ずつ再生する ([[VideoStage.vue]])。
 *     URL に &video=1 を付けると最初から動画モード (step=N でその手から、autoplay=1 で自動再生、controls=0 で操作欄を出さない、
 *     layout=clip で撮影用のすっきりレイアウト)
 * 1 手の中身は services/craft-stage (計算機と同じ規則)。棚・名前・値段は [[craft-stage-shelf.ts]]。
 */
import { playSfx, playUseSfx } from "../utils/sfx";
import { isRareChance } from "../utils/format-pct";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { OMEN_EXCLUSIVE } from "../services/craft-stage/omens";
import type { Pattern } from "../services/craft-stage/pattern";
import { recordHistory } from "../services/history";
import { computed, ref, shallowRef, watch, type Ref, type WritableComputedRef } from "vue";
import { htcBaseInfo, loadHtcPatch } from "../services/htc/patch";
import { REC_START, recNext } from "../utils/rec-mode";
import { extraFromUrl, videoFromUrl, type StageExtra } from "./stage-extra";
export type { ResistsBlock, StageExtra } from "./stage-extra";
import { simPicked, simShowMods, simSockets, simStart, simStartItem, simPendingRecipe, simStartCost, simTargets, simAltFor, simOrder, simPatterns, simPlayLeft, simQuizActive } from "./sim-state";
export type { SimStart, SimTargets } from "./sim-state";
import { aims, aimPicker, modJump, modOverlay } from "./aim-state";
export { AIM_MAX, type AimPick } from "./aim-state";
import { fullSockets, planStepOf, type PlanStep } from "./stage-steps";
export * from "./sim-recipes";
/** ?base=<英語名> (ベースの読み物のページから来た時)。録画モードの base= とは別 */
export const URL_BASE: string | null = (() => { try { return new URLSearchParams(location.search).get("base"); } catch { return null; } })();
import { loadCurrencyHover } from "../services/currency/currency-hover";
import { applyCurrency, omensFor } from "../services/craft-stage/apply-currency";
import { revealOffers, unrevealedOf } from "../services/craft-stage/apply-desecrate";
import { freshItem, playPlan, playStep, resultOf, startFrom, type PlayedStep, type StartSpec } from "../services/craft-stage/run-plan";
import type { Force } from "../services/craft-stage/stage-core";
import { mulberry32 } from "../services/htc/rng";
import { logRecord } from "../utils/log-record";
import { marketStore } from "./market-store";
import { BONES, CATALYSTS, iconOfKey, nameOfKey, OMEN_GROUPS, ORBS, priceOfKey } from "./craft-stage-shelf";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem, StageMod } from "../services/craft-stage/types";
import type { CraftStagePlan } from "../services/craft-stage/contract";
import type { PobBlock } from "../services/craft-stage/stage-pob";
import { tr, lang } from "../i18n/lang";
import { decodeShare, SHARE_ENABLED, shareBlock, shareCodeOf } from "../services/craft-stage/share";
import { trackOnce } from "../utils/track";
import { methodOfTarget, quizFromSim } from "../services/craft-stage/quiz-build";
import { nextMove, type QuizRecipe } from "../services/craft-stage/quiz-recipe";

const data = shallowRef<PatchData | null>(null);
/**
 * 遊んでいる中身の置き場: emu = エミュレーター、lesson = チュートリアル (2026-10-18 オーナー「エンジンは同じでも完全に分離」)。
 * アイテム・工程・ベース・持っている物・お告げ・乱数などは 2 組あり、外からは今の置き場の方を読み書きする (dual)。
 * データ・モードのタブ・表示の設定・シミュレーターは 1 つ (共通)。チュートリアルの間は emu_use と履歴を記録しない
 */
const play = ref<"emu" | "lesson">("emu");
function dual<T>(make: () => Ref<T>): WritableComputedRef<T> {
  const emu = make(), lesson = make();
  return computed({ get: () => (play.value === "lesson" ? lesson : emu).value, set: (v) => { (play.value === "lesson" ? lesson : emu).value = v; } });
}
const item = dual(() => shallowRef<StageItem | null>(null));
const log = dual(() => shallowRef<PlayedStep[]>([]));
const held = dual(() => ref<string | null>(null));
/** 掛けてあるお告げ。omenKeep = 打っても外さない (使った分の費用は毎回。2026-10-17 要望 aef329b8「削減のお告げを ON にしたままカオス連打」) */
const omens = dual(() => ref<string[]>([]));
// 2026-10-18 オーナー「デフォで打ってもお告げは外さない、チェックはもういらない」で既定にした (切り替えの OmenKeepToggle は外した)。外すのはお告げをもう一度押す
const omenKeep = ref(true);
const seed = dual(() => ref(0));
/**
 * 次の手の乱数 (2026-10-09 オーナー「1 戻すと次も同じ。1 戻したら次の MOD はまた新しい変数で」「ヒネコラの予見が固定値」)。
 * 前は「最初の seed + 何手目か」で決まり、戻して打ち直すと同じ結果・予見はどのカレンシーでも同じ乱数だった。
 * 打った後と戻した後に引き直す。カレンシーごとに混ぜる (予見で高貴・上級・完全を持ち替えると別の結果)。発現は候補を出した時と同じ乱数 (stepSeedFor)
 */
const rollSeed = dual(() => ref(freshSeed()));
function freshSeed(): number {
  // 録画モードの種 (?rec=1&seed=) があれば種から決める (POE2Tube 要望 ㊷)
  const r = recNext();
  if (r != null) return r;
  try { return crypto.getRandomValues(new Uint32Array(1))[0]! % 2_147_483_647; } catch { return Math.floor(Math.random() * 2_147_483_647); }
}
/** その手の乱数 (カレンシーのキーを混ぜる。発現は混ぜない = 出した候補のまま) */
function stepSeedFor(key: string): number {
  return seedOfRoll(rollSeed.value, key);
}
/** 乱数の元 (rollSeed) とキーからその手の乱数 (チュートリアルが成功例を先に探す時にも使う。craft-lesson.ts) */
export function seedOfRoll(roll: number, key: string): number {
  if (key.startsWith("reveal")) return roll;
  let h = roll ^ 0x9e3779b9;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return h % 2_147_483_647;
}
const error = dual(() => ref<string | null>(null));
/** 再生モード (URL の手順)。手で打つ操作は止める */
/** shared = 共有の URL (#share=) から開いた ([[share.ts]])。手を前後に送れて、「ここから打つ」で手で打つ方へ続けられる */
const replay = ref<{ plan: CraftStagePlan; step: number; shared?: boolean } | null>(null);
/** 録画モードで URL の最初の状態 (base / ilvl / hands) を入れた (画面はベース選びを開かずに始める。POE2Tube 要望 ㊷) */
const recPreset = ref(false);
const base = dual(() => ref("Gold Ring"));
const itemLevel = dual(() => ref(82));
/** 動画モード (開始の手・自動再生・操作欄) */
/**
 * 動画モード (開始の手・自動再生・操作欄・見た目)。layout "clip" は POE2Tube の撮影用 (要望 ⑤、2026-09-28):
 * アイテム + 棚だけを大きく、見出し・右の欄・進行バー無し、下 15% 空け (結果の文字を重ねる所)
 */
/** offers = 発現の手で止めた時に候補 3 つを出したままにする (URL の offers=1、POE2Tube 要望 ㉕-3) */
/**
 * animT = 手つきを時刻で止める (URL の anim_t=<ミリ秒> か end、POE2Tube 要望 ㉖)。step 手目の手つきを始まりからその時刻まで進めた絵で止める。
 * 時刻の情報は window.__stageAnim ([[anim-clock.ts]])
 */
const video = ref<{ from: number; autoplay: boolean; controls: boolean; layout?: "default" | "clip"; offers?: boolean; animT?: number | "end" | "pick" | null } | null>(null);
const extra = ref<StageExtra | null>(null);

/** スポットライト (URL の focus=<MOD の id か系統>)。動画モードのアイテム枠でその行だけ光らせる */
const focus = ref<string | null>(null);
/** MOD の横にタグの札を出す (URL の tags=1、POE2Tube 要望 ㉔-5)。ゲームの中では見えないので動画で「データサイトで確認」と言う用 */
const showTags = ref(false);
/** PoB の計算 (要望 ⑰-3、URL の stage-pob=<結果 JSON の pob>)。動画モードで手ごとの DPS を出す */
const pob = shallowRef<PobBlock | null>(null);
/**
 * 始めの状態に付けた MOD (要望 ⑱-2、オーナー「指定 MOD 選んでからそこからクラフトできるように、動画用として」)。
 * まだ 1 手も打っていない間だけ、MOD 一覧から足せる。手順 JSON の start.mods に書き出す
 */
const startMods = dual(() => ref<Force[]>([]));
/**
 * シミュレーションのタブ (2026-10-05、実験): 画面の切り替えと、狙いの MOD (MOD の一覧の段の表の「狙う」で足す)。
 * minTierIndex はエンジンの段の番号 (0 = 一番下、T1 = tiers.length - 1)。[[stage-sim.ts]]
 */
/** hand = エミュレーター、sim = シミュレーター、tutorial = クイズのチュートリアル (2026-10-16、開発版だけ) */
const mode = ref<"hand" | "sim" | "tutorial">("hand");
/**
 * Web 版はシミュレーションを閉じる (2026-10-10 オーナー「未完成すぎるからシミュレーションは調整中って出してクリックできないように、ウェブ版」)。
 * タブは「調整中」で押せず、前に開いていた・URL・はじめの窓から入っても手で打つ方に戻す
 */
// 開発版 (pnpm dev:web) では開ける (クイズのレシピをオーナーに触ってもらう。リリースはオーナーの OK まで閉じたまま、2026-10-12)
export const SIM_LOCKED = !isTauriRuntime() && !import.meta.env.DEV; // 非公開の開発版も本番と同じく閉じる (2026-10-17 オーナー「シミュレーターはまだ、本番と合わせんとややこしい」)。手元の dev だけ開く
// チュートリアルは 2026-10-17 に一度出して、同じ日に取り下げた (オーナー「白紙、動画のクラフトを難しさ順に 1 から作らせる形に作り直す」)
export const TUTORIAL_LOCKED = false; // 2026-10-17 本番に出した (コースは StageCourses.vue の RELEASED だけ)
watch(mode, (m) => { if ((SIM_LOCKED && m === "sim") || (TUTORIAL_LOCKED && m === "tutorial")) mode.value = "hand"; }, { immediate: true, flush: "sync" });

/** Web 版の工程を覚える手の数 */
export const LOG_KEEP = 50;
/**
 * 50 手より前に消した手の、手順 JSON に書く分だけ (重い打つ前 / 後のアイテムは持たない)。
 * 消した手も手順に要る (無いと再生で始めの方の手が抜け、送った人のアイテムにならなかった。2026-10-16 要望 0ce15a82 の決闘のワンド)
 */
const dropped = dual(() => shallowRef<Array<{ step: PlanStep; index: number }>>([]));
/** エミュレーターで再生するクイズのレシピ (開いているパターン、無ければ答えのある最初のパターン)。今のベースと狙う MOD で組む */
const handQuiz = computed<QuizRecipe | null>(() => {
  const d = data.value;
  if (!d || !simTargets.value.length) return null;
  const has = (p: Pattern): boolean => !!p.quiz && Object.values(p.quiz.rules).some((r) => r.length > 0);
  const p = simPatterns.value.find((x) => x.name === simQuizActive.value && has(x)) ?? simPatterns.value.find(has);
  if (!p?.quiz) return null;
  return quizFromSim({ data: d, base: base.value, itemLevel: itemLevel.value, start: "white", startPrice: 0, targets: simTargets.value.map((t) => ({ ...t, method: methodOfTarget(d, t) })) }, p.quiz).recipe;
});

/** 手で打って打てなかった時の知らせ (工程には積まない。画面は震えて理由を出す) */
const miss = dual(() => ref<{ n: number; reason: string } | null>(null));

export const priceOf = (key: string): number => priceOfKey(key, item.value);
export const iconOf = (key: string): string => iconOfKey(key, item.value);
export const nameOf = (key: string): string => nameOfKey(key, item.value);
/** 手順の記録のカレンシー名・お告げ名 (記録の currency_ja / omen_ja は日本語のまま残すので、英語の画面ではキーから引く。2026-10-10) */
export const stepNameOf = (o: { currency: string; currency_ja: string }): string => (lang.value === "en" ? nameOf(o.currency) : o.currency_ja);
export const stepOmenOf = (o: { omen?: string | null; omen_ja?: string | null }): string | null => (!o.omen ? null : lang.value === "en" ? o.omen.split("+").map(nameOf).join(" · ") : o.omen_ja ?? null);

function newSeed(): number {
  const r = recNext();
  if (r != null) return r;
  return Math.floor(Date.now() % 1_000_000_000);
}
/** 手順・再生で値段を引くキー全部 (相場 JSON 用) */
function priceKeysAll(): string[] {
  return [...ORBS.flatMap((g) => g.keys), ...BONES, ...CATALYSTS, ...OMEN_GROUPS.flatMap((g) => g.keys), ...log.value.map((s) => s.out.currency)];
}

/**
 * 打てるか = ゲームが右クリックを受け付けるか。打つ前に分かる条件 (部位・レア度・コラプト・空き枠・お告げの前提など) だけで決め、
 * 当たり所で弾かれる物 (skipRandom、apply の random) は打てる扱い。結果は押した時に決まる
 * (2026-10-12 オーナーの方針「結果をリークしない、ゲームと同じく自由に」[[feedback-game-rules-as-written]]。
 * 要望 541d2ae1 / 1b901ac5: 軽蔑を外してプレが 3 つのルビーで、カオスと液化した感情が「使用可能」から消えていた)
 */
function usableWith(key: string, om: readonly string[]): string | null {
  if (!data.value || !item.value) return tr("読み込み中…", "Loading…");
  const r = applyCurrency(data.value, item.value, key, mulberry32(0), om);
  return r.applied || r.random ? null : (r.reason ?? tr("打てない", "Can't use"));
}
export const craftStage = {
  play, data, item, log, held, omens, omenKeep, seed, rollSeed, error, replay, recPreset, base, itemLevel, miss, video, extra, focus, showTags, pob, startMods, mode, simTargets, simPicked, simShowMods, simAltFor, simSockets, simStart, simStartItem, simStartCost, simPendingRecipe, simOrder, simPatterns, simPlayLeft, simQuizActive, handQuiz, aims, aimPicker, modJump, modOverlay,
  ready: computed(() => !!data.value && !!item.value),
  /** 累計の費用 (高貴) */
  total: computed(() => { const l = log.value; return l.length ? l[l.length - 1]!.out.cost.cumulative : 0; }),
  /** 直前の手 */
  last: computed(() => log.value[log.value.length - 1] ?? null),
  /** 発現の候補 (未発現の冒涜 MOD がある時。次の手の乱数で引くので、選んだ手の結果と一致する) */
  offers: computed(() => {
    if (!data.value || !item.value || !unrevealedOf(item.value)) return null;
    return revealOffers(data.value, item.value, mulberry32(stepSeedFor("reveal")));
  }),

  /**
   * ヒネコラの髪束の予見: 予見できるアイテムでカレンシーを持っている時、打った時の結果 (次の手の seed で引くので、打つとこの通りになる)
   */
  foresight: computed(() => {
    const it = item.value;
    const key = held.value;
    if (!data.value || !it?.foreseen || !key || key === "hinekora") return null;
    // 手の番号は前の手の続き (Web は 50 手より前を消すので、log の長さでは数えない)。乱数は次の手と同じ (カレンシーごと)
    const index = (log.value[log.value.length - 1]?.out.index ?? 0) + 1;
    const want = omensFor(key, omens.value);
    const p = playStep(data.value, it, key, { index, seed: stepSeedFor(key), price: () => 0, cumulative: 0, omen: want.length ? want.join("+") : null });
    return { key, applied: p.out.applied, reason: p.out.reason ?? null, added: p.added.map((m) => m.textJa), removed: p.removed.map((m) => m.textJa), after: p.after };
  }),

  async init(): Promise<void> {
    if (data.value) return;
    try {
      data.value = await loadHtcPatch();
      void loadCurrencyHover(); // 棚の詳細カードの公式の説明 (約 330KB、使う時に読む)
      const market = marketStore.ensureMarket();
      const q = new URLSearchParams(location.search);
      const raw = q.get("stage-plan");
      focus.value = q.get("focus");
      showTags.value = q.get("tags") === "1";
      extra.value = extraFromUrl(q);
      if (q.get("stage-pob")) pob.value = JSON.parse(q.get("stage-pob")!) as PobBlock;
      // 再生は費用も出すので相場を待つ (手で打つ時は待たない。値段は打った時に引く)
      if (raw) await market;
      const step = Number(q.get("step") ?? "9999");
      const wantVideo = q.get("video") === "1";
      // 動画モードは手順を最後まで打っておき、step の手から見せる (前後に動かせるように)
      // 共有の URL (#share=…、2026-10-12)。# は読んだら消す (打ち始めた後に読み直して共有の手順に戻らないように)
      const shared = raw || !SHARE_ENABLED ? null : shareCodeOf(location.hash);
      if (raw) craftStage.loadReplay(JSON.parse(raw) as CraftStagePlan, wantVideo ? 9999 : step);
      else if (shared) {
        try { history.replaceState(null, "", location.pathname + location.search); } catch { /* 消せなくても開く */ }
        craftStage.reset();
        try {
          const plan = await decodeShare(shared);
          await market;
          craftStage.loadReplay(plan, 9999, true);
          trackOnce("share:open");
        } catch (e) {
          error.value = tr(`共有の手順が読めませんでした (${e instanceof Error ? e.message : String(e)})`, `Couldn't open the shared steps (${e instanceof Error ? e.message : String(e)})`);
        }
      } else craftStage.reset();
      // ベースの読み物のページ (/bases/…) の「エミュレーターで試す」(?base=<英語名>、2026-10-13): そのベースの白から始める
      if (!raw && !shared && !REC_START && URL_BASE && data.value && htcBaseInfo()[URL_BASE]) {
        base.value = URL_BASE;
        mode.value = "hand";
        craftStage.reset();
        // 開いた後は URL から外す (読み直すたびに白に戻らないように)
        try { const u = new URL(location.href); u.searchParams.delete("base"); history.replaceState(null, "", u.pathname + u.search + u.hash); } catch { /* 外せなくても開く */ }
        void import("./spam-share-open").then((m) => m.openSharedSpam()); // X のシェアから: 同じカオススパム計算機を開く (?spam=)
      }
      // 録画モードの最初の状態 (?rec=1&base=&ilvl=&hands=、POE2Tube 要望 ㊷): 準備の手まで URL で済ませる
      if (!raw && !shared && REC_START && data.value) {
        if (REC_START.base && htcBaseInfo()[REC_START.base]) base.value = REC_START.base;
        if (REC_START.ilvl) itemLevel.value = REC_START.ilvl;
        craftStage.reset();
        recPreset.value = true;
        for (const k of REC_START.hands) craftStage.use(k);
        held.value = null;
      }
      if (raw && wantVideo) video.value = videoFromUrl(q, step, log.value.length);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  /**
   * 始めの状態に MOD を 1 つ足す (まだ 1 手も打っていない間だけ)。付きうる物だけ (付かなければ理由を震えで出す)。
   * 3 つ目からはレア、それまではマジック
   */
  addStartMod(f: Force): void {
    if (!data.value || log.value.length || replay.value) return;
    // 50 手より前に消した手 (dropped) が残っている時は、工程を全部戻しても「打つ前」ではない。始めの MOD を足すと、手順 (始めの MOD + 消した手) と
    // 今のアイテム (始めの MOD だけ) が食い違う (2026-10-16 要望 0ce15a82 の調べで見つけた)
    if (dropped.value.length) { miss.value = { n: (miss.value?.n ?? 0) + 1, reason: tr("50 手より前の手が残っているので、始めの MOD は足せません (白に戻してから)", "Earlier steps (before the last 50) remain, so starting mods can't be added (reset first)") }; return; }
    const next = [...startMods.value, f];
    try {
      item.value = fullSockets(startFrom(data.value, base.value, itemLevel.value, { mods: next }, seed.value - 1));
      startMods.value = next;
    } catch (e) {
      miss.value = { n: (miss.value?.n ?? 0) + 1, reason: e instanceof Error ? e.message.replace(/^始めの状態の MOD \d+ つ目: /, "") : String(e) };
    }
  },
  /** 白の新品から (ベース・アイテムレベルを変えた時も)。始めの MOD も外す */
  reset(): void {
    if (!data.value) return;
    try {
      startMods.value = [];
      log.value = [];
      dropped.value = [];
      omens.value = [];
      seed.value = newSeed();
      // 値を振る種は再生 (手順 JSON・共有) と同じ seed − 1 (前は前の seed のままで、再生とユニークの数値がずれた)
      item.value = { ...fullSockets(freshItem(data.value, base.value, itemLevel.value)), rollSeed: seed.value - 1 };
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  /** その状態で打てるか (打てないなら理由)。掛けてあるお告げ込み */
  usable(key: string): string | null {
    return usableWith(key, omens.value);
  },
  /** お告げを抜きにして打てるか (掛けたままのお告げのせいで打てない物を棚から消さないため。2026-10-10「錬金の後に高貴が打てない」) */
  usableBare(key: string): string | null {
    return usableWith(key, []);
  },
  /** 持っている物を 1 回打つ (Craft of Exile と同じ: 持ったままなら何度でも) */
  use(key: string | null = held.value, opts: { quiet?: boolean } = {}): void {
    if (!key || !data.value || !item.value || replay.value) return;
    const why = craftStage.usable(key);
    if (why) {
      miss.value = { n: (miss.value?.n ?? 0) + 1, reason: why };
      return;
    }
    // 手の番号は前の手の続き (Web は 50 手より前を消すので、log の長さで数えると 51 手目から止まり、毎回同じ乱数になっていた)
    const index = (log.value[log.value.length - 1]?.out.index ?? 0) + 1;
    const want = omensFor(key, omens.value);
    const p = playStep(data.value, item.value, key, {
      index, seed: stepSeedFor(key), price: priceOf, cumulative: craftStage.total.value, omen: want.length ? want.join("+") : null,
    });
    rollSeed.value = freshSeed();
    // Web 版は工程を 50 手まで覚え、それより前は消す (データが長くなりすぎる。2026-10-08 オーナー「50 手まで保存でそれ以降は消そうか」)。
    // アプリは手順 JSON (POE2Tube の再生) に全部の手が要るので消さない
    if (!isTauriRuntime() && log.value.length >= LOG_KEEP) {
      const cut = log.value.slice(0, log.value.length - (LOG_KEEP - 1));
      dropped.value = [...dropped.value, ...cut.map((s) => ({ step: planStepOf(s), index: s.out.index }))];
      log.value = [...log.value.slice(-(LOG_KEEP - 1)), p];
    } else log.value = [...log.value, p];
    item.value = p.after;
    // 分析用の記録 (2026-10-09): 打つ前の MOD・打った物・お告げ・付いた / 消えた MOD
    const ms = (l: readonly StageMod[]): string[] => l.map((m) => `${m.modId}#${m.tierIndex}${m.fractured ? "f" : ""}${m.desecrated ? "d" : ""}`);
    // カオススパム (chaos-spam.ts) は 1 回ごとには送らない (何千回にもなる。スパムの終わりに 1 件だけ送る)
    // チュートリアルの手は記録しない (2026-10-18 オーナー「チュートリアルの手はいらない」。PV は visit・screen、コースは tutorial の記録で見る)
    if (!opts.quiet && play.value === "emu") logRecord("emu_use", { base: base.value, ilvl: itemLevel.value, rarity: p.before.rarity, before: ms([...p.before.prefixes, ...p.before.suffixes]), use: key, omens: want, added: ms(p.added), removed: ms(p.removed), ok: p.out.applied, cost: p.out.cost?.subtotal ?? null, baseJa: p.before.baseJa, useJa: p.out.currency_ja });
    // 使った時の音 (ゲームと同じ。珍しい段なら神のオーブの音)。カオススパム (quiet) では鳴らさない
    if (!opts.quiet && p.out.applied) playUseSfx(key, Object.values(p.chances ?? {}).some(isRareChance));
    if (!opts.quiet && play.value === "emu") recordHistory("craft-stage", "use", { base: base.value, itemLevel: itemLevel.value, seed: seed.value, startMods: startMods.value, out: p.out, after: p.after });
    // 食ったお告げは外す
    const ate = p.out.omen ? p.out.omen.split("+") : [];
    if (ate.length && !omenKeep.value) omens.value = omens.value.filter((o) => !ate.includes(o));
  },
  /**
   * クイズのレシピで 1 手 (ADR-003): 今のアイテムに当たる答えを打つ (お告げは答えの物に掛け替える)。
   * 返り値 = 画面に出す一言 (完成 / 答えが無い / 打った答え)。null = 打った
   */
  recipeStep(): { done: boolean; stop: boolean; text: string } {
    const d = data.value, it = item.value, recipe = handQuiz.value;
    if (!d || !it || !recipe || replay.value) return { done: false, stop: true, text: tr("レシピが無い", "No recipe") };
    const mv = nextMove(d, recipe, it, stepSeedFor("reveal"));
    if (mv.done) return { done: true, stop: true, text: tr("完成", "Done") };
    if (!mv.key) return { done: false, stop: true, text: tr("この状態の答えが無い (シミュレーターのクイズで答える)", "No answer for this state (answer it in the Simulator quiz)") };
    if (mv.key === "restart") { craftStage.reset(); return { done: false, stop: false, text: tr("買い直して最初から", "Started over with a new base") }; }
    // Web は工程を 50 手で切るので、数ではなく最後の手が変わったかで見る
    const before = log.value[log.value.length - 1];
    omens.value = [...mv.omens];
    craftStage.use(mv.key);
    if (log.value[log.value.length - 1] === before) { omens.value = []; return { done: false, stop: true, text: miss.value?.reason ?? tr("打てない", "Can't use") }; }
    return { done: false, stop: false, text: [nameOf(mv.key), ...mv.omens.map((o) => nameOf(o))].join(" + ") };
  },
  /** 1 手戻す (その手で食ったお告げは掛け直す) */
  undo(): void {
    const l = log.value;
    // まだ打っていない時は、始めの MOD を 1 つ外す。50 手より前に消した手 (dropped) が残っている時は打った後なので外さない
    // (外すとアイテムは白 + 始めの MOD に戻るのに、手順には消した手が残り、再生すると別物になった。2026-10-16 要望 0ce15a82 の調べ)
    if (!l.length && dropped.value.length) return;
    if (!l.length && startMods.value.length && data.value && !replay.value) {
      startMods.value = startMods.value.slice(0, -1);
      // ソケットも付ける時と同じに (外すと規格外のソケットが消えていた。2026-10-08 使い倒しテスト)
      item.value = fullSockets(startFrom(data.value, base.value, itemLevel.value, { mods: startMods.value }, seed.value - 1));
      return;
    }
    if (!l.length || replay.value) return;
    const last = l[l.length - 1]!;
    item.value = last.before;
    log.value = l.slice(0, -1);
    // 戻したら次の手は新しい乱数で (同じ手を打ち直しても同じ結果にならない)
    rollSeed.value = freshSeed();
    const ate = last.out.omen ? last.out.omen.split("+") : [];
    omens.value = [...new Set([...omens.value, ...ate])];
  },
  /**
   * 履歴の手 (out.index) を打った直後に戻す (2026-10-09 オーナー「工程クリックしてもそこの工程に戻れない」)。
   * 1 手戻すを後ろから繰り返すだけ (食ったお告げの掛け直し・次の乱数の引き直しも同じ)。この後に打てば、その先の手は捨てる
   */
  goTo(index: number): void {
    if (replay.value || !log.value.some((s) => s.out.index === index)) return;
    while (log.value.length && log.value[log.value.length - 1]!.out.index !== index) craftStage.undo();
  },
  /** 1 手も打っていない状態に戻す (履歴の「始め」の行)。始めの MOD は外さない */
  goToStart(): void {
    if (replay.value) return;
    while (log.value.length) craftStage.undo();
  },
  hold(key: string | null): void {
    held.value = key;
  },
  /**
   * カオススパムの前の状態を控える / 戻す (2026-10-16 カオススパムモード)。スパムは何百手にもなり、工程は 50 手で古い方が消えるので、
   * 1 手戻すではなく「スパムの前に戻す」で丸ごと戻す (アイテム・工程・消えた工程・お告げ)
   */
  snapshot(): { item: StageItem | null; log: typeof log.value; dropped: typeof dropped.value; omens: string[] } {
    return { item: item.value, log: log.value, dropped: dropped.value, omens: omens.value };
  },
  restore(snap: { item: StageItem | null; log: typeof log.value; dropped: typeof dropped.value; omens: string[] }): void {
    if (replay.value) return;
    item.value = snap.item;
    log.value = snap.log;
    dropped.value = snap.dropped;
    omens.value = snap.omens;
    rollSeed.value = freshSeed();
  },
  /** お告げを掛ける / 外す。一緒に掛けられない組 (OMEN_EXCLUSIVE: 左と右・勢力 2 枚など) は、前の方を外して掛け替える */
  toggleOmen(id: string): void {
    if (omens.value.includes(id)) { omens.value = omens.value.filter((o) => o !== id); return; }
    const rivals = new Set(OMEN_EXCLUSIVE.filter((g) => g.includes(id)).flat());
    omens.value = [...omens.value.filter((o) => !rivals.has(o)), id];
    // 掛けた時の音 (ゲームのお告げを使った時の Item_Omen_Use_01。2026-10-16)
    playSfx("omen");
  },
  /** 今までの手を手順 JSON に (同じ seed なので CLI に流すと同じ結果) */
  plan(): CraftStagePlan {
    return {
      schema: "craft-stage-plan/1",
      title: null,
      base: base.value,
      item_level: itemLevel.value,
      start_rarity: "normal",
      start_paste: null,
      // 始めの状態: MOD (要望 ⑱-2) と、手で打つ画面が始めに開けているソケット (規格外。書かないと再生でルーンが打てない、2026-10-10 点検)
      ...(() => {
        const sockets = data.value ? fullSockets(freshItem(data.value, base.value, itemLevel.value)).sockets ?? 0 : 0;
        const start: StartSpec = { ...(startMods.value.length ? { mods: startMods.value } : {}), ...(sockets ? { sockets } : {}) };
        return Object.keys(start).length ? ({ start } as object) : {};
      })(),
      seed: seed.value,
      // 手ごとの乱数 (seed) も書く (2026-10-09 から手ごとに新しい乱数。再生はこれを使う。追加のキー = outcome / pick と同じ扱い)
      // カタリストは手で打つと 1 個 +1〜2%、再生は 1 手 = 1 個 (+1%)。上げた分の回数で書く (2026-10-10 点検: 再生で品質が違った)
      // Web で 50 手より前に消した手も頭に付ける (dropped)
      steps: (log.value.length || dropped.value.length ? [...dropped.value.map((d) => d.step), ...log.value.map(planStepOf)] : [{ currency: "transmute", omen: null, times: 1, note: null }]) as CraftStagePlan["steps"],
    };
  },
  /** 結果 JSON (今の相場の値段で) */
  result(version: string): unknown {
    if (!item.value) return null;
    return resultOf(replay.value?.plan ?? craftStage.plan(), log.value, item.value, {
      prices: {}, exiledeskVersion: version, patch: "0.5.0", league: marketStore.league.value?.Value ?? null,
    }, data.value ?? undefined);
  },
  /** CLI (craft-stage-run.mjs --prices) に渡す相場 (高貴建て) */
  prices(): Record<string, number> {
    return Object.fromEntries(priceKeysAll().map((k) => [k, priceOf(k)]).filter(([, v]) => (v as number) > 0));
  },
  /**
   * 共有できない理由 (できるなら null)。最初のカレンシーの後に手で MOD を足していたら共有できない ([[share.ts]])。
   * 再生中 (共有の URL から開いた時も) はその手順をそのまま渡せる
   */
  shareWhy: computed((): string | null => (replay.value ? null : shareBlock([...dropped.value.map((d) => ({ currency: d.step.currency, index: d.index })), ...log.value.map((s) => ({ currency: s.out.currency, index: s.out.index }))]))),
  /** 共有する手順 (再生中はその手順を全部) */
  sharePlan(): CraftStagePlan {
    return replay.value?.plan ?? craftStage.plan();
  },
  /** 再生の手を送る (0 = 始め、手順の手の数まで) */
  replayTo(step: number): void {
    const r = replay.value;
    if (!r) return;
    const all = r.plan.steps.reduce((n, s) => n + (s.times ?? 1), 0);
    craftStage.loadReplay(r.plan, Math.max(0, Math.min(all, step)), r.shared);
  },
  /** 再生の手の数 (times 込み) */
  replayLength: computed(() => replay.value?.plan.steps.reduce((n, s) => n + (s.times ?? 1), 0) ?? 0),
  /**
   * 再生している今の手から、手で打つ方へ続ける (共有の手順の続きを自分で打つ)。工程はそのまま残るので 1 手戻す・工程を押して戻るもそのまま使える
   */
  continueFromReplay(): void {
    const r = replay.value;
    if (!r) return;
    startMods.value = (r.plan as { start?: StartSpec }).start?.mods ?? [];
    omens.value = [];
    held.value = null;
    rollSeed.value = freshSeed();
    replay.value = null;
  },
  /** 再生: 手順 JSON を step 手目まで打った状態 */
  loadReplay(plan: CraftStagePlan, step: number, shared = false): void {
    if (!data.value) return;
    try {
      base.value = plan.base;
      itemLevel.value = plan.item_level ?? 80;
      item.value = freshItem(data.value, plan.base, itemLevel.value);
      const keys = [...new Set([...plan.steps.flatMap((s) => [s.currency, ...(s.omen ? s.omen.split("+") : [])]), ...priceKeysAll()])];
      const prices = Object.fromEntries(keys.map((k) => [k, priceOf(k)]));
      const { steps, final } = playPlan(data.value, plan, prices, step);
      replay.value = { plan, step, ...(shared ? { shared } : {}) };
      seed.value = plan.seed;
      log.value = steps;
      dropped.value = [];
      item.value = final;
      error.value = null;
      recordHistory("craft-stage", "replay", { plan, step, final, steps: steps.map((s) => s.out) });
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  /** 再生をやめて手で打つ */
  leaveReplay(): void {
    replay.value = null;
    craftStage.reset();
  },
};
