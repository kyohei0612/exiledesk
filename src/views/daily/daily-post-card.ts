/**
 * daily-post-card.ts — 投稿に添える「絵の元」(D-20c、スイッチ dailyBoxCard)。サーバーが Discord のクラフト箱の知らせに付ける品の絵は、
 * 投稿の確かめの画面のカードと同じ表し方にする (オーナー 11-12「投稿の画像と一致させておk表示の仕方」) ので、画面に出ているカードの字をそのまま読んで送る
 * (名前・種類・アイテムレベル・防具や武器の数値の行・MOD の行と札)。カードの字を作り直さない = 画面と食い違わない。
 * 札の段だけは「お題になった時の段」(オーナー「お題になった時の段かなそこだけ変えてあげたい」): 送る時に揃え直した段 (floorAims の結果) が
 * 確かめの画面の段と違う行は、札をその段に差し替える (同じ行 = エッセンス・合金などはそのまま)
 */
import { flag } from "../../web/release-flags";
import { baseArtFile } from "../../components/art/base-art";
import { lang } from "../../i18n/lang";

/** n = 品の名前、a = ベースの絵のファイル名、h = 種類・アイテムレベル・数値の行、r = MOD の行 (s = 側、g = 札、t = 文、f = フラクチャー)、l = 言語 */
export type PostCard = { n: string; a: string | null; h: string[]; r: Array<{ s: "P" | "S"; g: string; t: string; f?: 1 }>; l: "ja" | "en" };

const clean = (s: string | null | undefined, n: number): string => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
/** 行の文: 盛った値の小さな数字は除き、2 行の MOD の改行は「 / 」に */
function ownText(el: HTMLElement): string {
  const c = el.cloneNode(true) as HTMLElement;
  for (const x of c.querySelectorAll("[data-boosted-value]")) x.remove();
  return (el.innerText.includes("\n") ? el.innerText : c.textContent ?? "").replace(/\s*\n\s*/g, " / ");
}

/**
 * 確かめの画面のカード (root の中の共通のアイテムカード) から絵の元を読む。カードが無い・MOD の行が無い時は undefined (字だけの知らせになる)。
 * was = 確かめの画面の狙い (MOD の id と段)、now = 送る時に揃え直した狙い、fractured = 狙いと同じ順のフラクチャーの印
 */
export function cardOfScreen(root: ParentNode | null, base: string, was: ReadonlyArray<{ modId: string; tier: number }>, now: ReadonlyArray<{ modId: string; tier: number }>, fractured: readonly boolean[]): PostCard | undefined {
  if (!flag("dailyBoxCard")) return undefined;
  const card = root?.querySelector<HTMLElement>("[data-stage-card]");
  if (!card) return undefined;
  const rowEls = [...card.querySelectorAll<HTMLElement>("p[data-card-mod]")];
  const en = lang.value === "en";
  const wasAt = new Map(was.map((a, i) => [a.modId, i])), nowTier = new Map(now.map((a) => [a.modId, a.tier]));
  const r = rowEls.map((el): PostCard["r"][number] | null => {
    const id = el.getAttribute("data-card-mod") ?? "";
    const tagEl = el.querySelector<HTMLElement>(":scope > span.text-stage-prefix, :scope > span.text-stage-suffix");
    // 文は真ん中の枠の 1 つ目の字 (その後ろに並ぶ「フラクチャー」などの小さな札・盛った値の小さな数字は絵に入れない)
    const mid = el.querySelector<HTMLElement>(":scope > span.flex-1"), textEl = (mid?.firstElementChild as HTMLElement | null) ?? mid;
    if (!tagEl || !textEl) return null;
    const s = tagEl.classList.contains("text-stage-suffix") ? "S" : "P";
    // カードの行 (data-card-mod の id) から、確かめの画面の段・揃え直した後の段・フラクチャーの印を引く (当たり外れは比べない、行と狙いの対応だけ)
    const i = wasAt.get(id) ?? -1, w = was[i], nt = nowTier.get(id);
    // 札: 揃え直しで段が変わった行だけ、その段の札に (1 はそのまま「P1」、ほかは「P2 以上」/「P2+」)
    const g = w && nt !== undefined && nt !== w.tier ? `${s}${nt}${nt === 1 ? "" : en ? "+" : " 以上"}` : clean(tagEl.innerText, 12);
    const t = clean(ownText(textEl), 120);
    return t ? { s, g, t, ...(i >= 0 && fractured[i] ? { f: 1 as const } : {}) } : null;
  }).filter((x): x is PostCard["r"][number] => !!x).slice(0, 12);
  if (!r.length) return undefined;
  // 種類・アイテムレベル・数値の行 = カードの本文のうち MOD の行より前にある字の行 (空きと飾りは落とす)
  const first = rowEls[0]!;
  const h: string[] = [];
  const body = first.closest<HTMLElement>("[data-stage-card] > div:not(.st-head)") ?? card;
  for (const el of body.querySelectorAll<HTMLElement>("p, [data-base-row]")) {
    if (el === first || (first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    if (el.closest("[data-card-mod]") || el.querySelector("p")) continue;
    const t = clean(el.innerText, 60);
    if (t && !h.includes(t)) h.push(t);
  }
  const n = clean(card.querySelector<HTMLElement>('[data-rec="item-name"]')?.innerText, 60) || base;
  return { n, a: baseArtFile(base), h: h.slice(0, 8), r, l: en ? "en" : "ja" };
}
