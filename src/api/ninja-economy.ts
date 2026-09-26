/**
 * poe.ninja の相場 (ユニーク装備) (2026-09-26)
 *
 * オーナー:「忍者とどっちがいいかな ユニーク装備の価格推移は」「丁度忍者使ってるしな」。
 * poe2scout はユニークの点がまばらで、ルーンの熟達品 (Runemastered) の別行も無かった。poe.ninja は
 *   - 一覧 1 回で 値段 (神建て)・7 日の推移 (日ごとの変化率)・出品数 が入る
 *   - 1 件の日ごとの推移 (リーグ開始から) は行を開いた時だけ取る
 * 取得は Rust (poe_ninja_client/economy.rs) 経由。他の poe.ninja 取得と同じゲート (2.5 秒間隔) を通る。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../utils/isTauriRuntime";

/** poe.ninja の種類 (URL の type) と日本語の見出し。この順で並べる */
export const NINJA_UNIQUE_KINDS = [
  { kind: "UniqueWeapons", ja: "武器" },
  { kind: "UniqueArmours", ja: "防具" },
  { kind: "UniqueAccessories", ja: "装身具" },
  { kind: "UniqueJewels", ja: "ジュエル" },
  { kind: "UniqueFlasks", ja: "フラスコ" },
  { kind: "UniqueCharms", ja: "チャーム" },
  { kind: "UniqueSanctumRelics", ja: "レリック" },
  { kind: "UniqueTablets", ja: "タブレット" },
] as const;
export type NinjaUniqueKind = (typeof NINJA_UNIQUE_KINDS)[number]["kind"];

export interface NinjaLine {
  id: number;
  name: string;
  baseType: string;
  icon: string;
  levelRequired?: number;
  /** poe.ninja の分類 (Body Armour / Gloves / [Focus] …) */
  category?: string;
  /** 神建て */
  primaryValue: number;
  listingCount: number;
  corrupted: boolean;
  flavourText?: string;
  /** MOD 文 (英語、[Tag|表示] の印つき)。optional は「どれかが付く」行 */
  implicitModifiers?: NinjaModLine[];
  explicitModifiers?: NinjaModLine[];
  /** 防御値など (「[EnergyShield|Energy Shield]: (164-300)」) */
  propertyModifiers?: NinjaModLine[];
  /** 要求 (「Level: 64」「[Intelligence|Int]: 37」) */
  requirementModifiers?: NinjaModLine[];
  /** data: 7 日分の、最初の日からの変化率 (%)。欠けた日は null */
  sparkLine?: { totalChange: number; data: Array<number | null> };
}

export interface NinjaModLine {
  text: string;
  optional?: boolean;
}

export interface NinjaOverview {
  lines: NinjaLine[];
  /** 1 神あたりの高貴 */
  exaltedPerDivine: number;
}

export interface NinjaHistoryPoint {
  daysAgo: number;
  /** 神建て */
  value: number;
  count: number;
}

/** poe2scout のリーグ名 → poe.ninja のリーグ名 (HC は "HC …" 表記) */
export function ninjaLeagueName(league: string): string {
  return league.replace(/^Hardcore\s+/i, "HC ");
}

export async function fetchNinjaOverview(league: string, kind: NinjaUniqueKind): Promise<NinjaOverview> {
  if (!isTauriRuntime()) throw new Error("アプリ内でのみ取得できます");
  const raw = (await invoke("ninja_economy_overview", { league: ninjaLeagueName(league), kind })) as {
    lines?: NinjaLine[];
    core?: { rates?: { exalted?: number } };
  };
  return { lines: Array.isArray(raw.lines) ? raw.lines : [], exaltedPerDivine: raw.core?.rates?.exalted ?? 0 };
}

export async function fetchNinjaHistory(league: string, kind: NinjaUniqueKind, id: number): Promise<NinjaHistoryPoint[]> {
  if (!isTauriRuntime()) return [];
  const raw = await invoke("ninja_economy_history", { league: ninjaLeagueName(league), kind, id });
  return Array.isArray(raw) ? (raw as NinjaHistoryPoint[]) : [];
}
