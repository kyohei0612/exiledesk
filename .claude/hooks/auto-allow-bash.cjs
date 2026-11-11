// PermissionRequest hook: ExileDesk の部長が夜中に許可の窓で止まらないよう、Bash / PowerShell の許可を自動で出す (G-31)。
// 危ない物 (強制 push・reset --hard・stash / switch・広い rm -rf・node_modules 消し) だけは今まで通りオーナーに聞く。
// 広い rm -rf (11-07 オーナー OK = S5) = 消す先がドライブの根・~・..・ユーザーの家 (C:/Users/<名前>) とその 1 段下 (ExileDesk の根など)・それらの中の * 全部
let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { return; }
  const tool = input.tool_name;
  if (tool !== 'Bash' && tool !== 'PowerShell') return;
  const cmd = String((input.tool_input && input.tool_input.command) || '');
  const risky = [
    /git\s+push\b[^\n]*(--force|\s-f\b)/,
    /git\s+reset\s+--hard/,
    /git\s+(stash|checkout\s+-b|switch|rebase\s+-i)/,
    /rm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\.\.|C:|\/c\/)(\s|$)/i,
    /node_modules(\s|$)[^\n]*rm|rm\s+-[a-z]*r[a-z]*\s+[^\n]*node_modules/,
    /Remove-Item[^\n]*-Recurse[^\n]*(C:\\\\?$|node_modules)/i,
    /format\s+[a-z]:/i,
  ];
  if (risky.some((r) => r.test(cmd)) || wideRemove(cmd)) return; // 何も返さない = いつもの許可の窓
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
  }));
});

// rm -r… / Remove-Item -Recurse の消す先に、浅すぎる所 (上の「広い」) があるか
function wideRemove(cmd) {
  const targets = [];
  for (const m of cmd.matchAll(/\brm\s+((?:-[a-zA-Z]+\s+)+)([^;&|\n]+)/g))
    if (/r/i.test(m[1])) targets.push(...m[2].split(/\s+/));
  for (const m of cmd.matchAll(/\bRemove-Item\b([^;&|\n]*)/gi))
    if (/-Recurse\b/i.test(m[1])) targets.push(...m[1].split(/\s+/).filter((t) => t && !t.startsWith('-')));
  return targets.some((t) => {
    const p = t.replace(/^["']|["']$/g, '').replace(/\\/g, '/').replace(/\/\*?$/, '').replace(/\/+$/, '');
    if (!p) return false;
    if (/^(~|\.\.|\.|\*|\$HOME|\$env:USERPROFILE)$/i.test(p) || /^~\/[^/]+$/.test(p)) return true;
    const abs = p.replace(/^\/([a-z])(\/|$)/i, (s, d, r) => `${d.toUpperCase()}:${r || '/'}`);
    if (!/^[A-Za-z]:/.test(abs)) return false;
    const parts = abs.split('/').filter(Boolean); // C:, Users, kyohei, ExileDesk
    return parts.length <= 1 || (/^users$/i.test(parts[1] || '') ? parts.length <= 4 : parts.length <= 2);
  });
}
