/**
 * クラフトステージの中で持つアイテムの状態 (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)
 *
 * 計算機のシミュレーター (sim-route) は「狙いか外れか」に畳んだ抽象の状態しか持たないので、実演用に
 * **表示に要る全部** (どの MOD のどの段か、数値まで) を持つ型を別に作る。書き出す時は contract.ts (snake_case) に直す。
 */
import type { ItemBase } from "../../vendor/poe2htc/engine/types";

export type StageRarity = "normal" | "magic" | "rare";
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
  unrevealed?: { floor: number; altered: boolean; faction: string | null };
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
  /** ソケットの数 (アーティファサー) */
  sockets?: number;
  corrupted: boolean;
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
