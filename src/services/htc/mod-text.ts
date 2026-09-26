/**
 * mod-text.ts — MOD を日本語 1 行にする (2026-09-23)
 *
 * 貼り付けから入る道では、文面は**貼られた行がそのまま**使えます ([[paste.ts]])。
 * ベースから選んで 0 から組む道にはその行が無いので、MOD の英語テンプレート (`Mod.text`) を
 * 公式の日本語に直す必要があります。ここがその引き当てです。
 *
 * ## そのままでは 3 割しか引けない
 * 表 (`src/i18n/mod-text-ja.json`、3,537 件) の見出しと `Mod.text` は、同じ物を指していても
 * 書き方が揃っていません。実測 (指輪 / 首飾り / クォータースタッフ 4 ベース、118 MOD):
 *
 *   そのまま引く                     46 / 118
 *   数字を # に潰して符号を落とす   117 / 118
 *
 * ズレは 2 種類だけでした。
 *   1. **符号**  … `+# to maximum Life` に対し、表の見出しは `# to maximum Life`
 *   2. **埋まった数字** … `Adds # to 3 Physical Damage` のように片側だけ数字が入っている
 *      (表の見出しは `# to #`)
 * どちらも「数字を全部 # に潰し、+ を落とし、空白を詰めて小文字」で吸収できます。
 *
 * 引けなかった 1 件は `#% reduced Attribute Requirements` (クォータースタッフ)。**表に無い**
 * ものなので、ここでは英語のまま返します ── **勝手に訳さない**。翻訳を自作すると
 * クライアントの表記とズレて、[[check-ja-terms]] が見ている前提が崩れます。
 */
import jaTable from "../../i18n/mod-text-ja.json";
import type { Mod } from "../../vendor/poe2htc/engine/types";

const TABLE = jaTable as Record<string, string>;
const NL = String.fromCharCode(10);

/** 数字を潰し、符号を落とし、空白を詰める。見出しと `Mod.text` の書き方の差を吸収するため */
function normalise(text: string): string {
  return text
    .replace(/[0-9]+(\.[0-9]+)?/g, "#")
    .replace(/[+]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 潰した見出し → 日本語。先に入れた物を優先 (表の並び順を正とする) */
const BY_NORM = new Map<string, string>();
for (const [k, v] of Object.entries(TABLE)) {
  const n = normalise(k);
  if (!BY_NORM.has(n)) BY_NORM.set(n, v);
}

/**
 * 英語テンプレート 1 行を日本語に。引けなければ `null`。
 *
 * 呼ぶ側が英語のまま出すか落とすかを決められるよう、**ここでは代わりを作りません**。
 */
export function jaOfModLine(line: string): string | null {
  if (TABLE[line]) return TABLE[line];
  return BY_NORM.get(normalise(line)) ?? null;
}

/**
 * MOD 1 つを日本語 1 行に。複数行の MOD (「物理ダメージが #% 増加する / 命中力 #」) は
 * ` / ` で繋ぎます。**引けない行は英語のまま残します** ── 黙って消すと、画面で見た行と
 * 実際に乗る行が食い違います。
 */
export function jaOfMod(mod: Mod): string {
  const text = mod.text;
  if (!text) return mod.id;
  const whole = jaOfModLine(text);
  if (whole) return whole;
  return text.split(NL).map((l) => jaOfModLine(l) ?? l).join(" / ");
}

/** 日本語の文字 (かな・漢字) を含むか */
const HAS_JA = /[぀-ヿ一-鿿]/;

/**
 * 貼り付けた英語の行 (poe.ninja のコピー) を、クライアントの日本語に直して数字を埋める (2026-09-24)。
 * オーナー:「忍者コピーで辞書で変換してあげないとね名前」。
 *
 * 表の日本語テンプレートの `#` に、英語の行の数字を**出てきた順に**入れる。英語で `+` が付いていた数字は
 * 日本語にも `+` を付ける (「+235 to maximum Mana」→「最大マナ +235」)。数字の数が合わない・表に無い時は
 * `null` (呼ぶ側が英語のまま出す)。日本語の行はそのまま返す。
 */
export function jaOfPastedLine(line: string): string | null {
  if (HAS_JA.test(line)) return line;
  const ja = jaOfModLine(line);
  if (!ja) return null;
  const nums = [...line.matchAll(/([+-]?)([0-9]+(?:\.[0-9]+)?)/g)].map((m) => ({ sign: m[1] === "+" ? "+" : m[1] === "-" ? "-" : "", v: m[2]! }));
  const holes = ja.split("#").length - 1;
  if (holes !== nums.length) return null;
  let i = 0;
  return ja.replace(/([+-]?)#/g, (_, pre: string) => {
    const n = nums[i++]!;
    return (pre || n.sign) + n.v;
  });
}

/**
 * 文面の `#` を段の値の幅で埋める (「最大マナ #」→「最大マナ +(165-179)」)。0 から組む時の一覧と狙いの名前に使う
 * (2026-09-26: 「#」のまま出ていた)。`ranges` は段の `[[下, 上], …]`。幅が 1 点なら数字だけ
 */
export function fillHashes(text: string, ranges: ReadonlyArray<ReadonlyArray<number | string>>): string {
  let i = 0;
  return text.replace(/([+-]?)#/g, (_m, pre: string) => {
    const r = ranges[i++];
    if (!r) return `${pre}#`;
    const [a, b] = r.map(Number);
    const v = a === b ? `${a}` : `(${a}-${b})`;
    return `${pre}${v}`;
  });
}
