/**
 * hover-item.ts — 火力チェックの装備 (ItemView) → ホバーカードの型 (BuildItem) (2026-10-03)
 *
 * オーナー「固有名詞やらスキル・武器にホバーでカード表示はいつもどおりやってほしい」。
 * カードは 値段のタブ・忍者ビルドコピーと同じ BuildItemHoverCard (kind "build") を使うので、PoB から来た ItemView を BuildItem の形にする。
 *   - 名前 / ベース / レアリティ / 暗黙 / 明示 / コラプト は PoB が解決した ItemView の物 (数値のロールが入った文面)
 *   - 品質 / アイテムレベル / 差したルーンの名前 / ソケット数 / 防御値 / 聖別 は PoB の文面 (raw = BuildRaw) を 値段のタブと同じ
 *     parseItemText で読む。ItemView.runes はルーンの「効果の行」なので名前には使えない
 * 計算には一切使わない (見せるだけ)
 */
import { parseItemText, type BuildItem } from "../build-copy/pob";
import type { ItemView } from "./api";
import { slotJa } from "./slots";

const RARITIES = new Set<BuildItem["rarity"]>(["NORMAL", "MAGIC", "RARE", "UNIQUE", "RELIC"]);

export function toBuildItem(it: ItemView, slot: string, opts: { jewel?: boolean; weaponSet?: number } = {}): BuildItem {
  // raw が崩れていても落ちない (読めなければ品質などが 0 のまま)
  let parsed: ReturnType<typeof parseItemText> | null = null;
  try {
    parsed = it.raw ? parseItemText(it.raw) : null;
  } catch {
    parsed = null;
  }
  const r = (it.rarity || "").toUpperCase() as BuildItem["rarity"];
  return {
    slot: slotJa(slot, opts),
    swap: /Swap$/.test(slot),
    kind: opts.jewel || slot.startsWith("Jewel") ? "jewel" : /^Flask/.test(slot) ? "flask" : /^Charm/.test(slot) ? "charm" : "equip",
    rarity: RARITIES.has(r) ? r : "NORMAL",
    name: it.title,
    base: it.base,
    // 「Rune: None」は空のソケット
    runes: (parsed?.runes ?? []).filter((x) => x && x !== "None"),
    enchants: parsed?.enchants ?? [],
    raw: it.raw,
    implicits: it.implicits,
    mods: it.explicits,
    corrupted: it.corrupted,
    sanctified: parsed?.sanctified ?? false,
    quality: parsed?.quality ?? 0,
    itemLevel: parsed?.itemLevel ?? 0,
    armour: parsed?.armour ?? 0,
    evasion: parsed?.evasion ?? 0,
    energyShield: parsed?.energyShield ?? 0,
    sockets: parsed?.sockets ?? 0,
  };
}
