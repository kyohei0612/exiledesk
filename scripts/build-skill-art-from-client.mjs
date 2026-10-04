#!/usr/bin/env node
/**
 * build-skill-art-from-client.mjs — スキル・ジェム・ルーンの絵をクライアントから取り出す (2026-09-29、POE2Tube 要望 ⑰-1 / ⑰-6)
 *
 * kyohei「スキルの画像もいる、ジェムかスキルの画像」。やり方は build-base-art-from-client.mjs と同じ
 * (pathofexile-dat の読み込み部分で Steam のクライアントから DDS を取り出し、ffmpeg で webp。RGBA の DDS は赤青を入れ替える)。通信しない。
 *   - ジェム: vendor の PoB の Data/Gems.lua (ゲーム内 ID・名前・スキル・タグ・必要な能力値 = 色)
 *       スキルのアイコン = PoB の Data/Skills/*.lua の skills[grantedEffectId].icon (Art/2DArt/SkillIcons/…)
 *       ジェムの絵 = クライアントの BaseItemTypes (Id = ゲーム内 ID) → ItemVisualIdentity.DDSFile (Art/2DItems/Gems/…)。原石 (Uncut) 3 種も
 *     → public/skill-art/<id>_icon.webp / <id>_gem.webp と src/services/craft-stage/skill-art.json
 *        [{ id, en, ja, color: red|green|blue|white, support, tags, icon, gem }]
 *   - ルーン: stage-runes.json の dds → public/rune-art/<id>.webp と src/services/craft-stage/rune-art.json (英語名 → ファイル名)
 *   - PoB に無いジェムはクライアントの表から (SkillGems / GemEffects / GrantedEffects / ActiveSkills / SupportGems / GemTags、2026-10-04)
 *   (cd data-cache/client-export-art && npx pathofexile-dat) && node scripts/build-skill-art-from-client.mjs
 */
import * as loaders from "../node_modules/pathofexile-dat/dist/cli/bundle-loaders.js";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const T = (n) => { const j = JSON.parse(readFileSync(resolve(ROOT, `data-cache/client-export-art/tables/English/${n}.json`), "utf8")); return Array.isArray(j) ? j : j.rows; };
const B = T("BaseItemTypes");
const V = T("ItemVisualIdentity");
const STEAM = "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2";
const POB = resolve(ROOT, "vendor/PathOfBuilding-PoE2/src/Data");
const HEIGHT = 128;

