// 相場の控え (2026-10-10 オーナー「一番ダメなのはサーバーにアクセスできなくなる事」)。
// Web 版を出すたびに今の相場を dist-web/market-fallback.json に置く。画面と同じ静的なファイルの置き場 (数えられない・上限なし) なので、
// サーバー (exiledesk-live) が無料枠を使い切ったり落ちたりしても、値段だけはこれで出せる (出した時点の値段)。失敗してもビルドは止めない
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.WEB_OUT || "dist-web";
const SCOUT = "https://api.poe2scout.com";
const UA = { accept: "application/json", "user-agent": "ExileDesk-web/0.1 (https://github.com/kyohei0612/exiledesk)" };
try {
  const get = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.json(); };
  const leagues = await get(`${SCOUT}/poe2/Leagues`);
  const cur = leagues.find((l) => l.IsCurrent && !l.Value.startsWith("HC")) ?? leagues[0] ?? null;
  const items = cur ? await get(`${SCOUT}/poe2/Leagues/${encodeURIComponent(cur.Value)}/Items`) : [];
  if (!items.length) throw new Error("品目が 0 件");
  writeFileSync(join(OUT, "market-fallback.json"), JSON.stringify({ at: new Date().toISOString(), leagues, league: cur?.Value ?? null, items }));
  console.log(`相場の控え: ${cur?.Value} 品目 ${items.length}`);
} catch (e) {
  console.warn("相場の控えは作れなかった (前の版の物は無くなる):", String(e));
}
