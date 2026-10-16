/**
 * カレンシーを説明文の分解 (対象・動作・制約) で持つための型 (2026-10-16、ADR-004 docs/decisions/004-currency-as-description.md)
 *
 * カレンシーごとの関数に「この部位なら」「このお告げなら」を書き足す代わりに、説明文をそのままデータにする。
 * 動かすのは [[run-spec.ts]]、対象と制約の判定は [[judge.ts]]、動作の部品は [[parts.ts]]。
 * 冒涜まわり (骨・発現・お告げ)・消去 (2026-10-16 の 1 回目) と、オーブ類・エッセンス・品質・触媒・ルーン (同日の 2 回目)。
 * 画面はまだ今の関数 (applyCurrency) のまま。
 */
import type { ItemGroup } from "../../mods/item-classes";
import type { StageRarity, StageSide } from "../types";

/** 画面の言葉 (日本語 / 英語) */
export interface Words { ja: string; en: string }

/**
 * 出どころ。値は取った日付か、短い説明。決まりの根拠を 1 つずつ残す
 * (client = クライアントの表・説明文、owner = オーナーのゲームでの確認、assumed = 仮 = 外の正解が無い)
 */
export interface Source {
  client?: string;
  poe2db?: string;
  poe2wiki?: string;
  coe?: string;
  owner?: string;
  community?: string;
  assumed?: string;
}

/**
 * 対象: 説明文の「レアの武器または矢筒」をそのまま。部位のまとまりは item-classes.ts (クライアントの表) から引く。
 * groups が無ければ部位を問わない、rarity が無ければレアリティを問わない
 */
export interface Target {
  rarity?: StageRarity[];
  groups?: ItemGroup[];
  /** 部位が合わない時の一言 (無ければ共通の文) */
  groupsReason?: Words;
  /** レアリティが合わない時の一言 (無ければレアリティから作る) */
  rarityReason?: Words;
  /** 部位が合わなくても、暗黙「Catalysts can be applied to this item」のベース (グラスピングメイル) は対象 */
  orImplicitCatalyst?: boolean;
}

/** MOD の置き場 (ItemBase.pools)。並びは引く順 (重なった MOD は先の置き場で 1 回だけ数える) */
export type ModPool = "normal" | "desecrated" | "otherworldly";

/** 打てない時 (説明文・用語集・ゲームの決まり)。並べた順に見る */
export type Limit =
  /** 用語集 Abyssalify「Items with Desecrated Modifiers cannot be Desecrated again」 */
  | { kind: "oneDesecratedMod" }
  /** 用語集 BetterCurrencyMinimumLevel「最低 MOD レベルのあるカレンシーは、アイテムレベルがそれより低い品には使えない」 */
  | { kind: "itemLevelAtLeast"; level: number }
  /** クライアントの AbyssBenchTicketTypes.MaximumItemLevel (噛み切られた骨) */
  | { kind: "itemLevelAtMost"; level: number }
  /** 未発現の冒涜 MOD がある (発現) */
  | { kind: "hasUnrevealed" }
  /**
   * 付ける側に空きがある (お告げの側があればその側)。「Augments … with a new random modifier」は空きが無いと使えない。
   * 一言は手ごとに違う (今の関数の文のまま)
   */
  | { kind: "openSlot"; reason?: Words }
  /** MOD が n 個以上 (フラクチャー「with at least 4 modifiers」。未発現の枠も数に入る) */
  | { kind: "modsAtLeast"; n: number }
  /** 固定 (フラクチャー) した MOD がまだ無い (固定は 1 つ。2026-10-08 オーナー確認) */
  | { kind: "noFractured" }
  /** 冒涜の MOD が無い (深淵のエッセンス。計算機と同じ決まり、外の正解は無い) */
  | { kind: "noDesecrated" }
  /** 深淵の王の印がまだ無い (深淵のエッセンス) */
  | { kind: "noAbyssMark" }
  /** クラフト MOD の空き (用語集 Crafted「An item can only have one Crafted Modifier」。アストリッドの創造性で増える) */
  | { kind: "craftedSlot" }
  /** 品質が上限より下 (用語集 Quality「up to a default maximum of 20%」= max。catalyst = ベースの最大品質、種類が変わる時は 0 から) */
  | { kind: "qualityBelow"; max: number | "catalyst" }
  /** 触媒の品質がある (触媒の高貴のお告げ「consume all Catalyst Quality」) */
  | { kind: "hasCatalystQuality" }
  /** ソケットが熟練工の上限より少ない (上限はベースごと、PoB の socketLimit − 2) */
  | { kind: "socketsBelowCap" }
  /** クライアントの ItemClasses でフラクチャーできる部位 */
  | { kind: "fracturableClass" };

