/**
 * 手の鍵 (price-keys.json の鍵と、手順の手の鍵) の読み (E-4、2026-11-07 ジン jin-base。洗い出し base-audit-1107 の G-1)。
 *
 * `essence:<段>:<MOD の id>`・`essence:breach`・`reveal:<番号>[:reroll]`・`qset:` などの読み方が、エンジンに 7〜8 か所・画面に約 15 か所あった。
 * 読み方はここ 1 つ。kind は手の種類 (お告げの対応を引く鍵、apply-currency.ts の kindOf と同じ値)。
 * 何も読み込まない (どこから読んでも読み込みの輪を作らない)
 */

/** 手で決める欄の手の頭 (品質・カタリストの品質・品質の上限・アイテムレベル・暗黙の値・聖別の数値) */
export const SET_PREFIX = { quality: "qset:", catalystQuality: "cqset:", qualityCap: "qcap:", itemLevel: "ilvl:", implicit: "iset:", sanctify: "sset:" } as const;
export type SetWhat = keyof typeof SET_PREFIX;
/** エッセンスの段 (鍵の 2 つ目) */
export type EssenceTier = "lesser" | "normal" | "greater" | "perfect";

export type ParsedKey =
  /** エッセンス。tier = 鍵の段 (ブリーチは perfect、形の違う鍵は null)、modId = 付く MOD (ブリーチ・形の違う鍵は null) */
  | { type: "essence"; kind: "essence" | "essence_perfect"; tier: EssenceTier | null; modId: string | null; breach: boolean }
  /** 発現 (reveal:N / reveal:N:reroll)。形が違えば index は null */
  | { type: "reveal"; kind: "reveal"; index: number | null; reroll: boolean }
  /** 骨 (desecrate / desecrate_ancient / desecrate_altered / desecrate_gnawed)。骨の種類は部位で決まる */
  | { type: "bone"; kind: "desecrate" }
  /** 触媒 (catalyst_<種類> / ジュエルの jcatalyst_<種類>)。tag = 品質の種類 */
  | { type: "catalyst"; kind: "catalyst"; tag: string; jewel: boolean }
  /** 液化した感情 (emotion:<英語名>) */
  | { type: "emotion"; kind: "emotion"; name: string }
  /** 手で決める欄 (qset:15:caster など)。args = 頭の後ろを ":" で分けた物。kind は鍵そのもの (お告げは掛からない) */
  | { type: "set"; kind: string; what: SetWhat; args: string[] }
  /** それ以外 (オーブ・品質・ルーン・フラックス・指名・スパム …)。kind = 強さ (_greater / _perfect) を削った鍵 */
  | { type: "currency"; kind: string; strength: "base" | "greater" | "perfect" };

export const EMOTION_PREFIX = "emotion:";
/** エッセンスの手の鍵 (parseKey の essence の逆)。tier = lesser / normal / greater / perfect、modId = 付くエッセンスの MOD */
export const essenceKey = (tier: EssenceTier, modId: string): string => `essence:${tier}:${modId}`;
/** 発現の手の鍵 (parseKey の reveal の逆)。index = 候補の何番目 (1 から)、reroll = アビスの反響で引き直した組から */
export const revealKey = (index: number, reroll = false): string => `reveal:${index}${reroll ? ":reroll" : ""}`;
/**
 * 読んだ結果を鍵の文字ごとに覚える (11-10。シミュの開きと穴チェックで何十万回呼ばれ、スマホの開きで 2.3 秒かかっていた)。
 * 結果は同じ。呼ぶ側が書き換えないよう凍らせて返す (鍵の種類は数百なので上限は掛けない)
 */
const parsed = new Map<string, ParsedKey>();
export function parseKey(key: string): ParsedKey {
  let p = parsed.get(key);
  if (!p) { p = readKey(key); if (p.type === "set") Object.freeze(p.args); parsed.set(key, Object.freeze(p)); }
  return p;
}
function readKey(key: string): ParsedKey {
  if (key.startsWith("essence:")) {
    if (key === "essence:breach") return { type: "essence", kind: "essence_perfect", tier: "perfect", modId: null, breach: true };
    const m = /^essence:(lesser|normal|greater|perfect):(.+)$/.exec(key);
    const tier = (m?.[1] as EssenceTier | undefined) ?? null;
    return { type: "essence", kind: key.startsWith("essence:perfect:") ? "essence_perfect" : "essence", tier, modId: m?.[2] ?? null, breach: false };
  }
  if (key.startsWith("desecrate")) return { type: "bone", kind: "desecrate" };
  if (key.startsWith("reveal")) {
    const m = /^reveal:(\d)(:reroll)?$/.exec(key);
    return { type: "reveal", kind: "reveal", index: m ? Number(m[1]) : null, reroll: !!m?.[2] };
  }
  if (key.startsWith("catalyst_") || key.startsWith("jcatalyst_")) return { type: "catalyst", kind: "catalyst", tag: key.slice(key.indexOf("_") + 1), jewel: key.startsWith("j") };
  if (key.startsWith(EMOTION_PREFIX)) return { type: "emotion", kind: "emotion", name: key.slice(EMOTION_PREFIX.length) };
  for (const [what, p] of Object.entries(SET_PREFIX) as Array<[SetWhat, string]>) if (key.startsWith(p)) return { type: "set", kind: key, what, args: key.slice(p.length).split(":") };
  const m = /^(.*)_(greater|perfect)$/.exec(key);
  return m ? { type: "currency", kind: m[1]!, strength: m[2] as "greater" | "perfect" } : { type: "currency", kind: key, strength: "base" };
}
