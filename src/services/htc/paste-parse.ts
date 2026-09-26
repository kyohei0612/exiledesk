/** paste.ts から切り出し (2026-09-26): 貼り付けの文面を読む (MOD 文面の型・ベース名・注記・parseJaItem) */
import modTextJa from "../../i18n/mod-text-ja.json";
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import { catalystTagFromLabel } from "./quality";

/**
 * 行の種類。poe.ninja の注記から取ります。**日本語の貼り付けには注記が無いので `explicit` 止まり**
 * (暗黙だけはベースの表から当てます)。
 */
export type LineKind = "explicit" | "implicit" | "fractured" | "desecrated" | "crafted" | "enchant" | "rune";

/** 読み取った 1 行 */
export interface PastedLine {
  /** 行の種類 (注記があればそれ、無ければ `explicit`) */
  kind: LineKind;
  /** 貼り付けのままの文面 */
  text: string;
  /** 当たった英語テンプレート (`Adds # to # Fire Damage`) */
  template: string;
  /** 転がっていた値。`#` と同じ並び */
  values: number[];
}

/** 読み取った 1 個 */
export interface PastedItem {
  /** ベース名 (英語。エンジンに渡せる形) */
  baseType: string | null;
  /** 貼り付けにあった表記 (日本語ならそのまま) */
  baseText: string | null;
  itemLevel: number | null;
  quality: number | null;
  /**
   * 品質の**種類**のタグ (「品質 (マナモッド)」→ `mana`)。指輪とアミュレットだけ付きます。
   *
   * **これが無いとティアを高く読みます。**装飾品の品質はそのタグを持つ MOD の値を押し上げるので、
   * 画面の数字は素の抽選値ではありません ([[quality.ts]])。
   */
  catalystTag: string | null;
  /** 当たった MOD の行 */
  lines: PastedLine[];
  /** 当たらなかった行 (暗黙の効果やルーンが多い。画面で断る用) */
  unmatched: string[];
  /** ベースに元から乗っている付与スキル (`Grants Skill: Level 20 …`)。作る対象ではない */
  grantedSkill: string | null;
  /** 注記つきの書き出し (poe.ninja) だったか。true なら種類は推測ではなく事実 */
  annotated: boolean;
  /** コラプト済みか。**コラプトした物はもうクラフトできない** */
  corrupted: boolean;
}

/** `[Block|ブロック]` → `ブロック`、`[Quality]` → `Quality` */
export function stripMarkers(s: string): string {
  return s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");
}

const RE_SPECIAL = ".*+?^${}()|[]" + String.fromCharCode(92);
const escapeRe = (s: string): string =>
  [...s].map((c) => (RE_SPECIAL.includes(c) ? String.fromCharCode(92) + c : c)).join("");

/** 数値 1 つ。符号も取り込む (「レベル +5」の `+5` で 1 つ) */
const NUMBER = "([+-]?[0-9]+(?:" + String.fromCharCode(92) + ".[0-9]+)?)";

/**
 * MOD 文面の型。1 度だけ組みます。
 *
 * **日本語と英語の両方**を入れます。`mod-text-ja.json` は「英語テンプレート → 日本語テンプレート」
 * なので、値から日本語の型を、鍵から英語の型を作れます。
 *
 * 英語側は `+` の扱いが辞書ごとに揺れます (`# to maximum Mana` と `+# to maximum Mana`)。
 * 数値の型が符号を取り込むので、**先頭の `+` を外した形でも**登録して両方拾います。
 */
const patterns: ReadonlyArray<{ re: RegExp; template: string }> = (() => {
  const out: { re: RegExp; template: string }[] = [];
  const add = (text: string, template: string): void => {
    const t = stripMarkers(text);
    if (!t.includes("#")) return;
    out.push({ re: new RegExp("^" + t.split("#").map(escapeRe).join(NUMBER) + "$"), template });
  };
  for (const [en, jaRaw] of Object.entries(modTextJa as Record<string, string>)) {
    add(jaRaw, en);
    add(en, en);
    // 「# to maximum Mana」は貼り付けでは「+247 to maximum Mana」。符号を数値側に含めて拾う
    if (en.startsWith("#")) add("+" + en, en);
    else if (en.startsWith("+#")) add(en.slice(1), en);
  }
  return out;
})();

