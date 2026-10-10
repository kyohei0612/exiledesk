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
 * 表に無い行 (`#% reduced Attribute Requirements` など 29 種) は、クライアント原本 (mods.en/ja.json) の同じ MOD の
 * 日本語から作った `mod-text-ja-htc.json` で引きます (2026-09-26、オーナー「MOD 辞書の英語のやつ直しといて」)。
 * ここで訳を自作はしない ── クライアントの表記とズレて、[[check-ja-terms]] が見ている前提が崩れます。
 */
import { lang } from "../../i18n/lang";
import jaTable from "../../i18n/mod-text-ja.json";
// 表に無い poe2htc の行 (reduced 側・大文字違い等) をクライアント原本から訳した物 (scripts/build-mod-text-ja-htc.mjs、2026-09-26)
import jaHtc from "../../i18n/mod-text-ja-htc.json";
import type { Mod } from "../../vendor/poe2htc/engine/types";

const TABLE = jaTable as Record<string, string>;
const HTC = jaHtc as Record<string, string>;
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
/**
 * 表の日本語の取りこぼし (2026-10-08 完成判定: 「最大ルーンワード」で値が抜け、「ノータブルパッシブスキル を」に空白、
 * 品質の最大値は値を持たない MOD なので # が残った)。表は作り直しで上書きされるので、ここで直す
 */
const JA_FIX: Record<string, string> = {
  "最大ルーンワード": "最大ルーンワード +#",
  "ランダムなノータブルパッシブスキル を割り当てる": "ランダムなノータブルパッシブスキルを割り当てる",
};
const fixJa = (t: string | null | undefined): string | null => (t == null ? null : JA_FIX[t] ?? t);
export function jaOfModLine(line: string): string | null {
  if (TABLE[line]) return fixJa(TABLE[line]);
  const hit = BY_NORM.get(normalise(line)) ?? HTC[line];
  if (hit) return fixJa(hit);
  // クライアントから足した MOD (今リーグの冒涜・異界の MOD など) の文面は「(12-18)% increased [Reservation] …」の形。
  // 印を外し、範囲を # にしてから引く (2026-09-27: 足した MOD が英語のまま出ていた)
  const plain = line.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1").replace(/\(-?[0-9.]+--?[0-9.]+\)/g, "#");
  return plain !== line ? (BY_NORM.get(normalise(plain)) ?? null) : null;
}

/**
 * MOD 1 つを日本語 1 行に。複数行の MOD (「物理ダメージが #% 増加する / 命中力 #」) は
 * ` / ` で繋ぎます。**引けない行は英語のまま残します** ── 黙って消すと、画面で見た行と
 * 実際に乗る行が食い違います。
 */
export function jaOfMod(mod: Mod): string {
  const text = mod.text;
  if (!text) return mod.id;
  // 英語の画面では英語の原文 (印を外し、範囲は # に。2026-10-10 英語版)
  if (lang.value === "en") return text.split(NL).map(enLine).join(" / ");
  const whole = jaOfModLine(text);
  if (whole) return whole;
  return text.split(NL).map((l) => jaOfModLine(l) ?? l).join(" / ");
}

/** 英語の 1 行: クライアントの印 ([Reservation] / [a|b]) を外し、範囲 (12-18) は # に */
const enLine = (line: string): string => line.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1").replace(/\(-?[0-9.]+--?[0-9.]+\)/g, "#");

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
  // 値が全部負で「増加・速く・上昇・多く」の文は、反対の言葉にして数字を正で出す (ルーンの「呪いのアクティベーションが(-30--20)%速くなる」は
  // ゲームでは遅くなる。2026-10-08 完成判定 2 回目)
  const allNeg = ranges.length > 0 && ranges.every((r) => Number(r[0]) <= 0 && Number(r[1] ?? r[0]) <= 0);
  if (allNeg && /増加|速く|上昇|多く/.test(text) && !/減少|低下|少なく|遅く/.test(text)) {
    text = text.replace(/増加/g, "減少").replace(/速く/g, "遅く").replace(/上昇/g, "低下").replace(/多く/g, "少なく");
  }
  // 「減少・低下・少なく」の文は数字を正で出す (データは負の数で持つので「(-60--56)%減少」と二重になっていた。2026-10-08 完成判定)
  const down = /減少|低下|少なく|短く|遅く/.test(text);
  const out = text.replace(/([+-]?)#/g, (_m, pre: string) => {
    const r = ranges[i++];
    if (!r) return `${pre}#`;
    let [a, b] = r.map(Number) as [number, number];
    if (down && a <= 0 && b <= 0) [a, b] = [Math.min(-a, -b), Math.max(-a, -b)];
    const v = a === b ? `${a}` : `(${a}-${b})`;
    return `${pre}${v}`;
  });
  // 値を持たない MOD (ブリーチのエッセンスの品質の最大値 +20% など) は # が残る。品質の最大値だけは 20 (取引所の条件と同じ)
  return out.replace(/品質の最大値 #%/, "品質の最大値 +20%");
}
/**
 * MOD 1 つの日本語に値を入れる。英語の文に字で書いてある数 (パーフェクトエッセンスの「30% increased Movement Speed」、
 * 「Adds 1 to # Lightning Damage」の 1) は段の幅に無いので、英語の数と # を出てきた順に並べて埋める
 * (2026-10-08 完成判定 2 回目: 「移動スピードが#%増加する」「(13-19)から#の雷ダメージ」と # が残っていた)
 */
export function fillModText(mod: Mod, ranges: ReadonlyArray<ReadonlyArray<number | string>>): string {
  const ja = jaOfMod(mod);
  const holes = (ja.match(/#/g) ?? []).length;
  const tokens = [...(mod.text ?? "").matchAll(/#|\d+(?:\.\d+)?/g)].map((t) => t[0]);
  // 段の幅が足りている時はそのまま (英語の文の数字が古いだけの物がある: 「Adds # to 3 Fire damage」で幅は 2 つ)
  if (holes && ranges.length < holes && tokens.length === holes && tokens.some((t) => t !== "#")) {
    let r = 0;
    const vals = tokens.map((t) => (t === "#" ? ranges[r++] ?? [NaN] : [Number(t), Number(t)]));
    if (!vals.some((v) => Number.isNaN(Number(v[0])))) return fillHashes(ja, vals);
  }
  return fillHashes(ja, ranges);
}
