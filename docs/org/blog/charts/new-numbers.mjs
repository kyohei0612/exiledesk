// 仕上げで数字が増えていないかの見張り: git の HEAD の版に無い数字が、今の版に出ていたら並べる。
// 使い方: node docs/org/blog/charts/new-numbers.mjs <slug…>   (日英の両方を見る)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const nums = (s) => new Set((s.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.$/, "")));
for (const slug of process.argv.slice(2)) {
  for (const lang of ["ja", "en"]) {
    const path = `src/data/blog/${slug}.${lang}.md`;
    let before = "";
    try { before = execSync(`git show HEAD:${path}`, { encoding: "utf8" }); } catch { console.log(`${path}: HEAD に無い (新しい記事)`); continue; }
    const old = nums(before);
    const added = [...nums(readFileSync(path, "utf8"))].filter((n) => !old.has(n));
    console.log(`${path}: ${added.length ? "増えた数字 " + added.join(" ") : "増えた数字なし"}`);
  }
}
