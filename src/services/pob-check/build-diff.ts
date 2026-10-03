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
import type { GemView, GroupView, ItemView, SkillView, SlotView, Summary, TreeNode } from "./api";

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
  /** 自分に無い組: アクティブと、その組の残りのジェム (サポート・2 つ目以降のアクティブ)。gems = 相手の組の使っているジェム全部 (取り入れに使う) */
  | { kind: "missing"; active: GemView; others: GemView[]; gems: GemView[]; fromItem: boolean }
  /** ある組: 足りない / 弱いジェムの行。gi = 合わせた自分の組の番号、gems = 相手の組の使っているジェム全部 (取り入れ = 自分の組をこれにする) */
  | { kind: "changes"; active: GemView; lines: GemLineDiff[]; gi: number; gems: GemView[]; fromItem: boolean };

/**
 * 画面に出す組 (使っている・2 重でない) の、使っているジェム。先頭のアクティブが組の名前。
 * 装備が与える組 (source = Item:…、例: アミュレット / セプターの「スキルを付与」) も出す (2026-10-03 オーナー「アミュレットのスキルと普通のスキルの
 * サポジェムや品質等の扱いも注意して」): アクティブ自体は装備の物なので Lv / 品質は比べず、**付けているサポートだけ**を比べる。
 * ツリーが与える組 (Tree:) は中身を変えられないので出さない
 */
const liveGroups = (s: Summary): Array<{ g: GroupView; gems: GemView[]; active: GemView; fromItem: boolean }> =>
  s.groups
    .filter((g) => g.enabled && !g.duplicateOf && !g.source?.startsWith("Tree:"))
    .map((g) => {
      const gems = g.gems.filter((x) => x.enabled);
      const active = gems.find((x) => !x.support);
      return active ? { g, gems, active, fromItem: !!g.source } : null;
    })
    .filter((x): x is { g: GroupView; gems: GemView[]; active: GemView; fromItem: boolean } => !!x);

