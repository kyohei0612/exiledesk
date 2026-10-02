/**
 * api.ts — 火力チェックの画面 (2026-10-02) から同梱の PoB を呼ぶ部品
 *
 * オーナーの方針 (memory: pob-ui-remake-direction): 計算もビルドのモデルも PoB のまま。ここは PoB の関数を呼ぶだけ。
 *   - 読み込み: PoB コードか poe.ninja のキャラの URL (応答の pathOfBuildingExport)
 *   - PoB の中の部品 (pck.lua) を読み込みのたびに送って、`PCK.summary()` などを呼ぶ
 *   - 数字はゲーム内の表記に寄せる (敵の耐性・呪い・露出を割り戻す)。決まりは pck.lua の頭
 */
import { invoke } from "@tauri-apps/api/core";
import pckLua from "./pck.lua?raw";
import itemsJaClient from "../../i18n/items-ja-client.json";
import { parseNinjaUrl } from "../build-copy/ninja-url";
import { isTauriRuntime } from "../../utils/isTauriRuntime";

export interface GemView {
  j: number;
  name: string;
  level: number;
  quality: number;
  corrupt: number;
  enabled: boolean;
  support: boolean;
}
export interface GameNumbers {
  /** 1 発 (クリティカル無し、敵の軽減なし) */
  hit: number;
  /** 1 発 (クリティカル) */
  crit: number;
  critChance: number;
  /** 1 秒あたりの回数 */
  speed: number;
  hitChance: number;
  /** クリティカル込みの平均の 1 発 */
  avg: number;
  /** この行の DPS = ヒット (ゲーム内の表記) + 継続 + ミニオン */
  dps: number;
  /** ヒットの DPS (敵側の倍率を割り戻した、ゲーム内の表記) */
  hitDps: number;
  /** 継続ダメージ (発火・出血・毒・DoT スキル。PoB のまま) */
  dot: number;
  /** ミニオンの DPS (PoB のまま) と名前 */
  minion: number;
  minionName?: string;
  /** 敵側の倍率を割り戻した比 (PoB の DPS × これ = ここの DPS) */
  enemyRatio: number;
  parts: Array<{ type: string; hit: number }>;
}
export interface SkillView {
  k: number;
  name: string;
  level: number;
  /** メタジェム (CoEA など) から出るスキル */
  triggered: boolean;
  game: GameNumbers;
  pobDps: number;
}
export interface GroupView {
  i: number;
  label: string;
  enabled: boolean;
  slot?: string;
  meta: boolean;
  /** 同じ中身の組 (スキルセットの 2 重など) の時、元の組の番号 */
  duplicateOf?: number;
  gems: GemView[];
  skills: SkillView[];
}
export interface ItemView {
  title: string;
  base: string;
  rarity: string;
  implicits: string[];
  runes: string[];
  explicits: string[];
  corrupted: boolean;
}
export interface SlotView {
  slot: string;
  jewel: boolean;
  /** 読み込んだ時から変えた */
  changed: boolean;
  /** 武器の欄だけ: 1 = 1 つ目の武器セット / 2 = 持ち替え */
  weaponSet?: number;
  item?: ItemView;
}
export interface TreeNode {
  id: number;
  x: number;
  y: number;
  /** n 小 / N ノータブル / K キーストーン / J ジュエルの穴 / C クラスの始点 / A アセンダンシーの始点 */
  t: "n" | "N" | "K" | "J" | "C" | "A";
  n: string;
  sd?: string[];
  /** つながる先 (自分より大きい id だけ。線を 2 回引かない) */
  l: number[];
  /** アセンダンシーのノード */
  a?: 1;
  /** 能力値 (筋力/器用さ/知性を選ぶ) */
  at?: 1;
  /** 同じグループの同じ軌道なら円弧で結ぶ: グループの中心と半径 */
  gx?: number;
  gy?: number;
  r?: number;
}
export interface TreeState {
  alloc: number[];
  jewels: Array<{ id: number; name: string; rarity: string; r: number }>;
}
export interface Summary {
  char: { class: string; ascendancy: string; level: number };
  stats: Record<string, number | boolean | null>;
  config: { powerCharges: number };
  groups: GroupView[];
  items: SlotView[];
  tree: TreeState;
  /** 今使っている武器セット */
  weaponSet: number;
}

