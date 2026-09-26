/** tree-auto.ts から切り出し (2026-09-26): 自動で組む時の入力 (AutoTreeInput) と、抹消のカオスの側・ブリーチを使うかの判定 */
import type { SimState } from "../../services/htc/sim-route";
import type { Side } from "../../services/htc/step-odds";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { BREACH_FAMILY } from "../../services/htc/omens";
import { INFUSER_OVER_QUALITY } from "../../services/htc/quality";

export interface AutoTreeInput {
  data: PatchData;
  prices: Prices;
  targets: readonly TierTarget[];
  /** 固定済みで始める狙い (作らない) */
  fixedIds: readonly string[];
  /** 貼り付けの品質の種類のタグ (「品質 (マナモッド)」→ mana)。無ければ品質の手は入れない */
  qualityTag: string | null;
  /**
   * 貼り付けの品質 (%) とベースの品質の上限 (普通 20、ブリーチの指輪 40)。品質が上限を超えていれば、ブリーチの MOD を
   * 付けて品質を上げ、後で消している (オーナー 2026-09-24:「品質 MOD かまして消してるね」。死体の円環は 40% なのに
   * ブリーチの MOD の行が無い)。その時もブリーチを道具として使う
   */
  qualityPct?: number | null;
  baseQuality?: number;
  /** 触媒の高貴のお告げに使ってよい値段の上限 (神)。これより高いカタリストは使わない */
  catalystMaxDivine?: number;
  /**
   * 側の無いカオスを使ってよいか (触らない MOD が無い = 樹 MOD は固定済みか、そもそも無い)。
   * よければ、一番出にくい普通の狙いを最初にカオスで狙う (手で組んだ死体の円環の見本と同じ。高貴で狙うより桁違いに安い)
   */
  chaosOk?: boolean;
  /** 付きやすさ (その側に 1 回付けて出る確率)。カオスで狙う物を選ぶのに使う */
  chance?: (t: TierTarget) => number | null;
  /**
   * 触らない MOD (固定していない樹 MOD など) がある側。ここは消去を使わず、狙いを冒涜 + 光のお告げのリロールで作る
   * (光は冒涜の外れだけ消す)。オーナー:「片方が 2 以下の場合は冒涜でリロールできる」。2026-09-24 忍者の上位の指輪で、
   * 樹 MOD と同じ側を 高貴 + 側の消去 で作って樹 MOD を 24〜26% 消していた
   */
  protectedSides?: readonly Side[];
  /**
   * 抹消のお告げ付きのカオス (消すのをこの側だけに) を使ってよい側。触らない MOD の側が満杯なら、足される MOD も
   * この側にしか付かないので安全 ([[chaosSideFor]])。金の指輪: サフィが樹 MOD 3 つで満杯 → プレをカオスで回せる
   */
  chaosSide?: Side | null;
  /** 買った時から冒涜の MOD が付いている (冒涜の MOD は 1 つまでなので、冒涜はもう使えない。0.5 のパッチノート) */
  desecratedTaken?: boolean;
  /**
   * 偉大なる高貴のお告げ (1 回で 2 つ足す) を使う場面。"catalyst" = 同じカタリストが効く狙いが 2 つ以上 (オーナー 2026-09-24:
   * 「(触媒の高貴のお告げを) 使う時に付けたいタグが 2 つ以上なら使うべき。耐性 2 つならそれと偉大、右側高貴、パーフェクト高貴で 2 つともカタリストが乗る」)。
   * "all" = カタリストが無くても、同じ側の狙いが 2 つ以上なら (比べる用)
   */
  greater?: "catalyst" | "all" | "none";
  /** ベースの枠の数 (枠 2 つの側の冒涜の回し方に使う) */
  limits?: { prefix: number; suffix: number };
  /** 開始の指輪で固定済みの MOD がある側 (樹 MOD を固定した側を含む) */
  fixedSides?: readonly Side[];
  /** 開始の指輪の側ごとの MOD の数と、そのうち固定していない物の数 (ブリーチの MOD が枠を塞ぐかを見る) */
  startCount?: Record<Side, number>;
  startLoose?: Record<Side, number>;
  /**
   * 開始の指輪の側ごとの触らない MOD (固定していない樹 MOD など、消えない前提の物。狙いの MOD は targets で数えるので入れない) の数。
   * 側のお告げが要るかの見積もりに使う
   */
  startKeep?: Record<Side, number>;
  /** 消去の形。"plain" = お告げ無しの素の消去、"side" = 側の消去のお告げ付き。側ごとに指定もできる。省くと枠と狙いの数で決める */
  annul?: "plain" | "side" | Partial<Record<Side, "plain" | "side">>;
  /** 冒涜の骨。"preserved" = 段を問わない骨だけ (古代の鎖骨は高いので、比べる用)。省くと段 40 以上に届けば古代 */
  bone?: "preserved";
  /**
   * 冒涜の外れの回し方。"overwrite" = その側のエッセンスで上書き (固定 1 + 外れ 1 の枠 2 つの側だけ)、"light" = 光のお告げ + 消去。
   * 省くと上書きできる時は上書き。比べる用 (オーナー 2026-09-25:「安いリロール優先。骨も光を使うなら古代が良かったりする。確率計算で判断して」)
   */
  reroll?: "overwrite" | "light";
  /** カオスで引く狙い (やり直しの費用から決めた指定。null = カオスは使わない、省くと一番出にくい物) */
  chaosPick?: string | null;
  /** 冒涜に回す普通の狙い (同上。null = 普通の狙いは冒涜に回さない) */
  desecratePick?: string | null;
  /** 狙いごとの高貴のオーブ (やり直しの費用から決めた物。無い狙いは段が届く一番強い物) */
  exaltTiers?: Record<string, "exalt_perfect" | "exalt_greater" | "exalt">;
}

