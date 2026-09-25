/**
 * useProbLab.ts — 確率実験場 (2026-09-25)
 *
 * オーナー:「こういうどっちがいいの問題早めに解決したい。確率実験場って作って、ベースやアイテムレベル・MOD 一覧を簡単に
 * 選択できるようにして確率計算機を作ろうか、クラフト計算機の下に」。
 * ベース・アイテムレベル・狙いの MOD と段を選ぶと、取り方ごと (完全 / 上級 / 普通の高貴 × 触媒 無し / 20% / 40%、冒涜 骨 × 光 or 天体、
 * カオス) に 1 回の当たり・1 回の値段・外れ 1 回のやり直し・見込みを、その時の相場で出す。押せば 2,000 回回して平均と 8 割・9 割を並べる。
 * 外れの消し方は「その側の消去のお告げ」(その側に他の狙いが無ければ確定。あれば巻き込む分を足す)。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { loadHtcPatch } from "../../services/htc/patch";
import { itemBaseFor, sideLimits } from "../../services/htc/bridge";
import { buildHtcPrices } from "../../services/htc/prices";
import { catalysingMultiplier, catalystCountFor, catalystPriceKey, maxQualityForBase } from "../../services/htc/catalysing";
import { catalystsFor } from "../../services/htc/quality";
import { jaOfMod } from "../../services/htc/mod-text";
import { simulateTreeChunked, type SimNode, type SimState } from "../../services/htc/sim-route";
import { indexPrices, pricesForBase, type Prices } from "../../vendor/poe2htc/optimizer/cost";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { marketStore } from "../../state/market-store";
import { displayCurrency } from "../../state/display-currency";
import itemsJaClient from "../../i18n/items-ja-client.json";
import type { Side } from "../../services/htc/step-odds";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

const OMEN_EX: Record<Side, string> = { prefix: "OmenofSinistralExaltation", suffix: "OmenofDextralExaltation" };
const OMEN_AN: Record<Side, string> = { prefix: "OmenofSinistralAnnulment", suffix: "OmenofDextralAnnulment" };
const OMEN_CR: Record<Side, string> = { prefix: "OmenofSinistralCrystallisation", suffix: "OmenofDextralCrystallisation" };
const OMEN_NE: Record<Side, string> = { prefix: "OmenofSinistralNecromancy", suffix: "OmenofDextralNecromancy" };
const OMEN_ER: Record<Side, string> = { prefix: "OmenofSinistralErasure", suffix: "OmenofDextralErasure" };
const BREACH_FAMILY = "LocalMaximumQuality";

export interface LabRow {
  key: string;
  method: string;
  detail: string;
  /** 1 回で当たる確率 */
  p: number;
  perTry: number;
  perMiss: number;
  /** やり直しが確定 (他を巻き込まない) か */
  safe: boolean;
  expected: number;
  /** 回した結果 */
  sim?: { tries: number; misses: number; expected: number; p80: number; p90: number; pDone: number } | "running";
  why?: string;
  /** 回す用 */
  nodes: SimNode[];
  start: SimState;
}

