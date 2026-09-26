/**
 * flow-summary.ts — 捌き速度の「読み方」(速い / 普通 / 遅い の判定と言い回し)
 *
 * 記録そのもの (取る・保存する) は market-flow.ts。こちらは**読んだ記録を人の言葉にする**
 * 純粋関数だけ。通信もしないので、判定の基準を変える時はここだけ見る。
 *
 * 2026-09-19 に market-flow.ts (582 行) から切り出した。
 */
import type { Tracked, WatchState } from "./market-flow";
import { EMPTY_SUMMARY, FAST_SECS, MIN_KNOWN, NORMAL_SECS, type FlowTone, type FlowSummary } from "./flow-summary-types";

// 判定結果の型は flow-summary-types.ts、言い回しは flow-summary-text.ts へ (2026-09-26 の分割)。今まで通りここから取れる
export type { FlowSummary, FlowTone } from "./flow-summary-types";
export { flowSentence, fmtAge, fmtPct, fmtSellTime } from "./flow-summary-text";

/**
 * 追跡 1 件の行き先 (2026-09-26 監査「売れた判定を厳しく」)。
 *   alive    … 並んでいる
 *   pending  … 一覧から 1 回だけ消えた (次の巡回でも居なければ売れた。戻れば取り消し)
 *   sold     … 2 回続けて居ない + 出品時刻と出品者が分かっている + 同じ出品者が並べ直していない
 *   relisted … 同じ出品者がまだ同じ条件で並べている (値段の付け替え)
 *   unknown  … 消えたが出品時刻か出品者が分からない (売れたと言い切れない)
 * 売れた件数・速さの判定・実売の値段・期待値に入るのは sold だけ。
 * 古い記録 (unknown の欄が無い頃の物) も、出品時刻か出品者が欠けていれば unknown に倒す。
 */
export type TrackedFate = "alive" | "pending" | "sold" | "relisted" | "unknown";
export function fateOf(t: Tracked): TrackedFate {
  if (!t.gone_at) return t.missing_since ? "pending" : "alive";
  if (t.relisted) return "relisted";
  if (t.unknown || t.listed_at == null || !t.account) return "unknown";
  return "sold";
}

/**
 * ある時間内に売れた割合。
 * 分母は「その時間の時点で結果が分かっている出品」= その時間内に消えた物 + 齢がその時間を
 * 超えた物 (消えた物もまだある物も)。まだ齢が足りない物は数えない。
 */
export function soldWithin(
  records: { life: number; gone: boolean }[],
  windowSecs: number,
): { hit: number; known: number; rate: number | null } {
  let hit = 0;
  let known = 0;
  for (const r of records) {
    if (r.gone) {
      known++;
      if (r.life <= windowSecs) hit++;
    } else if (r.life >= windowSecs) {
      known++; // 生きたままその時間を超えた = 売れなかったと確定
    }
  }
  return { hit, known, rate: known > 0 ? hit / known : null };
}