/** 抹消のお告げ付きのカオスを使える側: 触らない MOD がある側が全部満杯で、残りが 1 側だけの時 */
export function chaosSideFor(start: SimState, limits: { prefix: number; suffix: number }): Side | null {
  const keepSides = new Set(start.slots.filter((x) => x.keep).map((x) => x.side));
  if (!keepSides.size) return null;
  const count = (sd: Side): number => start.slots.filter((x) => x.side === sd).length;
  const full = [...keepSides].every((sd) => count(sd) >= limits[sd]);
  const rest = (["prefix", "suffix"] as Side[]).filter((sd) => !keepSides.has(sd));
  return full && rest.length === 1 ? rest[0]! : null;
}


/**
 * ブリーチの MOD を道具に使うか (品質 +20% を狙う / 貼り付けの品質から、ブリーチで上げてから消したと読める時)。
 * 自動で組む時とやり直しの費用 ([[redo-cost.ts]]) で同じ物を使う。
 *
 * 2026-09-26 精度上げ: 品質から読むのは、ブリーチのエッセンスが付く指輪・アミュレットだけ。上限を超えていても
 * インフューザーで超えられる幅 (+10%) 以内ならインフューザーの分と区別できないので、ブリーチとは読まない
 */
export function breachPlanned(inp: Pick<AutoTreeInput, "data" | "targets" | "fixedIds" | "qualityPct" | "baseQuality">): boolean {
  const d = inp.data;
  const fixed = new Set(inp.fixedIds);
  const ts = inp.targets.filter((t) => !fixed.has(t.modId) && d.mods.has(t.modId));
  if (ts.some((t) => d.mods.get(t.modId)!.family === BREACH_FAMILY)) return true;
  // クラスは MOD の id の頭 (Rings/..., Amulets/...)
  const jewellery = inp.targets.some((t) => /^(Rings|Amulets)\//.test(t.modId));
  return jewellery && inp.qualityPct != null && inp.qualityPct > (inp.baseQuality ?? 20) + INFUSER_OVER_QUALITY;
}
