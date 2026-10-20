/**
 * 起こす仕事の列。同時に動かす claude は 1 本だけ (前のが終わってから次)。
 * 1 本 = `claude -p --output-format json` を cwd = リポジトリで。頼みの文は標準入力で渡す (Windows の引数の引用を避ける)。
 * 結果 (最後の文と session_id) は state/results/ に md で残し、知らせの webhook があれば 1 通だけ送る。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jstNow } from "./state.mjs";

const HEAD = [
  "あなたは ExileDesk の分析君です。先に docs/org/analytics/README.md を読み、その決まりどおりに動いてください。",
  "これは Discord の常駐台本 (server/discord-wake) が起こした無人の 1 回です。オーナーとは話せません。",
  "コード・KV・D1・Discord には書かない、返事 (fbr:) は置かない、commit しない、版上げ・deploy しない。読むだけです。",
  "返事は日本語で、最後の文は 15 行以内 (この文がそのままオーナーへの知らせになります)。",
].join("\n");

/** 要望・バグが届いた時の頼み */
export function feedbackPrompt({ id, content, attachPath }) {
  return [
    HEAD,
    "",
    `要望・バグが 1 件届きました (要望の id ${id})。Discord に流れた文:`,
    "```",
    content.slice(0, 2500),
    "```",
    attachPath ? `添付 (送った人の画面の状態、IP は入っていない): ${attachPath}` : "添付はありません。KV の fb:<時刻>:" + id + " を `npx wrangler kv key list --prefix fb: --remote` (server/live の設定) で探し、`kv key get` で読んでください。",
    "",
    "やること: 要点を 1 行、種類 (要望 / バグ / 質問)、振り先の部 (docs/org/black/README.md の振り先の表)、大きさ (小 / 中 / 大)、",
    "メモ (MEMORY.md の引き継ぎ・機能の今) で既に扱い中か。バグなら再現手順 (開発版の URL と押す順) も。直さないでください。",
  ].join("\n");
}

/** 日報が届いた時の頼み */
export function reportPrompt({ day, content }) {
  return [
    HEAD,
    "",
    `${day} の朝の日報が Discord に届きました:`,
    "```",
    content.slice(0, 3500),
    "```",
    "やること: 気になる所だけ 1〜3 行 (数字が急に変わった・JS エラー・要望 / バグ・異常)。気になる所が無ければ「様子見で OK」の 1 行だけ。",
  ].join("\n");
}

/** 9:30 になっても日報が来ていない時の頼み */
export function missingPrompt({ day }) {
  return [
    HEAD,
    "",
    `${day} の 9:30 (JST) になっても日報が Discord に届いていません。`,
    "やること: https://exiledesk-live.exiledesk.workers.dev/health が {\"ok\":true} を返すかを 1 回だけ見て、",
    "server/live/README.md と src/monitor.ts を読んで考えられる原因を 3 行以内で。手で日報を送り直したり、cron を動かしたりはしないでください。",
  ].join("\n");
}

/**
 * @param {{ repo: string, bin: string, permissionMode: string, allowedTools: string[], timeoutMin: number, resultsDir: string, notifyWebhook: string, dryRun: boolean, log: (m: string) => void }} cfg
 */
export function createQueue(cfg) {
  const list = [];
  let busy = false;
  mkdirSync(cfg.resultsDir, { recursive: true });

  async function notify(text) {
    if (!cfg.notifyWebhook) return;
    try {
      await fetch(cfg.notifyWebhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: text.slice(0, 1950), allowed_mentions: { parse: [] } }) });
    } catch (e) { cfg.log(`知らせの webhook に送れませんでした: ${e?.message ?? e}`); }
  }

  function runClaude(prompt) {
    return new Promise((resolve) => {
      const args = ["-p", "--output-format", "json", "--permission-mode", cfg.permissionMode];
      if (cfg.allowedTools.length) args.push("--allowedTools", ...cfg.allowedTools);
      const child = spawn(cfg.bin, args, { cwd: cfg.repo, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let out = "", err = "";
      child.stdout.on("data", (b) => { out += b; });
      child.stderr.on("data", (b) => { err += b; });
      const timer = setTimeout(() => { cfg.log(`${cfg.timeoutMin} 分を超えたので止めます`); child.kill(); }, cfg.timeoutMin * 60e3);
      child.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, text: `claude を起こせませんでした: ${e.message}`, sessionId: null }); });
      child.on("close", (code) => {
        clearTimeout(timer);
        let j = null;
        try { j = JSON.parse(out); } catch { /* 下で生のまま残す */ }
        resolve({ ok: code === 0 && !j?.is_error, text: j?.result ?? (out || err).slice(-3000), sessionId: j?.session_id ?? null, cost: j?.total_cost_usd });
      });
      child.stdin.end(prompt);
    });
  }

  async function pump() {
    if (busy) return;
    const job = list.shift();
    if (!job) return;
    busy = true;
    try {
      cfg.log(`起こします: ${job.label}`);
      const r = cfg.dryRun ? { ok: true, text: "(WAKE_DRY_RUN=1 なので claude は起こしていません)\n\n" + job.prompt, sessionId: null } : await runClaude(job.prompt);
      const { day } = jstNow();
      const file = join(cfg.resultsDir, `${day}-${job.key.replace(/[^\w.-]/g, "_")}.md`);
      writeFileSync(file, [`# ${job.label}`, "", `- 結果: ${r.ok ? "済み" : "失敗"}`, `- session: ${r.sessionId ?? "-"}${r.sessionId ? ` (続きは \`claude --resume ${r.sessionId}\`)` : ""}`, "", r.text ?? ""].join("\n"));
      cfg.log(`終わりました: ${job.label} → ${file}`);
      await notify(`🔔 **分析君** ${job.label}${r.ok ? "" : " (失敗)"}${r.sessionId ? `\n-# session ${r.sessionId}` : ""}\n${(r.text ?? "").slice(0, 1600)}`);
    } catch (e) {
      cfg.log(`起こした仕事で失敗: ${e?.stack ?? e}`);
    } finally {
      busy = false;
      setImmediate(pump);
    }
  }

  return {
    /** @param {{ key: string, label: string, prompt: string }} job */
    push(job) { list.push(job); pump(); },
    notify,
    get size() { return list.length + (busy ? 1 : 0); },
  };
}
