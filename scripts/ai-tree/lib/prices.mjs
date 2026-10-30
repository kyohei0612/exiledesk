/**
 * prices.mjs — 手のキー → 値段 (神)。相場は data-cache/boot の写し (高貴建て) (S-175)。
 * 無い手は 0 にしない: priceOf は undefined を返し、呼ぶ側が実行前に止める
 */
import fs from "node:fs";

export const DEFAULT_BOOT = "data-cache/boot/boot-2026-10-22.json";

export function loadMarket(path = DEFAULT_BOOT) {
  const boot = JSON.parse(fs.readFileSync(path, "utf8"));
  return { path, at: boot.market.at, league: boot.market.league, byText: new Map(boot.market.items.map((x) => [x.Text, x.CurrentPrice])) };
}

/** その手のゲームの名前 (相場を引く英語名) */
export function nameOf(M, key, cls) {
  const K = M.PRICE_KEYS;
  if (K.currency[key]) return K.currency[key];
  if (K.omens[key]) return K.omens[key];
  if (M.ESSENCE_KEYS[key]) return M.ESSENCE_KEYS[key];
  if (key.startsWith("desecrate")) {
    const bone = Object.entries(M.pricesForBase({ currency: {}, bones: Object.fromEntries(Object.keys(K.bones).map((k) => [k, k])) }, cls).currency).find(([k]) => k === key);
    if (bone) return K.bones[bone[1]];
    if (key === "desecrate_gnawed") return Object.entries(K.bones).find(([k]) => k.endsWith("_gnawed") && M.pricesForBase({ currency: {}, bones: { [k.replace("_gnawed", "")]: 1 } }, cls).currency.desecrate)?.[1];
  }
  if (M.isRune(key)) { const r = M.runeOf(key); return r ? { en: r.en ?? key.slice(5), ja: r.ja } : null; }
  return null;
}

/** 手 → 神 (相場に無ければ undefined)。over = 手順の prices (神、相場より先) */
export function priceTable(M, market, cls, over = {}) {
  const divine = market.byText.get("Divine Orb");
  if (!(divine > 0)) throw new Error("相場に神のオーブが無い");
  const cache = new Map();
  return (key) => {
    if (key in over) return over[key];
    if (key === "reveal") return 0;
    if (key === "exalt") return 1 / divine;
    if (!cache.has(key)) {
      const name = nameOf(M, key, cls);
      const p = name ? market.byText.get(name.en) : undefined;
      cache.set(key, p > 0 ? p / divine : undefined);
    }
    return cache.get(key);
  };
}
