/**
 * stat-scale.ts — MOD の stat の「データの値 → 画面の値」の決まりは、アプリ全体でここ 1 つ (2026-10-03)
 *
 * オーナー 2026-10-03「異界の MOD で、アミュレットなのに火スペルの MOD の中身が 400% とか。MOD をフルチェックしてくれ」。
 * クライアントの値は stat ごとに単位が違う: 1 万分率 (fire_spell_additional_critical_strike_chance_permyriad 400 → 4%)、
 * 毎分 (base_life_regeneration_rate_per_minute 60 → 毎秒 1)、ミリ秒 (rage_loss_delay_ms_+ 3000 → 3 秒) など。
 * 今までクラフトステージ (stage-core.ts) だけが語尾で割っていて、クラフト計算機・MOD の一覧・取引所の下限は生の値のまま出していた。
 *
 * 決まりの元は **クライアントの stat_descriptions.csd の token** (divide_by_one_hundred / per_minute_to_per_second …)。
 * scripts/build-stat-scale-from-client.mjs がそれを stat-scale.json に写し、ここはその表を引く。表に無い新しい stat は
 * 語尾の規則 (permyriad / per_minute / _ms) で受ける (表を作り直すまでの保険。表と食い違わないことは tests/mod-values.test.ts で見る)。
 *
 * 計算機のエンジン (poe2htc) の段の `ranges` は 2 つの流儀が混ざっている:
 *   - `stats` を持つ段 (普通の MOD、クライアントから足した MOD) … 生の値 (クライアントそのまま)
 *   - `stats` を持たない段 (同梱の冒涜 / エッセンス、poe2db 由来) … 画面の値 (poe2db が表示値で載せている)
 * なので換算は **その段の stats で決める**。stats が無い段は画面の値と見てそのまま出す (`tierDisplayRanges`)。
 * この前提は `pnpm check:mods` (scripts/check-mod-values.mjs) が原本と突き合わせて全段で確かめている。
 */
import table from "./stat-scale.json";

export interface StatScale {
  /** データの値をこれで割ると画面の値 (double の stat は 0.5) */
  div: number;
  /** 小数の桁 */
  digits: number;
}

const TABLE = (table as { stats: Record<string, StatScale> }).stats;

/** 表に無い stat の語尾の規則 (表と同じ答えになることをテストで押さえている) */
function fallbackScale(statId: string): StatScale | null {
  if (/permyriad/.test(statId)) return { div: 100, digits: 2 };
  if (/per_minute/.test(statId)) return { div: 60, digits: 2 };
  if (/_ms(_|$)/.test(statId)) return { div: 1000, digits: 2 };
  // 武器のクリティカル率 (local_critical_strike_chance) と「+#% to Critical Hit Chance」系は 1 万分率だが id に permyriad が無い
  if (/^local_critical_strike_chance$|additional_base_critical_strike_chance|base_thorns_critical_strike_chance/.test(statId)) return { div: 100, digits: 2 };
  return null;
}

/** stat の換算。割らない stat (ほとんど) は null */
export function scaleOf(statId: string | undefined | null): StatScale | null {
  if (!statId) return null;
  return TABLE[statId] ?? fallbackScale(statId);
}

/** データの値 1 つを画面の値に (丸めは桁で) */
export function displayValue(statId: string | undefined | null, raw: number): number {
  const sc = scaleOf(statId);
  if (!sc) return raw;
  const p = 10 ** sc.digits;
  return Math.round((raw / sc.div) * p) / p;
}

/** 段の幅 [下, 上] を画面の値に */
export function displayRange(statId: string | undefined | null, range: readonly (number | string)[]): [number, number] {
  return [displayValue(statId, Number(range[0])), displayValue(statId, Number(range[1] ?? range[0]))];
}

/** エンジンの段 (stats は型に無いがデータには入っている) */
export interface TierLike {
  readonly ranges: readonly (readonly (number | string)[])[];
  readonly stats?: readonly string[];
}

/**
 * 段の幅を全部画面の値に。**stats を持つ段だけ換算する** (stats が無い段の ranges は poe2db 由来の表示値)。
 * stats と ranges の数が合わない段は、対応がずれるので換算しない (生のまま出すより、点検で見つける方を選ぶ)
 */
export function tierDisplayRanges(tier: TierLike): number[][] {
  const stats = tier.stats ?? [];
  if (stats.length === 0 || stats.length !== tier.ranges.length) return tier.ranges.map((r) => [Number(r[0]), Number(r[1] ?? r[0])]);
  return tier.ranges.map((r, i) => displayRange(stats[i], r));
}

/** 段の幅の表示 (「150-164」「4-5 / 10-20」。幅が 1 点なら数字だけ) */
export function rangeLabel(tier: TierLike): string {
  return tierDisplayRanges(tier).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(" / ");
}
