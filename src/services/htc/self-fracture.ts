/**
 * self-fracture.ts — 特殊 MOD を自前で固定する時の期待費用 (2026-09-23)
 *
 * オーナーのルール:「フラクチャーを自前でする場合は創生の樹 MOD が入ってる物を購入し、
 * 3 MOD まで減らし冒涜をかけ、3 MOD + 冒涜の状態でフラクチャーを試す」
 * 「1 個できたらいい」「安い順で考えて OK」。
 *
 * ## 成功率は、減らしても減らさなくても 1/N
 * 素の消去もフラクチャーも「均等に 1 個選ぶ」ので、最後に固定される 1 個は
 * **最初の N 個から均等に選ばれるのと同じ**になります。
 *
 *   減らす道:  消去を生き残る 3/N  ×  冒涜の当て馬を除いた 3 個から 1/3  =  1/N
 *   そのまま:  N 個から 1/N
 *
 * 200 万回ずつ回して確認済み (N=4: 25.09% / N=5: 19.97% / N=6: 16.70%)。
 * 「3 MOD + 冒涜で 1/3」が得になるのは、**消去を使わずに 3 MOD にできた時だけ**です。
 *
 * ## 違うのはオーブ代
 * 減らす道は、消去で樹 MOD を失った物には**オーブを打たずに済みます** (打つ所まで行くのが 3/N)。
 * そのぶん消去と鎖骨を払う。だから:
 *
 *   オーブが約 4 神より安い → そのまま固定 (消去代と鎖骨代が浮く)
 *   オーブが高い           → 減らしてから冒涜で固定 (失敗品にオーブを使わない)
 *
 * どちらが得かは相場で変わるので、両方出して安い方を選ばせます。
 *
 * ## 1 個成功したら止める
 * まとめて買うのではなく、**安い物から 1 個ずつ試して、成功した所で終わり**。
 * 必要な個数は幾何分布で、期待は N 個。何個用意すれば何 % で届くかも返します。
 *
 * ## 冒涜の当て馬が抽選に入らない、は裏づけ無し
 * オーナーの実使用が根拠です ([[fracture-route.ts]] の `FRACTURE_DECOY_NOTE`)。
 * 減らす道の 1/3 はこれに依っています。
 */

/** 固定の抽選に入る最低の MOD 数。フラクチャーオーブの要求 (クライアントの説明) */
export const FRACTURE_NEEDS = 4;

/** 1 つの道の見積もり */
export interface FractureRoute {
  /** "direct" = そのまま固定 / "reduce" = 3 MOD まで減らして冒涜で固定 */
  kind: "direct" | "reduce";
  /** 1 個あたりの成功率 (= 1/N) */
  hit: number;
  /** 1 個試すのにかかる期待費用 (神)。ベース代込み */
  perTry: number;
  /** 1 個成功するまでの期待費用 (神) */
  expected: number;
  /** 1 個試すのに打つ消去の期待回数 */
  annulsPerTry: number;
  /** 1 個試すのにオーブを打つ確率 (そのままなら 1、減らすなら 3/N) */
  orbRate: number;
}

export interface SelfFracture {
  /** 買う物の MOD 数 */
  mods: number;
  /** 期待で何個試すか (= N) */
  expectedItems: number;
  routes: FractureRoute[];
  /** 安い方。オーブの値段が無ければ null */
  best: FractureRoute | null;
  /** 何個用意すれば何 % で 1 個成功するか */
  coverage: { items: number; chance: number }[];
  /** 減らすほうが得になるオーブの値段 (神)。これを超えたら reduce */
  breakEvenOrb: number | null;
}

/** 単価 (神)。相場から渡す */
export interface FracturePrices {
  /** 樹 MOD が入った物 1 個 */
  base: number;
  /** フラクチャーオーブ。相場に無ければ null */
  orb: number | null;
  /** 消去のオーブ */
  annul: number;
  /** 冒涜の骨 (装飾品は鎖骨) */
  bone: number;
}

/**
 * 減らす道で、1 個試すのに打つ消去の期待回数。
 *
 * N 個から 3 個まで減らすのに最大 N-3 回。ただし途中で樹 MOD に当たったらそこで止める。
 * m 回目を打つのはそこまで生き残った時だけで、その確率は (N-m+1)/N。
 */
export function expectedAnnuls(mods: number): number {
  let s = 0;
  for (let m = 1; m <= mods - 3; m++) s += (mods - m + 1) / mods;
  return s;
}

/**
 * 樹 MOD が 1 つ入った N MOD の物を買って、自前で固定した時の見積もり。
 *
 * `mods` は**樹 MOD を含む**明示 MOD の数。3 未満は冒涜を足してもオーブの要求 (4) に
 * 届かないので扱いません。
 */
export function selfFracture(mods: number, prices: FracturePrices): SelfFracture {
  const N = mods;
  const hit = 1 / N;
  const routes: FractureRoute[] = [];

  // そのまま固定: オーブは 4 MOD 以上を要求するので、N >= 4 の時だけ
  if (N >= FRACTURE_NEEDS && prices.orb != null) {
    const perTry = prices.base + prices.orb;
    routes.push({ kind: "direct", hit, perTry, expected: N * perTry, annulsPerTry: 0, orbRate: 1 });
  }
  // 減らして冒涜: 3 MOD まで消去で減らし、当て馬を 1 個足して 4 MOD で固定
  if (N >= 3 && prices.orb != null) {
    const annulsPerTry = expectedAnnuls(N);
    const orbRate = Math.min(1, 3 / N);
    const perTry = prices.base + prices.annul * annulsPerTry + orbRate * (prices.bone + prices.orb);
    routes.push({ kind: "reduce", hit, perTry, expected: N * perTry, annulsPerTry, orbRate });
  }

  const best = routes.length ? routes.reduce((a, b) => (b.expected < a.expected ? b : a)) : null;

  const coverage = [3, 5, 10].map((k) => ({ items: k, chance: 1 - Math.pow(1 - hit, k) }));

  // 分かれ目: N・(base + orb) = N・base + N・annul・E + 3・(bone + orb) を orb について解く
  const breakEvenOrb = N > 3
    ? (N * prices.annul * expectedAnnuls(N) + 3 * prices.bone) / (N - 3)
    : null;

  return { mods: N, expectedItems: N, routes, best, coverage, breakEvenOrb };
}

/**
 * 何個用意すれば `target` の確率で 1 個成功するか。
 * 「期待は N 個」だけだと、運が悪い時の予算が分からないので。
 */
export function itemsFor(mods: number, target: number): number {
  const miss = 1 - 1 / mods;
  return Math.ceil(Math.log(1 - target) / Math.log(miss));
}
