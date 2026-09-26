/**
 * PoB (Path of Building) のビルドコードを読む (2026-09-26、忍者ビルドコピー)
 *
 * オーナー:「ビルドを真似するときに忍者の UI 使いづらすぎて、こっちのアプリでコピペしたい」。
 * poe.ninja のビルドページの「PoB のコード」は、XML を zlib で圧縮して base64url にした物。
 * ここで展開して、装備 (部位つき)・ジュエル (ツリーの穴)・差したルーン・ジェムを取り出す。
 */

export type BuildItemKind = "equip" | "jewel" | "flask" | "charm";

export interface BuildItem {
  /** 部位の日本語 (「兜」「ジュエル」…) */
  slot: string;
  /** 持ち替え側の武器か */
  swap: boolean;
  kind: BuildItemKind;
  rarity: "NORMAL" | "MAGIC" | "RARE" | "UNIQUE" | "RELIC";
  /** 名前 (ユニーク / レアは固有名、マジックは全体の名前) */
  name: string;
  /** ベース (マジックは空のことがある) */
  base: string;
  runes: string[];
  implicits: string[];
  /** 明示 MOD (ルーン・エンチャントの行は除く) */
  mods: string[];
  corrupted: boolean;
  /** 聖別済み (MOD の数値が 78%〜122% に振り直されている) */
  sanctified: boolean;
  quality: number;
  itemLevel: number;
}

export interface BuildGem {
  name: string;
  support: boolean;
  enabled: boolean;
}

export interface ParsedBuild {
  className: string;
  ascendancy: string;
  level: number;
  items: BuildItem[];
  gems: BuildGem[];
}

/** base64url → zlib 展開 → XML 文字列 */
export async function decodePobCode(code: string): Promise<string> {
  const clean = code.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return await new Response(stream).text();
}

/** PoB の部位 → 日本語 (並びもこの順) */
const SLOTS: Array<[string, string, BuildItemKind]> = [
  ["Weapon 1", "武器 (右手)", "equip"],
  ["Weapon 2", "武器 (左手)", "equip"],
  ["Helmet", "兜", "equip"],
  ["Body Armour", "胴", "equip"],
  ["Gloves", "手袋", "equip"],
  ["Boots", "靴", "equip"],
  ["Amulet", "アミュレット", "equip"],
  ["Ring 1", "指輪 1", "equip"],
  ["Ring 2", "指輪 2", "equip"],
  ["Ring 3", "指輪 3", "equip"],
  ["Belt", "ベルト", "equip"],
  ["Weapon 1 Swap", "持ち替え (右手)", "equip"],
  ["Weapon 2 Swap", "持ち替え (左手)", "equip"],
  ["Flask 1", "フラスコ 1", "flask"],
  ["Flask 2", "フラスコ 2", "flask"],
  ["Charm 1", "チャーム 1", "charm"],
  ["Charm 2", "チャーム 2", "charm"],
  ["Charm 3", "チャーム 3", "charm"],
];

/** 1 アイテムの文面 (PoB の Item の中身) を読む */
function parseItemText(text: string): Omit<BuildItem, "slot" | "swap" | "kind"> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rarity = ((lines[0] ?? "").replace("Rarity: ", "").trim() || "NORMAL") as BuildItem["rarity"];
  const name = lines[1] ?? "";
  // マジック / ノーマルは 2 行目が全体の名前で、ベースの行が無い
  const hasBase = rarity === "RARE" || rarity === "UNIQUE" || rarity === "RELIC";
  const base = hasBase ? (lines[2] ?? "") : "";
  const runes: string[] = [];
  let quality = 0;
  let itemLevel = 0;
  let corrupted = false;
  let sanctified = false;
  let implicitCount = 0;
  let i = hasBase ? 3 : 2;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    const m = l.match(/^Implicits: (\d+)$/);
    if (m) {
      implicitCount = Number(m[1]);
      i++;
      break;
    }
    if (l.startsWith("Rune: ")) runes.push(l.slice(6));
    else if (l.startsWith("Quality: ")) quality = Number(l.slice(9)) || 0;
    else if (l.startsWith("Item Level: ")) itemLevel = Number(l.slice(12)) || 0;
  }
  const rest = lines.slice(i).filter((l) => !l.startsWith("<"));
  const implicits: string[] = [];
  const mods: string[] = [];
  rest.forEach((l, j) => {
    if (l === "Corrupted") {
      corrupted = true;
      return;
    }
    if (l === "Sanctified") {
      sanctified = true;
      return;
    }
    // {enchant}{rune} の行はルーンの効果 (値段はルーンの側で数える)
    const plain = l.replace(/\{[^}]*\}/g, "").trim();
    if (!plain) return;
    if (j < implicitCount) {
      if (!l.includes("{rune}") && !l.includes("{enchant}")) implicits.push(plain);
      return;
    }
    mods.push(plain);
  });
  return { rarity, name, base, runes, implicits, mods, corrupted, sanctified, quality, itemLevel };
}

const unescape = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function parseBuild(xml: string): ParsedBuild {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const b = doc.querySelector("Build");
  const itemText = new Map<string, string>();
  for (const it of doc.querySelectorAll("Items > Item")) {
    // 子要素 (ModRange など) を除いた本文
    const txt = [...it.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("\n");
    itemText.set(it.getAttribute("id") ?? "", unescape(txt));
  }
  const slotOf = new Map<string, string>();
  for (const s of doc.querySelectorAll("Items Slot, ItemSet Slot")) {
    const id = s.getAttribute("itemId") ?? "0";
    if (id !== "0" && !slotOf.has(s.getAttribute("name") ?? "")) slotOf.set(s.getAttribute("name") ?? "", id);
  }
  const items: BuildItem[] = [];
  for (const [pob, ja, kind] of SLOTS) {
    const id = slotOf.get(pob);
    const txt = id ? itemText.get(id) : undefined;
    if (!txt) continue;
    items.push({ slot: ja, swap: pob.includes("Swap"), kind, ...parseItemText(txt) });
  }
  // ジュエル: 使っているツリー (activeSpec) の穴
  const specs = [...doc.querySelectorAll("Tree > Spec")];
  const active = Number(doc.querySelector("Tree")?.getAttribute("activeSpec") ?? "1");
  const spec = specs[active - 1] ?? specs[0];
  let jn = 0;
  for (const s of spec?.querySelectorAll("Socket") ?? []) {
    const txt = itemText.get(s.getAttribute("itemId") ?? "");
    if (!txt) continue;
    items.push({ slot: `ジュエル ${++jn}`, swap: false, kind: "jewel", ...parseItemText(txt) });
  }
  const gems: BuildGem[] = [...doc.querySelectorAll("Skills Gem")].map((g) => ({
    name: unescape(g.getAttribute("nameSpec") ?? ""),
    support: (g.getAttribute("gemId") ?? "").includes("Support") || (g.getAttribute("skillId") ?? "").startsWith("Support"),
    enabled: g.getAttribute("enabled") !== "false",
  }));
  return {
    className: b?.getAttribute("className") ?? "",
    ascendancy: b?.getAttribute("ascendClassName") ?? "",
    level: Number(b?.getAttribute("level") ?? "0"),
    items,
    gems,
  };
}
