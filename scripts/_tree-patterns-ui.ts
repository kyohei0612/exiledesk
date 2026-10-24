/**
 * _tree-patterns-ui.ts — _tree-patterns-probe.test.ts の画面の真似 (Ui)・値段の表・完成の中身の確かめ (doneHeld)。
 * 台本が 500 行を超えたので分けた (2026-10-24、中身はそのまま)。説明は _tree-patterns-probe.test.ts の頭
 */
import { applyCurrency, freshItem, modListFor, mulberry32, omensFor, RUNES, socketCapOf, type PatchData } from "../src/services/craft-stage/engine";
import { stepOutcomes } from "../src/services/craft-stage/engine-sim";
import { fillCatalyst } from "../src/services/craft-stage/engine-sim";
import { aimHeldOn } from "../src/services/simulator/tree/tree-aim";
import { effectOf } from "../src/services/simulator/tree/tree-hands";
import { addHit, addSplitRow, aimKey, migrateStart, newTree, setAim, setBack, setDone, setHand, setSplit, setSplitWhen, toggleMemoAim, kindOfHand, type Aim, type Hand, type SplitWhen, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { aimsOf, handAims, handProblem, outcomeOf, playHand, sampleOf, singleOutOf, startItemOf } from "../src/services/simulator/tree/tree-sample";
import { CATALYSING, canSpam, ECHO, engineOmens, isBone, isCatalyst, TREE_CATALYSTS } from "../src/services/simulator/tree/tree-hands";
import { linkSameShape, MATCH, matchItem, outBoxOf, RESTART, settle, shapesOf, splitTo } from "../src/services/simulator/tree/tree-run";
import { joinSameShape } from "../src/views/simulator/tree/tree-merge";
import { withTreeTune } from "../src/services/simulator/tree/tree-tune";
import { bonesFor, essenceShelf, ORBS } from "../src/state/for-share/craft-stage-shelf";
import { simHidden } from "../src/state/for-share/shelf-context";
import { heldOmensOf } from "../src/components/for-share/shelf/held-omens";

const EX: Record<string, number> = { chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.83 };
export const zero = new Set<string>();
export const price = (k: string): number => { if (!(k in EX)) zero.add(k); return (EX[k] ?? 0) / 696.929; };

type Row = { kind: "held"; n: number } | { kind: "none" } | { kind: "junk"; side: "prefix" | "suffix" | "any"; n: number };
/** TreeSplitPick の whenOf と同じ */
const whenOf = (r: Row): SplitWhen => (r.kind === "none" ? { heldCount: [0, 0] } : r.kind === "junk" ? { junk: { [r.side]: [Math.max(1, r.n), 99] } } : { heldCount: [Math.max(1, r.n), 99] });
export interface Find { pat: string; where: string; what: string }
interface HandOpt { spam?: boolean; max?: number; free?: boolean; /** 骨の手のアビスの反響 (既定で付ける) */ echo?: boolean; /** 触媒の前のカタリスト (TreeHandShelf のカタリストの選び #7。既定は狙いのタグから) */ cat?: string }

export class Ui {
  d: TreeDoc;
  finds: Find[] = [];
  log: string[] = [];
  constructor(readonly data: PatchData, readonly pat: string, base: string, ilvl = 82) { this.d = newTree(base, ilvl); }
  find(where: string, what: string): void { this.finds.push({ pat: this.pat, where, what }); }
  private rows() { return modListFor(this.data, freshItem(this.data, this.d.base, this.d.itemLevel, "rare")); }
  /** TreeModPick の一覧にあるか (hit = normal・desecrated、start = normal・essence・special・rune) */
  pickable(a: Aim, mode: "hit" | "start"): boolean {
    const groups = mode === "hit" ? ["normal", "desecrated"] : ["normal", "essence", "special", "rune"];
    return this.rows().some((r) => groups.includes(r.group) && r.tiers.some((tt) => (tt.modId ?? r.id) === a.modId && Number(tt.rank.slice(1)) === a.tier));
  }
  // ── 始まりの形 (TreeStartPick) ──
  startMod(modId: string, tier: number, fractured = false): void {
    if (!this.pickable({ modId, tier }, "start")) { this.find("TreeStartPick", `始まりの MOD ${modId} T${tier} が一覧に無い`); return; }
    migrateStart(this.d);
    const st = this.d.start!;
    st.rarity = "rare";
    const m = st.mods.find((y) => y.modId === modId);
    if (m) m.tier = tier; else st.mods.push({ modId, tier });
    if (fractured) { const on = st.mods.find((y) => y.modId === modId)!; for (const x of st.mods) delete x.fractured; on.fractured = true; }
  }
  rune(en: string): void {
    const it = freshItem(this.data, this.d.base, this.d.itemLevel, "rare");
    const cap = socketCapOf(it.base, it.cls.category);
    const ok = Object.entries(RUNES).some(([e, r]) => e === en && r.kind === "rune" && r.available !== false && applyCurrency(this.data, { ...it, sockets: 1 }, `rune:${e}`, mulberry32(1)).applied);
    const st = this.d.start!;
    if (!ok || (st.runes ?? []).length >= cap) { this.find("TreeStartPick ルーン", `${en} を差せない (一覧に無い / 上限 ${cap})`); return; }
    st.runes = [...(st.runes ?? []), en];
  }
  /** 乱数の MOD の数 (NumStep は 0〜5) */
  random(n: number): void { const v = Math.max(0, Math.min(5, n)); if (v > 0) this.d.startRandom = v; else delete this.d.startRandom; }
  memo(a: Aim): void { if (!this.pickable(a, "hit")) this.find("TreeMemoFloat", `欲しい MOD ${a.modId} T${a.tier} が一覧に無い`); toggleMemoAim(this.d, a); }
  // ── 手 (TreeHandShelf → SimTreePage.pickHand) ──
  hand(id: string | null | undefined, currency: string, omens: string[] = [], o: HandOpt = {}): string | null {
    const d = this.d, data = this.data, b = id ? d.boxes[id] : undefined;
    if (!id || !b) return null;
    if (b.back) { this.log.push(`${id} は戻り (${b.back}${b.autoBack ? " 自動" : ""}) を × で外してから手`); setBack(d, id, null); }
    const item = sampleOf(data, d, id, 1).item;
    const shelf = [...ORBS.flatMap((g) => g.keys), ...bonesFor(item), ...essenceShelf(data, item).flatMap((g) => g.keys)].filter((k) => !simHidden(k));
    if (!shelf.includes(currency)) { this.find(`棚 (箱 ${id})`, `${currency} が棚に無い`); return null; }
    const can = heldOmensOf(currency);
    for (const x of omens) if (!can.includes(x)) this.find(`お告げの欄 (箱 ${id})`, `${currency} に ${x} を掛けられない`);
    // 骨の手はアビスの反響を既定で付ける (棚 TreeHandShelf と同じ、10-22 オーナー「お告げは必ず反響を使わんとやばいよ」)
    const used = [...omensFor(currency, omens.filter((x) => can.includes(x))), ...(isBone(currency) && o.echo !== false ? [ECHO] : [])];
    if (o.spam && !canSpam(currency)) this.find(`当たるまで (箱 ${id})`, `${currency} は当たるまでにできない`);
    if (o.free && effectOf(currency) !== "add") this.find(`狙い無し (箱 ${id})`, `${currency} は狙い無しにできない`);
    const h: Hand = { currency, omens: used, catalyst: null, quality: 0, repeat: o.spam && canSpam(currency) ? { until: "hit", max: o.max && o.max > 0 ? Math.round(o.max) : null } : null, ...(o.free && effectOf(currency) === "add" ? { free: true } : {}) };
    const kind = kindOfHand(h, effectOf(currency));
    const p = b.out === "pass" && b.parent ? d.boxes[b.parent] : null;
    const afterQ = !!p?.hand && isCatalyst(p.hand.currency);
    let autoCat = TREE_CATALYSTS[0]!;
    if (o.cat && TREE_CATALYSTS.includes(o.cat)) autoCat = o.cat;
    else for (const a of aimsOf(d).filter((x) => !aimHeldOn(data, item, x, { sameText: true }))) { const tags = data.mods.get(a.modId)?.tags ?? []; const c = TREE_CATALYSTS.find((k) => tags.includes(k.slice(9))); if (c) { autoCat = c; break; } }
    const needPre = can.includes(CATALYSING) && !afterQ;
    const shelfItem = needPre ? fillCatalyst(data, item, autoCat, mulberry32(1)).item : item;
    const preCat = used.includes(CATALYSING) && !afterQ ? autoCat : null;
    let aims: Aim[] = [];
    if (kind === "essence") {
      // 棚 (TreeHandShelf の hitAims) と同じ: エンジンの結果で新しく付いた MOD を当たりの札に
      const before = new Set([...item.prefixes, ...item.suffixes].map((m) => m.modId));
      const got = (stepOutcomes(data, item, h.currency, engineOmens(h)) ?? []).filter((x) => !x.void).flatMap((x) => [...x.item.prefixes, ...x.item.suffixes].filter((m) => !before.has(m.modId)));
      if (got[0]) aims = [{ modId: got[0].modId, tier: Number(/\d+/.exec(got[0].tierName)?.[0] ?? 99) }];
    } else if (kind === "spam" || kind === "add" || kind === "swap") {
      const tree = aimsOf(d);
      const open = (tree.length ? tree : d.memoAims ?? []).filter((a) => !aimHeldOn(data, item, a, { sameText: true }));
      const outs = [1, 2, 3, 4].flatMap((seed) => { const x = seed === 1 ? item : sampleOf(data, d, id, seed).item; return (stepOutcomes(data, x, h.currency, engineOmens(h)) ?? []).filter((o) => !o.void); });
      aims = kind === "spam" || !outs.length ? open : open.filter((a) => outs.some((x) => aimHeldOn(data, x.item, a, { sameText: true })));
    }
    let only = singleOutOf(data, d, id, h, preCat, aims);
    // 木にまだ狙いが無いと、足す・入れ替える手の結果は全部「外れ」に分けられ、1 通り (外れだけ) になる。当たりの箱が出来ず横の＋も出ないので、台本では 1 通りを外して続ける
    if (only?.out === "junk" && (kind === "add" || kind === "swap") && !aimsOf(d).length) {
      this.find(`この手にする (箱 ${id})`, `木に狙いがまだ無いので「${[currency, ...used].join("+")}」の結果が「外れだけ (1 通り)」になり、当たりの箱が出来ない${d.memoAims?.length ? " (欲しい MOD のメモがあっても同じ)" : ""}。台本は 1 通りを外して続けた`);
      only = null;
    }
    const problem = kind === "spam" && !aims.length ? "狙いが無い" : handProblem(data, preCat ? shelfItem : item, h);
    if (problem) { this.find(`この手にする (箱 ${id})`, `${[currency, ...used].join("+")}${o.spam ? " 当たるまで" : ""} が押せない: ${problem}`); return null; }
    if (preCat) this.log.push(`${id}: 前にカタリスト ${preCat}`);
    const had = new Set(Object.keys(d.boxes));
    let at = id;
    if (preCat) { setHand(d, id, { currency: preCat, omens: [], catalyst: null, quality: 0 }, "quality"); at = d.boxes[id]!.outs[0]!; }
    setHand(d, at, h, kind, aims, only);
    joinSameShape(d, id);
    linkSameShape(d, Object.values(d.boxes).filter((x) => !had.has(x.id) || (!x.hand && !x.back && !x.done)).map((x) => x.id));
    this.log.push(`${id}${at !== id ? `→${at}` : ""} ${[currency, ...used].join("+")}${h.repeat ? " 当たるまで" : ""}${h.free ? " 狙い無し" : ""} → ${d.boxes[at]!.outs.map((x) => `${x}:${d.boxes[x]!.out}${d.boxes[x]!.aim ? `(${d.boxes[x]!.aim!.modId.split("/")[1]})` : ""}${d.boxes[x]!.back ? `↩${d.boxes[x]!.back}` : ""}`).join(" ")}${only ? ` [1 通り ${only.out}]` : ""}`);
    return at;
  }
  /** 結果の箱を種類ごとに (当たりは MOD の id の後ろ → 箱) */
  o(at: string | null | undefined): { hit: string[]; by: Record<string, string>; junk?: string; lost?: string; gone?: string; any?: string } {
    const r: ReturnType<Ui["o"]> = { hit: [], by: {} };
    for (const x of (at && this.d.boxes[at]?.outs) || []) {
      const c = this.d.boxes[x]!;
      if (c.out === "hit") { r.hit.push(x); if (c.aim) r.by[c.aim.modId.split("/")[1]!] = x; } else if (c.out === "junk") r.junk = x; else if (c.out === "lost") r.lost = x; else if (c.out === "junkGone") r.gone = x; else if (c.out === "any") r.any = x;
    }
    return r;
  }
  aim(id: string, a: Aim): void { if (!this.pickable(a, "hit")) this.find(`TreeModPick hit (箱 ${id})`, `当たり ${a.modId} T${a.tier} が一覧に無い`); setAim(this.d, id, a); }
  addHit(id: string, a: Aim): string { const n = addHit(this.d, this.d.boxes[id]!.parent!, id)!; this.aim(n, a); return n; }
  /** 当たりの札を並びに合わせる (hitAims で出来た箱の MOD が違う・足りない時は替える・足す) */
  hits(at: string | null, want: Aim[]): Record<string, string> {
    if (!at) return {};
    const r = this.o(at);
    const left = want.filter((a) => !Object.values(r.by).some((x) => aimKey(this.d.boxes[x]!.aim!) === aimKey(a)));
    for (const x of r.hit) if (!this.d.boxes[x]!.aim && left.length) this.aim(x, left.shift()!);
    let last = this.o(at).hit.at(-1);
    if (!last && left.length) this.find(`横の＋ (箱 ${at} の下)`, `当たりの箱が 1 つも無い (結果が外れだけ) ので横の＋が無く、${left.map((a) => a.modId.split("/")[1]).join("・")} の当たりを足せない。台本は addHit で足した`);
    for (const a of left) { if (last) last = this.addHit(last, a); else { last = addHit(this.d, at)!; this.aim(last, a); } }
    return this.o(at).by;
  }
  /** カオススパムの札 (onSpam: linkSameShape は呼ばない) */
  spam(id: string): string {
    const it = sampleOf(this.data, this.d, id, 1).item;
    const aims = aimsOf(this.d).filter((a) => !aimHeldOn(this.data, it, a, { sameText: true }));
    setHand(this.d, id, { currency: "chaos", omens: [], catalyst: null, quality: 0, repeat: { until: "hit", max: null } }, "spam", aims);
    this.log.push(`${id} カオススパムの札 → ${this.d.boxes[id]!.outs.join(" ")}`);
    return id;
  }
  done(id: string | undefined): void {
    if (!id) return;
    const b = this.d.boxes[id]!;
    if ((b.out !== "hit" && b.out !== "branch") || b.hand || b.split) { this.find(`完成にする (箱 ${id})`, `${b.out} の箱は完成にできない`); return; }
    if (b.back) { this.log.push(`${id} は戻り (${b.back}${b.autoBack ? " 自動" : ""}) を × で外してから完成`); setBack(this.d, id, null); }
    setDone(this.d, id, "main");
  }
  /** 戻り (onTarget。灰色 = use-tree-link で押せない時も、＋の引っ張りではつながる) */
  back(from: string | undefined, to: string | undefined): void {
    const d = this.d;
    if (!from || !to) return;
    if (to !== "start") {
      const t = d.boxes[to]!;
      const why = t.split ? null : !t.hand ? "この箱にはまだ打つ手が無い" : handProblem(this.data, sampleOf(this.data, d, from, 1).item, t.hand);
      if (why) this.find(`戻り先を選ぶ (${from} → ${to})`, `灰色で押せない: ${why} (＋の引っ張りではつながる)`);
    }
    if (d.boxes[from]!.hand) { this.find(`戻り (${from})`, "手のある箱には戻りを張れない"); return; }
    setBack(d, from, to);
  }
  split(id: string, rows: Row[]): string[] {
    if (this.d.boxes[id]!.out === "start") { this.find("分かれ目", "始まりの箱は分かれ目にできない"); return []; }
    setSplit(this.d, id);
    rows.forEach((r, i) => { addSplitRow(this.d, id, { heldCount: [2, 99] }); setSplitWhen(this.d, id, i, whenOf(r)); });
    return this.d.boxes[id]!.split!.map((r) => r.to!);
  }
  /** 結果の箱を全部同じ所へ戻す */
  allBack(at: string | null, to: string): void { for (const x of (at && this.d.boxes[at]?.outs) || []) this.back(x, to); }
}

/**
 * 完成の中身の確かめ: tree-run の runOne と同じ順で 100 人を辿り (同じ seed・同じ乱数の使い方)、完成の箱に着いた時に狙いがいくつ付いていたかを数える。
 * runTree は完成の箱に着いたら中身を見ずに完成と数えるので、入れ替えで狙いが消えた形で着いた人も完成になる (数字が安く出る)
 */
export function doneHeld(data: PatchData, doc: TreeDoc, n = 100, seed = 1): Record<number, number> {
  return withTreeTune(doc, () => {
    const aims = aimsOf(doc), shapes = shapesOf(doc), rng = mulberry32(seed), out: Record<number, number> = {};
    for (let i = 0; i < n; i++) {
      let item = startItemOf(data, doc, rng).item, at = "start", steps = 0, hops = 0;
      for (;;) {
        const b = doc.boxes[at];
        if (!b) break;
        if (b.done === "main") { const k = aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).length; out[k] = (out[k] ?? 0) + 1; if (process.env.DONE_MISS && k < aims.length) console.log(`  足りない完成 ${at}: 無い ${aims.filter((a) => !aimHeldOn(data, item, a, { sameText: true })).map((a) => a.modId).join(", ")} / 前 ${item.prefixes.map((m) => m.modId + m.tierName).join(", ")} / 後 ${item.suffixes.map((m) => m.modId + m.tierName).join(", ")}`); break; }
        if (b.split) { const to = ++hops > 1000 ? null : splitTo(data, b.split, item, aims); if (!to) break; at = to; continue; }
        if (b.back) {
          if (++hops > 1000) break;
          if (b.back === RESTART) { item = startItemOf(data, doc, rng).item; at = "start"; continue; }
          const to = b.back === MATCH ? matchItem(data, doc, item, aims) : settle(data, doc, shapes, b.back, item, aims);
          if (!to) break; at = to; continue;
        }
        if (!b.hand || ++steps > 20000) break;
        hops = 0;
        const r = playHand(data, item, b.hand, rng, handAims(doc, at, aims));
        if (!r.applied) break;
        const next = outBoxOf(doc, b, outcomeOf(data, item, r.item, aims));
        if (!next) { const to = matchItem(data, doc, r.item, aims); if (!to) break; item = r.item; at = to; continue; }
        item = r.item;
        at = settle(data, doc, shapes, next, item, aims);
      }
    }
    return out;
  });
}
