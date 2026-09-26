/**
 * 1 キャラのスキルグループ (poe.ninja skills[]) の集計
 *
 * ingest.ts から切り出し (2026-09-26)。
 */
import type { AscendancyCounter } from "./counters";

interface RawGemProperty {
  name?: string;
  values?: unknown;
}
interface RawSkillGroup {
  allGems?: { name?: string; itemData?: { support?: boolean; properties?: RawGemProperty[] } }[];
  dps?: { dps?: number }[];
}

/** poe.ninja のジェム properties から数値を 1 つ読む ("Level" → 21、"[Quality]" → "+23%" の 23) */
function gemPropertyNumber(props: RawGemProperty[] | undefined, key: string): number | null {
  if (!Array.isArray(props)) return null;
  for (const p of props) {
    if (p?.name !== key) continue;
    const first = Array.isArray(p.values) ? (p.values[0] as unknown) : null;
    const raw = Array.isArray(first) ? first[0] : null;
    if (typeof raw !== "string") return null;
    const digits = raw.replace(/[^0-9]/g, "");
    return digits ? Number(digits) : null;
  }
  return null;
}

/** レベル 21 以上 (コラプトで超えた分) */
const LVL_BREAK = 21;
/** 品質 23% 以上 */
const Q_BREAK = 23;

/**
 * 1 character の skills[] (poe.ninja のスキルグループ) を集計する。
 *   - 同キャラで同じスキルが複数グループにあっても人数は 1
 *   - サポートは「そのスキルと同じグループにあった物」を人数単位で数える
 *   - DPS 最大のグループの (トリガー以外の) 先頭スキルを「主力」として数える
 */
export function ingestCharacterSkills(asc: AscendancyCounter, raw: unknown[] | undefined, isMeta: (nameEn: string) => boolean): void {
  if (!Array.isArray(raw)) return;
  const seenSkill = new Set<string>();
  const seenPair = new Set<string>();
  const seenLvl = new Set<string>();
  const seenQ = new Set<string>();
  const seenBoth = new Set<string>();
  let bestDps = -1;
  let bestMain: string | null = null;
  for (const g of raw as RawSkillGroup[]) {
    if (!g || !Array.isArray(g.allGems)) continue;
    const mains: string[] = [];
    const supports: string[] = [];
    /** 名前 → そのグループで見えたレベル / 品質 (サポートは持たない) */
    const stats = new Map<string, { level: number | null; quality: number | null }>();
    for (const gem of g.allGems) {
      const n = typeof gem?.name === "string" ? gem.name.trim() : "";
      if (!n) continue;
      if (gem.itemData?.support) {
        supports.push(n);
        continue;
      }
      mains.push(n);
      const props = gem.itemData?.properties;
      stats.set(n, { level: gemPropertyNumber(props, "Level"), quality: gemPropertyNumber(props, "[Quality]") });
    }
    if (mains.length === 0) continue;
    const dps = Array.isArray(g.dps) ? g.dps.reduce((m, d) => Math.max(m, typeof d?.dps === "number" ? d.dps : 0), 0) : 0;
    if (dps > bestDps) {
      bestDps = dps;
      bestMain = mains.find((m) => !isMeta(m)) ?? mains[0];
    }
    for (const m of mains) {
      let b = asc.skills.get(m);
      if (!b) {
        b = { nameEn: m, count: 0, mainCount: 0, supports: new Map<string, number>(), lvl21: 0, q23: 0, both: 0, maxLevel: 0, maxQuality: 0 };
        asc.skills.set(m, b);
      }
      if (!seenSkill.has(m)) {
        seenSkill.add(m);
        b.count += 1;
      }
      // レベル / 品質のランキング (同キャラ同スキルは 1 回だけ数える)
      const st = stats.get(m);
      if (st) {
        const lvlOk = (st.level ?? 0) >= LVL_BREAK;
        const qOk = (st.quality ?? 0) >= Q_BREAK;
        if (st.level != null) b.maxLevel = Math.max(b.maxLevel, st.level);
        if (st.quality != null) b.maxQuality = Math.max(b.maxQuality, st.quality);
        if (lvlOk && !seenLvl.has(m)) {
          seenLvl.add(m);
          b.lvl21 += 1;
        }
        if (qOk && !seenQ.has(m)) {
          seenQ.add(m);
          b.q23 += 1;
        }
        if (lvlOk && qOk && !seenBoth.has(m)) {
          seenBoth.add(m);
          b.both += 1;
        }
      }
      for (const s of supports) {
        const key = `${m}::${s}`;
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        b.supports.set(s, (b.supports.get(s) ?? 0) + 1);
      }
    }
  }
  if (bestMain && bestDps > 0) {
    const b = asc.skills.get(bestMain);
    if (b) b.mainCount += 1;
  }
}
