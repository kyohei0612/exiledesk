/**
 * daily-share.ts — デイリーの提出の後の X シェア (D-38、11-11 オーナー「デイリー挑戦終わった画面でシェアできるようにしたいな流石に」)。
 * 仕組みはエミュの運試しのシェア (M-65、use-spam-share.ts) と同じ: 中身を縮めて短い id にし、押した時に POST /s/new で置いて /s/<id> の X のカード。
 * 中身の並びは server/web/og-card.js の PACK と同じ (先頭 15 個は運試しの物で空け、16 番目から kd = "daily"・dy = お題の id・rt = 完成率・pl = 順位・pe = 「/ N 人」の N (placeOf、順位の表に載った人数。スイッチ dailyShareRanked が閉じている間は挑戦した人数)・21 番目 sk = その時の皮の id、無ければ null = 元の真鍮の色)。
 * カードの絵は server/web/daily-card.js、カードを押した先はその日のお題のページ。木 (レシピ) は入れない
 */
import { tr, isEn } from "../../i18n/lang";
import { jaTypeName } from "../../i18n/item-names-ja";
import { baseArtFile } from "../../components/art/base-art";
import { packCard, sendShare, shareOrigin, shortIdOf } from "../craft-stage/use-spam-share";
import { flag } from "../../web/release-flags";
import { rankOf, SOLVE_RATE, topicOfId } from "./daily-api";

/**
 * 検索に引っかかる基本のハッシュタグ (11-11 オーナー「シェアに基本ハッシュタグ頼むね色々検索引っかかるように」)。
 * X は日本語を 2 字で数えるので、本文・URL (23 字) 込みで 280 字に収まる数 (日本語の文で長い名前でも 230 字ほど)
 */
const SHARE_TAGS_JA = "#PoE2 #パスオブエグザイル2 #PathofExile2 #PoE2クラフト #ExileDesk #デイリークラフト";
const SHARE_TAGS_EN = "#PoE2 #PathofExile2 #PoE2Crafting #ExileDesk #DailyCraft";

export type DailyShare ={ url: string; code: string; text: string; web: string };

/**
 * その時の順位 (今日の順位の表での位、完成 0 は null) と「/ N 人」の N。
 * N = 順位の表に載った人数 (押した時にこの端末に出ている順位の表の行の数、自分の行を含む。スイッチ dailyShareRanked、
 * 11-12 オーナー「スマホだけどランキング人数おかしい」→「イ」= 表は 3 行なのにシェアは「1 位 / 6 人」だった)。
 * 閉じている間は前の数え方 = 挑戦した人数 (途中・諦めた人・始めずに諦めた人も入る)。
 * 表はサーバーが上位 50 人まで返すので、載った人が 50 人を超える日は N が 50 で止まる (D-38)
 */
export function placeOf(id: string, rate: number): { place: number | null; entered: number } {
  const t = topicOfId(jaTypeName, id);
  const rows = rankOf(id), i = rows.findIndex((r) => r.me);
  const place = rate >= SOLVE_RATE && i >= 0 ? i + 1 : null;
  if (flag("dailyShareRanked")) return { place, entered: Math.max(rows.length, place ?? 0) };
  return { place, entered: Math.max(t?.tries ?? 0, rows.length, place ?? 0) };
}

/** シェアの中身 (URL・投稿の文)。お題が引けなければ null */
export async function dailyShare(id: string, cost: number | null, rate: number, skin: string | null = null): Promise<DailyShare | null> {
  const t = topicOfId(jaTypeName, id);
  if (!t) return null;
  const en = isEn.value;
  const name = en ? t.base : t.baseJa || t.base;
  const { place, entered } = placeOf(id, rate);
  const costText = cost == null || rate < SOLVE_RATE ? "—" : `${cost} ${tr("神", "div")}`;
  const code = await packCard([
    en ? "en" : "ja", t.base, name, null, null, baseArtFile(t.base), null, null, null, costText, null, null, null, null, null,
    "daily", id, rate, place, entered, skin,
  ]);
  const url = `${shareOrigin()}/s/${await shortIdOf(code)}`;
  const day = id.replace(/^d\d{4}-/, "").replace("-", "/");
  const rankLine = place ? tr(`${place} 位 / ${entered} 人`, `#${place} of ${entered}`) : tr("順位なし (完成 0)", "unranked (nothing finished)");
  const text = tr(
    `デイリークラフトチャレンジ ${day} 「${name}」 完成 1 個あたり ${costText}・完成率 ${rate}%・${rankLine}\n${SHARE_TAGS_JA}`,
    `Daily Craft Challenge ${day} "${name}": ${costText} per finished item, ${rate}% finished, ${rankLine}\n${SHARE_TAGS_EN}`,
  );
  return { url, code, text, web: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}` };
}

/** 押した時: 中身を置いて X へ (運試しと同じ sendShare。記録は kind = daily) */
export function sendDailyShare(e: MouseEvent, s: DailyShare, id: string): void {
  sendShare(e, { code: s.code, web: s.web, text: s.text, url: s.url, log: { kind: "daily", topic: id } });
}
