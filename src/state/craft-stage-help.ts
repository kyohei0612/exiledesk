/**
 * craft-stage-help.ts — クラフトステージの棚の詳細カードに出す「ステージでの動き」(2026-09-28、ADR-001)
 *
 * オーナー:「ステージでのカレンシー詳細カードは文字だけでいいから、どんな挙動するオーブやお告げなのか細かく書いてくれ。今簡易的だから」。
 * ゲームの公式の説明文 (currency-hover-ja.json、クライアント原本) とは別に、このステージ (= 計算機と同じ規則) で
 * **実際にどう動くか**を書く。規則の本体は services/craft-stage/apply-*.ts。ここを変えたら向こうも見る。
 */
import { ARCHITECT_DESTROY_P, INFUSER_CORRUPT_P } from "../services/craft-stage/apply-extra";
import { GNAWED_MAX_ILVL } from "../services/craft-stage/apply-currency";
import { fillHashes, jaOfMod } from "../services/htc/mod-text";
import { tierDisplayRanges } from "../services/mods/stat-scale";
import { essenceTarget } from "../services/craft-stage/apply-essence";
import { essenceLevelOf } from "../vendor/poe2htc/optimizer/cost";
import { enchantPool } from "../services/craft-stage/apply-vaal";
import { isRune, runeEffectFor, runeNameOf, runeOf, socketCapOf } from "../services/craft-stage/stage-runes";
import { ruleLines } from "../services/augment-rules";
import { maxQualityOf } from "../services/craft-stage/stage-core";
import { desecrationBoneFor } from "../vendor/poe2htc/engine/probability";
import { CHANCE_UNIQUE_P, isShard, JEWELLER_TO, QUALITY_MAX, QUALITY_STEP, QUALITY_TARGET, SHARD_TO_ORB, SHARDS_PER_ORB } from "../services/craft-stage/apply-act";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import { CATALYSTS as HTC_CATALYSTS } from "../services/htc/quality";
import { enOf } from "./craft-stage-shelf";
import type { StageItem } from "../services/craft-stage/types";

const FLOOR = (kind: "transmute" | "regal", s: string): string => {
  const f = kind === "transmute" ? { greater: 55, perfect: 70 } : { greater: 35, perfect: 50 };
  return s === "greater" ? `上級: 付く MOD は MOD レベル ${f.greater} 以上のティアだけ` : s === "perfect" ? `完全: 付く MOD は MOD レベル ${f.perfect} 以上のティアだけ` : "";
};
const strengthOf = (key: string): string => (key.endsWith("_greater") ? "greater" : key.endsWith("_perfect") ? "perfect" : "base");
const ADD = "付く MOD は、その側の普通の MOD の置き場から、付いている系統を除き、アイテムレベル以下のティアの重みで引く (計算機と同じ)";

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
  OmenofLight: ["次の消去のオーブは **冒涜の MOD だけ** を消す (未発現でも)", "冒涜の MOD が無いと打てない"],
  OmenofSinistralCrystallisation: ["次のパーフェクトエッセンスは **プレフィックスから** 消してから付ける", "足す側が埋まっていて、お告げが反対側を指すと打てない"],
  OmenofDextralCrystallisation: ["次のパーフェクトエッセンスは **サフィックスから** 消してから付ける"],
  OmenofSinistralNecromancy: ["次の骨 (冒涜) は未発現の MOD を **プレフィックス** に付ける"],
  OmenofDextralNecromancy: ["次の骨 (冒涜) は未発現の MOD を **サフィックス** に付ける"],
  OmenoftheSovereign: ["次の骨の発現の候補を **ウラマンの MOD だけ** にする (MOD ごとに等しく)", "武器とアクセサリーだけ (防具には使えない)"],
  OmenoftheLiege: ["次の骨の発現の候補を **アマナムの MOD だけ** にする", "武器とアクセサリーだけ"],
  OmenoftheBlackblooded: ["次の骨の発現の候補を **クルガルの MOD だけ** にする", "武器とアクセサリーだけ"],
  OmenofPutrefaction: ["次の骨は **フラクチャー以外の MOD を全部外し**、枠いっぱい (普通 6 つ) を未発現の MOD にして **コラプト** する", "発現で出るのは普通の MOD だけ (冒涜専用の勢力の MOD は出ない)", "古びた骨でもティアの下限は掛からない"],
  OmenofAbyssalEchoes: ["次の発現で、候補 3 つを **1 回だけ引き直せる**", "引き直さなくても、その発現で使い切る"],
  OmenofCorruption: ["次のヴァールオーブの「変化なし」を外す (残り 3 つから等しく)", "アクセサリーの 4 つ目 (ソケットの代わりの変化なし) は外れない", "0.5.0 で入手できなくなった"],
  OmenofSanctification: ["次の神のオーブをレアに使うと **聖別** する: MOD ごとに 0.78〜1.22 倍 (0.01 刻み) を掛けて丸める", "聖別したアイテムは、以後手を加えられない"],
};

