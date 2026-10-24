#!/usr/bin/env node
/**
 * check-www-redirect.mjs — www の Bot 向けの 301 (Cloudflare の Redirect Rules) と、トップ・シェアが今どおり返るかを本番で見る (2026-10-25)
 *
 *   node scripts/check-www-redirect.mjs [--share <id>]   … Redirect Rule を作った後・本番に出した後に 1 回ずつ (読み込みは 7 回、--share で 9 回)
 *
 * 手順と訳は docs/org/analytics/notes/2026-10-25-www-redirect-rule.md。見るだけ (何も置かない)。
 * /blog/ は今も Worker を通らない静的な道なので、www の /blog/ を Bot で開いて 301 になれば Redirect Rule が効いている印。
 */
import { execFileSync } from "node:child_process";

const BOT = { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" };
const HUMAN = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
// Node の fetch は sec-fetch-mode を自分で付けるので、名乗らないプログラムの形は curl で叩く
const NO_NAME = { curl: true };

const cases = [
  ["www の /blog/ を Bot で → 301 (Rule が効いている)", "https://www.exiledesk.com/blog/?x=1", BOT, 301, "https://exiledesk.com/blog/?x=1"],
  ["www の / を Bot で → 301", "https://www.exiledesk.com/", BOT, 301, "https://exiledesk.com/"],
  ["www の / を名乗らないプログラムで → 301", "https://www.exiledesk.com/", NO_NAME, 301, "https://exiledesk.com/"],
  ["www の / を人で → 200 (作業中のデータを消さない)", "https://www.exiledesk.com/", HUMAN, 200],
  ["exiledesk.com の / を人で → 200", "https://exiledesk.com/", HUMAN, 200],
  ["exiledesk.com の / を Bot で → 200", "https://exiledesk.com/", BOT, 200],
  ["live の /boot.json → 200", "https://exiledesk-live.exiledesk.workers.dev/boot.json", HUMAN, 200],
];
// --share <id>: シェアの /s/<id> と X のカード /og/<id>.png (Worker を通る残りの道) も見る
const share = process.argv[process.argv.indexOf("--share") + 1];
if (process.argv.includes("--share") && share) {
  cases.push([`シェア /s/${share} → 200`, `https://exiledesk.com/s/${share}`, HUMAN, 200]);
  cases.push([`カード /og/${share}.png → 200`, `https://exiledesk.com/og/${share}.png`, { "user-agent": "Twitterbot/1.0" }, 200]);
}

const curl = (url) => {
  const out = execFileSync("curl", ["-s", "-o", process.platform === "win32" ? "NUL" : "/dev/null", "-A", "curl/8", "-w", "%{http_code} %{redirect_url}", url], { encoding: "utf8", windowsHide: true }).trim().split(" ");
  return { status: Number(out[0]), location: out[1] ?? "" };
};

let bad = 0;
for (const [name, url, headers, want, loc] of cases) {
  let status, got;
  if (headers.curl) ({ status, location: got } = curl(url));
  else {
    const r = await fetch(url, { headers, redirect: "manual" });
    await r.arrayBuffer();
    status = r.status;
    got = r.headers.get("location") ?? "";
  }
  const ok = status === want && (!loc || got === loc);
  if (!ok) bad++;
  console.log(`${ok ? "OK" : "NG"}  ${status}  ${name}${got ? `  → ${got}` : ""}`);
}
console.log(bad ? `NG ${bad} 件` : "全部 OK");
process.exit(bad ? 1 : 0);
