/**
 * gem-base-source.ts — 「低レベルのジェム本体」をどこから調達するか (2026-09-19)
 *
 * オーナー指摘「カルグールスキルの素材欄が違う。仕上げ (ソーマタージ) は合ってるけど、
 * 元のスキルはトレードから現物を買うしかないよね」。
 *
 * 普通のジェムは原石 (スキル / スピリット、レベル 15〜20 の最安) から作れるが、
 * カルグール系のジェムは原石から作れない。元のジェムそのもの (コラプト無し・二重コラプト無し)
 * をトレードで買うのが唯一の入手経路なので、素材の「低レベルのジェム本体」はその最安値になる。
 *
 * どのジェムが「現物を買う」側か:
 *   - 既定: クライアントの SkillGems.CraftingLevel が 0 の物 (gems-client.json の buyOnly)。
 *     専用の GemTag は無い (オーナー「タグ付いてないかな」→ 調べたが無かった。
 *     エクスプローシブトランスミューテーションのように名前に Kalguur が無い物もこの列なら拾える)。
 *     置き場の都合で 0 になっている行は、本物の行の最大値を採ることで除いてある
 *   - 画面の素材表で 1 ジェムずつ切り替えられる (ここに覚える)
 * 現物の値段は売値の取得 (再取得) のついでに同じ検索で取り、ここに覚える
 * (自動ジェム監視の期待値もこれを読む)。
 */
import { shallowRef } from "vue";
import gemsRaw from "../i18n/gems-client.json";

export type BaseSource = "uncut" | "buy";

const BUY_ONLY: ReadonlySet<string> = new Set((gemsRaw as { en: string; buyOnly?: boolean }[]).filter((g) => g.buyOnly).map((g) => g.en));

const SOURCE_KEY = "exiledesk.gem.baseSource";
const PRICE_KEY = "exiledesk.gem.baseBuy";

type SourceBook = Record<string, BaseSource>;
type PriceBook = Record<string, { exalted: number; at: number; total?: number; prices?: number[] }>;

function load<T>(key: string): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as T;
  } catch {
    return {} as T;
  }
}
/**
 * 覚えている調達先 / 現物の値段の版。書くたびに上がる (2026-09-26 監査: 読み出しがただの変数なので、
 * 自動ジェム監視の期待値が再取得した後も古い現物の値段のまま残っていた)。読む関数の中で触っておく
 */
export const baseBookVersion = shallowRef(0);

function save(key: string, v: unknown): void {
  baseBookVersion.value++;
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 保存できなくてもその場では使える */
  }
}

let sources: SourceBook | null = null;
let prices: PriceBook | null = null;
const S = (): SourceBook => (sources ??= load<SourceBook>(SOURCE_KEY));
const P = (): PriceBook => (prices ??= load<PriceBook>(PRICE_KEY));

/** 既定の判定: クライアントで原石の段 (CraftingLevel) を持たない物は現物を買う */
export function defaultBaseSource(nameEn: string | null | undefined): BaseSource {
  return nameEn && BUY_ONLY.has(nameEn) ? "buy" : "uncut";
}

/** そのジェムの調達先 (手で変えた物があればそれ、無ければ既定) */
export function baseSourceOf(nameEn: string | null | undefined): BaseSource {
  void baseBookVersion.value;
  if (!nameEn) return "uncut";
  return S()[nameEn] ?? defaultBaseSource(nameEn);
}

/** 手で切り替える。既定と同じ値に戻したら覚えない */
export function setBaseSource(nameEn: string, v: BaseSource): void {
  const b = S();
  if (v === defaultBaseSource(nameEn)) delete b[nameEn];
  else b[nameEn] = v;
  save(SOURCE_KEY, b);
}

/**
 * 現物 (コラプト無し) の最安 (高貴) を覚える。null は「出品が無かった」なので触らない。
 * total = 検索に掛かった出品数 (オーナー 2026-09-19「原石素材 1 個しかないのおかしい」→ 何件の中の最安かを
 * 画面に出せるように残す)
 */
export function noteBaseBuy(
  nameEn: string | null | undefined,
  exalted: number | null | undefined,
  total?: number,
  prices?: number[],
): void {
  if (!nameEn || exalted == null || !Number.isFinite(exalted)) return;
  const b = P();
  b[nameEn] = { exalted, at: Date.now(), total, prices };
  save(PRICE_KEY, b);
}

/** 覚えている現物の最安 (高貴)・取った時刻・その時の出品数・最安から順の値段 */
export function cachedBaseBuy(nameEn: string | null | undefined): { exalted: number; at: number; total?: number; prices?: number[] } | null {
  void baseBookVersion.value;
  if (!nameEn) return null;
  return P()[nameEn] ?? null;
}

/**
 * 現物を N 個買う時の合計 (高貴)。**最安 1 件 × N ではなく、最安から N 件の合計**
 * (オーナー指示 2026-09-19:「最安値順に並べたときに、回数指定した際の合計を書こう」)。
 * 覚えている件数を超える分は、取れている中で一番高い値で埋める (足りない旨は画面に出す)。
 */
export function baseBuyTotal(nameEn: string | null | undefined, n: number): { total: number; covered: number } | null {
  const hit = cachedBaseBuy(nameEn);
  if (!hit || n <= 0) return null;
  const list = hit.prices?.length ? hit.prices : [hit.exalted];
  let total = 0;
  for (let i = 0; i < n; i++) total += list[Math.min(i, list.length - 1)];
  return { total, covered: Math.min(n, list.length) };
}
