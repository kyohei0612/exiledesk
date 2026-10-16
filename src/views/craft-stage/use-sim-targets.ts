/**
 * use-sim-targets.ts — シミュレーションの画面 (StageSimPanel.vue) の狙う MOD・付ける順番・ルーン・フラクチャーの狙い・ソケット・手で入れたベースの値段 (覚えておく)。
 * StageSimPanel.vue から分けた (2026-10-16、500 行の決まり)。画面の 1 つごとに呼ぶ (状態は画面ごと)
 */
import { computed, ref, watch } from "vue";
import { craftStage, priceOf } from "../../state/craft-stage";
import { CRAFT_RUNES_EN } from "../../services/htc/sockets";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { type RecipeMethod } from "../../services/craft-stage/recipe-sim";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { RUNES, runeEffectFor, socketCapOf } from "../../services/craft-stage/stage-runes";
import { runeEnForId, type CheckCtx } from "../../services/craft-stage/pattern";
import { methodsFor as methodsForData } from "../../services/craft-stage/quiz-build";
import { planByRedoCost, type RedoPlan } from "../htc-craft/redo-cost";

/**
 * 値段の変わりに付いていく (2026-10-05 オーナー「価格変動に対応できる仕組みがいいね、カレンシーとベースの。結局 1 からでも白ベースは買う」)。
 *   - カレンシー: 相場 (カレンシーランキングと同じ) をいつの値段か出し、取り直せる。取り直すと計算も回した結果も出し直す
 *   - ベース: 手で入れた値段 (白 / 4 MOD / 固定済み) をベースとアイテムレベルごとに覚え、いつ入れたかを出す (1 日以上前は色を変える)。
 *     取引所は自動で取らない (サーバーに置く前提、[[sim-no-trade-fetch]])
 */
/**
 * 手で入れる値段は全部 高貴建てで持つ。欄は共通の [[PriceInput.vue]] (数字 + 単位のプルダウン、欄ごとに単位を覚える、最初はカオス。
 * 2026-10-05 オーナー「こういう所も単位選べるようにでしょ」)。覚えた値段は { v: 高貴建て, u: "exalt" }。
 * 前の形 (入れた単位 u ごと、u が無ければ神) は読む時に今の相場で高貴建てに直す
 */
export type OldUnit = "exalt" | "chaos" | "divine";
export type Kept = { v: number; at: number; u?: OldUnit };

