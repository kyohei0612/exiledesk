/**
 * sockets.ts — ソケットに差す物 (アストリッドの創造性 / セールの凱旋 / 特別な MOD のルーン) (2026-09-26、2026-10-03 特別な MOD)
 *
 * オーナー:「アストリッドやら追加しとこうか」。
 *
 * ## ゲームの決まり
 *   - **アストリッドの創造性**: クラフト MOD (エッセンス / 合金 / ブリーチ) を 2 つまで持てる (普通は 1 つ)。
 *     **置き換えできる** (ソケットバウンドではない。説明文「一度ソケットすると取り外すことはできないが、他のオーグメントアイテムで
 *     置き換えることはできる」、src/services/augment-rules.ts): 差してクラフトした後に別の物で置き換えても、
 *     2 つ目のクラフト MOD は残る (オーナー:「入れ替え可能な奴は付けてから外してもクラフト MOD は消えないから便利」)。
 *     取り外して手元に戻すことはできない (置き換えると壊れる) ので、代は 1 回の作成につき 1 度
 *   - **セールの凱旋**: サフィックスの枠 +1 (3 / 4)。**ソケットバウンド** (取り外しも置き換えもできない。説明文から作った表 augment-rules.json)
 *   - ソケットを付けられるのは**武器と防具だけ**。指輪・アミュレット・ベルト・矢筒は付かない
 *   - 武器・防具のクラフトは、ほぼ**規格外のベース**でやる (オーナー 2026-09-26)。規格外 = 熟練工の上限 + 1 で、装備ごとに違う
 *     (胴・両手 3 / ほか 2。熟練工の上限は胴・両手 2 / ほか 1、コラプトでさらに +1。2026-10-05 オーナー「ヴァール抜きのマックスソケットを
 *     各装備で出すように」、前は全部 2 にしていた)。買うベースのソケットの数は既定がその規格外 (0〜規格外を選べる)。
 *     足りない分だけ熟練工のオーブ (1 つ 1 個) で開ける
 *   - アストリッドは置き換えられるので、ソケットバウンドの物と同じ穴を順に使える (先にアストリッド → クラフト → セールで置き換え)。
 *     要る穴 = ソケットバウンドの物の数 (無ければ、何か差すなら 1)
 *   - コラプト済み・聖別済みの物には差せない (表の corruptOk。全部 false。貼り付けで分かるのはコラプトだけ)
 *
 * ## 特別な MOD のルーン (2026-10-03 オーナー: 防具・武器への拡張の「その 1」)
 * コルの狩り (手袋・マークスマン) / カトラの陰鬱 (手袋・腐敗) / ヴォラナの虐殺 (兜) / メドヴェッドの世話 (鎧) /
 * ウートレドの星読み (靴) / スルードの力 (武器)。差している間だけ、その系統の MOD が高貴・カオスで出る
 * (エンジンの `withRunes` が `pools.rune[id]` を `pools.normal` に混ぜる。[[useHtcCraft.ts]] の base で計算機の全部に届く)。
 *   - 全部**ソケットバウンド** (augment-rules.json) なので 1 つずつ穴を使う。アストリッドだけは置き換えられるので先に使える
 *   - 差す時機: 既定は「最初から差したまま」。自動の候補に「ルーンは後で差す」(普通の狙いを先に、差してからルーンの MOD を最後の冒涜で。その 3、2026-10-03) も入れてシミュレーターで比べる
 *   - **出やすさは仮**: 特別な MOD の重みはクライアントのデータに無く、エンジンの仮の値 (1 ティア 1000) のまま。
 *     差すと全部の抽選の分母に入るので、差した時の確率は全部この仮の値に乗っている (オーナー判断: 仮のまま画面で断る)
 *   - 画面に出す部位は `SPECIAL_RUNE_ON_SCREEN` (2026-10-03 は手袋だけ、10-04 に 6 種の差せる部位全部)
 *
 * ## 費用
 * ルーンの相場 (`rune:<id>`、[[prices.ts]] が上流の名前引きで埋める) + 足りない穴の数だけ熟練工のオーブ (`artificer`)。
 * **1 回の作成につき 1 度だけ**払う (シミュレーターの各回の初めに足す。[[sim-route.ts]] の socketCost)。
 * 相場に無ければ Infinity (0 で埋めるとタダに見えるので、作れない扱いで断る)。
 */
