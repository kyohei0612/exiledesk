/**
 * build-diff.ts — 自分のビルドと比べる相手 (忍者のビルド等) の装備の差 (2026-10-03 オーナー
 * 「忍者ビルドコピーで自分に足りない MOD をそれぞれ出したい。ユニークは装備ごと『これからこれへ』、レアは足りない MOD だけ
 *   『これからこれ』。火力比較で。比較先もビルド読み込みと同じ流れで」)
 *
 * 決まり:
 *   - 欄ごとに比べる。どちらかがユニークなら装備ごと (名前 → 名前)。同じユニークなら差なし
 *   - レア / マジック同士は MOD の行ごと。相手にあって自分に無い行 = 足りない (無し → 相手の行)、
 *     同じ型で相手の数値が大きい行 = 弱い (自分の行 → 相手の行)。自分の方が強い行・同じ行は出さない
 *   - 行の型 = 数字を # にした英語の行 (PoB の文面)。暗黙・ルーン・明示は区別せず全部まとめる (「どの MOD が足りないか」が目的)
 *   - 英語の行のまま返す。日本語にするのは画面 (linesToJa)
 *   - ジェム (2026-10-03 オーナー「ジェムも」): 相手の組ごとにアクティブジェムの名前で自分の組を合わせ (同じ名前が複数なら順に)、
 *     自分に無い組は組ごと、ある組は 相手にあって自分に無いジェム / レベル・品質が相手の方が高い物 だけ (diffGems)。
 *     コラプトの +レベルは level に含めない (corrupt は別の欄)。英語の名前のまま返し、日本語にするのは画面 (gemJa)
 */
import type { GemView, GroupView, ItemView, SlotView, Summary } from "./api";

export interface ModDiff {
  /** 自分の行 (無ければ null = 足りない) */
  from: string | null;
  /** 相手の行 */
  to: string;
}
export type SlotDiff =
  | { slot: string; kind: "same" }
  | { slot: string; kind: "unique"; from: ItemView | null; to: ItemView }
  | { slot: string; kind: "mods"; from: ItemView | null; to: ItemView; mods: ModDiff[] }
  /** 相手は空で自分だけ持っている (差として出さないが、数は返す) */
  | { slot: string; kind: "only-mine"; from: ItemView };

const NUM = /[+-]?\d+(?:\.\d+)?/g;
/** 行の型 (数字を # に) と数字 */
export function templ(line: string): { t: string; nums: number[] } {
  const nums: number[] = [];
  const t = line.replace(NUM, (m) => {
    nums.push(Number(m));
    return "#";
  });
  return { t, nums };
}

const allLines = (it: ItemView): string[] => [...it.implicits, ...it.runes, ...it.explicits];

/** レア同士の MOD の差 */
export function diffMods(mine: ItemView | null, target: ItemView): ModDiff[] {
  const own = new Map<string, Array<{ line: string; nums: number[] }>>();
  for (const line of mine ? allLines(mine) : []) {
    const { t, nums } = templ(line);
    const arr = own.get(t) ?? [];
    arr.push({ line, nums });
    own.set(t, arr);
  }
  const out: ModDiff[] = [];
  for (const line of allLines(target)) {
    const { t, nums } = templ(line);
    const have = own.get(t);
    if (!have?.length) {
      out.push({ from: null, to: line });
      continue;
    }
    // 同じ型が複数 (耐性 2 つなど) なら一番近い物と比べる。数字が無い行は有るだけで同じ
    const best = have.reduce((a, b) => (Math.abs((b.nums[0] ?? 0) - (nums[0] ?? 0)) < Math.abs((a.nums[0] ?? 0) - (nums[0] ?? 0)) ? b : a));
    have.splice(have.indexOf(best), 1);
    if (nums.length && (best.nums[0] ?? 0) < (nums[0] ?? 0)) out.push({ from: best.line, to: line });
  }
  return out;
}

/** 欄 1 つの差 */
export function diffSlot(slot: string, mine: ItemView | null, target: ItemView | null): SlotDiff {
  if (!target) return mine ? { slot, kind: "only-mine", from: mine } : { slot, kind: "same" };
  const uniq = (x: ItemView | null): boolean => !!x && x.rarity.toUpperCase() === "UNIQUE";
  if (uniq(mine) || uniq(target)) {
    // 同じユニーク (名前が同じ) は差なし。ベースの表記の違い (ルーンフォージ等) や数値のロールの差は見ない
    if (mine && uniq(mine) && uniq(target) && mine.title === target.title) return { slot, kind: "same" };
    return { slot, kind: "unique", from: mine, to: target };
  }
  const mods = diffMods(mine, target);
  return mods.length ? { slot, kind: "mods", from: mine, to: target, mods } : { slot, kind: "same" };
}

