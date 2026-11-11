// ExileDesk の PreToolUse の見張り (10-28 夜に始め、決まりの正は設計図 docs/spec/README.md ⑥ G-30〜45)
// G-32 stash・autostash・add -A / G-33 cd のつなぎ / G-34 本体の reset --hard・ブランチの切り替え
// commit の時: G-35 設計図が先・G-40 エンジンの見張り・G-41 持ち場・G-42 golden
// G-38 本番の出し・G-39 RELEASED は印 ~/.claude/exiledesk-release-ok (オーナーの「出して」の後にブラックが作り、出し終えたら消す) が要る・G-44 更新内容の日英
// G-43 画面のファイルは frontend-design を読んでから / G-45 立てる頼みの進み具合・裏の回しの記録・表の 2 分超え
// 止める時は exit 2 + stderr に理由 (Claude に返る)
const fs = require("fs");
const os = require("os");
const path = require("path");

const MARK = path.join(os.homedir(), ".claude", "exiledesk-release-ok");
// repo の中の物 (.claude/hooks/、入口 run.js が main の作業場の物を読む)。道はこのファイルの置き場から引く
const REPO = path.resolve(__dirname, "../..").replace(/\\/g, "/");
// フックと登録 (.claude/hooks/・.claude/settings.json) の書き換えは、出しの印とは別の印が要る (オーナーの OK の後にブラックが置き、済んだら消す)
const HOOKS_MARK = path.join(os.homedir(), ".claude", "exiledesk-hooks-ok");
const HOOK_FILE = /(^|\/)\.claude\/(hooks\/[^/]+|settings\.json)$/;
const hooksWhy = () => `フックと登録 (.claude/hooks/・.claude/settings.json) の書き換えは、オーナーの OK の後にブラックが置く印 (${HOOKS_MARK}) が要る`;

// セッションの題の頭 → 触ってよい部 (owners.txt の部の名前)。ブラック・最終チェック長は全部の部を触るので載せない
const DEPTS = [
  [/^シミュ|^チュートリアル/, ["シミュ", "チュートリアル"]],
  [/^エミュ/, ["エミュ"]],
  [/^ジン/, ["ジン"]],
  [/^デザイン/, ["デザイン"]],
  [/^記事/, ["記事"]],
  [/^(サーバー|分析)/, ["サーバー", "分析"]],
  [/^動画/, ["動画"]],
  [/^デイリー/, ["デイリー"]],
  [/^スキン/, ["スキン"]],
  [/^解析/, ["解析"]],
  [/^モンキー/, ["モンキー"]],
  [/^リサーチ/, ["リサーチ"]],
];
// どの部でも触ってよい持ち主 (共通 = 境目、アプリ = src/views の既定で凍結の物)
const OPEN = new Set(["共通", "アプリ"]);

