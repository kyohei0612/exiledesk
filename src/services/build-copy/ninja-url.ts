/**
 * 忍者ビルドコピー: poe.ninja のビルドページの URL から読む (2026-09-26)
 *
 * オーナー:「URL からも読めるようにして」。
 *   URL: https://poe.ninja/poe2/builds/<リーグ>/character/<アカウント>/<キャラ名>?…
 *   Rust の ninja_build_character が character の API を 1 回叩く (poe.ninja のゲートを通る)。
 *   応答に PoB のコード (pathOfBuildingExport) があればそれを読み、無ければ items / jewels / skills から組み立てる。
 *   装備の形はゲームの API と同じ (frameType = レアリティ、inventoryId = 部位、socketedItems = 差したルーン)。
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { decodePobCode, parseBuild, type BuildGem, type BuildItem, type BuildItemKind, type ParsedBuild } from "./pob";

/** URL から リーグ / アカウント / キャラ名 を取り出す。形が違えば null */
export function parseNinjaUrl(text: string): { league: string; account: string; name: string } | null {
  const m = text.trim().match(/poe\.ninja\/poe2\/builds\/([^/?#]+)\/character\/([^/?#]+)\/([^/?#]+)/);
  if (!m) return null;
  return { league: decodeURIComponent(m[1]!), account: decodeURIComponent(m[2]!), name: decodeURIComponent(m[3]!) };
}

interface NinjaItem {
  itemData?: {
    frameType?: number;
    inventoryId?: string;
    name?: string;
    typeLine?: string;
    baseType?: string;
    ilvl?: number;
    corrupted?: boolean;
    implicitMods?: string[];
    explicitMods?: string[];
    fracturedMods?: string[];
    desecratedMods?: string[];
    craftedMods?: string[];
    socketedItems?: Array<{ typeLine?: string; socketedItems?: unknown[] }>;
    properties?: Array<{ name?: string; values?: unknown[][] }>;
  };
}

/** 部位 (inventoryId) → 日本語と種類 */
const SLOT: Record<string, [string, BuildItemKind, boolean]> = {
  Weapon: ["武器 (右手)", "equip", false],
  Offhand: ["武器 (左手)", "equip", false],
  Weapon2: ["持ち替え (右手)", "equip", true],
  Offhand2: ["持ち替え (左手)", "equip", true],
  Helm: ["兜", "equip", false],
  BodyArmour: ["胴", "equip", false],
  Gloves: ["手袋", "equip", false],
  Boots: ["靴", "equip", false],
  Amulet: ["アミュレット", "equip", false],
  Ring: ["指輪 1", "equip", false],
  Ring2: ["指輪 2", "equip", false],
  Belt: ["ベルト", "equip", false],
  Flask: ["フラスコ", "flask", false],
  Charm: ["チャーム", "charm", false],
};
const RARITY: Record<number, BuildItem["rarity"]> = { 0: "NORMAL", 1: "MAGIC", 2: "RARE", 3: "UNIQUE", 9: "RELIC", 10: "RELIC" };

function toItem(x: NinjaItem, slot: string, kind: BuildItemKind, swap: boolean): BuildItem | null {
  const d = x.itemData;
  if (!d) return null;
  const rarity = RARITY[d.frameType ?? 0] ?? "NORMAL";
  const hasName = rarity === "RARE" || rarity === "UNIQUE" || rarity === "RELIC";
  const quality = Number(String(d.properties?.find((p) => p.name === "Quality")?.values?.[0]?.[0] ?? "").replace(/[^0-9]/g, "")) || 0;
  return {
    slot,
    swap,
    kind,
    rarity,
    name: hasName ? (d.name ?? "") : (d.typeLine ?? d.name ?? ""),
    base: hasName ? (d.baseType ?? d.typeLine ?? "") : "",
    // 差したルーン (付与スキルの穴 = 中にジェムを持つ物 は除く)
    runes: (d.socketedItems ?? []).filter((s) => !s.socketedItems && s.typeLine).map((s) => s.typeLine!),
    implicits: d.implicitMods ?? [],
    mods: [...(d.fracturedMods ?? []), ...(d.explicitMods ?? []), ...(d.desecratedMods ?? []), ...(d.craftedMods ?? [])],
    corrupted: !!d.corrupted,
    quality,
    itemLevel: d.ilvl ?? 0,
  };
}

/** character の応答 → ParsedBuild */
async function fromCharacter(body: Record<string, unknown>): Promise<ParsedBuild> {
  const pob = body.pathOfBuildingExport;
  if (typeof pob === "string" && pob.length > 100) return parseBuild(await decodePobCode(pob));
  const items: BuildItem[] = [];
  const counts: Record<string, number> = {};
  for (const x of (body.items as NinjaItem[] | undefined) ?? []) {
    const inv = x.itemData?.inventoryId ?? "";
    const s = SLOT[inv];
    if (!s) continue;
    const n = (counts[inv] = (counts[inv] ?? 0) + 1);
    const label = s[1] === "flask" || s[1] === "charm" ? `${s[0]} ${n}` : s[0];
    const it = toItem(x, label, s[1], s[2]);
    if (it) items.push(it);
  }
  let jn = 0;
  for (const x of (body.jewels as NinjaItem[] | undefined) ?? []) {
    const it = toItem(x, `ジュエル ${++jn}`, "jewel", false);
    if (it) items.push(it);
  }
  for (const x of (body.flasks as NinjaItem[] | undefined) ?? []) {
    const it = toItem(x, "フラスコ", "flask", false);
    if (it) items.push(it);
  }
  const gems: BuildGem[] = [];
  for (const g of (body.skills as Array<{ allGems?: Array<{ name?: string; itemData?: { support?: boolean } }> }> | undefined) ?? []) {
    for (const x of g.allGems ?? []) if (x.name) gems.push({ name: x.name, support: !!x.itemData?.support, enabled: true });
  }
  return {
    className: String(body.class ?? body.className ?? ""),
    ascendancy: String(body.ascendancy ?? body.class ?? ""),
    level: Number(body.level ?? 0),
    items,
    gems,
  };
}

/** URL から読む (poe.ninja に 2 回: スナップショットとキャラクター) */
export async function loadFromNinjaUrl(text: string): Promise<ParsedBuild> {
  const u = parseNinjaUrl(text);
  if (!u) throw new Error("poe.ninja のビルドページの URL ではありません");
  if (!isTauriRuntime()) throw new Error("アプリ内でのみ読めます");
  const body = await invoke<Record<string, unknown>>("ninja_build_character", { leagueUrl: u.league, account: u.account, name: u.name });
  return fromCharacter(body);
}
