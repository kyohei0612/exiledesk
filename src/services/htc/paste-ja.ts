/**
 * paste-ja.ts — ゲームから Ctrl+C した**日本語のアイテム**を読む (2026-09-22)
 *
 * ## なぜ要るか
 * 同梱エンジンの `parseItemText` は**英語専用**です (`Rarity:` `Item Level:` を探す)。
 * オーナーは日本語クライアントなので、貼り付けると **null が返って何も起きません**。
 * ここが UI の入口になるので、日本語で読めるようにします。
 *
 * ## 読み方 — 見出しの文言に頼らない
 * 日本語クライアントの見出し (「アイテムレベル:」等) を当てにすると、表記が 1 文字違うだけで
 * 全部落ちます。なので**中身で見分けます**:
 *   - ベース名 … クライアント辞書 (`items-ja-client.json`、4,479 件) に載っている行
 *   - アイテムレベル … 「アイテムレベル」を含む行の数字
 *   - 品質 … 「品質」を含む行の `+N%`
 *   - MOD … 日本語の MOD 文面の**型**に当てはまった行
 * 英語の貼り付けもそのまま通ります (ベース名は英語でも引けるため)。
 *
 * ## MOD の当て方 — 型で照合する
 * `mod-text-ja.json` は「英語テンプレート → 日本語テンプレート」(3,537 件) です。素直に
 * 逆引きすると**外します**。理由が 2 つあって、どちらも実物で踏みました:
 *   1. 辞書側に `[Block|ブロック]` のようなリッチテキスト記号が入っている
 *   2. 入力の数字を全部 `#` に潰すと、**リテラルの数字**まで潰れる
 *      (「倒した敵**1**体ごとに 77 のライフ」の 1 は辞書でも 1 のまま)
 * だから逆引きではなく、辞書の各行を**正規表現**にして (`#` → 数値) 入力に当てます。
 * 当たれば英語テンプレートと**転がった値**が同時に取れます。
 *
 * ## 取れた値の使い道
 * 値からティアが決まるので、`targetsFor` が「この行は T1」まで出します。これが入力の肝で、
 * 利用者が MOD とティアを手で選ぶ必要がなくなります。
 */
import modTextJa from "../../i18n/mod-text-ja.json";
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import { bridgeMods } from "./bridge";
import { htcBaseInfo } from "./patch";
import { boostedBy, catalystTagFromLabel, rawValue } from "./quality";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** 読み取った 1 行 */
export interface PastedLine {
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
}

/** `[Block|ブロック]` → `ブロック`、`[Quality]` → `Quality` */
function stripMarkers(s: string): string {
  return s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");
}

const RE_SPECIAL = ".*+?^${}()|[]" + String.fromCharCode(92);
const escapeRe = (s: string): string =>
  [...s].map((c) => (RE_SPECIAL.includes(c) ? String.fromCharCode(92) + c : c)).join("");

/** 数値 1 つ。符号も取り込む (「レベル +5」の `+5` で 1 つ) */
const NUMBER = "([+-]?[0-9]+(?:" + String.fromCharCode(92) + ".[0-9]+)?)";

