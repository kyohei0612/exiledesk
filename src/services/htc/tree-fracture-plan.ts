/**
 * tree-fracture-plan.ts — 創生の樹の MOD を「固定済みで買う」か「自前で固定する」か (2026-09-23)
 *
 * オーナーの順番:「フラクチャーオーブの値段みて、フラクチャー済みとフラクチャーの値段まず
 * 比べてから起動がいい。フラクチャー済み品の値段は 1 個最安値取得できたらそれで比較できる」
 * 「検索は必ずコラプト無し」。
 *
 *   1. フラクチャーオーブの値段 … カレンシーランキングから (**信号 0**)
 *   2. 固定済み品の最安 1 件   … 取引所に 1 本 (**信号 1**)
 *   3. 比べて、安い方で起動
 *
 * 自前の費用は [[self-fracture.ts]] の式そのものです。**ベース代だけは N 倍で効く**ので分けて持ち、
 * それ以外 (消去・鎖骨・オーブ) を「固定費」として先に出します:
 *
 *   自前の期待 = N × ベース代 + 固定費(N)
 *
 * 実勢 (2026-09-23、オーブ 8.52 神 / 消去 0.73 / 鎖骨 0.34):
 *   4 MOD の物: ベース × 4 + 29.5 神   (減らして冒涜)
 *   6 MOD の物: ベース × 6 + 37.5 神
 * 固定済み品が 66 神なら、5 カオス (0.6 神) のベースで自前が勝ちます。
 *
 * ## ここは投げません
 * 検索条件を組むだけです。コラプト無しは `buildSpecQuery` が常に入れます。
 */
import { selfFracture, type FractureRoute } from "./self-fracture";

/** 何 MOD の物を買うか、の候補。創生の樹の指輪は 4 MOD 以上で生まれる */
export const TREE_ITEM_MODS = [4, 5, 6] as const;

/** 単価 (神) */
export interface OrbPrices {
  /** フラクチャーオーブ。相場に無ければ null */
  orb: number | null;
  annul: number;
  /** 冒涜の骨 (装飾品は鎖骨) */
  bone: number;
}

/** MOD 数ごとの自前の見積もり (ベース代を抜いた形) */
export interface SelfFractureRow {
  mods: number;
  /** ベース代を除いた期待費用 (神)。ここに N × ベース代を足すと総額 */
  fixed: number;
  /** その MOD 数で得な道 */
  path: FractureRoute["kind"];
  /** 期待で何個試すか (= N) */
  expectedItems: number;
}

export interface TreeFracturePlan {
  /** オーブの値段 (神)。null なら自前の見積もりは出せない */
  orb: number | null;
  /** 「減らして冒涜」が得になるオーブの値段 (4 MOD の時)。これを超えていれば減らす */
  breakEvenOrb: number | null;
  rows: SelfFractureRow[];
}

/** 取引所に投げる前に出せる分 (信号 0) */
export function treeFracturePlan(prices: OrbPrices): TreeFracturePlan {
  const rows: SelfFractureRow[] = [];
  for (const mods of TREE_ITEM_MODS) {
    // ベース代 0 で解けば「固定費」だけが残る (総額はベース代について線形)
    const est = selfFracture(mods, { base: 0, orb: prices.orb, annul: prices.annul, bone: prices.bone });
    if (!est.best) continue;
    rows.push({ mods, fixed: est.best.expected, path: est.best.kind, expectedItems: est.expectedItems });
  }
  const be = selfFracture(4, { base: 0, orb: prices.orb, annul: prices.annul, bone: prices.bone }).breakEvenOrb;
  return { orb: prices.orb, breakEvenOrb: be, rows };
}

export interface TreeFractureVerdict {
  /** 固定済み品の最安 (神) */
  fracturedPrice: number;
  /** 自前の期待 (神)。ベース代を入れた総額 */
  selfCost: number;
  /** 安い方 */
  choice: "buy-fractured" | "self-fracture";
  /** どれだけ差があるか (神、正の数) */
  margin: number;
}

/**
 * 固定済み品の最安 1 件が取れたら比べる (信号 1 の後)。
 *
 * `basePrice` は**固定されていない**樹 MOD 入りの物の値段。分からなければ 0 で渡すと
 * 「自前の下限」との比較になります (その時でも固定済みが高ければ、買うのは損と言える)。
 */
export function treeFractureVerdict(
  plan: TreeFracturePlan,
  fracturedPrice: number,
  basePrice: number,
  mods: number,
): TreeFractureVerdict | null {
  const row = plan.rows.find((r) => r.mods === mods) ?? plan.rows[0];
  if (!row) return null;
  const selfCost = row.fixed + row.mods * basePrice;
  const choice = fracturedPrice <= selfCost ? "buy-fractured" : "self-fracture";
  return { fracturedPrice, selfCost, choice, margin: Math.abs(selfCost - fracturedPrice) };
}