// ---------------------------------------------------------------- ジェム

/** ジェム 1 つの差。kind = missing (自分の組に無い) / level / quality (相手の方が高い) */
export interface GemLineDiff {
  gem: string;
  kind: "missing" | "level" | "quality";
  /** 自分の値 (missing は null) */
  from: number | null;
  to: number;
}
export type GemGroupDiff =
  /** 自分に無い組: アクティブと、その組の残りのジェム (サポート・2 つ目以降のアクティブ) */
  | { kind: "missing"; active: GemView; others: GemView[] }
  /** ある組: 足りない / 弱いジェムの行 */
  | { kind: "changes"; active: GemView; lines: GemLineDiff[] };

/** 画面に出す組 (使っている・2 重でない・装備やツリーが与える物でない) の、使っているジェム。先頭のアクティブが組の名前 */
const liveGroups = (s: Summary): Array<{ g: GroupView; gems: GemView[]; active: GemView }> =>
  s.groups
    .filter((g) => g.enabled && !g.duplicateOf && !g.source)
    .map((g) => {
      const gems = g.gems.filter((x) => x.enabled);
      const active = gems.find((x) => !x.support);
      return active ? { g, gems, active } : null;
    })
    .filter((x): x is { g: GroupView; gems: GemView[]; active: GemView } => !!x);

/** 同じ組同士: 相手のジェムごとに、自分の同じ名前の物 (複数なら順に) と比べる。レベル・品質は相手が高い時だけ */
export function diffGemGroup(mine: GemView[], target: GemView[]): GemLineDiff[] {
  const own = new Map<string, GemView[]>();
  for (const x of mine) own.set(x.name, [...(own.get(x.name) ?? []), x]);
  const out: GemLineDiff[] = [];
  for (const t of target) {
    const m = own.get(t.name)?.shift();
    if (!m) {
      out.push({ gem: t.name, kind: "missing", from: null, to: t.level });
      continue;
    }
    if (t.level > m.level) out.push({ gem: t.name, kind: "level", from: m.level, to: t.level });
    if (t.quality > m.quality) out.push({ gem: t.name, kind: "quality", from: m.quality, to: t.quality });
  }
  return out;
}

/** ジェムの差。相手の組ごとにアクティブの名前で自分の組を合わせる。onlyMine = 相手に無く自分だけの組の数 */
export function diffGems(mine: Summary, target: Summary): { groups: GemGroupDiff[]; onlyMine: number } {
  const own = new Map<string, Array<{ gems: GemView[] }>>();
  for (const x of liveGroups(mine)) own.set(x.active.name, [...(own.get(x.active.name) ?? []), x]);
  const groups: GemGroupDiff[] = [];
  for (const t of liveGroups(target)) {
    const m = own.get(t.active.name)?.shift();
    if (!m) {
      groups.push({ kind: "missing", active: t.active, others: t.gems.filter((x) => x !== t.active) });
      continue;
    }
    const lines = diffGemGroup(m.gems, t.gems);
    if (lines.length) groups.push({ kind: "changes", active: t.active, lines });
  }
  const onlyMine = [...own.values()].reduce((n, arr) => n + arr.length, 0);
  return { groups, onlyMine };
}

// ---------------------------------------------------------------- 全体

/** 欄の名前で合わせる (ジュエルの穴は id が人ごとに違うので、ジュエルは欄の名前では比べない = 相手のジュエルは数だけ) */
export function diffBuilds(mine: Summary, target: Summary): { slots: SlotDiff[]; jewels: { mine: number; target: number } } {
  const bySlot = (s: Summary): Map<string, SlotView> => new Map(s.items.filter((x) => !x.jewel && x.item).map((x) => [x.slot, x]));
  const a = bySlot(mine);
  const b = bySlot(target);
  const names = [...new Set([...a.keys(), ...b.keys()])];
  const slots = names.map((slot) => diffSlot(slot, a.get(slot)?.item ?? null, b.get(slot)?.item ?? null)).filter((d) => d.kind !== "same");
  const jewels = { mine: mine.items.filter((x) => x.jewel && x.item).length, target: target.items.filter((x) => x.jewel && x.item).length };
  return { slots, jewels };
}