export function useProbLab() {
  const data = shallowRef<PatchData | null>(null);
  const prices = shallowRef<Prices | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);
  const baseName = ref("Gold Ring");
  const itemLevel = ref(82);
  const modId = ref<string | null>(null);
  const minTier = ref(0);
  /** その側に他の狙い (固定でない) が何個あるか。消去で巻き込む */
  const othersOnSide = ref(0);
  /** それらを作り直す費用 (神)。巻き込んだ時のやり直しに足す */
  const redoOthersDivine = ref(100);
  const priceLabel = ref("");
  /** 回す回数 (既定 2,000。オーナー 2026-09-25:「デフォは 2000 回で、回数変えれるように」) */
  const runs = ref(2000);
  /** 回した回数ごとの結果を残す (比べやすいように、表の上に前回の設定と結果を貼っておける) */
  const pinned = shallowRef<Array<{ title: string; rows: LabRow[] }>>([]);

  const jaOfBase = (en: string): string => (itemsJaClient as Record<string, string>)[en] ?? en;
  const money = (ex: number | null | undefined): string => displayCurrency.money(ex, { round: "up", ladder: "top" });

  async function ensure(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    try {
      if (!data.value) data.value = await loadHtcPatch();
      await marketStore.ensureMarket(5 * 60 * 1000);
      const built = buildHtcPrices();
      const cls = data.value ? itemBaseFor(data.value, baseName.value) : null;
      prices.value = cls ? pricesForBase(indexPrices(built.file), cls) : indexPrices(built.file);
      priceLabel.value = built.coverage.fetchedLabel;
      error.value = null;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  /** ベースの一覧 (日本語名の辞書にある物だけ、クラスごと) */
  const bases = computed(() => {
    const d = data.value;
    if (!d) return [] as Array<{ cls: string; names: string[] }>;
    const out: Array<{ cls: string; names: string[] }> = [];
    for (const [clsName, cls] of d.bases) {
      const names = (cls.bases ?? []).filter((n) => (itemsJaClient as Record<string, string>)[n]);
      if (names.length) out.push({ cls: clsName, names });
    }
    return out;
  });
  const cls = computed(() => (data.value ? itemBaseFor(data.value, baseName.value) : null));
  const limits = computed(() => (data.value ? sideLimits(data.value, baseName.value) : { prefix: 3, suffix: 3 }));
  /** そのベースに付く普通の MOD (プレ / サフィ)。段の数と最上段の値も */
  const mods = computed(() => {
    const d = data.value, c = cls.value;
    if (!d || !c) return [] as Array<{ id: string; side: Side; name: string; tiers: number }>;
    const list = (side: Side) => (c.pools.normal[side === "prefix" ? "prefixes" : "suffixes"] ?? [])
      .map((id) => d.mods.get(id)).filter((m): m is Mod => !!m && m.source === "normal")
      .map((m) => ({ id: m.id, side, name: jaOfMod(m), tiers: m.tiers.length }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
    return [...list("prefix"), ...list("suffix")];
  });
  const mod = computed(() => (modId.value && data.value ? data.value.mods.get(modId.value) ?? null : null));
  const tiers = computed(() => (mod.value?.tiers ?? []).map((t, i) => ({ index: i, ilvl: t.ilvl, weight: t.weight, ranges: (t.ranges ?? []).map((r) => `${r[0]}-${r[1]}`).join(" / ") })));
  watch([baseName, data], () => { if (mods.value.length && !mods.value.some((m) => m.id === modId.value)) modId.value = mods.value[0]!.id; void ensure(); });
  /** 段の既定 = そのアイテムレベルで出る一番上の段 (上の段はレベルが足りず永久に出ない) */
  const topReachable = (): number => {
    const ts = mod.value?.tiers ?? [];
    let best = 0;
    ts.forEach((t, i) => { if (t.ilvl <= itemLevel.value) best = i; });
    return best;
  };
  watch(modId, () => { minTier.value = topReachable(); });
  watch(itemLevel, () => { if ((mod.value?.tiers[minTier.value]?.ilvl ?? 0) > itemLevel.value) minTier.value = topReachable(); });
  /** 触媒の品質 (オーナー 2026-09-25:「触媒は 40% で使うものとして設定」。ブリーチのある指輪はその上限 + 20) */
  const catalystQuality = ref<"max" | "20">("max");

  /** 使う物の値段 (その時の相場)。表の数字の元が見えるように (オーナー 2026-09-25:「値段」) */
  const usedPrices = computed(() => {
    const p = prices.value, m = mod.value;
    if (!p) return [] as Array<{ name: string; price: number }>;
    const cur = (k: string): number => p.currency[k] ?? p.omens[k] ?? NaN;
    const side: Side = m?.type === "prefix" ? "prefix" : "suffix";
    const sideJa = side === "prefix" ? "左側" : "右側";
    const list: Array<[string, string]> = [
      ["神のオーブ", "divine"], ["完全の高貴", "exalt_perfect"], ["上級の高貴", "exalt_greater"], ["高貴", "exalt"], ["カオス", "chaos"], ["消去", "annul"],
      [`${sideJa}の高貴なお告げ`, OMEN_EX[side]], [`${sideJa}の消去のお告げ`, OMEN_AN[side]], [`${sideJa}の抹消のお告げ`, OMEN_ER[side]], ["触媒の高貴のお告げ", "OmenofCatalysingExaltation"],
      ...(m ? catalystsFor(m).map((c) => [`${c.tag} のカタリスト`, catalystPriceKey(c.tag)] as [string, string]) : []),
      ["普通の骨", "desecrate"], ["古代の骨", "desecrate_ancient"], [`${sideJa}のネクロマンシー`, OMEN_NE[side]], ["反響のお告げ", "OmenofAbyssalEchoes"], ["光のお告げ", "OmenofLight"], [`${sideJa}の結晶化`, OMEN_CR[side]],
    ];
    return list.map(([name, k]) => ({ name, price: cur(k) })).filter((x) => Number.isFinite(x.price));
  });
  const rows = shallowRef<LabRow[]>([]);
  function build(): void {
    const d = data.value, p = prices.value, c = cls.value, m = mod.value;
    rows.value = [];
    if (!d || !p || !c || !m) return;
    const cur = (k: string): number => p.currency[k] ?? p.omens[k] ?? Infinity;
    const side: Side = m.type === "prefix" ? "prefix" : "suffix";
    const key = side === "prefix" ? "prefixes" : "suffixes";
    const lv = itemLevel.value, tmin = minTier.value;
    const w = (x: Mod, minIdx: number, floor: number): number => x.tiers.reduce((s, t, i) => s + (i >= minIdx && t.ilvl <= lv && t.ilvl >= floor ? t.weight : 0), 0);
    const poolW = (floor: number, desec: boolean, tag: string | null, mult: number): number =>
      [...c.pools.normal[key], ...(desec ? c.pools.desecrated[key] : [])].reduce((s, id) => {
        const x = d.mods.get(id);
        if (!x) return s;
        const k = tag && catalystsFor(x).some((q) => q.tag === tag) ? mult : 1;
        return s + w(x, 0, floor) * k;
      }, 0);
    const div = p.currency.divine ?? 1;
    const others = othersOnSide.value;
    const redo = redoOthersDivine.value * div;
    // 外れ 1 回 = その側の消去のお告げ + 消去。他の狙いがあれば巻き込む分
    const annulMiss = cur("annul") + cur(OMEN_AN[side]) + (others > 0 ? (others / (others + 1)) * redo : 0);
    const reach = Math.max(...m.tiers.filter((_, i) => i >= tmin).map((t) => t.ilvl), 0);
    const baseQ = maxQualityForBase(baseName.value);
    const out: LabRow[] = [];
    const base = { keep: [] as string[], need: 1, clean: false, maxMods: null, targets: [] as SimNode["targets"] };
    // 開始: 反対側は固定済みで満杯 (消えないし、そちらに付きもしない)。この側は空 + 他の狙い (触らない) が others 個
    const other: Side = side === "prefix" ? "suffix" : "prefix";
    const otherFull = Array.from({ length: limits.value[other] }, () => ({ modId: null, side: other, fixed: true }));
    const startOf = (extra: Partial<SimState>): SimState => ({
      slots: [...otherFull, ...Array.from({ length: others }, () => ({ modId: null, side, fixed: false, keep: true }))],
      breach: false, ...extra,
    });
    const target = [{ modId: m.id, minTier: tmin }];
    const tags = catalystsFor(m).map((q) => q.tag).sort((a, b) => cur(catalystPriceKey(a)) - cur(catalystPriceKey(b)));
    for (const [orb, floor, label] of [["exalt_perfect", 50, "完全の高貴"], ["exalt_greater", 35, "上級の高貴"], ["exalt", 0, "普通の高貴"]] as const) {
      if (reach < floor) { out.push({ key: orb, method: label, detail: "段が届かない (このオーブは段の下限より上しか出ない)", p: 0, perTry: 0, perMiss: 0, safe: true, expected: Infinity, why: "段が届かない", nodes: [], start: startOf({}) }); continue; }
      const qCat = catalystQuality.value === "20" ? 20 : baseQ + 20;
      const variants: Array<{ q: number; tag: string | null }> = [{ q: 0, tag: null }, ...tags.map((tag) => ({ q: qCat, tag }))];
      for (const v of variants) {
        const mult = v.tag ? catalysingMultiplier(v.q) : 1;
        const pHit = (w(m, tmin, floor) * mult) / poolW(floor, false, v.tag, mult);
        const refill = v.tag ? cur("OmenofCatalysingExaltation") + catalystCountFor(v.q) * cur(catalystPriceKey(v.tag)) : 0;
        const perTry = cur(orb) + cur(OMEN_EX[side]) + refill;
        const tries = 1 / pHit;
        const nodes: SimNode[] = [
          ...(v.tag ? [{ ...base, id: "q", action: { kind: "quality" as const, catalyst: v.tag }, onHit: "e", onMiss: null }] : []),
          { ...base, id: "e", action: { kind: "exalt", tier: orb, side, catalyst: v.tag }, targets: target, onHit: "done", onMiss: "x" },
          { ...base, id: "x", action: { kind: "annul", side }, onHit: "e", onMiss: "e" },
        ];
        out.push({
          key: `${orb}:${v.tag ?? ""}:${v.q}`, method: `${label} + ${side === "prefix" ? "左側" : "右側"}のお告げ`,
          detail: v.tag ? `触媒 ${v.q}% (${v.tag} のカタリスト ${money(cur(catalystPriceKey(v.tag)))} × ${catalystCountFor(v.q)} 個)` : "触媒なし",
          p: pHit, perTry, perMiss: annulMiss, safe: others === 0, expected: perTry * tries + annulMiss * (tries - 1),
          nodes, start: startOf(v.tag ? { breach: v.q > baseQ, quality: v.q, qualityTag: v.tag } : {}),
        });
      }
    }
    // 冒涜 (骨 × 光 / 天体で上書き)。上書きは枠 2 つで残りが固定の時だけ
    const ess = [...d.mods.values()].filter((x) => x.id.startsWith(m.id.split("/")[0] + "/") && CRAFTED_SOURCES.has(x.source) && x.type === m.type && x.family !== BREACH_FAMILY)
      .map((x) => ({ id: x.id, price: cur(`essence:perfect:${x.id}`) })).filter((x) => Number.isFinite(x.price)).sort((a, b) => a.price - b.price)[0];
    for (const [bone, floor, label] of [["desecrate", 0, "普通の骨"], ["desecrate_ancient", 40, "古代の骨"]] as const) {
      if (reach < floor) { out.push({ key: bone, method: `冒涜 (${label})`, detail: "段が届かない", p: 0, perTry: 0, perMiss: 0, safe: true, expected: Infinity, why: "段が届かない", nodes: [], start: startOf({}) }); continue; }
      const p1 = w(m, tmin, floor) / poolW(floor, true, null, 1);
      const pHit = 1 - (1 - p1) ** 6;
      const perTry = cur(bone) + cur(OMEN_NE[side]) + cur("OmenofAbyssalEchoes");
      const canOw = limits.value[side] === 2 && others === 0 && !!ess;
      for (const rr of ["light", "overwrite"] as const) {
        if (rr === "overwrite" && !canOw) { out.push({ key: `${bone}:ow`, method: `冒涜 (${label}) + 天体で上書き`, detail: "枠 2 つで残りがフラクチャーの側だけ", p: pHit, perTry, perMiss: 0, safe: true, expected: Infinity, why: "この形では使えない", nodes: [], start: startOf({}) }); continue; }
        const perMiss = rr === "light" ? cur("OmenofLight") + cur("annul") : cur(OMEN_CR[side]) + ess!.price;
        const tries = 1 / pHit;
        const nodes: SimNode[] = rr === "light" ? [
          { ...base, id: "d", action: { kind: "desecrate", side, bone, echoes: true }, targets: target, onHit: "done", onMiss: "l" },
          { ...base, id: "l", action: { kind: "light" }, onHit: "d", onMiss: "d" },
        ] : [
          { ...base, id: "d", action: { kind: "desecrate", side, bone, echoes: true }, targets: target, onHit: "done", onMiss: "o" },
          { ...base, id: "o", action: { kind: "essence", modId: ess!.id, removeSide: side }, onHit: "d", onMiss: null },
        ];
        out.push({ key: `${bone}:${rr}`, method: `冒涜 (${label}、反響あり) + ${rr === "light" ? "光 + 消去" : "天体で上書き"}`, detail: `1 候補 ${(p1 * 100).toFixed(2)}%、6 候補で`, p: pHit, perTry, perMiss, safe: true, expected: perTry * tries + perMiss * (tries - 1), nodes, start: startOf({}) });
      }
    }
    // カオス (普通 / 上級 / 完全)。外れはカオスで消えるので消去は要らない。何も守る物が無い時 (両側に空きがある前提で半々) と、
    // 抹消のお告げでその側だけ入れ替える時 (反対側は固定済みで埋まっている)
    const otherPool = [...c.pools.normal[side === "prefix" ? "suffixes" : "prefixes"]];
    for (const [orb, floor, label] of [["chaos", 0, "カオス"], ["chaos_greater", 35, "上級のカオス"], ["chaos_perfect", 50, "完全のカオス"]] as const) {
      if (reach < floor) { out.push({ key: orb, method: label, detail: "段が届かない", p: 0, perTry: 0, perMiss: 0, safe: true, expected: Infinity, why: "段が届かない", nodes: [], start: startOf({}) }); continue; }
      const pHit = w(m, tmin, floor) / (poolW(floor, false, null, 1) + otherPool.reduce((s, id) => { const x = d.mods.get(id); return x ? s + w(x, 0, floor) : s; }, 0));
      const perTry = cur(orb);
      out.push({ key: orb, method: `${label} (何も付いていない状態で打ち続ける)`, detail: "外れは打ち直し。両側に出るので半々", p: pHit, perTry, perMiss: 0, safe: others === 0, expected: perTry / pHit,
        nodes: [{ ...base, id: "c", action: { kind: "chaos", tier: orb }, targets: target, onHit: "done", onMiss: "c" }], start: { slots: [{ modId: null, side, fixed: false }], breach: false } });
      const pErs = w(m, tmin, floor) / poolW(floor, false, null, 1);
      const perTry2 = cur(orb) + cur(OMEN_ER[side]);
      out.push({ key: `${orb}:erasure`, method: `${label} + ${side === "prefix" ? "左側" : "右側"}の抹消のお告げ`, detail: "その側だけ入れ替える (反対側は埋まっている)", p: pErs, perTry: perTry2, perMiss: 0, safe: others === 0, expected: perTry2 / pErs,
        nodes: [{ ...base, id: "c", action: { kind: "chaos", tier: orb, side }, targets: target, onHit: "done", onMiss: "c" }], start: startOf({ slots: [...otherFull, { modId: null, side, fixed: false }] }) });
    }
    rows.value = out.sort((a, b) => a.expected - b.expected);
  }
  watch([mod, minTier, itemLevel, othersOnSide, redoOthersDivine, prices, catalystQuality], () => build());

  const running = ref(false);
  async function runAll(): Promise<void> {
    if (running.value) return;
    running.value = true;
    try {
      // 回す前に相場 (カレンシーランキング) を取り直してから値段を決める (オーナー 2026-09-25:「使うカレンシーとかはランキング更新後取得してね」)。
      // 5 分以内に取った物はそのまま。値段が変われば表を作り直してから回す
      await ensure();
      build();
      const d = data.value, p = prices.value, c = cls.value;
      if (!d || !p || !c) return;
      const ctx = { data: d, cls: c, prices: p, itemLevel: itemLevel.value, limits: limits.value, catalystOk: () => true, baseQuality: maxQualityForBase(baseName.value) };
      for (const r of rows.value) {
        if (r.why || !r.nodes.length) continue;
        r.sim = "running"; rows.value = [...rows.value];
        const res = await simulateTreeChunked({ ctx, start: r.start, nodes: r.nodes, runs: Math.max(100, runs.value | 0), maxActions: 5000 });
        const main = res.perNode.find((x) => x.id === "e" || x.id === "d" || x.id === "c");
        r.sim = { tries: main?.tries ?? 0, misses: Math.max(0, (main?.tries ?? 1) - 1), expected: res.expected, p80: res.p80, p90: res.p90, pDone: res.pDone };
        rows.value = [...rows.value];
      }
    } finally {
      running.value = false;
    }
  }

  /** 今の表を留めておく (設定を変えて比べる用) */
  function pin(): void {
    const m = mod.value;
    if (!m || !rows.value.length) return;
    const title = `${jaOfBase(baseName.value)} / ilvl ${itemLevel.value} / ${jaOfMod(m)} T${m.tiers.length - minTier.value} 以上 / 同じ側の他の狙い ${othersOnSide.value}`;
    pinned.value = [{ title, rows: rows.value.map((r) => ({ ...r })) }, ...pinned.value].slice(0, 6);
  }
  function unpin(i: number): void { pinned.value = pinned.value.filter((_, k) => k !== i); }

  return { data, prices, error, loading, baseName, itemLevel, modId, minTier, othersOnSide, redoOthersDivine, priceLabel, runs, pinned, usedPrices, catalystQuality, bases, cls, limits, mods, mod, tiers, rows, running, ensure, build, runAll, pin, unpin, jaOfBase, money };
}
