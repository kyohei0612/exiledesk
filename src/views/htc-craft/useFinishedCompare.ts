/**
 * useFinishedCompare.ts — 完成品を買うのと、作るのと (2026-09-24)
 *
 * オーナー:「あとは完成品か。比較対象ないよね今」。09-22 の「作るのと買うの、どっちが安いか」([[buy-or-craft.ts]]) を
 * 診断カードに戻した (1 手ずつの一覧カードを外した時に一緒に消えていた)。
 *   - 完成品を買う … 同じ MOD 構成の最安。狙いは素の段の下限、普通 / 固定済み / 冒涜のどれでもいい (build の説明)。
 *     コラプト無し・ユニーク以外・ilvl 以上。始め方の「探す」の最後に 1 本 (手動)。取引所に無ければ手で値段を入れる
 *     (貼り付けの画面の「完成品の売値」欄は外した。オーナー 2026-09-24:「ここいらんくね」)
 *   - 作る見込み   … 始め方の初動 + スパムの組み立て (自動) の平均。**あくまで目安** (1 手ずつは人が選ぶ)。
 *     自動の組み立てが組めない時 (品質 40% の順番が決まらない半影の指輪など) は、狙いを 1 つずつ付ける平均
 *     ([[step-odds.ts]] の一番安い打ち方、外れの消去込み) の合計で出す。付けた物が消える分は入らないので安めに出る
 */
