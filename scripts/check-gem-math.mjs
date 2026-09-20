/**
 * check-gem-math.mjs — ジェムコラプトの「個数の連鎖」と「丸め」の検算 (2026-09-20)
 *
 * オーナー指示:
 *   ・費用は切り上げ / 収入は切り下げ (1 未満は 1 つ下の通貨に落としてから)
 *   ・N 回やった時の個数は段ごとに切り下げ:
 *       できた 23% → その数だけ結晶 → 当たり (25%) が完成品 → 原石は 完成品 + 21 + 23% の個数
 *   ・自作で「賭けない」経路 (21 と 23% をそのまま売る) も比べる
 *
 *   node scripts/check-gem-math.mjs
 */
import { mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);
function findEsbuild() {
  try { return require_.resolve("esbuild"); } catch {
    const store = "node_modules/.pnpm";
    const dir = readdirSync(store).find((d) => d.startsWith("esbuild@"));
    return require_.resolve("esbuild", { paths: [join(store, dir, "node_modules")] });
  }
}
const { build } = await import(pathToFileURL(findEsbuild()).href);
const dir = mkdtempSync(join(tmpdir(), "gemmath-"));
const bundle = async (entry, name) => {
  const out = join(dir, name);
  await build({ entryPoints: [entry], outfile: out, bundle: true, format: "esm", platform: "neutral", logLevel: "error", define: { "import.meta.env.DEV": "false" } });
  return import(pathToFileURL(out).href);
};

let ng = 0;
const check = (name, ok, detail) => { console.log(`${ok ? "[OK]  " : "[NG]  "} ${name}\n    ${detail}`); if (!ok) ng++; };

// ---------------------------------------------------------------------------
// 個数の連鎖 (model.ts は純粋関数なのでそのまま読める)
// ---------------------------------------------------------------------------
const { evaluateRoutes, expectedCounts, DEFAULT_PARAMS } = await bundle("src/views/gem-corrupt/model.ts", "model.mjs");
// 素材 (高貴): 完成品が高く、23% に結晶を賭ける価値がある相場にする
const m = { baseGem: 3, gcp: 10, perfectJeweller: 5, vaal: 6, crystal: 12, uncut20: 4 };
const s = { level21: 500, quality23: 400, finished: 3000 };
const routes = evaluateRoutes(m, s, DEFAULT_PARAMS);
const byId = Object.fromEntries(routes.map((r) => [r.id, r]));
{
  const r = byId.craft;
  check("経路が 5 本 (賭けない自作を含む)", routes.length === 5 && !!byId.craftPlain, routes.map((x) => x.id).join(", "));
  check("自作: 相場が揃えば 23% に結晶を賭ける", r.ok && r.gambleAfterQuality === true, `ok=${r.ok} gambleQ=${r.gambleAfterQuality} gambleL=${r.gambleAfterLevel}`);
  const st = r.stage;
  // 既定の確率: レベル+1 = 1/4 × 1/2 = 12.5% / 品質 23% = 1/4 × 1/7 ≈ 3.57% / 結晶の当たり = 50% × 1/2 = 25%
  check("段の確率 (既定)", Math.abs(st.pLevel21 - 0.125) < 1e-9 && Math.abs(st.pQuality23 - 1 / 28) < 1e-9 && Math.abs(st.hitFromQuality23 - 0.25) < 1e-9,
    `21=${st.pLevel21} 23%=${st.pQuality23.toFixed(4)} 結晶当たり=${st.hitFromQuality23}`);
  // 100 回: 21 は floor(12.5)=12、23% は floor(3.57)=3 → 結晶 3 → 完成品 floor(0.75)=0 → 原石 = 0 + 12 + 0
  const c = expectedCounts(r, 100);
  check("100 回の連鎖: 21=12 / 23%→結晶 3 → 完成品 0 / 原石 12", c.level21 === 12 && c.crystals === 3 && c.finished === 0 && c.quality23 === 0 && c.uncut20 === 12,
    JSON.stringify(c));
  // 200 回: 23% = floor(7.14)=7 → 結晶 7 → 完成品 floor(1.75)=1 → 原石 = 1 + 25 + 0 = 26
  const c2 = expectedCounts(r, 200);
  check("200 回の連鎖: 23% 7 個 → 結晶 7 → 完成品 1 / 原石 26", c2.crystals === 7 && c2.finished === 1 && c2.level21 === 25 && c2.uncut20 === 26, JSON.stringify(c2));
  check("切り下げ: 期待値 × N より小さいか等しい", c2.finished <= 200 * r.pFinished && c2.crystals <= 200 * (r.expectedCrystals ?? 0) + 1e-9,
    `完成品 ${c2.finished} ≤ ${(200 * r.pFinished).toFixed(2)} / 結晶 ${c2.crystals} ≤ ${(200 * (r.expectedCrystals ?? 0)).toFixed(2)}`);
}
{
  const r = byId.craftPlain;
  const c = expectedCounts(r, 200);
  check("賭けない自作: 結晶 0、23% はそのまま売る (7 個)、原石 = 21 + 23% = 32", r.ok && c.crystals === 0 && c.quality23 === 7 && c.level21 === 25 && c.finished === 0 && c.uncut20 === 32, JSON.stringify(c));
  check("賭けない自作は結晶を使わない (期待本数 0)", (r.expectedCrystals ?? 0) === 0, `expectedCrystals=${r.expectedCrystals}`);
}
{
  const r = byId.buy21;
  const c = expectedCounts(r, 40);
  // 買った 21 を 40 個賭ける: 結晶 40、当たり = 50% × 1/6 ≈ 8.3% → floor(3.33) = 3、原石 0 (既に 21)
  check("21 を買って結晶: 結晶 40 / 完成品 3 / 原石 0", c.crystals === 40 && c.finished === 3 && c.uncut20 === 0, JSON.stringify(c));
}
{
  const r = byId.buy23;
  const c = expectedCounts(r, 40);
  // 買った 23% を 40 個賭ける: 結晶 40、当たり 25% → 10、原石は当たりの 10 だけ
  check("23% を買って結晶: 結晶 40 / 完成品 10 / 原石 10", c.crystals === 40 && c.finished === 10 && c.uncut20 === 10, JSON.stringify(c));
}
{
  // 23% にも原石を使う (オーナー指示「23% ジェムは 20 ジェム使う、今までのも含めて全部」): 自作の 23% 行に原石 1
  const r = byId.craftPlain;
  const q23 = r.outcomes.find((o) => o.sale === "quality23");
  check("自作の 23% 行は原石を 1 使う", !!q23 && q23.uncut === 1, `uncut=${q23?.uncut}`);
}

