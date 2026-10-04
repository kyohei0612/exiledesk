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
import { jaSkill } from "../../i18n/skills-ja";
import passiveIds from "../../data/passive-ids.json";
import { parseNinjaUrl } from "../build-copy/ninja-url";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import type { BreakdownRaw } from "./breakdown";

export interface GemView {
  j: number;
  name: string;
  /** PoB の中のジェムの ID (相手の組を自分に写す時、名前より確実に同じジェムを引く) */
  gemId?: string;
  level: number;
  quality: number;
  corrupt: number;
  enabled: boolean;
  support: boolean;
  /** PoB が丸める上限のレベル */
  maxLevel: number;
  /** リネージュのサポート (ゲームのタグ Lineage) */
  lineage?: boolean;
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
  /** 装備・ツリーが与えるスキルの組 ("Item:13:Adonia's Ego, …" / "Tree:12882")。ジェムではないので、ジェムの差・ビルドプランナーには出さない */
  source?: string;
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
  /** PoB の文面 (本家 BuildRaw)。相手の物を自分の欄に当てる試算・取り入れに使う */
  raw: string;
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
  /** ツリーのまとまり (group) の番号。相手が取っていて自分に無いノードを束ねる単位 (取り入れの試算) */
  g?: number;
}
export interface TreeState {
  alloc: number[];
  /** 装備・ジュエルが与えているノード (外せない、寄与も出さない) */
  granted: number[];
  jewels: Array<{ id: number; name: string; rarity: string; r: number }>;
  /** 属性ノードで選んだ物 (dn = Strength / Dexterity / Intelligence) */
  attr?: Array<{ id: number; dn: string }>;
}
export interface Summary {
  char: { class: string; ascendancy: string; level: number };
  stats: Record<string, number | boolean | null>;
  /** powerCharges = 実効の数 (PoB が使っている数)、powerChargesInput = 設定に書いた数 */
  /** input = 設定の写し (自分の側だけ。敵の設定は入れない) */
  config: { powerCharges: number; powerChargesInput: number; input?: Record<string, boolean | number | string> };
  /** PoB の主スキルの組 (ビルドの作者の選び) */
  mainSocketGroup: number;
  groups: GroupView[];
  items: SlotView[];
  tree: TreeState;
  /** 今使っている武器セット */
  weaponSet: number;
}

const JA = itemsJaClient as Record<string, string>;
/**
 * ジェム・スキルの日本語名 (公式訳。無ければ英語のまま)。ジェムの名前 → スキル名 (ActiveSkills、Summon Wolf 等の装備が与えるスキル) の順。
 * PoB のミニオンのスキルの行 (Skeletal Frost Mage Minion) は「スケルタルフロストメイジ (ミニオン)」、スペクター (Spectre: Powered Zealot) は
 * 「スペクター: …」(モンスター名の辞書は無いので後ろは英語) (2026-10-04 オーナー「英語のとこあるね」)
 */
export function gemJa(en: string): string {
  const hit = JA[en] ?? jaSkill(en);
  if (hit !== en) return hit;
  const minion = /^(.+) Minion$/.exec(en);
  if (minion) {
    const base = gemJa(minion[1]!);
    if (base !== minion[1]) return `${base} (ミニオン)`;
  }
  const spectre = /^Spectre: (.+)$/.exec(en);
  if (spectre) return `スペクター: ${spectre[1]}`;
  return en;
}

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

/** ビルドを読み込んで、PoB の中の部品を送る。返り値は読み込んだ PoB コード (poe.ninja の URL なら取ってきた物。「全部戻す」はこれを読み直す = 取り直さない) */
export async function loadBuild(text: string): Promise<string> {
  if (!isTauriRuntime()) throw new Error("アプリの中でだけ使えます");
  const code = await toPobCode(text);
  await invoke("pob_load_build_code", { code });
  await sendPck();
  return code;
}

/** 同梱の PoB を開く (自分のキャラは PoB でログインして取り込み、Import/Export のコードをアプリに貼る) */
export const openPob = (): Promise<unknown> => invoke("pob_launcher_open");
/** 今のビルド (変えた所も込み) を PoB のコードに (共有用)。先に画面で見ているスキルを PoB の主スキルにする */
export async function exportCode(main?: { i: number; k: number }): Promise<string> {
  if (main) await evalLua(`return PCK.setMainSkill(${luaNum(main.i)}, ${luaNum(main.k)})`);
  return invoke<string>("pob_export_code");
}

export const summary = (): Promise<Summary> => evalLua<Summary>("return PCK.summary()");

/** ゲームのビルドプランナー (.build) の中身。json = そのまま書く文字列、unknownNodes = ID の表に無かったノード (出せなかった) */
export interface BuildPlan {
  json: string;
  passives: number;
  skills: number;
  unknownNodes: number[];
  /** PoB が知らない (gameId の無い) ジェムや、アクティブの無い組のジェム = 出せなかった数 */
  skippedGems: number;
}
/** ノードの番号 → ゲームの文字列 ID の表を Lua のテーブルにした物 (1 回だけ作る。125 KB) */
let passiveIdsLua: string | null = null;
/**
 * 今の PoB のビルドをゲームのビルドプランナーの形に (2026-10-03 オーナー「相手のビルドのビルドプランナーもそのまま使えるようにしたい」)。
 * 相手を読み込んでいる間に呼べば相手の物になる。形の決まりは pck.lua の PCK.plan、書くのは buildPlannerWrite
 */
