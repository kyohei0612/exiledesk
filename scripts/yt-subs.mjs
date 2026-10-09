#!/usr/bin/env node
/**
 * yt-subs.mjs — YouTube の字幕を取って、読める文にして保存する (2026-10-09 オーナー「字幕ダウンローダー的な奴、簡易でいいから。これ打ったら字幕が取れるみたいなの」)
 *
 *   pnpm subs <URL か動画 ID> [言語 (既定 en,ja)]
 *   pnpm subs <落とした .srt / .vtt>   (拡張機能 YouTube Subtitle Downloader などで落とした物を同じ形にそろえる)
 *   例: pnpm subs https://www.youtube.com/watch?v=o3Fh1DJmxBA
 *       pnpm subs o3Fh1DJmxBA ja
 *       pnpm subs "C:/Users/kyohei/Downloads/動画名.en.srt"
 *
 * 中身は yt-dlp。字幕は YouTube がブラウザらしさを求めるので、なりすましの部品込みで入れる:
 *   pip install -U "yt-dlp[default,curl-cffi]"
 * 動画は落とさず字幕だけ。429 で断られ続ける時は、自分のブラウザの YouTube のログインを使う: YT_COOKIES=chrome pnpm subs <URL>
 * 手で付けた字幕があればそれ、無ければ自動の字幕。言語ごとに data-cache/subs/<ID>.<言語>.txt へ
 * (30 秒ごとに [分:秒] を頭に付けた段落。data-cache/saveq-subtitles と同じ形)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [input, langArg = "en,ja"] = process.argv.slice(2);
if (!input) {
  console.error("使い方: pnpm subs <URL か動画 ID> [言語 (既定 en,ja)]  /  pnpm subs <落とした .srt か .vtt>");
  process.exit(1);
}
// 落とした字幕のファイル (.srt / .vtt。ブラウザの拡張機能 YouTube Subtitle Downloader など) は、同じ形にそろえて保存するだけ
// (2026-10-09: yt-dlp は 429 で断られたが、拡張機能では取れた)
if (/\.(srt|vtt)$/i.test(input) && existsSync(input)) {
  const raw = readFileSync(input, "utf8").replace(/\r/g, "");
  const events = [];
  for (const block of raw.split(/\n\n+/)) {
    const lines = block.split("\n").filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/^WEBVTT/.test(l));
    const time = lines.find((l) => l.includes("-->"));
    if (!time) continue;
    const [h, m, s] = time.split("-->")[0].trim().replace(",", ".").split(":").map(Number);
    const ms = Math.round(((h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0)) * 1000);
    const text = lines.filter((l) => l !== time).join(" ").replace(/<[^>]+>/g, "");
    events.push({ tStartMs: ms, segs: [{ utf8: text }] });
  }
  const name = basename(input).replace(/\.(srt|vtt)$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
  const dir = join(ROOT, "data-cache", "subs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.txt`);
  const text = toText({ events });
  writeFileSync(path, text);
  console.log(`${events.length.toLocaleString()} 行 → ${text.length.toLocaleString()} 字 → ${path}`);
  process.exit(0);
}
const id = /^[\w-]{11}$/.test(input) ? input : (/(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/.exec(input)?.[1] ?? null);
if (!id) {
  console.error(`動画 ID が読めない: ${input}`);
  process.exit(1);
}
const langs = langArg.split(",").map((s) => s.trim()).filter(Boolean);
const url = `https://www.youtube.com/watch?v=${id}`;
const tmp = mkdtempSync(join(tmpdir(), "yt-subs-"));
const out = join(ROOT, "data-cache", "subs");
mkdirSync(out, { recursive: true });

/** yt-dlp で字幕だけ (json3)。manual = 手で付けた字幕、そうでなければ自動の字幕 */
function fetchSubs(manual) {
  // YT_COOKIES=chrome などで、そのブラウザの YouTube のログインを使う (429 で断られ続ける時。自分の PC で自分が打つ時だけ)
  const cookies = process.env.YT_COOKIES ? ["--cookies-from-browser", process.env.YT_COOKIES] : [];
  const args = [...cookies, "--js-runtimes", "node", "--skip-download", manual ? "--write-subs" : "--write-auto-subs", "--sub-langs", langs.join(","), "--sub-format", "json3", "-o", join(tmp, `${manual ? "m" : "a"}.%(ext)s`), url];
  try {
    execFileSync("yt-dlp", args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const msg = String(e.stderr ?? e.message ?? e);
    if (/ENOENT/.test(msg)) { console.error("yt-dlp が見つからない。`pip install -U yt-dlp` で入れてください"); process.exit(1); }
    // 429 = YouTube がブラウザらしさを求めて断った。なりすましの部品 (curl_cffi) を入れると通る
    if (/429/.test(msg)) { console.error('YouTube に断られた (429)。何度も取った後はしばらく待つ。続く時はブラウザのログインを使う: YT_COOKIES=chrome pnpm subs <URL> (なりすましの部品が無ければ pip install -U "yt-dlp[default,curl-cffi]")'); return; }
    console.error(msg.split("\n").filter((l) => /ERROR/.test(l)).slice(0, 3).join("\n"));
  }
}
fetchSubs(true);
fetchSubs(false);

/** json3 → 30 秒ごとの段落 ([分:秒] 本文) */
function toText(json) {
  const parts = [];
  for (const ev of json.events ?? []) {
    const t = (ev.segs ?? []).map((s) => s.utf8 ?? "").join("").replace(/\s+/g, " ").trim();
    if (t) parts.push({ ms: ev.tStartMs ?? 0, t });
  }
  const lines = [];
  let start = null, buf = [];
  const stamp = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  for (const p of parts) {
    if (start == null) start = p.ms;
    // 自動の字幕は同じ文が重なって出るので、直前と同じなら飛ばす
    if (buf[buf.length - 1] !== p.t) buf.push(p.t);
    if (p.ms - start >= 30_000) { lines.push(`[${stamp(start)}] ${buf.join(" ")}`); start = null; buf = []; }
  }
  if (buf.length) lines.push(`[${stamp(start ?? 0)}] ${buf.join(" ")}`);
  return lines.join("\n\n") + "\n";
}

const files = readdirSync(tmp).filter((f) => f.endsWith(".json3"));
const saved = [];
for (const lang of langs) {
  // 手で付けた字幕を先に。言語は ja / ja-JP / en-US などもまとめて見る
  const pick = ["m", "a"].map((k) => files.find((f) => f.startsWith(`${k}.`) && (f === `${k}.${lang}.json3` || f.startsWith(`${k}.${lang}-`)))).find(Boolean);
  if (!pick) continue;
  const text = toText(JSON.parse(readFileSync(join(tmp, pick), "utf8")));
  const path = join(out, `${id}.${lang}.txt`);
  writeFileSync(path, text);
  saved.push({ lang, kind: pick.startsWith("m.") ? "手の字幕" : "自動の字幕", path, chars: text.length });
}
rmSync(tmp, { recursive: true, force: true });

if (!saved.length) {
  console.error(`字幕が見つからない (${langs.join(", ")})。言語を変えて試す: pnpm subs ${id} en`);
  process.exit(1);
}
for (const s of saved) console.log(`${s.lang} (${s.kind}) ${s.chars.toLocaleString()} 字 → ${s.path}`);
