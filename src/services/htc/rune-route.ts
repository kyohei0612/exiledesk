/**
 * rune-route.ts — 「クラフトの途中でルーンを差す」道筋を並べる (2026-09-22)
 *
 * オーナー指示:「クラフト途中にルーン嵌めたりする挙動あるじゃん。ルーンとかエッセンス MOD つけて
 * 後から消すと効果だけ付与されて MOD 消えたりするからね。その挙動 HTC 参考に作ってくれ」
 *
 * ## 何が起きているか
 * ルーンは**消費されず装着**されます。装着している間だけ、そのアイテムは
 *   - 追加の枠を持つ (アストリッドの創造性 = クラフト枠 +1 / サールの凱旋 = サフィックス +1)、または
 *   - 通常は出ない MOD を引けるようになる (スラッドの威力の destruction プールなど)
 * そして**外してもアイテムは得た物を保ちます**。だから「差す → その枠で作る → 別のルーンに差し替える」が
 * 成立し、**枠を増やしたうえでソケットは本当に効く物に使える**完成品になります。
 * オーナーの実使用:「アストリッドの創造性は MOD 2 個付けれて、出来上がったら別のルーンはめ込んで消せる」。
 *
 * ## これは実測ではなく裁定です
 * 「外しても残る」を裏づけるデータはゲーム側にありません。オーナーの実使用 (2026-09-22) と、
 * 上流 POE2HTC が利用者から得た同じ報告 (2026-09-15、`docs/copy-audit.md` の 41 行目) の 2 件が
 * 根拠の全部です。**外れていれば、外す道筋は丸ごと外れます。**だから `RuneRoute.caveats` に
 * 必ず入れて、画面でそのまま出してください。黙って期待値に混ぜないこと。
 *
 * ## 上流との分担
 * ルーンの定義 (どれが何をするか / どのベースに載るか) と、効果を織り込んだベースを作る
 * `withRunes` は上流 (`engine/runes.ts`) の物をそのまま使います。ここが足すのは
 * **「差したまま売るのか、外してから売るのか」**という、上流が持っていない軸だけです。
 */
import { RUNES, RUNE_BY_ID, runePriceKey, withRunes, type Rune } from "../../vendor/poe2htc/engine/runes";
import { limitsOf } from "../../vendor/poe2htc/engine/item";
import { LINGERING_CAVEAT } from "./lingering";
import type { ItemBase, ItemLimits } from "../../vendor/poe2htc/engine/types";

/** ルーンの使い方 */
export type RuneUse =
  /** 差さない */
  | "none"
  /** 差したまま完成品にする (ソケットを 1 つ食う。買い手もそのルーンが要る) */
  | "keep"
  /**
   * 作るあいだだけ差して、最後に**別のルーンに差し替える**。
   *
   * オーナーの説明:「アストリッドの創造性は MOD 2 個付けれて、出来上がったら別のルーンはめ込んで消せる」。
   * ソケットが空くのではなく、**そのソケットを本当に効く物に使える**のが旨み。
   */
  | "pull";

/** 何を目当てに差すのか */
export type RuneReason = "none" | "limit" | "pool" | "convert";

export interface RuneRoute {
  /** 解く時に渡すベース。ルーンの効果 (枠の増加 / プールの合流) を織り込んだ物 */
  base: ItemBase;
  /** 差すルーン。差さないなら空 */
  runeIds: readonly string[];
  use: RuneUse;
  reason: RuneReason;
  /** 完成品にこのルーンが残るか。残るならソケットを 1 つ占め続け、買い手の条件にもなる */
  keepsRune: boolean;
  /** このベースでの枠 (ルーンを織り込んだ後) */
  limits: ItemLimits;
  /** 追加でかかる物の値段キー。`keep` でも `pull` でもルーン自体は要る */
  priceKeys: readonly string[];
  /** 画面にそのまま出す断り書き。**省かないこと** */
  caveats: readonly string[];
}

/**
 * 「外しても残る」裁定。根拠が実使用の報告だけなので、乗る道筋には必ず付ける。
 * エッセンスで最大品質を上げてから消すのと同じ話なので、断り書きは [[lingering.ts]] と共通。
 */
const PULL_CAVEAT = `ルーンを外してもアイテムは得た物 (増えた枠 / 引けた MOD) を保つ、という前提です。${LINGERING_CAVEAT}`;

