/**
 * クラフトステージの中で持つアイテムの状態 (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)
 *
 * 計算機のシミュレーター (sim-route) は「狙いか外れか」に畳んだ抽象の状態しか持たないので、実演用に
 * **表示に要る全部** (どの MOD のどの段か、数値まで) を持つ型を別に作る。書き出す時は contract.ts (snake_case) に直す。
 */
import type { ItemBase } from "../../vendor/poe2htc/engine/types";

export type StageRarity = "normal" | "magic" | "rare" | "unique";
export type StageSide = "prefix" | "suffix";

/** アイテムに付いている MOD 1 つ (数値まで確定した物) */
export interface StageMod {
  modId: string;
  family: string;
  side: StageSide;
  /** 段の添字 (Mod.tiers の。大きいほど上の段) */
  tierIndex: number;
  /** 段の表示 (T1 が一番上) */
  tierName: string;
  /** 段の名前 (MOD の接頭 / 接尾語、例 "Hale")。無ければ "" */
  affix: string;
  /** その段の MOD レベル (Tier.ilvl) */
  modLevel: number;
  /** 転がった数値 (段の範囲の中から) */
  values: number[];
  ranges: number[][];
  textJa: string;
  textEn: string;
  fractured?: boolean;
  desecrated?: boolean;
  /** エッセンスの MOD (普通・パーフェクトとも。1 つのアイテムに 1 つまで) */
  crafted?: boolean;
  /**
   * 骨で付いたまだ開示していない冒涜 MOD (ゲームと同じく、開示の時に 3 つから選ぶ)。floor は古びた骨の段の下限、
   * altered は変質した鎖骨 (異界の MOD も出る)、faction は王 / 君主 / 黒血のお告げで絞った勢力のタグ
   */
  unrevealed?: { floor: number; altered: boolean; faction: string | null; plain?: boolean };
}

export interface StageItem {
  /** ベースの英語名 (Mnemonic Ring) */
  base: string;
  baseJa: string;
  /** そのベースの MOD の置き場と枠 (計算機と同じ ItemBase) */
  cls: ItemBase;
  itemLevel: number;
  rarity: StageRarity;
  prefixes: StageMod[];
  suffixes: StageMod[];
  quality: number;
  /** 品質の種類 (カタリストのタグ。指輪・アミュレットだけ) */
  qualityTag?: string | null;
  /** ソケットの数 (アーティファサー、ヴァール) */
  sockets?: number;
  corrupted: boolean;
  /** ヴァールのエンチャント (コラプトで付く。1 つまで) */
  enchant?: { id: string; textJa: string; textEn: string } | null;
  /** 聖別 (聖別のお告げ + 神)。コラプトと同じくもう手を加えられない */
  sanctified?: boolean;
  /** 未鑑定 (false)。MOD を隠す。鑑定の巻物で true。無ければ鑑定済み (POE2Tube 要望 ⑧) */
  identified?: boolean;
  /** 壊れた (可能性のオーブの外れ)。以後何も打てない */
  destroyed?: boolean;
  /** ユニークになった時の名前 (英語 / 日本語) */
  unique?: { en: string; ja: string } | null;
  /** スキルジェムのサポート枠の数 (宝飾職人のオーブ) */
  gemSockets?: number;
  /** ミラー (カランドラの鏡で作った写し)。以後何も打てない */
  mirrored?: boolean;
  /** 予見 (ヒネコラの髪束)。次に打つ手の結果が先に見える。アイテムが変わると消える */
  foreseen?: boolean;
  /** ヴァールサイフォナーのキル閾値 (数値は公開されていないので付いたことだけ) */
  siphoner?: boolean;
  /** 拾ったシャードの数 (キー → 個数)。10 個でオーブになる。アイテムの状態ではないが、手順の流れで持ち回すためここに置く */
  shards?: Record<string, number>;
  /** ソケットにはめたオーグメント (ルーン)。はめた順。要望 ⑰-1 */
  augments?: StageAugment[];
  /** 解呪 / サルベージで無くなった (POE2Tube 要望 ⑰-5)。以後何も打てない */
  disposed?: "disenchant" | "salvage";
  /** 解呪 / サルベージで手に入った品質カレンシー (キー → 個数)。シャードは shards の方 */
  gained?: Record<string, number>;
}

/** ソケットにはめたルーン 1 つ (その部位での効き目) */
export interface StageAugment {
  /** 手順のキー (rune:<英語名>) */
  key: string;
  en: string;
  ja: string;
  /** 効き目の部位の言葉 (マーシャル武器 / 防具 …) */
  cat: string;
  textJa: string;
  textEn: string;
  /** stat の id と値 (武器・防具の数値への反映と PoB に使う) */
  stats: Array<{ id: string; value: number }>;
}

/** 1 手の結果 */
export interface StageApply {
  /** 打てたか。打てない手は item がそのまま */
  applied: boolean;
  reason?: string;
  item: StageItem;
  added: StageMod[];
  removed: StageMod[];
  /** この手で食ったお告げ (持っていても関係の無い物は残る) */
  omensUsed?: string[];
}
