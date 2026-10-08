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
import { isTauriRuntime } from "../utils/isTauriRuntime";
import type { Pattern } from "../services/craft-stage/pattern";
import { recordHistory } from "../services/history";
import { computed, ref, shallowRef } from "vue";
import { loadHtcPatch } from "../services/htc/patch";
import { loadCurrencyHover } from "../services/currency/currency-hover";
import { applyCurrency, omensFor } from "../services/craft-stage/apply-currency";
import { revealOffers, unrevealedOf } from "../services/craft-stage/apply-desecrate";
import { freshItem, playPlan, playStep, resultOf, startFrom, type PlayedStep, type StartSpec } from "../services/craft-stage/run-plan";
import type { Force } from "../services/craft-stage/stage-core";
import { mulberry32 } from "../services/htc/rng";
import { marketStore } from "./market-store";
import { BONES, CATALYSTS, iconOfKey, nameOfKey, OMEN_GROUPS, ORBS, priceOfKey } from "./craft-stage-shelf";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";
import type { CraftStagePlan } from "../services/craft-stage/contract";
import type { PobBlock, PobStat } from "../services/craft-stage/stage-pob";
import { DEF, monsterAccuracy, type DamageKind, type Defender, type Outcome } from "../services/craft-stage/defence";
import { socketCapOf } from "../services/craft-stage/stage-runes";
/**
 * 手で打つ画面の新品は、規格外のソケット数 (熟練工で付けられる数 +1) で始める (2026-10-04 オーナー「オーブ刺すのめんどいから、ソケットも初めからデフォでマックス」)。
 * 手順 JSON の再生 (動画) は手順どおりなので開けない
 */
const fullSockets = (it: StageItem): StageItem => {
  // 規格外 (ドロップで熟練工の上限 +1。胴・両手 3 / ほか 2) で始める (2026-10-05 オーナー「デフォでもう規格外でソケットしていい、ドロップで落ちるソケットをデフォで 2 個以上」)
  const cap = socketCapOf(it.base, it.cls.category);
  const want = cap > 0 ? cap + 1 : 0;
  return want > (it.sockets ?? 0) ? { ...it, sockets: want } : it;
};

const data = shallowRef<PatchData | null>(null);
const item = shallowRef<StageItem | null>(null);
const log = shallowRef<PlayedStep[]>([]);
const held = ref<string | null>(null);
/** 掛けてあるお告げ */
const omens = ref<string[]>([]);
const seed = ref(0);
const error = ref<string | null>(null);
/** 再生モード (URL の手順)。手で打つ操作は止める */
const replay = ref<{ plan: CraftStagePlan; step: number } | null>(null);
const base = ref("Gold Ring");
const itemLevel = ref(82);
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
/**
 * 動画用の別の画面 (POE2Tube 要望 ⑪、2026-09-29)。URL の view= で開く (手順は要らない):
 *   view=tiers&base=<英語のベース名>&mod=<MOD の id か系統>&ilvl=N … 段の表
 *   view=compare&a=<手順 JSON>&b=<手順 JSON>[&a_step=N&b_step=N] … 2 つのアイテムを並べて違いを出す
 */