/** ルーンのプールの重みは公開されていない。上流が一律に置いた値を使っている */
const POOL_CAVEAT =
  "ルーンで増える MOD の出やすさは実測ではなく仮の値です。確率と期待費用はその分ぶれます。";

/** 変換ルーンは外した時どうなるか不明なので、差したままの道筋しか出さない */
const CONVERT_CAVEAT =
  "変換ルーンは外した時に戻るかどうかが未確認です。差したまま完成品にする前提で計算しています。";

const reasonOf = (rune: Rune): RuneReason => {
  switch (rune.effect.kind) {
    case "crafted":
    case "suffix":
      return "limit";
    case "pool":
      return "pool";
    default:
      return "convert";
  }
};

/**
 * そのベースに載るルーン。
 *
 * 上流の `runesFor` は `rune.categories` だけを見ます。うちがクライアントから足したクラス
 * (タリスマン等) は上流の表に載っていないので、それだけだとスラッドの威力などが落ちます。
 * **プールがあること自体が「載る」証拠**なので、`pools.rune` の鍵も見ます
 * (生成側が、そのルーンのタグで初めて出る MOD がある時だけ鍵を作っている)。
 * 枠を上げるルーン (categories が空 = 全装備) は元から漏れません。
 */
function runesForBase(base: ItemBase): Rune[] {
  const fromPools = new Set(Object.keys(base.pools.rune ?? {}));
  return RUNES.filter(
    (r) => r.categories.length === 0 || r.categories.includes(base.category) || fromPools.has(r.id),
  );
}

/**
 * そのベースで取れる道筋を並べる。先頭は必ず「差さない」。
 *
 * @param available 手持ち / 買う気のあるルーンの id。省くとそのベースに載る全部を見る
 */
export function runeRoutes(base: ItemBase, available?: readonly string[]): RuneRoute[] {
  const plain: RuneRoute = {
    base,
    runeIds: [],
    use: "none",
    reason: "none",
    keepsRune: false,
    limits: limitsOf(base),
    priceKeys: [],
    caveats: [],
  };
  const out: RuneRoute[] = [plain];

  const fits = runesForBase(base).filter((r) => !available || available.includes(r.id));
  for (const rune of fits) {
    const withIt = withRunes(base, [rune.id]);
    // そのベースに何も足さないルーン (プールが無く枠も上がらない) は道筋にしない
    if (withIt === base) continue;
    const reason = reasonOf(rune);
    const common = {
      base: withIt,
      runeIds: [rune.id] as const,
      limits: limitsOf(withIt),
      priceKeys: [runePriceKey(rune.id)] as const,
    };
    const poolNote = reason === "pool" ? [POOL_CAVEAT] : [];

    if (reason === "convert") {
      // 外した時の挙動が未確認なので、差したままだけ
      out.push({ ...common, use: "keep", reason, keepsRune: true, caveats: [CONVERT_CAVEAT] });
      continue;
    }
    out.push({ ...common, use: "keep", reason, keepsRune: true, caveats: poolNote });
    out.push({ ...common, use: "pull", reason, keepsRune: false, caveats: [...poolNote, PULL_CAVEAT] });
  }
  return out;
}

/**
 * 「差したまま」と「外す」のどちらを勧めるか。
 *
 * **外すほうが常に得**です。完成品の中身は同じで、そのソケットを別のルーン (耐性や攻撃力) に使える分だけ
 * 上になる。ルーン代はどちらでもかかります (装着した時点で払っている)。だから `pull` が出せる時は `pull`。
 * 変換ルーンだけは `pull` が出ないので `keep` になります。
 */
export function preferredRoute(routes: readonly RuneRoute[], runeId: string): RuneRoute | undefined {
  const mine = routes.filter((r) => r.runeIds.includes(runeId));
  return mine.find((r) => r.use === "pull") ?? mine.find((r) => r.use === "keep");
}

/** そのルーンが何をするかの 1 行 (画面用) */
export function runeEffectLabel(runeId: string): string {
  const rune = RUNE_BY_ID.get(runeId);
  if (!rune) return runeId;
  switch (rune.effect.kind) {
    case "crafted":
      return `クラフト枠 +${rune.effect.plus}`;
    case "suffix":
      return `サフィックス枠 +${rune.effect.plus}`;
    case "pool":
      return `${rune.effect.tag} の MOD を引けるようになる`;
    default:
      return `${rune.effect.eats.join(" / ")} の MOD を ${rune.effect.element} に変える`;
  }
}
