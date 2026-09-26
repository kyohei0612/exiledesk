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
// 中身は 2026-09-26 に分けた: 読むのは paste-parse.ts、目標に直すのは paste-targets.ts
export { parseJaItem } from "./paste-parse";
export type { LineKind, PastedLine, PastedItem } from "./paste-parse";
export { targetsFor } from "./paste-targets";
export type { DropOnlyRow } from "./paste-targets";
