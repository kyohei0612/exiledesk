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
export function diffGems(mine: Summary, target: Summary): {
  groups: GemGroupDiff[];
  onlyMine: number;
  /** 相手のジェムの組 (装備が与える物以外) ごとに合わせた自分の組 (0 = 無い) と、相手に無い自分の組の番号。全部まとめて真似で使う */
  pairs: Array<{ gi: number; gems: GemView[] }>;
  onlyMineGi: number[];
} {
  const own = new Map<string, Array<{ g: GroupView; gems: GemView[]; fromItem: boolean }>>();
  // 鍵 = 装備が与える組か + アクティブ名 (装備が与えるブリンクと、ジェムのブリンクは別物として合わせる)
  const keyOf = (x: { active: GemView; fromItem: boolean }): string => `${x.fromItem ? "item" : "gem"}|${x.active.name}`;
  for (const x of liveGroups(mine)) own.set(keyOf(x), [...(own.get(keyOf(x)) ?? []), x]);
  const overlap = (a: GemView[], b: GemView[]): number => {
    const names = new Set(a.map((x) => x.name));
    return b.filter((x) => names.has(x.name)).length;
  };
  const groups: GemGroupDiff[] = [];
  const pairs: Array<{ gi: number; gems: GemView[] }> = [];
  for (const t of liveGroups(target)) {
    const list = own.get(keyOf(t));
    let m: { g: GroupView; gems: GemView[]; fromItem: boolean } | undefined;
    if (list?.length) {
      m = list.reduce((best, x) => (overlap(x.gems, t.gems) > overlap(best.gems, t.gems) ? x : best));
      list.splice(list.indexOf(m), 1);
    }
    if (!t.fromItem && !m?.fromItem) pairs.push({ gi: m ? m.g.i : 0, gems: t.gems });
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
  const onlyMineGi = [...own.values()].flat().filter((x) => !x.fromItem).map((x) => x.g.i);
  return { groups, onlyMine, pairs, onlyMineGi };
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
  // 両方にあるスキルを先に (片方だけの物は比べられないので後ろ。2026-10-04 オーナー「無い奴で比べてもダメ、比較するのはあるスキルを先に」)
  const both = (r: SkillPair): number => (r.mine && r.target ? 0 : 1);
  return out.sort((a, b) => both(a) - both(b) || top(b) - top(a));
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
  /** lineage = 足すリネージュのサポートの名前 (火力の差の試算はサポートのうちこれだけ。gems = 自分の組 + それ) */
  | { kind: "gems"; key: string; active: GemView; gi: number; gems: GemView[]; lines: GemLineDiff[]; lineage?: string[] }
  /** ツリーを丸ごと相手の物に (add = 足すノード、remove = 外すノード)。取り入れは振り直しなので試算だけ */
  | { kind: "tree"; key: string; add: number[]; remove: number[] }
  /** ツリーのジュエル (自分に無い物)。slot = 相手の穴 (Jewel <番号>)、nodeId = その穴のノード、from = 自分のその穴に入っている物 */
  | { kind: "jewel"; key: string; slot: string; nodeId: number; from: ItemView | null; to: ItemView };

/**
 * ツリーを丸ごと相手の物にする差 (add = 相手にあって自分に無い、remove = 自分にあって相手に無い)。クラスの始点は除く。
 * アセンダンシーのノードは同じアセンダンシーの時だけ入れる (2026-10-04: 除いていたので、同じ Stormweaver 同士でも差に入らず「全部足しても合わない」原因の 1 つだった)
 */
/**
 * keepGranted = 自分の装備が与えているノード (メガロマニアック・アノイント等) も足す側に入れる。全部まとめて真似は装備も相手の物に替えるので、
 * 入れないと替えた後にそのノードが消える (2026-10-04: 相手のタイムロストジュエルの範囲のノードが 1 つ欠けて効果が半分になっていた)
 */
export function treeDiff(mine: Summary, target: Summary, treeNodes: readonly TreeNode[], keepGranted = false): { add: number[]; remove: number[] } {
  const byId = new Map(treeNodes.map((x) => [x.id, x]));
  const sameAsc = !!mine.char.ascendancy && mine.char.ascendancy === target.char.ascendancy;
  const plain = (id: number): boolean => {
    const node = byId.get(id);
    return !!node && node.t !== "C" && (node.t !== "A" || sameAsc);
  };
  const mineAlloc = new Set(mine.tree.alloc);
  const targetAlloc = new Set(target.tree.alloc);
  return {
    add: target.tree.alloc.filter((id) => !mineAlloc.has(id) && (keepGranted || !mine.tree.granted.includes(id)) && plain(id)),
    remove: mine.tree.alloc.filter((id) => !targetAlloc.has(id) && plain(id)),
  };
}

/**
 * 全部まとめて真似した時の材料 (2026-10-04 オーナー「全部足したら 207% になるはずだけど、せいぜい 30%」): 1 つずつの試算は掛け算で伸びる分・揃って
 * 初めて効く分・ジェムのレベル / サポート・アセンダンシーが入らないので足しても合わない。装備 → ツリー → ジェム の順に重ねて段ごとの DPS を出す。
 *   items = 中身の違う欄 (相手の文面、相手が空なら null = 外す)。ジュエルの穴も入る
 *   groups = 相手の組の構成 (gi = 合わせた自分の組、0 = 足す)。装備が与える組は除く
 */
export function copyAllPlan(mine: Summary, target: Summary, treeNodes: readonly TreeNode[]): {
  items: Array<{ slot: string; raw: string | null }>;
  tree: { add: number[]; remove: number[] };
  groups: Array<{ gi: number; gems: GemView[] }>;
  off: number[];
} {
  const mineBy = new Map(mine.items.filter((x) => x.item).map((x) => [x.slot, x.item!]));
  const targetBy = new Map(target.items.filter((x) => x.item).map((x) => [x.slot, x.item!]));
  const items: Array<{ slot: string; raw: string | null }> = [];
  for (const slot of new Set([...mineBy.keys(), ...targetBy.keys()])) {
    const a = mineBy.get(slot)?.raw ?? null;
    const b = targetBy.get(slot)?.raw ?? null;
    if (a !== b) items.push({ slot, raw: b });
  }
  // ジェムは相手の組の中身そのままに (自分だけ多いサポートも外す)。相手に無い自分の組は止める (off。2026-10-04: 自分だけのオーラ等が
  // 残って精神とマナの予約が相手と違い、丸写ししても +7% 違った)。装備が与える組は差のある時だけ (アクティブは装備の物)
  const d = diffGems(mine, target);
  const groups = [
    ...d.pairs,
    ...d.groups.filter((g): g is Extract<GemGroupDiff, { kind: "changes" }> => g.kind === "changes" && g.fromItem).map((g) => ({ gi: g.gi, gems: g.gems })),
  ];
  return { items, tree: treeDiff(mine, target, treeNodes, true), groups, off: d.onlyMineGi };
}

export function adoptCandidates(mine: Summary, target: Summary, treeNodes: readonly TreeNode[]): AdoptCandidate[] {
  // 2026-10-04 オーナー「試算は火力の差の試算」: 装備 (火力に効かない物は試算の後に隠す) / リネージュのサポートだけ (他のサポートは
  // ビルドを変える時に真似する) / ツリーは丸ごと 1 件 (振り直しで真似する) / ツリーのジュエル (心臓・メガロ等。装備の中の穴は装備の欄で出る)
  const out: AdoptCandidate[] = [];
  for (const d of diffBuilds(mine, target).slots) {
    if (d.kind === "unique") out.push({ kind: "item", key: `item:${d.slot}`, slot: d.slot, from: d.from, to: d.to, unique: true, mods: [] });
    else if (d.kind === "mods") out.push({ kind: "item", key: `item:${d.slot}`, slot: d.slot, from: d.from, to: d.to, unique: false, mods: d.mods });
  }
  // リネージュ: 合わせた自分の組に無いリネージュのサポートを、自分の組に足したら
  for (const [n, g] of diffGems(mine, target).groups.entries()) {
    if (g.fromItem || g.kind !== "changes") continue;
    const missing = new Set(g.lines.filter((l) => l.kind === "missing").map((l) => l.gem));
    const add = g.gems.filter((x) => x.lineage && missing.has(x.name));
    const own = mine.groups.find((x) => x.i === g.gi);
    if (!add.length || !own) continue;
    out.push({ kind: "gems", key: `lineage:${n}:${g.active.name}`, active: g.active, gi: g.gi, gems: [...own.gems, ...add], lines: g.lines.filter((l) => add.some((x) => x.name === l.gem)), lineage: add.map((x) => x.name) });
  }
  // ツリー: 丸ごと相手の物に
  const t = treeDiff(mine, target, treeNodes);
  if (t.add.length || t.remove.length) out.push({ kind: "tree", key: "tree", add: t.add, remove: t.remove });
  // ツリーのジュエル: 自分に無い物 (ユニークは名前、レア等は文面で比べる)
  const keyOf = (it: ItemView): string => (it.rarity === "UNIQUE" ? `u:${it.title}` : `r:${it.raw}`);
  const own = new Set(mine.items.filter((x) => x.jewel && x.item).map((x) => keyOf(x.item!)));
  const mineBySlot = new Map(mine.items.filter((x) => x.jewel).map((x) => [x.slot, x.item ?? null]));
  for (const x of target.items) {
    if (!x.jewel || !x.item || own.has(keyOf(x.item))) continue;
    const nodeId = Number(/^Jewel (\d+)$/.exec(x.slot)?.[1]);
    if (!Number.isFinite(nodeId)) continue;
    out.push({ kind: "jewel", key: `jewel:${x.slot}`, slot: x.slot, nodeId, from: mineBySlot.get(x.slot) ?? null, to: x.item });
  }
  return out;
}
