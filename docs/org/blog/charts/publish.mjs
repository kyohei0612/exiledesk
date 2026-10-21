// 本番に出す時 (オーナー 10-22 の決め = 案 B、19 本を一度に): 記事の draft: true を外し、date をその日にする。
// 使い方: node docs/org/blog/charts/publish.mjs <YYYY-MM-DD> [slug…]   (slug を省くと sample 以外の全部)。--dry で書き換えずに並べるだけ。
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(import.meta.dirname, "../../../../src/data/blog");
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const [date, ...only] = args.filter((a) => a !== "--dry" && a !== "--include-held");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) throw new Error("使い方: publish.mjs <YYYY-MM-DD> [slug…] [--dry]");

// 配信者・配信の中身が元の記事 (オーナー 10-22「配信者の話は無視、出すとまずい」)。決まるまで出さない (--include-held で入れる)。一覧は docs/org/blog/notes/2026-10-22-streamer-check.md
const HELD = new Set([
  "crafting-questions-from-streams", "ai-crafting-odds-vs-feel", "gold-ring-video-decoded", "essence-of-the-abyss-mark",
  "poe2db-cast-speed-weight", "optimal-move-vs-intuition", "chaos-reroll-vs-restart", "crafting-order-cost", "are-omens-worth-it", "chaos-spam-odds", "crafting-calculator-mistakes", "crafting-cost-variance",
]);
const withHeld = args.includes("--include-held");

let n = 0;
for (const f of readdirSync(DIR).filter((f) => /\.(ja|en)\.md$/.test(f) && !f.startsWith("sample."))) {
  const slug = f.replace(/\.(ja|en)\.md$/, "");
  if (only.length && !only.includes(slug)) continue;
  if (HELD.has(slug) && !withHeld) { console.log(`${f}: 止めてある (配信が元)`); continue; }
  const p = resolve(DIR, f);
  const s = readFileSync(p, "utf8");
  const end = s.indexOf("\n---", 4);
  const head = s.slice(0, end).replace(/\r?\ndraft: true/, "").replace(/^date: .*$/m, `date: ${date}`);
  console.log(`${f}: date ${date}${s.slice(0, end).includes("draft: true") ? "・draft を外す" : ""}`);
  if (!dry) writeFileSync(p, head + s.slice(end));
  n++;
}
console.log(`${n} ファイル${dry ? " (--dry、書き換えていない)" : ""}`);