// ---------------------------------------------------------------------------
// 丸め (display-currency.ts は相場ストアを読むので、無い時は高貴だけで確かめる)
// ---------------------------------------------------------------------------
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window ??= globalThis;
try {
  const dc = await bundle("src/state/display-currency.ts", "dc.mjs");
  const up = (x) => dc.roundMoney(x, "up");
  const dn = (x) => dc.roundMoney(x, "down");
  // 相場が無いので全通貨 1 高貴扱い = 高貴で見る
  check("費用 3.7 → 4 / 3.1 → 4 (切り上げ)", up(3.7).value === 4 && up(3.1).value === 4 && up(3.7).exalted === 4, `${up(3.7).value} / ${up(3.1).value}`);
  check("収入 12.5 → 12 / 12.9 → 12 (切り下げ)", dn(12.5).value === 12 && dn(12.9).value === 12, `${dn(12.5).value} / ${dn(12.9).value}`);
  check("整数はそのまま", up(4).value === 4 && dn(12).value === 12, `${up(4).value} / ${dn(12).value}`);
  // 換算の往復誤差 (60 神 → 高貴で 2 桁に丸め → 神に戻すと 59.99999) で 1 神落ちない
  check("誤差 59.99999 → 60 (切り下げでも落ちない) / 10.00001 → 10 (切り上げでも上がらない)", dn(59.99999).value === 60 && up(10.00001).value === 10 && dn(59.9).value === 59 && up(10.1).value === 11,
    `${dn(59.99999).value} / ${up(10.00001).value} / ${dn(59.9).value} / ${up(10.1).value}`);
  check("一番下の通貨で 1 未満は丸めない (0.02 → 0.02)", up(0.02).rounded === false && Math.abs(up(0.02).value - 0.02) < 1e-9, JSON.stringify(up(0.02)));
  check("money() の書式: 費用 3.7 → '4 高貴' / 収入 12.5 → '12 高貴'", dc.displayCurrency.money(3.7, { round: "up" }) === "4 高貴" && dc.displayCurrency.money(12.5, { round: "down" }) === "12 高貴",
    `${dc.displayCurrency.money(3.7, { round: "up" })} / ${dc.displayCurrency.money(12.5, { round: "down" })}`);
} catch (e) {
  check("丸めの検算 (読み込み)", false, String(e).slice(0, 200));
}

console.log(ng === 0 ? "\n全部 OK" : `\nNG ${ng} 件`);
process.exit(ng === 0 ? 0 : 1);
