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
const { build: esbuild } = await import(pathToFileURL(findEsbuild()).href);
/**
 * 束ねる時の共通設定。vite の `import.meta.env` はここには無いので潰しておく
 * (market-flow.ts がレート制限の共通化で trade2 側を読むようになり、DEV 判定が混ざった 2026-09-17)。
 */
const build = (opts) => esbuild({ bundle: true, format: "esm", platform: "neutral", logLevel: "error", define: { "import.meta.env.DEV": "false" }, ...opts });

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
  // 出品者が分からない記録は「不明」で売れたに数えないので、ダミーには必ず入れる (2026-09-26)
  account: `S-${id}`,
});
const state = (tracked) => ({ tracked, daily: [], total: tracked.length, sampled_at: NOW });

let ng = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "[OK]  " : "[NG]  "} ${name}\n    ${detail}`);
  if (!ok) ng++;
}

const dir = mkdtempSync(join(tmpdir(), "flowcheck-"));
const out = join(dir, "market-flow.mjs");
await build({ entryPoints: ["src/services/market-flow.ts"], outfile: out, bundle: true, format: "esm", platform: "neutral", logLevel: "error" });
const { summarizeFlow, soldWithin, flowSentence } = await import(pathToFileURL(out).href);

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
  check(
    "1. 実測の売れるまでの時間で判定する",
    s.label === "速い" && /件が売れました（売れるまで/.test(flowSentence(s)),
    `label=${s.label} 文=${flowSentence(s)}`,
  );
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
  check("2. 売れ残りがあっても、売れた実績が多ければ速い", s.label === "速い", `label=${s.label} 文=${flowSentence(s)}`);
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
  check("3. 1 件も売れず滞留だけなら遅い", s.label === "遅い" && s.tone === "slow", `label=${s.label} 48h率=${s.soldIn48h} 母数=${s.known48} 滞留=${s.stale}`);
}

// ---------------------------------------------------------------------------
// 3b. 表示している売却時間より長く並んでいる在庫の方が多ければ 1 段下げる
//     (2026-09-17 レビュー: 観測窓が短いと中央値が短く出て「速い」に化ける)
// ---------------------------------------------------------------------------
{
  const s = summarizeFlow(
    state([
      L({ listedHoursAgo: 3, goneHoursAgo: 1 }), // 2 時間で売れた
      L({ listedHoursAgo: 4, goneHoursAgo: 2 }), // 2 時間
      L({ listedHoursAgo: 5, goneHoursAgo: 2 }), // 3 時間
      L({ listedHoursAgo: 8 }),
      L({ listedHoursAgo: 9 }),
      L({ listedHoursAgo: 10 }),
      L({ listedHoursAgo: 11 }),
    ]),
    NOW,
  );
  check(
    // 3 件以上で出した判定には「薄い」の印を付けない (4b と区別が付くこと)
    "3b. 並んだままの在庫は判定を動かさず、件数だけ併記する",
    s.label === "速い" && s.thin === false && s.olderThanMedian === 4 && /もっと長く並んでいます/.test(flowSentence(s)),
    `label=${s.label} 薄い=${s.thin} 表示より長い=${s.olderThanMedian} 文=${flowSentence(s)}`,
  );
}

// ---------------------------------------------------------------------------
// 4. 母数が足りない時の扱い
//
//    判定の門は「結果が分かっている件数」(売れた分 + 1 日を超えて売れ残った分) が 3 件。
//    **売れた件数ではない**。まだ齢が足りない在庫は「売れなかった」と言えないので数えない。
//
//    規則はこの順で決まった:
//      2026-09-17 母数 3 件に届かないうちは判定しない
//      2026-09-19 ただし 6 時間以内に売れた実績が 1 件でもあれば「速い」と言ってよい
//                 (オーナー:「1 件でも短時間で売れたら一応早いんじゃないの?」)
//      2026-09-20 その例外が母数を見ていなかったので、結果 1 件で「速い」と出ていた。
//                 例外は残したまま、母数の門をくぐった後にだけ効かせる
// ---------------------------------------------------------------------------
{
  // 4a. 結果が 1 件しか出ていない (売れた 1 + まだ若い在庫 1) → 何も言わない
  const s = summarizeFlow(state([L({ listedHoursAgo: 4, goneHoursAgo: 1 }), L({ listedHoursAgo: 2 })]), NOW);
  check(
    "4a. 結果が 3 件に届かないうちは判定を出さない",
    s.label === "" && s.tone === "unknown" && s.enough === false && s.known24 === 1,
    `label="${s.label}" 母数=${s.known24} 文=${flowSentence(s)}`,
  );
}
{
  // 4b. 売れたのは 1 件でも、母数が 3 件あれば「速い」。薄さは札と文に出す
  const s = summarizeFlow(
    state([
      L({ listedHoursAgo: 4, goneHoursAgo: 1 }), // 3 時間で売れた
      L({ listedHoursAgo: 30 }), // 1 日超えて売れ残り = 結果は分かっている
      L({ listedHoursAgo: 30 }),
    ]),
    NOW,
  );
  check(
    "4b. 母数さえ足りていれば 1 件の速売りでも速い (薄さは札と文に出す)",
    s.label === "速い" && s.tone === "fast" && s.known24 === 3 && s.thin === true && /1 件だけで出した判定です/.test(flowSentence(s)),
    `label=${s.label} 母数=${s.known24} 薄い=${s.thin} 文=${flowSentence(s)}`,
  );
}
{
  // 4c. 境目: 6 時間ちょうどは速い / 超えたら (母数は足りていても) 判定しない
  const filler = [L({ listedHoursAgo: 30 }), L({ listedHoursAgo: 30 })];
  const at6 = summarizeFlow(state([L({ listedHoursAgo: 8, goneHoursAgo: 2 }), ...filler]), NOW);
  const over6 = summarizeFlow(state([L({ listedHoursAgo: 9, goneHoursAgo: 2 }), ...filler]), NOW);
  check(
    "4c. 6 時間ちょうどは速い / 超えたら無判定",
    at6.label === "速い" && over6.label === "" && at6.known24 === 3 && over6.known24 === 3,
    `6時間=${at6.label || "(無判定)"} 7時間=${over6.label || "(無判定)"} 母数=${at6.known24}/${over6.known24}`,
  );
}
{
  // 4d. 判定できない時は「あと何件で判定できるか」を母数で数える (売れた件数ではない)
  const s = summarizeFlow(state([L({ listedHoursAgo: 4, goneHoursAgo: 1 }), L({ listedHoursAgo: 2 })]), NOW);
  check(
    "4d. 「あと N 件」は母数で数える",
    /判定にはあと 2 件/.test(flowSentence(s)),
    `文=${flowSentence(s)}`,
  );
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

// ---------------------------------------------------------------------------
// 8. 検索クエリ: 売値も追跡も securable (インスタントバイアウトのみ)
//    オーナー指示 (2026-09-17):「インスタントバイアウトだけ見ればいい」。
//    ここを取り違えると母集団が変わって判定が壊れるので毎回見る
// ---------------------------------------------------------------------------
{
  const qout = join(dir, "row-query.mjs");
  await build({ entryPoints: ["src/views/gem-corrupt/row-query.ts"], outfile: qout, bundle: true, format: "esm", platform: "neutral", logLevel: "error" });
  const { rowQuery, rowQueryOptions } = await import(pathToFileURL(qout).href);
  const bout = join(dir, "query.mjs");
  await build({ entryPoints: ["src/services/trade2/query.ts"], outfile: bout, bundle: true, format: "esm", platform: "neutral", logLevel: "error" });
  const { buildGemQuery } = await import(pathToFileURL(bout).href);

  const sale = buildGemQuery("Comet", rowQueryOptions("finished", false));
  const track = rowQuery("Comet", "finished");
  const ok =
    sale.query.status.option === "securable" &&
    track.query.status.option === "securable" &&
    sale.query.filters.misc_filters.filters.gem_sockets?.min === 5 &&
    track.query.filters.misc_filters.filters.gem_sockets?.min === 5 &&
    !sale.query.filters.trade_filters &&
    JSON.stringify(sale.query.filters.type_filters) === JSON.stringify(track.query.filters.type_filters);
  check(
    "8. 売値と追跡が同じ条件 (securable = 即時購入のみ)",
    ok,
    `売値 status=${sale.query.status.option} / 追跡 status=${track.query.status.option} / ソケット=${sale.query.filters.misc_filters.filters.gem_sockets?.min}`,
  );
}

// ---------------------------------------------------------------------------
// 9. 確定待ち (1 回だけ消えた) / 不明 (出品時刻か出品者が無い) / 付け替え は
//    売れた件数・速さ・実売の値段に入れない (2026-09-26 監査「売れた判定を厳しく」)
// ---------------------------------------------------------------------------
{
  const sold = [L({ listedHoursAgo: 3, goneHoursAgo: 1 }), L({ listedHoursAgo: 4, goneHoursAgo: 1 }), L({ listedHoursAgo: 2, goneHoursAgo: 0.5 })];
  const pending = { ...L({ listedHoursAgo: 3, price: 999 }), missing_since: NOW - HOUR };
  const noSeller = { ...L({ listedHoursAgo: 3, goneHoursAgo: 1, price: 999 }), account: null };
  const noTime = { ...L({ listedHoursAgo: 3, goneHoursAgo: 1, price: 999 }), listed_at: null };
  const flagged = { ...L({ listedHoursAgo: 3, goneHoursAgo: 1, price: 999 }), unknown: true };
  const relisted = { ...L({ listedHoursAgo: 3, goneHoursAgo: 1, price: 999 }), relisted: true };
  const s = summarizeFlow(state([...sold, pending, noSeller, noTime, flagged, relisted]), NOW);
  check(
    "9. 確定待ち・不明・付け替えは売れたに数えない",
    s.gone === 3 && s.pending === 1 && s.unknown === 3 && s.alive === 0 && s.soldPrices.every((p) => p.amount !== 999) && s.label === "速い",
    `売れた=${s.gone} 確定待ち=${s.pending} 不明=${s.unknown} 並んでいる=${s.alive} 値段=${s.soldPrices.map((p) => p.amount).join(",")} label=${s.label}`,
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${ng === 0 ? "全部 OK" : `NG ${ng} 件`}`);
process.exit(ng === 0 ? 0 : 1);
