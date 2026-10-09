#!/usr/bin/env node
/**
 * build-tradeable-bases.mjs — 取引所で取引できるベースの一覧 (2026-10-09)
 *
 * オーナー「なんで極寒のワンドが無いんだ、トレードサイトの検索欄に」: クライアントと poe2db には廃止品・未実装品 (極寒・供物・拷問・致命・原始のワンドなど) も
 * 残っているが、取引所の一覧 (GGG の api/trade2/data/items) に無い物は今のゲームで手に入らない。ベースがあるかの決め手はこれ
 * (MOD の置き場の決め手は poe2db = scripts/audit-poe2db.mjs)。
 *
 *   node scripts/build-tradeable-bases.mjs            (手元の data-cache/trade2-items.json から)
 *   node scripts/build-tradeable-bases.mjs --refresh  (取引所から取り直す。中身の決まったデータの窓口に 1 回。検索ではない)
 * 出力: src/services/items/tradeable-bases.json (名前の無い = ベースの英語名、装備・ジュエル・フラスコ・ジェム)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "data-cache/trade2-items.json");
if (process.argv.includes("--refresh")) {
  const r = await fetch("https://www.pathofexile.com/api/trade2/data/items", { headers: { "User-Agent": "ExileDesk/0.1 base-list (+https://github.com/kyohei0612/exiledesk)" } });
  if (!r.ok) throw new Error(`取引所 ${r.status}`);
  writeFileSync(SRC, await r.text());
}
const j = JSON.parse(readFileSync(SRC, "utf8"));
const CATS = new Set(["accessory", "armour", "weapon", "jewel", "flask", "gem"]);
const types = [...new Set(j.result.filter((c) => CATS.has(c.id)).flatMap((c) => c.entries).filter((e) => !e.name && e.type).map((e) => e.type))].sort();
writeFileSync(resolve(ROOT, "src/services/items/tradeable-bases.json"), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "pathofexile.com api/trade2/data/items (名前の無い物 = ベース)", types }, null, 0) + "\n");
console.log(`${types.length} ベース → src/services/items/tradeable-bases.json`);
