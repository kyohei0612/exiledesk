/**
 * tree-decide.ts — 創生の樹の MOD を「どの物を、どの順で、何個まで試すか」決める (2026-09-23)
 *
 * オーナーの案:「4 種類か。フラクチャーオーブの値段、フラクチャー品、フラクチャー無し品で
 * ゆるい検索、フラクチャー無し品で今の厳しいけど消去いらない道 (サフィ確定冒涜でフラクチャー
 * チャレンジ)。これで一番安いベースを 5 個か 10 個か、期待値出してどれが一番いいのか決めれんかな」。
 *
 * ## 候補を 1 列に並べる
 * 4 種類とも「1 回あたりいくら払って、何 % で固定済みが手に入るか」に直せます:
 *
 *   固定済み品          そのまま買う                     成功率 1
 *   厳しい検索 (P1+S0〜2) 右側の高貴でサフィを 2 個まで足す → 右側ネクロ冒涜 → 固定  1/3 (消去なし)
 *   厳しい検索 (P1+S3)    右側ネクロ冒涜がサフィ 1 個を冒涜 MOD に置き換える → 本物 3 個 → 1/3 (消去なし)
 *
 * **消去のお告げは使いません** (オーナー 2026-09-23:「消去ガチャはお告げ使わないよ」)。
 * 消去は素の消去だけで、それを使うのはゆるい検索の「減らして冒涜」だけです。
 *   ゆるい検索 (N MOD)  減らして冒涜 or そのまま固定       1/N   (安い方)
 *
 * どれも「1 個成功したら終わり」なので、**1 回あたりの費用 ÷ 成功率** (= 成功 1 回あたりの
 * 期待費用) の小さい順に試すのが最適です (独立な試行を順に試す時の古典的な並べ方)。
 *
 * ## 何個まで試すか — 5 個か 10 個かは式が決める
 * 固定済み品は成功率 1 の候補なので、列のどこかに入ります。**そこより後ろは試す意味がありません**
 * (固定済みを買うほうが安い)。だから打ち切りは自動で決まり、全部外れたら固定済みを買う:
 *
 *   期待費用 = Σ (それまで全部外れる確率) × その候補の 1 回分  +  (全部外れる確率) × 固定済み品
 *
 * ## 失敗した物は 0 として数える
 * 別の MOD が固定されてしまった物は、この目的には使えません。売れる場合もありますが、
 * 値段が読めないので**回収 0 の安全側**で出します。
 *
 * ## 裏づけの無い前提
 * 冒涜の当て馬が固定の抽選に入らない (1/3 の根拠) はオーナーの実使用が根拠です
 * ([[fracture-route.ts]] の `FRACTURE_DECOY_NOTE`)。
 */
import { selfFracture } from "./self-fracture";

/** 単価 (神) */
/**
 * 満杯の側に寄せた冒涜は、既存の MOD を 1 個ランダムに冒涜 MOD へ置き換える。
 * ゲームのデータに裏づけは無く、**オーナーの実使用が根拠** (2026-09-23)。画面で断ること。
 */
export const NECRO_REPLACE_NOTE =
  "満杯のサフィックスに右側ネクロマンシーで冒涜すると、既存のサフィックスが 1 個ランダムに冒涜 MOD に"
  + "置き換わる、はオーナーの実使用が根拠で、ゲームのデータには裏づけがありません。";

export interface DecidePrices {
  orb: number;
  annul: number;
  /** 冒涜の骨 (装飾品は鎖骨) */
  bone: number;
  /** 右側ネクロマンシーのお告げ (冒涜をサフィックスに寄せる)。相場に無ければ null */
  necro: number | null;
  /** 高貴なオーブ */
  exalt: number;
  /** 右側の高貴なお告げ (高貴をサフィックスに寄せる = サフィを確定で 1 個足す)。無ければ null */
  dextralExalt: number | null;
}

/** 取引所から返ってきた 1 件 */
export interface TreeListing {
  /** どの検索から来たか */
  source: "fractured" | "strict" | "loose";
  /** 値段 (神) */
  price: number;
  /** 樹 MOD を含むプレフィックスの数 */
  prefixes: number;
  suffixes: number;
  /** 画面の見出し (出品者や名前など、呼ぶ側が決める) */
  label?: string;
}

/** 1 件を「1 回分の費用と成功率」に直した物 */
export interface Candidate {
  listing: TreeListing;
  /** どうやって固定するか */
  how: "buy" | "necro-desecrate" | "desecrate" | "direct" | "reduce";
  /** 1 回試すのにかかる期待費用 (神)。物の値段込み */
  perTry: number;
  hit: number;
  /** 成功 1 回あたりの期待費用。これの小さい順に試す */
  perSuccess: number;
}

/**
 * 1 件の試し方を決める。**樹 MOD はプレフィックス**の前提 (マナコスト効率)。
 * サフィックス側の樹 MOD が来たら左右を入れ替えて渡すこと。
 */
