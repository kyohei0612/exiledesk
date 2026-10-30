/**
 * _read-goal.mjs — 共有の木から完成形だけを取り出す (S-172: 手順は読まない・出さない)。
 *   node scripts/ai-tree/_read-goal.mjs <html か #recipe= の code のファイル>
 */
import fs from "node:fs";
import { bundleEntry } from "../_bundle-ts.mjs";

const S = await bundleEntry("src/services/craft-stage/share.ts");
const text = fs.readFileSync(process.argv[2], "utf8");
const code = /#recipe=([A-Za-z0-9_%.-]+)/.exec(text)?.[1] ?? text.trim();
const pack = await S.unpackJson(decodeURIComponent(code));
const t = pack.t ?? {};
const drop = new Set(["picks", "orphans", "boxes", "recipe", "memo", "notes", "steps"]);
console.log(JSON.stringify({ name: pack.n, keys: Object.keys(t), ...Object.fromEntries(Object.entries(t).filter(([k]) => !drop.has(k))) }, null, 1));