import { ASTRID_RUNE } from "./craft-slots";
import { RUNE_BY_ID, runePriceKey } from "../../vendor/poe2htc/engine/runes";
import { jaOfPastedLine } from "./mod-text";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { augmentRule } from "../augment-rules";
import { socketCapOf } from "../craft-stage/stage-runes";

/**
 * クラフトに関係するルーン (英語名): クラフトの決まりを変える物 (アストリッドの創造性 = クラフトモッド +1、セールの凱旋 = サフィ +1) と、
 * 特別な MOD を足す物 (下の SPECIALS)。クラフトステージの棚で上に出す (2026-10-04 オーナー「邪魔なルーンが多すぎる、クラフトで使うルーンのみ上に」)
 */
export const CRAFT_RUNES_EN: readonly string[] = ["Astrid's Creativity", "Serle's Triumph", "Kolr's Hunt", "Katla's Gloom", "Vorana's Carnage", "Medved's Tending", "Uhtred's Sidereus", "Thrud's Might"];

/** セールの凱旋のルーンの id (`engine/runes.ts` の表と同じ) */
export const SERLE_RUNE = "serles-triumph";

/** 特別な MOD のルーンの選び方のキー (画面のトグル) */
export type SpecialKey = "kolr" | "katla" | "vorana" | "medved" | "uhtred" | "thrud";
export type SocketKey = "astrid" | "serle" | SpecialKey;

/**
 * 差す物の選び方 (画面のトグル) と、買うベースに元からあるソケットの数。
 * 特別な MOD のルーンは省略可 (無い = 差さない)。検算のスクリプト (scripts/check-htc-*.mjs) が astrid / serle だけの形で組むため
 */
export interface SocketPick extends Partial<Record<SpecialKey, boolean>> {
  astrid: boolean;
  serle: boolean;
  /** 買うベースのルーンソケットの数 (既定は装備ごとの規格外、socketCountFor)。素材の検索もこの数以上で探す */
  baseSockets: number;
}
/** 規格外のベースを既定にする (オーナー 2026-09-26)。装備ごとの規格外 (胴・両手 3 / ほか 2) に effectiveSocket が丸める */
export const DEFAULT_BASE_SOCKETS = 3;
export const NO_SOCKET: SocketPick = { astrid: false, serle: false, baseSockets: DEFAULT_BASE_SOCKETS };


/** 特別な MOD の出やすさの断り (重みがデータに無く、エンジンの仮の値のまま) */
export const ASSUMED_RUNE_WEIGHT_NOTE =
  "この MOD の出やすさは仮です (特別な MOD の重みはクライアントのデータに無く、エンジンの仮の値 1 ティア 1000 のまま)。"
  + "ルーンを差している間は全部の抽選の分母に入るので、差した時の確率・費用はみんなこの仮の値に乗っています";

/**
 * 効果の文面はクライアントの日本語 ([[mod-text.ts]] の表 `src/i18n/mod-text-ja.json`) から引く (2026-09-26: 自前の言い回しにしない)。
 * 英語はルーンの効果の行 (`Can have # additional Crafted Modifier` / `# Suffix Modifier allowed` / `Can roll Marksman modifiers`)。
 * 引けなければ英語のまま
 */
const effectJa = (en: string): string => jaOfPastedLine(en) ?? en;
/**
 * 差せる物の決まり (説明文から作った表 augment-rules.json)。表に無い・読めない物は縛られる (置き換えられない) 側に倒す
 * (穴を多めに数えるだけで、作れない物を作れると言わないため)
 */
const ruleOf = (en: string) => {
  const r = augmentRule(en);
  return { ja: r?.ja ?? en, bound: r?.bound ?? true, corruptOk: r?.corruptOk ?? false };
};
const noteOf = (bound: boolean, replaceNote: string): string => (bound ? "ソケットバウンド (取り外しも置き換えもできない)" : replaceNote);

