/**
 * useHtcCraft.ts — 貼り付けを読んで MOD を割り出すところまで (2026-09-22 / 2026-09-23 に縮小)
 *
 * ## 2026-09-23: 「作り方」は廃止しました
 * オーナー指示:「MOD 解析までの手順はそのままでいいけど、**あとの作り方はカスルールすぎて廃止**だね。
 * 1 から一緒に考えよう」。
 *
 * 廃止したのは、同梱 HTC の模型をそのまま画面に載せていた部分です:
 *   ③ 1 個ずつの期待費用 / 固定済み探し   ④ どこから始めるか   ⑤ 途中まで買う   ⑥ 手順
 *
 * **なぜ廃止したか。**あの模型は全部を「通貨で殴る問題」として 1 つの状態空間に押し込みます。
 * だから「買う」が行動に無く、5 カオスで買える MOD を 1/20,964 で引きに行き、確定で乗る
 * パーフェクトエッセンスまで確率として混ぜ、結果として**一番細い確率に収束速度を握られて
 * 答えが出ません**。本家 poe2htc.com v1.1.0 に同じ 5 個を入れても
 * 「the solver ran out of time before it could put a number on this craft」で、
 * **実装の問題ではなく模型の選び方の問題**だと確認しました (2026-09-23)。
 *
 * 実データで分けたら、計算の前に行き先が決まりました (死体の円環 / ニーモニックリング):
 *   ドロップ限定      マナコスト効率        → 買う (固定済みで)
 *   確定手段あり      最大マナが8%増加する   → パーフェクトエッセンスで確定
 *   ガチャ・現実的    最大マナ 1/70 / 知性 1/42 / 元素耐性 1/52  → **ここだけ解けばいい**
 *   ガチャ・非現実的  キャストスピード 1/20,964 → 買う or フラクチャー
 *
 * **同梱エンジンは捨てていません** (オーナー判断 2026-09-23)。「ガチャ・現実的」の 3〜4 個を
 * 解く用途に残します ── 確率の計算は本家と一致を確認済みで、その狭い用途なら収束します。
 * 呼び出しは新しい作り方が決まってから繋ぎ直します。
 *
 * 今ここに残っているのは**貼り付け → MOD 解析 → ベース選び**までです。
 */
import { computed, ref, shallowRef } from "vue";
import { loadHtcPatch } from "../../services/htc/patch";
import { parseJaItem, targetsFor, type PastedItem } from "../../services/htc/paste";
import { baseForSolving } from "../../services/htc/bridge";
import { baseChoices, type BaseChoice } from "../../services/htc/base-choice";
import { craftedSurvey, isCraftedMod, type CraftedSurvey } from "../../services/htc/craft-slots";
import { jaOfMod } from "../../services/htc/mod-text";
import { boostedBy } from "../../services/htc/quality";
import { buildHtcPrices, type HtcPriceCoverage } from "../../services/htc/prices";
import { indexPrices, pricesForBase, type Prices } from "../../vendor/poe2htc/optimizer/cost";
import { displayCurrency } from "../../state/display-currency";
import { treeFracturePlan } from "../../services/htc/tree-fracture-plan";
import { treeBuys, treeBuyQuery } from "../../services/htc/tree-buy";
import type { DropOnlyRow } from "../../services/htc/paste";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";

/** 画面に出す 1 目標 */
export interface TargetRow {
  modId: string;
  /** 貼り付けの文面 (日本語のまま) */
  text: string;
  side: "P" | "S";
  tierName: string;
  /** そのティアの範囲 (「150-164」) */
  range: string;
  /** 品質で底上げされている MOD か (装飾品のみ) */
  boosted: boolean;
  /** 確定で乗せる MOD か (エッセンス / パーフェクトエッセンス / 合金) */
  crafted: boolean;
}

