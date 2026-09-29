/**
 * craft-stage.ts — クラフトステージの画面の状態 (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)
 *
 * オーナー:「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」
 * 「操作は Craft of Exile 仕様 (アイコンを持ってアイテムをクリック)」「カレンシーっていうかクラフトに使える奴全部」。
 *   - 手で打つ: 棚の物を持って (held) アイテムを押すと 1 手。お告げは押すと「掛けておく」(何枚でも)。次の手に関係する物だけ食う。
 *     seed は 開始の seed + 手の番号 なので、打った手をそのまま手順 JSON にして scripts/craft-stage-run.mjs に流すと同じ結果になる
 *   - 冒涜: 骨で未開示の MOD が付き、開示の候補 3 つ (revealOffers) から選ぶと reveal:N の手になる
 *   - 再生: 手順 JSON と step (URL の ?stage-plan=…&step=N) で、その手まで進めた状態を出す (POE2Tube の撮影用)
 *   - 動画モード: 打った手 (か手順 JSON) を 16:9 の撮影用画面で 1 手ずつ再生する ([[VideoStage.vue]])。
 *     URL に &video=1 を付けると最初から動画モード (step=N でその手から、autoplay=1 で自動再生、controls=0 で操作欄を出さない、
 *     layout=clip で撮影用のすっきりレイアウト)
 * 1 手の中身は services/craft-stage (計算機と同じ規則)。棚・名前・値段は [[craft-stage-shelf.ts]]。
 */
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
const video = ref<{ from: number; autoplay: boolean; controls: boolean; layout?: "default" | "clip" } | null>(null);
/**
 * 動画用の別の画面 (POE2Tube 要望 ⑪、2026-09-29)。URL の view= で開く (手順は要らない):
 *   view=tiers&base=<英語のベース名>&mod=<MOD の id か系統>&ilvl=N … 段の表
 *   view=compare&a=<手順 JSON>&b=<手順 JSON>[&a_step=N&b_step=N] … 2 つのアイテムを並べて違いを出す
 */
export type StageExtra =
  // hl = false: 答えの金の段を出さない (&hl=0、POE2Tube 要望 ⑯「ネタバレは避けたい」)
  | { kind: "tiers"; base: string; mod: string; ilvl: number | null; hl: boolean }
  // aPob / bPob: 結果 JSON の pob (要望 ⑰-3、&a_pob= / &b_pob=)。あれば真ん中の差に DPS の差も出す
  | { kind: "compare"; a: CraftStagePlan; b: CraftStagePlan; aStep: number; bStep: number; aPob: PobBlock | null; bPob: PobBlock | null }
  // 耐性の画面 (要望 ⑰-4): r = craft-stage-run.mjs --resists の結果、act = どのペナルティを出すか、penalty = false でペナルティ後を出さない
  | { kind: "resists"; r: ResistsBlock; act: number | null; penalty: boolean }
  // 倒すまでの時間 (要望 ⑰-15): a / b = 結果 JSON の pob、step = どの手の武器か、label = 左右の札
  | { kind: "ttk"; a: PobBlock; aStep: number; aLabel: string; b: PobBlock | null; bStep: number; bLabel: string }
  // 受けるダメージ (要望 ⑰-16): pob のその手のキャラのライフ、elem の一撃、res = 左右の耐性 (%)、dmg = 一撃の指定 (無ければ PoB の既定)
  | { kind: "hit"; pob: PobBlock; step: number; elem: string; res: number[]; dmg: number | null }
  // DPS の内訳 (要望 ⑰-5)
  | { kind: "dps"; pob: PobBlock; step: number };
/** craft-stage-run.mjs --resists の結果 (耐性の画面に URL で渡す) */
export interface ResistsBlock {
  version: string;
  items: Array<{ name: string; base: string; rarity: string }>;
  /** 装備だけの耐性の合計 (アイテム無しとの差) */
  equip?: Record<"fire" | "cold" | "lightning" | "chaos", number>;
  rows: Array<{ penalty: number; label: string; resists: PobStat["resists"] }>;
}
const extra = ref<StageExtra | null>(null);
/** スポットライト (URL の focus=<MOD の id か系統>)。動画モードのアイテム枠でその行だけ光らせる */
const focus = ref<string | null>(null);
/** PoB の計算 (要望 ⑰-3、URL の stage-pob=<結果 JSON の pob>)。動画モードで手ごとの DPS を出す */
const pob = shallowRef<PobBlock | null>(null);
/**
 * 始めの状態に付けた MOD (要望 ⑱-2、オーナー「指定 MOD 選んでからそこからクラフトできるように、動画用として」)。
 * まだ 1 手も打っていない間だけ、MOD 一覧から足せる。手順 JSON の start.mods に書き出す
 */
const startMods = ref<Force[]>([]);
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
  data, item, log, held, omens, seed, error, replay, base, itemLevel, miss, video, extra, focus, pob, startMods,
  ready: computed(() => !!data.value && !!item.value),
  /** 累計の費用 (高貴) */
  total: computed(() => { const l = log.value; return l.length ? l[l.length - 1]!.out.cost.cumulative : 0; }),
  /** 直前の手 */
  last: computed(() => log.value[log.value.length - 1] ?? null),
  /** 開示の候補 (未開示の冒涜 MOD がある時。次の手の seed で引くので、選んだ手の結果と一致する) */
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
    const index = log.value.length + 1;
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
      const view = q.get("view");
      if (view === "tiers") {
        const ilvl = Number(q.get("ilvl"));
        extra.value = { kind: "tiers", base: q.get("base") ?? "", mod: q.get("mod") ?? "", ilvl: Number.isFinite(ilvl) && ilvl > 0 ? ilvl : null, hl: q.get("hl") !== "0" };
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
        video.value = {
          from: Math.min(step, log.value.length),
          autoplay: q.get("autoplay") === "1",
          controls: q.get("controls") !== "0",
          layout: q.get("layout") === "clip" ? "clip" : "default",
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
      item.value = startFrom(data.value, base.value, itemLevel.value, { mods: next }, seed.value - 1);
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
      item.value = freshItem(data.value, base.value, itemLevel.value);
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
    log.value = [...log.value, p];
    item.value = p.after;
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
      item.value = startFrom(data.value, base.value, itemLevel.value, { mods: startMods.value }, seed.value - 1);
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
    });
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