import { computed, ref, shallowRef, watch } from "vue";
import { tradeCategoryOf, tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../services/trade2/query";
import { tradeAuto } from "../../services/trade2/auto-price";
import { autoPriceCached } from "../../services/trade2/query-cache";
import { marketStore } from "../../state/market-store";
import { zeroStart } from "./craft-settings";
import { matchKey } from "../../services/htc/bridge-index";
import { craftEstimate, spawnChance } from "./craft-estimate";
import { jaOfPastedLine } from "../../services/htc/mod-text";
import { sessionLoggedIn } from "../../services/trade-history";
import type { useHtcCraft } from "./useHtcCraft";

/** 完成品の検索のゆるさ (full → light → min の順に軽い) */
type Level = "full" | "light" | "min";

export function useFinishedCompare(
  c: ReturnType<typeof useHtcCraft>,
  /** 始め方で選ばれた物の初動 (高貴換算)。無ければ null */
  startCost: { readonly value: number | null },
) {
  /**
   * 完成品の検索。**一番ゆるく** (オーナー 2026-09-24:「完成品はフラクチャー指定なしやったら MOD だけ見てくれるでしょ。
   * 完成品こそ一番ゆるくしたい」)。取引所は同じ MOD を 普通 (explicit.) / 固定済み (fractured.) / 冒涜 (desecrated.) で
   * 別に持つ (冒涜で付いた普通の MOD は冒涜の方に入る。trade2-stats の Desecrated に最大マナ・耐性なども並ぶ) ので、
   *   full  … どの MOD も 3 つのどれでもいい (樹 MOD は普通 / 固定済み)
   *   light … 2 択は樹 MOD だけ、他は普通だけ
   *   min   … 2 択も無し (どれも固定済みでない種類だけ)
   * full は条件が多く、ログインしていないと「検索条件が複雑過ぎます」(HTTP 400) で断られる (2026-09-24 実機、エラー文に
   * 「ログインすればこの上限が増えます」)。断られたら light で投げ直す。
   * 完成品には狙い以外の付いている MOD (樹の冒涜 MOD など、[[extraLines]]) も入れる。
   * withMins = false は値 (段の下限) を外して MOD の組み合わせだけ (オーナー 2026-09-24:「完成版で出なかったら MOD の値だけ
   * 消して組み合わせだけで完成品としておけ」)。
   */
  function build(level: Level, withMins = true, drop: ReadonlySet<string> = new Set()) {
    const d = c.data.value, cls = c.base.value;
    if (!d || !cls) return null;
    const got = tradeFiltersFor(d, c.targets.value.filter((t) => !drop.has(t.modId)));
    const unmatched = got.unmatched;
    // ブリーチの「品質の最大値 +20%」は完成品に残っている必要が無い (品質を上げる道具。上げた後は消えても品質は残る)。
    // 代わりに品質の下限で探す (オーナー 2026-09-24:「探す時は品質 40% でかつ 6 MOD のやつ」)
    const filters: { id: string; min?: number }[] = got.filters.filter((f) => f.id !== "crafted.stat_2039822488")
      .map((f) => (withMins ? { id: f.id, min: f.min } : { id: f.id }));
    const q = c.item.value?.quality ?? null;
    if (unmatched.length) return null;
    const bareOf = (id: string): string => id.replace(/^(explicit|fractured|desecrated)\./, "");
    const plain: { id: string; min?: number }[] = [];
    const anyOf: { filters: { id: string; min?: number }[] }[] = [];
    // 樹 MOD は treePlan の買う物にだけ居る (貼り付けで固定済みだった普通の MOD は targets と重なるので 1 度だけ)
    const tree = (c.treePlan.value?.buys ?? []).flatMap((b) => b.filters);
    /** 樹 MOD の固定済みでない時の種類 (異界の MOD は冒涜) */
    const plainOf = new Map((c.treePlan.value?.buys ?? []).flatMap((b) => b.filters.map((f) => [bareOf(f.id), b.plain] as const)));
    const own = new Set(filters.map((x) => bareOf(x.id)));
    const treeKeys = new Set(tree.map((x) => bareOf(x.id)).filter((k) => !own.has(k)));
    const seen = new Set<string>();
    for (const f of [...filters, ...tree.map((x) => ({ id: x.id, min: withMins ? x.min ?? 0 : undefined }))]) {
      const key = bareOf(f.id);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!/^(explicit|fractured|desecrated)\./.test(f.id)) { plain.push(f); continue; }
      // min: 2 択も無し (樹 MOD も固定済みでない種類だけ)。樹 MOD が 3 つあると light でも複雑過ぎと断られた (2026-09-24 金の指輪)
      const kinds = level === "min" ? null : treeKeys.has(key) ? [plainOf.get(key) ?? "explicit", "fractured"] : level === "full" ? ["explicit", "fractured", "desecrated"] : null;
      if (!kinds && treeKeys.has(key)) { plain.push({ id: `${plainOf.get(key) ?? "explicit"}.${key}`, ...(f.min != null ? { min: f.min } : {}) }); continue; }
      if (kinds) anyOf.push({ filters: kinds.map((k) => ({ id: `${k}.${key}`, ...(f.min != null ? { min: f.min } : {}) })) });
      else plain.push(f.min != null ? f : { id: f.id });
    }
    // 狙い以外の付いている MOD (冒涜のみ・作れない)。値は問わず、付いていること (冒涜の物は冒涜で)
    for (const x of extraLines.value) if (!seen.has(x.bare) && !drop.has(`extra:${x.bare}`)) { seen.add(x.bare); plain.push({ id: `${x.desecrated ? "desecrated" : "explicit"}.${x.bare}` }); }
    const baseType = c.item.value?.baseType ?? zeroStart.value.baseType;
    const category = tradeCategoryOf(cls);
    if (!baseType && !category) return null;
    return buildSpecQuery({
      ...(baseType ? { baseType } : {}),
      ...(category ? { category } : {}),
      rarity: "nonunique",
      ilvlMin: c.item.value?.itemLevel ?? zeroStart.value.itemLevel,
      // 品質は段で見る: 41% のような端数は 40% の物 (同じ作り) を落としてしまう (2026-09-25 に 999 神の完成品を逃していた)
      ...(q != null && q > 20 ? { qualityMin: q >= 40 ? 40 : q } : {}),
      stats: plain,
      anyOf,
      grantedSkill: c.item.value?.grantedSkill ?? null,
    });
  }
  /**
   * 狙い以外で完成品に付いている MOD (樹 MOD 以外で繋がらなかった行 = 樹の冒涜 MOD・作れない物)。取引所の stat は、
   * 同じ文面のエンジンの MOD (別のクラスでもいい) の stat から引く (樹の冒涜のミニオンのクールダウンは、アミュの冒涜
   * MOD と同じ stat)。引けない行は入れない
   */
  const extraLines = computed(() => {
    const d = c.data.value, it = c.item.value;
    if (!d || !it) return [];
    const tree = new Set(c.dropOnly.value.map((x) => x.text));
    const byText = new Map<string, string>();
    for (const m of d.mods.values()) if (m.text && !byText.has(matchKey(m.text))) byText.set(matchKey(m.text), m.id);
    return c.skipped.value.filter((t) => !tree.has(t)).flatMap((t): Array<{ bare: string; desecrated: boolean; text: string }> => {
      const line = it.lines.find((l) => l.text === t);
      const modId = line ? byText.get(matchKey(line.template)) : undefined;
      // stat はエンジンの段に無いことがあるので、同じ系統から借りる tradeFiltersFor で引く
      const trade = modId ? tradeFiltersFor(d, [{ modId, minTierIndex: 0 }]).filters[0]?.id : undefined;
      return trade ? [{ bare: trade.replace(/^[a-z]+\./, ""), desecrated: line!.kind === "desecrated", text: t }] : [];
    });
  });
  /**
   * 組み合わせだけでも無い時に外していく順 (オーナー 2026-09-24:「つきやすい確率順で MOD 消して検索かけようか。特にサフィとか
   * クラフト MOD やフラクチャーで探す MOD は優先度低いから外して、徐々に緩くしていこう。値は 0 で MOD が付いていればいい」):
   *   クラフト MOD (エッセンス等)・固定済みで探す MOD → サフィ (付きやすい順) → プレ (付きやすい順) → 樹の冒涜 MOD など。
   * 樹 MOD は外さない (クラフトではどうにもならない物なので)
   */
  const dropOrder = computed(() => {
    const d = c.data.value;
    if (!d) return [];
    const fixed = new Set(c.fracturedTargets.value.map((t) => t.modId));
    // ブリーチの品質の最大値は元から条件に入れていない (品質の下限で探す) ので外す対象にしない
    const ts = c.targets.value.filter((t) => d.mods.get(t.modId)?.family !== "LocalMaximumQuality").map((t) => {
      const m = d.mods.get(t.modId);
      const rank = !m || m.source !== "normal" || fixed.has(t.modId) ? 0 : m.type === "suffix" ? 1 : 2;
      return { key: t.modId, name: c.stepTarget([t.modId]), rank, chance: spawnChance(c, t.modId, t.minTierIndex ?? 0) ?? 1 };
    });
    const ex = extraLines.value.map((x) => ({ key: `extra:${x.bare}`, name: jaOfPastedLine(x.text) ?? x.text, rank: 3, chance: 0 }));
    return [...ts, ...ex].sort((a, b) => a.rank - b.rank || b.chance - a.chance);
  });
  /** 外して見つかった時の、外した MOD の名前 (完成品ではない) */
  const dropped = ref<string[]>([]);
  const query = computed(() => build("full"));
  /** 組めない理由 (取引所の条件にできない MOD がある) */
  const unbuildable = computed(() => {
    const d = c.data.value;
    if (!d || !c.base.value || query.value) return null;
    const { unmatched } = tradeFiltersFor(d, c.targets.value);
    return unmatched.length ? `取引所の条件にできない MOD があるので探せません: ${unmatched.join(" / ")}` : "このベースは取引所で探せません";
  });
  /** ゆるい条件を断られて、軽い条件で探した時の注記 */
  const lightNote = ref<string | null>(null);
  /** 段を問わずに探して見つけた (= 同じ段の完成品は無い)。値段は比べに使わない (2026-09-25 琥珀のアミュレットで 1 カオスと出ていた) */
  const tierless = ref(false);

  const found = shallowRef<{ min: number | null; total: number; url: string | null } | null>(null);
  /** 取引所に無い時に手で入れた完成品の値段 (神) */
  const manual = ref<number | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  // 条件は中身で比べる (相場の取り直しや固定の選び直しで computed が作り直されるだけで、見つけた完成品・手で入れた値段が
  // 消えていた。2026-09-26 レビュー B)
  watch(() => JSON.stringify(query.value), () => { found.value = null; error.value = null; manual.value = null; lightNote.value = null; dropped.value = []; tierless.value = false; deepDone.value = false; exhausted.value = false; });

  /**
   * 探し直し (段なし → MOD を外す) まで済ませたか。オーナー 2026-09-26:「完成品も自動で出るまで必ず回す。徐々に最後まで行き切る。
   * MOD は 3 つまで合っていたらおｋでそれ以上減らせない。そこまで行き切ったら初めて『条件を緩めても出ませんでした』」
   */
  const deepDone = ref(false);
  /** 3 つまで緩めても無かった */
  const exhausted = ref(false);
  /** 外して残す MOD の下限 */
  const KEEP_MIN = 3;
  async function search(opts: { deep?: boolean } = {}): Promise<void> {
    if (busy.value || !query.value) return;
    const deep = opts.deep ?? true;
    busy.value = true;
    error.value = null;
    const ownStage = !c.stage.value;
    if (ownStage) c.stage.value = "③ 完成品を探しています…";
    // 打ち切り (入口に戻る・画面を離れる): await のたびに世代を見て、進んでいたら次は投げずに抜ける
    const gen = c.fetchGen.value;
    const ABORT = Symbol("abort");
    const guard = (): void => { if (c.fetchGen.value !== gen) throw ABORT; };
    try {
      const league = marketStore.league.value?.Value ?? "Standard";
      lightNote.value = null;
      tierless.value = false;
      dropped.value = [];
      // ログインしていれば一番ゆるい条件から (取引所の検索はアプリのログインの POESESSID を乗せて投げる。trade2.rs)。
      // ログインしていないと full はまず断られ、その 1 回が取引所の回数を食うので light から (2026-09-24)。
      // (開発版で断られていたのは、開発ビルドの検索がプロキシ経由でログインが乗っていなかったため。pricing.ts の DEV_TRADE)
      const loggedIn = await sessionLoggedIn().catch(() => false);
      guard();
      let level: Level = loggedIn ? "full" : "light";
      let r = await autoPriceCached(league, build(level) ?? query.value, marketStore.rates.value, 5);
      guard();
      // 複雑過ぎと断られたら、軽い条件に落として投げ直す (full → light → min)
      for (const next of (loggedIn ? ["light", "min"] : ["min"]) as Level[]) {
        const q = build(next);
        if (r || !(tradeAuto.lastError.value ?? "").includes("複雑") || !q) break;
        level = next;
        r = await autoPriceCached(league, q, marketStore.rates.value, 5);
        guard();
        if (r) lightNote.value = next === "light"
          ? "冒涜で付いた物は除外 (条件が多すぎた)"
          : "固定済みも除外 (条件が多すぎた)";
      }
      if (!loggedIn && !lightNote.value) lightNote.value = "未ログインのため冒涜で付いた物は除外 (取引履歴でログインすると拾える)";
      // 出品が無ければ、値 (段) を外して MOD の組み合わせだけで探し直す (「近い物を探す」を押した時だけ)
      const loose = deep ? build(level, false) : null;
      if (deep) deepDone.value = true;
      exhausted.value = false;
      if (r && r.total === 0 && loose) {
        const r2 = await autoPriceCached(league, loose, marketStore.rates.value, 5);
        guard();
        if (r2) {
          r = r2;
          lightNote.value = [lightNote.value, "同じ段は無し → 段を問わずに探した"].filter(Boolean).join("。");
          tierless.value = true;
        }
      }
      // それでも無ければ、優先度の低い MOD から 1 つずつ外していく (値は問わない)
      const drop: string[] = [];
      const modCount = c.targets.value.length + extraLines.value.length;
      for (const x of deep ? dropOrder.value : []) {
        if (!r || r.total > 0) break;
        // 3 つは残す (それ以上減らすと別物)
        if (modCount - drop.length - 1 < KEEP_MIN) break;
        drop.push(x.key);
        const q = build(level, false, new Set(drop));
        const r3 = q ? await autoPriceCached(league, q, marketStore.rates.value, 5) : null;
        guard();
        if (!r3) break;
        r = r3;
        if (r3.total > 0) dropped.value = dropOrder.value.slice(0, drop.length).map((y) => y.name);
      }
      if (!r) error.value = tradeAuto.lastError.value ?? "取れませんでした (間隔待ちの時は少し待って押し直し)";
      else {
        found.value = { min: r.minExalted ?? null, total: r.total, url: r.searchUrl || null };
        if (deep && r.total === 0) exhausted.value = true;
      }
    } catch (e) {
      if (e !== ABORT) error.value = String(e);
    } finally {
      busy.value = false;
      if (ownStage && c.fetchGen.value === gen) c.stage.value = "";
    }
  }

  /** 完成品の値段 (高貴換算)。取引所の最安、無ければ手で入れた値段 */
  const buyCost = computed(() => {
    const div = c.prices.value?.currency.divine ?? 1;
    return found.value?.min ?? (manual.value != null && manual.value > 0 ? manual.value * div : null);
  });
  /** 作る見込み = 初動 + 残りを作る見込み ([[craft-estimate.ts]]、多めに出る自動の組み立てを優先) */
  const estimate = computed(() => craftEstimate(c, c.fracturedTargets.value.map((t) => t.modId)));
  const craftCost = computed(() => (estimate.value ? (startCost.value ?? 0) + estimate.value.value : null));
  const craftBasis = computed(() => estimate.value?.basis ?? "");
  /** 1 から作る見込み (素材を買わない。樹 MOD があれば組めないので null) */
  /**
   * 完成品の値段が当てにならない: 出品が 2 件以下で、作る見込みの 10 倍を超える (不在のアミュレットで 1 件 372 万神の出品に
   * 「作る方が 370 万神安い」と出ていた。2026-09-24)
   */
  const outlier = computed(() => {
    const b = found.value?.min, k = craftCost.value;
    return b != null && k != null && (found.value?.total ?? 0) <= 2 && b > k * 10;
  });
  const verdict = computed(() => {
    if (outlier.value) return null;
    const b = buyCost.value, k = craftCost.value;
    // 段なし・MOD を外して見つけた物も「妥協して買う」として比べる (オーナー 2026-09-26:「完成版が無くても似たような奴あります
    // でおｋ、完成品を買うでおｋ。MOD のみ同じ形、完成品で妥協みたいな表示」)
    return b != null && k != null ? { buy: b <= k, diff: Math.abs(b - k) } : null;
  });

  return { query, unbuildable, lightNote, dropped, tierless, outlier, found, manual, busy, error, search, deepDone, exhausted, buyCost, craftCost, craftBasis, verdict };
}
