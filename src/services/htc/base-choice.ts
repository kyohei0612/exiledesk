/**
 * base-choice.ts — 「どのベースから始めるか」を並べる (2026-09-23)
 *
 * オーナー指示:「まずクラフトの MOD 解析から、ベース何からスタートか決める作業だね。
 * そこが一番ネックなところ。それ次第で試算が変わる。手動の所は手動でいきたい」。
 *
 * ## ここが分岐点
 * ベースを変えると**解ける / 解けないが変わります**。同じクラスでも:
 *   - **枠が違う** … 指輪なら 黄昏 4P/2S / 薄明 2P/4S / 半影 5P/1S / 仄暗い 1P/5S
 *   - **暗黙がタダで乗る** … 青金石 = 最大マナ +(20-30)、真珠 = キャストスピード +(7-10)%
 *   - **品質の最大値を上げる** … ブリーチの指輪 +20% / 洗練されたブリーチリング +25%。
 *     **これを使えばプレフィックスを 1 つも使わずに品質 40% に届きます**
 *     (ブリーチのエッセンスで上げる道と違い、枠を食わない)
 *
 * ## 貼り付けた時は**ベースは決まっています**
 * オーナー指摘 2026-09-23:「忍者発祥はニーモニックリングが確定のベースになるね。
 * もし 0 からなら素材選びから確定させていかないとね」。
 *
 * つまり用途が 2 つあり、**出し方が逆**です:
 *   - **真似る** … ベースは貼り付けが決めている。他は**参考**で、先頭に「今の物」を出す
 *   - **0 から作る** … ここが本番。枠と暗黙で選ぶ
 * どちらも**選ぶのは人**です ([[htc-craft-engine-direction]]「手動の所は手動でいきたい」)。
 *
 * 費用まで出すと重いので、**選ばれた 1 つだけ**解いてください ([[solo-cost.ts]] と同じ分け方)。
 */
import { htcBaseInfo, htcBaseLimits } from "./patch";
import { DEFAULT_LIMITS } from "../../vendor/poe2htc/engine/item";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";

/** ベース 1 つぶんの見出し */
export interface BaseChoice {
  /** エンジンに渡す名前 (英語) */
  baseType: string;
  /** ゲームの日本語名 */
  ja: string;
  /** 必要レベル */
  lvl: number;
  prefixes: number;
  suffixes: number;
  /** 暗黙の効果 (日本語)。タダで乗る分 */
  implicits: string[];
  /** 品質の最大値を上げる暗黙があれば、その上げ幅 (%)。無ければ 0 */
  maxQualityPlus: number;
  /** 狙いが枠に収まるか */
  fits: boolean;
  /** 収まらない時の理由 */
  why: string | null;
  /** 貼り付けが指しているベースか (真似る時はこれが答え) */
  current: boolean;
}

/** `[Quality|品質]` → `品質`、`[Quality]` → `Quality` */
function stripMarkers(t: string): string {
  return t.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");
}

/** 「品質の最大値 +20%」から 20 を取る。無ければ 0 */
function maxQualityPlusOf(implicitsJa: readonly string[]): number {
  for (const t of implicitsJa) {
    if (!t.includes("品質") || !t.includes("最大")) continue;
    const m = /([0-9]+)%/.exec(t);
    if (m) return Number(m[1]);
  }
  return 0;
}

/**
 * そのクラスのベースを、**狙いが入る物を先に**並べる。
 *
 * @param cls 狙いを引いたクラス (`itemBaseFor` の戻り。ベース名は問わない)
 * @param targets 狙う MOD。側の数だけ見る
 */
export function baseChoices(
  data: PatchData,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { current?: string | null } = {},
): BaseChoice[] {
  let wantP = 0;
  let wantS = 0;
  for (const t of targets) {
    const mod = data.mods.get(t.modId);
    if (!mod) continue;
    if (mod.type === "prefix") wantP++;
    else wantS++;
  }
  const limits = htcBaseLimits();
  const out: BaseChoice[] = [];
  for (const [baseType, info] of Object.entries(htcBaseInfo())) {
    if (info.cls !== cls.id) continue;
    const lim = limits[baseType] ?? cls.limits ?? DEFAULT_LIMITS;
    // `[Quality|品質]` のようなリッチテキスト記号は画面に出さない
    const implicitsJa = (info.implicits ?? []).map((im) => stripMarkers(im.ja));
    const fitsP = wantP <= lim.prefixes;
    const fitsS = wantS <= lim.suffixes;
    out.push({
      baseType,
      ja: info.ja ?? baseType,
      lvl: info.lvl ?? 1,
      prefixes: lim.prefixes,
      suffixes: lim.suffixes,
      implicits: implicitsJa,
      maxQualityPlus: maxQualityPlusOf(implicitsJa),
      current: baseType === opts.current,
      fits: fitsP && fitsS,
      why: fitsP && fitsS
        ? null
        : `狙いが ${wantP}P/${wantS}S なのに枠が ${lim.prefixes}P/${lim.suffixes}S`,
    });
  }
  // **今のベースが先頭。**真似る時はそれが答えなので、他を上に出すと選べるように見えてしまう。
  // その後は入る物、「品質の最大値を上げる物」「枠が広い物」の順
  out.sort((a, b) =>
    Number(b.current) - Number(a.current)
    || Number(b.fits) - Number(a.fits)
    || b.maxQualityPlus - a.maxQualityPlus
    || (b.prefixes + b.suffixes) - (a.prefixes + a.suffixes)
    || a.lvl - b.lvl);
  return out;
}