/** 差せる物 1 行。categories = 差せる部位 (エンジンのルーンの表。空 = どの武器・防具にも)。pool = 特別な MOD を足すルーン */
export interface SocketRune {
  key: SocketKey;
  id: string;
  ja: string;
  effect: string;
  bound: boolean;
  corruptOk: boolean;
  note: string;
  categories: readonly string[];
  pool: boolean;
}
/** 特別な MOD のルーン (キー・エンジンの id・英語名・系統の英語 = 効果の行「Can roll <系統> modifiers」の言葉) */
const SPECIALS: ReadonlyArray<{ key: SpecialKey; id: string; en: string; tag: string }> = [
  { key: "kolr", id: "kolrs-hunt", en: "Kolr's Hunt", tag: "Marksman" },
  { key: "katla", id: "katlas-gloom", en: "Katla's Gloom", tag: "Decay" },
  { key: "vorana", id: "voranas-carnage", en: "Vorana's Carnage", tag: "Berserking" },
  { key: "medved", id: "medveds-tending", en: "Medved's Tending", tag: "Soul" },
  { key: "uhtred", id: "uhtreds-sidereus", en: "Uhtred's Sidereus", tag: "Chronomancy" },
  { key: "thrud", id: "thruds-might", en: "Thrud's Might", tag: "Destruction" },
];
/**
 * 特別な MOD のルーンを画面 (トグル・MOD の一覧・貼り付けの狙い) に出す部位。2026-10-03 は手袋だけで確かめ、
 * 2026-10-04 に 6 種の差せる部位 (手袋 / 兜 / 鎧 / 靴 / 武器、エンジンのルーンの表) 全部に広げた
 */
export const SPECIAL_RUNE_ON_SCREEN: ReadonlySet<string> = new Set(SPECIALS.flatMap((x) => RUNE_BY_ID.get(x.id)?.categories ?? []));
const ASTRID = ruleOf("Astrid's Creativity");
const SERLE = ruleOf("Serle's Triumph");
/** 差せる物の一覧 (画面の順)。bound = ソケットバウンド (差したまま、置き換えもできない) */
export const SOCKET_RUNES: ReadonlyArray<SocketRune> = [
  { key: "astrid", id: ASTRID_RUNE, ja: ASTRID.ja, effect: effectJa("Can have 1 additional Crafted Modifier"), bound: ASTRID.bound, corruptOk: ASTRID.corruptOk, note: noteOf(ASTRID.bound, "取り外せないが置き換えられる。置き換えても 2 個目のクラフト MOD は残る"), categories: [], pool: false },
  { key: "serle", id: SERLE_RUNE, ja: SERLE.ja, effect: effectJa("+1 Suffix Modifier allowed"), bound: SERLE.bound, corruptOk: SERLE.corruptOk, note: noteOf(SERLE.bound, "取り外せないが置き換えられる"), categories: [], pool: false },
  ...SPECIALS.map((x): SocketRune => {
    const r = ruleOf(x.en);
    return {
      key: x.key, id: x.id, ja: r.ja, effect: effectJa(`Can roll ${x.tag} modifiers`), bound: r.bound, corruptOk: r.corruptOk,
      note: `${noteOf(r.bound, "取り外せないが置き換えられる")}。差している間だけ特別な MOD が出る (出やすさは仮)`,
      // 部位はエンジンのルーンの表 (pools.rune を書く apply_runes.mjs と同じ所から来る)。表に無ければどこにも差せない扱い
      categories: RUNE_BY_ID.get(x.id)?.categories ?? ["(不明)"],
      pool: true,
    };
  }),
];
const RUNE_BY_KEY = new Map(SOCKET_RUNES.map((r) => [r.key, r]));
const KEY_BY_RUNE_ID = new Map(SOCKET_RUNES.map((r) => [r.id, r.key]));

/** その部位に差せるか (部位の決まりはエンジンのルーンの表。空 = どこでも) */
export const runeFits = (r: Pick<SocketRune, "categories">, category: string | null | undefined): boolean =>
  !!category && (r.categories.length === 0 || r.categories.includes(category));

/** 画面に出す差せる物 (アストリッド・セールはいつも。特別な MOD のルーンは差せる部位だけ) */
export function socketRunesFor(category: string | null | undefined): SocketRune[] {
  return SOCKET_RUNES.filter((r) => !r.pool || (runeFits(r, category) && SPECIAL_RUNE_ON_SCREEN.has(category ?? "")));
}

/** ルーンの id (`kolrs-hunt`) → 選び方のキー (`kolr`)。特別な MOD のルーン以外は undefined */
export const specialKeyOf = (runeId: string | undefined): SpecialKey | undefined => {
  const k = runeId ? KEY_BY_RUNE_ID.get(runeId) : undefined;
  return k && RUNE_BY_KEY.get(k)?.pool ? (k as SpecialKey) : undefined;
};

