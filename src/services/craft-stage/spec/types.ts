/**
 * カレンシーを説明文の分解 (対象・動作・制約) で持つための型 (2026-10-16、ADR-004 docs/decisions/004-currency-as-description.md)
 *
 * カレンシーごとの関数に「この部位なら」「このお告げなら」を書き足す代わりに、説明文をそのままデータにする。
 * 動かすのは [[run-spec.ts]]、対象と制約の判定は [[judge.ts]]、動作の部品は [[parts.ts]]。
 * 今は冒涜まわり (骨・発現・お告げ) と消去 (光のお告げのため) だけ。画面はまだ今の関数 (applyCurrency) のまま。
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
  | { kind: "hasUnrevealed" };

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
  /** 固定 (フラクチャー) 以外から n 個消す (all = 全部)。pick: equal = 等しく / desecrated = 冒涜の MOD だけから */
  | { remove: { n: number | "all"; pick: "equal" | "desecrated" } }
  /** コラプトにする (腐食のお告げ) */
  | { corrupt: true };

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
  | { replace: Action[]; plain: true };

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
  source: Source;
}