export function candidateOf(l: TreeListing, p: DecidePrices): Candidate | null {
  if (l.source === "fractured") {
    return { listing: l, how: "buy", perTry: l.price, hit: 1, perSuccess: l.price };
  }
  const mods = l.prefixes + l.suffixes;
  const make = (how: Candidate["how"], perTry: number, hit: number): Candidate =>
    ({ listing: l, how, perTry, hit, perSuccess: perTry / hit });

  // ---- 厳しい検索: 消去ガチャを使わない道だけ ----
  // オーナー:「フラクチャー無し品で、今の厳しいけど消去いらない道 (サフィ確定冒涜でフラクチャーチャレンジ)」。
  // 期待値だけなら素の消去で運ゲーするほうが安いことがあるが、この道はそれを使わないために分けた物
  if (l.source === "strict") {
    const ways: Candidate[] = [];
    // P1+S0〜2: 右側の高貴なお告げでサフィを 2 個まで足し (オーナー:「3 つまで安い」)、
    // 右側ネクロマンシーで冒涜をサフィに寄せて 4 MOD、当て馬を除いて 1/3。
    // 足したサフィは何でもいい (樹 MOD 以外は固定されても作る時に消せる前提の数合わせ)
    if (l.prefixes === 1 && l.suffixes <= 2 && p.necro != null) {
      const add = 2 - l.suffixes;
      if (add === 0 || p.dextralExalt != null) {
        const addCost = add * (p.exalt + (p.dextralExalt ?? 0));
        ways.push(make("necro-desecrate", l.price + addCost + p.necro + p.bone + p.orb, 1 / 3));
      }
    }
    // サフィ満杯でも、右側ネクロマンシーの冒涜は**既存のサフィを 1 個ランダムに冒涜 MOD に置き換える**
    // (オーナー 2026-09-23:「サフィ側に冒涜できない場合はランダムでサフィックス 1 つ冒涜してくれる、
    // システム上」)。置き換わったサフィが当て馬になるので本物は樹 MOD + サフィ 2 = 3 個 → 1/3。
    // プレフィックスの樹 MOD には当たらず、消去も要らない。**裏づけはオーナーの実使用** (NECRO_REPLACE_NOTE)
    if (l.prefixes === 1 && l.suffixes === 3 && p.necro != null) {
      ways.push(make("necro-desecrate", l.price + p.necro + p.bone + p.orb, 1 / 3));
    }
    // ネクロの値段が無ければ、そのまま固定 (1/4) しか無い
    if (l.prefixes === 1 && l.suffixes === 3) ways.push(make("direct", l.price + p.orb, 1 / 4));
    return ways.length ? ways.reduce((a, b) => (b.perSuccess < a.perSuccess ? b : a)) : null;
  }

  // ---- ゆるい検索: そのまま固定 / 減らして冒涜 (消去ガチャ) の安い方。どちらも 1/N ----
  if (mods >= 3) {
    const est = selfFracture(mods, { base: l.price, orb: p.orb, annul: p.annul, bone: p.bone });
    const best = est.best;
    if (!best) return null;
    // 最初から 3 MOD なら減らす必要が無い (消去 0 回)。冒涜して 1/3。言葉だけ分ける
    const how = best.kind === "reduce" && mods === 3 ? "desecrate" : best.kind;
    return make(how, best.perTry, best.hit);
  }
  // 2 MOD 以下は冒涜 1 回でオーブの要求 (4) に届かない
  return null;
}

export interface Decision {
  /** 試す順 (打ち切りより前だけ) */
  order: Candidate[];
  /** 全部外れた時に買う固定済み品。無ければ null */
  fallback: Candidate | null;
  /** この順で試した時の期待費用 (神)。全部外れて固定済みも無い時の分は含まない */
  expected: number;
  /** 全部外れる確率 (固定済みが無い時に「足りない」確率) */
  allMiss: number;
  /** 固定済みを最初から買った時の値段 (比較用) */
  buyOutright: number | null;
  /** 打ち切った候補 (固定済みを買うほうが安いので試さない) */
  skipped: Candidate[];
}

/**
 * 候補を並べて、何を何個まで試すか決める。
 *
 * 固定済み品が 1 件も無い時は打ち切りが決まらないので、**全部試す**前提で期待費用を出し、
 * それでも外れる確率 (`allMiss`) を返します。
 */
export function decide(listings: readonly TreeListing[], p: DecidePrices): Decision {
  const all = listings.map((l) => candidateOf(l, p)).filter((c): c is Candidate => c !== null);
  all.sort((a, b) => a.perSuccess - b.perSuccess);

  const fallback = all.find((c) => c.hit === 1) ?? null;
  const cut = fallback ? all.indexOf(fallback) : all.length;
  const order = all.slice(0, cut);
  const skipped = all.slice(cut + (fallback ? 1 : 0));

  let expected = 0;
  let miss = 1;
  for (const c of order) {
    expected += miss * c.perTry;
    miss *= 1 - c.hit;
  }
  if (fallback) {
    expected += miss * fallback.perTry;
    miss = 0;
  }
  const buyOutright = fallback ? fallback.perTry : null;
  return { order, fallback, expected, allMiss: miss, buyOutright, skipped };
}