/** 日本語の MOD 文面の型。1 度だけ組む (2,000 件ほど) */
const patterns: ReadonlyArray<{ re: RegExp; template: string }> = (() => {
  const out: { re: RegExp; template: string }[] = [];
  for (const [en, jaRaw] of Object.entries(modTextJa as Record<string, string>)) {
    const ja = stripMarkers(jaRaw);
    if (!ja.includes("#")) continue;
    out.push({ re: new RegExp("^" + ja.split("#").map(escapeRe).join(NUMBER) + "$"), template: en });
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
export function parseJaItem(text: string): PastedItem {
  const lines = text.replace(/\r\n?/g, String.fromCharCode(10)).split(String.fromCharCode(10))
    .map((l) => l.trim()).filter((l) => l.length > 0 && !/^-{3,}$/.test(l));

  let baseText: string | null = null;
  let baseType: string | null = null;
  let itemLevel: number | null = null;
  let quality: number | null = null;
  let catalystTag: string | null = null;
  const matched: PastedLine[] = [];
  const unmatched: string[] = [];

  for (const line of lines) {
    // ベース名。**先に見る**: 「イージスクォータースタッフ」は MOD の型には当たらない
    if (!baseType) {
      const en = baseEnByJa.get(line) ?? (baseEnSet.has(line) ? line : null);
      if (en) {
        baseText = line;
        baseType = en;
        continue;
      }
    }
    if (itemLevel == null && line.includes("アイテムレベル")) {
      const m = /([0-9]+)/.exec(line);
      if (m) { itemLevel = Number(m[1]); continue; }
    }
    if (quality == null && line.includes("品質")) {
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
      matched.push({ text: line, template: hit.template, values: g.slice(1).map(Number) });
    } else {
      unmatched.push(line);
    }
  }
  return { baseType, baseText, itemLevel, quality, catalystTag, lines: matched, unmatched };
}

/** 転がった値がその MOD のどのティアに収まるか。収まらなければ最上位 */
function tierIndexFor(mod: Mod, values: readonly number[], level: number): number {
  for (let i = mod.tiers.length - 1; i >= 0; i--) {
    const t = mod.tiers[i];
    if (!t || t.ilvl > level) continue;
    const ranges = t.ranges ?? [];
    if (ranges.length !== values.length) continue;
    if (ranges.every((r, k) => values[k]! >= Number(r[0]) && values[k]! <= Number(r[1]))) return i;
  }
  return mod.tiers.length - 1;
}

/**
 * 読んだアイテムを**ソルバに渡す目標**に変える。
 *
 * 値からティアまで決めるので、利用者が選ぶ手間がありません。
 *
 * 落ちた行は 2 つに分けます。**この違いが画面で効きます**:
 *   - `implicits` … そのベースの暗黙の効果。**作る対象ではない** (ベースを選んだ時点で決まる)
 *   - `skipped`   … **そのベースでは作れない行。**どのプールもその MOD を出さないという意味なので、
 *                   狙いから外して解くと**別のアイテムの手順**が出ます。画面で必ず断ること。
 *                   オーナー方針 2026-09-22:「作れない奴は物理的に買う方向でいい」。
 *                   実例: ニーモニックリングの「スペルのマナコスト効率が29%増加する」は
 *                   クライアントに `Verisium` (プレフィックス 18-29%) として在るが
 *                   **spawn_weights が全部 0** で、どの装備タグでも出ない。ブリーチの樹など
 *                   別経路で乗る物と見られる
 */
export function targetsFor(
  data: PatchData,
  item: PastedItem,
): { targets: TierTarget[]; texts: string[]; skipped: string[]; implicits: string[] } {
  if (!item.baseType) return { targets: [], texts: [], skipped: item.lines.map((l) => l.text), implicits: [] };
  const level = item.itemLevel ?? 100;

  // **暗黙の効果を先に抜く。**あとで抜こうとすると手遅れです: 「ブロック率 +17%」は
  // 冒涜プールの `AdditionalBlock` (of Amanamu 20-25) に文面だけ当たってしまい、
  // 範囲の外 (17) なのに目標として通ってしまいました (実物で踏んだ)。
  // 暗黙はベースを選んだ時点で決まっているので、そもそも作る対象ではありません。
  const bare = (t: string): string => stripMarkers(t).replace(/[0-9()+\-]+/g, "").trim();
  // **暗黙 1 つにつき 1 行だけ落とす。**同じ文面が暗黙にも通常 MOD にも出ることがあり、
  // 全部消すと本物の目標まで巻き添えになる。実物で踏んだ (2026-09-22 ニーモニックリング):
  // 暗黙が「最大マナが8%増加する」で、プレフィックスにも同じ行がある。両方落として目標が 1 個減った。
  const quota = new Map<string, number>();
  for (const im of htcBaseInfo()[item.baseType]?.implicits ?? []) {
    const k = bare(im.ja);
    quota.set(k, (quota.get(k) ?? 0) + 1);
  }
  const implicits: string[] = [];
  const rollable: PastedLine[] = [];
  for (const l of item.lines) {
    const k = bare(l.text);
    const left = quota.get(k) ?? 0;
    if (left > 0) {
      quota.set(k, left - 1);
      implicits.push(l.text);
    } else {
      rollable.push(l);
    }
  }

  // 素のベースから作る話なので、ルーン由来の MOD は混ぜない
  const bridged = bridgeMods(data, item.baseType, rollable.map((l) => l.template), "exclude");
  // 繋がらなかった物を**符号違いで**もう一度引く。`mod-text-ja.json` は
  // 「# to Level of all Melee Skills」、エンジンは「+# to Level of all Melee Skills」で、
  // 先頭の `+` を数値側に取り込むか文面側に残すかが辞書ごとに違う (実物で踏んだ)
  const retryAt = bridged.mods
    .map((b, i) => (!b.mod && rollable[i]!.template.startsWith("#") ? i : -1))
    .filter((i) => i >= 0);
  if (retryAt.length) {
    const again = bridgeMods(data, item.baseType, retryAt.map((i) => "+" + rollable[i]!.template), "exclude");
    retryAt.forEach((i, k) => {
      const got = again.mods[k];
      if (got?.mod) bridged.mods[i] = got;
    });
  }

  const targets: TierTarget[] = [];
  /** `targets` と同じ並びの、貼り付けの文面。画面に日本語のまま出すため */
  const texts: string[] = [];
  const skipped: string[] = [];
  bridged.mods.forEach((b, i) => {
    const line = rollable[i]!;
    if (!b.mod || b.viaRune) { skipped.push(line.text); return; }
    // **ティアを読む前に品質を外す。**装飾品の品質はその種類のタグを持つ MOD の値を
    // 押し上げるので、画面の数字のまま読むとティアを高く見積もります。実物で踏んだ:
    // 「品質 (マナモッド) +20%」の最大マナ +183 は、素だと 152.5 で 1 段下のティア。
    const boost = item.quality && item.catalystTag && boostedBy(b.mod, item.catalystTag);
    const values = boost ? line.values.map((v) => rawValue(v, item.quality!)) : line.values;
    targets.push({ modId: b.mod.id, minTierIndex: tierIndexFor(b.mod, values, level) });
    texts.push(line.text);
  });
  return { targets, texts, skipped, implicits };
}
