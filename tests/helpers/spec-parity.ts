/**
 * ADR-004 の打ち比べ (説明文の分解 = spec/ と今の applyCurrency) で共通に使う物 (2026-10-16)。
 * 比べ方・ベースの選び方・打つ前の状態は tests/currency-spec-parity.test.ts (冒涜まわり) と tests/currency-spec-orbs.test.ts (オーブ類から先) で同じ
 */
import { loadPatch } from "./patch";
import { applyCurrency } from "../../src/services/craft-stage/apply-currency";
import { freshItem } from "../../src/services/craft-stage/run-plan";
import { mulberry32 } from "../../src/services/htc/rng";
import { itemBaseFor } from "../../src/services/htc/bridge";
import STAGE_BASES from "../../src/services/craft-stage/stage-bases.json";
import type { StageApply, StageItem } from "../../src/services/craft-stage/types";

export const data = loadPatch();

/** キーの並びに依らない文字列 (中身の比べ用) */
export function canon(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v));
}
export interface Diff { where: string; field: string; old: string; next: string }
/** 1 手の比べ。結果 (打てたか・当たり所か・アイテム・足し引き・食ったお告げ・付いた確率・一言・使った数) と弾いた一言 */
export function compare(where: string, a: StageApply, b: StageApply, out: Diff[]): void {
  const fields: Array<[string, unknown, unknown]> = [
    ["applied", a.applied, b.applied],
    ["random", !!a.random, !!b.random],
    ["item", a.item, b.item],
    ["added", a.added, b.added],
    ["removed", a.removed, b.removed],
    ["omensUsed", a.omensUsed ?? [], b.omensUsed ?? []],
    ["rolled", a.rolled ?? [], b.rolled ?? []],
    ["picked", a.picked ?? [], b.picked ?? []],
    ["pickError", !!a.pickError, !!b.pickError],
    ["note", a.note ?? "", b.note ?? ""],
    ["count", a.count ?? 1, b.count ?? 1],
    ["augment", a.augment ?? null, b.augment ?? null],
    ["reason", a.reason ?? "", b.reason ?? ""],
  ];
  for (const [field, x, y] of fields) {
    const cx = canon(x), cy = canon(y);
    if (cx !== cy) out.push({ where, field, old: cx.slice(0, 200), next: cy.slice(0, 200) });
  }
}
export const show = (d: Diff[]): string => d.slice(0, 8).map((x) => `${x.where} [${x.field}]\n  今: ${x.old}\n  新: ${x.next}`).join("\n");

/**
 * 弾いた一言だけが違う (どちらも打てない・アイテムも同じ)。決まりを見る順が違うだけの物は「今 → 新」の組で数える。
 * 組の一覧は docs/reviews/2026-10-16-adr-004-orbs-diff.md の「一言だけ違う」と同じにしておく
 */
export function reasonOnly(d: readonly Diff[]): string | null {
  if (!d.length || d.some((x) => x.field !== "reason")) return null;
  const r = d[0]!;
  return `${JSON.parse(r.old)} → ${JSON.parse(r.next)}`;
}

/** 部位ごとに 1 つ (ステージのベースの最後 = 高いレベルの物) と、枠の暗黙のあるベース・ジュエル */
export const BASES: string[] = (() => {
  const byCls = new Map<string, string>();
  for (const [name, v] of Object.entries((STAGE_BASES as { bases: Record<string, { cls: string }> }).bases)) byCls.set(v.cls, name);
  const names = [...byCls.values(), "Gold Ring", "Dusk Ring", "Absent Amulet", "Amber Amulet", "Akoyan Spear", "Ruby", "Emerald", "Sapphire"];
  return [...new Set(names)].filter((n) => itemBaseFor(data, n));
})();
export const RARE_BASES = BASES.filter((n) => !/Flask$/.test(n));