/** 1 本の道を「85% に届く最小の個数だけまとめて買う」時の見積もり */
export interface Batch {
  /** 買う個数 */
  count: number;
  /** その個数で少なくとも 1 個固定できる確率 */
  chance: number;
  /** 物の値段の合計 (神)。まとめて買うので全部払う */
  base: number;
  /** 加工代の期待値 (神)。**成功した所で止める** (成功後の物には手を付けない) */
  craft: number;
  total: number;
  /** 取れた出品では足りず、最後の 1 件と同じ物が買える前提で足した個数 */
  assumed: number;
  /** 買う物 (安い順) */
  items: Candidate[];
}

/** 既定の下限。オーナー 2026-09-23:「85% 以上の確率の個数でそれぞれ計算で OK、それ以上は買う必要ない」 */
export const BATCH_TARGET = 0.85;

/** 何個まで足すか (これで届かなければ届かないと返す) */
const BATCH_CAP = 30;

/**
 * 1 本の道 (ゆるい or 厳しい) を、成功率 `target` に届く最小の個数だけ安い順に買った時の総額。
 *
 * オーナーの比べ方:「ゆるい検索 → 5 個買って消去スパム → 冒涜 → 固定」と「厳しい検索 → 5 個
 * 買って冒涜 → 固定」を、同じ成功率で比べてどっちが安いか。**ゆるい方は消去で母数が減るので、
 * 同じ成功率にするにはたくさん買う必要がある** (実測: 85% に厳しい 5 個 / ゆるい 10 個)。
 *
 * 出品が足りない時は、最後の 1 件と同じ物が買える前提で足し、その数を `assumed` に返します
 * (実際はもっと高い物になるので、その分は少し安めに出る)。
 */
export function batchFor(
  listings: readonly TreeListing[],
  p: DecidePrices,
  target = BATCH_TARGET,
): Batch | null {
  const cs = listings.map((l) => candidateOf(l, p)).filter((c): c is Candidate => c !== null && c.hit < 1);
  if (cs.length === 0) return null;
  // 安い順 (まとめて買う時は値段の安い順に揃える。試す順は成功 1 回あたりの安い順)
  const byPrice = [...cs].sort((a, b) => a.listing.price - b.listing.price);
  const items: Candidate[] = [];
  let miss = 1;
  let assumed = 0;
  for (let i = 0; i < BATCH_CAP && 1 - miss < target; i++) {
    const c = byPrice[i] ?? byPrice[byPrice.length - 1]!;
    if (i >= byPrice.length) assumed++;
    items.push(c);
    miss *= 1 - c.hit;
  }
  if (1 - miss < target) return null;
  // 加工は成功 1 回あたりの安い順に試す (同じ物を買うなら、当たりやすい物から)
  const tryOrder = [...items].sort((a, b) => a.perSuccess - b.perSuccess);
  let craft = 0;
  let m = 1;
  for (const c of tryOrder) {
    craft += m * (c.perTry - c.listing.price);
    m *= 1 - c.hit;
  }
  const base = items.reduce((a, c) => a + c.listing.price, 0);
  return { count: items.length, chance: 1 - miss, base, craft, total: base + craft, assumed, items: tryOrder };
}

/**
 * 1 本の道を「平均でいくらか」で要約する (オーナー 2026-09-23:「基本確率だけど平均値で計算しよう。
 * カオススパムもそういうのあるだろうし」)。**比べる物差しは期待値 1 本にそろえる**。
 *
 * 1 個ずつ買って試し、成功で止め、外れ続けたら固定済みを買う (`decide` の結果) を前提に:
 */
export interface RouteSummary {
  /** 平均でかかる額 (神) */
  expected: number;
  /** 平均で買うベースの数 (固定済みは除く) */
  avgItems: number;
  /** 1 個目で当たった時の額 */
  firstHit: number | null;
  /** 全部外れて固定済みを買った時の額 (一番悪い時) */
  worst: number;
  /** 全部外れる確率 */
  allMiss: number;
}

export function summarize(d: Decision): RouteSummary {
  let avgItems = 0;
  let m = 1;
  for (const c of d.order) { avgItems += m; m *= 1 - c.hit; }
  const worst = d.order.reduce((a, c) => a + c.perTry, 0) + (d.fallback?.perTry ?? 0);
  return {
    expected: d.expected,
    avgItems,
    firstHit: d.order[0]?.perTry ?? d.fallback?.perTry ?? null,
    worst,
    allMiss: d.order.length ? m : 0,
  };
}
