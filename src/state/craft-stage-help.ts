/**
 * craft-stage-help.ts — クラフトステージの棚の詳細カードに出す「ステージでの動き」(2026-09-28、ADR-001)
 *
 * オーナー:「ステージでのカレンシー詳細カードは文字だけでいいから、どんな挙動するオーブやお告げなのか細かく書いてくれ。今簡易的だから」。
 * ゲームの公式の説明文 (currency-hover-ja.json、クライアント原本) とは別に、このステージ (= 計算機と同じ規則) で
 * **実際にどう動くか**を書く。規則の本体は services/craft-stage/apply-*.ts。ここを変えたら向こうも見る。
 */
import { jaOfMod } from "../services/htc/mod-text";
import { essenceTarget } from "../services/craft-stage/apply-essence";
import { essenceLevelOf } from "../vendor/poe2htc/optimizer/cost";
import { enchantPool } from "../services/craft-stage/apply-vaal";
import { socketCountFor } from "../services/htc/sockets";
import { maxQualityForBase } from "../services/htc/catalysing-setup";
import { desecrationBoneFor } from "../vendor/poe2htc/engine/probability";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";

const FLOOR = (kind: "transmute" | "regal", s: string): string => {
  const f = kind === "transmute" ? { greater: 55, perfect: 70 } : { greater: 35, perfect: 50 };
  return s === "greater" ? `上級: 付く MOD は MOD レベル ${f.greater} 以上の段だけ` : s === "perfect" ? `完全: 付く MOD は MOD レベル ${f.perfect} 以上の段だけ` : "";
};
const strengthOf = (key: string): string => (key.endsWith("_greater") ? "greater" : key.endsWith("_perfect") ? "perfect" : "base");
const ADD = "付く MOD は、その側の普通の MOD の置き場から、付いている系統を除き、アイテムレベル以下の段の重みで引く (計算機と同じ)";

/** お告げの動き */
const OMEN: Record<string, string[]> = {
  OmenofSinistralExaltation: ["次の高貴なオーブは **プレフィックスだけ** に足す", "プレフィックスが埋まっていると打てない"],
  OmenofDextralExaltation: ["次の高貴なオーブは **サフィックスだけ** に足す", "サフィックスが埋まっていると打てない"],
  OmenofGreaterExaltation: ["次の高貴なオーブは MOD を **2 つ** 足す (空きが 1 つなら 1 つ)", "左右の高貴のお告げと重ねられる"],
  OmenofCatalysingExaltation: ["次の高貴なオーブは、品質 (カタリスト) の種類に合う MOD を **重く** 引く (品質が高いほど重い)", "打つと品質を全部使い切って 0 に戻る", "品質が無いと打てない (指輪・アミュレットだけ)"],
  OmenofSinistralCoronation: ["次の王者のオーブは **プレフィックスだけ** に足す"],
  OmenofDextralCoronation: ["次の王者のオーブは **サフィックスだけ** に足す"],
  OmenofSinistralAlchemy: ["次の錬金術のオーブは **プレフィックスを上限まで** (3 つ) 付け、残りをサフィックスに"],
  OmenofDextralAlchemy: ["次の錬金術のオーブは **サフィックスを上限まで** (3 つ) 付け、残りをプレフィックスに"],
  OmenofWhittling: ["次のカオスオーブは、**MOD レベルが一番低い** MOD を消す (同じなら等しく)", "足す方はいつもどおり"],
  OmenofSinistralErasure: ["次のカオスオーブは **プレフィックスから** 消す", "足す側は選べない (空いている側の重みで決まる)"],
  OmenofDextralErasure: ["次のカオスオーブは **サフィックスから** 消す", "足す側は選べない"],
  OmenofSinistralAnnulment: ["次の消去のオーブは **プレフィックスから** 消す"],
  OmenofDextralAnnulment: ["次の消去のオーブは **サフィックスから** 消す"],
  OmenofGreaterAnnulment: ["次の消去のオーブは MOD を **2 つ** 消す", "左右の消去のお告げと重ねられる"],
  OmenofLight: ["次の消去のオーブは **冒涜の MOD だけ** を消す (未開示でも)", "冒涜の MOD が無いと打てない"],
  OmenofSinistralCrystallisation: ["次のパーフェクトエッセンスは **プレフィックスから** 消してから付ける", "足す側が埋まっていて、お告げが反対側を指すと打てない"],
  OmenofDextralCrystallisation: ["次のパーフェクトエッセンスは **サフィックスから** 消してから付ける"],
  OmenofSinistralNecromancy: ["次の骨 (冒涜) は未開示の MOD を **プレフィックス** に付ける"],
  OmenofDextralNecromancy: ["次の骨 (冒涜) は未開示の MOD を **サフィックス** に付ける"],
  OmenoftheSovereign: ["次の骨の開示の候補を **ウラマンの MOD だけ** にする (MOD ごとに等しく)", "武器とアクセサリーだけ (防具には使えない)"],
  OmenoftheLiege: ["次の骨の開示の候補を **アマナムの MOD だけ** にする", "武器とアクセサリーだけ"],
  OmenoftheBlackblooded: ["次の骨の開示の候補を **クルガルの MOD だけ** にする", "武器とアクセサリーだけ"],
  OmenofPutrefaction: ["次の骨は **破砕以外の MOD を全部外し**、枠いっぱい (普通 6 つ) を未開示の MOD にして **コラプト** する", "開示で出るのは普通の MOD だけ (冒涜専用の勢力の MOD は出ない)", "古びた骨でも段の下限は掛からない"],
  OmenofAbyssalEchoes: ["次の開示で、候補 3 つを **1 回だけ引き直せる**", "引き直さなくても、その開示で使い切る"],
  OmenofCorruption: ["次のヴァールオーブの「変化なし」を外す (残り 3 つから等しく)", "アクセサリーの 4 つ目 (ソケットの代わりの変化なし) は外れない", "0.5.0 で入手できなくなった"],
  OmenofSanctification: ["次の神のオーブをレアに使うと **聖別** する: MOD ごとに 0.78〜1.22 倍 (0.01 刻み) を掛けて丸める", "聖別したアイテムは、以後手を加えられない"],
};