export function plan(name: string, author: string): Promise<BuildPlan> {
  passiveIdsLua ??= `{${Object.entries(passiveIds as Record<string, string>)
    .map(([k, v]) => `[${Number(k)}]=${JSON.stringify(v)}`)
    .join(",")}}`;
  return evalLua<BuildPlan>(`return PCK.plan(${luaStr(name)}, ${luaStr(author)}, ${passiveIdsLua})`);
}
/** .build を Documents/My Games/Path of Exile 2/BuildPlanner に書く。返り値は書いたパス (同名があれば (2) が付く) */
export const buildPlannerWrite = (name: string, json: string): Promise<string> => invoke<string>("build_planner_write", { name, json });
/** 比べる相手を読み込む前に今のビルドの覚え (元の物・足した物・ツリーの元) を退避し、自分のビルドを読み直した後に戻す */
export const stashState = (): Promise<unknown> => evalLua("return PCK.stash()");
export const unstashState = (): Promise<{ restored: boolean }> => evalLua("return PCK.unstash()");

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

// ---------------------------------------------------------------- 取り入れの試算 (2026-10-03)
/** ライフ・ES・マナ・耐性 (試算の前後) */
export type EstimateStats = Record<"Life" | "EnergyShield" | "Mana" | "FireResist" | "ColdResist" | "LightningResist" | "ChaosResist", number>;
/**
 * 試算の返り。base / with = 上のバーのスキルの DPS (行の DPS と同じ物差し。画面は 自分の行の DPS × with / base)、
 * stats / statsWith = ライフ等。ビルドは変えていない
 */
export interface EstimateRaw {
  base: number;
  with: number;
  stats: EstimateStats;
  statsWith: EstimateStats;
}
export interface EstimateItemRaw extends EstimateRaw {
  /** 両手武器で外れる欄 (オフハンド) */
  displaced: string[];
  /** withLines の時: その物の明示の行を 1 行ずつ抜いた時の DPS (小さいほどその行が効いている = 「ここが効く」) */
  lines?: Array<{ line: string; dps: number }>;
}
export interface EstimateGemsRaw extends EstimateRaw {
  /** PoB が知らなかったジェムの名前 (計算に入っていない) */
  unknown: string[];
  /** 組を足した時 (gi = 0): その組の最初のスキルの DPS */
  newDps?: number;
  /** 差し替えで上のバーのスキルがその組から無くなる (with は 0) */
  focusLost?: boolean;
}
export interface EstimateNodesRaw extends EstimateRaw {
  /** 本当に足したノードの数 (もう取っている物は除く) */
  n: number;
}
/** 相手の組のジェムを自分の組に写す時の 1 つ分 (GemView から取る) */
export interface GemSpec {
  name: string;
  gemId?: string;
  level: number;
  quality: number;
  corrupt: number;
  enabled: boolean;
}
/** ジェムの一覧を Lua のテーブルに */
const luaGems = (gems: GemSpec[]): string =>
  `{${gems
    .map((g) => `{name=${luaStr(g.name)},${g.gemId ? `gemId=${luaStr(g.gemId)},` : ""}level=${luaNum(g.level)},quality=${luaNum(g.quality)},corrupt=${luaNum(g.corrupt)},enabled=${g.enabled ? "true" : "false"}}`)
    .join(",")}}`;

/** 欄 slot に raw (PoB の文面) の物を付けたら (スキル = 組 i のスキル k)。withLines = 行ごとの効きも (ユニークの「ここが効く」) */
export const estimateItem = (i: number, k: number, slot: string, raw: string, withLines: boolean): Promise<EstimateItemRaw> =>
  evalLua(`return PCK.estimateItem(${luaNum(i)}, ${luaNum(k)}, ${luaStr(slot)}, ${luaStr(raw)}, ${withLines ? "true" : "false"})`);
/** 自分の組 gi のジェムを相手の構成にしたら (gi = 0 は組を足したら) */
export const estimateGems = (i: number, k: number, gi: number, gems: GemSpec[]): Promise<EstimateGemsRaw> =>
  evalLua(`return PCK.estimateGems(${luaNum(i)}, ${luaNum(k)}, ${luaNum(gi)}, ${luaGems(gems)})`);
/** 取り入れる: 組 gi のジェムを本当に相手の構成にする (gi = 0 は組を足す)。返りは組の番号と PoB が知らないジェム */
export const setGroupGems = (gi: number, gems: GemSpec[]): Promise<{ i: number; unknown: string[] }> =>
  evalLua(`return PCK.setGroupGems(${luaNum(gi)}, ${luaGems(gems)})`);
