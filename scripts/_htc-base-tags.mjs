/**
 * _htc-base-tags.mjs — 「このベースにどの MOD が出るか」を決めるタグ (2026-09-22)
 *
 * `build-htc-bases-from-client.mjs` から切り出し。クラス由来のタグ表 (CLASS_TAGS)、
 * spawn_weights の読み方、ルーンが足すタグ、扱わないベースの判定を持つ。
 *
 * **CLASS_TAGS を勘で足さないこと。** 足したら生成側の検算 (1137 ファミリ = 100%) が
 * 落ちないのを必ず見る。
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, rj, rows } from "./_htc-client-tables.mjs";

/**
 * ItemClasses.Id -> そのクラスの全ベースが持つタグ。
 *
 * クライアントの `BaseItemTypes.Tags` には**クラス由来のタグが入っていない**。`helmet` も
 * `armour` も `two_hand_weapon` も、`InheritsFrom` が指す抽象アイテム側にあり、そこは .dat に
 * 行として出てこない (`Metadata/.../AbstractGloves` を引いても無い)。上流 POE2HTC も同じ理由で
 * `variants.mjs` に手書きの表を持っている。
 *
 * **勘で足さないこと。** 足したら検算の 100% が落ちないのを見る。
 * 実例: Focus に `shield` を足すと落ちる (先に `shield:0` を踏む)、`armour` は要る (耐性が出る)。
 */
const CLASS_TAGS = {
  Helmet: ["helmet", "armour"],
  "Body Armour": ["body_armour", "armour"],
  Gloves: ["gloves", "armour"],
  Boots: ["boots", "armour"],
  Ring: ["ring"],
  Amulet: ["amulet"],
  Belt: ["belt"],
  Quiver: ["quiver"],
  Focus: ["focus", "armour"],
  Shield: ["shield", "armour"],
  Buckler: ["shield", "armour"],
  Wand: ["wand", "one_hand_weapon", "weapon"],
  Sceptre: ["sceptre", "one_hand_weapon", "weapon"],
  "One Hand Mace": ["mace", "one_hand_weapon", "weapon"],
  "Two Hand Mace": ["mace", "two_hand_weapon", "weapon"],
  Bow: ["bow", "two_hand_weapon", "weapon", "ranged"],
  Crossbow: ["crossbow", "two_hand_weapon", "weapon", "ranged"],
  Staff: ["staff", "two_hand_weapon", "weapon"],
  Warstaff: ["warstaff", "staff", "two_hand_weapon", "weapon"],
  Spear: ["spear", "one_hand_weapon", "weapon"],
  Talisman: ["talisman", "two_hand_weapon", "weapon"],
};

/** ゲームと同じ判定: spawn_weights を先頭から見て、装備タグに最初に一致した項目の重み */
function weightOn(mod, tagSet) {
  for (const sw of mod.spawn_weights || []) if (tagSet.has(sw.tag)) return sw.weight;
  return 0;
}

/** family (排他グループ)。上流と同じ RePoE 流のグループ名 */
const familyOf = (m) => (m.groups || [])[0] || m.type || null;

/** クラスの持ち物を表す署名。ベース固有のタグ (産地 / ルーン鍛造) は行き先を変えないので外す */
const signatureTags = (tagSet) =>
  [...tagSet].filter((t) => !/_basetype$/.test(t) && t !== "runeforged" && t !== "default").sort();
const signature = (tagSet) => signatureTags(tagSet).join("+");

/**
 * ItemClasses.Id -> 同梱データの行の呼び方。新しいクラスの id を上流と同じ流儀で付けるため。
 * 例: Helmet + str_dex_int_armour -> `Helmets_str_dex_int` (同梱の `Helmets_str_int` と揃う)
 */
const ROW_NAME = {
  Helmet: "Helmets",
  "Body Armour": "Body_Armours",
  Gloves: "Gloves",
  Boots: "Boots",
  Shield: "Shields",
  Buckler: "Bucklers",
  Focus: "Foci",
  Ring: "Rings",
  Amulet: "Amulets",
  Belt: "Belts",
  Quiver: "Quivers",
  Wand: "Wands",
  Sceptre: "Sceptres",
  "One Hand Mace": "OneHand_Maces",
  "Two Hand Mace": "TwoHand_Maces",
  Bow: "Bows",
  Crossbow: "Crossbows",
  Staff: "Staves",
  Warstaff: "Quarterstaves",
  Spear: "Spears",
  Talisman: "Talismans",
};

