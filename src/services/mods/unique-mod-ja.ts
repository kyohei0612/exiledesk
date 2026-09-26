/**
 * ユニーク装備の MOD 文・フレーバーテキストを日本語にする (2026-09-26)
 *
 * UniqueTooltip.vue (上位プレイヤーMOD一覧のホバー) と同じ順で引く。ユニーク装備価格推移のホバー用:
 *   1. mods-bundle.json (text_en → text_ja)
 *   2. unique-mods-ja.json (値の幅も # に潰したテンプレ、次に完全一致)
 *   3. poe2-flavour-ja.json (改行は CR+LF / LF の両方を試す)
 *   4. items-ja.json
 *   5. 引けなければ英語 (リッチテキストの印は外す)
 *
 * 数字は英語の行から**文字列のまま**順に埋め戻す。幅の「(100-150)」も幅のまま残る
 * (オーナー 2026-09-26「MOD が変わるところは伏字でもなんでもおｋ」)。
 */
import modsBundleRaw from "../../i18n/mods-bundle.json";
import itemsJaRaw from "../../i18n/items-ja.json";
import uniqueModsJaRaw from "../../i18n/unique-mods-ja.json";
import poe2FlavourJaRaw from "../../i18n/poe2-flavour-ja.json";
import { normalizeModTemplate as normalizeTpl, stripRichTextMarkers } from "./normalize";

interface BundleEntry {
  text_en?: string;
  text_ja?: string;
}
const bundle = modsBundleRaw as Record<string, BundleEntry>;
const itemsJa = itemsJaRaw as Record<string, string>;
const uniqueModsJa = uniqueModsJaRaw as Record<string, string>;
const flavourJa = poe2FlavourJaRaw as Record<string, string>;

function buildIndex(pairs: Iterable<[string | undefined, string | undefined]>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [en, ja] of pairs) {
    if (!en || !ja) continue;
    const k = normalizeTpl(en);
    if (!k || map.has(k)) continue;
    map.set(k, normalizeTpl(ja));
  }
  return map;
}
let bundleIndex: Map<string, string> | null = null;
let uniqueIndex: Map<string, string> | null = null;
function indexes(): [Map<string, string>, Map<string, string>] {
  bundleIndex ??= buildIndex(Object.values(bundle).map((e) => [e?.text_en, e?.text_ja] as [string | undefined, string | undefined]));
  uniqueIndex ??= buildIndex(Object.entries(uniqueModsJa));
  return [bundleIndex, uniqueIndex];
}

/** 英語の行の数字の塊 (幅 (a-b) か 1 つの数) を出てきた順に */
const TOKEN = /\(-?\d+(?:\.\d+)?[-—–]-?\d+(?:\.\d+)?\)|\(-?\d+(?:\.\d+)?\)|-?\d+(?:\.\d+)?/g;
function fillTokens(template: string, tokens: string[]): string {
  let i = 0;
  return template.replace(/#/g, () => (i < tokens.length ? tokens[i++]!.replace(/[—–]/g, "-") : "#"));
}

/** 1 行 (MOD 文 or フレーバー) を日本語に。引けなければ英語 (印は外す) */
export function jaUniqueText(text: string): string {
  const plain = stripRichTextMarkers(text);
  const tpl = normalizeTpl(plain);
  const tokens = plain.match(TOKEN) ?? [];
  const [bi, ui] = indexes();
  const hit = bi.get(tpl) ?? ui.get(tpl);
  if (hit) return fillTokens(hit, tokens);
  if (uniqueModsJa[plain]) return uniqueModsJa[plain]!;
  if (flavourJa[plain]) return flavourJa[plain]!;
  const crlf = plain.replace(/\r?\n/g, "\r\n");
  if (flavourJa[crlf]) return flavourJa[crlf]!;
  const lf = plain.replace(/\r\n/g, "\n");
  if (flavourJa[lf]) return flavourJa[lf]!;
  if (itemsJa[plain]) return itemsJa[plain]!;
  return plain;
}