/** 打つ前の状態 (今の applyCurrency で作る。同じ物を両方に渡す) */
export function statesOf(base: string, ilvl: number): Array<[string, StageItem]> {
  const out: Array<[string, StageItem]> = [];
  let k = 0;
  const step = (it: StageItem, key: string, omens: string[] = []): StageItem => applyCurrency(data, it, key, mulberry32(ilvl * 1000 + ++k), omens, { legacy: true }).item;
  const white = freshItem(data, base, ilvl);
  out.push(["ノーマル", white]);
  if (/Flask$/.test(base)) return out;
  const magic = step(white, "transmute");
  out.push(["マジック", magic]);
  const rare1 = step(magic, "regal");
  out.push(["レア 2 つ", rare1]);
  const rare4 = step(white, "alchemy");
  out.push(["レア 4 つ", rare4]);
  const rare5 = step(rare4, "exalt");
  out.push(["レア 5 つ", rare5]);
  const full = step(rare5, "exalt");
  out.push(["レア 満杯", full]);
  let pre = rare4;
  for (let i = 0; i < 3; i++) pre = step(pre, "exalt", ["OmenofSinistralExaltation"]);
  out.push(["プレ満杯", pre]);
  const frac = step(full, "fracture");
  out.push(["フラクチャー済み", frac]);
  const hidden = step(rare4, "desecrate");
  out.push(["未発現", hidden]);
  const hiddenFull = step(full, "desecrate");
  out.push(["満杯から未発現", hiddenFull]);
  out.push(["発現済み", step(hidden, "reveal:1")]);
  const mark = step(rare4, `essence:perfect:${rare4.cls.id}/PerfectEssence_EssenceAbyss`);
  out.push(["深淵の王の印", mark]);
  out.push(["腐食", step(rare4, "desecrate", ["OmenofPutrefaction"])]);
  out.push(["コラプト", { ...rare4, corrupted: true }]);
  out.push(["ミラー", { ...rare4, mirrored: true }]);
  out.push(["未鑑定", { ...rare4, identified: false }]);
  out.push(["予見", { ...rare4, foreseen: true }]);
  return out;
}

/**
 * オーブ類から先で足す状態: マジック 2 つ・触媒の品質・ユニーク・サフィが上限を超えた (侮蔑を外した後と同じ形)・空のレア・聖別・ソケット
 */
export function moreStatesOf(base: string, ilvl: number): Array<[string, StageItem]> {
  const out: Array<[string, StageItem]> = [];
  let k = 500;
  const step = (it: StageItem, key: string, omens: string[] = []): StageItem => applyCurrency(data, it, key, mulberry32(ilvl * 1000 + ++k), omens, { legacy: true }).item;
  const white = freshItem(data, base, ilvl);
  if (/Flask$/.test(base)) return [["品質 19 のフラスコ", { ...white, quality: 19 }], ["品質 20 のフラスコ", { ...white, quality: 20 }]];
  const magic = step(white, "transmute");
  out.push(["マジック 2 つ", step(magic, "augment")]);
  const rare4 = step(white, "alchemy");
  out.push(["品質 (ライフ) 20", { ...rare4, quality: 20, qualityTag: "life" }]);
  out.push(["品質 (種類なし) 10", { ...rare4, quality: 10, qualityTag: null }]);
  out.push(["品質 20 のノーマル", { ...white, quality: 20 }]);
  out.push(["ユニーク", { ...white, rarity: "unique", unique: { en: "x", ja: "x" } }]);
  out.push(["聖別", { ...rare4, sanctified: true }]);
  out.push(["空のレア", { ...white, rarity: "rare" }]);
  const full = step(step(step(rare4, "exalt"), "exalt"), "exalt");
  const extra = full.suffixes[0];
  if (extra) out.push(["サフィが上限超え", { ...full, suffixes: [...full.suffixes, { ...extra }] }]);
  out.push(["ソケット 1", { ...rare4, sockets: 1 }]);
  out.push(["ソケット 3", { ...rare4, sockets: 3 }]);
  out.push(["予見 + ソケット 1", { ...rare4, sockets: 1, foreseen: true }]);
  out.push(["コラプト + ソケット 1", { ...rare4, sockets: 1, corrupted: true }]);
  out.push(["品質 19 のノーマル + ソケット 2", { ...white, quality: 19, sockets: 2 }]);
  const crafted = step(magic, `essence:normal:${Object.values(white.cls.pools.essence).flat()[0] ?? "x"}`);
  out.push(["エッセンス済み", crafted]);
  return out;
}