export function useSimTargets() {
  const s = craftStage;
  /** 回す人数は 500 で固定 (2026-10-07 オーナー「全体 500 人でデフォ固定、上限 (4,000 手) の方を設定できれば」。その前は 1500) */
  const runs = ref<number>(500);
  /**
   * 1 人が打てる手の上限 (超えた人は「手が多すぎる」で未完成)。既定 4,000、回すの横で選ぶ。このブラウザに覚える
   * (2026-10-07 オーナー「回す回数だけ設定できれば…じゃない、上限設定 4000 手のほう」)
   */
  const MAX_STEPS_KEY = "exiledesk.craftStageSim.maxSteps";
  const MAX_STEPS_CHOICES = [4_000, 10_000, 20_000, 50_000] as const;
  const maxSteps = ref<number>((() => { try { const v = Number(localStorage.getItem(MAX_STEPS_KEY)); return (MAX_STEPS_CHOICES as readonly number[]).includes(v) ? v : 4_000; } catch { return 4_000; } })());
  watch(maxSteps, (v) => { try { localStorage.setItem(MAX_STEPS_KEY, String(v)); } catch { /* 無くてよい */ } });

  /** 付け方の名前 (2026-10-05 オーナー「カオスはカオススパム、高貴はガチャなので高貴ガチャ」) */
  const METHOD_JA: Record<RecipeMethod, string> = { exalt: "高貴ガチャ", chaos: "カオススパム", desecrate: "冒涜", essence: "エッセンス", fracture: "フラクチャー" };
  /** その MOD に使える付け方 (最初が既定) */
  function methodsFor(modId: string): RecipeMethod[] {
    const d = s.data.value;
    return d ? methodsForData(d, modId) : ["exalt"];
  }
  const methodOf = (t: { modId: string; method?: RecipeMethod }): RecipeMethod => (t.method === "fracture" ? "fracture" : t.method && methodsFor(t.modId).includes(t.method) ? t.method : methodsFor(t.modId)[0]!);

  /** 狙いの行 (文は狙いの段の値、「T2 以上」) */
  const rows = computed(() => {
    const d = s.data.value;
    if (!d) return [];
    return s.simTargets.value.map((t) => {
      const m = d.mods.get(t.modId);
      const tier = m?.tiers[t.minTierIndex];
      return {
        ...t,
        method: methodOf(t),
        methods: methodsFor(t.modId),
        side: m?.type === "suffix" ? "サフィ" : "プレ",
        tone: m?.source === "desecrated" ? "text-lime-200/90" : m && CRAFTED_SOURCES.has(m.source) ? "text-sky-200" : "text-[#c8c8ff]",
        text: m ? fillModText(m, tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ") : t.modId,
        rank: m ? `T${m.tiers.length - t.minTierIndex}` : "",
        /** 「どれか」の候補 (この手順はどれか 1 つが付けば当たり) */
        alts: (t.alts ?? []).map((a) => {
          const am = d.mods.get(a.modId);
          const at = am?.tiers[a.minTierIndex];
          return { modId: a.modId, text: am ? fillModText(am, at ? tierDisplayRanges(at) : []).replace(/\n/g, " / ") : a.modId, rank: am ? `T${am.tiers.length - a.minTierIndex}` : "" };
        }),
        /** 候補のうちいくつ付けば当たりか (どれか N つ。候補の数まで) */
        need: 1, // グループは 1 MOD (2 つ欲しい時はコピーして並べる)
      };
    });
  });
  /** 狙いの全部の MOD の印 (段も、どれかの候補も) */
  const targetsSig = (): string => s.simTargets.value.map((t) => `${t.modId}:${t.minTierIndex}${t.need && t.need > 1 ? `x${t.need}` : ""}${(t.alts ?? []).map((a) => `|${a.modId}:${a.minTierIndex}`).join("")}`).join(",");
  /** ③ 付ける順番 (フラクチャー以外、上から順) */
  const restRows = computed(() => rows.value.filter((r) => r.method !== "fracture"));
  /**
   * 5 順番計画の並び (2026-10-06 オーナー「5 番は指標、順番計画。付ける MOD を選ぶ時のプルダウンの順番をこれどおりに」
   * 「ルーンとかも付けていく順番を考えないといけないから順に表示」)。狙う MOD (フラクチャー以外) + 狙いのルーンの MOD に要るルーン + 足したルーン。
   * 並びは simOrder (無い物は後ろに)
   */
  const runeNeeded = computed(() => {
    const out = new Set<string>();
    for (const t of s.simTargets.value) for (const x of [t, ...(t.alts ?? [])]) {
      const r = s.data.value?.mods.get(x.modId)?.rune;
      const en = r ? runeEnForId(r) : null;
      if (en) out.add(`rune:${en}`);
    }
    return out;
  });
  const orderKeys = computed(() => {
    const all = [...new Set([...restRows.value.map((r) => `mod:${r.modId}`), ...runeNeeded.value, ...s.simOrder.value.filter((k) => k.startsWith("rune:"))])];
    const pos = (k: string): number => { const i = s.simOrder.value.indexOf(k); return i < 0 ? 1e6 + all.indexOf(k) : i; };
    return all.sort((a, b) => pos(a) - pos(b));
  });
  function moveOrder(k: string, d: -1 | 1): void {
    const list = [...orderKeys.value];
    const i = list.indexOf(k), j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    s.simOrder.value = list;
  }
  function addRune(en: string): void {
    if (en) s.simOrder.value = [...orderKeys.value, `rune:${en}`];
  }
  const removeRune = (k: string): void => { s.simOrder.value = orderKeys.value.filter((x) => x !== k); };
  /**
   * 順番計画に足せるルーン: クラフトに関わるルーンだけ (クラフトステージの棚と同じ CRAFT_RUNES_EN)、このベースに効く物。
   * 選び方はステージの棚と同じ札 (2026-10-07 オーナー「基本クラフトルーンだけ表示、プルダウンじゃなくてステージの選ばせ方が好き」)
   */
  const runeChoices = computed(() => {
    const it = s.item.value;
    if (!it) return [];
    return CRAFT_RUNES_EN.flatMap((en) => {
      const r = RUNES[en];
      const eff = r ? runeEffectFor(r, it.cls.category) : null;
      if (!r || r.available === false || !eff) return [];
      const k = `rune:${en}`;
      const inOrder = orderKeys.value.includes(k);
      const used = orderKeys.value.filter((x) => x.startsWith("rune:")).length;
      const why = runeNeeded.value.has(k) ? "狙いの MOD に要る (外せない)" : !inOrder && used >= socketCount.value ? `ソケットが足りない (${socketCount.value} つ)` : null;
      return [{ en, k, ja: r.ja, effect: eff.ja, inOrder, why }];
    });
  });
  function toggleRune(x: { en: string; k: string; inOrder: boolean; why: string | null }): void {
    if (x.why) return;
    if (x.inOrder) removeRune(x.k); else addRune(x.en);
  }
  const orderRow = (k: string) => restRows.value.find((r) => `mod:${r.modId}` === k);
  const runeJa = (k: string): string => RUNES[k.slice(5)]?.ja ?? k.slice(5);

  /**
   * やり直しの費用 (計算機の redo-cost.ts をそのまま使う。2026-10-06 オーナー「消去で消す MOD はカオススパムがつらいほどアカン、
   * 一回付いたらやり直せないみたいな基準によってリロール方法が変わる」)。狙いごとの取り方・1 回の値段・当たる確率・
   * 外れ 1 回のやり直し費用・見込み (取り直すといくらか) と、側ごとの外れの消し方 (素の消去 / 側のお告げ)。値段は高貴建て
   */
  const redoPlan = computed<RedoPlan | null>(() => {
    const d = s.data.value, it = s.item.value;
    if (!d || !it || !rows.value.length) return null;
    // 計算機の値段の表の形 (無い物は undefined = 使えない)。値段はステージと同じ相場 (高貴建て)
    const px = new Proxy({} as Record<string, number>, { get: (_t, k) => { if (typeof k !== "string") return undefined; const v = priceOf(k); return v > 0 ? v : undefined; } });
    const fixedIds = fractureRows.value.map((r) => r.modId);
    const fside = fractureRow.value ? (fractureRow.value.side === "サフィ" ? "suffix" : "prefix") : null;
    try {
      return planByRedoCost({
        data: d, prices: { currency: px, omens: px, bones: px },
        targets: s.simTargets.value.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex })),
        fixedIds, qualityTag: null, chaosOk: true,
        limits: { prefix: it.cls.limits?.prefixes ?? 3, suffix: it.cls.limits?.suffixes ?? 3 },
        fixedSides: fside ? [fside] : [],
      }, it.cls, s.itemLevel.value);
    } catch {
      return null;
    }
  });
  /** 狙いごとのやり直しの見積もり (5 順番計画・6 パターンに出す) */
  const redoOf = computed(() => new Map((redoPlan.value?.rows ?? []).map((r) => [r.modId, r])));
  const REDO_METHOD_JA: Record<string, string> = { chaos: "カオス", exalt: "高貴", desecrate: "冒涜", essence: "エッセンス" };

  /** 6 パターンの始めの状態 (フラクチャー済みのレアか白) */
  const patternStart = computed<CheckCtx["start"]>(() => {
    const it = s.simStart.value === "item" ? s.simStartItem.value : null;
    if (it) {
      // 手打ちの状態から: 付いている MOD の数、狙いのうち付いている物 (その段以上)、固定・冒涜・エッセンス
      const all = [...it.prefixes, ...it.suffixes];
      const fixed = all.find((m) => m.fractured) ?? null;
      const placed = s.simTargets.value.flatMap((t) => [t, ...(t.alts ?? [])]).filter((t) => all.some((m) => m.modId === t.modId && m.tierIndex >= t.minTierIndex)).map((t) => t.modId);
      return {
        rarity: it.rarity === "unique" ? "rare" : it.rarity,
        fracturedSide: fixed ? fixed.side : null,
        sockets: Math.max(0, (it.sockets ?? 0) - (it.augments?.length ?? 0)),
        mods: { prefix: it.prefixes.length, suffix: it.suffixes.length, placed: [...new Set(placed)], fractured: fixed?.modId ?? null, desecrated: all.filter((m) => m.desecrated).length, essences: all.filter((m) => m.crafted).length },
      };
    }
    return {
      rarity: fractureRow.value ? "rare" : "normal",
      fracturedSide: fractureRow.value ? (fractureRow.value.side === "サフィ" ? "suffix" : "prefix") : null,
      sockets: socketCount.value,
    };
  });
  /** フラクチャーの狙いの始め方。付いた状態のベースの値段は手で (神) */
  const fractureRows = computed(() => rows.value.filter((r) => r.method === "fracture"));
  /**
   * フラクチャーの候補を 1 つずつに (あるいは付きの手順は候補を全部。2026-10-05 オーナー「フラクチャーは複数あったら全部で 1 つのグループで
   * いい、全部フラクチャー予定として」)。どれか 1 つが固定されれば良い (どれか N つの N はフラクチャーでは見ない)
   */
  const fracMembers = computed(() => fractureRows.value.flatMap((r) => {
    const t = s.simTargets.value.find((x) => x.modId === r.modId);
    return [
      { modId: r.modId, minTierIndex: r.minTierIndex, text: r.text, rank: r.rank, side: r.side, tone: r.tone },
      ...r.alts.map((a) => ({ modId: a.modId, minTierIndex: t?.alts?.find((x) => x.modId === a.modId)?.minTierIndex ?? 0, text: a.text, rank: a.rank, side: r.side, tone: r.tone })),
    ];
  }));
  const fractureRow = computed(() => fractureRows.value[0] ?? null);
  /**
   * 作り方は 変成・増強ガチャ → 王者 → 骨の壁 (4 つ目を骨の未発現の冒涜に、候補が 1 つ減る) だけ
   * (2026-10-05 オーナー「基本これする時骨壁するから他の選択肢いらない」。錬金 → カオス・壁なしは recipe-sim.ts には残す)
   */
  const makeRoute = ref<"alch" | "magic">("magic");
  const blocker = ref(true);
  const boughtDivine = ref<number | null>(null);
  /** 狙いの MOD が付いたマジックを買う時の値段 (高貴建て、手で入れる。2026-10-12 オーナー「マジックを買う始め方も足して」) */
  const magicDivine = ref<number | null>(null);
  /**
   * 白のベースの値段 (神、手で入れる。規格外のソケット付きならその値段)。白から始める時・作り直す時に数え、マジックで外れた時の
   * 「消去」と「白を買い直して変成」の比べに使う (2026-10-05 オーナー「消去もバカにならんが」「ベースの規格外の値段次第」)
   */
  const whiteDivine = ref<number | null>(null);
  /** 4 MOD・当たり 1 (フラクチャーの狙いが付いた、固定していないレア) のベースの値段 (神、手で入れる) */
  const fourDivine = ref<number | null>(null);
  /** 手打ちの状態のベース代 (高貴。既定は 手打ちの累計 + 白ベース代、直せる。2026-10-08 オーナー「前者」) */
  const itemDivine = ref<number | null>(null);
  const exOf = (u: OldUnit): number => (u === "exalt" ? 1 : priceOf(u) || 1);
  const toExalt = (k: { v: number; u?: OldUnit } | undefined): number | null => {
    const v = num(k?.v);
    return v == null ? null : v * exOf(k?.u ?? "divine");
  };
  /** 入れた値段 (空欄・負は未入力) */
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const PRICE_KEY = "exiledesk.craftStageSim.basePrices";
  const keptAll = ref<Record<string, Partial<Record<"white" | "four" | "bought" | "magic", Kept>>>>({});
  try { keptAll.value = JSON.parse(localStorage.getItem(PRICE_KEY) ?? "{}"); } catch { /* 無くてよい */ }
  /**
   * 白のベースのソケットの数 (2026-10-05 オーナー「ベース選択後ソケットの数を 0 / 1 / 2 で選ばせて、これだとただの通常品のベース」)。
   * 選べる数は規格外まで = 熟練工の上限 + 1 (胴・両手 3 / ほか 2。2026-10-05 オーナー「規格外計算でやってくれ、マックスの +1 まであるでしょ」)。
   * 付けられない部位 (装飾品など) は 0 で選ばない
   */
  const craftCap = computed(() => (s.item.value ? socketCapOf(s.base.value, s.item.value.cls.category) : 0));
  const socketCap = computed(() => (craftCap.value > 0 ? craftCap.value + 1 : 0));
  /** ソケットの数は 1 ベースの枠 (CraftStage.vue) で選ぶので状態に置く */
  const sockets = s.simSockets;
  const socketsOk = computed(() => socketCap.value === 0 || sockets.value != null);
  const socketCount = computed(() => (socketCap.value === 0 ? 0 : sockets.value ?? 0));
  watch(() => s.base.value, () => { sockets.value = null; });
  /** ソケットの数だけ下限にした取引所の条件 (0 なら付けない) */
  const socketQuery = (): { socketsMin?: number } => (socketCount.value > 0 ? { socketsMin: socketCount.value } : {});
  const keptKey = computed(() => `${s.base.value}|${s.itemLevel.value}${socketCount.value ? `|s${socketCount.value}` : ""}`);
  const kept = computed(() => keptAll.value[keptKey.value] ?? {});
  let loadingKept = false;
  function loadKept(): void {
    loadingKept = true;
    whiteDivine.value = toExalt(kept.value.white);
    fourDivine.value = toExalt(kept.value.four);
    boughtDivine.value = toExalt(kept.value.bought);
    magicDivine.value = toExalt(kept.value.magic);
    void Promise.resolve().then(() => { loadingKept = false; });
  }
  function saveKept(which: "white" | "four" | "bought" | "magic", v: number | null): void {
    if (loadingKept) return;
    const cur = { ...(keptAll.value[keptKey.value] ?? {}) };
    const n = num(v);
    if (n == null) delete cur[which];
    else cur[which] = { v: n, at: Date.now(), u: "exalt" };
    keptAll.value = { ...keptAll.value, [keptKey.value]: cur };
    try { localStorage.setItem(PRICE_KEY, JSON.stringify(keptAll.value)); } catch { /* 無くてよい */ }
  }
  /** 「1 つ戻す」で状態を戻している間 (ソケットを戻した時に値段の読み込み・工程のリセットで上書きしない) */
  const restoring = { v: false };
  watch(keptKey, () => { if (!restoring.v) loadKept(); }, { immediate: true });
  watch(whiteDivine, (v) => saveKept("white", v));
  watch(fourDivine, (v) => saveKept("four", v));
  watch(boughtDivine, (v) => saveKept("bought", v));
  watch(magicDivine, (v) => saveKept("magic", v));
  /** いつ入れた値段か (「3 時間前」)。1 日以上前は old */
  function ageOf(which: "white" | "four" | "bought" | "magic"): { text: string; old: boolean } | null {
    const k = kept.value[which];
    if (!k) return null;
    const min = Math.floor((Date.now() - k.at) / 60000);
    const text = min < 1 ? "今入れた" : min < 60 ? `${min} 分前に入れた` : min < 1440 ? `${Math.floor(min / 60)} 時間前に入れた` : `${Math.floor(min / 1440)} 日前に入れた`;
    return { text, old: min >= 1440 };
  }
  return { s, runs, MAX_STEPS_KEY, MAX_STEPS_CHOICES, maxSteps, METHOD_JA, methodsFor, methodOf, rows, targetsSig, restRows,
    runeNeeded, orderKeys, moveOrder, addRune, removeRune, runeChoices, toggleRune, orderRow, runeJa, redoPlan, redoOf,
    REDO_METHOD_JA, patternStart, fractureRows, fracMembers, fractureRow, makeRoute, blocker, boughtDivine, magicDivine,
    whiteDivine, fourDivine, itemDivine, exOf, toExalt, num, PRICE_KEY, keptAll, craftCap, socketCap, sockets, socketsOk,
    socketCount, socketQuery, keptKey, kept, loadKept, saveKept, restoring, ageOf };
}
export type SimTargetsCtx = ReturnType<typeof useSimTargets>;
