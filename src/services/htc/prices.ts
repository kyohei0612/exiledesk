/**
 * prices.ts — クラフトエンジンに**実勢価格**を渡す (2026-09-22)
 *
 * 上流 POE2HTC は静的な `prices.json` を同梱していますが、取り込んでいません。ここが
 * ExileDesk の相場 (poe2scout、高貴建て) をエンジンの価格表の形に組み直す場所です。
 * **ここが HTC に無い部分**で、「作れるか」ではなく「儲かるか」を出すための入口になります。
 *
 * ## 突き合わせ方
 * エンジンは `transmute_perfect` / `desecrate_ancient` / `OmenofLight` のような自前のキーで引きます。
 * 相場は英語名で並んでいます。その対応表が `price-keys.json`
 * (`scripts/build-htc-price-keys-from-client.mjs` がクライアントから作る。名前は手で書かない)。
 * ルーンだけは上流の `runeIdByName` がそのまま使えるので表に入れていません
 * (アポストロフィの揺れをあちらが吸収してくれる)。
 *
 * ## 単位
 * poe2scout の `CurrentPrice` は**高貴 (Exalted) 建て**で、エンジンの単位も exalt-equivalent。
 * そのまま渡せます。`exalt` 自身は 1。
 *
 * ## エッセンスは 1 本ずつ
 * エンジンはエッセンスを `essence:<level>:<modId>` と**1 本ずつ**引きます。上流も書いている通り
 * 「グレーターエッセンスの値段」という物は無く (同じ等級でも 0.8 ex から 116 ex まで散る)、
 * 代表値で埋めると期待費用が大きく狂うからです。対応表は `essence-keys.json`
 * (`scripts/build-htc-essence-prices-from-client.mjs`、1,514 件)。
 *
 * ## 冒涜の骨
 * `desecrate` / `desecrate_ancient` は上流の `pricesForBase` が装備の種別から骨を選んで埋めます
 * (武器 = 顎の骨 / 防具 = 肋骨 / 装飾品 = 鎖骨)。こちらは `bones` を渡すだけでよい。
 *
 * ## 埋まらないキーは 0 ではなく「無い」
 * 相場に無い物を 0 で埋めると、その手順が**タダ**になって解が壊れます。入れずに落とし、
 * `HtcPriceCoverage.missing` に出して画面で断ります。
 */
import { runeIdByName } from "../../vendor/poe2htc/engine/runes";
import type { PricesFile } from "../../vendor/poe2htc/optimizer/cost";
import { marketStore } from "../../state/market-store";
import keys from "./price-keys.json";
import essenceKeys from "./essence-keys.json";

/** ゲーム内の名前。英語は相場の引き当て用、日本語は画面用 (どちらもクライアント由来) */
export interface GameName {
  en: string;
  ja: string;
}

interface PriceKeys {
  generated: string;
  source: string;
  /** エンジンのキー → ゲーム内の名前 */
  currency: Record<string, GameName>;
  bones: Record<string, GameName>;
  omens: Record<string, GameName>;
}

const KEYS = keys as PriceKeys;

/** `essence:<level>:<modId>` → ゲーム内の名前 */
const ESSENCE_KEYS = (essenceKeys as { keys: Record<string, GameName> }).keys;

/** 何が埋まって何が埋まらなかったか。画面でそのまま断るために使う */
export interface HtcPriceCoverage {
  /** 値が入ったキーの数 */
  filled: number;
  /** 相場に無くて落としたキー (このキーを使う手順は解に出せない) */
  missing: string[];
  /** 相場を取った時刻の表示用文字列 */
  fetchedLabel: string;
  /** リーグ名 */
  league: string | null;
  /** 値が入ったエッセンスの数 / 対応表にある数 */
  essences: { filled: number; total: number };
}

/** 英語名そのままで相場を引く。見つからない / 0 以下は null */
function priceByText(textEn: string): number | null {
  const hit = marketStore.items.value.find((it) => it.Text === textEn);
  return hit && typeof hit.CurrentPrice === "number" && hit.CurrentPrice > 0 ? hit.CurrentPrice : null;
}

/**
 * 今の相場からエンジンの価格表を作る。
 *
 * `ensureMarket()` を先に呼んでおくこと (相場が空なら全部 missing になります)。
 */
export function buildHtcPrices(): { file: PricesFile; coverage: HtcPriceCoverage } {
  const prices: Record<string, number> = {};
  const bones: Record<string, number> = {};
  const omens: Record<string, number> = {};
  const missing: string[] = [];

  const put = (into: Record<string, number>, key: string, name: GameName) => {
    const p = priceByText(name.en);
    if (p == null) missing.push(`${key} (${name.ja})`);
    else into[key] = p;
  };

  for (const [key, name] of Object.entries(KEYS.currency)) put(prices, key, name);
  for (const [key, name] of Object.entries(KEYS.bones)) put(bones, key, name);
  for (const [key, name] of Object.entries(KEYS.omens)) put(omens, key, name);

  // エッセンスは 1 本ずつ。名前が同じ物が何百とあるので、名前 → 値段は 1 度だけ引いて使い回す
  const essenceCache = new Map<string, number | null>();
  let essenceFilled = 0;
  const essenceMissingNames = new Set<string>();
  for (const [key, name] of Object.entries(ESSENCE_KEYS)) {
    if (!essenceCache.has(name.en)) essenceCache.set(name.en, priceByText(name.en));
    const p = essenceCache.get(name.en) ?? null;
    if (p == null) essenceMissingNames.add(name.ja);
    else {
      prices[key] = p;
      essenceFilled++;
    }
  }
  // 落ちたエッセンスは**名前ごと**に 1 行だけ出す (キーで出すと数百行になる)
  for (const n of essenceMissingNames) missing.push(`エッセンス (${n})`);

  // 高貴そのものは 1。相場表にも載っているが、単位である以上ここで固定するほうが確実
  prices.exalt = 1;

  // ルーンは上流の名前引きをそのまま使う (アポストロフィの揺れを吸収してくれる)
  for (const it of marketStore.items.value) {
    const id = runeIdByName(it.Text);
    if (!id || typeof it.CurrentPrice !== "number" || it.CurrentPrice <= 0) continue;
    prices[`rune:${id}`] = it.CurrentPrice;
  }

  const file: PricesFile = {
    prices,
    omens,
    bones,
    updated: new Date().toISOString().slice(0, 10),
    unit: "exalt-equivalent",
    source: `poe2scout の実勢価格 (${marketStore.league.value?.Value ?? "リーグ不明"}、高貴建て)。対応表は ${KEYS.source}`,
    // 実勢なので推定ではない。ただし相場自体は「今の最安」なので、断りは coverage 側で出す
    estimated: false,
    ...(missing.length ? { caveat: `相場に無くて落としたキー ${missing.length} 件。そのキーを使う手順は解に出ません。` } : {}),
  };

  return {
    file,
    coverage: {
      filled: Object.keys(prices).length + Object.keys(bones).length + Object.keys(omens).length,
      missing,
      fetchedLabel: marketStore.fetchedLabel.value,
      league: marketStore.league.value?.Value ?? null,
      essences: { filled: essenceFilled, total: Object.keys(ESSENCE_KEYS).length },
    },
  };
}
