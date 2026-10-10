// アイテムの MOD の並び順 (2026-10-10 オーナー「MOD の並び順もゲーム内に合わせて」)。
// ゲーム (トレードサイトも) はプレ / サフィで分けず、説明文の表 (Data/StatDescriptions/stat_descriptions) の並びで MOD を並べる。
// その表の順番を stat id ごとに取り出す。出力: src/data/stat-order.json { stat id: 順番 } (エンジンの MOD が使う stat だけ)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsd, parseStatDescriptions } from "./parse-stat-descriptions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csd = readFileSync(join(root, "data-cache/client-export-gems-detail/files/Data@StatDescriptions@stat_descriptions.csd"));
const { descriptors } = parseStatDescriptions(decodeCsd(csd));
const order = new Map();
descriptors.forEach((d, i) => { for (const s of d.stats ?? []) if (!order.has(s)) order.set(s, i); });
// エンジンの MOD が使う stat だけ残す (小さくする)
const mods = JSON.parse(readFileSync(join(root, "src/vendor/poe2htc/data/mods.json"), "utf8")).mods;
const used = new Set(mods.flatMap((m) => (m.tiers ?? []).flatMap((t) => t.stats ?? [])));
const out = {};
for (const s of used) if (order.has(s)) out[s] = order.get(s);
writeFileSync(join(root, "src/data/stat-order.json"), JSON.stringify(out) + String.fromCharCode(10));
console.log(`stat-order: ${Object.keys(out).length} / ${used.size} (表の記述 ${descriptors.length})`);
