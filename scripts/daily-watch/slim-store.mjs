/**
 * slim-store.mjs — D-32c (デイリーの控えは大きい中身を今日の 1 枠だけ) の触る道 (R-18、デイリー部長 11-18 夜)。
 *   node scripts/daily-watch/slim-store.mjs [origin]   既定 origin = http://dev.exiledesk.localhost:1461 (pnpm preview:prod -- --dev)
 * 道: 窓なし Chrome の 1 タブで origin の空ページ (/favicon.ico) を開き、端末の置き場をオーナーの本番と同じ形に埋める
 *   = exiledesk.daily.v4 に終わった前の日の挑戦 6 件 (1 件 ≒ 41 万字の相場の写し prices と木) + 今日の続けている挑戦 1 件、残りは詰め物で満杯 (残り 200 字未満)
 *   → デイリーの一覧 (?page=daily) を開く (画面の読み込みだけ。サーバーにつながらなくてよい)
 *   → 見る: 控えが縮んだ (前の日の行に prices・tree・seed・builtZ・saved が無い、成績 best・提出の印・一言・狙いは残る) / 今日の行は prices・木のまま / 名前の合言葉が残る /
 *           空いた所にシミュのレシピ程度 (20 万字) が書ける / もう一度読み直しても同じ / JS エラー 0
 * 区切りごとに progress/daily-slim-run.log へ 1 行 (RUN_LOG で替えられる)。終わりの値: 期待どおりなら 0
 */
import { appendFileSync } from "node:fs";
import { openChrome, sleep } from "../sim-watch/cdp.mjs";

const ORIGIN = (process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) ?? "http://dev.exiledesk.localhost:1461").replace(/\/$/, "");
const say = (s) => { const l = `${new Date().toTimeString().slice(0, 8)} slim-store ${s}`; if (!process.env.RUN_LOG) console.log(l); try { appendFileSync(process.env.RUN_LOG ?? "C:/Users/kyohei/ExileDesk/progress/daily-slim-run.log", l + "\n"); } catch { /* 記録が書けなくても続ける */ } };

// お題の日 (daily-api の dayNoOf・idOf と同じ = JST の 16:00 区切り)
const JST = 9 * 3600_000, H16 = 16 * 3600_000, DAY = 24 * 3600_000;
const dayNo = Math.floor((Date.now() + JST - H16) / DAY);
const idOf = (no) => `d${new Date(no * DAY).toISOString().slice(0, 10)}`;
const today = idOf(dayNo), past = [6, 5, 4, 3, 2, 1].map((k) => idOf(dayNo - k));