// ---- PoB のジェムとスキルのアイコン ----
const gemsLua = readFileSync(join(POB, "Gems.lua"), "utf8");
const gems = [];
for (const m of gemsLua.matchAll(/\["(Metadata\/Items\/Gems\/[^"]+)"\] = \{([\s\S]*?)\n\t\},/g)) {
  const body = m[2];
  const s = (k) => new RegExp(String.raw`\n\t\t${k} = "([^"]*)"`).exec(body)?.[1] ?? null;
  const n = (k) => Number(new RegExp(String.raw`\n\t\t${k} = (\d+)`).exec(body)?.[1] ?? 0);
  const tags = [...(/tags = \{([\s\S]*?)\n\t\t\}/.exec(body)?.[1] ?? "").matchAll(/(\w+) = true/g)].map((x) => x[1]);
  gems.push({ gameId: m[1], name: s("name"), effect: s("grantedEffectId"), tagString: s("tagString"), tags, str: n("reqStr"), dex: n("reqDex"), int: n("reqInt") });
}
const icons = new Map();
for (const f of readdirSync(join(POB, "Skills")).filter((x) => x.endsWith(".lua"))) {
  const t = readFileSync(join(POB, "Skills", f), "utf8");
  for (const m of t.matchAll(/skills\["([^"]+)"\] = \{[\s\S]*?\n\ticon = "([^"]+)"/g)) if (!icons.has(m[1])) icons.set(m[1], m[2]);
}
const itemsJa = JSON.parse(readFileSync(resolve(ROOT, "src/i18n/items-ja-client.json"), "utf8"));
const gemsJa = new Map(JSON.parse(readFileSync(resolve(ROOT, "src/i18n/gems-client.json"), "utf8")).map((g) => [g.en, g.ja]));
const artById = new Map(B.map((b) => [b.Id, V[b.ItemVisualIdentity]?.DDSFile ?? null]));
// PoB のゲーム内 ID はクライアントと綴りが違う物がある (SkillGemInfernallCry 等) ので、無ければジェムの名前で引く
const artByGemName = new Map();
for (const b of B) {
  const f = V[b.ItemVisualIdentity]?.DDSFile;
  if (f && /^Metadata\/Items\/Gems?\//.test(b.Id) && !artByGemName.has(b.Name)) artByGemName.set(b.Name, f);
}
const colorOf = (g) => { const mx = Math.max(g.str, g.dex, g.int); return mx === 0 ? "white" : mx === g.str ? "red" : mx === g.dex ? "green" : "blue"; };

// ---- 取り出し ----
const loader = await loaders.FileLoader.create(new loaders.CachingBundleLoader(new loaders.SteamBundleLoader(STEAM)));
const tmp = join(tmpdir(), "exiledesk-skill-art");
mkdirSync(tmp, { recursive: true });
let fail = 0;
/** DDS 1 枚を webp に (同じ DDS は 1 回だけ) */
const done = new Map();
async function toWebp(file, dir, id) {
  if (done.has(`${dir}|${file}`)) return done.get(`${dir}|${file}`);
  try {
    const src = join(tmp, "in.dds");
    const buf = Buffer.from(await loader.getFileContents(file));
    writeFileSync(src, buf);
    const dx10 = buf.toString("latin1", 84, 88) === "DX10";
    const dxgi = dx10 ? buf.readUInt32LE(128) : 0;
    const swap = dxgi >= 27 && dxgi <= 29 ? "colorchannelmixer=rr=0:rb=1:bb=0:br=1," : "";
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", src, "-vf", `${swap}scale=-1:${HEIGHT}`, "-c:v", "libwebp", "-quality", "85", join(dir, `${id}.webp`)]);
    done.set(`${dir}|${file}`, id);
    return id;
  } catch (e) {
    fail++;
    console.log(`取れない: ${file} ${String(e.message).split("\n")[0]}`);
    done.set(`${dir}|${file}`, null);
    return null;
  }
}
const safe = (s) => s.replace(/[^A-Za-z0-9]+/g, "_");

// スキル・ジェム
const SKILL = resolve(ROOT, "public/skill-art");
rmSync(SKILL, { recursive: true, force: true });
mkdirSync(SKILL, { recursive: true });
const list = [];
const seen = new Set();
for (const g of gems) {
  if (!g.name || seen.has(g.name)) continue;
  const id = safe(g.gameId.replace("Metadata/Items/Gems/", ""));
  const iconDds = g.effect ? icons.get(g.effect) : null;
  const gemDds = artById.get(g.gameId) ?? artByGemName.get(g.name);
  const icon = iconDds ? await toWebp(iconDds, SKILL, `${id}_icon`) : null;
  const gem = gemDds ? await toWebp(gemDds, SKILL, `${id}_gem`) : null;
  // 絵が取れなかった物は、下のクライアントの表からもう一度探す (2026-10-04: ブリンクは PoB の表にあるがアイコンが引けず、印だけ付いて漏れていた)
  if (!icon && !gem) continue;
  seen.add(g.name);
  list.push({ id, en: g.name, ja: gemsJa.get(g.name) ?? itemsJa[g.name] ?? g.name, color: colorOf(g), support: g.tags.includes("support"), tags: g.tagString ? g.tagString.split(", ") : [], icon, gem });
}
// ---- PoB に無いジェム (2026-10-04: ブリンク・新しいリネージュ (ウートレドの前兆・アッツィリの交感 等) が PoB の表に無く、火力チェックで
// アイコンもカードも出なかった)。クライアントの表 SkillGems → GemEffects → GrantedEffects → ActiveSkills.Icon_DDSFile (アクティブ) /
// SupportGems.Icon (サポート)。サポートの「Blank○○Support」は色だけの仮の絵なので使わず、ジェムの絵に落とす
const SG = T("SkillGems"), GE = T("GemEffects"), GRE = T("GrantedEffects"), AS = T("ActiveSkills"), SUP = T("SupportGems"), GT = T("GemTags");
const supByGem = new Map(SUP.map((x) => [x.SkillGem, x]));
for (const [idx, sg] of SG.entries()) {
  const b = B[sg.BaseItemType];
  const en = b?.Name;
  // 新しいジェムは「Metadata/Items/Gem/」(単数) の下にある (ブリンク等)
  if (!en || seen.has(en) || !/^Metadata\/Items\/Gems?\//.test(b.Id)) continue;
  const ge = Array.isArray(sg.GemEffects) && sg.GemEffects.length ? GE[sg.GemEffects[0]] : null;
  const gr = ge?.GrantedEffect != null ? GRE[ge.GrantedEffect] : null;
  const sup = supByGem.get(idx);
  const support = !!gr?.IsSupport || !!sup;
  let iconDds = support ? (sup?.Icon ?? null) : (gr?.ActiveSkill != null ? AS[gr.ActiveSkill]?.Icon_DDSFile ?? null : null);
  if (iconDds && /\/Blank[A-Za-z]*Support\.dds$/.test(iconDds)) iconDds = null;
  const gemDds = artById.get(b.Id) ?? artByGemName.get(en);
  if (!iconDds && !gemDds) continue;
  seen.add(en);
  const id = safe(b.Id.replace(/^Metadata\/Items\/Gems?\//, ""));
  const icon = iconDds ? await toWebp(iconDds, SKILL, `${id}_icon`) : null;
  const gem = gemDds ? await toWebp(gemDds, SKILL, `${id}_gem`) : null;
  if (!icon && !gem) continue;
  const mx = Math.max(sg.StrengthRequirementPercent ?? 0, sg.DexterityRequirementPercent ?? 0, sg.IntelligenceRequirementPercent ?? 0);
  const color = mx === 0 ? "white" : mx === sg.StrengthRequirementPercent ? "red" : mx === sg.DexterityRequirementPercent ? "green" : "blue";
  const tags = (ge?.GemTags ?? []).map((t) => GT[t]?.Name).filter(Boolean);
  if (sup?.IsLineage && !tags.includes("Lineage")) tags.push("Lineage");
  list.push({ id, en, ja: gemsJa.get(en) ?? itemsJa[en] ?? en, color, support, tags, icon, gem });
}
// PoB の表にあってもアイコンが引けなかった物 (ブリンク等) は、クライアントの表のアイコンで埋める
const iconByName = new Map();
for (const [idx, sg] of SG.entries()) {
  const en = B[sg.BaseItemType]?.Name;
  if (!en || iconByName.has(en)) continue;
  const ge = Array.isArray(sg.GemEffects) && sg.GemEffects.length ? GE[sg.GemEffects[0]] : null;
  const gr = ge?.GrantedEffect != null ? GRE[ge.GrantedEffect] : null;
  const sup = supByGem.get(idx);
  const dds = gr?.IsSupport || sup ? sup?.Icon : gr?.ActiveSkill != null ? AS[gr.ActiveSkill]?.Icon_DDSFile : null;
  if (dds && !/\/Blank[A-Za-z]*Support\.dds$/.test(dds)) iconByName.set(en, dds);
}
for (const x of list) {
  if (x.icon || !iconByName.has(x.en)) continue;
  x.icon = await toWebp(iconByName.get(x.en), SKILL, `${x.id}_icon`);
}
// 原石 (Uncut)
for (const [gameId, en] of [["Metadata/Items/Gems/SkillGemUncut", "Uncut Skill Gem"], ["Metadata/Items/Gems/SupportGemUncut", "Uncut Support Gem"], ["Metadata/Items/Gems/ReservationGemUncut", "Uncut Spirit Gem"]]) {
  const f = artById.get(gameId);
  const gem = f ? await toWebp(f, SKILL, `${safe(en)}_gem`) : null;
  if (gem) list.push({ id: safe(en), en, ja: itemsJa[en] ?? en, color: "white", support: en.includes("Support"), tags: ["Uncut"], icon: null, gem });
}
writeFileSync(resolve(ROOT, "src/services/craft-stage/skill-art.json"), JSON.stringify(list, null, 1) + "\n");

// ルーン
const RUNE = resolve(ROOT, "public/rune-art");
rmSync(RUNE, { recursive: true, force: true });
mkdirSync(RUNE, { recursive: true });
const runes = JSON.parse(readFileSync(resolve(ROOT, "src/services/craft-stage/stage-runes.json"), "utf8")).runes;
const runeMap = {};
for (const [en, r] of Object.entries(runes)) {
  if (!r.dds) continue;
  const id = await toWebp(r.dds, RUNE, safe(r.dds.replace(/^Art\/2DItems\//, "").replace(/\.dds$/, "")));
  if (id) runeMap[en] = id;
}
writeFileSync(resolve(ROOT, "src/services/craft-stage/rune-art.json"), JSON.stringify(runeMap, null, 1) + "\n");
rmSync(tmp, { recursive: true, force: true });
console.log(`ジェム ${list.length} 件 (アイコン ${list.filter((x) => x.icon).length} / ジェムの絵 ${list.filter((x) => x.gem).length}) / ルーン ${Object.keys(runeMap).length} / ${Object.keys(runes).length} 件 (失敗 ${fail})`);
