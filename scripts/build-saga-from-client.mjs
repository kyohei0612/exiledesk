/**
 * build-saga-from-client.mjs
 * --------------------------------------------------------------
 * 「アルダーの航路」(Aldur's Saga planner) 用のマップ一覧を GGG クライアントから作る (2026-09-12)。
 *
 *   噂 (rumour) とマップの対応はゲーム内で観測されている固定の組 (RUMOURS)。クライアントには噂の文言が
 *   テーブルとして入っていない (NPCTextAudio / ClientStrings / BaseItemTypes を確認済み) ので英語の噂だけ持つ。
 *   マップ名 (日英) · エリアレベル · ユニークマップ判定 · ボス名 (日英) はクライアント WorldAreas / MonsterVarieties から。
 *
 * 出力: src/i18n/saga-routes.json
 *   [{ mapEn, mapJa, rumourEn, kind: "grand" | "unique" | "boss", level, bosses: [{en, ja}] }]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./client-export-config.mjs";

const EXPORT_DIR = resolve(ROOT, "data-cache/client-export-saga");
const OUT = resolve(ROOT, "src/i18n/saga-routes.json");

/** 噂 → マップ (英語名はクライアント WorldAreas.Name に合わせる) */
const RUMOURS = [
  { mapEn: "Moor of Fallen Skies", rumourEn: "Fallen stars…", kind: "grand" },
  { mapEn: "Frigid Bluffs", rumourEn: "Cold as ice…", kind: "grand" },
  { mapEn: "Stagnant Basin", rumourEn: "Nothing to drink…", kind: "grand" },
  { mapEn: "Craggy Peninsula", rumourEn: "Endless cliffs…", kind: "grand" },
  { mapEn: "Scorched Cay", rumourEn: "Sulphite!", kind: "grand" },
  { mapEn: "Bleached Shoals", rumourEn: "Something fishy…", kind: "grand" },
  { mapEn: "Exhumed Ruins", rumourEn: "Unknown ruins…", kind: "grand" },
  { mapEn: "Lush Isle", rumourEn: "Warm but risky…", kind: "grand" },
  { mapEn: "Sloughed Gully", rumourEn: "It's dry at least…", kind: "grand" },
  { mapEn: "Grazed Prairie", rumourEn: "Wild, roaming free…", kind: "grand" },
  { mapEn: "Barren Atoll", rumourEn: "Bleak and awful…", kind: "grand" },
  { mapEn: "The Fractured Lake", rumourEn: "Reflective waters…", kind: "unique" },
  { mapEn: "Castaway", rumourEn: "All that glitters…", kind: "unique" },
  { mapEn: "Untainted Paradise", rumourEn: "Almost paradise…", kind: "unique" },
  { mapEn: "Moment of Zen", rumourEn: "A good fellow…", kind: "unique" },
  { mapEn: "Secluded Temple", rumourEn: "Stardrinker…", kind: "boss" },
  { mapEn: "Obscure Island", rumourEn: "Origin of the fall…", kind: "boss" },
  { mapEn: "Mournful Cliffside", rumourEn: "Last to fall…", kind: "boss" },
  { mapEn: "Sprawling Jungle", rumourEn: "End of the circle…", kind: "boss" },
];

const CONFIG = {
  steam: "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2",
  translations: ["English", "Japanese"],
  tables: [
    { name: "WorldAreas", columns: ["Id", "Name", "AreaLevel", "IsMapArea", "IsUniqueMapArea", "Bosses_MonsterVarietiesKeys"] },
    { name: "MonsterVarieties", columns: ["Id", "Name"] },
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

const WA = await loadTable("English", "WorldAreas");
const WAj = await loadTable("Japanese", "WorldAreas");
const MV = await loadTable("English", "MonsterVarieties");
const MVj = await loadTable("Japanese", "MonsterVarieties");

const out = [];
for (const r of RUMOURS) {
  // 同名エリアが複数ある (キャンペーン版 / マップ版) ので IsMapArea かつ最高レベルを採る
  const cands = WA.map((w, i) => ({ w, i })).filter(({ w }) => w.Name === r.mapEn);
  if (cands.length === 0) {
    console.warn(`[build-saga] WorldAreas に無い: ${r.mapEn}`);
    continue;
  }
  cands.sort((a, b) => (b.w.IsMapArea ? 1 : 0) - (a.w.IsMapArea ? 1 : 0) || (b.w.AreaLevel ?? 0) - (a.w.AreaLevel ?? 0));
  const { w, i } = cands[0];
  const bosses = [...new Set(w.Bosses_MonsterVarietiesKeys ?? [])]
    .map((k) => ({ en: MV[k]?.Name ?? "", ja: MVj[k]?.Name ?? "" }))
    .filter((b) => b.en && !b.en.startsWith("[DNT"));
  out.push({
    mapEn: r.mapEn,
    mapJa: WAj[i]?.Name ?? r.mapEn,
    rumourEn: r.rumourEn,
    kind: r.kind,
    level: w.AreaLevel ?? null,
    uniqueMap: !!w.IsUniqueMapArea,
    bosses,
  });
}
await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`[build-saga] ${out.length}/${RUMOURS.length} maps -> ${OUT}`);