export type StageExtra =
  // hl = false: 答えの金の段を出さない (&hl=0、POE2Tube 要望 ⑯「ネタバレは避けたい」)
  | { kind: "tiers"; base: string; mod: string; ilvl: number | null; hl: boolean; floor: number | null }
  // aPob / bPob: 結果 JSON の pob (要望 ⑰-3、&a_pob= / &b_pob=)。あれば真ん中の差に DPS の差も出す
  | { kind: "compare"; a: CraftStagePlan; b: CraftStagePlan; aStep: number; bStep: number; aPob: PobBlock | null; bPob: PobBlock | null }
  // 耐性の画面 (要望 ⑰-4): r = craft-stage-run.mjs --resists の結果、act = どのペナルティを出すか、penalty = false でペナルティ後を出さない
  | { kind: "resists"; r: ResistsBlock; act: number | null; penalty: boolean }
  // 倒すまでの時間 (要望 ⑰-15): a / b = 結果 JSON の pob、step = どの手の武器か、label = 左右の札
  | { kind: "ttk"; a: PobBlock; aStep: number; aLabel: string; b: PobBlock | null; bStep: number; bLabel: string }
  // 受けるダメージ (要望 ⑰-16): pob のその手のキャラのライフ、elem の一撃、res = 左右の耐性 (%)、dmg = 一撃の指定 (無ければ PoB の既定)
  | { kind: "hit"; pob: PobBlock; step: number; elem: string; res: number[]; dmg: number | null }
  // DPS の内訳 (要望 ⑰-5)
  | { kind: "dps"; pob: PobBlock; step: number }
  // 防御の仕組み (要望 ㉒-B): ダメージが減る順番 / アーマーのグラフ / 回避と受け流し / ES とライフ / 防具のベース
  | { kind: "layers"; d: Defender; hit: number; dmgKind: DamageKind; acc: number; outcome: Outcome; red: boolean; lvl: number | null }
  | { kind: "armour"; ar: number[]; labels: string[]; max: number | null; hit: number | null }
  | { kind: "evasion"; ev: number; deflect: number; acc: number; lvl: number | null; n: number; red: boolean }
  | { kind: "es"; life: number; es: number; dmg: number; hits: number[]; esKind: "phys" | "chaos" | "bleed"; until: number }
  | { kind: "bases"; slot: string; early: number; late: number }
  // エッセンスの強さの比べ (要望 ㉔-6): name = Essence of ○○ の ○○、part = 強調する部位の言葉
  | { kind: "essence"; name: string; part: string | null };
/** craft-stage-run.mjs --resists の結果 (耐性の画面に URL で渡す) */
export interface ResistsBlock {
  version: string;
  items: Array<{ name: string; base: string; rarity: string }>;
  /** 装備だけの耐性の合計 (アイテム無しとの差) */
  equip?: Record<"fire" | "cold" | "lightning" | "chaos", number>;
  rows: Array<{
    penalty: number;
    label: string;
    resists: PobStat["resists"];
    /** 内訳 (要望 ⑳): 元の値 (ペナルティ) / クエストの報酬 / 装備 (どれも PoB の値) */
    parts?: Record<"fire" | "cold" | "lightning" | "chaos", { base: number; quests: number; equip: number }>;
  }>;
  /** 使った前提 (要望 ⑳): 設定の言葉と入れたクエストの報酬 */
  config_ja?: string;
  quests?: Array<{ act: number; area: string; stat: string; on: boolean }>;
}
const extra = ref<StageExtra | null>(null);

/**
 * 防御の画面 (要望 ㉒-B) の URL → 中身。キャラは &pob=<結果 JSON の pob>&step=N (ライフ・ES・アーマー・回避力・耐性) を元に、
 * &life= &es= &armour= &evasion= &deflect= &block= &res= で上書き。敵は &lvl= (命中力・一撃の表)、&acc= / &dmg= で上書き
 */