const JA = itemsJaClient as Record<string, string>;
/** ジェムの日本語名 (公式訳。無ければ英語のまま) */
export const gemJa = (en: string): string => JA[en] ?? en;

async function evalLua<T>(script: string): Promise<T> {
  const out = await invoke<string>("pob_eval", { script });
  if (out.startsWith("ERR")) throw new Error(out);
  return JSON.parse(out) as T;
}

/** 貼られた物 (PoB コード / poe.ninja の URL) → PoB コード */
export async function toPobCode(text: string): Promise<string> {
  const t = text.trim();
  const u = parseNinjaUrl(t);
  if (!u) return t;
  const body = await invoke<Record<string, unknown>>("ninja_build_character", { leagueUrl: u.league, account: u.account, name: u.name });
  const code = body.pathOfBuildingExport;
  if (typeof code !== "string" || code.length < 100) throw new Error("このキャラは PoB のデータがありません (poe.ninja 側)");
  return code;
}

/** ビルドを読み込んで、PoB の中の部品を送る */
export async function loadBuild(text: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error("アプリの中でだけ使えます");
  const code = await toPobCode(text);
  await invoke("pob_load_build_code", { code });
  const ok = await invoke<string>("pob_eval", { script: pckLua });
  if (ok !== "ok") throw new Error(`PoB の部品を読み込めません: ${ok}`);
}

export const summary = (): Promise<Summary> => evalLua<Summary>("return PCK.summary()");

export const setGem = (i: number, j: number, field: "level" | "quality" | "corrupt" | "enabled", value: number | boolean): Promise<unknown> =>
  evalLua(`return PCK.setGem(${i}, ${j}, ${JSON.stringify(field)}, ${typeof value === "boolean" ? String(value) : Number(value)})`);

export const setGroup = (i: number, enabled: boolean): Promise<unknown> => evalLua(`return PCK.setGroup(${i}, ${enabled})`);

export const setPowerCharges = (n: number): Promise<unknown> => evalLua(`return PCK.setPowerCharges(${Math.max(0, Math.floor(n))})`);

/** 欄に物を入れる (text = PoB の文面)。unread = PoB が計算しない行 */
export const equip = (slot: string, text: string): Promise<{ ok: boolean; error?: string; unread?: string[] }> =>
  evalLua(`return PCK.equip(${luaStr(slot)}, ${luaStr(text)})`);
export const unequip = (slot: string): Promise<unknown> => evalLua(`return PCK.unequip(${luaStr(slot)})`);
export const restore = (slot: string): Promise<unknown> => evalLua(`return PCK.restore(${luaStr(slot)})`);

/** Lua の文字列 (長い括弧。中に ]==] が無い限り何でも入る) */
function luaStr(s: string): string {
  let eq = "=";
  while (s.includes(`]${eq}]`)) eq += "=";
  return `[${eq}[${s}]${eq}]`;
}
export const setWeaponSet = (n: 1 | 2): Promise<unknown> => evalLua(`return PCK.setWeaponSet(${n})`);
export const treeStatic = (): Promise<{ nodes: TreeNode[] }> => evalLua("return PCK.treeStatic()");

/** ノードを取る / 外す。attr = 能力値のノードの選び (1 筋力 / 2 器用さ / 3 知性) */
export const toggleNode = (id: number, attr: number): Promise<{ ok: boolean; error?: string; alloc?: boolean; changed?: number }> =>
  evalLua(`return PCK.toggleNode(${Math.floor(id)}, ${Math.floor(attr)})`);
export const resetTree = (): Promise<{ ok: boolean; error?: string }> => evalLua("return PCK.resetTree()");

export interface NodePowerRaw {
  ok: boolean;
  error?: string;
  base: number;
  nodes: Record<string, { single: number; path: number; n: number }>;
}
/** スキル (組 i のスキル k) で、取っているノード ids を 1 個ずつ外した時の DPS */
export const nodePower = (i: number, k: number, ids: number[]): Promise<NodePowerRaw> =>
  evalLua(`return PCK.nodePower(${i}, ${k}, {${ids.join(",")}})`);
