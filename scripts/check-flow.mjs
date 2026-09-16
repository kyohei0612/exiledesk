/**
 * check-flow.mjs — 捌き速度の「判定」をダミーデータで検算する (2026-09-17)
 *
 * オーナー指示:「ダミーでテストよろしく。仕組みだけ先に堅牢にしてからテストで取ってくれ」。
 * 公式 API は叩かない。ここで作った出品データだけで summarizeFlow の出力を確かめる。
 *
 * Rust 側 (追跡そのもの) は src-tauri/examples/flow_audit.rs が見る。
 *
 *   node scripts/check-flow.mjs
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// esbuild は vite の依存として入っているだけで直接の依存ではないので、pnpm のストアから探す
const require_ = createRequire(import.meta.url);
function findEsbuild() {
  try {
    return require_.resolve("esbuild");
  } catch {
    const store = "node_modules/.pnpm";
    const dir = readdirSync(store).find((d) => d.startsWith("esbuild@"));
    if (!dir) throw new Error("esbuild が見つかりません (pnpm install してください)");
    return require_.resolve("esbuild", { paths: [join(store, dir, "node_modules")] });
  }
}
const { build } = await import(pathToFileURL(findEsbuild()).href);

const HOUR = 3600;
const NOW = 1_700_000_000;

/** 出品 1 件 */
const L = ({ id = Math.random().toString(36).slice(2), price = 10, listedHoursAgo = 1, goneHoursAgo = null }) => ({
  id,
  listed_at: NOW - Math.round(listedHoursAgo * HOUR),
  first_seen: NOW - Math.round(listedHoursAgo * HOUR),
  last_seen: NOW,
  gone_at: goneHoursAgo == null ? null : NOW - Math.round(goneHoursAgo * HOUR),
  amount: price,
  currency: "divine",
});
const state = (tracked) => ({ tracked, daily: [], total: tracked.length, sampled_at: NOW, confirmed_at: 0 });

let ng = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "[OK]  " : "[NG]  "} ${name}\n    ${detail}`);
  if (!ok) ng++;
}

const dir = mkdtempSync(join(tmpdir(), "flowcheck-"));
const out = join(dir, "market-flow.mjs");
await build({ entryPoints: ["src/services/market-flow.ts"], outfile: out, bundle: true, format: "esm", platform: "neutral", logLevel: "error" });
const { summarizeFlow, soldWithin } = await import(pathToFileURL(out).href);

// ---------------------------------------------------------------------------
// 1. 売れた分しか結果が分かっていない時は「(暫定)」を付ける
//    (売れ残りを 1 件も観測していないので、率は必ず 100% になる)
// ---------------------------------------------------------------------------
{
  const s = summarizeFlow(
    state([
      L({ listedHoursAgo: 3, goneHoursAgo: 1 }),
      L({ listedHoursAgo: 4, goneHoursAgo: 1 }),
      L({ listedHoursAgo: 2, goneHoursAgo: 0.5 }),
      L({ listedHoursAgo: 2 }),
    ]),
    NOW,
  );
  check("1. 売れ残り未観測なら (暫定) が付く", s.label === "速い (暫定)" && s.provisional === true, `label=${s.label} 24h率=${s.soldIn24h} 母数=${s.known24}`);
}

// ---------------------------------------------------------------------------
// 2. 24 時間以上売れ残っている出品があれば、暫定が外れる
// ---------------------------------------------------------------------------
{
  const s = summarizeFlow(
    state([
      L({ listedHoursAgo: 3, goneHoursAgo: 1 }),
      L({ listedHoursAgo: 4, goneHoursAgo: 1 }),
      L({ listedHoursAgo: 2, goneHoursAgo: 0.5 }),
      L({ listedHoursAgo: 30 }),
    ]),
    NOW,
  );
  check("2. 売れ残りを観測したら暫定が外れる", s.label === "速い" && s.provisional === false, `label=${s.label} 24h率=${s.soldIn24h} 母数=${s.known24}`);
}

// ---------------------------------------------------------------------------
// 3. 何日も残っている方が多ければ「遅い」
// ---------------------------------------------------------------------------
{
  const s = summarizeFlow(
    state([
      L({ listedHoursAgo: 80, goneHoursAgo: 1 }),
      L({ listedHoursAgo: 100 }),
      L({ listedHoursAgo: 90 }),
      L({ listedHoursAgo: 70 }),
      L({ listedHoursAgo: 60 }),
    ]),
    NOW,
  );
  check("3. 滞留が多ければ遅い", s.label === "遅い" && s.tone === "slow", `label=${s.label} 48h率=${s.soldIn48h} 母数=${s.known48} 滞留=${s.stale}`);
}

// ---------------------------------------------------------------------------
// 4. 母数が足りなければ判定しない
// ---------------------------------------------------------------------------
{
  const s = summarizeFlow(state([L({ listedHoursAgo: 2, goneHoursAgo: 1 }), L({ listedHoursAgo: 2 })]), NOW);
  check("4. 母数不足なら判定を出さない", s.label === "" && s.tone === "unknown", `label="${s.label}" 母数=${s.known24}`);
}

// ---------------------------------------------------------------------------
// 5. 記録が無ければ空の結果 (画面は「記録なし」)
// ---------------------------------------------------------------------------
{
  const s = summarizeFlow(undefined, NOW);
  check("5. 記録なしでも落ちない", s.label === "" && s.gone === 0 && s.alive === 0, `label="${s.label}"`);
}

// ---------------------------------------------------------------------------
// 6. 売れるまでの中央値は「出品されてから消えるまで」で数える
// ---------------------------------------------------------------------------
{
  const s = summarizeFlow(
    state([
      L({ listedHoursAgo: 10, goneHoursAgo: 8 }), // 2 時間
      L({ listedHoursAgo: 10, goneHoursAgo: 6 }), // 4 時間
      L({ listedHoursAgo: 10, goneHoursAgo: 4 }), // 6 時間
    ]),
    NOW,
  );
  check("6. 中央値は出品時刻から数える", s.medianMin === 4 * 60, `中央値=${s.medianMin} 分`);
}

// ---------------------------------------------------------------------------
// 7. 窓を跨いで生き残った出品は「売れなかった」として母数に入る
// ---------------------------------------------------------------------------
{
  const r = soldWithin(
    [
      { life: 2 * HOUR, gone: true },
      { life: 50 * HOUR, gone: false },
      { life: 3 * HOUR, gone: false },
    ],
    24 * HOUR,
  );
  check("7. 24 時間残った出品は母数に入り、若い出品は入らない", r.known === 2 && r.hit === 1, `hit=${r.hit} known=${r.known}`);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${ng === 0 ? "全部 OK" : `NG ${ng} 件`}`);
process.exit(ng === 0 ? 0 : 1);
