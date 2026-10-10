// ベースのカード (ゲームのアイテム画面と同じ中身) に出す物をクライアントの表から作る (2026-10-10)。
// オーナー「ベースについてるスキルとか暗黙とか色々足りてなくね、手抜きやめてくれ」「ゲームで表示通りに」。
// 元: data-cache/client-export-baseinfo (npx pathofexile-dat、config.json) の BaseItemTypes / AttributeRequirements / ItemSpirit /
//     WeaponTypes / ShieldTypes / ItemInherentSkills / SkillGems。数値の防御 (アーマー等) と暗黙は今までの所 (stage-bases / htcBaseInfo)
// 出力: src/data/base-info.json { 英語名: { lv, str, dex, int, spirit, reload, range, block, skills: [ジェムの英語名] } }
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = (name) => JSON.parse(readFileSync(join(root, "data-cache/client-export-baseinfo/tables/English", `${name}.json`), "utf8"));
const bit = T("BaseItemTypes");
const nameOf = (i) => bit[i]?.Name ?? null;
const out = {};
const row = (i) => {
  const n = nameOf(i);
  if (!n) return null;
  return (out[n] ??= { lv: bit[i].DropLevel ?? 0 });
};
for (const r of T("AttributeRequirements")) {
  const o = row(r.BaseItemType);
  if (!o) continue;
  if (r.ReqStr) o.str = r.ReqStr;
  if (r.ReqDex) o.dex = r.ReqDex;
  if (r.ReqInt) o.int = r.ReqInt;
}
for (const r of T("ItemSpirit")) { const o = row(r.BaseItemType); if (o && r.SpiritGranted) o.spirit = r.SpiritGranted; }
for (const r of T("WeaponTypes")) {
  const o = row(r.BaseItemType);
  if (!o) continue;
  if (r.ReloadTime) o.reload = r.ReloadTime;
  if (r.RangeMax) o.range = r.RangeMax;
}
for (const r of T("ShieldTypes")) { const o = row(r.BaseItemType); if (o && r.Block) o.block = r.Block; }
const gems = T("SkillGems");
for (const r of T("ItemInherentSkills")) {
  const o = row(r.BaseItemType);
  if (!o) continue;
  const skills = (r.SkillsGranted ?? []).map((g) => nameOf(gems[g]?.BaseItemType)).filter(Boolean);
  if (skills.length) o.skills = skills;
}
// 何も足さない (装備条件も無い) 物は外す
for (const [k, v] of Object.entries(out)) if (Object.keys(v).length <= 1 && !v.lv) delete out[k];
writeFileSync(join(root, "src/data/base-info.json"), JSON.stringify(out) + "\n");
console.log(`base-info: ${Object.keys(out).length} 件 (スキル付き ${Object.values(out).filter((v) => v.skills).length}、スピリット ${Object.values(out).filter((v) => v.spirit).length})`);
