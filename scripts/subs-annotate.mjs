/**
 * subs-annotate.mjs — 字幕のゲーム用語にゲーム内の日本語名を添える (2026-10-09 オーナー「補完作って」)
 *
 * 英語の字幕はそのまま (元の言葉が分かるように) で、用語の後ろに〔日本語名〕を足す。例: Essence of the Abyss〔アビスのエッセンス〕
 * - 名前はクライアントの辞書 (src/i18n/items-ja-client.json・items-ja.json。ゲーム内の表記そのもの) から。2 語以上の名前だけ (1 語の名前は普通の英単語と区別できない)
 * - 自動字幕の聞き間違い (pneummonic・unnull・collar bone・abbby・crystallization の米綴り など) は先に直してから引く
 * - よく出る 1 語の用語 (exalt・annul・desecrate・prefix…) は段落ごとに最初の 1 回だけ添える
 * yt-subs.mjs が保存の前に通す。単独でも: node scripts/subs-annotate.mjs <txt> (上書き)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 自動字幕の聞き間違い → 正しい綴り (先に当てる)。[正規表現, 置き換え] */
const FIXES = [
  [/\b(?:p?n[eu]+m+on?ic|minimumic|minim+onic|minnemonic|minimum+onic|pneumonic|mnemonic)\b/gi, "Mnemonic"],
  [/\b(?:anal)?ment orb\b/gi, "Orb of Annulment"],
  [/\b(?:unnull|unull|anull|enull|enol|annol|unol|anol)(?:ed|ing)?\b/gi, "annul"],
  [/\bcollar ?bones?\b/gi, "Collarbone"],
  [/\bholler ?bone\b/gi, "Collarbone"],
  [/\babb+y\b/gi, "Abyss"],
  [/\bsin[ei]stral\b/gi, "Sinistral"],
  [/\bdextra\b/gi, "Dextral"],
  [/\bcrystalli[sz]ation\b/gi, "Crystallisation"],
  [/\bcataly[sz]ing\b/gi, "Catalysing"],
  [/\bessence of the mine\b/gi, "Essence of the Mind"],
  [/\bomens? of flights?\b/gi, "Omen of Light"],
  [/\bomens? of the bless(?:ed)?\b/gi, "Omen of the Blessed"],
  [/\bomens of\b/gi, "Omen of"],
  [/\b(?:aics|aix|aixes)\b/gi, "affix"],
  [/\bdes+e+crat/gi, "desecrat"],
  [/\b(?:caspie|cas speed|pass speed)\b/gi, "cast speed"],
  [/\bpreserve Collarbone\b/gi, "Preserved Collarbone"],
  // 「Omen of」を省いた言い方 (Sinistral exaltation / greater exaltation / abyssal echo) を名前に
  [/\b(?<!omen of )(Sinistral|Dextral|greater|catalysing) (exaltation|Crystallisation)\b/gi, "Omen of $1 $2"],
  [/\b(?:omen of )?abyssal echo(?:es)?\b/gi, "Omen of Abyssal Echoes"],
];

/** よく出る 1 語の用語 (段落ごとに最初の 1 回だけ添える)。[正規表現, 日本語] */
const WORDS = [
  [/\bexalt(?:ed orbs?|s|ed)?\b/i, "高貴なオーブ"],
  [/\bannul(?:ment)?\b/i, "消去のオーブ"],
  [/\bchaos(?: orbs?)?\b/i, "カオスオーブ"],
  [/\bdivine(?: orbs?)?\b/i, "神のオーブ"],
  [/\bdivs?\b/i, "神 (神のオーブの数)"],
  [/\bdesecrat(?:e|ed|ion|ing)\b/i, "冒涜"],
  [/\bfractur(?:e|ed|ing)\b/i, "フラクチャー"],
  [/\bprefix(?:es)?\b/i, "プレフィックス"],
  [/\bsuffix(?:es)?\b/i, "サフィックス"],
  [/\baffix(?:es)?\b/i, "MOD"],
  [/\bomens?\b/i, "お告げ"],
  [/\breveal(?:ed)?\b/i, "発現"],
  [/\bflux(?:es)?\b/i, "フラックス"],
  [/\bimplicit\b/i, "固有の MOD"],
  // よく出る MOD の言い方 (長い言い方を先に)
  [/\bcast speed\b/i, "キャストスピード"],
  [/\b(?:damage (?:is )?taken from )?mana before life\b/i, "ライフの前にマナから引かれるダメージ"],
  [/\bincreased max(?:imum)? mana\b/i, "最大マナが % 増加"],
  [/\b(?:flat|max(?:imum)?) mana\b/i, "最大マナ"],
  [/\bmana regen(?:eration)?\b/i, "マナ自動回復レート"],
  [/\brarity\b/i, "見つかるアイテムのレアリティ"],
  [/\ball (?:elemental )?res(?:istances?)?\b/i, "全ての元素耐性"],
  [/\bquality\b/i, "品質"],
];

let terms = null;
/** 辞書: 2 語以上の英語名 → 日本語名 (長い名前から当てる) */
function loadTerms() {
  if (terms) return terms;
  const map = new Map();
  for (const f of ["src/i18n/items-ja.json", "src/i18n/items-ja-client.json"]) {
    const j = JSON.parse(readFileSync(join(ROOT, f), "utf8"));
    for (const [en, ja] of Object.entries(j)) {
      if (typeof ja !== "string" || !/\s/.test(en) || en.length < 6 || /^"/.test(en)) continue;
      map.set(en.toLowerCase(), { en, ja });
    }
  }
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  terms = [...map.values()].sort((a, b) => b.en.length - a.en.length).map((t) => ({ ...t, re: new RegExp(`\\b${esc(t.en)}\\b`, "gi") }));
  return terms;
}

/** 1 段落に添える */
function annotateLine(line) {
  let s = line;
  for (const [re, to] of FIXES) s = s.replace(re, to);
  // 名前 (長い物から)。添えた所は印に置き換え、短い名前が中に当たらないようにする
  const done = [];
  for (const t of loadTerms()) {
    t.re.lastIndex = 0;
    if (!t.re.test(s)) continue;
    t.re.lastIndex = 0;
    s = s.replace(t.re, (m) => { done.push(`${m}〔${t.ja}〕`); return `\u0000${done.length - 1}\u0000`; });
  }
  // 1 語の用語も添えた所は印に (短い言い方が長い言い方の中にもう一度当たらないように)
  for (const [re, ja] of WORDS) s = s.replace(re, (m) => { done.push(`${m}〔${ja}〕`); return `\u0000${done.length - 1}\u0000`; });
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => done[Number(i)]);
}

/** 字幕の文 (段落ごと) に添える */
export function annotate(text) {
  return text.split("\n").map((l) => (l.trim() ? annotateLine(l) : l)).join("\n");
}

// 単独で: node scripts/subs-annotate.mjs <txt>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = process.argv[2];
  if (!p) { console.error("使い方: node scripts/subs-annotate.mjs <字幕の txt>"); process.exit(1); }
  writeFileSync(p, annotate(readFileSync(p, "utf8")));
  console.log(`添えた → ${p}`);
}
