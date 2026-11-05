/**
 * poe.ninja の character の返り (JSON) から、選び方に要るメインスキルと型に要るレアの装備だけを抜く。
 * メインスキルはアプリの `builds.rs` の main_skills と `cache_convert/to_cached.rs` のスキルグループの読みのまま
 * (dps[] の当たり dps と継続 dotDps の大きい方、名前は poe.ninja の dps[].name のまま、名前が無ければグループのジェム = メタジェム以外)。
 * 装備はアプリと違い Belt も捨てない (デイリーにベルトの日がある、D-05)。暗黙は見ない (D-06)。コラプト・聖別の印は取る (D-80d)。
 */
import gemsClient from "../../../../src/i18n/gems-client.json";

let metaGems: Set<string> | null = null;
/** トリガーのメタジェム (アプリはクライアントのジェム表の kind = meta を TS から渡していた、runner.ts) */
const meta = (): Set<string> => (metaGems ??= new Set((gemsClient as { en: string; kind: string }[]).filter((g) => g.kind === "meta").map((g) => g.en)));

export interface Main {
  /** DPS の高い順のスキル (先頭 = 一番のスキル) */
  skills: string[];
  dps: number;
}

export interface RareItem {
  slot: string;
  sub: string[];
  base: string;
  ilvl: number | null;
  quality: number | null;
  qualityKind: string | null;
  mods: string[];
  fractured?: string[];
  desecrated?: string[];
  corrupted?: boolean;
  /** 聖別の印 (itemData.sanctified)。明示の値が ×0.78〜1.22 (E-35)、型にする時に文へ置く (D-80d) */
  sanctified?: boolean;
}

type J = Record<string, unknown>;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === "string");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** properties の数字 (「+20%」→ 20)。name が合う物、無ければ name に Quality を含む物 (to_cached.rs の gem_property_number・quality_any) */
function quality(props: unknown): { q: number | null; kind: string | null } {
  const list = arr(props) as J[];
  const hit = list.find((p) => p.name === "[Quality]") ?? list.find((p) => typeof p.name === "string" && p.name.includes("Quality"));
  if (!hit) return { q: null, kind: null };
  const raw = arr(arr(hit.values)[0])[0];
  const m = typeof raw === "string" ? /-?\d+(\.\d+)?/.exec(raw) : null;
  return { q: m ? Number(m[0]) : null, kind: typeof hit.name === "string" ? hit.name : null };
}

/** メインスキル。DPS の付いたスキルが無ければ null */
export function mainOf(body: J): Main | null {
  const v: Array<[string, number]> = [];
  for (const g of arr(body.skills) as J[]) {
    const gems = arr(g.allGems) as J[];
    const mains: string[] = [];
    for (const gem of gems) {
      const name = typeof gem.name === "string" ? gem.name : "";
      if (!name) continue;
      const support = (gem.itemData as J | undefined)?.support === true;
      if (!support) mains.push(name);
    }
    if (!mains.length) continue;
    let best = 0, named: string | null = null;
    for (const d of arr(g.dps) as J[]) {
      const x = Math.max(0, num(d.dps) ?? 0, num(d.dotDps) ?? 0);
      if (x > best) {
        best = x;
        named = typeof d.name === "string" ? d.name : null;
      }
    }
    if (best <= 0) continue;
    const name = named ?? mains.find((n) => !meta().has(n)) ?? mains[0]!;
    v.push([name, best]);
  }
  v.sort((a, b) => b[1] - a[1]);
  const seen = new Set<string>(), skills: string[] = [];
  for (const [n] of v) if (!seen.has(n)) seen.add(n), skills.push(n);
  return skills.length ? { skills, dps: v[0]![1] } : null;
}

/** レアの装備 (frameType 2)。部位の無い物は捨てる */
export function rareItemsOf(body: J): RareItem[] {
  const out: RareItem[] = [];
  for (const raw of arr(body.items) as J[]) {
    const d = raw.itemData as J | undefined;
    if (!d || d.frameType !== 2 || typeof d.inventoryId !== "string") continue;
    const { q, kind } = quality(d.properties);
    const it: RareItem = {
      slot: d.inventoryId,
      sub: strs((d.extended as J | undefined)?.subcategories),
      base: typeof d.baseType === "string" ? d.baseType : "",
      ilvl: num(d.ilvl),
      quality: q,
      qualityKind: kind,
      mods: strs(d.explicitMods),
    };
    const fr = strs(d.fracturedMods), de = strs(d.desecratedMods);
    if (fr.length) it.fractured = fr;
    if (de.length) it.desecrated = de;
    if (d.corrupted === true) it.corrupted = true;
    if (d.sanctified === true) it.sanctified = true;
    if (it.base) out.push(it);
  }
  return out;
}

/** 返りの形を見る (items が配列でなければ形が変わった、アプリと同じく失敗に) */
export function readCharacter(body: unknown): { main: Main | null; items: RareItem[] } {
  if (!body || typeof body !== "object" || !Array.isArray((body as J).items)) throw new Error("character: items (array) が無い、形が変わった可能性");
  return { main: mainOf(body as J), items: rareItemsOf(body as J) };
}
