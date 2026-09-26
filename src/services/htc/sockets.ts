/**
 * sockets.ts — ソケットに差す物 (アストリッドの創造性 / セールの凱旋) (2026-09-26)
 *
 * オーナー:「アストリッドやら追加しとこうか」。
 *
 * ## ゲームの決まり
 *   - **アストリッドの創造性**: クラフト MOD (エッセンス / 合金 / ブリーチ) を 2 つまで持てる (普通は 1 つ)。
 *     **入れ替えできる** (ソケットに縛られない。IsSocketBound = false): 差してクラフトした後に外して別の物を差しても、
 *     2 つ目のクラフト MOD は残る (オーナー:「入れ替え可能な奴は付けてから外してもクラフト MOD は消えないから便利」)。
 *     外すと無くなるので、代は 1 度だけ
 *   - **セールの凱旋**: サフィックスの枠 +1 (3 / 4)。**差したまま** (ソケットに縛られる。歪みのルーン = コル系と同じ)
 *   - ソケットを付けられるのは**武器と防具だけ**。指輪・アミュレット・ベルト・矢筒は付かない
 *   - 武器・防具のクラフトは、ほぼ**規格外 (ルーンソケット 2 つ) のベース**でやる (オーナー 2026-09-26)。なので買うベースの
 *     ソケットの数は既定 2 (0 / 1 / 2 を選べる)。足りない分だけ熟練工のオーブ (1 つ 1 個) で開ける
 *   - アストリッドは入れ替えられるので、セールと同じ穴を順に使える (先にアストリッド → クラフト → 外してセール)。
 *     要る穴 = 縛られるルーンの数 (無ければ、何か差すなら 1)
 *   - コラプト済み・聖別済みの物には差せない (貼り付けで分かるのはコラプトだけ)
 *
 * ## 費用
 * ルーンの相場 (`rune:<id>`、[[prices.ts]] が上流の名前引きで埋める) + 足りない穴の数だけ熟練工のオーブ (`artificer`)。
 * **1 回の作成につき 1 度だけ**払う (シミュレーターの各回の初めに足す。[[sim-route.ts]] の socketCost)。
 * 相場に無ければ Infinity (0 で埋めるとタダに見えるので、作れない扱いで断る)。
 */
import { ASTRID_RUNE } from "./craft-slots";
import { runePriceKey } from "../../vendor/poe2htc/engine/runes";
import { jaOfPastedLine } from "./mod-text";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";

/** セールの凱旋のルーンの id (`engine/runes.ts` の表と同じ) */
export const SERLE_RUNE = "serles-triumph";

/** 差す物の選び方 (画面のトグル 2 つ) と、買うベースに元からあるソケットの数 */
export interface SocketPick {
  astrid: boolean;
  serle: boolean;
  /** 買うベースのルーンソケットの数 (武器・防具は規格外の 2 が既定)。素材の検索もこの数以上で探す */
  baseSockets: 0 | 1 | 2;
}
/** 規格外 (ルーンソケット 2 つ) のベースを既定にする (オーナー 2026-09-26) */
export const DEFAULT_BASE_SOCKETS = 2;
export const NO_SOCKET: SocketPick = { astrid: false, serle: false, baseSockets: DEFAULT_BASE_SOCKETS };

export type SocketKey = "astrid" | "serle";
/**
 * 効果の文面はクライアントの日本語 ([[mod-text.ts]] の表 `src/i18n/mod-text-ja.json`) から引く (2026-09-26: 自前の言い回しにしない)。
 * 英語はルーンの効果の行 (`Can have # additional Crafted Modifier` / `# Suffix Modifier allowed`)。引けなければ英語のまま
 */
const effectJa = (en: string): string => jaOfPastedLine(en) ?? en;
/** 差せる物の一覧 (画面の順)。bound = ソケットに縛られる (差したまま) */
export const SOCKET_RUNES: ReadonlyArray<{ key: SocketKey; id: string; ja: string; effect: string; bound: boolean; note: string }> = [
  { key: "astrid", id: ASTRID_RUNE, ja: "アストリッドの創造性", effect: effectJa("Can have 1 additional Crafted Modifier"), bound: false, note: "外しても 2 個目のクラフト MOD は残る (入れ替え可)" },
  { key: "serle", id: SERLE_RUNE, ja: "セールの凱旋", effect: effectJa("+1 Suffix Modifier allowed"), bound: true, note: "差したまま (外せない)" },
];

/** 熟練工のオーブの価格キー ([[price-keys.json]]) */
export const ARTIFICER_KEY = "artificer";

/** ソケットを付けられない種類 (装飾品と矢筒) */
const NO_SOCKET_CATEGORIES = new Set(["Rings", "Amulets", "Belts", "Quivers"]);

/**
 * その種類が持てるソケットの数 (0 = 付けられない)。武器・防具は規格外で 2 つまで (オーナー 2026-09-26: 規格外のベースで作るので、
 * 鎧・両手武器に限らずどの武器・防具でも 2 つ)
 */
export function socketCountFor(category: string | null | undefined): 0 | 2 {
  return !category || NO_SOCKET_CATEGORIES.has(category) ? 0 : 2;
}

/** 要る穴の数: 縛られるルーンの数。アストリッドは入れ替えられるので、縛られる物と同じ穴を先に使える (無ければ 1) */
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
  if (corrupted) return "コラプト済みには差せない";
  if (socketsNeeded({ ...pick, [key]: true }) > n) return `ソケットは ${n} つまで`;
  return null;
}

/** 実際に効く選び方 (種類・コラプトで差せない物を落とす)。計算は全部これを通す */
export function effectiveSocket(category: string | null | undefined, corrupted: boolean, pick: SocketPick): SocketPick {
  const n = socketCountFor(category);
  const baseSockets = Math.min(n, Math.max(0, pick.baseSockets)) as SocketPick["baseSockets"];
  if (n === 0 || corrupted) return { astrid: false, serle: false, baseSockets };
  return { astrid: pick.astrid, serle: pick.serle, baseSockets };
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
export function withSocketLimits(lim: { prefix: number; suffix: number }, pick: Pick<SocketPick, SocketKey>): { prefix: number; suffix: number } {
  return pick.serle ? { prefix: lim.prefix, suffix: lim.suffix + 1 } : lim;
}

/** クラフト MOD の上限にアストリッドの創造性を足す */
export function craftedLimitWith(baseLimit: number, pick: Pick<SocketPick, SocketKey>): number {
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

/** 画面の 1 行 (「ソケット: アストリッドの創造性 / セールの凱旋」)。何も差さなければ null */
export function socketLabel(pick: Pick<SocketPick, SocketKey>): string | null {
  const names = SOCKET_RUNES.filter((r) => pick[r.key]).map((r) => r.ja);
  return names.length ? `ソケット: ${names.join(" / ")}` : null;
}

/** 差したルーンの効果の行 (ゲームの日本語。アイテムの絵にルーンの効果として出す) */
export function socketEffects(pick: Pick<SocketPick, SocketKey>): string[] {
  return SOCKET_RUNES.filter((r) => pick[r.key]).map((r) => r.effect);
}

/**
 * 計算機の状態から今の差し方を引く。検算の組み立てた計算機 (scripts/check-htc-*.mjs) は socketOn を持たないので、
 * 無ければ差さない扱い
 */
export function socketOnOf(c: { socketOn?: { readonly value: SocketPick } }): SocketPick {
  return c.socketOn?.value ?? NO_SOCKET;
}
