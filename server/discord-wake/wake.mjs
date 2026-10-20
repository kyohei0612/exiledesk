/**
 * 分析君を「Discord に来た時だけ」起こす常駐台本 (2026-10-20、設計は共有メモ bunseki-wake-design.md)。
 *
 *   Discord Bot で Gateway につなぎ、見張るのは 2 つのチャンネルだけ:
 *   - 要望・バグのチャンネル: webhook の投稿の最後の行「-# 要望の id <id>」→ claude -p を 1 本 (同じ id は 1 回)
 *   - 日報のチャンネル: 「📊 **ExileDesk 日報」で始まる webhook の投稿 → その日 1 回だけ起こす
 *   - 9:30 (JST) になっても日報が無ければ知らせて、原因を見る 1 本を起こす
 *   見張り自体に Claude は使わない。起こした claude は同時に 1 本 (jobs.mjs の列)。
 *
 * 動かし方: node --env-file-if-exists=.env wake.mjs   (設定は .env.example、オーナーの手順は README.md)
 * トークンは環境変数から読むだけ。ファイルにもログにも書かない。
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectGateway, discordGet, INTENTS } from "./gateway.mjs";
import { openState, jstNow, snowLess } from "./state.mjs";
import { createQueue, feedbackPrompt, reportPrompt, missingPrompt } from "./jobs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const STATE_DIR = env.WAKE_STATE_DIR || join(HERE, "state");
mkdirSync(STATE_DIR, { recursive: true });

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}`;
  console.log(line);
  try { appendFileSync(join(STATE_DIR, "wake.log"), line + "\n"); } catch { /* ログが書けなくても止めない */ }
}

const TOKEN = (env.DISCORD_BOT_TOKEN || "").trim();
const FEEDBACK_CH = (env.WAKE_FEEDBACK_CHANNEL_ID || "").trim();
const REPORT_CH = (env.WAKE_REPORT_CHANNEL_ID || "").trim();
if (!TOKEN || !FEEDBACK_CH || !REPORT_CH) {
  log("DISCORD_BOT_TOKEN・WAKE_FEEDBACK_CHANNEL_ID・WAKE_REPORT_CHANNEL_ID が要ります (.env.example を見て .env を作る)");
  process.exit(2);
}

const DAILY_MAX = Number(env.WAKE_DAILY_MAX || 10);
// 起こさない時間 (JST、"1-7" = 1:00〜6:59)。その間に来た物は明けてから起こす
const [quietFrom, quietTo] = (env.WAKE_QUIET_HOURS || "").split("-").map(Number);
const isQuiet = (h) => Number.isFinite(quietFrom) && Number.isFinite(quietTo) && (quietFrom <= quietTo ? h >= quietFrom && h < quietTo : h >= quietFrom || h < quietTo);