/** 追跡記録から捌き速度を出す */
export function summarizeFlow(state: WatchState | undefined, nowSec: number = Math.floor(Date.now() / 1000)): FlowSummary {
  if (!state || !Array.isArray(state.tracked)) return EMPTY_SUMMARY;

  const records: { life: number; gone: boolean }[] = [];
  const goneLives: number[] = [];
  const soldPrices: { amount: number; currency: string }[] = [];
  const aliveAges: number[] = [];
  let stale = 0;
  const stalePrices: number[] = [];
  const allPrices: number[] = [];
  let pending = 0;
  let unknown = 0;
  for (const t of state.tracked) {
    // 売れた (sold) と並んでいる (alive) 以外は、速さにも値段にも入れない (2026-09-26 監査)。
    //   付け替え … 売れても売れ残ってもいない / 確定待ち・不明 … 売れたと言い切れない
    const fate = fateOf(t);
    if (fate === "pending") {
      pending++;
      continue;
    }
    if (fate === "unknown") {
      unknown++;
      continue;
    }
    if (fate === "relisted") continue;
    const start = t.listed_at ?? t.first_seen;
    const life = Math.max(60, (t.gone_at ?? nowSec) - start);
    const gone = fate === "sold";
    records.push({ life, gone });
    if (gone) {
      goneLives.push(life);
      if (t.amount != null && t.currency) soldPrices.push({ amount: t.amount, currency: t.currency });
    }
    else {
      aliveAges.push(life);
      if (life >= NORMAL_SECS) {
        stale++;
        if (t.amount != null) stalePrices.push(t.amount);
      }
    }
    if (t.amount != null) allPrices.push(t.amount);
  }
  if (records.length === 0) {
    return { ...EMPTY_SUMMARY, pending, unknown, total: state.total ?? null, lastAt: state.sampled_at || null };
  }

  const d1 = soldWithin(records, FAST_SECS);
  const d2 = soldWithin(records, NORMAL_SECS);

  // 値段不相応の目安: 2 日以上残っている出品は、最安の何倍で出しているか
  const cheapest = allPrices.length > 0 ? Math.min(...allPrices) : null;
  const staleAvg = stalePrices.length > 0 ? stalePrices.reduce((a, b) => a + b, 0) / stalePrices.length : null;
  const staleRatio = cheapest != null && cheapest > 0 && staleAvg != null ? staleAvg / cheapest : null;

  // 判定は実測そのもので出す (オーナー指示 2026-09-17:
  // 「事実ベースで売れ時間出そう。暫定とかいいから『速い (●時間で売れる)』みたいな分かりやすい方」)。
  //   売れた出品が 3 件以上あれば、売れるまでの時間の中央値でそのまま言い切る
  //   ただし 2 日以上売れ残っている出品の方が多ければ「遅い」(実際に滞留しているので)
  goneLives.sort((a, b) => a - b);
  const median =
    goneLives.length === 0
      ? null
      : goneLives.length % 2 === 1
        ? goneLives[(goneLives.length - 1) / 2]
        : (goneLives[goneLives.length / 2 - 1] + goneLives[goneLives.length / 2]) / 2;

  // まだ 1 回しか見ていない = 出品が入れ替わったかを一度も確かめていない。
  // last_seen が first_seen より後の記録が 1 つでもあれば、2 回目以降を見ている
  const firstLook = !state.tracked.some((t) => t.last_seen > t.first_seen);

  /**
   * 判定の土台は「結果が分かっている件数」= 売れた分 + 1 日を超えても売れ残った分。
   * まだ齢が足りない在庫は「売れなかった」と言えないので母数に入らない。
   * これが MIN_KNOWN に届かないうちは 速い / 普通 / 遅い のどれも出さない。
   *
   * 2026-09-20 オーナー「母数不足の判定バグも直して」: 下の「1 件でも短時間で売れたら速い」が
   * 母数を見ていなかったので、**観測できた結果が 1 件しかなくても「速い」**と出ていた
   * (売れた 1 件 + まだ 2 時間の在庫 1 件 → 母数 1 で「速い」)。
   * この判定はジェムコラプトの期待値の判断材料に出るので、まぐれの 1 件で
   * 「その値段で捌ける」と言い切ると仕込みを誤らせる。
   *
   * 母数さえ足りていれば「1 件でも短時間で売れたら速い」(2026-09-19 オーナー指示) は
   * 今まで通り効く。見ているのは**売れた件数ではなく、結果が出た件数**。
   */
  const enoughSample = d1.known >= MIN_KNOWN;

  let tone: FlowTone = "unknown";
  let label = "";
  if (!enoughSample) {
    // 母数不足。label は "" のまま = 画面は「判定待ち」
  } else if (goneLives.length >= MIN_KNOWN && median != null) {
    // 売れた出品の待ち時間そのもので決める。
    // オーナー指摘 (2026-09-17):「観測してる ID が無くなったなら普通に速いだろ。
    // 待機時間によるけどそいつが」= 売れた 1 件ずつの待ち時間が事実であって、
    // 他の在庫が並んだままなのは「その値段では買われていない」という別の話。
    // 並んだままの在庫は判定を動かさず、数字として併記するだけにする
    if (median <= FAST_SECS / 4) {
      // 6 時間以内
      tone = "fast";
      label = "速い";
    } else if (median <= FAST_SECS) {
      tone = "normal";
      label = "普通";
    } else {
      tone = "slow";
      label = "遅い";
    }
  } else if (median != null && median <= FAST_SECS / 4) {
    // 母数は 3 件に足りないが、**短時間で売れた実績がある**。
    // オーナー 2026-09-19:「1 件でも短時間で売れたら一応早いんじゃないの？」
    // 1 件でも 6 時間以内に売れたなら「その値段なら捌ける」と言ってよい。
    // 逆に 1 件が長かっただけでは「遅い」と言い切れない (たまたま高値だった等) ので、
    // 普通 / 遅い は今まで通り 3 件を待つ。件数は判定の横に出るので薄さは分かる
    tone = "fast";
    label = "速い";
  } else if (!firstLook && stale >= MIN_KNOWN && stale > goneLives.length) {
    // 売れた実績が足りない (中央値が出せない) 上に、2 日以上並んだままの在庫の方が多い。
    // その市場は動いていないので遅いと言い切ってよい。
    // ただし初回の取得では言わない。齢は出品時刻から分かるが、こちらはまだ
    // 「その間に売れて入れ替わったか」を一度も見ていないため (2026-09-19 オーナー指摘)
    tone = "slow";
    label = "遅い";
  }
  // 判定は動かさないが、より長く並んだままの在庫の数は必ず併記する
  // (「その値段なら 3 時間、それより高いと並んだまま」という読み方ができるように)
  const olderThanMedianEarly = median == null ? 0 : aliveAges.filter((a) => a > median).length;
  const enough = label !== "";
  // 判定は出したが根拠が 3 件に届いていない (「1 件でも早ければ速い」の規則で出した分)
  const thin = enough && goneLives.length > 0 && goneLives.length < MIN_KNOWN;

  // まだ判定できない時の目安: **判定の門と同じ 1 日の母数**が 3 件になるのはいつか。
  // 2 日の母数 (d2 / NORMAL_SECS) で数えていたので、門とずれた時刻を出していた (2026-09-20)
  aliveAges.sort((a, b) => b - a);
  const need = MIN_KNOWN - d1.known;
  let etaSecs: number | null = null;
  if (!enough && need > 0 && aliveAges.length >= need) {
    etaSecs = Math.max(0, FAST_SECS - aliveAges[need - 1]);
  }

  // 「3.8 時間で売れる」と出しているのに、それより長く並んでいる出品が何件あるか。
  // 観測できている期間が短いうちは中央値が短く出るので、その事実を数字で併記する
  // (2026-09-17 レビュー: 判定が出た銘柄の生存中 175 件のうち 117 件が中央値より古かった)
  const olderThanMedian = olderThanMedianEarly;
  const droppedUnsold = (state.daily ?? []).reduce((sum, d) => sum + (d.survived ?? 0), 0);
  const droppedBuried = (state.daily ?? []).reduce((sum, d) => sum + (d.buried ?? 0), 0);

  return {
    label,
    tone,
    olderThanMedian,
    droppedUnsold,
    droppedBuried,
    pending,
    unknown,
    soldPrices,
    truncated: state.list_complete === false,
    medianMin: median != null ? Math.round(median / 60) : null,
    soldIn24h: d1.rate,
    soldIn48h: d2.rate,
    known24: d1.known,
    hit24: d1.hit,
    known48: d2.known,
    hit48: d2.hit,
    gone: goneLives.length,
    alive: aliveAges.length,
    total: state.total ?? null,
    lastAt: state.sampled_at || null,
    enough,
    thin,
    firstLook,
    stale,
    staleRatio,
    oldestMin: aliveAges.length > 0 ? Math.round(aliveAges[0] / 60) : null,
    etaMin: etaSecs != null ? Math.round(etaSecs / 60) : null,
  };
}