function defenceView(view: string, q: URLSearchParams): StageExtra {
  const num = (k: string): number | null => (q.get(k) != null && q.get(k) !== "" && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  const list = (k: string): number[] => (q.get(k) ? q.get(k)!.split(",").filter((x) => x.trim() !== "").map(Number).filter((x) => Number.isFinite(x)) : []);
  const pobBlock = q.get("pob") ? (JSON.parse(q.get("pob")!) as PobBlock) : null;
  const st = pobBlock?.steps?.[Math.min(num("step") ?? 9999, (pobBlock.steps?.length ?? 1) - 1)] ?? null;
  const lvl = num("lvl") ?? pobBlock?.enemy?.level ?? null;
  const acc = num("acc") ?? (lvl ? monsterAccuracy(lvl) : 0);
  if (view === "armour") return { kind: "armour", ar: list("ar").length ? list("ar") : [st?.armour ?? 1000], labels: (q.get("labels") ?? "").split(",").filter(Boolean), max: num("max"), hit: num("hit") };
  if (view === "evasion") return { kind: "evasion", ev: num("ev") ?? st?.evasion ?? 0, deflect: num("deflect") ?? 0, acc, lvl, n: num("n") ?? 10, red: q.get("red") !== "0" };
  if (view === "bases") return { kind: "bases", slot: q.get("slot") ?? "body", early: num("early") ?? 1, late: num("late") ?? 80 };
  const life = num("life") ?? Math.round(st?.life ?? 1000);
  const es = num("es") ?? Math.round(st?.es ?? 0);
  if (view === "es") {
    const hits = list("hits");
    const kind = q.get("kind");
    return { kind: "es", life, es, dmg: num("dmg") ?? 200, hits: hits.length ? hits : [0.8, 1.6, 2.4], esKind: kind === "chaos" || kind === "bleed" ? kind : "phys", until: num("until") ?? 12 };
  }
  const kinds: DamageKind[] = ["physical", "fire", "cold", "lightning", "chaos"];
  const dmgKind = (kinds.includes(q.get("kind") as DamageKind) ? q.get("kind") : "physical") as DamageKind;
  const outcomes: Outcome[] = ["hit", "evade", "deflect", "block"];
  const outcome = (outcomes.includes(q.get("outcome") as Outcome) ? q.get("outcome") : "hit") as Outcome;
  const resist = num("res") ?? (dmgKind === "physical" ? 0 : (st?.resists?.[dmgKind]?.value ?? 0));
  const d: Defender = { life, es, armour: num("armour") ?? Math.round(st?.armour ?? 0), evasion: num("evasion") ?? Math.round(st?.evasion ?? 0), deflection: num("deflect") ?? 0, block: num("block") ?? 0, resist };
  const hit = num("dmg") ?? pobBlock?.enemy?.hit ?? (lvl ? Math.round((DEF.monsterDamage[lvl - 1] ?? 0) * 1.5) : 500);
  return { kind: "layers", d, hit, dmgKind, acc, outcome, red: q.get("red") === "1", lvl };
}
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
const startMods = ref<Force[]>([]);
/**
 * シミュレーションのタブ (2026-10-05、実験): 画面の切り替えと、狙いの MOD (MOD の一覧の段の表の「狙う」で足す)。
 * minTierIndex はエンジンの段の番号 (0 = 一番下、T1 = tiers.length - 1)。[[stage-sim.ts]]
 */
const mode = ref<"hand" | "sim">("hand");

/** method = 付け方 (順番どおりのシミュレーション、[[recipe-sim.ts]])。省くと MOD の種類で決める (普通 = 高貴、冒涜 = 冒涜、エッセンス = エッセンス) */
/**
 * シミュレーションはベース選びから (2026-10-05 オーナー「実験開いたらベース決めからでしょ、ベースはデフォは選択なしでスタート」)。
 * simPicked = このタブでベースを選んだ。simShowMods = 下の MOD 一覧を出す段まで来た (② 付ける順番から)
 */
const simPicked = ref(false);
const simShowMods = ref(false);
/** シミュレーションの白のベースのソケットの数 (1 ベースの枠で選ぶ。null = まだ) */
const simSockets = ref<number | null>(null);
/**
 * 始め方 (1 ベースの枠で選ぶ。2026-10-08 オーナー「フラクチャー MOD を選んでそこからシミュレーターしたい場合は最初の段階から選択式がいい」)。
 * white = 白のベースから / fractured = 固定済みのベースを買う (固定 MOD は 2 狙う MOD の最初の 1 つ) / four = 4 MOD のレア (3 MOD + 狙い 1) を買って自分で固定。
 * 4 最安値スタートの 3 ルートを前に出した物。white 以外は 4 を飛ばし、始めのベース代は 3 で入れた値段
 */
export type SimStart = "white" | "fractured" | "four" | "item";
const simStart = ref<SimStart>("white");
/**
 * 手で打つ画面から持ってきた始めの状態 (2026-10-08 オーナー「その MOD が付いた状態以降を確認したい時があるから、手打ちからそのまま持っていくコース」)。
 * simStart = "item" の時だけ使う。simStartCost = その時点の手打ちの累計 (高貴)
 */
/** Web 版の工程を覚える手の数 */
export const LOG_KEEP = 50;
const simStartItem = ref<StageItem | null>(null);
/** ベースを選ぶ前に選んだレシピ (StageSimPanel が開いたら読み込む。2026-10-08 完成判定: レシピはベースを選ぶまで出なかった) */
const simPendingRecipe = ref<string | null>(null);
const simStartCost = ref(0);
const simTargets = ref<Array<{ modId: string; minTierIndex: number; method?: "exalt" | "chaos" | "desecrate" | "essence" | "fracture"; alts?: Array<{ modId: string; minTierIndex: number }>; need?: number }>>([]);
/** ② のこの手順 (本体の modId) の「あるいは」を選ぶポップアップを開いている ([[StageFracturePicker.vue]] の altFor) */
const simAltFor = ref<string | null>(null);
/**
 * 5 順番計画 (2026-10-06 オーナー「5 番は指標、順番計画みたいな欄のタイトルで今後には影響しない。付ける MOD を選ぶ時のプルダウンの順番をこれどおりに」
 * 「ルーンとかも付けていく順番を考えないといけないから順に表示」)。並びのキー: "mod:<modId>" / "rune:<英語名>"
 */
const simOrder = ref<string[]>([]);
/** 6 パターン (pattern.ts)。回すのはこの手の通り */
const simPatterns = ref<Pattern[]>([{ name: "パターン 1", steps: [], play: { v: 2, moves: [] } }]);

/**
 * シミュレーションの途中 (ベース・狙う MOD・工程の「決めた」・順番計画・パターン) を覚えて、開き直した時にそのまま出す
 * (2026-10-07 オーナー「変わってない所はキャッシュでパッと表示させろ」)。工程の「決めた」は StageSimPanel が持つので flags に入れてもらう
 */
export const SIM_SESSION_KEY = "exiledesk.craftStageSim.session";
export interface SimSession {
  base: string; itemLevel: number; targets: typeof simTargets.value; sockets: number | null; order: string[]; patterns: Pattern[];
  /** 始め方 (無ければ白から) と、手打ちから持ってきた始めの状態 */
  start?: SimStart;
  startItem?: StageItem | null;
  startCost?: number;
  /** 入れたベース代 (高貴建て)。呼び出した時に、そのベースの覚えた値段が無ければこれを入れる */
  prices?: { white?: number | null; four?: number | null; bought?: number | null; item?: number | null };
  flags: Record<string, boolean>;
}
export function readSimSession(): SimSession | null {
  try { const v = JSON.parse(localStorage.getItem(SIM_SESSION_KEY) ?? "null") as SimSession | null; return v && v.base ? v : null; } catch { return null; }
}
export function writeSimSession(v: SimSession | null): void {
  try { if (v) localStorage.setItem(SIM_SESSION_KEY, JSON.stringify(v)); else localStorage.removeItem(SIM_SESSION_KEY); } catch { /* 覚えられなくても動く */ }
}

/**
 * レシピ: シミュレーションの途中 (ベース・狙い・順番・パターン・工程の「決めた」) を名前を付けて残す
 * (2026-10-07 オーナー「このガチャの仕組みシミュレーターで保管しときたい」「レシピ保存ボタンで管理、名前も自分で変えて」)
 */
export const SIM_RECIPES_KEY = "exiledesk.craftStageSim.recipes";
/** 直前の一覧の控え (保存・名前替え・削除の前に置く。本体が読めなかった時はここから戻す) */
const SIM_RECIPES_BAK = "exiledesk.craftStageSim.recipes.bak";
/** 読み替えられなかった物 (捨てずにここへ。いつか読める版で拾い直せるように) */
const SIM_RECIPES_UNREAD = "exiledesk.craftStageSim.recipes.unread";
/**
 * レシピの形の版。形を変えたら上げて、normalizeRecipe で古い形を読み替える (2026-10-07 オーナー「更新でレシピがなくならないように」)。
 * キー (SIM_RECIPES_KEY) は変えない
 */
export const RECIPE_FORMAT = 1;
export interface SimRecipe { id: string; name: string; savedAt: number; session: SimSession; /** 一覧に出すベースの日本語名 */ baseJa?: string; /** 形の版 */ v?: number }

/** 古い形・欠けた所のあるレシピを今の形に。ベースが無い物は読めない (null) */
export function normalizeRecipe(x: unknown): SimRecipe | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Partial<SimRecipe> & Record<string, unknown>;
  const ses = (r.session ?? {}) as Partial<SimSession> & Record<string, unknown>;
  if (typeof ses.base !== "string" || !ses.base) return null;
  const patterns = Array.isArray(ses.patterns) ? ses.patterns.filter((p) => p && typeof p === "object").map((p) => ({ ...p, name: String((p as Pattern).name ?? "パターン"), steps: Array.isArray((p as Pattern).steps) ? (p as Pattern).steps : [] })) as Pattern[] : [];
  return {
    ...r,
    id: typeof r.id === "string" && r.id ? r.id : `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: typeof r.name === "string" && r.name ? r.name : ses.base,
    savedAt: typeof r.savedAt === "number" ? r.savedAt : Date.now(),
    v: RECIPE_FORMAT,
    session: {
      ...ses,
      base: ses.base,
      itemLevel: typeof ses.itemLevel === "number" ? ses.itemLevel : 82,
      targets: Array.isArray(ses.targets) ? ses.targets : [],
      sockets: typeof ses.sockets === "number" ? ses.sockets : null,
      order: Array.isArray(ses.order) ? ses.order : [],
      patterns,
      flags: ses.flags && typeof ses.flags === "object" ? ses.flags : {},
    } as SimSession,
  };
}

function parseList(raw: string | null): unknown[] | null {
  if (raw == null) return null;
  try { const v = JSON.parse(raw) as unknown; return Array.isArray(v) ? v : null; } catch { return null; }
}
/** 読めない物は捨てずに控えに足す (同じ物は重ねない) */
function keepUnread(xs: unknown[]): void {
  if (!xs.length) return;
  try {
    const cur = parseList(localStorage.getItem(SIM_RECIPES_UNREAD)) ?? [];
    const seen = new Set(cur.map((x) => JSON.stringify(x)));
    localStorage.setItem(SIM_RECIPES_UNREAD, JSON.stringify([...cur, ...xs.filter((x) => !seen.has(JSON.stringify(x)))]));
  } catch { /* 無くてよい */ }
}
/**
 * 2026-10-10 オーナー「レシピリセット」: 試しで作ったレシピを 1 回だけ空にする (アプリだけ。Web の人のレシピは触らない)。
 * 消す前の一覧は before-reset に残す (戻す時用)
 */
const SIM_RECIPES_RESET = "exiledesk.craftStageSim.recipes.reset-2026-10-10";
function resetRecipesOnce(): void {
  if (!isTauriRuntime() || localStorage.getItem(SIM_RECIPES_RESET)) return;
  const prev = localStorage.getItem(SIM_RECIPES_KEY);
  if (prev) localStorage.setItem("exiledesk.craftStageSim.recipes.before-reset", prev);
  localStorage.setItem(SIM_RECIPES_KEY, "[]");
  localStorage.removeItem(SIM_RECIPES_BAK);
  localStorage.setItem(SIM_RECIPES_RESET, "1");
}
export function readSimRecipes(): SimRecipe[] {
  try {
    resetRecipesOnce();
    // 本体が読めなければ控えから
    const main = parseList(localStorage.getItem(SIM_RECIPES_KEY));
    const list = main ?? parseList(localStorage.getItem(SIM_RECIPES_BAK)) ?? [];
    const ok: SimRecipe[] = [], bad: unknown[] = [];
    for (const x of list) { const r = normalizeRecipe(x); if (r) ok.push(r); else bad.push(x); }
    keepUnread(bad);
    return ok;
  } catch { return []; }
}
export function writeSimRecipes(v: SimRecipe[]): void {
  try {
    // 書き換える前の一覧を控えに (読める時だけ。壊れた物で控えを上書きしない)
    const prev = localStorage.getItem(SIM_RECIPES_KEY);
    if (parseList(prev)) localStorage.setItem(SIM_RECIPES_BAK, prev!);
    localStorage.setItem(SIM_RECIPES_KEY, JSON.stringify(v.map((r) => ({ ...r, v: RECIPE_FORMAT }))));
  } catch { /* 覚えられなくても動く */ }
}

/** 書き出し (ファイル 1 つ。URL を移す時・PC を替える時に持っていく) */
export const RECIPE_FILE_KIND = "exiledesk-recipes";
export function recipesToFile(v: readonly SimRecipe[]): string {
  return JSON.stringify({ kind: RECIPE_FILE_KIND, v: RECIPE_FORMAT, exportedAt: new Date().toISOString(), recipes: v }, null, 1);
}
/** 読み込み: 書き出したファイル (か、レシピの配列) から。今の一覧に無い物だけ足す (同じ id・同じ時刻は重ねない、id だけ同じなら新しい id で) */
export function mergeRecipesFromFile(text: string, cur: readonly SimRecipe[]): { list: SimRecipe[]; added: number; skipped: number; bad: number } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { list: [...cur], added: 0, skipped: 0, bad: 1 }; }
  const arr = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { recipes?: unknown }).recipes) ? (raw as { recipes: unknown[] }).recipes : [];
  const list = [...cur];
  let added = 0, skipped = 0, bad = 0;
  for (const x of arr) {
    const r = normalizeRecipe(x);
    if (!r) { bad++; continue; }
    const same = list.find((y) => y.id === r.id);
    if (same && same.savedAt === r.savedAt) { skipped++; continue; }
    list.push(same ? { ...r, id: `${r.id}-${Math.random().toString(36).slice(2, 6)}` } : r);
    added++;
  }
  list.sort((a, b) => b.savedAt - a.savedAt);
  return { list, added, skipped, bad };
}
/** 手で打って打てなかった時の知らせ (工程には積まない。画面は震えて理由を出す) */
const miss = ref<{ n: number; reason: string } | null>(null);

export const priceOf = (key: string): number => priceOfKey(key, item.value);
export const iconOf = (key: string): string => iconOfKey(key, item.value);
export const nameOf = (key: string): string => nameOfKey(key, item.value);

function newSeed(): number {
  return Math.floor(Date.now() % 1_000_000_000);
}
/** 手順・再生で値段を引くキー全部 (相場 JSON 用) */
function priceKeysAll(): string[] {
  return [...ORBS.flatMap((g) => g.keys), ...BONES, ...CATALYSTS, ...OMEN_GROUPS.flatMap((g) => g.keys), ...log.value.map((s) => s.out.currency)];
}

export const craftStage = {
  data, item, log, held, omens, seed, error, replay, base, itemLevel, miss, video, extra, focus, showTags, pob, startMods, mode, simTargets, simPicked, simShowMods, simAltFor, simSockets, simStart, simStartItem, simStartCost, simPendingRecipe, simOrder, simPatterns,
  ready: computed(() => !!data.value && !!item.value),
  /** 累計の費用 (高貴) */
  total: computed(() => { const l = log.value; return l.length ? l[l.length - 1]!.out.cost.cumulative : 0; }),
  /** 直前の手 */
  last: computed(() => log.value[log.value.length - 1] ?? null),
  /** 発現の候補 (未発現の冒涜 MOD がある時。次の手の seed で引くので、選んだ手の結果と一致する) */
  offers: computed(() => {
    if (!data.value || !item.value || !unrevealedOf(item.value)) return null;
    return revealOffers(data.value, item.value, mulberry32(seed.value + log.value.length + 1));
  }),

  /**
   * ヒネコラの髪束の予見: 予見できるアイテムでカレンシーを持っている時、打った時の結果 (次の手の seed で引くので、打つとこの通りになる)
   */
  foresight: computed(() => {
    const it = item.value;
    const key = held.value;
    if (!data.value || !it?.foreseen || !key || key === "hinekora") return null;
    // 手の番号は前の手の続き (Web は 50 手より前を消すので、log の長さでは数えない)
    const index = (log.value[log.value.length - 1]?.out.index ?? 0) + 1;
    const want = omensFor(key, omens.value);
    const p = playStep(data.value, it, key, { index, seed: seed.value + index, price: () => 0, cumulative: 0, omen: want.length ? want.join("+") : null });
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
      const view = q.get("view");
      if (view === "tiers") {
        const ilvl = Number(q.get("ilvl"));
        extra.value = { kind: "tiers", base: q.get("base") ?? "", mod: q.get("mod") ?? "", ilvl: Number.isFinite(ilvl) && ilvl > 0 ? ilvl : null, hl: q.get("hl") !== "0", floor: Number(q.get("floor")) > 0 ? Number(q.get("floor")) : null };
      } else if (view === "compare") {
        const num = (k: string) => (q.get(k) != null ? Number(q.get(k)) : 9999);
        const pj = (k: string) => (q.get(k) ? (JSON.parse(q.get(k)!) as PobBlock) : null);
        extra.value = { kind: "compare", a: JSON.parse(q.get("a") ?? "{}") as CraftStagePlan, b: JSON.parse(q.get("b") ?? "{}") as CraftStagePlan, aStep: num("a_step"), bStep: num("b_step"), aPob: pj("a_pob"), bPob: pj("b_pob") };
      } else if (view === "ttk") {
        const num = (k: string) => (q.get(k) != null ? Number(q.get(k)) : 9999);
        extra.value = { kind: "ttk", a: JSON.parse(q.get("a_pob") ?? "{}") as PobBlock, aStep: num("a_step"), aLabel: q.get("a_label") ?? "A", b: q.get("b_pob") ? (JSON.parse(q.get("b_pob")!) as PobBlock) : null, bStep: num("b_step"), bLabel: q.get("b_label") ?? "B" };
      } else if (view === "hit") {
        const res = (q.get("res") ?? "50,75").split(",").map(Number).filter((x) => Number.isFinite(x));
        extra.value = { kind: "hit", pob: JSON.parse(q.get("pob") ?? "{}") as PobBlock, step: q.get("step") != null ? Number(q.get("step")) : 9999, elem: q.get("elem") ?? "fire", res, dmg: q.get("dmg") != null ? Number(q.get("dmg")) : null };
      } else if (view === "dps") {
        extra.value = { kind: "dps", pob: JSON.parse(q.get("pob") ?? "{}") as PobBlock, step: q.get("step") != null ? Number(q.get("step")) : 9999 };
      } else if (view === "layers" || view === "armour" || view === "evasion" || view === "es" || view === "bases") {
        extra.value = defenceView(view, q);
      } else if (view === "essence") {
        extra.value = { kind: "essence", name: q.get("name") ?? "body", part: q.get("part") };
      } else if (view === "resists") {
        const act = q.get("act");
        extra.value = { kind: "resists", r: JSON.parse(q.get("r") ?? "{}") as ResistsBlock, act: act != null ? Number(act) : null, penalty: q.get("penalty") !== "0" };
      }
      if (q.get("stage-pob")) pob.value = JSON.parse(q.get("stage-pob")!) as PobBlock;
      // 再生は費用も出すので相場を待つ (手で打つ時は待たない。値段は打った時に引く)
      if (raw) await market;
      const step = Number(q.get("step") ?? "9999");
      const wantVideo = q.get("video") === "1";
      // 動画モードは手順を最後まで打っておき、step の手から見せる (前後に動かせるように)
      if (raw) craftStage.loadReplay(JSON.parse(raw) as CraftStagePlan, wantVideo ? 9999 : step);
      else craftStage.reset();
      if (raw && wantVideo) {
        const at = q.get("anim_t");
        // &offers=1 (発現の 3 択の静止画) は、同じ手つきを 3 択が出そろった瞬間 (pick_ms) で止めた絵 (POE2Tube 要望 ㉗: 静止画と手つきの
        // 切り替わりで絵が飛ばないように)
        const animT: number | "end" | "pick" | null = at != null
          ? at === "end" ? "end" : Number.isFinite(Number(at)) ? Math.max(0, Number(at)) : null
          : q.get("offers") === "1" ? "pick" : null;
        video.value = {
          // 手つきを時刻で止める時は 1 つ前の手から始めて、step 手目を打つ
          from: Math.max(0, Math.min(step, log.value.length) - (animT != null ? 1 : 0)),
          animT,
          autoplay: q.get("autoplay") === "1",
          controls: q.get("controls") !== "0",
          layout: q.get("layout") === "clip" ? "clip" : "default",
          offers: q.get("offers") === "1",
        };
      }
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
      item.value = { ...fullSockets(freshItem(data.value, base.value, itemLevel.value)), rollSeed: seed.value };
      log.value = [];
      omens.value = [];
      seed.value = newSeed();
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  },
  /** その状態で打てるか (打てないなら理由)。掛けてあるお告げ込み */
  usable(key: string): string | null {
    if (!data.value || !item.value) return "準備中";
    const r = applyCurrency(data.value, item.value, key, mulberry32(0), omens.value);
    return r.applied ? null : (r.reason ?? "打てない");
  },
  /** 持っている物を 1 回打つ (Craft of Exile と同じ: 持ったままなら何度でも) */
  use(key: string | null = held.value): void {
    if (!key || !data.value || !item.value || replay.value) return;
    const why = craftStage.usable(key);
    if (why) {
      miss.value = { n: (miss.value?.n ?? 0) + 1, reason: why };
      return;
    }
    const index = log.value.length + 1;
    const want = omensFor(key, omens.value);
    const p = playStep(data.value, item.value, key, {
      index, seed: seed.value + index, price: priceOf, cumulative: craftStage.total.value, omen: want.length ? want.join("+") : null,
    });
    // Web 版は工程を 50 手まで覚え、それより前は消す (データが長くなりすぎる。2026-10-08 オーナー「50 手まで保存でそれ以降は消そうか」)。
    // アプリは手順 JSON (POE2Tube の再生) に全部の手が要るので消さない
    log.value = !isTauriRuntime() && log.value.length >= LOG_KEEP ? [...log.value.slice(-(LOG_KEEP - 1)), p] : [...log.value, p];
    item.value = p.after;
    recordHistory("craft-stage", "use", { base: base.value, itemLevel: itemLevel.value, seed: seed.value, startMods: startMods.value, out: p.out, after: p.after });
    // 食ったお告げは外す
    const ate = p.out.omen ? p.out.omen.split("+") : [];
    if (ate.length) omens.value = omens.value.filter((o) => !ate.includes(o));
  },
  /** 1 手戻す (その手で食ったお告げは掛け直す) */
  undo(): void {
    const l = log.value;
    // まだ打っていない時は、始めの MOD を 1 つ外す
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
    const ate = last.out.omen ? last.out.omen.split("+") : [];
    omens.value = [...new Set([...omens.value, ...ate])];
  },
  hold(key: string | null): void {
    held.value = key;
  },
  /** お告げを掛ける / 外す */
  toggleOmen(id: string): void {
    omens.value = omens.value.includes(id) ? omens.value.filter((o) => o !== id) : [...omens.value, id];
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
      // 始めの状態の MOD (要望 ⑱-2)。無ければ書かない
      ...(startMods.value.length ? ({ start: { mods: startMods.value } satisfies StartSpec } as object) : {}),
      seed: seed.value,
      steps: (log.value.length ? log.value.map((s) => ({ currency: s.out.currency, omen: s.out.omen ?? null, times: 1, note: null })) : [{ currency: "transmute", omen: null, times: 1, note: null }]) as CraftStagePlan["steps"],
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
  /** 再生: 手順 JSON を step 手目まで打った状態 */
  loadReplay(plan: CraftStagePlan, step: number): void {
    if (!data.value) return;
    try {
      base.value = plan.base;
      itemLevel.value = plan.item_level ?? 80;
      item.value = freshItem(data.value, plan.base, itemLevel.value);
      const keys = [...new Set([...plan.steps.flatMap((s) => [s.currency, ...(s.omen ? s.omen.split("+") : [])]), ...priceKeysAll()])];
      const prices = Object.fromEntries(keys.map((k) => [k, priceOf(k)]));
      const { steps, final } = playPlan(data.value, plan, prices, step);
      replay.value = { plan, step };
      seed.value = plan.seed;
      log.value = steps;
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
