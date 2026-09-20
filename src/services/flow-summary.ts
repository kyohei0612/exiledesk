/**
 * flow-summary.ts — 捌き速度の「読み方」(速い / 普通 / 遅い の判定と言い回し)
 *
 * 記録そのもの (取る・保存する) は market-flow.ts。こちらは**読んだ記録を人の言葉にする**
 * 純粋関数だけ。通信もしないので、判定の基準を変える時はここだけ見る。
 *
 * 2026-09-19 に market-flow.ts (582 行) から切り出した。
 */
import type { WatchState } from "./market-flow";

/** 分 → 「3 時間」「25 分」「2 日」 */
export function fmtSellTime(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.max(1, Math.round(min))} 分`;
  const h = min / 60;
  if (h < 48) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, "") : Math.round(h)} 時間`;
  return `${Math.round(h / 24)} 日`;
}

/**
 * 判定を 1 行の日本語にする。実測そのままを書く
 * (オーナー指示 2026-09-17:「事実ベースで売れ時間出そう。暫定とかいいから」)。
 */
export function flowSentence(f: FlowSummary): string {
  if (f.truncated) return "出品が多すぎて (100 件超) 売れたかどうかを判定できません";
  if (f.firstLook && f.gone === 0) {
    return `初回の取得です。今並んでいる ${f.alive} 件（最長 ${fmtSellTime(f.oldestMin)}）を覚えたところなので、次回の取得でこのうち何件が売れたかを見て判定します`;
  }
  if (f.gone === 0) {
    if (f.alive === 0) return "まだ記録がありません";
    return `まだ 1 件も売れていません（並んでいる ${f.alive} 件・最長 ${fmtSellTime(f.oldestMin)}）`;
  }
  const parts = [`${f.gone} 件が売れました（売れるまで ${fmtSellTime(f.medianMin)}）`];
  if (!f.enough) parts.push(`判定にはあと ${Math.max(0, MIN_KNOWN - f.known24)} 件 (結果が分かっている出品が ${MIN_KNOWN} 件要ります)`);
  else if (f.gone < MIN_KNOWN) parts.push(`${f.gone} 件だけで出した判定です`);
  // 「速い」と出していても、それより長く並んでいる出品があるなら必ず併記する
  if (f.olderThanMedian > 0) parts.push(`ただし並んでいる ${f.alive} 件のうち ${f.olderThanMedian} 件はもっと長く並んでいます`);
  if (f.stale > 0) parts.push(`2 日以上売れ残り ${f.stale} 件`);
  if (f.droppedUnsold > 0) parts.push(`7 日売れずに打ち切り ${f.droppedUnsold} 件`);
  if (f.droppedBuried > 0) parts.push(`最安帯から沈んで追跡をやめた ${f.droppedBuried} 件`);
  return parts.join("。");
}

export type FlowTone = "fast" | "normal" | "slow" | "unknown";

export interface FlowSummary {
  /** "速い" / "普通" / "遅い" / "" (母数不足) */
  label: string;
  tone: FlowTone;
  /** まだ並んでいる出品のうち、表示している「売れるまでの時間」より長く並んでいる件数 */
  olderThanMedian: number;
  /** 7 日売れずに打ち切った件数 (日次集計から。中央値には入らない) */
  droppedUnsold: number;
  /** 最安帯から沈んで追跡をやめた件数 (売れたかは分からないので売れ残りとは分ける) */
  droppedBuried: number;
  /** 売れた出品の値段 (出品時の通貨のまま)。平均売値の計算に使う */
  soldPrices: { amount: number; currency: string }[];
  /** 出品が 100 件を超えていて「消えた」を判定できない状態か */
  truncated: boolean;
  /** 消えた出品の寿命の中央値 (分)。参考表示用 */
  medianMin: number | null;
  /** 1 日 / 2 日以内に売れた割合 (0-1)。結果が分かっている件数に対する割合 */
  soldIn24h: number | null;
  soldIn48h: number | null;
  /** その割合の分母 (結果が分かっている件数) と分子 */
  known24: number;
  hit24: number;
  known48: number;
  hit48: number;
  /** 追跡した件数 */
  gone: number;
  alive: number;
  /** 直近の出品総数 */
  total: number | null;
  lastAt: number | null;
  /** 判定に足りるだけのデータがあるか */
  enough: boolean;
  /**
   * 判定は出ているが、根拠の売れた件数が MIN_KNOWN (3 件) に届いていない。
   *
   * 2026-09-19 のオーナー指示「1 件でも短時間で売れたら一応早いんじゃないの?」で、
   * 6 時間以内に売れた実績が 1 件でもあれば「速い」と言うようにした。文には
   * 「1 件だけで出した判定です」と書いていたが、一覧で見えるのは札だけなので、
   * 3 件以上で出した判定と区別が付かなかった (2026-09-20)。札に印を付けるために出す。
   */
  thin: boolean;
  /**
   * この銘柄をまだ 1 回しか見ていない (初回の取得)。
   *
   * 2026-09-19 オーナー「初回の時遅いって出るけど、初回だから次回更新時判断ってやつ追加しなきゃね」:
   * 「2 日以上並んでいる」は出品時刻から初回でも分かるので、古い在庫が並んでいる銘柄は
   * 1 回目でいきなり「遅い」になっていた。こちらはまだ市場の動きを一度も見ていないのに。
   */
  firstLook: boolean;
  /** 48 時間以上売れ残っている件数と、その最安に対する値段の倍率 (値段不相応の目安) */
  stale: number;
  staleRatio: number | null;
  /** まだ売れていない出品のうち一番古い物の齢 (分) */
  oldestMin: number | null;
  /** 判定が出せるまでの目安 (分)。売れ残りが 48 時間に届くまで。判定済みなら null */
  etaMin: number | null;
}

const HOUR = 3600;
/** オーナー指示: 24 時間以内=速い / 48 時間以内=普通 / それ以降=遅い */
const FAST_SECS = 24 * HOUR;
const NORMAL_SECS = 48 * HOUR;

const EMPTY_SUMMARY: FlowSummary = {
  label: "",
  tone: "unknown",
  olderThanMedian: 0,
  droppedUnsold: 0,
  droppedBuried: 0,
  soldPrices: [],
  truncated: false,
  medianMin: null,
  soldIn24h: null,
  soldIn48h: null,
  known24: 0,
  hit24: 0,
  known48: 0,
  hit48: 0,
  gone: 0,
  alive: 0,
  total: null,
  lastAt: null,
  enough: false,
  thin: false,
  firstLook: false,
  stale: 0,
  staleRatio: null,
  oldestMin: null,
  etaMin: null,
};

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

/** 判定に要る最低の母数 */
const MIN_KNOWN = 3;

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
  for (const t of state.tracked) {
    // 値段の付け替え (消えた直後に同じ出品者が並べ直した) は売れても売れ残ってもいないので外す
    if (t.relisted) continue;
    const start = t.listed_at ?? t.first_seen;
    const life = Math.max(60, (t.gone_at ?? nowSec) - start);
    const gone = !!t.gone_at;
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
    return { ...EMPTY_SUMMARY, total: state.total ?? null, lastAt: state.sampled_at || null };
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

/** 分 → "18 分" / "3 時間 20 分" / "2 日" */
export function fmtAge(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} 分`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 === 0 ? `${h} 時間` : `${h} 時間 ${min % 60} 分`;
  const d = Math.floor(h / 24);
  return h % 24 === 0 ? `${d} 日` : `${d} 日 ${h % 24} 時間`;
}

/** 0-1 → "78%" */
export function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

