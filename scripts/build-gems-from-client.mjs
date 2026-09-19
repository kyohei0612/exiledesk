/**
 * build-gems-from-client.mjs
 * --------------------------------------------------------------
 * GGG クライアントから「プレイヤーが使うスキル / スピリット / メタジェム」の一覧を作る。
 * 用途: ジェムコラプト収支 (views/GemCorrupt.vue) のジェム選択と、スキル / スピリットの判定 (2026-09-12)。
 *
 * 出力: src/i18n/gems-client.json
 *   [{ en, ja, kind: "skill" | "meta", spirit, minLevel }]
 *   - kind: ItemClass が Meta Skill Gem なら "meta" (trade2 の category は gem.metagem)、それ以外 "skill" (gem.activegem)。
 *   - spirit: GemTags に persistent があれば true (レベル上げは「スピリットジェムの原石」、なければ「スキルジェムの原石」)。
 *   - buyOnly: CraftingLevel が 0 = 原石から作れない (カルグール系・ドロップ限定など)。素材の
 *     「低レベルのジェム本体」はトレードで現物を買う値段になる (2026-09-19 オーナー指摘)。
 *     専用の GemTag は無く、この列が唯一の手がかり。行が複数ある時は本物 (Metadata/Items/Gems/SkillGem*)
 *     の最大値を採る。武器の既定攻撃 (Metadata/Items/Gem/…PlayerDefault…) とユニーク版は除く。
 *   サポートジェムは対象外。
 *
 * 書き出しは pathofexile-dat を data-cache/client-export-gems/ で実行する (他の書き出しと同じ方式)。
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./client-export-config.mjs";

const EXPORT_DIR = resolve(ROOT, "data-cache/client-export-gems");
const OUT = resolve(ROOT, "src/i18n/gems-client.json");

const CONFIG = {
  steam: "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2",
  translations: ["English", "Japanese"],
  tables: [
    { name: "SkillGems", columns: ["BaseItemType", "GemType", "Tier", "MinLevelReq", "GemEffects"] },
    { name: "BaseItemTypes", columns: ["Id", "Name", "ItemClass", "DropLevel"] },
    { name: "ItemClasses", columns: ["Id", "Name"] },
    { name: "GemEffects", columns: ["Id", "Name", "GemTags"] },
    { name: "GemTags", columns: ["Id", "Name"] },
  ],
};

async function exportTables() {
  await mkdir(EXPORT_DIR, { recursive: true });
  const base = JSON.parse(await readFile(resolve(ROOT, "data-cache/client-export/config.json"), "utf8"));
  const config = { ...CONFIG, steam: base.steam ?? CONFIG.steam };
  if (base.patch) {
    delete config.steam;
    config.patch = base.patch;
  }
  await writeFile(resolve(EXPORT_DIR, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf8");
  const pkgPath = resolve(ROOT, "node_modules/pathofexile-dat/package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const binRel = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin)[0];
  const r = spawnSync(process.execPath, [resolve(dirname(pkgPath), binRel)], { cwd: EXPORT_DIR, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`pathofexile-dat exited with ${r.status}`);
}

async function loadTable(lang, name) {
  return JSON.parse(await readFile(resolve(EXPORT_DIR, "tables", lang, `${name}.json`), "utf8"));
}

if (!process.argv.includes("--offline")) await exportTables();

const sg = await loadTable("English", "SkillGems");
const bE = await loadTable("English", "BaseItemTypes");
const bJ = await loadTable("Japanese", "BaseItemTypes");
const ic = await loadTable("English", "ItemClasses");
const ge = await loadTable("English", "GemEffects");
const gt = await loadTable("English", "GemTags");

const tagsOf = (g) => new Set((g.GemEffects ?? []).flatMap((e) => (ge[e]?.GemTags ?? []).map((t) => gt[t]?.Id)));

const out = [];
const byName = new Map();
for (const g of sg) {
  const b = bE[g.BaseItemType];
  if (!b) continue;
  const id = b.Id ?? "";
  // 本物のジェムは Metadata/Items/Gems/ と Metadata/Items/Gem/ (単数) の 2 系統に散らばっている
  // (トリニティ / ブリンク / アーチメイジは単数側)。除くのは:
  //   - 武器の既定攻撃 (…SkillGemPlayerDefault…): 買えも直せもしない (ジェム一覧に 13 個混ざっていた)
  //   - ユニーク版 (UniqueSkillGem*): 同名の別行で、原石の段 (CraftingLevel) を持たない
  if (/PlayerDefault/.test(id) || /\/UniqueSkillGem/.test(id)) continue;
  const cls = ic[b.ItemClass]?.Id;
  if (cls !== "Active Skill Gem" && cls !== "Meta Skill Gem") continue;
  const en = (b.Name ?? "").trim();
  const ja = (bJ[g.BaseItemType]?.Name ?? "").trim();
  if (!en || en.startsWith("[DNT") || en.startsWith("[UNUSED")) continue;
  const tags = tagsOf(g);
  const kind = cls === "Meta Skill Gem" ? "meta" : "skill";
  const craft = g.CraftingLevel ?? 0;
  const prev = byName.get(en);
  if (prev) {
    // 同名の行が複数ある時は原石の段が分かる方 (CraftingLevel の大きい方) を採る
    if (craft > prev.craft) prev.craft = craft;
    continue;
  }
  byName.set(en, { en, ja: ja || en, kind, spirit: tags.has("persistent"), minLevel: g.MinLevelReq ?? 0, craft });
}
for (const g of byName.values()) {
  const { craft, ...rest } = g;
  out.push(craft === 0 ? { ...rest, buyOnly: true } : rest);
}
out.sort((a, b) => a.ja.localeCompare(b.ja, "ja"));
await writeFile(OUT, JSON.stringify(out, null, 0) + "\n", "utf8");
const kinds = out.reduce((m, g) => ((m[g.kind] = (m[g.kind] ?? 0) + 1), m), {});
const spirit = out.filter((g) => g.spirit).length;
const buyOnly = out.filter((g) => g.buyOnly).length;
console.log(`[build-gems] ${out.length} gems (${JSON.stringify(kinds)}, spirit=${spirit}, buyOnly=${buyOnly}) -> ${OUT}`);
