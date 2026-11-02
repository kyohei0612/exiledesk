// 共通アカウントの口 (docs/spec/account.md) を手元の wrangler dev で通す。本番には触らない (ACCOUNT は --var で渡すだけ)。
// node scripts/account-smoke.mjs  → 結果を 1 行ずつ、最後に wrangler を子まで止める (D1 は server/live/.wrangler の手元の写し、A-xx の見張り)
import { spawn, execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const W = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "live");
const BIN = path.join(W, "node_modules", ".bin", process.platform === "win32" ? "wrangler.CMD" : "wrangler");
const PORT = 8799, B = `http://127.0.0.1:${PORT}`;
const sh = (args, opts = {}) => execFileSync(BIN, args, { cwd: W, encoding: "utf8", shell: true, windowsHide: true, ...opts });

console.log("migrate:", sh(["d1", "migrations", "apply", "exiledesk-logs", "--local"]).split("\n").filter((l) => /0014|✅|No migrations/.test(l)).join(" | ") || "ok");
// 前の回の外れの数 (A-11) が同じ時間の中に残ると止められるので、手元の写しだけ空にする
sh(["d1", "execute", "exiledesk-logs", "--local", "--command", '"DELETE FROM account_tries"']);

const runDev = (vars) => {
  const p = spawn(BIN, ["dev", "--port", String(PORT), "--ip", "127.0.0.1", ...vars], { cwd: W, shell: true, windowsHide: true });
  let out = "";
  p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  return { p, log: () => out };
};
const killTree = (p) => { try { execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" }); } catch {} };
async function ready(dev) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    if (/Ready on/.test(dev.log())) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(dev.log().slice(-1500)); return false;
}
const post = async (p, body, headers = {}) => { const r = await fetch(B + p, { method: "POST", headers: { "content-type": "application/json", "user-agent": headers.ua ?? "Mozilla/5.0 (iPhone) Safari/605", ...headers }, body: JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => null) }; };
let pass = 0, fail = 0;
const check = (name, ok, got) => { ok ? pass++ : fail++; console.log(`${ok ? "OK " : "NG "} ${name}${ok ? "" : ` → ${JSON.stringify(got)}`}`); };

// 0) 端末の側の重ね方 (A-41、src/account/account-merge.ts を node がそのまま読む)
{
  const { changes, merge } = await import(pathToFileURL(path.join(W, "..", "..", "src", "account", "account-merge.ts")).href);
  const up = changes("recipe", [{ id: "a", updatedAt: 5, body: "A" }, { id: "b", updatedAt: 3, body: "B" }], { a: 5, c: 2 }, 99);
  check("端末: 変わった物と消した印だけ上げる", JSON.stringify(up.map((x) => [x.id, !!x.deleted])) === '[["b",false],["c",true]]', up);
  const m = merge([{ id: "a", updatedAt: 5, body: "mine" }, { id: "b", updatedAt: 9, body: "mine" }, { id: "d", updatedAt: 1, body: "old" }],
    [{ kind: "recipe", id: "a", updatedAt: 7, body: "theirs" }, { kind: "recipe", id: "b", updatedAt: 8, body: "theirs" }, { kind: "recipe", id: "d", updatedAt: 2, deleted: true }, { kind: "recipe", id: "e", updatedAt: 1, body: "new" }]);
  const got = Object.fromEntries(m.next.map((x) => [x.id, x.body]));
  check("端末: 新しい方が勝ち・消した印で消え・負けた物は控えへ", JSON.stringify(got) === '{"a":"theirs","b":"mine","e":"new"}' && m.lost.map((x) => x.id).join() === "a,d", { got, lost: m.lost });
}

// 1) スイッチなし → 404
let dev = runDev([]);
try {
  if (!(await ready(dev))) throw new Error("dev が立たない");
  const r = await post("/account/new", {});
  check("ACCOUNT なしは 404 (A-51)", r.s === 404, r);
} finally { killTree(dev.p); }
await new Promise((r) => setTimeout(r, 1500));

// 2) スイッチあり
dev = runDev(["--var", "ACCOUNT:on", "--var", "REFRESH_KEY:smoke-key-1234"]);
try {
  if (!(await ready(dev))) throw new Error("dev が立たない");
  const nick = `テスト${Date.now() % 10000}`;
  const a = await post("/account/new", { name: nick });
  check("作る: コード XXXX-XXXX-XXXX と札", a.s === 200 && /^[2-9A-HJKMNP-TV-Z]{4}(-[2-9A-HJKMNP-TV-Z]{4}){2}$/.test(a.j.code) && a.j.token.length === 32, a);
  const dup = await post("/account/new", { name: nick.replace("テスト", "ﾃｽﾄ") });
  check("同じ名前 (半角カナ) は 409 (D-52)", dup.s === 409, dup);
  const bad = await post("/account/new", { name: "admin" });
  check("運営に見える名前は 400 (D-51)", bad.s === 400, bad);
  const pc = await post("/account/link", { code: a.j.code.toLowerCase().replace(/-/g, " ") }, { ua: "Mozilla/5.0 (Windows NT 10.0) Chrome/130" });
  check("別の端末がコードでつながる (小文字・空白でも)", pc.s === 200 && pc.j.id === a.j.id && pc.j.name === nick, pc);
  const up = await post("/account/sync", { t: a.j.token, since: 0, put: [{ kind: "recipe", id: "r1", updatedAt: 100, name: "金の指輪", body: '{"id":"r1"}' }] });
  check("スマホが上げる", up.s === 200, up);
  const down = await post("/account/sync", { t: pc.j.token, since: 0, put: [] });
  check("PC が下ろす", down.s === 200 && down.j.items.length === 1 && down.j.items[0].name === "金の指輪", down);
  const old = await post("/account/sync", { t: pc.j.token, since: down.j.rev, put: [{ kind: "recipe", id: "r1", updatedAt: 50, body: '{"old":1}' }] });
  const after = await post("/account/sync", { t: a.j.token, since: 0, put: [] });
  check("古い物は新しい物を上書きしない (A-41)", old.s === 200 && after.j.items[0].body === '{"id":"r1"}', after);
  const del = await post("/account/sync", { t: pc.j.token, since: 0, put: [{ kind: "recipe", id: "r1", updatedAt: 200, deleted: true }] });
  const after2 = await post("/account/sync", { t: a.j.token, since: 0, put: [] });
  check("消した印が届く", del.s === 200 && after2.j.items[0].deleted === true, after2);
  const kind = await post("/account/sync", { t: a.j.token, since: 0, put: [{ kind: "lang", id: "x", updatedAt: 1, body: "ja" }] });
  check("運ばない物 (kind) は 400 (A-40)", kind.s === 400, kind);
  const devs = await post("/account/devices", { t: a.j.token });
  check("端末の一覧 (iPhone Safari / Windows Chrome)", devs.s === 200 && devs.j.devices.map((d) => d.label).join(",") === "iPhone Safari,Windows Chrome", devs);
  const re = await post("/account/code", { t: a.j.token, dropOthers: true });
  check("作り直す (ほかの端末を外す)", re.s === 200 && re.j.code !== a.j.code, re);
  const gone = await post("/account/sync", { t: pc.j.token, since: 0, put: [] });
  check("外された PC は 401 gone (A-14)", gone.s === 401 && gone.j.gone === true, gone);
  const oldCode = await post("/account/link", { code: a.j.code });
  check("前のコードは効かない", oldCode.s === 404, oldCode);
  const noKey = await post("/account/reissue", { id: a.j.id });
  check("復元の口は鍵なしで 401 (Y-93)", noKey.s === 401, noKey);
  const ri = await post("/account/reissue", { id: a.j.id }, { "x-exiledesk-key": "smoke-key-1234" });
  const back = await post("/account/link", { code: ri.j?.code });
  check("オーナーが出したコードで戻る (A-72)", ri.s === 200 && back.s === 200 && back.j.id === a.j.id, { ri, back });
  // 復元の台本 (A-72): 名前とレシピ名で候補を出し、--pick で新しいコードを出して戻れる。台本は REFRESH_KEY と同じ鍵で手元の口を叩く
  const r2 = await post("/account/new", { name: `復元${Date.now() % 10000}` });
  await post("/account/sync", { t: r2.j.token, since: 0, put: [{ kind: "recipe", id: "rr", updatedAt: 1, name: "安い道", body: "{}" }] });
  const month = new Date().toISOString().slice(0, 7);
  const run = (extra) => { try { return execFileSync("node", [path.join(W, "..", "..", "scripts", "account-restore.mjs"), "--name", r2.j.name, "--recipe", "安い道", "--month", month, ...extra], { encoding: "utf8", env: { ...process.env, EXILEDESK_LIVE_BASE: B, EXILEDESK_LIVE_KEY: "smoke-key-1234" } }); } catch (e) { return String(e.stdout ?? "") + String(e.stderr ?? ""); } };
  const list = run([]);
  check("復元の台本: 3 つ合う候補が出る", new RegExp(`合う +${r2.j.id}.*✓.*✓.*✓`).test(list), list);
  const issued = run(["--pick", r2.j.id]);
  const newCode = /新しいコード: (\S+)/.exec(issued)?.[1];
  const back2 = newCode ? await post("/account/link", { code: newCode }) : { s: 0 };
  check("復元の台本: --pick で出したコードで戻る", back2.s === 200 && back2.j.id === r2.j.id, { issued, back2 });
  // 推し当て (A-11): 前のコードで 1 回外したので、残り 4 回外して 6 回目が 429 (ほかの IP は無い手元なので 127.0.0.1 で数える)
  const tries = [];
  for (let i = 0; i < 5; i++) tries.push((await post("/account/link", { code: "2222-2222-2222" })).s);
  check("外れ 5 回の後は 429 (A-11)", tries.slice(0, 4).every((s) => s === 404 || s === 429) && tries[4] === 429, tries);
  const bigBody = "x".repeat(64 * 1024 + 1);
  const big = await post("/account/sync", { t: a.j.token, since: 0, put: [{ kind: "recipe", id: "big", updatedAt: 1, body: bigBody }] });
  check("64KB を越える 1 件は 400 (A-43)", big.s === 400, big.s);
} catch (e) { fail++; console.log("NG 例外", String(e)); console.log(dev.log().slice(-1500)); }
finally { killTree(dev.p); }
console.log(`--- ${pass} OK / ${fail} NG`);