// Git Bash の /c/Users/… を C:/Users/… に (Windows の node は /c/ を C:\c\ と読む)
const winPath = (p) => String(p).replace(/^["']|["']$/g, "").replace(/^\/([A-Za-z])(\/|$)/, (s, d, t) => `${d.toUpperCase()}:${t || "/"}`);
// 同じコマンドの中で決めた変数 (Bash の R=… / G="git -C …"、PowerShell の $W = "…") を中身に置き換える。
// 11-06 の c3c16a66c・fae097c1e は「R=<worktree>; git -C $R commit」で、見張りが $R を場所と読めず golden を回さずに通した
function expandVars(cmd) {
  const vars = {};
  const sub = (s) => s.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (m, n) => (n in vars ? vars[n] : m));
  for (const m of cmd.matchAll(/(?:^|[;&|\n]\s*)(?:export\s+)?\$?([A-Za-z_]\w*)\s*=\s*("[^"]*"|'[^']*'|[^\s;&|]+)/g))
    vars[m[1]] = sub(m[2].replace(/^["']|["']$/g, ""));
  return Object.keys(vars).length ? sub(cmd) : cmd;
}

// デスクトップのセッションの題を session_id から引く (全セッションの JSON を読むので一度引いたら覚える)。引けなければ空
function sessionTitle(id) {
  if (!id) return "";
  const cache = path.join(os.tmpdir(), "exiledesk-session-titles.json");
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(cache, "utf8")); } catch {}
  if (seen[id]) return seen[id];
  const walk = (d, depth) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && depth < 2) { const t = walk(p, depth + 1); if (t) return t; }
      else if (e.isFile() && e.name.startsWith("local_") && e.name.endsWith(".json")) {
        const text = fs.readFileSync(p, "utf8");
        if (text.includes(id)) { const j = JSON.parse(text); if (j.cliSessionId === id) return j.title || ""; }
      }
    }
    return "";
  };
  const title = walk(path.join(process.env.APPDATA || "", "Claude", "claude-code-sessions"), 0);
  if (title) { seen[id] = title; try { fs.writeFileSync(cache, JSON.stringify(seen)); } catch {} }
  return title;
}

// 持ち場 (G-41): 題から読んだ部の物でないファイルを返す。部の分からないセッションは見ない
function foreignFiles(input, files) {
  try {
    const title = sessionTitle(input.session_id);
    const dept = DEPTS.find(([re]) => re.test(title));
    if (!dept) return null;
    const rel = files
      .map((f) => f.replace(/\\/g, "/").replace(new RegExp(`^${REPO}/(\\.claude/worktrees/[^/]+/)?`, "i"), ""))
      .filter((f) => /^(src|server|scripts)\//.test(f));
    if (!rel.length) return null;
    const out = require("child_process").execFileSync("node", ["scripts/owner-of.mjs", ...rel], { cwd: REPO, encoding: "utf8", windowsHide: true, timeout: 8000 });
    const bad = out.split(/\r?\n/).filter(Boolean).map((l) => l.split("\t")).filter(([o]) => !OPEN.has(o) && !dept[1].includes(o));
    return bad.length ? { title, bad } : null;
  } catch { return null; }
}
const foreignWhy = (r) => `持ち場 (G-41、Y-04): 「${r.title}」は ${r.bad.slice(0, 3).map(([o, f]) => `${f} (${o})`).join("・")} を触らない。持ち主の部へ頼むか、ブラックへ`;

// エンジンの見張り (G-40): commit するファイルに控えからの増えがあれば返す (ほかの部の書きかけの増えは見ない)
// root = commit する作業ツリー (git -C の先。worktree の commit はその worktree の台本と控えで数える、11-07 ブラック 57)
function engineGrowth(files, root = REPO) {
  try {
    const dir = fs.existsSync(path.join(root, "scripts/check-engine-entry.mjs")) ? root : REPO;
    let out = "";
    try {
      out = require("child_process").execFileSync("node", ["scripts/check-engine-entry.mjs"], { cwd: dir, encoding: "utf8", windowsHide: true, timeout: 15000 });
    } catch (e) { out = String(e.stdout || ""); }
    const pre = dir.replace(/\\/g, "/").replace(/[.*+?^${}()|[\]]/g, "\\$&");
    const rel = files.map((f) => f.replace(/\\/g, "/").replace(new RegExp(`^${pre}/`, "i"), ""));
    return out.split(/\r?\n/).filter((l) => /^増えた:/.test(l) && rel.some((f) => l.includes(f)));
  } catch { return []; }
}

// エンジンの控え (G-42、オーナー 11-03「フックしといてくれ」): エンジンを含む commit の時だけ golden を回し (約 25 秒)、新しく増えた落ちを返す。
// 控え (tests/golden/currency-golden.json) を取り直す commit は、文に「設計図どおり」(何の決まりどおりに変わったか) が要る
// dir = commit する作業ツリー (git -C の先か cwd)。台本が無ければ「回らなかった」で止める (黙って通さない)
function goldenBreaks(cmd, dir, files) {
  if (!files.some((f) => /(^|\/)(src\/services\/craft-stage\/|docs\/spec\/engine\.md$|tests\/golden\/|tests\/currency-spec-golden)/.test(f))) return [];
  if (files.some((f) => /(^|\/)tests\/golden\/currency-golden\.json$/.test(f)) && !/設計図どおり/.test(cmd))
    return ["控えを取り直す commit は、文に「設計図どおり」と、どの番号 (E-xx) のとおりに結果が変わったかを書く"];
  if (!fs.existsSync(path.join(dir, "scripts/check-golden.mjs"))) return [`golden が回らなかった (${dir} に scripts/check-golden.mjs が無い)`];
  try {
    require("child_process").execFileSync("node", ["scripts/check-golden.mjs"], { cwd: dir, encoding: "utf8", windowsHide: true, timeout: 170000 });
    return [];
  } catch (e) {
    const out = String(e.stdout || "").split(/\r?\n/).filter(Boolean);
    return out.length ? [...out, "結果を変えたのがわざとなら設計図を直して GOLDEN_WRITE=1 で取り直す (scripts/check-golden.mjs の頭)"] : [`golden が回らなかった (${String(e.message).slice(0, 80)})`];
  }
}

// 更新内容 (G-44): 出す版の日本語・英語の文が同じ数あり、changelog.json のその版が文と同じ数か。足りなければ理由を返す
function changelogMissing(cmd, input) {
  const dir = (cmd.match(/(?:--dir|-C)\s+("[^"]+"|'[^']+'|\S+)/)?.[1] || "").replace(/^["']|["']$/g, "") || input.cwd || process.cwd();
  try {
    const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const v = read("package.json").version;
    const ja = read("src/data/changelog-notes.json")[v] || [];
    const en = read("src/data/changelog-notes-en.json")[v] || [];
    if (!ja.length) return `src/data/changelog-notes.json に ${v} の文が無い`;
    if (en.length !== ja.length) return `src/data/changelog-notes-en.json の ${v} が日本語と同じ数 (${ja.length}) でない (${en.length})`;
    const items = (read("src/data/changelog.json").find((e) => e.v === v) || {}).items || [];
    if (items.length !== ja.length) return `src/data/changelog.json の ${v} が ${items.length} 件 (文は ${ja.length} 件)。node scripts/build-changelog.mjs で作り直す`;
    return "";
  } catch (e) { return `更新内容を読めない (${String(e.message).slice(0, 80)})`; }
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const tool = input.tool_name || "";
  const ti = input.tool_input || {};

  const block = (why) => {
    process.stderr.write(`[ExileDesk の見張り] 止めました: ${why}\n`);
    process.exit(2);
  };
  const releaseOk = () => fs.existsSync(MARK);

  // 回し物の見張り (G-45、オーナー 11-06「さっきの見張りルールフックしといて」「1分毎に結果をそのセッションに出すとブラックやセッション見た奴が中止するか否か即わかる」)
  // 1. セッションを立てる頼みの文 (start_session の prompt・今の作業を渡す hand_off_to_session の remaining_plan) に、
  //    進み具合の板 (progress/<名前>.md) と回しの記録 (<名前>-run.log) の決まりが要る
  const plan = tool === "mcp__ccd_session__start_session" && !ti.proposal_id ? ti.prompt : tool === "mcp__ccd_session__hand_off_to_session" ? ti.remaining_plan : "";
  if (plan) {
    const p = String(plan);
    if (!/progress[\\/]/.test(p) || !/-run\.log/.test(p))
      block("立てる頼みの文に進み具合の決まりが要る (G-45): 「進み具合は <共有メモ>\\progress\\<名前>.md の一番上の 今・詰まり・更新 を段ごとに書き換え、回す時は progress\\<名前>-run.log に区切りごとに 1 行足し、Monitor で 1 分ごとに見る」を足してもう一度");
  }

  if (tool === "Bash" || tool === "PowerShell") {
    const cmd = String(ti.command || "");
    // 2a. 2 分を超えて待つ表の回しは止める (途中が見えないまま最大 10 分回る)。長い物は裏で回し、記録と Monitor を通す
    if (!ti.run_in_background && Number(ti.timeout) > 120000)
      block("2 分を超えて待つ回しは表で回さない (G-45、途中が見えない)。run_in_background で回し、出力を progress\\<名前>-run.log へ区切りごとに 1 行書き足して、Monitor で見張る");
    // 2. 裏で回す物は回しの記録 (-run.log) に書く。dev サーバー (vite・dev:web・preview) は除く
    // (「preview」は pnpm / npm の台本の名前の時だけ。ExileDesk-preview のパスの台本は除かない)
    if (ti.run_in_background && !/-run\.log/.test(cmd) && !/\b(vite|dev:web|preview:prod|serve)\b|\b(pnpm|npm)(\s+-\S+)*\s+(run\s+)?preview\b/.test(cmd))
      block("裏で回す物は回しの記録が要る (G-45): 台本の出力を progress\\<名前>-run.log へ区切りごとに 1 行 (時刻・何通り目 / 全部・今の所・止まりと理由・JS エラーの数、最後に「済み」) 書き足す形にし、立てた後すぐ Monitor でその run.log を見張る (1 行増えるたびにこのセッションに出る)。進んでいない・同じ所の繰り返しならすぐ止める (G-26)");
    // 作業場 ExileDesk-preview* での checkout / reset は出す・見張りの段取りなので通す
    const inPreview = /git\s+-C\s+["']?[^"'\s]*ExileDesk-preview/i.test(cmd);

    if (/\bgit\s+(-C\s+\S+\s+)?stash\b/.test(cmd)) block("git stash は使わない (ほかの部長の書きかけが消える。R-08)");
    if (/--autostash\b/.test(cmd)) block("--autostash は使わない (G-32・R-08)");
    if (/\bgit\s+(-C\s+\S+\s+)?add\s+(-A\b|--all\b|\.(\s|$|;|&))/.test(cmd)) block("git add -A / git add . は使わない。自分のファイルだけパスで add する (R-08)");
    if (!inPreview && /\bgit\s+(-C\s+\S+\s+)?reset\s+--hard\b/.test(cmd)) block("git reset --hard は使わない (本体の書きかけが消える)");
    if (!inPreview && /\bgit\s+(-C\s+\S+\s+)?(switch|checkout)\s+(?!--\s)/.test(cmd)) block("本体でブランチを切り替えない (main に直接。作業場 ExileDesk-preview は git -C で)");
    if (/(^|[;&|]\s*)cd\s+[^;&|\n]+?\s*(&&|;)/.test(cmd)) block("cd をつながない (許可の窓で止まる。CLAUDE.md。git -C や絶対パスで)");

    // 設計図が先 (G-35、10-29 オーナー「全部フックでええんやないか」、G-20): エンジン・エミュ・シミュ・共通の部品のコードの commit は、
    //    同じ commit に docs/spec/ があるか、commit の文に設計図の番号 (S-50b・M-31・E-33 など) が要る
    const ecmd = expandVars(cmd);
    // --amend も同じに見る (11-07 オーナー OK = S3)。amend は元の commit (HEAD) のファイルと文も合わせて見る
    if (/\bgit\s+(-C\s+\S+\s+)?commit\b/.test(ecmd)) {
      const files = new Set();
      const base = input.cwd || process.cwd();
      const cdir = (ecmd.match(/\bgit\s+-C\s+("[^"]+"|'[^']+'|\S+)\s+commit\b/) || [])[1];
      const root = cdir ? path.resolve(base, winPath(cdir)) : base;
      // 場所を読めない commit (中身の分からない変数・$(…)) は、見張りが全部素通りになるので止める
      if (cdir && (/\$/.test(cdir) || !fs.existsSync(root)))
        block(`commit の場所を見張りが読めない (${cdir})。git -C には絶対パスか、同じコマンドの中で決めた変数 (R=…; git -C $R) を使う (G-35・G-40〜42 が効かなくなる)`);
      // git の外 (台本の置き場など) では git の文句を止めの理由に混ぜない
      const git = (args) => { try { return require("child_process").execSync(`git ${args}`, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };
      git("diff --cached --name-only").split(/\r?\n/).filter(Boolean).forEach((f) => files.add(f));
      const amend = /--amend\b/.test(ecmd);
      let msg = ecmd;
      if (amend) {
        git("diff-tree --no-commit-id --name-only -r HEAD").split(/\r?\n/).filter(Boolean).forEach((f) => files.add(f));
        msg += "\n" + git("log -1 --format=%B");
      }
      for (const m of ecmd.matchAll(/\bgit\s+(?:-C\s+\S+\s+)?add\s+([^;&|\n]+)/g))
        m[1].split(/\s+/).filter((a) => a && !a.startsWith("-")).forEach((f) => files.add(winPath(f)));
      // commit の後の最後の「 -- 」からパス (後ろに ; echo などが続いても、文に ; があっても拾う)
      const after = ecmd.slice(ecmd.search(/\bgit\s+(?:-C\s+\S+\s+)?commit\b/));
      const dd = after.lastIndexOf(" -- ");
      if (dd >= 0) after.slice(dd + 4).split(/[;&|\n]/)[0].split(/\s+/).filter(Boolean).forEach((f) => files.add(winPath(f)));
      const list = [...files].map((f) => f.replace(/\\/g, "/"));
      if (list.some((f) => HOOK_FILE.test(f)) && !fs.existsSync(HOOKS_MARK)) block(hooksWhy());
      const foreign = foreignFiles(input, list);
      if (foreign) block(foreignWhy(foreign));
      const growth = engineGrowth(list, root);
      if (growth.length) block(`エンジンの見張り (G-40): ${growth.slice(0, 3).join(" / ")}。エミュ⇄シミュは直に繋がず、エンジンの中身は関数を呼ぶ`);
      const golden = goldenBreaks(msg, root, list);
      if (golden.length) block(`エンジンの控え golden (G-42): ${golden.slice(0, 3).join(" / ")}`);
      const code = list.filter((f) => /src\/(services\/(simulator|emulator|craft-stage)|views\/(simulator|craft-stage)|components\/for-share|state\/for-share)\//.test(f));
      const spec = list.some((f) => /docs\/spec\//.test(f));
      const num = /\b[GYEMSURTD]-\d{2,3}[a-z]?\b/.test(msg);
      if (code.length && !spec && !num)
        block(`設計図が先 (G-20): ${code.slice(0, 3).join("・")} などの commit には、同じ commit の docs/spec/ か、commit の文に設計図の番号 (S-50b・M-31 など) が要る。設計図に無い事なら先に設計図に書く`);
      // 設計図の散らばり (G-46 番号と状態の食い違い・G-47 経緯の書き足し、オーナー 11-11「散らばらないようにフックしっかり効かせてくれ」):
      //    設計図の入った commit は、その作業場の scripts/check-spec-tidy.mjs を回し、増えた分に落ちがあれば止める (台本の無い古い作業場は見ない)
      const tidy = path.join(root, "scripts", "check-spec-tidy.mjs");
      if (spec && fs.existsSync(tidy)) {
        const r = require("child_process").spawnSync(process.execPath, [tidy, "--root", root], { encoding: "utf8", windowsHide: true, timeout: 20000 });
        const lines = `${r.stdout || ""}`.split(/\r?\n/).filter(Boolean);
        if (r.status === 1 && lines.length)
          block(`設計図の散らばり (G-29・G-46・G-47): ${lines.slice(0, 4).join(" / ")}`);
      }
    }

    // 出しの見張り (G-38・44・42) は、heredoc の中身と -m の文を除いたコマンドで見る (commit の文に「deploy:web」と書いただけで止めない、11-07)
    const bare = ecmd.replace(/<<-?\s*["']?(\w+)["']?[^\n]*\n[\s\S]*?\n\1(?=\s|$)/g, "").replace(/(?:-m|--message)\s*("(?:[^"\\]|\\.)*"|'[^']*')/g, "");
    const isRelease = /\bdeploy:web\b/.test(bare) || /bump-version\.mjs/.test(bare);
    if (isRelease && !/deploy:web-dev/.test(bare) && !releaseOk())
      block(`本番の出しは、オーナーの「出して」の後にブラックが置く印 (${MARK}) が要る (G-08・R-02・R-03)`);
    // サーバーの出しと直の出しも同じ印 (G-38、11-12 オーナー「問い1はア」): server/live・server/web の deploy の口を直に呼ぶ・wrangler deploy を直に打つ。
    // 手元で立てるだけ (wrangler dev)・--dry-run・d1 / kv / tail / deployments の読みは出しではないので見ない (コマンドの区切りごとに見る)
    const directDeploy = bare.split(/[;&|\n]+/).some((seg) =>
      !/--dry-run\b/.test(seg) &&
      (/\bwrangler(?:\.cmd)?\b[^\n]*?\s(?:versions\s+)?deploy\b/.test(seg) ||
        /\b(?:pnpm|npm|yarn)\b[^\n]*\brun\s+deploy(?![:\w-])/.test(seg) ||
        /\bpnpm\b[^\n]*(?:--dir|-C)\s+\S*server[\\/](?:web|live)\S*\s+deploy(?![:\w-])/.test(seg)));
    if (directDeploy && !releaseOk())
      block(`サーバーの出し・直の出し (server/live・server/web の deploy、wrangler deploy) も、オーナーの「出して」の後にブラックが置く印 (${MARK}) が要る (G-38・R-07)。手元で形だけ見るなら --dry-run`);
    // 更新内容の文が先 (G-44、オーナー 11-05「フックで」): v0.1.668 は notes を書く前の版上げで git の履歴 1418 件が本番に出た
    if (/\bdeploy:web\b/.test(bare) && !/deploy:web-dev/.test(bare)) {
      const why = changelogMissing(bare, input);
      if (why) block(`更新内容の文が先 (G-44、R-06): ${why}`);
    }
    // 出しの時も golden (G-42、11-07 オーナー OK = S6): 本番・開発版の出しは、出す作業場 (--dir / -C の先か cwd) で 1 回回す。
    // cherry-pick・merge で入ったエンジンの直しは commit の見張りを通らないので、ここで捕まえる
    if (/\bdeploy:web(-dev)?\b/.test(bare)) {
      const ddir = winPath((bare.match(/(?:--dir|-C)\s+("[^"]+"|'[^']+'|\S+)/) || [])[1] || "") || input.cwd || process.cwd();
      const golden = goldenBreaks("", path.resolve(ddir), ["src/services/craft-stage/"]);
      if (golden.length) block(`出す前の golden (G-42): ${golden.slice(0, 3).join(" / ")}`);
    }
  }

  if (tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
    const fp = String(ti.file_path || "").replace(/\\/g, "/");
    if (new RegExp(`^${REPO}/`, "i").test(fp) && HOOK_FILE.test(fp) && !fs.existsSync(HOOKS_MARK)) block(hooksWhy());
    const foreign = new RegExp(`^${REPO}/`, "i").test(fp) ? foreignFiles(input, [fp]) : null;
    if (foreign) block(foreignWhy(foreign));
    // UI はデザインのプラグインを使う (G-43、オーナー 11-03「UI系は折角だしプラグイン使う事フックに入れといて」):
    // 本体か worktree の画面のファイル (src の .vue・CSS) を触る前に、このセッションで frontend-design の skill を読んだ跡が要る
    if (/\/ExileDesk\/(\.claude\/worktrees\/[^/]+\/)?src\/.*\.(vue|css)$/i.test(fp)) {
      let used = false;
      try { used = fs.readFileSync(String(input.transcript_path || ""), "utf8").includes('"skill":"frontend-design'); } catch { used = true; }
      if (!used) block("UI のファイルを触る前に、Skill ツールで frontend-design:frontend-design を読む (G-43)。読んだら同じ直しをもう一度");
    }
    if (/src\/web\/release-flags\.ts$/.test(fp)) {
      const text = String(ti.new_string ?? ti.content ?? "") + (Array.isArray(ti.edits) ? ti.edits.map((e) => e.new_string || "").join("\n") : "");
      const old = String(ti.old_string ?? "");
      const touchesReleased = /RELEASED/.test(text) || /RELEASED/.test(old);
      if (touchesReleased && !releaseOk())
        block(`RELEASED への書き足し (本番で開ける) は、オーナーの「出して」の後にブラックが置く印 (${MARK}) が要る (G-08・R-02)`);
    }
  }
  process.exit(0);
});
