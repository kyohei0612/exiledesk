/**
 * api.ts — 火力チェックの画面 (2026-10-02) から同梱の PoB を呼ぶ部品
 *
 * オーナーの方針 (memory: pob-ui-remake-direction): 計算もビルドのモデルも PoB のまま。ここは PoB の関数を呼ぶだけ。
 *   - 読み込み: PoB コードか poe.ninja のキャラの URL (応答の pathOfBuildingExport)
 *   - PoB の中の部品 (pck.lua) を読み込みのたびに送って、`PCK.summary()` などを呼ぶ
 *   - PCK の関数は全部 { ok, error } を持つ JSON を返す。ok が false なら evalLua がその理由で throw する (呼ぶ側は try/catch 1 つ)
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
  /** PoB が丸める上限のレベル */
  maxLevel: number;
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
  /** この行の DPS = ヒット (ゲーム内の表記) + 継続 (同) + その他 (インペイル・ミラージュ、PoB のまま) + ミニオン (PoB のまま) */
  dps: number;
  /** ヒットの DPS (敵側の倍率を割り戻した、ゲーム内の表記) */
  hitDps: number;
  /** 継続ダメージ (発火・出血・毒・DoT スキル)。敵側の倍率を割り戻した物と、PoB のまま */
  dot: number;
  dotPob: number;
  /** インペイル・ミラージュ (PoB のまま。敵側を分けられない) */
  other: number;
  /** カリングで増える分 (PoB の CombinedDPS に入るがゲーム内の表記に無いので dps に入れない) */
  cull: number;
  /** ミニオンの DPS (PoB のまま) と名前 */
  minion: number;
  minionName?: string;
  /** 敵側の倍率を割り戻した比 (PoB の DPS × これ = ここの DPS) */
  enemyRatio: number;
  parts: Array<{ type: string; hit: number }>;
  /** 二刀流で両手で殴るスキル (1 発は両手の平均) */
  dualWield: boolean;
}
export interface SkillView {
  k: number;
  name: string;
  level: number;
  /** メタジェム (CoEA など) から出るスキル */
  triggered: boolean;
  game: GameNumbers;
  /** PoB の CombinedDPS (敵込み) */
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
  /** フラスコ・チャームだけ: 計算に入れている */
  active?: boolean;
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
  /** 装備・ジュエルが与えているノード (外せない、寄与も出さない) */
  granted: number[];
  jewels: Array<{ id: number; name: string; rarity: string; r: number }>;
}
export interface Summary {
  char: { class: string; ascendancy: string; level: number };
  stats: Record<string, number | boolean | null>;
  /** powerCharges = 実効の数 (PoB が使っている数)、powerChargesInput = 設定に書いた数 */
  config: { powerCharges: number; powerChargesInput: number };
  /** PoB の主スキルの組 (ビルドの作者の選び) */
  mainSocketGroup: number;
  groups: GroupView[];
  items: SlotView[];
  tree: TreeState;
  /** 今使っている武器セット */
  weaponSet: number;
}

const JA = itemsJaClient as Record<string, string>;
/** ジェムの日本語名 (公式訳。無ければ英語のまま) */
export const gemJa = (en: string): string => JA[en] ?? en;

/** PCK の関数を呼ぶ。Rust の失敗は reject、PCK の { ok: false } はその error で throw (呼ぶ側は 1 つの catch で足りる) */
async function evalLua<T>(script: string): Promise<T> {
  const out = await invoke<string>("pob_eval", { script });
  let r: { ok?: boolean; error?: string };
  try {
    r = JSON.parse(out) as { ok?: boolean; error?: string };
  } catch {
    throw new Error(`PoB の返事が読めません: ${out.slice(0, 200)}`);
  }
  if (r && r.ok === false) throw new Error(r.error ?? "PoB で失敗しました");
  return r as T;
}

