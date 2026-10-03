/**
 * to-craft.ts — 火力チェックの相手の装備 → クラフト計算機の貼り付け (2026-10-03、防具・武器への拡張 その 5)
 *
 * オーナー決定「相手の装備をまるごと」: 相手の物の PoB の文面 (ItemView.raw) を、ゲームのコピー (英語) の形に直して計算機の
 * 貼り付けに通す。計算機は ilvl・品質・MOD の注記 (implicit / fractured / desecrated / crafted / rune / enchant) を読むので、
 * PoB の書き方を直す:
 *   - `Implicits: N` の後の N 行 → 行末に ` (implicit)`
 *   - 行頭の `{fractured}` `{desecrated}` `{crafted}` `{rune}` `{enchant}` → 行末の注記。ほかの `{…}` (tags / range 等) は外す
 *   - `Unique ID:` `LevelReq:` `Sockets:` `Radius:` 等の PoB の札は外す。`Item Level:` `Quality:` `Corrupted` は残す
 */
const KEEP_NOTE = ["fractured", "desecrated", "crafted", "rune", "enchant"] as const;
/** PoB の文面で、MOD ではない札の行 */
const META = /^(Unique ID|LevelReq|Sockets|Radius|Limited to|Has Alt Variant|Selected Variant|Requires|Prefix|Suffix|Catalyst|CatalystQuality|League|Source|Talisman Tier|Armour|Evasion|Energy Shield|Ward|Spirit|Rune|Socketed|ArmourBasePercentile|EvasionBasePercentile|EnergyShieldBasePercentile)\b.*:/;

export function pobRawToCopy(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  // 頭: Rarity / 名前 / ベース (ノーマル・マジックは名前の行が無いこともある。Rarity の次から「:」の無い行を 2 行まで)
  const rarity = /^Rarity:\s*(\w+)/i.exec(lines[0] ?? "")?.[1] ?? "Rare";
  i = 1;
  const head: string[] = [];
  while (i < lines.length && head.length < 2 && !/^[\w ]+:/.test(lines[i]!) && !lines[i]!.startsWith("{")) head.push(lines[i++]!);
  out.push(`Rarity: ${rarity[0]!.toUpperCase()}${rarity.slice(1).toLowerCase()}`, ...head, "--------");
  let implicitsLeft = 0;
  const mods: string[] = [];
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    const im = /^Implicits:\s*(\d+)/.exec(l);
    if (im) { implicitsLeft = Number(im[1]); continue; }
    if (/^Item Level:/i.test(l)) { out.push(l); continue; }
    if (/^Quality:/i.test(l)) { const q = /(\d+)/.exec(l)?.[1]; if (q && Number(q) > 0) out.push(`Quality: +${q}%`); continue; }
    if (/^Corrupted$/i.test(l)) { mods.push("Corrupted"); continue; }
    if (META.test(l)) continue;
    // 行頭の {…} を読んで外す
    let text = l;
    const notes: string[] = [];
    for (let m = /^\{([^}]*)\}/.exec(text); m; m = /^\{([^}]*)\}/.exec(text)) {
      const k = m[1]!.toLowerCase();
      if ((KEEP_NOTE as readonly string[]).includes(k)) notes.push(k);
      text = text.slice(m[0].length).trim();
    }
    if (!text) continue;
    if (implicitsLeft > 0) { implicitsLeft--; notes.unshift("implicit"); }
    mods.push(notes.length ? `${text} (${notes[0]})` : text);
  }
  return [...out, "--------", ...mods].join("\n");
}