const queue = createQueue({
  repo: env.WAKE_REPO || join(HERE, "..", ".."),
  bin: env.WAKE_CLAUDE_BIN || join(env.APPDATA || "", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
  permissionMode: env.WAKE_PERMISSION_MODE || "default",
  // 既定は読むだけ (Read・Grep・Glob と、KV / D1 を読む wrangler・取り出しの台本)。書く道具は入れない
  allowedTools: (env.WAKE_ALLOWED_TOOLS || "Read|Grep|Glob|Bash(npx wrangler kv key list:*)|Bash(npx wrangler kv key get:*)|Bash(node scripts/pull-logs.mjs:*)|WebFetch(domain:exiledesk-live.exiledesk.workers.dev)").split("|").map((x) => x.trim()).filter(Boolean),
  timeoutMin: Number(env.WAKE_TIMEOUT_MIN || 20),
  resultsDir: join(STATE_DIR, "results"),
  notifyWebhook: (env.WAKE_NOTIFY_WEBHOOK || "").trim(),
  dryRun: env.WAKE_DRY_RUN === "1",
  log,
});

const { s, save } = openState(STATE_DIR);
const held = []; // 起こさない時間に来た物

/** 1 日の上限と起こさない時間を見てから列へ */
function wake(job) {
  const { day, hour } = jstNow();
  if (isQuiet(hour)) { held.push(job); log(`起こさない時間なので後で: ${job.label}`); return; }
  const n = s.daily[day] ?? 0;
  if (n >= DAILY_MAX) {
    log(`今日はもう ${n} 回起こしたので見送り: ${job.label}`);
    queue.notify(`⏸ **分析君** 今日の上限 (${DAILY_MAX} 回) なので起こしませんでした: ${job.label}`);
    return;
  }
  s.daily[day] = n + 1;
  save();
  queue.push(job);
}

/** 添付の JSON (feedback-<id>.json) を手元に落とす。claude にはその場所を渡す */
async function saveAttachment(msg, id) {
  const a = (msg.attachments ?? []).find((x) => /\.json$/i.test(x.filename ?? ""));
  if (!a?.url) return null;
  try {
    const r = await fetch(a.url);
    if (!r.ok) throw new Error(String(r.status));
    const dir = join(STATE_DIR, "attach");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${id}.json`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    return file;
  } catch (e) {
    log(`添付を落とせませんでした (${id}): ${e?.message ?? e}`);
    return null;
  }
}

async function onMessage(msg) {
  if (msg.channel_id !== FEEDBACK_CH && msg.channel_id !== REPORT_CH) return;
  const prev = s.lastMsg[msg.channel_id];
  if (!prev || snowLess(prev, msg.id)) { s.lastMsg[msg.channel_id] = msg.id; save(); }
  // 人の書き込み・他の Bot は見ない (Worker の webhook の投稿だけ)
  if (!msg.webhook_id) return;
  const content = String(msg.content ?? "");

  if (msg.channel_id === FEEDBACK_CH) {
    const m = content.match(/要望の id ([0-9a-z]{6,16})\s*$/i);
    if (!m) return; // 「🖼 画像が届きました」などは起こさない
    const id = m[1];
    if (s.feedback[id]) return;
    s.feedback[id] = new Date().toISOString();
    save();
    const attachPath = await saveAttachment(msg, id);
    wake({ key: `fb-${id}`, label: `要望・バグ ${id}`, prompt: feedbackPrompt({ id, content, attachPath }) });
    return;
  }

  if (/^📊 \*\*ExileDesk 日報/.test(content)) {
    const { day } = jstNow(Date.parse(msg.timestamp) || Date.now());
    const was = s.report[day];
    if (was === "woke" || was === "late") return;
    s.report[day] = was === "missing" ? "late" : "woke";
    save();
    wake({ key: `report-${day}`, label: `${day} の日報${was === "missing" ? " (遅れて届いた)" : ""}`, prompt: reportPrompt({ day, content }) });
  }
}

/** 止まっていた間の投稿を読み直す (最後に見た投稿より後だけ。初めての時は読み直さず、今から見る) */
async function catchUp() {
  for (const ch of [FEEDBACK_CH, REPORT_CH]) {
    const after = s.lastMsg[ch];
    if (!after) continue;
    try {
      const list = await discordGet(TOKEN, `/channels/${ch}/messages?after=${after}&limit=50`);
      list.sort((a, b) => (snowLess(a.id, b.id) ? -1 : 1));
      if (list.length) log(`止まっていた間の投稿 ${list.length} 件を読み直します (${ch})`);
      for (const m of list) await onMessage(m);
    } catch (e) {
      log(`読み直しに失敗 (${ch}): ${e?.message ?? e}`);
    }
  }
}

// 1 分ごと: 起こさない時間が明けたら溜めた物を出す、9:30 に日報が無ければ知らせる
setInterval(() => {
  const { day, hour, min } = jstNow();
  if (held.length && !isQuiet(hour)) for (const job of held.splice(0)) wake(job);
  if ((hour > 9 || (hour === 9 && min >= 30)) && !s.report[day]) {
    s.report[day] = "missing";
    save();
    log(`${day} の日報が 9:30 になっても来ていません`);
    queue.notify(`⚠️ **分析君** ${day} の日報が 9:30 (JST) になっても届いていません`);
    wake({ key: `report-missing-${day}`, label: `${day} の日報が来ていない`, prompt: missingPrompt({ day }) });
  }
}, 60_000);

const gw = connectGateway({
  token: TOKEN,
  intents: INTENTS.GUILDS | INTENTS.GUILD_MESSAGES | INTENTS.MESSAGE_CONTENT,
  log,
  onDispatch(t, d) {
    if (t === "READY") { catchUp(); return; }
    if (t === "MESSAGE_CREATE") onMessage(d).catch((e) => log(`投稿の処理で失敗: ${e?.stack ?? e}`));
  },
  onFatal(code, reason) {
    const why = code === 4004 ? "トークンが違います" : code === 4014 ? "Message Content Intent が OFF です (Developer Portal → Bot)" : "設定が違います";
    log(`Discord に断られました (code ${code} ${reason || ""}): ${why}。止めます`);
    // すぐ再起動されて同じ事を繰り返さないよう、少し待ってから終わる
    setTimeout(() => process.exit(3), 5 * 60_000);
  },
});

// 初めての起動で、今日の 9:30 を過ぎていても「来ていない」と騒がないように、今日は見た事にする
{
  const { day, hour, min } = jstNow();
  if ((hour > 9 || (hour === 9 && min >= 30)) && !s.report[day] && !Object.keys(s.lastMsg).length) { s.report[day] = "woke"; save(); }
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { log("止めます"); gw.close(); process.exit(0); });
log(`待ち受けを始めます (要望 ${FEEDBACK_CH} / 日報 ${REPORT_CH}${env.WAKE_DRY_RUN === "1" ? "、DRY RUN" : ""})`);
