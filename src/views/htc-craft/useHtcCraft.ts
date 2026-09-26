/**
 * useHtcCraft.ts — クラフト計算の状態の中心 (2026-09-22、2026-09-26 に流れを書き直し)
 *
 * 流れ: 貼り付け (または ベース + MOD を選ぶ) → MOD 解析 (段・側・固定済み・樹 MOD) → ① 固定の候補を選ぶ →
 * 取引所で探す ([[useStartSearch.ts]] / [[useTreeSearch.ts]]) → ② 買うか作るか ([[useFinishedCompare.ts]]) →
 * 作り方のツリー ([[useCraftTree.ts]])。ここは解析までと、各段が共通に読む状態 (狙い・相場・ベース・段階) を持つ。
 */
import { computed, ref, shallowRef } from "vue";
import { zeroStart } from "./craft-settings";
import { loadHtcPatch } from "../../services/htc/patch";
import { parseJaItem, targetsFor, type PastedItem } from "../../services/htc/paste";
import { baseForSolving } from "../../services/htc/bridge";
import { useTreeSearch } from "./useTreeSearch";
export type { TreeRoute } from "./useTreeSearch";
import { baseChoices, type BaseChoice } from "../../services/htc/base-choice";
import { craftedSurvey, isCraftedMod, type CraftedSurvey } from "../../services/htc/craft-slots";
import { NO_SOCKET, effectiveSocket, socketCountFor, socketsMinFor, type SocketPick } from "../../services/htc/sockets";
import { jaOfMod, jaOfPastedLine, fillHashes } from "../../services/htc/mod-text";
import { boostedBy } from "../../services/htc/quality";
import { isPlaceholderWeight, OVERRIDDEN, WEIGHT_OVERRIDE_NOTE } from "../../services/htc/weight-overrides";
import { buildHtcPrices, type HtcPriceCoverage } from "../../services/htc/prices";
import { indexPrices, pricesForBase, type Prices } from "../../vendor/poe2htc/optimizer/cost";
import { displayCurrency } from "../../state/display-currency";
import { marketStore } from "../../state/market-store";

/** 押した時に取り直す相場の古さ (これより新しければそのまま使う) */
const PRICE_MAX_AGE_MS = 5 * 60 * 1000;
import { FRACTURE_DECOY_NOTE, NECRO_REPLACE_NOTE } from "../../services/htc/tree-decide";
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
  /**
   * 重みが仮置き (データに無い) か。**true の MOD の確率は信用できない** ([[weight-overrides.ts]])。
   * 上書きで埋めた物 (キャストスピード) は false になるが、`overridden` で分かる
   */
  unknownWeight: boolean;
  /** 重みを別の出どころ (Craft of Exile の値など) で埋めた MOD か */
  overridden: boolean;
}

