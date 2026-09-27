// ベースの付与スキル (ItemInherentSkills) の表 (2026-09-27)
//
// オーナー:「指輪やらアミュにスキル付与されてるアミュレットとかはベース解析して何がつくかと、つけるもの選べるようにしないと検索で出ないぞ」。
// 不在のアミュレットなどは付与スキルが複数の候補から 1 つ付き、取引所ではその付与スキルで別物になる。
// 元: data-cache/client-export-inherent (pathofexile-dat。ItemInherentSkills / SkillGems / BaseItemTypes / ItemClasses)
// 出力: src/i18n/inherent-skills.json  { ベース英語名: [{ en, ja }, ...] }  候補が 2 つ以上の物だけ (1 つならベースで決まる)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = (lang, name) => JSON.parse(readFileSync(join(root, "data-cache/client-export-inherent/tables", lang, `${name}.json`), "utf8"));
const I = T("English", "ItemInherentSkills");
const S = T("English", "SkillGems");
const B = T("English", "BaseItemTypes");
const BJ = T("Japanese", "BaseItemTypes");
const out = {};
for (const r of I) {
  const base = B[r.BaseItemType];
  if (!base || base.Name.startsWith("[DNT]")) continue;
  const ids = (Array.isArray(r.SkillsGranted) ? r.SkillsGranted : [r.SkillsGranted]).filter((x) => x != null);
  const skills = ids.map((x) => ({ en: B[S[x].BaseItemType].Name, ja: BJ[S[x].BaseItemType].Name })).filter((s) => !s.en.startsWith("[DNT]"));
  if (skills.length >= 2) out[base.Name] = skills;
}
writeFileSync(join(root, "src/i18n/inherent-skills.json"), JSON.stringify(out, null, 1) + "\n");
console.log(Object.entries(out).map(([k, v]) => `${k} ${v.length}`).join(" / "));