const c = await openChrome(Number(process.env.WATCH_PORT ?? 9377));
let bad = 0;
const check = (ok, what) => { if (!ok) bad++; say(`${ok ? "OK" : "NG"} ${what}`); };
try {
  await c.go(`${ORIGIN}/favicon.ico`);
  // 置き場を埋める (ページの中で作る = 6 + 1 件の相場の写しを毎回作る)
  const filled = await c.ev(`(() => {
    localStorage.clear();
    const prices = { items: Array.from({ length: 5200 }, (_, i) => ({ id: "Metadata/Items/Currency/CurrencyItem" + i, ex: 1.25 + i, chaos: 3.5 * i })) };
    const tree = JSON.stringify({ format: "exiledesk-recipe/1", steps: Array.from({ length: 120 }, (_, i) => ({ box: "b" + i, hand: "exalt" })) });
    const aims = [{ modId: "Wands/DamageGainedAsCold", tier: 1, ja: "冷気", en: "Cold" }];
    const tries = {};
    ${JSON.stringify(past)}.forEach((id, i) => {
      tries[id] = { topicId: id, startedAt: Date.now() - (7 - i) * 86400000, aims, base: "Wand", ilvl: 82, seed: 12345 + i, prices, fractured: "Wands/DamageGainedAsCold", from: "frac", tree, treeAt: Date.now() - 86400000, saved: tree, builtZ: "eJy" + "A".repeat(3000), ended: true, submitted: i % 2 === 0, best: i % 2 === 0 ? { cost: 100 + i, rate: 0.5, ms: 1800000 } : undefined, last: { cost: 100 + i, rate: 0.5, ms: 1800000 }, note: i === 2 ? "ひとこと" : undefined };
    });
    tries[${JSON.stringify(today)}] = { topicId: ${JSON.stringify(today)}, startedAt: Date.now() - 600000, aims, base: "Wand", ilvl: 82, seed: 999, prices, fractured: "Wands/DamageGainedAsCold", from: "frac", tree, treeAt: Date.now() };
    localStorage.setItem("exiledesk.daily.v4", JSON.stringify({ nick: { id: "n-test", name: "slimtest", code: "code-keep" }, tries, box: [] }));
    // 詰め物: 書けなくなるまで足し、最後は 1 字ずつ詰める
    let n = 0;
    for (const size of [1 << 20, 1 << 16, 1 << 12, 1 << 8, 16, 1]) {
      for (;;) { try { localStorage.setItem("x.fill" + n, "f".repeat(size)); n++; } catch { break; } }
    }
    let total = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); total += k.length + localStorage.getItem(k).length; }
    let canWrite = true; try { localStorage.setItem("x.probe", "p".repeat(2000)); localStorage.removeItem("x.probe"); } catch { canWrite = false; }
    return { daily: localStorage.getItem("exiledesk.daily.v4").length, total, canWrite };
  })()`);
  say(`埋めた: daily.v4 ${filled.daily} 字・合計 ${filled.total} 字・2000 字を書ける ${filled.canWrite}`);
  check(filled.daily > 2_500_000 && !filled.canWrite, "前: 置き場が満杯で daily.v4 が 250 万字超");

  for (const round of [1, 2]) {
    await c.go(`${ORIGIN}/web.html?page=daily`);
    await c.until(`!!document.querySelector("[data-daily-hero], [data-daily-page], main")`, 20000);
    await sleep(2500);
    const r = await c.ev(`(() => {
      const raw = localStorage.getItem("exiledesk.daily.v4"); const j = JSON.parse(raw);
      const big = ["prices", "seed", "tree", "treeAt", "builtZ", "saved"];
      const pastRows = ${JSON.stringify(past)}.map((id) => j.tries[id]);
      const t = j.tries[${JSON.stringify(today)}];
      let canWrite = true; try { localStorage.setItem("x.probe", "p".repeat(200000)); localStorage.removeItem("x.probe"); } catch { canWrite = false; }
      return {
        len: raw.length,
        pastBig: pastRows.filter((x) => !x || big.some((k) => k in x)).length,
        pastKeep: pastRows.every((x) => x && x.ended && "last" in x && x.aims?.length && x.startedAt) && pastRows.filter((x) => x.submitted && x.best).length === 3 && pastRows[2].note === "ひとこと",
        todayFull: !!(t && t.prices?.items?.length === 5200 && t.tree && t.seed === 999 && t.treeAt),
        nick: j.nick?.code === "code-keep",
        canWrite,
      };
    })()`);
    say(`${round} 回目: daily.v4 ${r.len} 字・前の日の大きい行 ${r.pastBig}・20 万字を書ける ${r.canWrite}`);
    check(r.len < 700_000, `${round} 回目: daily.v4 が縮んだ (70 万字未満 = 今日の 1 枠 + 小さい行)`);
    check(r.pastBig === 0, `${round} 回目: 前の日の行に相場の写し・木が無い`);
    check(r.pastKeep, `${round} 回目: 前の日の成績・提出の印・一言・狙いが残る`);
    check(r.todayFull, `${round} 回目: 今日の続けている挑戦は相場の写し・種・木のまま`);
    check(r.nick, `${round} 回目: 名前の合言葉が残る`);
    check(r.canWrite, `${round} 回目: 空いた所にシミュのレシピ程度 (20 万字) が書ける`);
  }
  check(c.errors.length === 0, `JS エラー ${c.errors.length}${c.errors.length ? " (" + c.errors.slice(0, 3).join(" / ") + ")" : ""}`);
} catch (e) {
  bad++; say(`中止: ${e?.message ?? e}`);
} finally {
  c.close();
}
say(bad ? `済み NG ${bad}` : "済み 全部 OK");
process.exit(bad ? 1 : 0);