/** 棚の 1 つの「ステージでの動き」(行の並び)。** で囲んだ所は強調 */
export function stageHelp(key: string, data: PatchData | null, item: StageItem | null): string[] {
  if (OMEN[key]) return [...OMEN[key]!, "押すと掛けておく (何枚でも)。次に打つ、関係する手でだけ使われる"];
  const s = strengthOf(key);
  const kind = key.replace(/_(greater|perfect)$/, "");
  switch (kind) {
    case "transmute":
      return ["**ノーマル → マジック** にして MOD を 1 つ付ける", ADD, FLOOR("transmute", s)].filter(Boolean);
    case "augment":
      return ["**マジック** で MOD が 1 つの時、空いている側に 1 つ足す (マジックはプレ 1 / サフィ 1 まで)", ADD, FLOOR("transmute", s)].filter(Boolean);
    case "regal":
      return ["**マジック → レア** にして MOD を 1 つ足す (付いている MOD は残る)", ADD, FLOOR("regal", s), "お告げ: 左右の王者 (足す側)"].filter(Boolean);
    case "alchemy":
      return ["**ノーマル → レア** にして MOD を **4 つ** 付ける", ADD, "お告げ: 左右の錬金術 (その側を上限まで)"];
    case "exalt":
      return ["**レア** に MOD を 1 つ足す (プレ・サフィ合わせて空きがある時)", ADD, FLOOR("regal", s), "お告げ: 左右の高貴 (足す側) / 偉大なる高貴 (2 つ) / 触媒の高貴 (品質の種類を重く)"].filter(Boolean);
    case "chaos":
      return [
        "**レア** の MOD を 1 つ消して、1 つ足す",
        "消すのは破砕 (固定) 以外から等しく 1 つ",
        ADD,
        s === "greater" ? "上級: 足す MOD は MOD レベル 35 以上の段だけ" : s === "perfect" ? "完全: 足す MOD は MOD レベル 50 以上の段だけ" : "",
        "お告げ: 削減 (一番低い MOD を消す) / 左右の抹消 (消す側)",
      ].filter(Boolean);
    case "annul":
      return ["**マジックかレア** の MOD を 1 つ消す (破砕以外から等しく)", "お告げ: 左右の消去 (消す側) / 偉大なる消去 (2 つ) / 光 (冒涜の MOD だけ)"];
    case "divine":
      return ["破砕以外の MOD の **数値だけ** を、その段の範囲の中で振り直す (段は変わらない)", "お告げ: 聖別 (0.78〜1.22 倍にして聖別。以後手を加えられない)"];
    case "fracture":
      return ["**レア** で MOD が **4 つ以上**、まだ破砕が無い時", "MOD を 1 つ **固定 (破砕)** する。どれになるかは等しく (未開示の冒涜 MOD は選ばれない)", "破砕した MOD は、カオス・消去・エッセンスでも消えない"];
    case "artificer": {
      const n = item ? socketCountFor(item.cls.category) : 2;
      return ["武器・防具に **ソケットを 1 つ** 足す", n ? `このベースは ${n} つまで` : "このベース (アクセサリー・矢筒) には付けられない"];
    }
    case "vaal": {
      const pool = item ? enchantPool(item).length : 0;
      return [
        "アイテムを **コラプト** する。以後手を加えられない (開示だけはできる)",
        "結果は次の 4 つから等しく 1 つ (公開の実測が無いので等分と仮定):",
        "① 変化なし",
        "② MOD を 1〜3 つ、別の新しい MOD に振り直す (破砕は残る)",
        `③ ヴァールのエンチャントを 1 つ付ける${pool ? ` (このベースに付くのは ${pool} 種類から等しく)` : ""}`,
        "④ 武器・防具はソケット +1 (上限を無視)、アクセサリーは変化なし",
        "お告げ: コラプト (① を外す)",
      ];
    }
    case "desecrate":
    case "desecrate_ancient":
    case "desecrate_altered": {
      const bone = item ? { jawbone: "顎の骨 (武器・矢筒)", rib: "肋骨 (防具)", collarbone: "鎖骨 (アクセサリー)" }[desecrationBoneFor(item.cls.category)] : "";
      return [
        "**レア** に **未開示の冒涜 MOD** を 1 つ付ける (冒涜の MOD はアイテムに 1 つまで)",
        "付く側は、その側で出うる MOD の重みの合計で決まる。両側が埋まっていれば、その側の MOD を 1 つ差し替える",
        "開示で **候補 3 つから 1 つ選ぶ**。候補は普通の MOD + 冒涜の MOD から、系統の被りを除いて重みで重複なしに 3 つ",
        key === "desecrate_ancient" ? "古びた骨: 候補は MOD レベル 40 以上の段だけ" : "",
        key === "desecrate_altered" ? "変質した鎖骨: 候補に **異界の MOD** も入る (アクセサリーだけ)" : "",
        bone ? `このベースで使う骨: ${bone}` : "",
        "お告げ: 左右のネクロマンシー (側) / 支配者・君主・ブラックブラッド (勢力で絞る) / 腐食 (全部を未開示にしてコラプト) / アビスの反響 (開示の引き直し)",
      ].filter(Boolean);
    }
  }
  if (key.startsWith("catalyst_")) {
    const max = item ? maxQualityForBase(item.base) : 20;
    return [
      "**指輪・アミュレット** に品質を +1.5% (計算機と同じ)。上限はこのベースで " + `${max}%`,
      "品質の種類はカタリストで決まる。**別の種類を使うと品質は 0 からやり直し**",
      "触媒の高貴のお告げと組むと、その種類の MOD が付きやすくなる (品質は使い切る)",
    ];
  }
  if (key.startsWith("essence:") && data && item) {
    const t = essenceTarget(data, item, key);
    if (!t) return ["このベースには使えないエッセンス"];
    const tier = t.level === "perfect" ? t.mod.tiers[0] : t.mod.tiers.find((x) => essenceLevelOf(String(x.name ?? "")) === t.level) ?? t.mod.tiers[0];
    const text = fillRanges(jaOfMod(t.mod), (tier?.ranges ?? []) as number[][]);
    const side = t.side === "prefix" ? "プレフィックス" : "サフィックス";
    if (t.level === "perfect") {
      return [
        "**レア** の MOD を 1 つ消してから、この MOD を付ける",
        `付く MOD (${side}): ${text}`,
        "消すのは破砕以外から等しく 1 つ。付ける側が埋まっていれば、その側から消す",
        "エッセンスの MOD はアイテムに 1 つまで。同じ系統が付いていると打てない",
        `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
        "お告げ: 左右の結晶化 (消す側)",
      ];
    }
    return [
      "**マジック → レア** にして、この MOD を付ける (付いている MOD は残る)",
      `付く MOD (${side}): ${text}`,
      "エッセンスの MOD はアイテムに 1 つまで。同じ系統が付いていると打てない",
      `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
      "レアに使うにはパーフェクトエッセンス",
    ];
  }
  return [];
}

/** 文面の # を段の範囲 (a-b) にする */
function fillRanges(text: string, ranges: number[][]): string {
  let i = 0;
  return text.replace(/#/g, () => {
    const r = ranges[i++];
    if (!r) return "#";
    return r[0] === r[1] ? String(r[0]) : `(${r[0]}-${r[1]})`;
  });
}