/**
 * 動作の部品 (順に打つ)。カレンシー固有の処理は書かない。
 * お告げは同じ部品への修飾 ([[OmenEffect]]) で変える
 */
export type Action =
  /**
   * 未発現の冒涜 MOD を 1 つ足す (用語集 Abyssalify)。満杯なら付ける側から 1 つ消してから (poe2wiki「If it removes a Prefix, it will add a Prefix」)。
   * pools は発現の候補の置き場、floor は段の下限 (古代の骨 = 最低 MOD レベル 40)。
   * exclusiveAnyLevel: 冒涜専用の MOD はアイテムレベルを見ない (噛み切られた骨は見る。2026-10-10 オーナー)。
   * fill: 枠いっぱいまで足す (腐食のお告げ「up to 6 Unrevealed modifiers」)
   */
  | { addUnrevealed: { pools: ModPool[]; floor: number; exclusiveAnyLevel: boolean; fill?: boolean } }
  /** 未発現の冒涜 MOD を、候補 offers 個から選んで発現する (用語集 Abyssalify「can be revealed at the Well of Souls」) */
  | { reveal: { offers: number } }
  /**
   * 固定 (フラクチャー) 以外から n 個消す (all = 全部)。pick: equal = 等しく / desecrated = 冒涜の MOD だけから。
   * ifAny: MOD が 1 つも無ければ消さずに通す (完全エッセンスを MOD 0 のレアに)。
   * sideWhenFull: 付ける側 (エッセンスの MOD の側) が埋まっている時はその側から消す (2026-10-14 オーナーがゲームで確認)。
   * overLimitVoids: 上限を超えている側の MOD に当たったら手ごと不成立 (カオス、2026-10-14 オーナーがゲームで確認)。
   * optional: 消せる物が無ければ消さずに通す (深淵のエッセンスは空きに印を付ける)
   */
  | { remove: { n: number | "all"; pick: "equal" | "desecrated"; ifAny?: boolean; sideWhenFull?: boolean; overLimitVoids?: boolean; optional?: boolean } }
  /** コラプトにする (腐食のお告げ) */
  | { corrupt: true }
  /** レアリティを変える (変成・王者・錬金・普通のエッセンス) */
  | { setRarity: StageRarity }
  /**
   * 普通の MOD の置き場から n 個付ける (空きが無い分は付かない)。floor = 段の下限 (上級・完全、用語集 BetterCurrencyMinimumLevel)。
   * 1 つも付かなければ弾く。ただし emptyOk (変成「with 1 modifier」で枠が 0 のベース = 不在のアミュレット) は空きが無ければ何も付けずに通す、
   * optional (カオスの「augments」の後半) は付かなくても通す
   */
  | { add: { n: number; floor: number; emptyOk?: boolean; optional?: boolean } }
  /** 数値を振り直す (神のオーブ「Randomises the numeric values of modifiers」)。固定の MOD は変わらない (用語集 Fracture「cannot be … altered」) */
  | { reroll: "values" }
  /** 固定以外の 1 つを固定する (フラクチャー「Fracture a random modifier」)。冒涜の MOD は選ばれない (2026-10-10 オーナーが実測) */
  | { fracture: true }
  /** エッセンスの MOD を付ける (保証された MOD)。side: ofMod = MOD の側 / removedSide = 消した側 (深淵の王の印) */
  | { addEssence: { side: "ofMod" | "removedSide" } }
  /** 品質を上げる (品質のカレンシー)。step: 1 回で上がる量の候補 (等分で引く) */
  | { quality: { steps: number[]; max: number } }
  /** 触媒の品質 (「Adds quality that enhances … Replaces other quality types」) */
  | { catalyst: true }
  /** ソケットを 1 つ足す (アーティフィサー「Adds an Augment Socket」) */
  | { addSocket: true }
  /** オーグメントをはめる (ルーン・ソウルコア・アイドル。決まりは augment-rules.json = 説明文から作った表) */
  | { socketAugment: true };

