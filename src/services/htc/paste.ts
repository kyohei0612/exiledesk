/**
 * paste.ts — 貼り付けたアイテムを読む (2026-09-22 / 英語と注記の対応は 2026-09-23)
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
 *
 * ## poe.ninja の英語形式 — **注記があるので推測が要りません** (2026-09-23)
 * ゲームの日本語表示は「どの行がどの種類か」を書いてくれませんが、poe.ninja の書き出しは
 * 行末に種類を付けます。**こちらのほうが確実**なので、あれば必ず使います。
 *
 * ```
 * Quality (Mana Modifiers): +40% (augmented)
 * 8% increased maximum Mana (implicit)
 * 36% increased Mana Cost Efficiency of Spells (fractured)   ← 固定済み。消去で消えない
 * +14% to all Elemental Resistances (desecrated)             ← 冒涜プール
 * 8% increased maximum Mana (crafted)                        ← クラフト枠を使う
 * Allocates Augmented Flesh (enchant)                        ← アノイント。作る対象外
 * Grants Skill: Level 20 Cast on Elemental Ailment           ← ベースの付与スキル
 * ```
 *
 * これが分かると**開始状態をそのまま組めます**。固定済みの MOD は「もう手に入っている」ので、
 * そこから解けば道順が桁違いに短くなります (実測: 素から 9,780 神 → 固定済みから 148 神)。
 *
 * 英語の MOD 文面は `mod-text-ja.json` の**鍵**のほうを型にします (値が日本語、鍵が英語)。
 */
import modTextJa from "../../i18n/mod-text-ja.json";
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import { bridgeMods } from "./bridge";
import { matchKey } from "./bridge-index";
import { htcBaseInfo, htcDropOnly, htcModSides } from "./patch";
import { boostedBy, catalystTagFromLabel, rawValue } from "./quality";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/**
 * 行の種類。poe.ninja の注記から取ります。**日本語の貼り付けには注記が無いので `explicit` 止まり**
 * (暗黙だけはベースの表から当てます)。
 */
export type LineKind = "explicit" | "implicit" | "fractured" | "desecrated" | "crafted" | "enchant" | "rune";

/**
 * 創生の樹のタグ → 画面に出す名前。**DB の見出しに合わせています**
 * (「創生の樹 キャスター プレフィックス」など)。
 */