/** 日本語のベース名 → 英語。英語で来たらそのまま返す */
const baseEnByJa: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const dict of [itemsJaClient, itemsJa] as Record<string, string>[]) {
    for (const [en, ja] of Object.entries(dict)) if (!m.has(ja)) m.set(ja, en);
  }
  return m;
})();
const baseEnSet: ReadonlySet<string> = new Set([
  ...Object.keys(itemsJaClient as Record<string, string>),
  ...Object.keys(itemsJa as Record<string, string>),
]);

/**
 * 貼り付けを読む。**アイテムでなければ `baseType` が null** になるので、呼び出し側は
 * そこで断ってください (ベースが分からないと MOD のプールが決まりません)。
 */
/** 行末の注記 (`(fractured)` 等) を種類に直す。poe.ninja の書き出しにだけ付く */
const KIND_BY_NOTE: Readonly<Record<string, LineKind>> = {
  implicit: "implicit",
  fractured: "fractured",
  desecrated: "desecrated",
  crafted: "crafted",
  enchant: "enchant",
  rune: "rune",
  // `(augmented)` は「何かで盛られている」という印で、MOD の種類ではない (品質の行に付く)
};

/** 行末の注記を剥がす。`["36% increased …", "fractured"]` */
function splitNote(line: string): { text: string; kind: LineKind | null } {
  const m = /^(.*?)\s*\(([a-z]+)\)$/.exec(line);
  if (!m) return { text: line, kind: null };
  const kind = KIND_BY_NOTE[m[2]!];
  return kind ? { text: m[1]!.trim(), kind } : { text: m[1]!.trim(), kind: null };
}

export function parseJaItem(text: string): PastedItem {
  const lines = text.replace(/\r\n?/g, String.fromCharCode(10)).split(String.fromCharCode(10))
    .map((l) => l.trim()).filter((l) => l.length > 0 && !/^-{3,}$/.test(l));

  let baseText: string | null = null;
  let baseType: string | null = null;
  let itemLevel: number | null = null;
  let quality: number | null = null;
  let catalystTag: string | null = null;
  let grantedSkill: string | null = null;
  let annotated = false;
  let corrupted = false;
  const matched: PastedLine[] = [];
  const unmatched: string[] = [];

  for (const raw of lines) {
    // 「コラプト状態」は取引所の日本語表示 (キメラの螺旋のスクショ、2026-09-23)。
    // ゲーム内のコピーが「コラプト済み」か「コラプト状態」かは未確認なので両方受ける
    if (raw === "Corrupted" || raw === "コラプト済み" || raw === "コラプト状態") { corrupted = true; continue; }
    // ベースの付与スキルは作る対象ではない (ベースを選んだ時点で決まる)
    const gs = /^Grants Skill:\s*(?:Level \d+ )?(.+)$/.exec(raw);
    if (gs) { grantedSkill = gs[1]!.trim(); continue; }
    const { text: line, kind: note } = splitNote(raw);
    if (note) annotated = true;
    // ベース名。**先に見る**: 「イージスクォータースタッフ」は MOD の型には当たらない
    if (!baseType) {
      const en = baseEnByJa.get(line) ?? (baseEnSet.has(line) ? line : null);
      if (en) {
        // 英語の貼り付け (忍者のコピー) はベース名も日本語で持つ (画面に出すため)
        baseText = baseEnByJa.has(line) ? line : (itemsJa as Record<string, string>)[en] ?? line;
        baseType = en;
        continue;
      }
    }
    if (itemLevel == null && (line.includes("アイテムレベル") || /^Item Level:/i.test(line))) {
      const m = /([0-9]+)/.exec(line);
      if (m) { itemLevel = Number(m[1]); continue; }
    }
    // 「品質: +20%」「Quality (Mana Modifiers): +40%」。**防御値の行 (`Energy Shield: 41`) と
    // 間違えないこと**: あちらも `(augmented)` が付くが品質ではない
    if (quality == null && (line.includes("品質") || /^Quality[ (:]/i.test(line))) {
      const m = /\+?([0-9]+)%/.exec(line);
      if (m) {
        quality = Number(m[1]);
        // 「品質 (マナモッド): +20%」の種類。これが読めないと下で割り戻せない
        catalystTag = catalystTagFromLabel(line);
        continue;
      }
    }
    const hit = patterns.find((p) => p.re.test(line));
    if (hit) {
      const g = hit.re.exec(line)!;
      matched.push({ kind: note ?? "explicit", text: line, template: hit.template, values: g.slice(1).map(Number) });
    } else {
      unmatched.push(line);
    }
  }
  return { baseType, baseText, itemLevel, quality, catalystTag, grantedSkill, annotated, corrupted, lines: matched, unmatched };
}