/** 棚の 1 つの「ステージでの動き」(行の並び)。** で囲んだ所は強調 */
/** apply-extra.ts の物の説明 (クライアントの説明文 + 仮の値) */
const INFUSER_LINE = (ja: string) => [
  `**${ja}** の品質を上げる。上限を **最大 10% 超えられる** が、超えた時に一定確率で **コラプト** する (クライアントの説明文)`,
  `1 回で上がる量は砥石などと同じ (**未確定**)。コラプトする確率は公開されていない (**未確定**、仮に ${Math.round(INFUSER_CORRUPT_P * 100)}%。手順の outcome "corrupted" / "safe" で指定できる)`,
];
const SACRIFICE_LINE = (ja: string) => [
  `**コラプトしたレア** の ${ja} の **コラプトエンチャントを上位版に上げ**、ランダムな MOD を **1 つ消す** (クライアントの説明文)`,
  "上位版はクライアントの MOD 表の「CorruptionUpgrade…」(元のエンチャントと同じ系統)。エンチャントが無いと使えない",
];
const EXTRA_HELP: Record<string, string[]> = {
  vaal_infuser_jewellery: INFUSER_LINE("指輪・アミュレット"),
  vaal_infuser_armour: INFUSER_LINE("防具"),
  vaal_infuser_martial: INFUSER_LINE("マーシャル武器"),
  vaal_infuser_caster: INFUSER_LINE("ワンド・スタッフ・セプター"),
  sacrifice_jewellery: SACRIFICE_LINE("アミュレット・指輪・ベルト"),
  sacrifice_armour: SACRIFICE_LINE("防具"),
  sacrifice_weapon: SACRIFICE_LINE("武器・矢筒"),
  architect: [
    "**コラプトした装備** を予測できない形で **変えるか、壊す** (クライアントの説明文)",
    `壊れる確率も「変わる」中身も公開されていない (**未確定**、仮に 壊れる ${Math.round(ARCHITECT_DESTROY_P * 100)}% / 変わる = コラプトエンチャントが別の物に)。手順の outcome "destroyed" / "changed" で指定できる`,
  ],
  cultivation: [
    "**コラプトしたユニーク** を、**同じ種類の別のユニーク** に変える (クライアントの説明文)",
    "ヴァールユニークは「MOD を最大 2 つ置き換える」だが、ユニークの MOD の表が無いのでこのステージでは扱わない",
  ],
  siphoner: ["**コラプトしたレアの宝飾品** にキル閾値を付ける。閾値に届くとランダムな MOD を吸って、他の MOD の数値が上がる (クライアントの説明文)", "閾値の数や上がり幅は公開されていないので、このステージでは付いたことだけ出す"],
  mirror: ["アイテムの **ミラー化した写し** を作る (クライアントの説明文)", "ミラーしたアイテムにはもう何も使えない"],
  hinekora: ["次に使うカレンシーの **結果を予見** できるようにする (クライアントの説明文)", "アイテムを何かで変えると予見は消える"],
  extraction: ["装備を **壊して**、差してある (ソケットバウンドでない) オーグメントを取り戻す (クライアントの説明文)"],
  flux_fire: ["アイテム上の全ての **冷気・雷耐性** の MOD を同じ強さの **火耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
  flux_cold: ["アイテム上の全ての **火・雷耐性** の MOD を同じ強さの **冷気耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
  flux_lightning: ["アイテム上の全ての **火・冷気耐性** の MOD を同じ強さの **雷耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
  flux_chaos: ["アイテム上の全ての **火・冷気・雷耐性** の MOD を同じ強さの **混沌耐性** に変える (クライアントの説明文)", "対応のさせ方は公開されていないので、同じ段の順位・段の中の同じ位置で置き換える (仮定)"],
};

export function stageHelp(key: string, data: PatchData | null, item: StageItem | null): string[] {
  const sp = specialEssence(key, item);
  return [...(sp?.notes ?? []), ...stageHelpBase(key, data, item)];
}

function stageHelpBase(key: string, data: PatchData | null, item: StageItem | null): string[] {
  if (OMEN[key]) return [...OMEN[key]!, "押すと掛けておく (何枚でも)。次に打つ、関係する手でだけ使われる"];
  const s = strengthOf(key);
  const kind = key.replace(/_(greater|perfect)$/, "");
  switch (kind) {
    case "transmute":
      return ["**ノーマル → マジック** にして MOD を 1 つ付ける", ADD, FLOOR("transmute", s)].filter(Boolean);
    case "augment":
      return ["**マジック** で MOD が 1 つの時、空いている側に 1 つ足す (マジックはプレ 1 / サフィ 1 まで)", ADD, FLOOR("transmute", s)].filter(Boolean);
    case "regal":
      return ["**マジック → レア** にして MOD を 1 つ足す (付いている MOD は残る)", ADD, FLOOR("regal", s)].filter(Boolean);
    case "alchemy":
      return ["**ノーマル → レア** にして MOD を **4 つ** 付ける", ADD];
    case "exalt":
      return ["**レア** に MOD を 1 つ足す (プレ・サフィ合わせて空きがある時)", ADD, FLOOR("regal", s), "お告げ: 左右の高貴 (足す側) / 偉大なる高貴 (2 つ) / 触媒の高貴 (品質の種類を重く)"].filter(Boolean);
    case "chaos":
      return [
        "**レア** の MOD を 1 つ消して、1 つ足す",
        "消すのはフラクチャー (固定) 以外から等しく 1 つ",
        ADD,
        s === "greater" ? "上級: 足す MOD は MOD レベル 35 以上のティアだけ" : s === "perfect" ? "完全: 足す MOD は MOD レベル 50 以上のティアだけ" : "",
        "お告げ: 削減 (一番低い MOD を消す) / 左右の抹消 (消す側)",
      ].filter(Boolean);
    case "annul":
      return ["**マジックかレア** の MOD を 1 つ消す (フラクチャー以外から等しく)", "お告げ: 左右の消去 (消す側) / 光 (冒涜の MOD だけ)"];
    case "divine":
      return ["フラクチャー以外の MOD の **数値だけ** を、そのティアの範囲の中で振り直す (ティアは変わらない)", "お告げ: 聖別 (0.78〜1.22 倍にして聖別。以後手を加えられない)"];
    case "fracture":
      return ["**レア** で MOD が **4 つ以上**、まだフラクチャーが無い時", "MOD を 1 つ **固定 (フラクチャー)** する。どれになるかは等しく (未発現の冒涜 MOD は選ばれない)", "フラクチャーした MOD は、カオス・消去・エッセンスでも消えない"];
    case "artificer": {
      const n = item ? socketCapOf(item.base, item.cls.category) : 1;
      return ["マーシャル武器・ワンド・スタッフ・防具に **ソケットを 1 つ** 足す", n ? `このベースは ${n} つまで (胴・両手武器 2 / ほか 1。コラプトで +1)` : "このベース (アクセサリー・矢筒・フラスコ) には付けられない"];
    }
    case "vaal": {
      const pool = item ? enchantPool(item).length : 0;
      return [
        "アイテムを **コラプト** する。以後手を加えられない (発現だけはできる)",
        "結果は次の 4 つから等しく 1 つ (公開の実測が無いので等分と仮定):",
        "① 変化なし",
        "② MOD を 1〜3 つ、別の新しい MOD に振り直す (フラクチャーは残る)",
        `③ ヴァールのエンチャントを 1 つ付ける${pool ? ` (このベースに付くのは ${pool} 種類から等しく)` : ""}`,
        "④ 武器・防具はソケット +1 (熟練工の上限を 1 つ超えられる)、アクセサリーは変化なし",
      ];
    }
    case "desecrate":
    case "desecrate_ancient":
    case "desecrate_altered":
    case "desecrate_gnawed": {
      const bone = item ? { jawbone: "顎の骨 (武器・矢筒)", rib: "肋骨 (防具)", collarbone: "鎖骨 (アクセサリー)" }[desecrationBoneFor(item.cls.category)] : "";
      return [
        "**レア** に **未発現の冒涜 MOD** を 1 つ付ける (冒涜の MOD はアイテムに 1 つまで)",
        "付く側は、その側で出うる MOD の重みの合計で決まる。両側が埋まっていれば、その側の MOD を 1 つ差し替える",
        "発現で **候補 3 つから 1 つ選ぶ**。候補は普通の MOD + 冒涜の MOD から、系統の被りを除いて重みで重複なしに 3 つ",
        key === "desecrate_ancient" ? "古びた骨: 候補は MOD レベル 40 以上のティアだけ" : "",
        key === "desecrate_gnawed" ? `噛み切られた骨: **アイテムレベル ${GNAWED_MAX_ILVL} 以下** にだけ使える (クライアントの表)。候補は保存された骨と同じ` : "",
        key === "desecrate_altered" ? "変質した鎖骨: 候補に **異界の MOD** も入る (アクセサリーだけ)" : "",
        bone ? `このベースで使う骨: ${bone}` : "",
        "お告げ: 左右のネクロマンシー (側) / 支配者・君主・ブラックブラッド (勢力で絞る) / 腐食 (全部を未発現にしてコラプト) / アビスの反響 (発現の引き直し)",
      ].filter(Boolean);
    }
  }
  // アクト中に落ちる物 (2026-09-28、要望 ⑧。出典は apply-act.ts)
  if (key in QUALITY_TARGET) {
    const t = QUALITY_TARGET[key]!;
    const st = QUALITY_STEP;
    return [
      `**${t.ja}** の品質を上げる (上限 ${QUALITY_MAX}%)${key === "etcher" ? "。ワンド・スタッフ・セプター用 (砥石はマーシャル武器用)" : ""}${key === "whetstone" ? "。マーシャル武器 = 弓・クロスボウ・メイス・クォータースタッフ・槍・タリスマン (ワンド・セプター・スタッフは不可)" : ""}`,
      key === "gemcutter" ? `1 回で +${st.gem}% (**未確定**: 1% と 5% の記述が食い違う)` : `1 回で ノーマル +${st.normal}% / マジック +${st.magic}% / レア・ユニーク +${st.rare}% (**未確定**: 攻略サイトの記述のみ)`,
      key === "whetstone" ? "品質 1% ごとに物理ダメージが 1% 増える (poe2db の Quality)" : key === "scrap" ? "品質 1% ごとにアーマー・回避力・エナジーシールドが 1% 増える" : key === "bauble" ? "品質 1% ごとにライフ・マナの回復量が 1% 増える" : "品質の効果はジェムごとに違う",
    ];
  }
  // 2026-09-29 に足した物 (apply-extra.ts)。確率は公開されていないので仮
  const extra = EXTRA_HELP[key];
  if (extra) return extra;
  if (key === "wisdom") return ["**未鑑定** のアイテムを鑑定する (隠れていた MOD が見える)", "未鑑定のアイテムには、ほかのカレンシーは打てない"];
  if (key === "chance") {
    return [
      "**ノーマル** のアイテムを **ユニーク** にするか、**壊す** (クライアントの説明文)",
      `ユニークになる確率は公開されていない (**未確定**、仮に ${Math.round(CHANCE_UNIQUE_P * 100)}%。手順の outcome で結果を指定できる)`,
      "なるユニークはそのベースのユニークから等しく 1 つ (重みは公開値なし)",
    ];
  }
  if (JEWELLER_TO[key]) {
    const n = JEWELLER_TO[key];
    return [`**スキルジェム** のサポート枠を **${n} つ** にする (1 つずつではなく一気に)`, `サポート枠が ${n} つ未満のジェムにだけ使える`, "装備には使えない"];
  }
  // ルーン・ソウルコア等 (2026-10-03): 決まり (部位・外せるか・置き換えられるか・数) は説明文から作った表 (augment-rules.ts) のまま
  if (isRune(key)) {
    const eff = item ? runeEffectFor(runeOf(key)!, item.cls.category) : null;
    return [
      ...(eff ? [] : item ? ["この部位には効き目が無い"] : []),
      ...ruleLines(runeNameOf(key)),
      "空きソケットが無い時は、はまっている物と置き換える (ソケットの絵を押すとそのソケット、アイテムを押すと左から最初の置き換えられる物)",
    ];
  }
  if (isShard(key)) return [`**${SHARDS_PER_ORB} 個** 集めると ${SHARD_TO_ORB[key] === "transmute" ? "変成" : SHARD_TO_ORB[key] === "regal" ? "王者" : SHARD_TO_ORB[key] === "artificer" ? "熟練工" : "可能性"}のオーブ 1 個になる (クライアントの説明文)`, "アイテムには使えない", "動画の手順では 1 手 = 1 個拾う"];
  if (key.startsWith("catalyst_")) {
    const max = item ? maxQualityOf(item) : 20;
    return [
      // 上限はベースの最大品質 + MOD の「品質の最大値 +N%」(ブリーチのエッセンス) なので「このベースで」ではなく「今のアイテムで」
      `**指輪・アミュレット** の品質を **1 回で上限 (今のアイテムで ${max}%) まで** 上げる。使う数は 1 個 +1% で数える (計算機と同じ。ゲームは 1 個で 1〜2%、ほとんど 1%)`,
      "品質の種類はカタリストで決まる。**別の種類を使うと品質は 0 からやり直し**",
      "触媒の高貴のお告げと組むと、その種類の MOD が付きやすくなる (品質は使い切る)",
    ];
  }
  if (key.startsWith("essence:") && data && item) {
    const t = essenceTarget(data, item, key);
    if (!t) return ["このベースには使えないエッセンス"];
    const tier = t.level === "perfect" ? t.mod.tiers[0] : t.mod.tiers.find((x) => essenceLevelOf(String(x.name ?? "")) === t.level) ?? t.mod.tiers[0];
    // 深淵のエッセンス (2026-10-03)
    if (t.mod.family === "EssenceAbyss") {
      return [
        "**レア** の MOD を 1 つ消して、消した側に **深淵の王の印** を付ける",
        "次の骨 (冒涜) は必ず **印を置き換えて** 未発現の冒涜 MOD になる。段の下限 MOD レベル 33 (仮: 説明文は「より高い段」だけ)",
        "冒涜の MOD がある間は打てない (先にエッセンス・合金で上書き)。印もクラフト MOD (アストリッドの創造性で 2 つまで持てる)",
        "お告げ: 左右の結晶化 (消す側 = 印の付く側)",
      ];
    }
    if (t.level === "perfect") {
      return [
        "**レア** の MOD を 1 つ消してから、この MOD を付ける",
        "消すのはフラクチャー以外から等しく 1 つ。付ける側が埋まっていれば、その側から消す",
        "エッセンスの MOD はアイテムに 1 つまで (アストリッドの創造性で 2 つ)。同じ系統が付いていると打てない",
        `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
        "お告げ: 左右の結晶化 (消す側)",
      ];
    }
    return [
      "**マジック → レア** にして、この MOD を付ける (付いている MOD は残る)",
      "エッセンスの MOD はアイテムに 1 つまで。同じ系統が付いていると打てない",
      `必要なアイテムレベル: ${tier?.ilvl ?? "?"}`,
      "レアに使うにはパーフェクトエッセンス",
    ];
  }
  return [];
}

/**
 * 付く MOD だけ (カードの上に色を変えて箇条書き、2026-10-05 オーナー「エッセンスは特に説明欄が見づらいから、ルーンとか特定の MOD が付く奴は
 * 分かりやすい色にそこだけ変えよう」「付く MOD だけ箇条書きで書いてあげたい」)。今のアイテムの部位での物。無い物は空
 */
/**
 * エッセンスの値が普通の MOD (同じ系統・同じ側) のどのティアに当たるか (2026-10-05 オーナー「エッセンスはティアも一応欲しいな、
 * ここからここまでのティアみたいな、もしティア間で被るなら」)。1 つ目の値の範囲が重なるティアを全部。T1 が一番上
 */
function essenceTierSpan(data: PatchData, item: StageItem, mod: { family: string; type: string }, range: readonly number[] | undefined): string | null {
  if (!range || range.length < 2) return null;
  const lo = Math.min(range[0]!, range[1]!), hi = Math.max(range[0]!, range[1]!);
  const pool = item.cls.pools.normal;
  const ids = mod.type === "prefix" ? pool.prefixes : pool.suffixes;
  for (const id of ids) {
    const m = data.mods.get(id);
    if (!m || m.family !== mod.family || !m.tiers.length) continue;
    const n = m.tiers.length;
    const hit: number[] = [];
    m.tiers.forEach((t, i) => {
      const r = t.ranges[0];
      if (!r || r.length < 2) return;
      const a = Math.min(r[0]!, r[1]!), b = Math.max(r[0]!, r[1]!);
      if (a <= hi && lo <= b) hit.push(n - i);
    });
    if (!hit.length) {
      const top = m.tiers[n - 1]!.ranges[0];
      return top && lo > Math.max(top[0]!, top[1]!) ? `普通の MOD の T1 (全 ${n} 段) より上` : null;
    }
    const best = Math.min(...hit), worst = Math.max(...hit);
    return `普通の MOD の ${best === worst ? `T${best}` : `T${worst}〜T${best}`} 相当 (全 ${n} 段)`;
  }
  return null;
}

export function stageAdds(key: string, data: PatchData | null, item: StageItem | null): { head: string; lines: string[]; tier?: string | null } | null {
  if (!item) return null;
  if (isRune(key)) {
    const eff = runeEffectFor(runeOf(key)!, item.cls.category);
    return eff ? { head: `付く MOD (${eff.catJa})`, lines: eff.ja.split("\n").map((x) => x.trim()).filter(Boolean) } : null;
  }
  if (key.startsWith("essence:") && data) {
    const t = essenceTarget(data, item, key);
    if (!t || t.mod.family === "EssenceAbyss") return null;
    const tier = t.level === "perfect" ? t.mod.tiers[0] : t.mod.tiers.find((x) => essenceLevelOf(String(x.name ?? "")) === t.level) ?? t.mod.tiers[0];
    let text = fillHashes(jaOfMod(t.mod), tier ? tierDisplayRanges(tier) : []);
    // 値の幅が無い固定の MOD (ブリーチの「+20% to Maximum Quality」等) は # が残るので、英語の文の数字で埋める
    if (text.includes("#")) {
      const nums = [...(t.mod.text ?? "").matchAll(/\d+(?:\.\d+)?/g)].map((x) => x[0]);
      text = text.replace(/#/g, () => nums.shift() ?? "#");
    }
    return { head: `付く MOD (${t.side === "prefix" ? "プレフィックス" : "サフィックス"})`, lines: text.split("\n").filter(Boolean), tier: tier ? essenceTierSpan(data, item, t.mod, tier.ranges[0]) : null };
  }
  return null;
}

/**
 * MOD の文を棚のボタン用に短く (数値・「増加する」等を外す)。「マナ自動回復レートが#%増加する」→「マナ自動回復」、「火耐性 #%」→「火耐性」、
 * 「#から#の火ダメージを追加する」→「追加火ダメージ」。2026-10-05 オーナー「金額の所、エッセンスは代わりに付く MOD を箇条書きで。マナ自動回復ならマナ自動とかで」
 */
export function shortMod(text: string): string {
  return text.split(/\s*\/\s*|\n/).map((raw) => {
    let s = raw.replace(/\([^)]*\)/g, "#").replace(/\d+(\.\d+)?/g, "#").trim();
    let m: RegExpExecArray | null;
    if ((m = /^#から#の(.+)を追加する$/.exec(s))) return `追加${m[1]}`;
    if ((m = /^(.*?)ダメージの#%を追加(.+)として獲得する$/.exec(s))) return `${m[1] ? `${m[1].replace(/の$/, "")}の` : ""}${m[2]}獲得`;
    if ((m = /^受けた(.*)ダメージの#%をライフとして回収する$/.exec(s))) return `${m[1] || ""}被ダメ回収`;
    if ((m = /^#から#の(.+)$/.exec(s))) return m[1]!;
    s = s.replace(/^プレイヤーに対する(ヒットは)?/, "").replace(/の#%?を/g, "を").replace(/(が|を)?#?%?(増加|減少|上昇)する$/, "").replace(/#%?(の|個の)?/g, "").replace(/[#%+]/g, "").replace(/レート$/, "").replace(/\s+/g, "").trim();
    return s;
  }).filter(Boolean).join(" / ");
}

/**
 * 特殊なエッセンス (レアだけ・MOD を 1 つ消して付ける物) の説明 (2026-10-05 オーナー「錯乱ちょっと違うかもな、ランダムなノータブルパッシブ付くし
 * 鎧だけやな。説明しっかり作ろか、細かい所」)。部位は同梱の MOD の表 (perfect_essence) で確かめた。
 * short = 棚の短い名前、groups = カードの「使える装備と付く MOD」(クライアントの文が壊れている・無い物だけ差し替え)、notes = 動きの先頭に足す
 */
const SPECIAL_ESSENCE: Record<string, { short?: string; groups?: Array<{ h: string; l: string[] }>; notes: string[] }> = {
  "Essence of Delirium": {
    short: "ランダムノータブル",
    // クライアントの文は「0 を割り当てる」(ノード名の差し込みが空) なので書き直す
    groups: [{ h: "鎧 (胴の防具) だけ", l: ["ランダムなノータブルパッシブスキルを割り当てる (プレフィックス)"] }],
    notes: [
      "**レアの胴の防具 (鎧) だけ**。他の部位には使えない",
      "付くのは「ランダムなノータブルパッシブスキルを割り当てる」。どのノータブルかはパッシブツリーのノータブルからランダムで、**選べない** (重みは公開値なし)。ゲームでは付いた後「○○を割り当てる」とノード名が出る",
      "数値の無い MOD なので神のオーブで変わらない",
    ],
  },
  "Essence of Horror": {
    short: "オーグメント効果",
    notes: [
      "**レアの手袋・靴だけ**",
      "サフィックスに「ソケットされているオーグメントの効果が 60% 増加する」(固定値)。はめたルーン・ソウルコア等の効き目が 1.6 倍になるので、ソケットの多い物ほど得",
    ],
  },
  "Essence of Hysteria": {
    notes: ["**レアだけ**。部位ごとに付く MOD が違う (下の「使える装備と付く MOD」)。武器には使えない"],
  },
  "Essence of Insanity": {
    short: "コラプトでエンチャ2",
    notes: [
      "**レアのベルトだけ**",
      "サフィックスに「コラプト時に、アイテムは 2 個のエンチャントを獲得する」。ヴァールのオーブでエンチャントが付く結果になった時、1 個ではなく 2 個付く",
    ],
  },
  "Essence of the Breach": {
    notes: ["**レアの指輪・アミュレットだけ**", "プレフィックスに「品質の最大値 +20%」。カタリストで品質を 40% まで盛れる (触媒の MOD がその分強くなる)"],
  },
  "Essence of the Abyss": {
    short: "深淵の王の印",
    groups: [{ h: "防具・装飾品・ベルト など", l: ["アビサルロードの紋章 (深淵の王の印)。次の骨で冒涜 MOD に置き換わる"] }],
    notes: [],
  },
};
export function specialEssence(key: string, item: StageItem | null) {
  return key.startsWith("essence:") ? SPECIAL_ESSENCE[enOf(key, item)] ?? null : null;
}

/** 棚のボタンの値段の代わりに出す、付く MOD の短い名前 (エッセンス・カタリスト)。無い物は null (値段のまま) */
export function shelfTag(key: string, data: PatchData | null, item: StageItem | null): string[] | null {
  const sp = specialEssence(key, item);
  if (sp?.short) return [sp.short];
  if (key.startsWith("essence:")) {
    const a = stageAdds(key, data, item);
    return a ? a.lines.map(shortMod) : null;
  }
  if (key.startsWith("catalyst_")) {
    const en = enOf(key, item);
    const c = HTC_CATALYSTS.find((x) => x.en === en);
    const m = c ? /\((.+?)(モッド)?\)/.exec(c.label.ja) : null;
    return m ? [`${m[1]}系`] : null;
  }
  return null;
}
