// フックの入口 (登録はこの 1 本を呼ぶ: node .claude/hooks/run.cjs <名前>)。
// どの作業場 (worktree) から呼ばれても、main の作業場の .claude/hooks/<名前>.cjs を読む = 古い枝でも今の見張りが効く。
// main の作業場が見つからない時は、この置き場の物を読む。標準入力はそのまま中のフックが読む。
const path = require("path");
const fs = require("fs");
const name = String(process.argv[2] || "").replace(/[^a-z0-9-]/gi, "");
if (!name) process.exit(0);
let dir = __dirname;
try {
  const out = require("child_process").execFileSync("git", ["-C", __dirname, "worktree", "list", "--porcelain"], { encoding: "utf8", windowsHide: true, timeout: 4000, stdio: ["ignore", "pipe", "ignore"] });
  const main = (out.match(/^worktree (.+)$/m) || [])[1];
  if (main && fs.existsSync(path.join(main.trim(), ".claude", "hooks", name + ".cjs"))) dir = path.join(main.trim(), ".claude", "hooks");
} catch {}
const file = path.join(dir, name + ".cjs");
if (!fs.existsSync(file)) process.exit(0);
require(file);
