/**
 * ユニーク装備の MOD 文・フレーバーテキストを日本語にする (2026-09-26)
 *
 * ユニーク装備価格推移のホバー用。引く順:
 *   0. unique-hover-ja.json (クライアント原本のユニーク MOD、scripts/build-unique-hover-ja.mjs)。
 *      オーナー 2026-09-26「英語混在してて分かりづらい。クライアントのデータベースにのっとって日本語に全て訳して」。
 *      大きい (約 600KB) ので使う時に読み込む (loadUniqueHoverDict)
 *   以下は UniqueTooltip.vue (上位プレイヤーMOD一覧のホバー) と同じ順:
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
import { shallowRef } from "vue";
import skillsJaRaw from "../../i18n/skills-ja-client.json";
import { normalizeModTemplate as normalizeTpl, stripRichTextMarkers } from "./normalize";

interface HoverDict {
  /** 英語の型 (数字を # に、+ を落として小文字) → 日本語 ({0} は英語の 0 番目の数字) */
  mods: Record<string, { t: string; n?: number }>;
  /** ベースの英語名 → 種類の日本語 */
  classes: Record<string, string>;
  /** パッシブの英語名 → 日本語名 */
  passives: Record<string, string>;
  /** スキルの英語名 → 日本語名 (クライアントの ActiveSkills) */
  skills: Record<string, string>;
}
const clientDict = shallowRef<HoverDict | null>(null);
/** スキル名 英 → 日 (「+1 to Level of all ◯◯ Skills」の名前) */
const skillsJa = skillsJaRaw as Record<string, string>;
let loading: Promise<void> | null = null;
/** 原本の辞書を読み込む (1 回だけ)。読み込めたら jaUniqueText を使う computed が作り直される */
export function loadUniqueHoverDict(): Promise<void> {
  loading ??= import("../../i18n/unique-hover-ja.json").then((m) => {
    clientDict.value = (m.default ?? m) as unknown as HoverDict;
  });
  return loading;
}
/** ベースの英語名 → 種類 (「セプター」「アミュレット」)。無ければ null */
export function jaItemClass(baseEn: string): string | null {
  return clientDict.value?.classes[baseEn] ?? null;
}

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
/** scripts/build-unique-hover-ja.mjs の TOKEN と同じ (鍵を揃えるため) */
const KEY_TOKEN = /-?\(-?[0-9]+(?:\.[0-9]+)?[-—–]-?[0-9]+(?:\.[0-9]+)?\)|-?[0-9]+(?:\.[0-9]+)?/g;
function fillTokens(template: string, tokens: string[]): string {
  let i = 0;
  return template.replace(/#/g, () => (i < tokens.length ? tokens[i++]!.replace(/[—–]/g, "-") : "#"));
}

/**
 * MOD 文 or フレーバーを日本語に。引けなければ英語 (印は外す)。
 * poe.ninja は複数行の MOD を改行で繋いで 1 本で渡すので、まとめて引けなければ行ごとに引いて繋ぎ直す
 */
export function jaUniqueText(text: string): string {
  const whole = jaOne(text);
  if (!/\r?\n/.test(text) || !hasEnglish(whole)) return whole;
  // 行ごと (フレーバーは行ごとには引けないので、まとめて引けた時は上で返っている)
  const joined = jaOne(text.replace(/\s*\r?\n\s*/g, " "));
  if (!hasEnglish(joined)) return joined;
  return text.split(/\r?\n/).map((l) => jaOne(l.trim())).join("\n");
}

/** スキル名を小文字で引く表 (「Cull The Weak」と「Cull the Weak」の違いを吸収) */
let skillLowerMap: Record<string, string> | null = null;
function skillLower(d: HoverDict): Record<string, string> {
  if (!skillLowerMap) {
    skillLowerMap = {};
    for (const [k, v] of [...Object.entries(skillsJa), ...Object.entries(d.skills)]) skillLowerMap[k.toLowerCase()] ??= v;
  }
  return skillLowerMap;
}

/** 英語が残っているか ([Tag|表示] の印の Tag は数えない) */
function hasEnglish(s: string): boolean {
  return /[A-Za-z]{3,}/.test(stripRichTextMarkers(s));
}

/** 辞書の {0} を英語の数字で埋める。「+{0}」に負の数が入る時は + を落とす */
function fillDict(t: string, tokens: readonly string[]): string {
  return t
    .replace(/\{(\d+)\}/g, (_m, i: string) => (tokens[Number(i)] ?? "#").replace(/[—–]/g, "-"))
    .replace(/\+-/g, "-");
}

/** 組み合わせの文 (ジュエルの「範囲内の … も付与する」、「… を中心とする範囲内のパッシブ」)。引けなければ null */
function jaComposite(plain: string): string | null {
  const d = clientDict.value;
  if (!d) return null;
  const grant = plain.match(/^(Small|Notable) Passive Skills in Radius also grant (.+)$/s);
  if (grant) {
    const inner = jaOne(grant[2]!);
    if (hasEnglish(inner)) return null;
    const who = grant[1] === "Small" ? "スモール" : "ノータブル";
    // 「回避力が(2-3)%増加する」→「回避力(2-3)%増加」(原本の「… も付与する」の書き方に寄せる)
    const body = inner.endsWith("する") ? inner.replace(/が/, "").slice(0, -2) : `「${inner}」`;
    return `範囲内の${who}パッシブスキルは${body}も付与する`;
  }
  // 「+1 to Level of all Earthquake Skills」→「全てのアースクエイクスキルのレベル +1」(原本の「全ての◯◯スキルのレベル +#」と同じ形)
  const lv = plain.match(/^\+?(-?\(-?[0-9]+[-—–][0-9]+\)|-?[0-9]+) to Level of all (.+) Skills$/);
  if (lv) {
    const name = skillsJa[lv[2]!] ?? d.skills[lv[2]!] ?? skillLower(d)[lv[2]!.toLowerCase()];
    if (name) return `全ての${name}スキルのレベル +${lv[1]!.replace(/[—–]/g, "-")}`;
  }
  const radius = plain.match(/^Passives in Radius of (.+?) can be Allocated\s+without being connected to your tree$/s);
  if (radius) {
    const t = d.mods["passives in radius of # can be allocated without being connected to your tree"]?.t;
    if (t) return t.replace("{0}", d.passives[radius[1]!] ?? radius[1]!);
  }
  return null;
}

function jaOne(text: string): string {
  const plain = stripRichTextMarkers(text);
  const tokens = plain.match(TOKEN) ?? [];
  // 0. クライアント原本 (数字の切り出しは辞書を作ったスクリプトと同じ KEY_TOKEN)
  const d = clientDict.value;
  if (d) {
    const kTokens = plain.match(KEY_TOKEN) ?? [];
    const k = plain.replace(KEY_TOKEN, "#").replace(/[+]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const hit = d.mods[k];
    if (hit) return fillDict(hit.t, kTokens);
    const comp = jaComposite(plain);
    if (comp) return comp;
  }
  const tpl = normalizeTpl(plain);
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
