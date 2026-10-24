/**
 * _monkey-tree-walk.ts — 照らしの台本が木をエンジンだけで辿る所 (check-monkey-engine.mjs の完成・個数、2026-10-24 ジン部長)。
 * ツリーの回す処理 (tree-run.ts) は読まない。打つのはエンジンの applyCurrency・revealOffers、当たりは aimHits (sameText)。
 * 箱の移り方 (形合わせ・戻り・打ち止め) はシミュ部長 19 本目が文にした決まり (共有メモ tree-shape-rules.md、da447a84 の時点) を、ここで書き起こした物。
 * エンジンを正として、ツリーの移し方がこの決まりどおりかを見るのが目的 (同じ数になれば決まりどおり)
 */
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import { aimHits, applyCurrency, mulberry32, revealOffers, tierIndexOf, type StageItem, type StageMod } from "../src/services/craft-stage/engine";

interface Aim { modId: string; tier: number }
interface Hand { currency: string; omens: string[]; repeat?: { until: string; max: number | null } | null; catalyst?: string | null; free?: boolean; fractureOf?: string }
export interface WalkBox { id: string; out: string; aim: Aim | null; hand: Hand | null; outs: string[]; back: string | null; done: string | null; split?: unknown; parent?: string | null }
export interface WalkOpts { debug?: (e: { from: string; to: string; item: StageItem; key: { set: string; junk: boolean } }) => void; n?: number; seed?: number; capSteps?: number; capDiv?: number; prices?: Record<string, number>; startCost?: number }
export interface WalkResult { n: number; finished: number; stuck: number; capped: number; uses: Record<string, number>; stuckAt: Record<string, number>; moved: number; movedAt: Record<string, number>; unsupported: string | null }

const ECHO = "OmenofAbyssalEchoes";
const MAX_SETS = 64;
const MAX_BACKS = 1000;
const ak = (a: Aim): string => `${a.modId}|${a.tier}`;

