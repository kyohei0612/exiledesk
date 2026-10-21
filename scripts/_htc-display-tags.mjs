// build-htc-bases-from-client.mjs の画面用のタグ (2026-10-22 に main から移した、中身はそのまま)
import { FACTION_TAGS, cleanDisplayTags } from "./_htc-mod-build.mjs";

/** MODS = クライアントの mods.en.json、hmods = 同梱の MOD (id → MOD)。返すのは { modDisplayTags, statTags } */
export function buildDisplayTags(MODS, hmods) {
  /**
   * 同梱の MOD の画面用タグ (中身のタグ、クライアントの implicit_tags)。同梱のデータは tags が空 (エッセンス) か勢力だけ (冒涜) なので、
   * ① 段の codes (クライアントの Mods の Id) から引く → ② 無ければ同じ領域 (item / desecrated) の同じ系統 → ③ エッセンスは普通の系統
   * (2026-10-05 オーナー「タグ全然足りてない、エンジン見直してしっかりタグ付けて」)。確率に使う tags とは別の欄
   */
  // 文面は数を # にして比べる (クライアント "+(13-17)% to …" / 同梱 "+#% to …")。同じ系統にも複合 MOD などが同居するので、
  // 系統だけで合わせると別物のタグが混ざる (普通の最大ライフに マナ が付いた)。文面が合う物を先に、無ければ系統
  // クライアントの文は [Attack] や [Critical|Critical Hit] のカッコ付き (見た目の字は | の後ろ)。同梱は無し。先頭の + も揃える
  const normText = (t) => String(t ?? "").replace(/\[([^\]|]*\|)?([^\]]*)\]/g, "$2").replace(/^\+/gm, "").replace(/\(\s*-?[\d.]+\s*[-—–]\s*-?[\d.]+\s*\)|-?[\d.]+/g, "#").replace(/\s+/g, " ").trim().toLowerCase();
  const famTags = new Map();
  const textTags = new Map();
  const put = (map, k, tags) => { const set = map.get(k) ?? new Set(); for (const t of tags || []) set.add(t); map.set(k, set); };
  for (const m of Object.values(MODS)) {
    const fam = m.groups?.[0];
    if (!fam || (m.domain !== "item" && m.domain !== "desecrated")) continue;
    put(famTags, `${m.domain}|${fam}`, m.implicit_tags);
    put(textTags, `${m.domain}|${fam}|${normText(m.text)}`, m.implicit_tags);
  }
  const modDisplayTags = {};
  for (const m of hmods.values()) {
    // 普通の MOD は同梱の tags がクライアントの implicit_tags と同じなので作らない (画面は tags をそのまま使う)
    if (m.source === "normal") continue;
    const set = new Set();
    // 段の codes は候補が複数並ぶ事がある (完全なヒステリーのエッセンス = 攻撃用・呪文用・味方用・罠用・普通 の 5 つ)。
    // 全部の和を取ると別物のタグ (攻撃・呪文) が混ざるので、文面が合う code だけを使う。合う物が無ければ共通するタグだけ
    // (2026-10-05 オーナー「腕のエッセンスでクリダメ増加にダメージとクリティカルしかないのに付いてる」)
    for (const t of m.tiers || []) {
      const cs = (t.codes || []).filter((c) => MODS[c]);
      if (!cs.length) continue;
      const same = cs.filter((c) => normText(MODS[c].text) === normText(m.text));
      if (same.length) { for (const c of same) for (const tag of MODS[c].implicit_tags || []) set.add(tag); continue; }
      const common = cs.map((c) => new Set(MODS[c].implicit_tags || [])).reduce((x, y) => new Set([...x].filter((q) => y.has(q))));
      for (const tag of common) set.add(tag);
    }
    if (!set.size) {
      const dom = m.source === "desecrated" ? "desecrated" : "item";
      const hit = textTags.get(`${dom}|${m.family}|${normText(m.text)}`) ?? textTags.get(`item|${m.family}|${normText(m.text)}`)
        ?? famTags.get(`${dom}|${m.family}`) ?? famTags.get(`item|${m.family}`);
      for (const tag of hit ?? []) set.add(tag);
    }
    // 勢力のタグは同梱の tags (確率に使う、正しい) の物だけにする。系統の和に落ちた時に別の勢力が混ざるので (2026-10-05 点検: 169 件)
    for (const t of [...set]) if (FACTION_TAGS.has(t)) set.delete(t);
    for (const t of m.tags || []) if (FACTION_TAGS.has(t)) set.add(t);
    const clean = cleanDisplayTags(set);
    if (clean.length) modDisplayTags[m.id] = clean;
  }
  /**
   * stat の組 → 画面用のタグ (勢力は除く)。ルーン等の中身の違う MOD を 1 行にまとめた物を分けた後 (src/services/htc/rune-split.ts)、
   * 分けた行ごとにタグを引き直すのに使う (2026-10-05 点検: 分けた行が元の和のタグを引き継いでいた、120 件)
   */
  const statTagSets = new Map();
  for (const m of Object.values(MODS)) {
    if (m.domain !== "item" && m.domain !== "desecrated") continue;
    const key = (m.stats || []).map((x) => x.id).filter(Boolean).join(",");
    if (!key) continue;
    put(statTagSets, key, (m.implicit_tags || []).filter((t) => !FACTION_TAGS.has(t)));
  }
  const statTags = Object.fromEntries([...statTagSets].map(([k, v]) => [k, cleanDisplayTags(v)]).filter(([, v]) => v.length));
  return { modDisplayTags, statTags };
}