export function useHtcCraft() {
  const data = shallowRef<PatchData | null>(null);
  const loading = ref(false);
  /**
   * その ilvl では出ない段を狙っている普通の MOD (重み 0)。これがあると自動の組み立て・見込み・シミュレーションは回さない
   * (回すと当たりが無いまま手数の上限まで回り続けて画面が固まる。2026-09-26)。貼り付けの段は paste.ts が ilvl に収めるので、
   * 出るのは段を手で上げた時くらい
   */
  const unreachableTargets = computed(() => {
    const d = data.value;
    if (!d) return [] as string[];
    const lv = item.value?.itemLevel ?? zeroStart.value.itemLevel;
    return targets.value.filter((t) => {
      const m = d.mods.get(t.modId);
      return !!m && m.source === "normal" && !fracturedTargets.value.some((f) => f.modId === t.modId)
        && !m.tiers.some((x, i) => i >= (t.minTierIndex ?? 0) && x.ilvl <= lv);
    }).map((t) => t.modId);
  });
  /**
   * 今どこで待っているか (オーナー 2026-09-25:「MOD 解析押して暇な時解析中って出そうか」「真ん中で止まったらまだ検索中で
   * 今なにで止まってるかしっかり表示して」)。解析中は run() が、②③ の取得中は useStartSearch / useFinishedCompare が入れる
   */
  const stage = ref("");
  /**
   * 診断 (② 始め方 → ③ 完成品) がまだ済んでいない。解析が通ったら立て、取得が終わる (or 取得しない) と下ろす。
   * 作り方のシミュレーションはこれが下りてから回す (オーナー:「真ん中終わったら次、完成終わったらシミュレーションって順番」)
   */
  const diagBusy = ref(false);
  /**
   * 診断の段階 (オーナー 2026-09-26:「MOD 解析でおｋなら設定へ進むで ① を表示、取引所へ探す → 取得中で流れ解説しながら取得、
   * 全部終わってから ② → ③ → そのまま自動クラフト。目が疲れない」)。
   *   analyzed … MOD 解析を見せて「おｋ」を待つ (段を直せる)
   *   pick     … ① 固定する MOD を選んで「取引所で探す」
   *   done     … ②③ を出し、作り方を自動で組む
   */
  const phase = ref<"analyzed" | "pick" | "done">("analyzed");
  /**
   * 「前回の続きから」: 解析 → おｋ → 探す (30 分のキャッシュで即答) → 作り方 まで自動で通す (オーナー 2026-09-26:
   * 「キャッシュでそこまで行け」)。DiagnosisCard が段階を見て進め、done で下ろす
   */
  const resumeFlow = ref(false);
  /**
   * 取得の世代。入口に戻る・画面を離れる時に進めて、走っている ②③ の取得を打ち切る (オーナー 2026-09-25:「入口に戻るとか
   * このページ離れたら取得中止して強制終了」)。取得側は始めに世代を控え、await のたびに変わっていないか見る。
   * 取引所へ投げ終えた 1 本は戻るまで待つしかないが、次は投げない
   */
  const fetchGen = ref(0);
  function abortFetch(): void {
    fetchGen.value++;
    diagBusy.value = false;
    stage.value = "";
  }
  const error = ref<string | null>(null);

  const item = shallowRef<PastedItem | null>(null);
  const base = shallowRef<ItemBase | null>(null);
  const prices = shallowRef<Prices | null>(null);
  const targets = shallowRef<TierTarget[]>([]);
  const rows = shallowRef<TargetRow[]>([]);
  const implicits = ref<string[]>([]);
  const skipped = ref<string[]>([]);
  /**
   * ソケットに差す物 (アストリッドの創造性 / セールの凱旋)。2026-09-26 オーナー「アストリッドやら追加しとこうか」([[sockets.ts]])。
   * 画面のトグルが入れる。計算は種類・コラプトで差せない物を落とした socketOn を使う
   */
  const socket = ref<SocketPick>({ ...NO_SOCKET });
  /** ソケットの数 (0 = 付けられない種類)。ベースが決まる前は 0 */
  const socketSlots = computed(() => socketCountFor(base.value?.category));
  /** 実際に効く差し方。シミュレーター・自動の組み立て・見積もりは全部これ ([[sim-setup.ts]] の simCtxOf) */
  const socketOn = computed<SocketPick>(() => effectiveSocket(base.value?.category, !!item.value?.corrupted, socket.value));
  /**
   * 素材 (始め方のベース) を探す時のルーンソケットの下限。武器・防具は規格外 (2 つ) が既定 (オーナー 2026-09-26:
   * 武器・防具のクラフトはほぼ規格外でやる)。指輪など・0 を選んだ時は条件に入れない
   */
  const socketsMin = computed(() => socketsMinFor(base.value?.category, !!item.value?.corrupted, socket.value));
  /** 確定で乗せる MOD が何個あるか。**解く前に分かる** ([[craft-slots.ts]])。アストリッドを差せば枠が 2 つ */
  const slots = computed<CraftedSurvey | null>(() => (data.value && base.value && targets.value.length
    ? craftedSurvey(data.value, base.value, targets.value, { astrid: socketOn.value.astrid }) : null));
  /**
   * どのベースから始めるか。**並べるだけで選びません** (オーナー方針:「手動の所は手動でいきたい」)。
   * 1 ミリ秒で出るので開いた時に出す。
   */
  const bases = shallowRef<BaseChoice[]>([]);
  /** 相場がどれだけ埋まっているか。空だと費用が出ないので画面で断る */
  const coverage = shallowRef<HtcPriceCoverage | null>(null);
  /** 各段にかかった時間 (ミリ秒) */
  const timings = ref<Array<[string, number]>>([]);
  /** 固定済みだった MOD (解くための目標) */
  const fracturedTargets = shallowRef<TierTarget[]>([]);
  /** 繋がらなかった行が食っている枠 */
  const slotsUsed = ref({ prefixes: 0, suffixes: 0, either: 0 });
  /** 始め方で「固定無しを買ってそのまま作る」を選んだ時の、触らない狙い (固定ではない。消えたらその回は失敗) */
  const startKeep = ref<string[]>([]);
  /** 始め方で選んだベースの買う値段 (高貴建て)。作り方の結果に足す (オーナー 2026-09-24:「最終収支に買ったベースの値段含めてなさそう」) */
  const startPrice = ref<number | null>(null);
  /** 繋がらなかった行のうち、創生の樹からしか出ないと分かった物 */
  const dropOnly = shallowRef<DropOnlyRow[]>([]);
  /** 固定済み・固定無しの検索と判定 ([[useTreeSearch.ts]]) */
  const { treeResult, treeTierPick, treePlan, searchFor, planFor, treeFixSide } =
    useTreeSearch({ data, base, prices, item, dropOnly, fracturedTargets, targets, socketsMin, name: (id) => stepTarget([id]) });

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

  /**
   * 押した時に相場 (カレンシーランキング) を取り直してから値段を決める (オーナー 2026-09-25:「カレンシーとか押した時に
   * ランキング更新してそれから値段決めてね」)。それまでは他の画面が取った相場を使うだけで、ランキングを開いていないと
   * 空か古いままだった。続けて押しても叩き過ぎないよう、5 分以内に取った物はそのまま使う
   */
  async function refreshPrices(): Promise<void> {
    const before = marketStore.fetchedAt.value;
    await marketStore.ensureMarket(PRICE_MAX_AGE_MS);
    // 取り直していなければ値段表も作り直さない (作り直すと下流が「変わった」と見て組み直す)
    if (marketStore.fetchedAt.value === before && prices.value) return;
    if (base.value) {
      const built = buildPrices(base.value);
      prices.value = built.prices;
      coverage.value = built.coverage;
    }
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
    socket.value = { ...NO_SOCKET };
    implicits.value = [];
    skipped.value = [];
    dropOnly.value = [];
    fracturedTargets.value = [];
    slotsUsed.value = { prefixes: 0, suffixes: 0, either: 0 };
    timings.value = [];
    treeResult.value = null;
    startPrice.value = null;
    startKeep.value = [];
    treeTierPick.value = {};
    abortFetch();
    phase.value = "analyzed";
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
        // 英語の貼り付け (忍者のコピー) は日本語に直す。引けなければ英語のまま
        text: got.texts[i] ? jaOfPastedLine(got.texts[i]!) ?? got.texts[i]! : tg.modId,
        side: mod.type === "prefix" ? "P" : "S",
        tierName: String(tier.name ?? ""),
        range: (tier.ranges ?? []).map((r2) => `${r2[0]}-${r2[1]}`).join(" / "),
        // **`boostedBy` を使うこと。**タグだけ見て書き直すと判定がずれる (向こうはクラスも見る)。
        // 実際ずれていて、割り戻したキャストスピードに印が付いていなかった (2026-09-23)
        boosted: !!(it?.quality && it.catalystTag && boostedBy(mod, it.catalystTag)),
        crafted: isCraftedMod(mod),
        unknownWeight: isPlaceholderWeight(mod),
        overridden: OVERRIDDEN.has(mod.id),
      };
    });
    // 確定で乗せる MOD の数は解かなくても分かる。2 個ならアストリッドが要るので、差せる物なら最初から差しておく
    // (2026-09-26 オーナー「アストリッドやら追加しとこうか」。差さないと絶対に作れない)
    if (craftedSurvey(d, cls, got.targets).needsAstrid && socketCountFor(cls.category) > 0 && !item.value?.corrupted) {
      socket.value = { ...socket.value, astrid: true };
    }
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
    // ソケットの選び方は ③ (作り方の設定) で先に決めるので、空に戻しても残す
    const sock = socket.value;
    reset();
    socket.value = { ...sock };
    loading.value = true;
    try {
      stage.value = "解析中: MOD のデータを読んでいます…";
      const d = await ensureData();
      stage.value = "解析中: 相場を確かめています…";
      await marketStore.ensureMarket(PRICE_MAX_AGE_MS);
      stage.value = "解析中: MOD と段を決めています…";
      if (picks.length === 0) {
        error.value = "狙う MOD を 1 つ以上選んでください。";
        return;
      }
      applyTargets(
        d,
        cls,
        { targets: [...picks], texts: picks.map((p2) => { const m = d.mods.get(p2.modId)!; return fillHashes(jaOfMod(m), m.tiers[p2.minTierIndex ?? 0]?.ranges ?? []); }) },
        baseName,
      );
      diagBusy.value = true;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
      stage.value = "";
    }
  }

  /** 貼り付けを読んで MOD を割り出す (1 秒未満) */
  async function run(text: string): Promise<void> {
    reset();
    loading.value = true;
    try {
      stage.value = "解析中: MOD のデータを読んでいます…";
      const d = await ensureData();
      stage.value = "解析中: 相場を確かめています…";
      await marketStore.ensureMarket(PRICE_MAX_AGE_MS);
      stage.value = "解析中: 貼り付けを読んで MOD と段を決めています…";

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
      implicits.value = got.implicits;
      skipped.value = got.skipped;
      applyTargets(d, cls, got, it.baseType);
      diagBusy.value = true;
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
      stage.value = "";
    }
  }

  /**
   * 狙う段を選び直す (オーナー 2026-09-24:「一応ティア選べるようにね、最初で」)。狙いのリストそのものを
   * 書き換えるので、確率・フラクチャー品の検索の下限・無し品の平均・スパムの組み立てが全部ついてくる
   */
  function setTier(modId: string, tierIndex: number): void {
    const mod = data.value?.mods.get(modId);
    const tier = mod?.tiers[tierIndex];
    if (!mod || !tier) return;
    const re = (xs: TierTarget[]): TierTarget[] => xs.map((t) => (t.modId === modId ? { ...t, minTierIndex: tierIndex } : t));
    targets.value = re(targets.value);
    fracturedTargets.value = re(fracturedTargets.value);
    rows.value = rows.value.map((r) => (r.modId === modId
      ? { ...r, tierName: String(tier.name ?? ""), range: (tier.ranges ?? []).map((r2) => `${r2[0]}-${r2[1]}`).join(" / ") } : r));
  }

  /**
   * 固定済みにする MOD を選び直す (オーナー 2026-09-24:「フラクチャー MOD どうするかチェックボックスで選択して
   * 複数トレードで一斉に検索。安い MOD で開始できるかも」)。狙いのリストから選ぶので段はそのまま
   */
  function setFractured(modIds: readonly string[]): void {
    fracturedTargets.value = targets.value.filter((t) => modIds.includes(t.modId));
  }

  /** 目標の modId を画面の文面に直す */
  const stepTarget = (modIds: readonly string[]): string =>
    modIds.map((id) => {
      const r = rows.value.find((x) => x.modId === id);
      // 0 から組んだ時は文面が「#」のままなので、狙う段を添える
      if (r) return r.text.includes("#") ? `${r.text} (${r.tierName}: ${r.range} 以上)` : r.text;
      // 狙いに入っていない MOD (上書きに使うエッセンスなど) はゲームの日本語の文面で (中の名前のまま出ていた。2026-09-24)
      const m = data.value?.mods.get(id);
      return m ? jaOfMod(m) : id.split("/")[1] ?? "";
    }).join(" + ");

  return {
    stepTarget, setTier, setFractured, startPrice, startKeep, refreshPrices,
    fracturedTargets, slotsUsed, dropOnly,
    loading, stage, diagBusy, phase, resumeFlow, fetchGen, abortFetch, unreachableTargets, error, item, base, rows, implicits, skipped,
    timings, coverage, slots, bases, targets, prices, socket, socketOn, socketSlots, socketsMin,
    runPicked, reset, ensureData, data,
    money, run, treePlan,
    treeResult, treeTierPick, searchFor, planFor, treeFixSide,
    treeNotes: [FRACTURE_DECOY_NOTE, NECRO_REPLACE_NOTE],
    weightNote: WEIGHT_OVERRIDE_NOTE,
  };
}
