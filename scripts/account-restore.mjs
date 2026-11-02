#!/usr/bin/env node
/**
 * account-restore.mjs — アカウントの復元 (docs/spec/account.md A-70〜72)。オーナーの手元の道具。
 *
 *   node scripts/account-restore.mjs --fb <要望の id>                     要望の context.account から候補を出す
 *   node scripts/account-restore.mjs --name 名前 --recipe 金の指輪 --month 2026-11   手で入れて候補を出す
 *   ... --pick <account_id>                                               その候補に新しいコードを出し、返事 (R-20) の下書きを出す
 *
 * 既定は手元 (wrangler dev の D1 --local と http://127.0.0.1:8799)。本番は --remote を付けた時だけ:
 *   D1 は `wrangler d1 execute --remote` (オーナーの login、Y-91)、口は EXILEDESK_LIVE_BASE (既定 exiledesk-live) に EXILEDESK_LIVE_KEY (x-exiledesk-key、Y-93)。
 * 返事は置かない (置くのはブラック経由でオーナーの OK の後、R-20)。合うかの決め: 名前・レシピ名・作った月の 2 つ以上 (A-71)
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIVE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "live");
const BIN = path.join(LIVE, "node_modules", ".bin", process.platform === "win32" ? "wrangler.CMD" : "wrangler");

const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const all = (k) => argv.flatMap((a, i) => (a === k && argv[i + 1] ? [argv[i + 1]] : []));
const REMOTE = argv.includes("--remote");
const BASE = (REMOTE ? process.env.EXILEDESK_LIVE_BASE ?? "https://exiledesk-live.exiledesk.workers.dev" : process.env.EXILEDESK_LIVE_BASE ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const KEY = process.env.EXILEDESK_LIVE_KEY ?? (REMOTE ? "" : "smoke-key-1234");

/** サーバーと同じそろえ方 (account.ts の nameKey、D-52) */
const nameKey = (s) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
function d1(sql) {
  const out = execFileSync(BIN, ["d1", "execute", "exiledesk-logs", REMOTE ? "--remote" : "--local", "--json", "--command", JSON.stringify(sql)], { cwd: LIVE, encoding: "utf8", shell: true, windowsHide: true });
  return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? [];
}

async function hintsFromFeedback(id) {
  if (!KEY) throw new Error("EXILEDESK_LIVE_KEY が無い (要望を読む口は鍵が要る)");
  const r = await fetch(`${BASE}/feedback/${encodeURIComponent(id)}.json`, { headers: { "x-exiledesk-key": KEY } });
  if (!r.ok) throw new Error(`要望 ${id} が読めない (HTTP ${r.status})`);
  const fb = await r.json();
  const a = fb?.context?.account ?? {};
  if (!a.restore) console.log("※ この要望は復元の型ではない (context.account.restore が無い)。本文を見て手で --name などを入れる");
  console.log(`要望 ${id}: ${String(fb.text ?? "").slice(0, 120)}`);
  return { name: typeof a.name === "string" ? a.name : undefined, recipes: Array.isArray(a.recipes) ? a.recipes.filter((x) => typeof x === "string").slice(0, 2) : [], month: typeof a.since === "string" ? a.since : undefined };
}

function candidates({ name, recipes, month }) {
  const ors = [];
  if (name) ors.push(`a.name_key = ${q(nameKey(name))}`);
  if (recipes.length) ors.push(`a.id IN (SELECT account_id FROM account_items WHERE deleted = 0 AND kind = 'recipe' AND name IN (${recipes.map(q).join(", ")}))`);
  if (!ors.length) throw new Error("名前かレシピ名のどちらかが要る");
  const rows = d1(`SELECT a.id, a.name, a.created, a.synced, (SELECT group_concat(name, '|') FROM account_items i WHERE i.account_id = a.id AND i.deleted = 0) AS recipes FROM accounts a WHERE ${ors.join(" OR ")} LIMIT 20`);
  return rows.map((r) => {
    const mine = String(r.recipes ?? "").split("|").filter(Boolean);
    const hits = { name: !!name && nameKey(r.name ?? "") === nameKey(name), recipe: recipes.some((x) => mine.includes(x)), month: !!month && new Date(r.created).toISOString().slice(0, 7) === month };
    return { ...r, mine, hits, score: Object.values(hits).filter(Boolean).length };
  }).sort((a, b) => b.score - a.score);
}

async function main() {
  const fbId = arg("--fb");
  const hints = fbId ? await hintsFromFeedback(fbId) : { name: arg("--name"), recipes: all("--recipe").slice(0, 2), month: arg("--month") };
  console.log(`探す: 名前 ${hints.name ?? "-"} / レシピ ${hints.recipes.join("・") || "-"} / 月 ${hints.month ?? "-"} (${REMOTE ? "本番" : "手元"})`);
  const list = candidates(hints);
  if (!list.length) { console.log("候補なし → 返事は「見つかりませんでした。別の名前で作り直してください」"); return; }
  for (const c of list) {
    const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : "-");
    console.log(`${c.score >= 2 ? "合う  " : "足りない"} ${c.id}  名前 ${c.name ?? "-"}${c.hits.name ? "✓" : ""}  レシピ ${c.mine.length} 件${c.hits.recipe ? "✓" : ""}  作成 ${day(c.created)}${c.hits.month ? "✓" : ""}  最後の同期 ${day(c.synced)}`);
  }
  const pick = arg("--pick");
  if (!pick) { console.log("出す時は --pick <id> を足す (2 つ以上合う物だけ、A-71)"); return; }
  const c = list.find((x) => x.id === pick);
  if (!c) throw new Error(`${pick} は候補に無い`);
  if (c.score < 2 && !argv.includes("--force")) throw new Error(`${pick} は合うのが ${c.score} つ (2 つ以上で出す。それでも出すなら --force)`);
  if (!KEY) throw new Error("EXILEDESK_LIVE_KEY が無い");
  const r = await fetch(`${BASE}/account/reissue`, { method: "POST", headers: { "content-type": "application/json", "x-exiledesk-key": KEY }, body: JSON.stringify({ id: pick }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`コードを出せない: ${j.error ?? r.status}`);
  console.log(`新しいコード: ${j.code} (前のコードはもう効かない)`);
  console.log("--- 返事の下書き (R-20、オーナーの OK の後に置く) ---");
  console.log(`アカウントを確かめました。新しい引き継ぎコードは ${j.code} です。右上の「アカウント」→「コードを入れる」で入れてください。このコードは人に見せないでください。`);
}
main().catch((e) => { console.error(`止めた: ${e.message}`); process.exit(1); });
