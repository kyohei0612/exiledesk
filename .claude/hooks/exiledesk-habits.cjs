// ExileDesk の AI の癖の見張り (10-29 オーナー「全部フックでええんやないか」・「フックはAI専門みたいな使い方しないとね」)
// 決まりの正は設計図 docs/spec/README.md ⑥
// Stop (G-36・G-45 ③): 返事を終える時に、このセッションが残したスクリーンショット・確認の Chrome・自分で立てた dev サーバー・止め残りの子プロセス・
//   「済み」で終わらず伸びていない回しの記録を知らせる (1 回だけ止めて片付けさせる)
// UserPromptSubmit (G-37): セッションが長くなったら (2,000 件で控えを立て、2,500 件前後で引き継ぎを書いて交代する) よう差し込む (メモ feedback-request-rules の 4)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

// repo の中の物 (.claude/hooks/)。道はこのファイルの置き場から引く (セッションの置き場の名前 = 道の : / \ を - に替えた物)
const REPO = path.resolve(__dirname, "../..");
const PROJ = REPO.replace(/[:\\/]/g, "-");
const LONG = 2500;
const SPARE = 2000;

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const ev = input.hook_event_name || "";
  const sid = String(input.session_id || "");
  const tp = String(input.transcript_path || "");

  if (ev === "UserPromptSubmit") {
    // 始まりの 1 行: フックが入っている事と版 (この行が出ない PC はフックが入っていない)
    if (firstTime(sid, "hooks-on")) {
      let ver = "";
      try { ver = execSync('git log -1 --format=%h_%cd --date=short -- .claude/hooks scripts/check-spec-tidy.mjs', { cwd: REPO, encoding: "utf8", windowsHide: true, timeout: 4000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch {}
      process.stdout.write(`【フック】ExileDesk の見張りが入っている (.claude/hooks/、版 ${ver || "不明"})。\n`);
    }
    const n = countLines(tp);
    // 控えはオーナーが話した番に立てる (ほかの番では立たずに許可のカードになる。オーナー 11-06「2500上限で2000超えたら立ち上げる」「他部長も2000超えたら報告してくるからそこはどうするの」)
    // 部長は報告だけ、ブラックはオーナーの番に自分と部長の分をまとめて立てる。部長の数はブラックの番にこのフックが数えて出す
    const desk = desktopSessions();
    const black = isBlack(tp, desk.get(sid));
    const prompt = String(input.prompt || "");
    // 部長の報告・自動チェックの番は、頭に system-reminder などが付くので文の中のどこかで見る (11-07 オーナーの番だけに出す)
    const ownerTurn = !/<cross-session-message|<side-sessions-event|<task-notification|【自動チェック|Another Claude session sent a message/.test(prompt);
    if (n >= LONG)
      process.stdout.write(`【長さ】このセッションは ${n} 件になった (${LONG} 前後で交代の決まり、メモ feedback-request-rules)。今の頼みの区切りで引き継ぎを書いて止まり、控えに交代する (ブラックならオーナーに交代を言う)。\n`);
    else if (n >= SPARE && !black && firstTime(sid, SPARE))
      process.stdout.write(`【長さ】このセッションは ${n} 件 (${SPARE} を超えた、上限は ${LONG})。ブラックに「${SPARE} 超え」と 1 行だけ報告して仕事は続ける。控えはブラックがオーナーの番に立てる。\n`);
    if (black && ownerTurn) {
      const longs = longSessions(tp, desk);
      if (n >= SPARE && !handedOver(desk.get(sid), desk)) longs.unshift(`ブラック自身 (${n} 件)`);
      if (longs.length)
        process.stdout.write(`【控え】${SPARE} 件を超えたセッション: ${longs.join("・")}。オーナーが話したこの番のうちに控えを立てて読ませて待たせる (上限 ${LONG}、メモ feedback-ask-before-spawn)。もう控えがあれば立てない。\n`);
    }
    process.exit(0);
  }

  if (ev !== "Stop" || input.stop_hook_active) process.exit(0);
  const todo = [];

  // 1. スクリーンショットの消し忘れ (このセッションの置き場だけ。G-36)
  // worktree のセッションは置き場の名前が PROJ--claude-worktrees-<名前> になる
  const projs = (() => { try { return fs.readdirSync(path.join(os.tmpdir(), "claude")).filter((d) => d.startsWith(PROJ)); } catch { return [PROJ]; } })();
  const dirs = [
    ...projs.flatMap((p) => [path.join(os.tmpdir(), "claude", p, sid, "scratchpad"), path.join(os.tmpdir(), "claude", p, sid, "images")]),
    path.join(os.homedir(), ".claude", "projects", PROJ, sid, "tool-results"),
  ];
  const shots = [];
  for (const d of dirs) for (const f of walk(d)) if (/\.(png|jpe?g|webp)$/i.test(f)) shots.push(f);
  if (shots.length) todo.push(`スクリーンショットが ${shots.length} 枚残っている (見終わったら・送った後はすぐ消す、ゴミ箱を通さない): ${shots.slice(0, 4).join(" , ")}${shots.length > 4 ? " ほか" : ""}`);

  // 2. 確認の Chrome と、このセッションが立てた dev サーバー (1440 はブラックの確かめ用なので数えない)
  const text = readTail(tp, 3_000_000);
  const listen = listeningPorts();
  const mine = [];
  for (const p of [1441, 1442, 1443, 1444, 1445, 1460, 1461, 9222, 9372, 9381, 9382])
    // 自分が打ったコマンド (tool_use の command) の中に番号がある時だけ数える (読んだ引き継ぎの文に出てくる番号は数えない)
    if (listen.has(p) && new RegExp(`"command":"[^"]*(port[ =]?|:)${p}\\b`).test(text)) mine.push(p);
  if (mine.length) todo.push(`このセッションが立てたらしいサーバー・確認の Chrome がまだ動いている (port ${mine.join("・")})。使い終わったなら止める (Chrome は chrome-devtools-mcp を含む chrome.exe だけ。G-36・CLAUDE.md「いつも」)。まだ使う・ほかのセッションの物なら、そのままでよい`);

  // 3. 止め残り (G-26、11-03): 裏の Bash を TaskStop で止めても、Windows では中の台本と子 (vitest など) が親なしで回り続ける。
  //    親の死んだ bash / node / python のうち、コマンドにこのセッションの置き場 (sid) か worktree が入る物を知らせる
  const orphans = orphanProcs(sid, String(input.cwd || ""));
  // 回し中 (このセッションの -run.log が 1 分以内に伸びて「済み」で終わっていない) なら、親の死んだ台本は今の回しの本体なので知らせない (G-45)
  if (orphans.length && !liveRunLog(text)) todo.push(`止め残りの子プロセスが回っている (G-26。TaskStop では子が残る): ${orphans.slice(0, 3).map((p) => `PID ${p.ProcessId} ${String(p.CommandLine).slice(0, 80)}`).join(" , ")}。台本の bash から taskkill /T /F /PID <PID> で木ごと止め、残り 0 を見る`);

  // 4. 回しの記録 (G-45): このセッションのコマンドに出てくる -run.log のうち、「済み」で終わらず 1 分以上伸びていない物
  const stale = staleRunLogs(text);
  if (stale.length) todo.push(`回しの記録が「済み」で終わらず 1 分以上伸びていない (G-45): ${stale.slice(0, 3).join(" , ")}。回っているなら Monitor で見て進んでいるか確かめ、止まっているなら止めて理由を板 (progress/<名前>.md の 詰まり) に書き、最後に「済み」か「中止: 理由」の 1 行を足す`);

  if (todo.length) {
    process.stdout.write(JSON.stringify({ decision: "block", reason: `[ExileDesk の片付け] 返事を終える前に:\n- ${todo.join("\n- ")}` }));
  }
  process.exit(0);
});

function countLines(p) {
  try { const s = fs.readFileSync(p, "utf8"); let n = 0; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++; return n; } catch { return 0; }
}
function readHead(p, max) {
  try { const fd = fs.openSync(p, "r"); const buf = Buffer.alloc(max); const len = fs.readSync(fd, buf, 0, max, 0); fs.closeSync(fd); return buf.toString("utf8", 0, len); } catch { return ""; }
}
// デスクトップのセッション (cliSessionId → 題・アーカイブ済みか)。読めなければ空
function desktopSessions() {
  const map = new Map();
  const walkJson = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 2) walkJson(p, depth + 1);
      else if (e.isFile() && e.name.startsWith("local_") && e.name.endsWith(".json"))
        try { const j = JSON.parse(fs.readFileSync(p, "utf8")); if (j.cliSessionId) map.set(j.cliSessionId, { title: String(j.title || ""), archived: !!j.isArchived }); } catch {}
    }
  };
  walkJson(path.join(process.env.APPDATA || "", "Claude", "claude-code-sessions"), 0);
  return map;
}
// ブラックか = 題の頭が「ブラック」(題が引けなければ、最初の頼みの「あなたはブラック」。「あなたはブラックの係」は係なので数えない)
function isBlack(tp, info) {
  if (info && info.title) return /^ブラック/.test(info.title);
  return /あなたはブラック(?!の)/.test(readHead(tp, 60000));
}
// 控えが立った = ほかのセッションの題に「：<自分の名前> の控え」がある (例「ブラック 58 代目：57 代目の控え」「シミュ部長 sim-light25：sim-light24 の控え」)
function handedOver(info, desk) {
  if (!info || !info.title) return false;
  const own = info.title.split(/[：:]/)[0].trim();
  for (const o of desk.values()) {
    if (o === info) continue;
    const m = o.title.match(/[：:]\s*(.+?)\s*の控え/);
    if (m && new RegExp(`(^|\\s)${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(own)) return true;
  }
  return false;
}
// 同じセッションに同じ知らせを 1 回だけ出す (出したら印を置く)
function firstTime(sid, key) {
  if (!sid) return true;
  const f = path.join(os.tmpdir(), "exiledesk-notices", `${sid}-${key}`);
  if (fs.existsSync(f)) return false;
  try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ""); } catch {}
  return true;
}
// この 1 時間に動いた ExileDesk のセッション (worktree も) で SPARE 件を超えた物。アーカイブ済み・控えの立った物は数えない。名前はデスクトップの題 (無ければ最初の頼みの「あなたは○○」)
function longSessions(self, desk) {
  const root = path.join(os.homedir(), ".claude", "projects");
  const out = [];
  let projs = [];
  try { projs = fs.readdirSync(root).filter((d) => d.startsWith(PROJ)); } catch { return out; }
  for (const d of projs) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const p = path.join(root, d, f);
      if (path.resolve(p) === path.resolve(self)) continue;
      try { if (Date.now() - fs.statSync(p).mtimeMs > 3600_000) continue; } catch { continue; }
      const info = desk.get(f.replace(/\.jsonl$/, ""));
      if (info && (info.archived || handedOver(info, desk))) continue;
      const n = countLines(p);
      if (n < SPARE) continue;
      const m = readHead(p, 60000).match(/あなたは([^\s。、,(（\\"]{2,30})/);
      out.push(`${info && info.title ? info.title.split(/[：:]/)[0].trim() : m ? m[1] : f.slice(0, 8)} (${n} 件)`);
    }
  }
  return out;
}
function readTail(p, max) {
  try { const st = fs.statSync(p); const fd = fs.openSync(p, "r"); const len = Math.min(max, st.size); const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd); return buf.toString("utf8"); } catch { return ""; }
}
function walk(d, depth = 0) {
  const out = [];
  if (depth > 3) return out;
  let ents = [];
  try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  // git の写し (.git のある所、置き場の worktree など) と node_modules の中は repo の絵なので数えない
  for (const e of ents) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git" && !fs.existsSync(path.join(f, ".git"))) out.push(...walk(f, depth + 1)); }
    else out.push(f);
  }
  return out;
}
function orphanProcs(sid, cwd) {
  const keys = [sid, /worktrees/i.test(cwd) ? cwd : ""].filter(Boolean).map((k) => k.replace(/\\/g, "/").toLowerCase());
  if (!keys.length) return [];
  try {
    const ps = "Get-CimInstance Win32_Process | select ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
    const all = JSON.parse(execSync(`powershell -NoProfile -Command "${ps}"`, { encoding: "utf8", windowsHide: true, timeout: 8000, maxBuffer: 64 << 20 }));
    const alive = new Set(all.map((p) => p.ProcessId));
    return all.filter((p) => /^(bash|sh|node|python)\.exe$/i.test(p.Name) && !alive.has(p.ParentProcessId)
      && keys.some((k) => String(p.CommandLine || "").replace(/\\/g, "/").toLowerCase().includes(k)));
  } catch { return []; }
}
// このセッションが書いた回しの記録: 裏で回したコマンドに出てくる -run.log と、> / >> / tee / Add-Content などで書き足した -run.log。
// 読んだだけ (cat・tail・Monitor など、ほかのセッションの記録を見た) の物は数えない。記録は 1 行ずつ JSON で読む (引用符の中のパスも拾う)
function runLogsOf(text) {
  const logs = new Set();
  for (const line of text.split("\n")) {
    if (!line.includes("-run.log")) continue;
    let j;
    try { j = JSON.parse(line); } catch { continue; }
    const items = Array.isArray(j?.message?.content) ? j.message.content : [];
    for (const it of items) {
      if (it?.type !== "tool_use" || typeof it.input?.command !== "string") continue;
      const cmd = it.input.command.replace(/\\/g, "/");
      for (const f of cmd.matchAll(/[A-Za-z]:\/[^\s'"<>|]*?-run\.log/g)) {
        const before = cmd.slice(0, f.index);
        if (it.input.run_in_background || /(>>?|\btee(\s+-a)?|Add-Content(\s+-Path)?|Out-File(\s+-FilePath)?|Set-Content(\s+-Path)?)\s*["']?$/i.test(before)) logs.add(f[0]);
      }
    }
  }
  return logs;
}
function liveRunLog(text) {
  for (const f of runLogsOf(text)) {
    try {
      const st = fs.statSync(f), last = readTail(f, 4000).trim().split(/\r?\n/).pop() || "";
      if (!/済み|中止/.test(last) && Date.now() - st.mtimeMs <= 60_000) return true;
    } catch {}
  }
  return false;
}
function staleRunLogs(text) {
  const logs = runLogsOf(text);
  const out = [];
  for (const f of logs) {
    try {
      const st = fs.statSync(f), last = readTail(f, 4000).trim().split(/\r?\n/).pop() || "";
      if (!/済み|中止/.test(last) && Date.now() - st.mtimeMs > 60_000) out.push(f);
    } catch {}
  }
  return out;
}
function listeningPorts() {
  const set = new Set();
  try {
    const out = execSync("netstat -ano -p TCP", { encoding: "utf8", windowsHide: true, timeout: 5000 });
    for (const line of out.split(/\r?\n/)) { const m = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING/i); if (m) set.add(Number(m[1])); }
  } catch {}
  return set;
}