/** Lua の数 (NaN / Infinity は Lua の構文エラーになるので弾く) */
const luaNum = (v: number): string => {
  if (!Number.isFinite(v)) throw new Error(`数ではありません: ${v}`);
  return String(v);
};
/** Lua の文字列 (長い括弧。中に ]==] が無い限り何でも入る) */
function luaStr(s: string): string {
  let eq = "=";
  while (s.includes(`]${eq}]`)) eq += "=";
  return `[${eq}[${s}]${eq}]`;
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

/** PoB の中の部品を送る (読み込みのたび) */
async function sendPck(): Promise<void> {
  const ok = await invoke<string>("pob_eval", { script: pckLua });
  if (ok !== "ok") throw new Error(`PoB の部品を読み込めません: ${ok}`);
}

/** ビルドを読み込んで、PoB の中の部品を送る */
export async function loadBuild(text: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error("アプリの中でだけ使えます");
  const code = await toPobCode(text);
  await invoke("pob_load_build_code", { code });
  await sendPck();
}

/** 同梱 (公式と共通) の PoB が保存したビルド */
export interface SavedBuild {
  name: string;
  path: string;
  modified: number;
  class_name: string;
  ascendancy: string;
  level: number;
}
export const savedBuilds = (): Promise<SavedBuild[]> => invoke<SavedBuild[]>("pob_saved_builds");
/** PoB に保存したビルドを読み込む (自分のキャラ: PoB でログインして取り込んで保存した物) */
export async function loadSavedBuild(path: string): Promise<void> {
  if (!isTauriRuntime()) throw new Error("アプリの中でだけ使えます");
  await invoke("pob_load_saved_build", { path });
  await sendPck();
}
/** 同梱の PoB を開く (自分のキャラの取り込みは PoB の Import/Export → Import from website / Character import で) */
export const openPob = (): Promise<unknown> => invoke("pob_launcher_open");
/**
 * アプリのログインで pathofexile.com の character-window を読む (自分のキャラ、2026-10-02 試し)。
 * PoE2 で使えるかは未確認なので、状態と本体をそのまま返す
 */
export type CharacterWindowEndpoint = "get-account-name" | "get-characters" | "get-items" | "get-passive-skills";
export interface CharacterWindowResponse {
  status: number;
  /** 429 の時の待ち秒数 (Retry-After)。無ければ null */
  retry_after: number | null;
  /** x-rate-limit-* ヘッダ */
  ratelimit: Record<string, string>;
  body: unknown;
}
export const characterWindow = (endpoint: CharacterWindowEndpoint, character?: string, account?: string): Promise<CharacterWindowResponse> =>
  invoke("poe_character_window", { endpoint, character: character ?? null, account: account ?? null });
/** 今のビルド (変えた所も込み) を PoB のコードに (共有用)。先に画面で見ているスキルを PoB の主スキルにする */
export async function exportCode(main?: { i: number; k: number }): Promise<string> {
  if (main) await evalLua(`return PCK.setMainSkill(${luaNum(main.i)}, ${luaNum(main.k)})`);
  return invoke<string>("pob_export_code");
}

export const summary = (): Promise<Summary> => evalLua<Summary>("return PCK.summary()");

/** ジェムを変える。返りは PoB が丸めた後のジェム (画面の「変えた所」はこれで書く) */
export const setGem = (i: number, j: number, field: "level" | "quality" | "corrupt" | "enabled", value: number | boolean): Promise<{ gem: GemView }> =>
  evalLua(`return PCK.setGem(${luaNum(i)}, ${luaNum(j)}, ${JSON.stringify(field)}, ${typeof value === "boolean" ? String(value) : luaNum(value)})`);

export const setGroup = (i: number, enabled: boolean): Promise<unknown> => evalLua(`return PCK.setGroup(${luaNum(i)}, ${enabled})`);

export const setPowerCharges = (n: number): Promise<unknown> => evalLua(`return PCK.setPowerCharges(${luaNum(Math.max(0, Math.floor(n)))})`);

/** 欄に物を入れる (text = PoB の文面)。unread = PoB が計算しない行 */
export const equip = (slot: string, text: string): Promise<{ unread: string[] }> => evalLua(`return PCK.equip(${luaStr(slot)}, ${luaStr(text)})`);
export const unequip = (slot: string): Promise<unknown> => evalLua(`return PCK.unequip(${luaStr(slot)})`);
export const restore = (slot: string): Promise<unknown> => evalLua(`return PCK.restore(${luaStr(slot)})`);

export const setWeaponSet = (n: 1 | 2): Promise<unknown> => evalLua(`return PCK.setWeaponSet(${n})`);
export const treeStatic = (): Promise<{ nodes: TreeNode[] }> => evalLua("return PCK.treeStatic()");

/** ノードを取る / 外す。attr = 能力値のノードの選び (1 筋力 / 2 器用さ / 3 知性) */
export const toggleNode = (id: number, attr: number): Promise<{ alloc: boolean; changed: number }> =>
  evalLua(`return PCK.toggleNode(${luaNum(Math.floor(id))}, ${luaNum(Math.floor(attr))})`);
export const resetTree = (): Promise<unknown> => evalLua("return PCK.resetTree()");

export interface NodePowerRaw {
  base: number;
  nodes: Record<string, { single: number; path: number; n: number }>;
}
/** スキル (組 i のスキル k) で、取っているノード ids を 1 個ずつ外した時の DPS */
export const nodePower = (i: number, k: number, ids: number[]): Promise<NodePowerRaw> =>
  evalLua(`return PCK.nodePower(${luaNum(i)}, ${luaNum(k)}, {${ids.map(luaNum).join(",")}})`);
