/**
 * useStartSearch.ts — 始め方: 候補を選んで、押した時だけ探す (2026-09-24)
 *
 * オーナー:「ベースの所で複数選択で開始フラクチャー選びたいな。その時点で検索かけたいから、やっぱ取得は手動がいい。
 * 真ん中は結果表示にしよう。取得後に表示する形で徐々にやってく感じでいい」。
 * 候補は樹 MOD と作る側の関係で変わる ([[start-kind.ts]]):
 *   none     … 作る MOD のうち普通に付く物から「○○ を固定」。1 つ 3 本 (固定済み / 厳しい / ゆるい)
 *   fix      … 「樹 MOD を固定」の 1 択 (重い側の樹 MOD だけ固定済み、他の樹 MOD は付いていればいい)。3 本
 *   separate … 固定不要。「フラクチャー無し」と「重い側の狙いが固定済み」(オーナー:「プレのフラクチャー品もしくは
 *              フラクチャー無しに絞ったらよくね。成功率段違いでしょ、安いならやけど」)。1 つ 1 本 (最安 1 件)、
 *              比べるのは 買う値段 + 残りを作る見込み ([[craft-estimate.ts]])
 *   unsafe   … クラフト非推奨。候補は出さない
 * 条件に入れるのはクラフトでどうにもならない MOD (樹 MOD) だけ。冒涜の MOD は後で付けられるので入れない (オーナー 2026-09-24)。
 *   - チェックは既定 2 つ、3 つまで。1 つ 3 本 (1 本 = 検索 + 取得)。門番が検索 + 取得の合計を 5 分 22 回 (≈ 13.6 秒に 1 回、
 *     貯めれば 6 回まで続けて) で流し、5 分の合計も見張るので、3 つ + 完成品だと数分かかる
 *   - 「探す」で上から 1 つずつ取り、取れた物から真ん中に出す (30 分は覚えておく)。最後に完成品を 1 本
 *   - 真ん中で選んだ物が始め方 (固定済みの MOD を差し替え、ツリーの開始の指輪もそれになる)
 */
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../services/trade2/query";
import { tradeAuto } from "../../services/trade2/auto-price";
import { autoPriceCached } from "../../services/trade2/query-cache";
import { marketStore } from "../../state/market-store";
import { startRows, type StartRow } from "./start-rows";
import { startKindOf } from "./start-kind";
import { craftEstimate, estimateSettled, spawnChance } from "./craft-estimate";
import { zeroStart } from "./craft-settings";
import type { TreeResult } from "./useTreeSearch";
import type { useHtcCraft } from "./useHtcCraft";

/** 同時に探せるのは 3 つまで (オーナー 2026-09-24) */
export const MAX_STARTS = 3;
/** 既定でチェックしておく数 */
export const DEFAULT_STARTS = 2;
const TREE_ONLY = "__tree__";
const CLEAN = "__clean__";

export interface StartCandidate {
  key: string;
  /** 固定済みにする普通の MOD (無ければ空) */
  modIds: string[];
  name: string;
  side: "P" | "S" | null;
  /**
   * その側に 1 回付けた時に、この MOD (狙いの段以上) が出る確率。ベースの MOD 一覧 (normal) の重みの割合、ilvl で出ない段は除く。
   * オーナー 2026-09-24:「ベースにそれぞれ付く可能性の % を書いて、高い順に並べよう。それぞれプレとサフィに」
   */
  chance: number | null;
}
/** 固定不要の時の 1 本の結果 (最安 1 件、値段は高貴換算) */
type SideResult = { kind: "side"; price: number | null; total: number; url: string | null; error?: string };