export function walkTree(data: PatchData, boxes: Record<string, WalkBox>, start: StageItem, o: WalkOpts = {}): WalkResult {
  const n = o.n ?? 100, capSteps = o.capSteps ?? 20000, capDiv = o.capDiv ?? Infinity, prices = o.prices ?? {};
  const res: WalkResult = { n, finished: 0, stuck: 0, capped: 0, uses: {}, stuckAt: {}, moved: 0, movedAt: {}, unsupported: null };
  const list = Object.values(boxes);
  for (const b of list) {
    const why = b.split ? "分かれ目の箱" : b.back === "restart" ? "作り直し" : b.hand?.catalyst ? "カタリスト" : b.hand?.fractureOf ? "フラクチャーの指名" : b.hand?.free ? "狙い無しの手" : null;
    if (why) return { ...res, unsupported: why };
  }
  // 狙い = 木の当たりの箱の札 (重ならない物)
  const aims: Aim[] = [];
  for (const b of list) if (b.out === "hit" && b.aim && !aims.some((a) => ak(a) === ak(b.aim!))) aims.push(b.aim);
  const opts = { data, sameText: true };
  const tg = (a: Aim) => ({ modId: a.modId, minTierIndex: tierIndexOf(data, a.modId, a.tier) });
  const mods = (it: StageItem): StageMod[] => [...it.prefixes, ...it.suffixes];
  const has = (it: StageItem, a: Aim): boolean => mods(it).some((m) => aimHits(m, tg(a), opts));
  const isAim = (m: StageMod): boolean => aims.some((a) => aimHits(m, tg(a), opts));
  const sideOf = (a: Aim): string => data.mods.get(a.modId)?.type ?? "";

  // ① アイテムの形 = 付いている狙いの組 + 外れの有無 (外れはまだ付いていない狙いの側だけ、全部付いていれば両側。✦ は外れに数えない)
  const keyOf = (it: StageItem): { set: string; junk: boolean } => {
    const held = aims.filter((a) => has(it, a));
    const open = aims.filter((a) => !held.includes(a)), sides = new Set(open.length ? open.map(sideOf) : ["prefix", "suffix"]);
    const junk = mods(it).some((m) => !m.fractured && !m.unrevealed && !isAim(m) && sides.has(m.side));
    return { set: held.map(ak).sort().join(","), junk };
  };
  // 箱の付いていうる組 (heldSets): 始まりから親をたどる。当たり = 札を足す、狙いが消えた = 1 つ欠けた組のどれか (エッセンスの手では、その手の当たりの札は残る)
  const sets = new Map<string, Set<string>>();
  const walkSets = (id: string, cur: Set<string>): void => {
    if (sets.has(id)) return;
    sets.set(id, cur);
    const b = boxes[id];
    if (!b?.hand) return;
    const keep = b.hand.currency.startsWith("essence:") ? new Set(b.outs.map((x) => boxes[x]).filter((x) => x?.out === "hit" && x.aim).map((x) => ak(x!.aim!))) : new Set<string>();
    for (const cid of b.outs) {
      const c = boxes[cid];
      if (!c) continue;
      const next = new Set<string>();
      for (const s of cur) {
        const arr = s ? s.split(",") : [];
        if (c.out === "hit" && c.aim) next.add([...new Set([...arr, ak(c.aim)])].sort().join(","));
        else if (c.out === "lost") { for (const x of arr) if (!keep.has(x)) next.add(arr.filter((y) => y !== x).sort().join(",")); if (!arr.some((x) => !keep.has(x))) next.add(s); }
        else next.add(s);
        if (next.size >= MAX_SETS) break;
      }
      walkSets(cid, next);
    }
  };
  walkSets("start", new Set([""]));
  const shapeOk = (b: WalkBox, k: { set: string; junk: boolean }): boolean => (b.out === "hit" ? !k.junk : b.out === "junk" ? k.junk : false) && !!sets.get(b.id)?.has(k.set);
  const canPlay = (it: StageItem, h: Hand | null): boolean => {
    if (!h) return true;
    const r = applyCurrency(data, it, h.currency, mulberry32(1), h.omens.filter((x) => x !== ECHO));
    return r.applied || !!r.random;
  };
  // 形の箱の探し方 (boxOfShape)
  const shaped = list.filter((b) => b.hand && (b.out === "hit" || b.out === "junk"));
  const boxOfShape = (it: StageItem): string | null => {
    const k = keyOf(it);
    const same = shaped.filter((b) => shapeOk(b, k));
    const play = same.find((b) => canPlay(it, b.hand));
    if (play) return play.id;
    if (!k.set && k.junk) return "start";
    if (k.junk) { const nj = shaped.find((b) => b.out === "hit" && sets.get(b.id)?.has(k.set) && canPlay(it, b.hand)); if (nj) return nj.id; }
    if (!k.set) return "start";
    return same[0]?.id ?? null;
  };
  // ② 着いた時に移すか (settle)
  const settle = (id: string, it: StageItem): string => {
    const b = boxes[id];
    if (!b) return id;
    if (id === "start") {
      const k = keyOf(it);
      if (!k.set && k.junk) return boxOfShape(it) ?? id;
      if (canPlay(it, b.hand)) return id;
      const to = boxOfShape(it), th = to ? boxes[to]?.hand ?? null : null;
      return to && canPlay(it, th) ? to : id;
    }
    if (!b.hand || (b.out !== "hit" && b.out !== "junk")) return id;
    const k = keyOf(it), here = canPlay(it, b.hand);
    if (shapeOk(b, k) && here) return id;
    const to = boxOfShape(it);
    if (!to) return id;
    if (!canPlay(it, boxes[to]?.hand ?? null) && here) return id;
    return to;
  };

  const rng = mulberry32(o.seed ?? 1);
  const mv = (from: string, to: string, it?: StageItem): void => {
    if (o.debug && it) o.debug({ from, to, item: it, key: keyOf(it) }); res.movedAt[`${from}>${to}`] = (res.movedAt[`${from}>${to}`] ?? 0) + 1; };
  const use = (k: string): number => { res.uses[k] = (res.uses[k] ?? 0) + 1 / n; return prices[k] ?? 0; };
  for (let p = 0; p < n; p++) {
    let item = start, at = settle("start", start), steps = 0, backs = 0, cost = o.startCost ?? 0;
    if (at !== "start") { res.moved++; mv("start", at); }
    let end: "done" | "stuck" | "capped" | null = null;
    while (!end) {
      const b = boxes[at];
      if (!b) { end = "stuck"; break; }
      if (b.done) {
        // (c) 完成の箱でも、付いている狙いが箱の組の一番少ない数より少なければ形の箱へ
        const need = Math.min(...[...(sets.get(b.id) ?? new Set([""]))].map((s) => (s ? s.split(",").length : 0)));
        if (aims.filter((a) => has(item, a)).length >= need) { end = "done"; break; }
        const to = boxOfShape(item);
        if (!to || to === at) { end = "stuck"; break; }
        at = to; continue;
      }
      if (!b.hand) {
        if (++backs > MAX_BACKS) { end = "stuck"; break; }
        if (b.back === "match") { const to = boxOfShape(item); if (!to) { end = "stuck"; break; } at = to; continue; }
        if (b.back && boxes[b.back]) { const to = settle(b.back, item); if (to !== b.back) { res.moved++; mv(b.back, to, item); } at = to; continue; }
        end = "stuck"; break;
      }
      const h = b.hand, outs = b.outs.map((id) => boxes[id]).filter((x): x is WalkBox => !!x);
      const hitOuts = outs.filter((x) => x.out === "hit" && x.aim);
      let next: string | null = null;
      do {
        if (++steps > capSteps || cost > capDiv) { end = "capped"; break; }
        let r = applyCurrency(data, item, h.currency, rng, h.omens.filter((x) => x !== ECHO));
        if (!r.applied) { if (r.random && h.repeat) continue; end = "stuck"; break; }
        cost += use(h.currency); for (const om of h.omens) cost += use(om);
        if (h.currency.startsWith("desecrate")) {
          // 骨はそのまま発現: 候補に結果の当たりの箱の狙いがあればそれ、反響なら引き直しの候補からも
          const offers = revealOffers(data, r.item, mulberry32(Math.floor(rng() * 2 ** 31)));
          const want = (m: StageMod) => hitOuts.some((x) => aimHits(m, tg(x.aim!), opts));
          const i = offers.first.findIndex(want), k = i < 0 && h.omens.includes(ECHO) ? offers.reroll.findIndex(want) : -1;
          const s = mulberry32(Math.floor(rng() * 2 ** 31));
          const x = k >= 0 ? applyCurrency(data, r.item, `reveal:${k + 1}:reroll`, s, [ECHO]) : applyCurrency(data, r.item, `reveal:${Math.max(0, i) + 1}`, s);
          if (x.applied) r = x;
        }
        // 結果の分け方: エッセンスで狙いが消えた → 消えた / フラクチャー: 新しく ✦ の狙い → 当たり、ほか外れ / 新しく付いた狙い → 当たり / 狙いが消えた / 外れが減った → 外れが消えた / ほか外れ
        const before = item, after = r.item;
        const lost = aims.some((a) => has(before, a) && !has(after, a));
        const frB = new Set(mods(before).filter((m) => m.fractured).map((m) => m.modId));
        const newFr = mods(after).filter((m) => m.fractured && !frB.has(m.modId));
        const gained = aims.filter((a) => (h.currency === "fracture" ? newFr.some((m) => aimHits(m, tg(a), opts)) : !has(before, a) && has(after, a)));
        const junkN = (it: StageItem) => mods(it).filter((m) => !m.fractured && !m.unrevealed && !isAim(m)).length;
        const kind = h.currency.startsWith("essence:") && lost ? "lost" : gained.length ? "hit" : h.currency !== "fracture" && lost ? "lost" : junkN(after) < junkN(before) ? "junkGone" : "junk";
        item = after;
        const box = kind === "hit" ? hitOuts.find((x) => gained.some((a) => ak(a) === ak(x.aim!))) : outs.find((x) => x.out === kind);
        next = box?.id ?? outs.find((x) => x.out === "any" || x.out === "pass")?.id ?? null;
        if (h.repeat && !(kind === "hit" && next)) next = null;
      } while (h.repeat && !next && !end);
      if (end) break;
      if (!next) {
        // (d) 結果に合う結果の箱が無い → 形の箱へ
        const to = boxOfShape(item);
        if (!to) { end = "stuck"; break; }
        at = to; continue;
      }
      const to = settle(next, item);
      if (to !== next) { res.moved++; mv(next, to); }
      at = to;
    }
    if (end === "done") res.finished++; else if (end === "capped") res.capped++; else { res.stuck++; res.stuckAt[at] = (res.stuckAt[at] ?? 0) + 1; }
  }
  return res;
}
