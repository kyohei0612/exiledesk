/**
 * trade-links.ts — 火力チェックの「取引所で探す」(2026-10-03、代替品 B)
 *
 * 外部 API は叩かない: 条件 JSON を `?q=` に載せた取引所の URL を開くだけ (忍者ビルドコピーと同じ trade2QueryUrl。
 * jp / www の設定もそちらと同じ)。値段の自動取得は入れない (オーナー方針。押した時だけ動くボタンなら将来置ける)
 *   - ユニーク: 名前 + ベースで探す (ルーンの熟達品は同じ名前の別物なのでベースも絞る。忍者ビルドコピーと同じ)
 *   - レアの足りない MOD: 相手にあって自分に無い行 / 弱い行 (英語の PoB の行) を取引所の条件の番号に引き (build-copy の textStats)、
 *     数値はそのまま下限に (lineFilters の 100%)。ベースは相手の物の種類だけ (防御値・ソケットは入れない = 擬似アイテム)
 */
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { marketStore } from "../../state/market-store";
import { trade2QueryUrl } from "../trade2/league";
import { buildUniqueNameQuery } from "../trade2/query/item-queries";
import { loadStatText, textStats } from "../build-copy/prices";
import { lineFilters, query } from "../build-copy/rare-trade-query";
import type { Equip, RareLine } from "../build-copy/rare-query";
import type { ItemView } from "./api";

/** 取引所の MOD の文面の一覧を読む (画面を開いた時に 1 回) */
export const prepareTradeLinks = (): Promise<void> => loadStatText();

/** ユニークを探す条件 */
export function uniqueSearchQuery(it: Pick<ItemView, "title" | "base">): unknown {
  return buildUniqueNameQuery(it.title, { baseType: it.base });
}

/** 防御値・ソケット・品質・付与スキルは条件にしない (足りない MOD だけの擬似アイテム) */
const NO_EQUIP: Equip = { armour: 0, evasion: 0, energyShield: 0, sockets: 0, quality: 0, grantedSkill: null };

/**
 * レアの足りない MOD を探す条件。lines = 相手の行 (英語)。条件にできた行が 1 つも無ければ null。
 * missing = 取引所の条件の番号が引けなかった行 (画面に「条件にできない行」として出す)
 */
export function rareModsSearchQuery(base: string, lines: readonly string[]): { query: unknown; missing: string[] } | null {
  const t = textStats(lines);
  if (!t.lines.length) return null;
  const rare: RareLine[] = t.lines.map((x) => ({ text: x.text, ids: x.ids, value: x.value, negative: x.negative, fixed: x.value != null && x.value <= 1 }));
  return { query: query(base, lineFilters(rare, 100), NO_EQUIP, null), missing: t.missing };
}

/** 取引所をブラウザで開く (今のリーグ、jp / www は設定どおり)。Web 版 (Tauri でない) は新しいタブ */
export async function openTradeQuery(q: unknown): Promise<void> {
  const url = trade2QueryUrl(marketStore.tradeLeague.value, q);
  if (isTauriRuntime()) await openUrl(url);
  else window.open(url, "_blank", "noopener");
}