export function useHtcCraft() {
  const data = shallowRef<PatchData | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const item = shallowRef<PastedItem | null>(null);
  const base = shallowRef<ItemBase | null>(null);
  const prices = shallowRef<Prices | null>(null);
  const targets = shallowRef<TierTarget[]>([]);
  const rows = shallowRef<TargetRow[]>([]);
  const implicits = ref<string[]>([]);
  const skipped = ref<string[]>([]);
  /** 確定で乗せる MOD が何個あるか。**解く前に分かる** ([[craft-slots.ts]]) */
  const slots = shallowRef<CraftedSurvey | null>(null);
  /**
   * どのベースから始めるか。**並べるだけで選びません** (オーナー方針:「手動の所は手動でいきたい」)。
   * 1 ミリ秒で出るので開いた時に出す。
   */
  const bases = shallowRef<BaseChoice[]>([]);
  /** 相場がどれだけ埋まっているか。空だと費用が出ないので画面で断る */
  const coverage = shallowRef<HtcPriceCoverage | null>(null);
  /** 各段にかかった時間 (ミリ秒) */
  const timings = ref<Array<[string, number]>>([]);
  /** 固定済みの行 (画面用) と、そこから解くための目標 */
  const fracturedLines = ref<string[]>([]);
  const fracturedTargets = shallowRef<TierTarget[]>([]);
  /** 固定済みだが繋がらず、開始状態に置けない数 */
  const fracturedUnusable = ref(0);
  /** 繋がらなかった行が食っている枠 */
  const slotsUsed = ref({ prefixes: 0, suffixes: 0, either: 0 });
  /** 繋がらなかった行のうち、創生の樹からしか出ないと分かった物 */
  const dropOnly = shallowRef<DropOnlyRow[]>([]);

  /**
   * 高貴建て → 画面の文字列。**神から始めます** (神 → 1 未満ならカオス → 1 未満なら高貴)。
   * オーナー指示 2026-09-22:「全部高貴じゃんややこしい。神優先で」。
   */
  const money = (exalted: number | null): string =>
    displayCurrency.money(exalted, { round: "up", ladder: "top" });

  /**
   * 値段表。**`buildHtcPrices` を使うこと。**
   *
   * 相場の並び (poe.ninja の ApiId) とエンジンの価格キー (`transmute` / `exalt` / お告げの id) は
   * **別物**です。素直に写すとキーが 1 つも当たらず、全部 0 で解いて「タダで作れる」と出ます。
   * 対応表は `price-keys.json` (クライアント由来) で、それを通すのが `buildHtcPrices`。
   */
  function buildPrices(cls: ItemBase): { prices: Prices; coverage: HtcPriceCoverage } {
    const built = buildHtcPrices();
    return { prices: pricesForBase(indexPrices(built.file), cls), coverage: built.coverage };
  }

  /** データを読む (1 回だけ)。どちらの入口からも先に通る */
  async function ensureData(): Promise<PatchData> {
    if (!data.value) {
      const t = Date.now();
      data.value = await loadHtcPatch();
      timings.value.push(["データを読む", Date.now() - t]);
    }
    return data.value;
  }

  /** 画面を空に戻す。入口へ帰る時と、読み直す前に通す */
  function reset(): void {
    error.value = null;
    item.value = null;
    base.value = null;
    targets.value = [];
    rows.value = [];
    bases.value = [];
    slots.value = null;
    implicits.value = [];
    skipped.value = [];
    dropOnly.value = [];
    fracturedLines.value = [];
    fracturedTargets.value = [];
    fracturedUnusable.value = 0;
    slotsUsed.value = { prefixes: 0, suffixes: 0, either: 0 };
    timings.value = [];
  }

  /**
   * ベースと目標が決まったところから先。**貼り付けの道とベースを選ぶ道で共通**です。
   *
   * ここを 2 本に分けると、片方だけ直して食い違います (実際、枠の引き算は貼り付け側にしか
   * 無かった)。入口が違うだけで、決まった後にやることは 1 つしかありません。
   */
  function applyTargets(
    d: PatchData,
    cls: ItemBase,
    got: { targets: TierTarget[]; texts: string[] },
    /** 実際のベース名 (「サファイアリング」)。`cls` は行 ("Rings") なので別に要る */
    currentBase: string,
  ): void {
    base.value = cls;
    const built = buildPrices(cls);
    prices.value = built.prices;
    coverage.value = built.coverage;
    targets.value = got.targets;
    rows.value = got.targets.map((tg, i) => {
      const mod = d.mods.get(tg.modId)!;
      const tier = mod.tiers[tg.minTierIndex ?? mod.tiers.length - 1]!;
      const it = item.value;
      return {
        modId: tg.modId,
        text: got.texts[i] ?? tg.modId,
        side: mod.type === "prefix" ? "P" : "S",
        tierName: String(tier.name ?? ""),
        range: (tier.ranges ?? []).map((r2) => `${r2[0]}-${r2[1]}`).join(" / "),
        // **`boostedBy` を使うこと。**タグだけ見て書き直すと判定がずれる (向こうはクラスも見る)。
        // 実際ずれていて、割り戻したキャストスピードに印が付いていなかった (2026-09-23)
        boosted: !!(it?.quality && it.catalystTag && boostedBy(mod, it.catalystTag)),
        crafted: isCraftedMod(mod),
      };
    });
    // 確定で乗せる MOD の数は解かなくても分かる。2 個ならアストリッドが要る
    slots.value = craftedSurvey(d, cls, got.targets);
    bases.value = baseChoices(d, cls, got.targets, { current: currentBase });
  }

  /**
   * ベースを選んで、MOD を自分で並べた時。**貼り付けは無い**ので、文面は
   * [[mod-text.ts]] がクライアントの日本語から作ります。
   */
  async function runPicked(
    baseName: string,
    cls: ItemBase,
    picks: readonly TierTarget[],
  ): Promise<void> {
    reset();
    loading.value = true;
    try {
      const d = await ensureData();
      if (picks.length === 0) {
        error.value = "狙う MOD を 1 つ以上選んでください。";
        return;
      }
      applyTargets(
        d,
        cls,
        { targets: [...picks], texts: picks.map((p2) => jaOfMod(d.mods.get(p2.modId)!)) },
        baseName,
      );
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  /** 貼り付けを読んで MOD を割り出す (1 秒未満) */
  async function run(text: string): Promise<void> {
    reset();
    loading.value = true;
    try {
      const d = await ensureData();

      let t = Date.now();
      const it = parseJaItem(text);
      timings.value.push(["貼り付けを読む", Date.now() - t]);
      item.value = it;
      if (!it.baseType) {
        error.value = "ベースが分かりません。アイテムの名前の行が入っているか確認してください。";
        return;
      }
      // **枠は「繋がらなかった行」の分を引く。**クラフトでは付かない MOD も枠は使う
      t = Date.now();
      const got = targetsFor(d, it);
      const cls = baseForSolving(d, it.baseType, got.skippedSides);
      if (!cls) {
        error.value = `「${it.baseText}」はエンジンが知らないベースです。`;
        return;
      }
      timings.value.push(["MOD とティアを決める", Date.now() - t]);
      slotsUsed.value = got.skippedSides;
      dropOnly.value = got.dropOnly;
      fracturedTargets.value = got.fracturedTargets;
      fracturedLines.value = got.fractured;
      // 固定済みでも**エンジンが知らない MOD は開始状態に置けません**
      fracturedUnusable.value = got.fractured.length - got.fracturedTargets.length;
      implicits.value = got.implicits;
      skipped.value = got.skipped;
      applyTargets(d, cls, got, it.baseType);
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * 創生の樹の MOD がある時の「買うか自前で固定するか」。**投げる前に出せる分だけ**。
   *
   * オーナーの順番: オーブの値段を見る (信号 0) → 固定済み品の最安 1 件 (信号 1) → 比べて起動。
   * ここは 1 段目で、オーブ・消去・鎖骨の実勢から「自前の固定費」と得な道を出します。
   */
  const treePlan = computed(() => {
    const p = prices.value;
    if (!p || dropOnly.value.length === 0) return null;
    const div = p.currency.divine;
    if (!div) return null;
    const toDiv = (v: number | undefined): number | null => (v == null ? null : v / div);
    const plan = treeFracturePlan({
      orb: toDiv(p.currency.fracture),
      annul: toDiv(p.currency.annul) ?? 0,
      bone: toDiv(p.currency.desecrate) ?? 0,
    });
    const cls = base.value;
    const buys = treeBuys(dropOnly.value);
    // stat に入れるのは作れない MOD だけ。ベース・ilvl・レア・コラプト無しは規定通り
    const common = {
      ilvlMin: item.value?.itemLevel ?? undefined,
      ...(item.value?.baseType ? { baseType: item.value.baseType } : {}),
    };
    const fracturedQuery = cls ? treeBuyQuery(cls, buys, { ...common, fractured: true }) : null;
    const plainQuery = cls ? treeBuyQuery(cls, buys, { ...common, fractured: false }) : null;
    return {
      plan, buys,
      searches: [
        { label: "固定済み (買えばそのまま使える)", query: fracturedQuery, fractured: true },
        { label: "固定無し (自前で固定するベース)", query: plainQuery, fractured: false },
      ].filter((x) => x.query != null),
    };
  });

  /** 目標の modId を画面の文面に直す */
  const stepTarget = (modIds: readonly string[]): string =>
    modIds.map((id) => rows.value.find((r) => r.modId === id)?.text ?? id.split("/")[1] ?? "").join(" + ");

  return {
    stepTarget,
    fracturedLines, fracturedUnusable, slotsUsed, dropOnly,
    loading, error, item, base, rows, implicits, skipped,
    timings, coverage, slots, bases, targets, prices,
    runPicked, reset, ensureData, data,
    money, run, treePlan,
  };
}