/** カレンシー 1 つ (骨は種類ごとに 1 つ: 保存された顎骨・古代の肋骨 …) */
export interface CurrencySpec {
  /** クライアントの名前の小文字 (currency-hover-*.json の鍵。説明文の突き合わせに使う) */
  key: string;
  /** 手順の鍵 (price-keys.json)。骨は装備の部位で種類が決まるので、同じ鍵に何個も並ぶ */
  stageKey: string;
  /** お告げの文の「次の◯◯」で指す手の種類 (desecrate = 冒涜化の試行 / reveal = 発現 / annul = 消去のオーブ) */
  kind: string;
  /** クライアントの説明文 (根拠。[[...]] の用語の印は外さずにそのまま) */
  text: { en: string[]; ja: string[] };
  target: Target;
  actions: Action[];
  limits: Limit[];
  /** コラプトしたアイテムにも使える (腐食のお告げでコラプトした未発現の MOD の発現) */
  allowCorrupted?: boolean;
  /** 聖別したアイテムにも使える物がある (ルーン: 使えるかは augment-rules.json の表で見る) */
  allowSanctified?: boolean;
  /** MOD を扱わない手 (品質・ルーン)。フラスコ・スキルジェムにも打てる (対象の判定に任せる) */
  modless?: boolean;
  source: Source;
}

/**
 * お告げの効き目 = 動作の部品への修飾。
 *   side: 付ける / 消す側 (左右のネクロマンシー・左右の消去)
 *   guaranteeTag: 発現の候補にその勢力の MOD を保証 (支配者・君主・ブラックブラッド)
 *   rerolls: 発現の候補を引き直せる回数 (アビスの反響)
 *   pick: 消す物を絞る (光のお告げ = 冒涜の MOD だけ)
 *   replace: 動作をまるごと置き換える (腐食のお告げ「replace all modifiers」)。plain = 発現は普通の MOD だけ
 */
export type OmenEffect =
  | { side: StageSide }
  | { guaranteeTag: string }
  | { rerolls: number }
  | { pick: "desecrated" }
  | { replace: Action[]; plain: true }
  /** 足す数 (大いなる高貴のお告げ「add two random modifiers」) */
  | { addCount: number }
  /** 消す物を MOD レベルの一番低い物に (削りのお告げ「remove the lowest level modifier」) */
  | { pickLowest: true }
  /** 品質の種類の MOD を重く引いて、品質を使い切る (触媒の高貴のお告げ) */
  | { catalysing: true }
  /** 振り直すのを暗黙の MOD だけに (祝福のお告げ「only reroll Implicit Modifiers」) */
  | { implicitOnly: true }
  /**
   * 消す側だけ (左右の抹消・結晶化)。side は付ける側 (左右の高貴・ネクロマンシー) か、付けない手 (消去) の消す側。
   * カオスは消して付けるので、抹消のお告げで付ける側まで絞らないように分ける
   */
  | { removeSide: StageSide };

export interface OmenSpec {
  /** price-keys.json の omens キー */
  key: string;
  /** currency-hover-*.json の鍵 */
  hover: string;
  /** 掛かる手の種類 (CurrencySpec.kind) */
  appliesTo: string;
  text: { en: string[]; ja: string[] };
  /** お告げ自身の対象 (勢力のお告げ「Weapon or Jewellery」)。合わなければ打てない */
  target?: Target;
  effect: OmenEffect;
  /** 他のお告げと一緒に効かない (腐食は単体。2026-10-05 オーナー) */
  alone?: boolean;
  /** お告げを使う前提 (触媒の高貴のお告げは品質が要る)。合わなければ打てない */
  limits?: Limit[];
  source: Source;
}