export function useStartSearch(c: ReturnType<typeof useHtcCraft>, afterAll: () => Promise<void>) {
  const kind = computed(() => startKindOf(c));
  // 樹 MOD の固定の検索 (3 本) は、重い側の樹 MOD だけを固定済みにする
  watch(() => kind.value.fixSide, (x) => { c.treeFixSide.value = x; }, { immediate: true });

  const candidates = computed<StartCandidate[]>(() => {
    const k = kind.value.kind;
    if (k === "unsafe") return [];
    if (k === "fix") return [{ key: TREE_ONLY, modIds: [], name: "樹 MOD を固定", side: null, chance: null }];
    const d = c.data.value;
    const mods = c.targets.value
      .filter((t) => d?.mods.get(t.modId)?.source === "normal")
      .map((t) => {
        const side = d!.mods.get(t.modId)!.type === "prefix" ? "P" as const : "S" as const;
        const chance = spawnChance(c, t.modId, t.minTierIndex ?? 0);
        const label = c.stepTarget([t.modId]);
        return { key: t.modId, modIds: [t.modId], name: k === "separate" ? `${label} が固定済みの物を買う` : `${label} を固定`, side, chance };
      })
      // 固定不要の時は重い側の狙いだけ (樹 MOD の側を固定済みにしても意味が無い)
      .filter((x) => k !== "separate" || kind.value.craftSide == null || x.side === kind.value.craftSide)
      .sort((a, b) => (b.chance ?? -1) - (a.chance ?? -1));
    return k === "separate" ? [{ key: CLEAN, modIds: [], name: "フラクチャー無しを買う", side: null, chance: null }, ...mods] : mods;
  });
  const checked = ref<string[]>([]);
  const results = shallowRef<Record<string, TreeResult | SideResult | "error">>({});
  const pending = ref<string[]>([]);
  const busy = ref(false);
  /** 始め方に選んだ候補 (人が選ぶまでは一番安い物) */
  const picked = ref<string | null>(null);
  /**
   * 取引所に出品が無かった時に手で入れた値段 (神、候補ごと)。オーナー 2026-09-24:「足りない情報は手動で埋める」。
   * 固定済みを買う (3 本の時) / 買う (固定不要の時) の出品ゼロに効く
   */
  const manual = ref<Record<string, number | null>>({});

  // 解析し直したら、チェックを戻す
  watch(() => [c.item.value, c.base.value, kind.value.kind], () => {
    const k = kind.value.kind;
    const init = k === "fix" ? [TREE_ONLY] : k === "separate" ? [CLEAN] : c.fracturedTargets.value.map((t) => t.modId);
    checked.value = init.filter((x) => candidates.value.some((y) => y.key === x)).slice(0, MAX_STARTS);
    // 貼り付けに固定済みが無ければ、一番出にくい普通の MOD を固定する候補にしておく (押せばすぐ探せる。忍者のコピーは
    // フラクチャーの印が無いので、これが無いと毎回選び直しだった。2026-09-25)
    if (!checked.value.length && k === "none") {
      const rare = [...candidates.value].filter((x) => x.chance != null).sort((x, y) => (x.chance ?? 1) - (y.chance ?? 1));
      // 既定は出にくい順に 2 つ (オーナー 2026-09-26:「3 番目で大抵分かる」。取引所は検索と取得を合わせて 5 分 22 本までで、
      // 3 つ全部検索は約 20 本 = 約 3 分、2 つなら約 14 本 = 約 2 分)。自分で 3 つにすればそのまま 3 つとも全部検索する
      checked.value = rare.slice(0, DEFAULT_STARTS).map((x) => x.key);
    }
    results.value = {};
    picked.value = null;
    manual.value = {};
  }, { immediate: true });

  /** 固定不要の時の検索: 樹 MOD (固定の有無は問わない) + 固定済みにする狙い (あれば)。無ければフラクチャー: いいえ */
  function sideQuery(modIds: readonly string[]) {
    const d = c.data.value;
    const buys = c.planFor([])?.buys ?? [];
    if (!d || !buys.length) return null;
    const tree = buys.flatMap((b) => b.filters.map((f) => ({ id: f.id.replace(/^fractured\./, `${b.plain}.`), min: f.min ?? 0 })));
    const { filters, unmatched } = tradeFiltersFor(d, c.targets.value.filter((t) => modIds.includes(t.modId)));
    if (unmatched.length) return null;
    return buildSpecQuery({
      ...(c.item.value?.baseType ? { baseType: c.item.value.baseType } : {}),
      rarity: "nonunique",
      ilvlMin: c.item.value?.itemLevel ?? zeroStart.value.itemLevel,
      stats: [...tree, ...filters.map((f) => ({ id: f.id.replace(/^explicit\./, "fractured."), min: f.min }))],
      ...(modIds.length ? {} : { fracturedItem: false }),
      grantedSkill: c.item.value?.grantedSkill ?? null,
    });
  }
  async function searchSide(modIds: readonly string[]): Promise<SideResult | null> {
    const q = sideQuery(modIds);
    if (!q) return null;
    const r = await autoPriceCached(marketStore.league.value?.Value ?? "Standard", q, marketStore.rates.value, 1);
    if (!r) return { kind: "side", price: null, total: 0, url: null, error: tradeAuto.lastError.value ?? "取れませんでした" };
    return { kind: "side", price: r.minExalted ?? null, total: r.total, url: r.searchUrl || null };
  }

  /** 今探している候補 (何番目か・3 本のどれか)。真ん中と上の要約に「今なにで止まっているか」を出す */
  const current = ref<{ key: string; name: string; index: number; count: number; step: string } | null>(null);
  async function searchAll(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    c.diagBusy.value = true;
    // 打ち切り (入口に戻る・画面を離れる): 世代が進んだら次は投げず、戻ってきた結果も捨てる
    const gen = c.fetchGen.value;
    const alive = (): boolean => c.fetchGen.value === gen;
    const keys = candidates.value.filter((x) => checked.value.includes(x.key));
    pending.value = keys.map((x) => x.key);
    try {
      // 候補ごとに 3 本 (固定済み / 固定無し・ゆるい / 厳しい) を全部取る (オーナー 2026-09-26:「そっちでやろう」。
      // 固定済みだけにすると、固定済みは高いが固定無しなら安い候補を見逃していた)。1 回の貼り付けで最大 9 本 + 完成品。
      // 門番が検索 + 取得の合計を ≈ 13.6 秒に 1 回 (バースト 6、5 分 22 回) で流し、超える分は待ってから投げる
      for (const [i, cand] of keys.entries()) {
        if (!alive()) return;
        const at = (step: string) => {
          current.value = { key: cand.key, name: cand.name, index: i + 1, count: keys.length, step };
          c.stage.value = `② 始め方を探しています (${i + 1}/${keys.length}) ${cand.name}: ${step}`;
        };
        at(kind.value.kind === "separate" ? "最安 1 件" : "固定済み");
        const r = kind.value.kind === "separate"
          ? await searchSide(cand.modIds).catch(() => null)
          : await c.searchFor(cand.modIds, at, alive).catch(() => null);
        if (!alive()) return;
        results.value = { ...results.value, [cand.key]: r ?? "error" };
        pending.value = pending.value.filter((k) => k !== cand.key);
      }
      current.value = null;
      c.stage.value = "③ 完成品を探しています…";
      await afterAll();
    } finally {
      busy.value = false;
      pending.value = [];
      current.value = null;
      if (alive()) {
        c.stage.value = "";
        c.diagBusy.value = false;
        c.phase.value = "done";
      }
    }
  }

  const div = computed(() => c.prices.value?.currency.divine ?? 1);
  /** 固定不要の 1 本 → 始め方の行 1 つ (買う値段 + 残りを作る見込み) */
  function sideRow(res: SideResult, modIds: readonly string[], manualDivine: number | null): StartRow {
    const link = res.url ? { text: `${res.total} 件`, url: res.url } : null;
    if (res.error) return { id: "buy", label: "買う", cost: null, note: `取れず: ${res.error}`, link, manual: false, status: "取れず" };
    // 出品が無ければ手で入れた値段 (神) で
    const price = res.price ?? (manualDivine != null && manualDivine > 0 ? manualDivine * div.value : null);
    if (price == null) return { id: "buy", label: "買う", cost: null, note: "", link, manual: true, status: "出品なし" };
    const est = craftEstimate(c, modIds);
    return {
      id: "buy", label: "買う + 残りを作る", cost: est != null ? price + est.value : null, link, manual: res.price == null, status: "作る見込みが出せない",
      note: `買う ${c.money(price)}${res.price == null ? " (手で入れた値段)" : ""}${est != null ? ` + 作る見込み ${c.money(est.value)} (${est.basis})` : ""}`,
    };
  }
  /** 探した候補ごとの行と一番安い物。安い順 (取れていない物は後ろ) */
  const rows = computed(() => candidates.value
    .filter((x) => checked.value.includes(x.key) || results.value[x.key])
    .map((x) => {
      const res = results.value[x.key];
      const side = res && res !== "error" && "kind" in res ? res : null;
      const m = manual.value[x.key] ?? null;
      const sub0: StartRow[] = side ? [sideRow(side, x.modIds, m)]
        : res && res !== "error" ? startRows(res as TreeResult, div.value, { busy: false, manualDivine: m }) : [];
      // 行ごとの合計 = 初動 + 作る見込み (固定しない行はその MOD を触らない扱いの見込み)。一番安い行はこの合計で選ぶ
      // (2026-09-25: 初動だけで選んでいて、22 神の「固定しない」素材が 3 万神の作り方になっていた)
      const est = craftEstimate(c, x.modIds), estKeep = craftEstimate(c, [], { keepIds: x.modIds });
      const sub = sub0.map((r) => {
        const e = r.id === "keep" ? estKeep : est;
        const total = r.cost == null ? null : r.id === "buy" ? r.cost : e ? r.cost + e.value : null;
        return { ...r, total };
      }).sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
      const best = sub.find((y) => y.total != null) ?? sub.find((y) => y.cost != null) ?? null;
      /** 完成品の比べに渡す初動 (買う値段だけ。作る見込みは向こうで足す) */
      const startCost = side ? side.price ?? (m != null && m > 0 ? m * div.value : null) : best?.cost ?? null;
      return { ...x, res, sub, best, startCost, waiting: pending.value.includes(x.key) };
    })
    .sort((a, b) => (a.best?.total ?? a.best?.cost ?? Infinity) - (b.best?.total ?? b.best?.cost ?? Infinity)));
  const chosen = computed(() => rows.value.find((x) => x.key === picked.value && x.best) ?? rows.value.find((x) => x.best) ?? null);

  /**
   * 3 つの道を一気に比べる (オーナー 2026-09-25:「結局買うのがいいのか、途中からクラフトがいいのか、自分でベース買って
   * フラクチャーするのがいいのかが知りたい、一気に」)。候補の行ごとに 初動 + 作る見込み を出し、道ごとの最安を返す。
   *   fixed = 固定済み (フラクチャー済み) の素材を買って作る / self = 固定無しを買って自分でフラクチャーして作る
   */
  const threeWay = computed(() => {
    const out: { fixed: { cost: number; label: string; url: string | null } | null; self: { cost: number; label: string; url: string | null } | null } = { fixed: null, self: null };
    for (const x of rows.value) {
      for (const r of x.sub) {
        if (r.total == null) continue;
        const total = r.total;
        const which = r.id === "fractured" || r.id === "buy" || r.id === "keep" ? "fixed" : "self";
        const cur = out[which];
        if (!cur || total < cur.cost) out[which] = { cost: total, label: `${x.name}: ${r.label}${r.note ? ` (${r.note})` : ""}`, url: r.link?.url ?? null };
      }
    }
    return out;
  });

  /**
   * 全部の候補の見積もりが本物まで届いたら、その時一番安い物を始め方に決めて固定する (2026-09-26 レビュー B: 決めないままだと、
   * 見積もりが後から届くたびに「一番安い始め方」が入れ替わり、そのたびに固定し直し → ツリーと完成品の結果が消えていた)
   */
  const settled = computed(() => !busy.value && rows.value.length > 0 && rows.value.every((x) =>
    !x.res || x.res === "error" || (estimateSettled(c, x.modIds) && estimateSettled(c, [], { keepIds: x.modIds }))));
  watch(settled, (ok) => { if (ok && picked.value == null) picked.value = rows.value.find((x) => x.best)?.key ?? null; });
  // 選んだ候補の固定済みにして、ツリーの開始の指輪と確認用の表 (treeResult) をそれに合わせる
  watch(chosen, async (x) => {
    c.startPrice.value = x?.startCost ?? null;
    if (!x || x.res === "error" || !x.res) return;
    // 「固定無しを買ってそのまま作る」なら固定ではなく触らない狙い (2026-09-25: 固定扱いにしていて、消去で巻き込む形を
    // 確定と見ていた)
    const keep = x.best?.id === "keep";
    const fixedIds = keep ? [] : x.modIds;
    const keepIds = keep ? [...x.modIds] : [];
    if (keepIds.join() !== c.startKeep.value.join()) c.startKeep.value = keepIds;
    const same = fixedIds.length === c.fracturedTargets.value.length && fixedIds.every((id) => c.fracturedTargets.value.some((t) => t.modId === id));
    if (!same) c.setFractured(fixedIds);
    await nextTick();
    if (!("kind" in x.res)) c.treeResult.value = x.res;
  });

  return {
    kind, candidates, checked, busy, current, searchAll, rows, chosen, manual, threeWay,
    setManual: (key: string, v: number | null) => { manual.value = { ...manual.value, [key]: v }; },
    choose: (key: string) => { picked.value = key; },
    locked: (key: string) => !checked.value.includes(key) && checked.value.length >= MAX_STARTS,
  };
}