const TREE_JA: Readonly<Record<string, string>> = {
  genesis_tree_caster: "創生の樹 キャスター",
  genesis_tree_minion: "創生の樹 ミニオン",
  breach_desecration: "創生の樹 (冒涜)",
  tower_augment_breach: "創生の樹 (タワー)",
};

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
function stripMarkers(s: string): string {
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
    if (raw === "Corrupted" || raw === "コラプト済み") { corrupted = true; continue; }
    // ベースの付与スキルは作る対象ではない (ベースを選んだ時点で決まる)
    const gs = /^Grants Skill:\s*(?:Level \d+ )?(.+)$/.exec(raw);
    if (gs) { grantedSkill = gs[1]!.trim(); continue; }
    const { text: line, kind: note } = splitNote(raw);
    if (note) annotated = true;
    // ベース名。**先に見る**: 「イージスクォータースタッフ」は MOD の型には当たらない
    if (!baseType) {
      const en = baseEnByJa.get(line) ?? (baseEnSet.has(line) ? line : null);
      if (en) {
        baseText = line;
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

/**
 * 転がった値がその MOD のどのティアに収まるか。収まらなければ最上位。
 *
 * **底上げされた MOD は帯で見ます。**画面の値は `素 × (1 + 品質)` を**切り捨てた**物なので、
 * 素は `[表示 / (1+品質), (表示+1) / (1+品質))` のどこかです。表示 4・品質 41% なら
 * `[2.84, 3.55)` で、ティア `3-3` が入ります。
 *
 * **帯を「戻した値 〜 表示の値」にしてはいけません。**それだと底上げ前と後の両方のティアに
 * 掛かって、高いほうを拾います (2026-09-23 に実測: キャストスピード 23% が、素の 16-18 では
 * なく底上げ後の 22-24 に当たっていた)。
 */
function tierIndexFor(mod: Mod, lo: readonly number[], hi: readonly number[], level: number): number {
  for (let i = mod.tiers.length - 1; i >= 0; i--) {
    const t = mod.tiers[i];
    if (!t || t.ilvl > level) continue;
    const ranges = t.ranges ?? [];
    if (ranges.length !== lo.length) continue;
    // 範囲 [r0, r1] と幅 [lo, hi] が重なるか
    if (ranges.every((r, k) => hi[k]! >= Number(r[0]) && lo[k]! <= Number(r[1]))) return i;
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
 *
 *                   実例: ニーモニックリングの「スペルのマナコスト効率」。クライアントに
 *                   `Verisium` (プレフィックス 18-29%) として在るが **spawn_weights が全部 0**。
 *                   **これはデータの穴ではありません** ── オーナー確認 2026-09-23:
 *                   「ブリーチの樹からドロップした指輪にしかつかない」。つまり**ドロップ限定**で、
 *                   重み 0 はそれを正しく表しています。こういう MOD は買うしかなく、
 *                   **その分だけ枠が埋まっている**ことにも注意 (指輪なら残りのプレフィックスは 2 つ)
 */
export function targetsFor(
  data: PatchData,
  item: PastedItem,
): {
  targets: TierTarget[];
  texts: string[];
  skipped: string[];
  /**
   * 繋がらなかった行のうち、**創生の樹からしか出ない**と分かった物。
   * 「クラフトでは付かない」だけでなく**どこから出るか**まで言えます。
   */
  dropOnly: Array<{ text: string; tag: string; tagJa: string; name: string; stats: string[] }>;
  /**
   * 繋がらなかった行が**どちら側の枠をいくつ食っているか**。
   *
   * クラフトでは付かない MOD (ブリーチの樹の指輪など) も枠は使います。数えずに解くと
   * 「まだ 3 枠空いている」と思い込んで、実際には入らない構成を「作れます」と言います。
   * `either` は側が決まらなかった分 (両側に同じ文面がある物)。
   */
  skippedSides: { prefixes: number; suffixes: number; either: number };
  implicits: string[];
  /** 固定済みの行 (画面用) */
  fractured: string[];
  /**
   * 固定済みの目標。**`fracturedStart` に渡すと開始状態になります。**
   * 固定された MOD は消去でも消えないので「もう手に入っている」扱いにでき、そこから解くと
   * 道順が桁違いに短くなります (実測: 素から 9,780 神 → 固定済みから 148 神)。
   */
  fracturedTargets: TierTarget[];
} {
  if (!item.baseType) {
    return {
      targets: [], texts: [], skipped: item.lines.map((l) => l.text), implicits: [],
      fractured: [], fracturedTargets: [], dropOnly: [], skippedSides: { prefixes: 0, suffixes: 0, either: 0 },
    };
  }
  const level = item.itemLevel ?? 100;

  // **暗黙の効果を先に抜く。**注記があればそれに従い、無ければベースの表から当てます。
  // あとで抜こうとすると手遅れです: 「ブロック率 +17%」は
  // 冒涜プールの `AdditionalBlock` (of Amanamu 20-25) に文面だけ当たってしまい、
  // 範囲の外 (17) なのに目標として通ってしまいました (実物で踏んだ)。
  // 暗黙はベースを選んだ時点で決まっているので、そもそも作る対象ではありません。
  const bare = (t: string): string => stripMarkers(t).replace(/[0-9()+\-]+/g, "").trim();
  // **暗黙 1 つにつき 1 行だけ落とす。**同じ文面が暗黙にも通常 MOD にも出ることがあり、
  // 全部消すと本物の目標まで巻き添えになる。実物で踏んだ (2026-09-22 ニーモニックリング):
  // 暗黙が「最大マナが8%増加する」で、プレフィックスにも同じ行がある。両方落として目標が 1 個減った。
  const implicits: string[] = [];
  const fractured: string[] = [];
  const rollable: PastedLine[] = [];

  if (item.annotated) {
    // **注記があるなら推測しない。**poe.ninja が種類を書いてくれている
    for (const l of item.lines) {
      // ルーンとアノイントは作る対象ではない (オーナー指示 2026-09-23「ルーンとかは全無視でいい」)
      if (l.kind === "rune" || l.kind === "enchant") continue;
      if (l.kind === "implicit") { implicits.push(l.text); continue; }
      // 固定済みは**もう手に入っている**。目標には入れるが、開始状態に置ける印を返す
      if (l.kind === "fractured") fractured.push(l.text);
      rollable.push(l);
    }
  } else {
    // 注記が無い (ゲームの表示をそのまま貼った) 時だけ、ベースの表から暗黙を当てる。
    // **暗黙 1 つにつき 1 行だけ落とす。**同じ文面が暗黙にも通常 MOD にも出ることがあり、
    // 全部消すと本物の目標まで巻き添えになる (2026-09-22 ニーモニックリングで踏んだ)
    const quota = new Map<string, number>();
    for (const im of htcBaseInfo()[item.baseType]?.implicits ?? []) {
      const k = bare(im.ja);
      quota.set(k, (quota.get(k) ?? 0) + 1);
    }
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
    // 切り捨ての分だけ帯になる。底上げが無ければ幅ゼロ (表示がそのまま素)
    const lo = boost ? line.values.map((v) => rawValue(v, item.quality!)) : line.values;
    const hi = boost ? line.values.map((v) => rawValue(v + 1, item.quality!) - 1e-9) : line.values;
    targets.push({ modId: b.mod.id, minTierIndex: tierIndexFor(b.mod, lo, hi, level) });
    texts.push(line.text);
  });
  // 繋がらなかった行の側を、クライアント由来の表から引く ([[patch.ts]] の `htcModSides`)
  const sides = htcModSides();
  const tree = htcDropOnly();
  const dropOnlyRows: Array<{ text: string; tag: string; tagJa: string; name: string; stats: string[] }> = [];
  const skippedSides = { prefixes: 0, suffixes: 0, either: 0 };
  for (const l of rollable) {
    if (!skipped.includes(l.text)) continue;
    const k = matchKey(l.template);
    const t2 = tree[k];
    // stats まで持って回る。**ここで引けたのに後で引き直す**と、文面の正規化が
    // 1 箇所ずれただけで「買うしかない MOD なのに検索も組めない」に落ちます (2026-09-23 に実際そうなった)
    if (t2) dropOnlyRows.push({ text: l.text, tag: t2.tag, tagJa: TREE_JA[t2.tag] ?? t2.tag, name: t2.name, stats: t2.stats ?? [] });
    const v = sides[k];
    if (v === "P") skippedSides.prefixes++;
    else if (v === "S") skippedSides.suffixes++;
    else skippedSides.either++;
  }
  const fracturedSet = new Set(fractured);
  const fracturedTargets = targets.filter((_, i) => fracturedSet.has(texts[i] ?? ""));
  return { targets, texts, skipped, implicits, fractured, fracturedTargets, dropOnly: dropOnlyRows, skippedSides };
}