/** 特別な MOD (エンジンの mod.rune) が、画面に出す部位の物か。貼り付けの狙い・MOD の一覧の入口で使う */
export function specialRuneShown(runeId: string | undefined, category: string | null | undefined): boolean {
  const k = specialKeyOf(runeId);
  const r = k ? RUNE_BY_KEY.get(k) : undefined;
  return !!r && runeFits(r, category) && SPECIAL_RUNE_ON_SCREEN.has(category ?? "");
}

/** ルーンの日本語名 (特別な MOD の札に出す) */
export const runeJaOf = (runeId: string): string => SOCKET_RUNES.find((r) => r.id === runeId)?.ja ?? runeId;

/**
 * 狙いの MOD が要るルーン (特別な MOD = エンジンの mod.rune)。狙いに入れたら、そのルーンは差したまま作る
 * (無いとその MOD は出ないので、トグルで外せない)
 */
export function requiredRunes(data: PatchData | null | undefined, modIds: readonly string[]): SpecialKey[] {
  if (!data) return [];
  const out = new Set<SpecialKey>();
  for (const id of modIds) {
    const k = specialKeyOf(data.mods.get(id)?.rune);
    if (k) out.add(k);
  }
  return [...out];
}
/** 選び方に、狙いが要るルーンを足す (足す物が無ければ同じ物を返す。computed が要らない作り直しをしないように) */
export function withRequired(pick: SocketPick, keys: readonly SocketKey[]): SocketPick {
  if (keys.every((k) => pick[k])) return pick;
  const out = { ...pick };
  for (const k of keys) out[k] = true;
  return out;
}
/** 差している特別な MOD のルーンの id (エンジンの `withRunes` に渡す。アストリッド・セールの枠は別の所で足すので入れない) */
export function poolRuneIds(pick: SocketPick): string[] {
  return SOCKET_RUNES.filter((r) => r.pool && pick[r.key]).map((r) => r.id);
}
/** 特別な MOD のルーンを差しているか (= 確率・費用が仮の重みに乗っているか) */
export const usesAssumedWeight = (pick: SocketPick): boolean => SOCKET_RUNES.some((r) => r.pool && pick[r.key]);

/** 熟練工のオーブの価格キー ([[price-keys.json]]) */
export const ARTIFICER_KEY = "artificer";

/** ソケットを付けられない種類 (装飾品と矢筒) */
const NO_SOCKET_CATEGORIES = new Set(["Rings", "Amulets", "Belts", "Quivers"]);

/**
 * その種類が持てるソケットの数 (0 = 付けられない)。ヴァール抜きの一番多い数 = 規格外 = 熟練工の上限 + 1
 * (胴・両手 3 / ほか 2。熟練工の上限はクラフトステージと同じ socketCapOf。2026-10-05 オーナー「ヴァール抜きのマックスソケットを各装備で」)。
 * ステージの部位の表に無い種類は 2
 */
export function socketCountFor(category: string | null | undefined): number {
  if (!category || NO_SOCKET_CATEGORIES.has(category)) return 0;
  const cap = socketCapOf("", category);
  return cap > 0 ? cap + 1 : 2;
}

/**
 * 要る穴の数: ソケットバウンドの物の数。アストリッドは置き換えられるので、ソケットバウンドの物と同じ穴を先に使える (無ければ 1)。
 * 例: コル + アストリッド = 1 (アストリッドでクラフト → コルで置き換え)、コル + カトラ + セール = 3
 */
export function socketsNeeded(p: Pick<SocketPick, SocketKey>): number {
  const bound = SOCKET_RUNES.filter((r) => r.bound && p[r.key]).length;
  const any = SOCKET_RUNES.some((r) => p[r.key]);
  return Math.max(bound, any ? 1 : 0);
}

/**
 * そのトグルを押せない理由 (押せるなら null)。今入っている物はいつでも外せる (null)。
 * 画面のトグルの横に短く出す
 */
export function socketBlock(category: string | null | undefined, corrupted: boolean, pick: SocketPick, key: SocketKey): string | null {
  if (pick[key]) return null;
  const n = socketCountFor(category);
  if (n === 0) return "指輪・アミュレット・ベルト・矢筒はソケットが付かない";
  const r = RUNE_BY_KEY.get(key);
  if (r && !runeFits(r, category)) return `${r.ja}はこの部位には差せない`;
  if (corrupted && !r?.corruptOk) return "コラプト済みには差せない";
  if (socketsNeeded({ ...pick, [key]: true }) > n) return `穴が足りない (ソケットは ${n} つまで。ソケットバウンドの物は 1 つずつ穴を使う)`;
  return null;
}

