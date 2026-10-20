/**
 * item-text-types.ts — 貼り付けたアイテムの文を読んだ結果の形 (2026-10-20 ジン部長。入口 engine.ts の `parseItemText` が返す)。
 *
 * シミュレーター ① (ベースと狙いを貼り付けで一度に決める) がこの形に合わせて画面を作る。形を変える時はシミュ部長に知らせる。
 * 読める形: トレード (trade2) / poe.ninja のコピー (区切り線無し・「W」「P」の行・`~b/o` の値段)、ゲームの Ctrl+C / Ctrl+Alt+C、日英どちらも。
 */

/** 日英の 2 つ (画面に出す理由など) */
export interface ItemTextWords { ja: string; en: string }

/** どこからのコピーに見えたか (読み方は変わらない。画面で断り書きを変える用) */
export type ItemTextSource =
  | "game"          // ゲームの Ctrl+C (区切り線・アイテムクラス・レアリティの行)
  | "game-advanced" // ゲームの Ctrl+Alt+C (`{ Prefix Modifier "…" (Tier: 3) }` の見出し。側と段の名前が分かる)
  | "ninja"         // 行末の注記 (`(implicit)` `(fractured)` …) つき
  | "trade"         // 区切り線無し・「W」「P」の行・値段の行
  | "unknown";

/**
 * コラプトの印 (2026-10-20 J1b)。表はエンジン部の services/mods/corruption.ts (poe2db の部位のページの corrupted / corruption_upgrade)。
 * status: table = 表と一致、unknown = コラプトした物だが表に無い・値が段の幅に入らない (推し量らない)。
 * kind: enchant = ヴァールのオーブで付くエンチャント、upgrade = 強まったコラプトの行 (CorruptionUpgrade…)。id は poe2db の名前。
 * range は表の値の幅、fits は貼り付けの値がその幅に入るか (table の時だけ)
 */
export interface ItemTextCorruption {
  status: "table" | "unknown";
  kind?: "enchant" | "upgrade";
  id?: string;
  range?: Array<[number, number]>;
  fits?: boolean;
}

/** 暗黙側の 1 行 (MOD の数に入れない) */
export interface ItemTextImplicit {
  text: string;
  /**
   * base = ベースの暗黙 (エンジンのベースの行と照らした / 注記 `(implicit)`)。
   * rune = 差したルーン (`(rune)`)、enchant = エンチャント・アノイント (`(enchant)`)。
   * 印の無い貼り付け (トレード) でベースの暗黙より前にあった行は: 差したルーン・ソウルコアの効果と文が同じなら rune、
   * コラプトした物なら corruption (corruption にコラプトの表との照らし)、どちらでもなければ extra (文では見分けられない)。
   */
  from: "base" | "rune" | "enchant" | "corruption" | "extra";
  /** 当たった英語の型 (読めなければ null) と値 */
  template: string | null;
  values: number[];
  /** from が corruption の時の照らし */
  corruption?: ItemTextCorruption;
}

/** 明示の MOD 1 つ (未発現の枠も 1 つと数える) */
export interface ItemTextMod {
  /** 貼り付けの文 (未発現は「未発現サフィックス」などの行のまま) */
  text: string;
  /** エンジンの MOD の id (`Rings/…`)。未発現は null */
  modId: string | null;
  /** エンジンの MOD の種類 (normal・essence・desecrated …、MOD の source のまま)。未発現は "desecrated" */
  source: string;
  side: "prefix" | "suffix" | null;
  /** どこで側を決めたか: engine = エンジンの MOD の側、paste = Ctrl+Alt+C の見出し・未発現の行 */
  sideFrom: "engine" | "paste";
  /**
   * 段。index は mod.tiers の並び (0 = 一番低い)、label は `T${of - index}` (T1 が一番上)。
   * fits = 値がその段の幅に収まった (false = どの段にも収まらず、その ilvl で出る一番上の段とした)。
   * 品質の種類 (アタックモッド等) で盛られた値は割り戻してから段を引く。
   */
  tier: { index: number; of: number; label: string; name: string; fits: boolean } | null;
  /** 貼り付けの値 (盛られたまま) */
  values: number[];
  fractured: boolean;
  desecrated: boolean;
  crafted: boolean;
  /** 未発現 (冒涜で付いてまだ見ていない) の枠 */
  unrevealed: boolean;
  /** コラプトした物で、値がどの段の幅にも入らない MOD は { status: "unknown" } (コラプトで値が変わったかは推し量らない) */
  corruption?: ItemTextCorruption;
  /** Ctrl+Alt+C の見出しの段の名前 (`"Razor-sharp"`)。それ以外は無し */
  pasteTierName?: string;
}

/** 読めなかった・MOD に数えなかった行の理由 */
export type ItemTextSkipCode =
  | "noBase"      // ベースが分からない (MOD の置き場が決まらない)
  | "unknownText" // MOD の文の型に当たらない
  | "notInPool"   // 文は読めたが、このベースの置き場に無い (コラプト・ユニーク・ドロップ限定の MOD など)
  | "dropOnly"    // 創生の樹など、クラフトでは付かない MOD (枠は使う)
  | "hybridPart"  // 2 行で 1 つの MOD のもう 1 行 (MOD は 1 つに数えた)
  | "corruptionUnknown"; // コラプトした物で、置き場にもコラプトの表にも無い行

export interface ItemTextSkip { line: string; code: ItemTextSkipCode; reason: ItemTextWords }

export interface ItemTextResult {
  source: ItemTextSource;
  lang: "ja" | "en";
  /** レアの名前 (ベースの前の行)。無ければ null */
  name: string | null;
  /** ベース (英語名がエンジンの鍵、日本語名は画面用)。null = 読めなかった (MOD は全部 skipped に) */
  base: { en: string; ja: string } | null;
  /** エンジンのクラス (`Rings`・`Spears` …) */
  cls: string | null;
  /** レアリティ。貼り付けに無い時は名前の行があれば rare、無ければ null */
  rarity: "normal" | "magic" | "rare" | "unique" | null;
  itemLevel: number | null;
  /** 品質。tag = カタリストの種類 (`attack`・`caster` …、品質の行の「(アタックモッド)」)。label = 貼り付けの見出しのまま */
  quality: { value: number; tag: string | null; label: string } | null;
  implicits: ItemTextImplicit[];
  mods: ItemTextMod[];
  /** 側ごとの数 (未発現を含む、側の分からない物は入らない) と枠 */
  count: { prefix: number; suffix: number; limit: { prefix: number; suffix: number } };
  /** 0 = コラプトしていない、1 = コラプト、2 = 二重コラプト */
  corrupted: 0 | 1 | 2;
  /** そのほかの状態の行 (Mirrored・Fractured Item・Unidentified・Sanctified …、貼り付けのまま) */
  flags: string[];
  /** ソケットの数 (`Sockets:` の行が無ければ null) と差したルーンの文 (`(rune)` の注記の物) */
  sockets: { count: number | null; runes: string[] };
  /** ベースの付与スキル (`Grants Skill:` / `スキルを付与:`) */
  grants: string[];
  /** 武器・防具の基本値などの属性の行 (読むだけ、貼り付けのまま) */
  properties: string[];
  /** 値段の行 (`~b/o 69420 mirror` の `69420 mirror`) */
  price: string | null;
  skipped: ItemTextSkip[];
}