/** 同じ組同士: 相手のジェムごとに、自分の同じ名前の物 (複数なら順に) と比べる。レベル・品質は相手が高い時だけ */
export function diffGemGroup(mine: GemView[], target: GemView[], supportsOnly = false): GemLineDiff[] {
  const own = new Map<string, GemView[]>();
  for (const x of mine) own.set(x.name, [...(own.get(x.name) ?? []), x]);
  const out: GemLineDiff[] = [];
  for (const t of target) {
    // 装備が与えるスキルの組: アクティブは装備の物 (Lv / 品質は装備で決まる) なのでサポートだけ比べる
    if (supportsOnly && !t.support) continue;
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

/**
 * ジェムの差。相手の組ごとにアクティブの名前で自分の組を合わせる。同じアクティブの組が複数 (CoEA が 2 つなど) なら、
 * 中のジェムの名前が一番多く重なる組と合わせる (2026-10-03: 順で合わせると 自分の CoEA (アーク×2) に相手の CoEA (ライトニングワープ) が
 * 当たり、取り入れの試算で主スキルが消えて −86% に見えた)。onlyMine = 相手に無く自分だけの組の数
 */
export function diffGems(mine: Summary, target: Summary): { groups: GemGroupDiff[]; onlyMine: number } {
  const own = new Map<string, Array<{ g: GroupView; gems: GemView[]; fromItem: boolean }>>();
  // 鍵 = 装備が与える組か + アクティブ名 (装備が与えるブリンクと、ジェムのブリンクは別物として合わせる)
  const keyOf = (x: { active: GemView; fromItem: boolean }): string => `${x.fromItem ? "item" : "gem"}|${x.active.name}`;
  for (const x of liveGroups(mine)) own.set(keyOf(x), [...(own.get(keyOf(x)) ?? []), x]);
  const overlap = (a: GemView[], b: GemView[]): number => {
    const names = new Set(a.map((x) => x.name));
    return b.filter((x) => names.has(x.name)).length;
  };
  const groups: GemGroupDiff[] = [];
  for (const t of liveGroups(target)) {
    const list = own.get(keyOf(t));
    let m: { g: GroupView; gems: GemView[]; fromItem: boolean } | undefined;
    if (list?.length) {
      m = list.reduce((best, x) => (overlap(x.gems, t.gems) > overlap(best.gems, t.gems) ? x : best));
      list.splice(list.indexOf(m), 1);
    }
    if (!m) {
      // 装備が与える組は「自分の装備にそのスキルが無い」= 装備の差で出るので、ここでは組ごとには出さない
      if (t.fromItem) continue;
      groups.push({ kind: "missing", active: t.active, others: t.gems.filter((x) => x !== t.active), gems: t.gems, fromItem: false });
      continue;
    }
    const lines = diffGemGroup(m.gems, t.gems, t.fromItem || m.fromItem);
    if (lines.length) groups.push({ kind: "changes", active: t.active, lines, gi: m.g.i, gems: t.gems, fromItem: t.fromItem || m.fromItem });
  }
  const onlyMine = [...own.values()].reduce((n, arr) => n + arr.length, 0);
  return { groups, onlyMine };
}

// ---------------------------------------------------------------- 全体

/** 欄の名前で合わせる (ジュエルの穴は id が人ごとに違うので、ジュエルは欄の名前では比べない = 相手のジュエルは数だけ) */
/**
 * 順不同の欄 (2026-10-03 オーナー「チャームの位置は順不同。指輪も基本一緒」): チャーム 1〜3 と 指輪 1〜2(3) は、欄の番号ではなく
 * 中身で合わせる。同じユニーク同士 → 同じ、残りは MOD の型の重なりが一番多い物同士、余った相手の物は「無し → 相手」。
 * 合わせた組は自分の欄の名前 (自分が空なら相手の欄) で返す (取り入れる時にその欄へ入れる)
 */
const UNORDERED: Array<[RegExp, string]> = [
  [/^Charm \d$/, "Charm"],
  [/^Ring \d$/, "Ring"],
];
const familyOf = (slot: string): string | null => UNORDERED.find(([re]) => re.test(slot))?.[1] ?? null;
const isUnique = (it: ItemView): boolean => it.rarity.toUpperCase() === "UNIQUE";
function pairUnordered(a: SlotView[], b: SlotView[]): Array<[string, ItemView | null, ItemView | null]> {
  const out: Array<[string, ItemView | null, ItemView | null]> = [];
  const restA = [...a];
  const restB = [...b];
  const take = (x: SlotView, y: SlotView): void => {
    out.push([x.slot, x.item!, y.item!]);
    restA.splice(restA.indexOf(x), 1);
    restB.splice(restB.indexOf(y), 1);
  };
  // 1. 同じユニーク
  for (const y of [...restB]) {
    const x = restA.find((s) => isUnique(s.item!) && isUnique(y.item!) && s.item!.title === y.item!.title);
    if (x) take(x, y);
  }
  // 2. MOD の型の重なりが一番多い物同士
  const keys = (it: ItemView): Set<string> => new Set(allLines(it).map((l) => templ(l).t));
  while (restA.length && restB.length) {
    let best: [SlotView, SlotView, number] | null = null;
    for (const x of restA) {
      const kx = keys(x.item!);
      for (const y of restB) {
        const n = [...keys(y.item!)].filter((k) => kx.has(k)).length;
        if (!best || n > best[2]) best = [x, y, n];
      }
    }
    take(best![0], best![1]);
  }
  for (const y of restB) out.push([y.slot, null, y.item!]);
  for (const x of restA) out.push([x.slot, x.item!, null]);
  return out;
}

export function diffBuilds(mine: Summary, target: Summary): { slots: SlotDiff[]; jewels: { mine: number; target: number } } {
  const live = (s: Summary): SlotView[] => s.items.filter((x) => !x.jewel && x.item);
  const bySlot = (s: Summary): Map<string, SlotView> => new Map(live(s).filter((x) => !familyOf(x.slot)).map((x) => [x.slot, x]));
  const a = bySlot(mine);
  const b = bySlot(target);
  const names = [...new Set([...a.keys(), ...b.keys()])];
  const slots = names.map((slot) => diffSlot(slot, a.get(slot)?.item ?? null, b.get(slot)?.item ?? null)).filter((d) => d.kind !== "same");
  for (const fam of new Set(UNORDERED.map(([, f]) => f))) {
    const pairs = pairUnordered(live(mine).filter((x) => familyOf(x.slot) === fam), live(target).filter((x) => familyOf(x.slot) === fam));
    for (const [slot, m, t] of pairs) {
      const d = diffSlot(slot, m, t);
      if (d.kind !== "same") slots.push(d);
    }
  }
  const jewels = { mine: mine.items.filter((x) => x.jewel && x.item).length, target: target.items.filter((x) => x.jewel && x.item).length };
  return { slots, jewels };
}

// ---------------------------------------------------------------- スキルごとの比較 (2026-10-03)
/**
 * オーナー「各スキルごとの比較が現状できてない」: 自分と相手のスキルの表 (usePobCheck の skillsOf の行) を**名前で突き合わせて 1 つの表**に。
 * 同じ名前が複数 (CoEA のアーク×2 など) なら順に合わせる。片方にしか無いスキルも行に (もう片方は null)。
 * 並びは 自分 / 相手 の高い方の DPS の降順。自分の行の key はそのまま (押すと上のバーのスキルにする)
 */
export interface SkillPair {
  name: string;
  mine: { key: string; s: SkillView } | null;
  target: SkillView | null;
}
export function pairSkills(mine: Array<{ key: string; s: SkillView }>, target: Array<{ s: SkillView }>): SkillPair[] {
  const rest = new Map<string, SkillView[]>();
  for (const t of target) rest.set(t.s.name, [...(rest.get(t.s.name) ?? []), t.s]);
  const out: SkillPair[] = mine.map((m) => ({ name: m.s.name, mine: { key: m.key, s: m.s }, target: rest.get(m.s.name)?.shift() ?? null }));
  for (const list of rest.values()) for (const s of list) out.push({ name: s.name, mine: null, target: s });
  const top = (r: SkillPair): number => Math.max(r.mine?.s.game.dps ?? 0, r.target?.game.dps ?? 0);
  return out.sort((a, b) => top(b) - top(a));
}

// ---------------------------------------------------------------- 取り入れの試算の対象 (2026-10-03)
/**
 * オーナー「まんま真似できないけど部分的に真似できる所、ここだけ真似しようかな」: 差の 1 項目ずつを「自分に当てたら」で試算する対象。
 *   - item: 差のある欄 (ユニーク = 装備ごと / レア = 足りない MOD のある物)。raw = 相手の物の PoB の文面を自分の欄に
 *   - gems: 差のある組。gi = 自分の合わせた組 (無い組は 0 = 組を足す)、gems = 相手の組の構成
 *   - nodes: 相手が取っていて自分に無いノードを、ツリーのまとまり (TreeNode.g) で束ねた物。ノータブル / キーストーンを含む束だけ
 *     (小さいノードだけの束は道の途中なので単体では意味が薄い)。束の名前はその中のノータブル / キーストーンの名前
 *   key は画面の行の鍵 (試算の結果を結び付ける)
 */
export type AdoptCandidate =
  | { kind: "item"; key: string; slot: string; from: ItemView | null; to: ItemView; unique: boolean; mods: ModDiff[] }
  | { kind: "gems"; key: string; active: GemView; gi: number; gems: GemView[]; lines: GemLineDiff[] }
  | { kind: "nodes"; key: string; name: string; ids: number[]; names: string[] };

export function adoptCandidates(mine: Summary, target: Summary, treeNodes: readonly TreeNode[]): AdoptCandidate[] {
  const out: AdoptCandidate[] = [];
  for (const d of diffBuilds(mine, target).slots) {
    if (d.kind === "unique") out.push({ kind: "item", key: `item:${d.slot}`, slot: d.slot, from: d.from, to: d.to, unique: true, mods: [] });
    else if (d.kind === "mods") out.push({ kind: "item", key: `item:${d.slot}`, slot: d.slot, from: d.from, to: d.to, unique: false, mods: d.mods });
  }
  for (const [n, g] of diffGems(mine, target).groups.entries()) {
    // 装備が与えるスキルの組は、サポートの差だけ見せて取り入れの対象にしない (アクティブは装備で決まり、PoB の組の作りも違う)
    if (g.fromItem) continue;
    out.push({ kind: "gems", key: `gems:${n}:${g.active.name}`, active: g.active, gi: g.kind === "changes" ? g.gi : 0, gems: g.gems, lines: g.kind === "changes" ? g.lines : [] });
  }
  // ツリー: 相手にあって自分に無いノード (装備が与えている物も除く) を g で束ねる
  const have = new Set([...mine.tree.alloc, ...mine.tree.granted]);
  const byId = new Map(treeNodes.map((x) => [x.id, x]));
  const bundles = new Map<number, TreeNode[]>();
  for (const id of target.tree.alloc) {
    const node = byId.get(id);
    // 自分のツリーに無いノード (違うアセンダンシー・始点) は取れないので飛ばす
    if (have.has(id) || !node || node.g == null || node.t === "C" || node.t === "A") continue;
    bundles.set(node.g, [...(bundles.get(node.g) ?? []), node]);
  }
  for (const [g, nodes] of bundles) {
    const big = nodes.filter((x) => x.t === "N" || x.t === "K");
    if (!big.length) continue;
    const names = big.map((x) => x.n).filter(Boolean);
    out.push({ kind: "nodes", key: `nodes:${g}`, name: names.join(" / ") || `まとまり ${g}`, ids: nodes.map((x) => x.id).sort((a, b) => a - b), names });
  }
  return out;
}