/** 実際に効く選び方 (種類・コラプトで差せない物を落とす)。計算は全部これを通す */
export function effectiveSocket(category: string | null | undefined, corrupted: boolean, pick: SocketPick): SocketPick {
  const n = socketCountFor(category);
  const baseSockets = Math.min(n, Math.max(0, pick.baseSockets));
  if (n === 0 || corrupted) return { astrid: false, serle: false, baseSockets };
  const out: SocketPick = { astrid: pick.astrid, serle: pick.serle, baseSockets };
  // 特別な MOD のルーンは差せる部位の時だけ (別の部位で選んだ物が残っていても効かせない)
  for (const r of SOCKET_RUNES) if (r.pool && pick[r.key] && runeFits(r, category)) out[r.key as SpecialKey] = true;
  return out;
}

/** 熟練工のオーブが何個要るか (要る穴のうち、買うベースに無い分) */
export function artificerCount(pick: SocketPick): number {
  return Math.max(0, socketsNeeded(pick) - pick.baseSockets);
}

/** 素材 (始め方のベース) を探す時のルーンソケットの下限。付けられない種類・0 なら null (条件に入れない) */
export function socketsMinFor(category: string | null | undefined, corrupted: boolean, pick: SocketPick): number | null {
  if (corrupted || socketCountFor(category) === 0) return null;
  const n = effectiveSocket(category, corrupted, pick).baseSockets;
  return n > 0 ? n : null;
}

/** 側の枠にセールの凱旋を足す */
export function withSocketLimits(lim: { prefix: number; suffix: number }, pick: Pick<SocketPick, "serle">): { prefix: number; suffix: number } {
  return pick.serle ? { prefix: lim.prefix, suffix: lim.suffix + 1 } : lim;
}

/** クラフト MOD の上限にアストリッドの創造性を足す */
export function craftedLimitWith(baseLimit: number, pick: Pick<SocketPick, "astrid">): number {
  return baseLimit + (pick.astrid ? 1 : 0);
}

/** 差す物の代の内訳 (1 回の作成につき 1 度)。相場に無い物は Infinity */
export function socketCostOf(prices: Prices, pick: SocketPick): { total: number; lines: Array<{ label: string; cost: number }> } {
  const cur = (k: string): number => prices.currency[k] ?? Infinity;
  const lines: Array<{ label: string; cost: number }> = [];
  for (const r of SOCKET_RUNES) if (pick[r.key]) lines.push({ label: r.ja, cost: cur(runePriceKey(r.id)) });
  // 穴はベースに元からある分を使い、足りない分だけ開ける (規格外の 2 つなら 0 個)
  const art = artificerCount(pick);
  if (art > 0) lines.push({ label: `熟練工のオーブ × ${art}`, cost: art * cur(ARTIFICER_KEY) });
  return { total: lines.reduce((a, x) => a + x.cost, 0), lines };
}

/** 画面の 1 行 (「ソケット: アストリッドの創造性 / コルの狩り」)。何も差さなければ null */
export function socketLabel(pick: Pick<SocketPick, SocketKey>): string | null {
  const names = SOCKET_RUNES.filter((r) => pick[r.key]).map((r) => r.ja);
  return names.length ? `ソケット: ${names.join(" / ")}` : null;
}

/** 差したルーンの効果の行 (ゲームの日本語。アイテムの絵にルーンの効果として出す) */
export function socketEffects(pick: Pick<SocketPick, SocketKey>): string[] {
  return SOCKET_RUNES.filter((r) => pick[r.key]).map((r) => r.effect);
}

/** 見込みのキャッシュ等に使う差し方の短い印 (「A」「S」「kolr」…。変われば作り直す) */
export function socketSig(pick: SocketPick): string {
  return SOCKET_RUNES.filter((r) => pick[r.key]).map((r) => r.key).join("+") + `:${pick.baseSockets}`;
}

/**
 * 計算機の状態から今の差し方を引く。検算の組み立てた計算機 (scripts/check-htc-*.mjs) は socketOn を持たないので、
 * 無ければ差さない扱い
 */
export function socketOnOf(c: { socketOn?: { readonly value: SocketPick } }): SocketPick {
  return c.socketOn?.value ?? NO_SOCKET;
}