/** 相手が取っていて自分に無いノード ids を全部取れたとして足したら (つながる道は見ない) */
export interface EstimateTreeRaw extends EstimateRaw { n: number; removed: number }
/** ツリーを丸ごと相手の物にしたら (add = 足すノード、remove = 外すノード) */
export const estimateTree = (i: number, k: number, add: number[], remove: number[]): Promise<EstimateTreeRaw> =>
  evalLua(`return PCK.estimateTree(${luaNum(i)}, ${luaNum(k)}, {${add.map((id) => luaNum(Math.floor(id))).join(",")}}, {${remove.map((id) => luaNum(Math.floor(id))).join(",")}})`);
export interface EstimateJewelRaw extends EstimateRaw { socketAdded: boolean }
/** ツリーのジュエルの穴 slot (Jewel <番号>) に相手のジュエルを入れたら (穴を取っていなければ穴も足す) */
export const estimateJewel = (i: number, k: number, slot: string, raw: string, nodeId: number): Promise<EstimateJewelRaw> =>
  evalLua(`return PCK.estimateJewel(${luaNum(i)}, ${luaNum(k)}, ${luaStr(slot)}, ${luaStr(raw)}, ${luaNum(Math.floor(nodeId))})`);
/** 火力の差の試算の基準のツリー (この間の試算は「ツリーを相手と同じにした上で」になる)。null で外す */
/** attr = 属性ノードの選び方 (相手の TreeState.attr) */
const luaAttrs = (attr: Array<{ id: number; dn: string }> | undefined): string => `{${(attr ?? []).map((a) => `{ id = ${luaNum(a.id)}, dn = ${luaStr(a.dn)} }`).join(",")}}`;
export const setEstimateTree = (t: { add: number[]; remove: number[]; attr?: Array<{ id: number; dn: string }> } | null): Promise<unknown> =>
  evalLua(t ? `return PCK.setEstimateTree({${t.add.map((id) => luaNum(Math.floor(id))).join(",")}}, {${t.remove.map((id) => luaNum(Math.floor(id))).join(",")}}, ${luaAttrs(t.attr)})` : "return PCK.setEstimateTree(nil)");
export interface EstimateAllRaw {
  /** 今の自分 / ツリーを相手と同じに / + 装備・ジュエル / + ジェム の DPS (同じ物差し) */
  cur: number;
  tree: number;
  items: number;
  gems: number;
  /** + 設定 (相手の設定を渡した時だけ) */
  config?: number;
  stats: EstimateStats;
  statsTree: EstimateStats;
  statsItems: EstimateStats;
  statsGems: EstimateStats;
}
/** 全部まとめて真似したら (ツリー → 装備・ジュエル → ジェム の順に重ねる) */
/** Lua の表 (設定の写し)。キーは文字、値は真偽・数・文字 */
const luaConfig = (c: Record<string, boolean | number | string>): string =>
  `{${Object.entries(c).map(([k, v]) => `[ ${luaStr(k)} ]=${typeof v === "string" ? luaStr(v) : typeof v === "number" ? luaNum(v) : v ? "true" : "false"}`).join(",")}}`;
export const estimateAll = (i: number, k: number, plan: { items: Array<{ slot: string; raw: string | null }>; tree: { add: number[]; remove: number[] }; groups: Array<{ gi: number; gems: GemSpec[] }>; off?: number[]; attr?: Array<{ id: number; dn: string }>; config?: Record<string, boolean | number | string> | null }): Promise<EstimateAllRaw> =>
  evalLua(`return PCK.estimateAll(${luaNum(i)}, ${luaNum(k)}, {${plan.items.map((x) => `{ slot = ${luaStr(x.slot)}, raw = ${x.raw == null ? "nil" : luaStr(x.raw)} }`).join(",")}}, {${plan.tree.add.map((id) => luaNum(Math.floor(id))).join(",")}}, {${plan.tree.remove.map((id) => luaNum(Math.floor(id))).join(",")}}, {${plan.groups.map((g) => `{ gi = ${luaNum(g.gi)}, gems = ${luaGems(g.gems)} }`).join(",")}}, ${plan.config ? luaConfig(plan.config) : "nil"}, {${(plan.off ?? []).map(luaNum).join(",")}}, ${luaAttrs(plan.attr)})`);
export const estimateNodes = (i: number, k: number, ids: number[]): Promise<EstimateNodesRaw> =>
  evalLua(`return PCK.estimateNodes(${luaNum(i)}, ${luaNum(k)}, {${ids.map((id) => luaNum(Math.floor(id))).join(",")}})`);

// ---------------------------------------------------------------- 火力の内訳 (2026-10-03)
/**
 * 組 i のスキル k の内訳の生の数字 (PCK.breakdown)。種類ごとの基礎 / 増加 / 増し、速さ、クリ率、クリ倍率と、各 MOD の出所。
 * 式に組み立てるのは services/pob-check/breakdown.ts の buildChain。ビルドは変えない (主スキルの選びも戻す)
 */
export const breakdown = (i: number, k: number): Promise<BreakdownRaw> => evalLua(`return PCK.breakdown(${luaNum(i)}, ${luaNum(k)})`);
