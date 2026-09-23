/**
 * check-htc-mod-tags.mjs — カタリストが見るタグの点検 (2026-09-23)
 *
 * オーナー:「触媒はめっちゃタグ重要だからタグチェックはやったほうがいい」。
 *
 * 装飾品の品質とカタリストは **MOD のタグ**で効く相手が決まる ([[quality.ts]])。以前は family ごとの
 * 表でタグを引いていて、family に同居する別物 (アビスの「マナ満タン中のキャスピ」など) のタグが混ざり、
 * キャスピに `mana` が付いていた (マナ品質で段を 2 つ低く読み、マナのカタリストで重みを押し上げた)。
 *
 * ここでは **指輪・首飾りの MOD 全部**について、計算が使うタグ ([[quality.ts]] の `catalystsFor`) を
 * クライアントの同じ MOD (種類 = 同梱の group) のタグと突き合わせ、1 つでも違えば落とす。
 */
import { readFileSync } from "node:fs";
const { bundleEntry } = await import("./_bundle-ts.mjs");
const M = await bundleEntry("scripts/_htc-bridge-entry.ts");
const data = M.loadPatchSync();

const CATALYST_TAGS = new Set(["life", "mana", "defences", "physical", "fire", "cold", "lightning",
  "chaos", "attack", "caster", "speed", "attribute", "minion"]);
const CLIENT = JSON.parse(readFileSync("data-cache/mods.en.json", "utf8"));
const SPAWN = { Rings: "ring", Amulets: "amulet" };

// 種類 (type) → そのクラスに普通に出るクライアント MOD のタグ
const clientTags = (cls, type) => {
  const out = new Set();
  for (const m of Object.values(CLIENT)) {
    if (m.type !== type || m.domain !== "item") continue;
    if (!(m.spawn_weights || []).some((w) => w.tag === SPAWN[cls] && w.weight > 0)) continue;
    out.add((m.implicit_tags || []).filter((t) => CATALYST_TAGS.has(t)).sort().join(","));
  }
  return [...out];
};

let bad = 0, checked = 0, noClient = 0;
for (const m of data.mods.values()) {
  const cls = m.id.split("/")[0];
  if (!SPAWN[cls] || m.source !== "normal") continue;
  const ours = M.catalystsFor(m).map((c) => c.tag).sort().join(",");
  const theirs = clientTags(cls, m.group);
  if (!theirs.length) { noClient++; continue; }
  checked++;
  if (!theirs.includes(ours)) { bad++; console.log(`NG ${m.id}: 計算は [${ours}] / クライアントは ${theirs.map((t) => "[" + t + "]").join(" ")}`); }
}
// 名指しの確認: キャスピはマナのカタリストで押し上がらない
for (const id of ["Rings/IncreasedCastSpeed", "Amulets/IncreasedCastSpeed"]) {
  const m = data.mods.get(id);
  if (m && M.boostedBy(m, "mana")) { bad++; console.log(`NG ${id} がマナのカタリストで押し上がる`); }
}
console.log(`指輪・首飾りの普通 MOD ${checked} 個を点検 (クライアントに同じ種類が無い ${noClient} 個は対象外)`);
if (bad) { console.log(`NG ${bad} 件`); process.exit(1); }
console.log("OK");