/**
 * ルーンを差して初めて出る MOD のプール。
 *
 * **ルーンは MOD を直接くれるのではなく、アイテムに「タグ」を足します** (2026-09-22 にクライアントで確認)。
 * `SoulCoreStats` でルーンが持つ stat は `warping_rune_add_item_tag_N` で、その N → タグは
 * `Expedition2WarpingRuneStatToTag` に載っている。タグが付いたアイテムは、そのタグに重みを持つ
 * MOD を引けるようになる ── つまり**差した後の抽選が全部そのプール込みになる**。
 *
 * `tag` はその表と突き合わせて検算します (合わなければ落ちる)。`classes` はどのベースに載るかで、
 * クライアント側に表が無いので `engine/runes.ts` の `categories` と同じ物を手で置いています。
 */
const RUNE_POOLS = [
  { id: "thruds-might", name: "Thrud's Might", tag: "destruction", classes: ["Wand", "Sceptre", "Staff", "Bow", "Crossbow", "Warstaff", "Spear", "One Hand Mace", "Two Hand Mace", "Talisman"] },
  { id: "uhtreds-sidereus", name: "Uhtred's Sidereus", tag: "chronomancy", classes: ["Boots"] },
  { id: "kolrs-hunt", name: "Kolr's Hunt", tag: "marksman", classes: ["Gloves"] },
  { id: "katlas-gloom", name: "Katla's Gloom", tag: "decay", classes: ["Gloves"] },
  { id: "voranas-carnage", name: "Vorana's Carnage", tag: "berserking", classes: ["Helmet"] },
  { id: "medveds-tending", name: "Medved's Tending", tag: "soul", classes: ["Body Armour"] },
];

/**
 * 上の `tag` をクライアントの表で検算する。書き出しが無い時は飛ばす (その旨を出す)。
 * 合わなければ**落とす**: タグが 1 つ違うだけで、そのルーンのプールが丸ごと別物になる。
 */
async function verifyRuneTags() {
  const dir = resolve(ROOT, "data-cache/client-export-runes/tables/English");
  let W, ST, SCS, SC, B;
  try {
    const rd = async (n) => {
      const j = JSON.parse(await readFile(resolve(dir, `${n}.json`), "utf8"));
      return Array.isArray(j) ? j : j.rows;
    };
    [W, ST, SCS, SC, B] = await Promise.all([
      rd("Expedition2WarpingRuneStatToTag"), rd("Stats"), rd("SoulCoreStats"), rd("SoulCores"), rd("BaseItemTypes"),
    ]);
  } catch {
    console.log("ルーンのタグ表 (data-cache/client-export-runes) がありません。タグの検算は飛ばします。");
    return;
  }
  const TG = JSON.parse(await readFile(resolve(dir, "Tags.json"), "utf8"));
  const tags = Array.isArray(TG) ? TG : TG.rows;
  const statToTag = new Map(W.map((r) => [(ST[r.Stat] || {}).Id, (tags[r.Tag] || {}).Id]));
  const plain = (s) => (s || "").replace(/[’']/g, "'").toLowerCase();
  const bad = [];
  for (const rp of RUNE_POOLS) {
    const i = SC.findIndex((r) => plain((B[r.BaseItemType] || {}).Name) === plain(rp.name));
    if (i < 0) {
      bad.push(`${rp.id}: クライアントに "${rp.name}" が無い`);
      continue;
    }
    const got = SCS.filter((s) => s.SoulCore === i)
      .flatMap((s) => (s.Stats || []).map((x) => statToTag.get((ST[x] || {}).Id)))
      .filter(Boolean);
    if (!got.includes(rp.tag)) bad.push(`${rp.id}: 表では ${got.join(",") || "(タグ無し)"} なのに ${rp.tag} と書いてある`);
  }
  if (bad.length) {
    console.log("NG: ルーンのタグがクライアントと合いません");
    for (const b of bad) console.log(`   ${b}`);
    process.exit(1);
  }
  console.log(`ルーンのタグ ${RUNE_POOLS.length} 件: クライアントの表と一致`);
}

/**
 * 作らないベース。
 * - `demigods` / `not_for_sale` … デミゴッド装備。落ちも売りもせず、クラフトの対象外
 * - `[DNT]` … 開発用 (Do Not Trade)。ゲームに出ない
 */
const isSkippedBase = (name, id, tags) =>
  name.startsWith("[DNT]") || /Demigod/i.test(id || "") || tags.has("demigods") || tags.has("not_for_sale");

export { CLASS_TAGS, RUNE_POOLS, weightOn, familyOf, signatureTags, signature, ROW_NAME, verifyRuneTags, isSkippedBase };
