/**
 * _tree-patterns-probe.test.ts — ツリー (クラフトの道) を白紙から「画面と同じ関数・同じ順」で組む実験を 12 パターン並べる台本 (2026-10-22 シミュ部長のサブ、
 * オーナー「いろんなパターンで実験せなあかん」)。一覧は docs/org/simulator/notes/2026-10-22-tree-patterns.md。
 *
 *   pnpm exec vitest run -c scripts/_tree-patterns-probe.config.ts            (全部)
 *   PAT=<名前> pnpm exec vitest run -c scripts/_tree-patterns-probe.config.ts (1 つだけ)
 *   OUT=<置き場> …  組んだ木の JSON を <置き場>/<名前>.json に書く (既定は書かない)
 *
 * 画面の真似 (Ui): 白紙 = newTree / 始まりの形 = TreeStartPick の change・toggleFracture・addRune・setStartRandom (一覧にある MOD・ルーンだけ) /
 * 手 = TreeHandShelf (見本 sampleOf(…,1)・棚にある物・掛けられるお告げ・hitAims・preCat・singleOutOf・problem) → SimTreePage の pickHand
 * (setHand → joinSameShape → linkSameShape) / 当たり = TreeModPick (hit は normal・desecrated の行だけ) → setAim・addHit / カオススパムの札 = onSpam /
 * 戻り = onTarget (use-tree-link の灰色の判定。灰色でも＋の引っ張りでつながるので setBack はする) / 始めに戻る = pickBack / 分かれ目 = onSplit・TreeSplitPick の行 /
 * 完成 = onDone。画面で選べない物は入れずに「組めない」として記録する。
 * 値段は _tree-split-probe の EX 表 (神 = ÷ 696.929)。表に無いキーは 0 にして、使った物を並べる。並べるだけ (見張りではない)
 */
import fs from "node:fs";
import { afterAll, it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { applyCurrency, freshItem, modListFor, mulberry32, omensFor, RUNES, socketCapOf, type PatchData } from "../src/services/craft-stage/engine";
import { stepOutcomes } from "../src/services/craft-stage/engine-sim";
import { fillCatalyst } from "../src/services/craft-stage/engine-sim";
import { aimHeldOn } from "../src/services/simulator/tree/tree-aim";
import { effectOf } from "../src/services/simulator/tree/tree-hands";
import { addHit, addSplitRow, removeHit, aimKey, migrateStart, newTree, setAim, setBack, setDone, setHand, setSplit, setSplitWhen, tidy, toggleMemoAim, kindOfHand, type Aim, type Hand, type SplitWhen, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { aimsOf, handAims, handProblem, outcomeOf, playHand, sampleOf, singleOutOf, startItemOf } from "../src/services/simulator/tree/tree-sample";
import { CATALYSING, canSpam, ECHO, engineOmens, isBone, isCatalyst, TREE_CATALYSTS } from "../src/services/simulator/tree/tree-hands";
import { linkSameShape, MATCH, matchItem, outBoxOf, RESTART, runTree, settle, shapesOf, splitTo } from "../src/services/simulator/tree/tree-run";
import { joinSameShape } from "../src/views/simulator/tree/tree-merge";
import { checkTree } from "../src/services/simulator/tree/tree-check";
import { withTreeTune } from "../src/services/simulator/tree/tree-tune";
import { bonesFor, essenceShelf, ORBS } from "../src/state/for-share/craft-stage-shelf";
import { simHidden } from "../src/state/for-share/shelf-context";
import { heldOmensOf } from "../src/components/for-share/shelf/held-omens";

const EX: Record<string, number> = { chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.83 };
const zero = new Set<string>();
const price = (k: string): number => { if (!(k in EX)) zero.add(k); return (EX[k] ?? 0) / 696.929; };

type Row = { kind: "held"; n: number } | { kind: "none" } | { kind: "junk"; side: "prefix" | "suffix" | "any"; n: number };
/** TreeSplitPick の whenOf と同じ */
const whenOf = (r: Row): SplitWhen => (r.kind === "none" ? { heldCount: [0, 0] } : r.kind === "junk" ? { junk: { [r.side]: [Math.max(1, r.n), 99] } } : { heldCount: [Math.max(1, r.n), 99] });
interface Find { pat: string; where: string; what: string }
interface HandOpt { spam?: boolean; max?: number; free?: boolean; /** 骨の手のアビスの反響 (既定で付ける) */ echo?: boolean; /** 触媒の前のカタリスト (TreeHandShelf のカタリストの選び #7。既定は狙いのタグから) */ cat?: string }

class Ui {
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
function doneHeld(data: PatchData, doc: TreeDoc, n = 100, seed = 1): Record<number, number> {
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

const A = (modId: string, tier: number): Aim => ({ modId, tier });
const R = "Rings/", AM = "Amulets/", BD = "Boots_dex/", GI = "Gloves_int/", HI = "Helmets_int/", BA = "Body_Armours_int/";
const DEX = "OmenofDextralExaltation", SIN = "OmenofSinistralExaltation";

/** 外れの箱に消去 (omens 付き) を付けて、結果の箱は既定のまま (外れが消えた = 外れの前・狙いが消えた = 始め) */
const annul = (u: Ui, junk: string | undefined, omens: string[] = []): string | null => {
  if (!junk) return null;
  const at = u.hand(junk, "annul", omens);
  if (at || !omens.length) return at;
  u.log.push(`${junk}: お告げ付きが押せないので素の消去にした`);
  return u.hand(junk, "annul");
};

const PATTERNS: { name: string; base: string; note: string; build: (u: Ui) => void; fix?: (u: Ui) => string }[] = [
  { name: "ring-annul", base: "Gold Ring", note: "指輪: ✦ライフ T1、右側の高貴 + 上級で 火・冷気耐性。外れたら消去", build: (u) => {
    const F = A(`${R}FireResistance`, 2), C = A(`${R}ColdResistance`, 2);
    u.startMod(`${R}IncreasedLife`, 1, true);
    const s = u.hand("start", "exalt_greater", [DEX])!;
    const h = u.hits(s, [F, C]);
    annul(u, u.o(s).junk);
    for (const [k, other] of [["FireResistance", C], ["ColdResistance", F]] as const) {
      const at = u.hand(h[k]!, "exalt_greater", [DEX]);
      if (!at) continue;
      const hh = u.hits(at, [other]);
      u.done(hh[other.modId.split("/")[1]!]!);
      annul(u, u.o(at).junk);
    }
  } },
  { name: "body-essence-path", base: "Vile Robe", note: "胴 (エッセンスの道、10-22): ✦ES T1 + 乱数 2、パーフェクトエッセンス (ライフ%) の結果 = 付いた / 狙いが消えた → 右側の高貴 + 上級で 冷気・雷。外れは右側の消去", build: (u) => {
    const C = A(`${BA}ColdResistance`, 2), L = A(`${BA}LightningResistance`, 2);
    u.startMod(`${BA}LocalEnergyShield`, 1, true);
    u.random(2);
    const e = u.hand("start", `essence:perfect:${BA}PerfectEssence_MaximumLifeIncreasePercent`, [])!;
    const got = u.o(e).hit[0];
    if (!got) return;
    const s = u.hand(got, "exalt_greater", [DEX])!;
    const h = u.hits(s, [C, L]);
    annul(u, u.o(s).junk, ["OmenofDextralAnnulment"]);
    for (const [k, other] of [["ColdResistance", L], ["LightningResistance", C]] as const) {
      const at = u.hand(h[k]!, "exalt_greater", [DEX]);
      if (!at) continue;
      u.done(u.hits(at, [other])[other.modId.split("/")[1]!]!);
      annul(u, u.o(at).junk, ["OmenofDextralAnnulment"]);
    }
  } },
  { name: "body-essence-split", base: "Vile Robe", note: "胴 (解析君の案 c、10-22): ✦ES T1 + 乱数 2、パーフェクトエッセンス (ライフ%) → 分かれ目 (狙い 3 = 完成 / サフィの外れ 2 = 素の消去 / それ以外 = 右側の高貴)。消去の外れが消えた = 分かれ目、狙いが消えた = エッセンスの箱", build: (u) => {
    const C = A(`${BA}ColdResistance`, 2), L = A(`${BA}LightningResistance`, 2);
    u.startMod(`${BA}LocalEnergyShield`, 1, true);
    u.random(2);
    u.memo(C); u.memo(L);
    const e = u.hand("start", `essence:perfect:${BA}PerfectEssence_MaximumLifeIncreasePercent`, [])!;
    const got = u.o(e).hit[0];
    if (!got) return;
    // エッセンスの当たりの箱をそのまま分かれ目に (前に狙い無しの高貴を 1 回置くと、打ち直して着いた人のサフィが外れで満杯の時に打てず 36 人止まった)
    const p = got;
    const [done, junk, other] = u.split(p, [{ kind: "held", n: 3 }, { kind: "junk", side: "suffix", n: 2 }]);
    u.done(done!);
    // 見本の形はプレが満杯で右側のお告げが「今は意味なし」で押せない (画面も同じ) → 素の上級の高貴 (プレが満杯ならサフィに付く)
    const ex = u.hand(other!, "exalt_greater", [DEX]) ?? u.hand(other!, "exalt_greater")!;
    u.hits(ex, [C, L]);
    u.allBack(ex, p);
    // 素の消去 (サフィの外れが 2 つ以上の時だけ)。外れが消えた = 分かれ目、狙いが消えた = エッセンスの箱 (ライフ% が消えた人は打ち直す。
    // 耐性が消えた人はエッセンスが打てないので回しの「打てる形の合う箱へ」に任せる。画面の分かれ目の行に「この狙いが無い」が無いため)
    const an = u.hand(junk!, "annul");
    if (an) for (const x of u.d.boxes[an]!.outs) u.back(x, u.d.boxes[x]!.out === "lost" ? "start" : p);
  } },
  { name: "helmet-desecrate", base: "Kamasan Tiara", note: "兜: ✦ES% T1 + 乱数 2、骨 + 右側の死霊術で冒涜 → 発現で 雷混沌耐性。外れは光 + 消去", build: (u) => {
    u.startMod(`${HI}LocalEnergyShieldPercent`, 1, true);
    u.random(2);
    const s = u.hand("start", "desecrate", ["OmenofDextralNecromancy"])!;
    const h = u.hits(s, [A(`${HI}Desecrated_LightningAndChaosDamageResistance`, 1)]);
    u.done(Object.values(h)[0]!);
    const j = u.o(s).junk;
    if (j) { const at = u.hand(j, "annul", ["OmenofLight"]); if (at) for (const x of u.d.boxes[at]!.outs) if (!u.d.boxes[x]!.back) u.back(x, "start"); }
  } },
  { name: "amulet-spam-split", base: "Stellar Amulet", note: "アミュ: 乱数 3、カオス当たるまで (スペルレベル T3・キャスト T2) → 分かれ目 (2 つ = 完成 / サフィの外れ 2 = 消去 / それ以外 = 右側の高貴)", build: (u) => {
    const S = A(`${AM}GlobalIncreaseSpellSkillGemLevel`, 3), C = A(`${AM}IncreasedCastSpeed`, 2);
    u.random(3);
    if (!u.hand("start", "chaos", [], { spam: true })) { u.memo(S); u.memo(C); }
    const s = u.hand("start", "chaos", [], { spam: true })!;
    const h = u.hits(s, [S, C]);
    const J = h.GlobalIncreaseSpellSkillGemLevel!;
    const [done, none, junk, other] = u.split(J, [{ kind: "held", n: 2 }, { kind: "none" }, { kind: "junk", side: "suffix", n: 2 }]);
    u.done(done!);
    u.back(none, "start");
    const an = u.hand(junk!, "annul");
    if (an) { u.log.push(`消去の結果の既定の戻り: ${u.d.boxes[an]!.outs.map((x) => `${x}↩${u.d.boxes[x]!.back}`).join(" ")}`); for (const x of u.d.boxes[an]!.outs) { setBack(u.d, x, null); u.back(x, J); } }
    const ex = u.hand(other!, "exalt_greater", [DEX]);
    // 「それ以外」の行はキャストかスペルレベルのどちらかが無い → 右側の高貴の当たりは両方 (②: スペルレベルの箱が無く 290 人止まった)
    if (ex) { u.hits(ex, [C, S]); for (const x of u.d.boxes[ex]!.outs) { if (u.d.boxes[x]!.back) setBack(u.d, x, null); u.back(x, J); } }
    u.back(h.IncreasedCastSpeed!, J);
  } },
  { name: "boots-chaos-onspam", base: "Drakeskin Boots", note: "靴: ✦移動 T1 + ルーン + 乱数 2、カオス 1 回 → 外れは「カオススパム」の札 → 高貴で残り (高貴の外れは、足りない側が満杯ならカオススパム、空きがあれば高貴へ戻る)", build: (u) => {
    const Lf = A(`${BD}IncreasedLife`, 2), F = A(`${BD}FireResistance`, 2);
    u.startMod(`${BD}MovementVelocity`, 1, true);
    u.rune("Iron Rune");
    u.random(2);
    const s = u.hand("start", "chaos")!;
    const h = u.hits(s, [Lf, F]);
    const sp = u.o(s).junk ? u.spam(u.o(s).junk!) : null;
    const sh = sp ? u.o(sp).by : {};
    for (const [k, other, om] of [["IncreasedLife", F, DEX], ["FireResistance", Lf, SIN]] as const) {
      const at = u.hand(h[k]!, "exalt_greater", [om]);
      if (!at) continue;
      u.done(u.hits(at, [other])[other.modId.split("/")[1]!]!);
      // 高貴の外れ (k + 外れ) は分かれ目: 足りない狙いの側が外れで満杯ならカオススパムの札 (付くのは残りの狙いだけなので完成)、空きがあれば側の高貴へ戻る
      // (10-22 解析君 8dfeb707: 外れなら全部カオスにすると、狙いを消された人が 2 つのカオスの箱を 1 人 約 4.4 回行き来し 50 神。空きがあれば高貴で 27〜28 神)
      const j = u.o(at).junk;
      if (j) {
        const side = om === DEX ? "suffix" : "prefix";
        const [full, room] = u.split(j, [{ kind: "junk", side, n: side === "suffix" ? 3 : 2 }]);
        if (full) { u.spam(full); for (const x of u.d.boxes[full]!.outs) u.done(x); }
        // 空きの行に側の高貴を直接置く (行から高貴の箱へ戻すと、外れのある形は分かれ目の箱と同じ形なので settle でここへ戻り輪になった)。外れは分かれ目へ
        const ex2 = room ? u.hand(room, "exalt_greater", [om]) : null;
        if (ex2) { u.done(u.hits(ex2, [other])[other.modId.split("/")[1]!]); const j2 = u.o(ex2).junk; if (j2) u.back(j2, j); }
      }
      if (sh[k]) u.back(sh[k]!, h[k]!);
    }
  } },
  { name: "amulet-catalyst", base: "Stellar Amulet", note: "アミュ: ✦ライフ T1 + 乱数 1、欲しい MOD のメモ → 触媒 + 右側の高貴 + 完全 (前にカタリスト) でキャスト・クリティカル率。外れは消去 (手袋は触媒が入らないのでアミュ)", build: (u) => {
    const AS = A(`${AM}IncreasedCastSpeed`, 2), CM = A(`${AM}CriticalStrikeChance`, 2);
    u.startMod(`${AM}IncreasedLife`, 1, true);
    u.random(1);
    u.memo(AS); u.memo(CM);
    const s = u.hand("start", "exalt_perfect", [CATALYSING, DEX])!;
    const h = u.hits(s, [AS, CM]);
    annul(u, u.o(s).junk);
    for (const [k, other] of [["IncreasedCastSpeed", CM], ["CriticalStrikeChance", AS]] as const) {
      const at = u.hand(h[k]!, "exalt_perfect", [CATALYSING, DEX]);
      if (!at) continue;
      u.done(u.hits(at, [other])[other.modId.split("/")[1]!]!);
      annul(u, u.o(at).junk);
    }
  } },
  { name: "gloves-perfect", base: "Sirenscale Gloves", note: "手袋: ✦ES% T1 + 乱数 1、メモ → 触媒 + 右側 + 完全の高貴を試す (手袋は品質が入らず押せない) → 右側 + 上級の高貴でアタックスピード・クリダメ。外れは消去", build: (u) => {
    const AS = A(`${GI}IncreasedAttackSpeed`, 2), CM = A(`${GI}CriticalStrikeMultiplier`, 2);
    u.startMod(`${GI}LocalEnergyShieldPercent`, 1, true);
    u.random(1);
    u.memo(AS); u.memo(CM);
    // 解析君の B (10-22): 完全の高貴より上級の高貴が安い (12,007 → 369 神)。触媒は手袋に入らないので試すだけ (#16)
    const s = u.hand("start", "exalt_perfect", [CATALYSING, DEX]) ?? u.hand("start", "exalt_greater", [DEX]);
    const h = u.hits(s, [AS, CM]);
    annul(u, u.o(s).junk);
    for (const [k, other] of [["IncreasedAttackSpeed", CM], ["CriticalStrikeMultiplier", AS]] as const) {
      const at = u.hand(h[k], "exalt_greater", [DEX]);
      u.done(u.hits(at, [other])[other.modId.split("/")[1]!]);
      annul(u, u.o(at).junk);
    }
  } },
  { name: "gloves-whittle-spam", base: "Sirenscale Gloves", note: "手袋: ✦ES% T1 + 乱数 4、完全のカオス + 右側の抹消 当たるまで (上限 30 回) でアタックスピード T1 だけ", build: (u) => {
    const C = A(`${GI}IncreasedAttackSpeed`, 1);
    u.startMod(`${GI}LocalEnergyShieldPercent`, 1, true);
    u.random(4);
    u.memo(C);
    const s = u.hand("start", "chaos_perfect", ["OmenofDextralErasure"], { spam: true, max: 30 })!;
    u.done(u.hits(s, [C]).IncreasedAttackSpeed!);
  } },
  { name: "amulet-4aims-split", base: "Stellar Amulet", note: "アミュ (解析君 v5b、10-22): ✦スペルダメージ T1。右側の高貴 (狙い無し) → 分かれ目 (狙い 2 つ = ES へ / サフィの外れ 2 = 素の消去 / それ以外 = 右側の高貴) でスペルレベル・キャスト → 触媒 + 左側の高貴で ES (外れは左側の消去) → 古代の骨 + 左側の死霊術でスピリット (外れは光 + 消去)", build: (u) => {
    const S = A(`${AM}GlobalIncreaseSpellSkillGemLevel`, 3), C = A(`${AM}IncreasedCastSpeed`, 3), E = A(`${AM}EnergyShield`, 3), SP = A(`${AM}BaseSpirit`, 2);
    u.startMod(`${AM}SpellDamage`, 1, true);
    for (const a of [S, C, E, SP]) u.memo(a);
    // 消去の結果: 外れが消えた = 同じ手の箱へ、狙いが消えた = 分かれ目 b1 へ (前は全部同じ箱へ戻し、スピリットが消えたまま ES で完成した人が 3 人いた)
    const back2 = (an: string, to: string): void => { for (const x of u.d.boxes[an]!.outs) u.back(x, u.d.boxes[x]!.out === "lost" ? b1Ref.id : to); };
    const b1Ref = { id: "" }, ejRef = { id: "" };
    // 1. サフィ 2 つ: 右側の高貴。外れ 1 つは置いたまま、サフィの外れ 2 つで素の消去 (プレは ✦ だけなのでサフィの物だけ消える)
    const s = u.hand("start", "exalt_greater", [DEX], { free: true })!;
    const b1 = u.o(s).any!;
    b1Ref.id = b1;
    const [es, junk, other] = u.split(b1, [{ kind: "held", n: 2 }, { kind: "junk", side: "suffix", n: 2 }]);
    const ex = u.hand(other!, "exalt_greater", [DEX])!;
    u.hits(ex, [S, C]);
    u.allBack(ex, b1);
    const an = u.hand(junk!, "annul");
    if (an) u.allBack(an, b1);
    // 2. ES: 防御のカタリスト (自動で前に) + 触媒 + 左側の高貴。プレの外れは左側の消去 → 2 へ
    const e = u.hand(es!, "exalt_greater", [CATALYSING, SIN], { cat: "catalyst_defences" });
    if (!e) return;
    ejRef.id = u.o(e).junk ?? "";
    // 当たりの箱は見本の形で候補が全部入るので、1 つを ES に選び直し、残りは × で消す (TreeModPick・当たりの ×)
    const [first, ...rest] = u.o(e).hit;
    if (first) u.aim(first, E);
    for (const x of rest) removeHit(u.d, x);
    const eh = first;
    const ea = annul(u, u.o(e).junk, ["OmenofSinistralAnnulment"]);
    if (ea) back2(ea, es!);
    // 左側の高貴でスピリット (T2 以上) が先に付く人 (100 人中 3 人、結果の箱が無く止まった) → もう一度 触媒 + 左側の高貴で ES → 完成
    if (first) {
      const sp1 = u.addHit(first, SP);
      const e2 = u.hand(sp1, "exalt_greater", [CATALYSING, SIN], { cat: "catalyst_defences" });
      if (e2) {
        const [h2, ...r2] = u.o(e2).hit;
        if (h2) { u.aim(h2, E); u.done(h2); }
        for (const x of r2) removeHit(u.d, x);
        // 左側の消去でスピリットが消えるとプレの外れが残る → ES の外れの箱 (左側の消去) で外れを消してから ES の段へ (b1 へ戻すとプレの外れのまま ES を付け、骨で ES が入れ替わって止まった)
        const a2 = annul(u, u.o(e2).junk, ["OmenofSinistralAnnulment"]);
        if (a2) for (const x of u.d.boxes[a2]!.outs) u.back(x, u.d.boxes[x]!.out === "lost" ? ejRef.id || b1Ref.id : sp1);
      }
    }
    if (!eh) return;
    // 3. スピリット: 古代の骨 + 左側の死霊術 → 発現で選ぶ。冒涜の外れは光 + 消去 → 3 へ
    const d3 = u.hand(eh, "desecrate_ancient", ["OmenofSinistralNecromancy"]);
    if (!d3) return;
    const [sp, ...spRest] = u.o(d3).hit;
    if (sp) u.aim(sp, SP);
    for (const x of spRest) removeHit(u.d, x);
    u.done(sp);
    const la = annul(u, u.o(d3).junk, ["OmenofLight"]);
    if (la) back2(la, eh);
  } },
  { name: "body-sinistral-desecrate", base: "Vile Robe", note: "胴: ✦ES T1、左側の高貴 + 上級で ライフ・ES% → 古代の骨 + 右側の死霊術で スピリット効率 (冒涜)。外れは左側の消去 / 光 + 消去", build: (u) => {
    const Lf = A(`${BA}IncreasedLife`, 2), E = A(`${BA}LocalEnergyShieldPercent`, 3), SP = A(`${BA}Desecrated_SpiritReservationEfficiency`, 1);
    u.startMod(`${BA}LocalEnergyShield`, 1, true);
    const s = u.hand("start", "exalt_greater", [SIN])!;
    const h = u.hits(s, [Lf, E]);
    annul(u, u.o(s).junk, ["OmenofSinistralAnnulment"]);
    for (const [k, other] of [["IncreasedLife", E], ["LocalEnergyShieldPercent", Lf]] as const) {
      const at = u.hand(h[k]!, "exalt_greater", [SIN]);
      if (!at) continue;
      const hh = u.hits(at, [other]);
      annul(u, u.o(at).junk, ["OmenofSinistralAnnulment"]);
      const top = hh[other.modId.split("/")[1]!]!;
      if (u.d.boxes[top]!.back) continue; // 同じ形の箱へ自動でつながった
      const d2 = u.hand(top, "desecrate_ancient", ["OmenofDextralNecromancy"]) ?? u.hand(top, "desecrate_ancient");
      if (!d2) continue;
      u.done(u.hits(d2, [SP]).Desecrated_SpiritReservationEfficiency!);
      const j = u.o(d2).junk;
      const an = annul(u, j, ["OmenofLight"]);
      if (an) for (const x of u.d.boxes[an]!.outs) if (!u.d.boxes[x]!.back) u.back(x, top);
    }
  } },
  { name: "gloves-rune-start", base: "Sirenscale Gloves", note: "手袋: 始まりに ✦ルーンの MOD (投射物を追加で 1 個) + 乱数 1、左側の高貴 + 上級で ライフ・ES%。外れは左側の消去", build: (u) => {
    const Lf = A(`${GI}IncreasedLife`, 2), E = A(`${GI}LocalEnergyShieldPercent`, 2);
    u.startMod(`${GI}Rune_marksman_AdditionalProjectileChance`, 1, true);
    u.random(1);
    const s = u.hand("start", "exalt_greater", [SIN]);
    if (!s) return;
    const h = u.hits(s, [Lf, E]);
    annul(u, u.o(s).junk, ["OmenofSinistralAnnulment"]);
    for (const [k, other] of [["IncreasedLife", E], ["LocalEnergyShieldPercent", Lf]] as const) {
      const at = u.hand(h[k]!, "exalt_greater", [SIN]);
      if (!at) continue;
      u.done(u.hits(at, [other])[other.modId.split("/")[1]!]!);
      annul(u, u.o(at).junk, ["OmenofSinistralAnnulment"]);
    }
  } },
  { name: "boots-3res-split", base: "Drakeskin Boots", note: "靴: ✦移動 T1、上級の高貴 狙い無し → 分かれ目 (3 つ = 完成 / サフィの外れ 1 = 右側の消去 / それ以外 = 右側の高貴 + 上級) で 火・冷気・雷 T2", build: (u) => {
    const W = [A(`${BD}FireResistance`, 2), A(`${BD}ColdResistance`, 2), A(`${BD}LightningResistance`, 2)];
    u.startMod(`${BD}MovementVelocity`, 1, true);
    for (const a of W) u.memo(a);
    const s = u.hand("start", "exalt_greater", [], { free: true })!;
    const b1 = u.o(s).any!;
    const [done, junk, other] = u.split(b1, [{ kind: "held", n: 3 }, { kind: "junk", side: "suffix", n: 1 }]);
    u.done(done!);
    const ex = u.hand(other!, "exalt_greater", [DEX])!;
    u.hits(ex, W);
    u.allBack(ex, b1);
    const an = annul(u, junk, ["OmenofDextralAnnulment"]);
    if (an) u.allBack(an, b1);
  } },
  { name: "ring-join-done", base: "Gold Ring", note: "指輪: ✦レアリティ(プレ) T1、メモ → カオス当たるまで (火・冷気) → 右側の高貴で残り → 完成 2 つ → 片方から左側の高貴 + 上級でライフ (同じ形の完成が合流)", build: (u) => {
    const F = A(`${R}FireResistance`, 2), C = A(`${R}ColdResistance`, 2), Lf = A(`${R}IncreasedLife`, 3);
    u.startMod(`${R}ItemFoundRarityIncreasePrefix`, 1, true);
    u.random(2);
    u.memo(F); u.memo(C);
    const s = u.hand("start", "chaos", [], { spam: true })!;
    const h = u.hits(s, [F, C]);
    const dones: string[] = [];
    for (const [k, other] of [["FireResistance", C], ["ColdResistance", F]] as const) {
      const at = u.hand(h[k]!, "exalt_greater", [DEX]);
      if (!at) continue;
      const x = u.hits(at, [other])[other.modId.split("/")[1]!]!;
      if (!u.d.boxes[x]!.back) { u.done(x); dones.push(x); }
      annul(u, u.o(at).junk);
    }
    u.log.push(`完成: ${dones.join(" ")}`);
    const p = u.hand(dones[0]!, "exalt_greater", [SIN])!;
    u.log.push(`合流の後: ${dones.map((x) => `${x} done=${u.d.boxes[x]!.done} back=${u.d.boxes[x]!.back}`).join(" / ")}`);
    u.done(u.hits(p, [Lf]).IncreasedLife!);
    annul(u, u.o(p).junk, ["OmenofSinistralAnnulment"]);
  } },
];

/** 重い計算の間に vitest の連絡を通す (止めたままだと onTaskUpdate が時間切れになる) */
const tick = (): Promise<void> => new Promise((res) => setTimeout(res, 0));
const only = process.env.PAT, out = process.env.OUT;
const pats = PATTERNS.filter((p) => !only || p.name === only);
if (!pats.length) throw new Error(`パターンが無い: ${only} (${PATTERNS.map((p) => p.name).join(", ")})`);
const rows: string[] = [], finds: Find[] = [];
// 1 パターン 1 つの it (1 つの it で全部回すと 1 分を超え、vitest の onTaskUpdate が時間切れになった)
for (const p of pats) {
  it(p.name, async () => {
    const data = loadPatch();
    const t0 = Date.now();
    const u = new Ui(data, p.name, p.base);
    p.build(u);
    const d = u.d;
    tidy(d);
    const startNote = startItemOf(data, d, mulberry32(1)).note;
    if (startNote) u.find("始まりの形", `作れない: ${startNote}`);
    const t1 = Date.now();
    const issues = checkTree(data, d);
    await tick();
    const t2 = Date.now();
    zero.clear();
    const r = runTree(data, d, { n: 100, seed: 1, price });
    await tick();
    const dh = doneHeld(data, d);
    await tick();
    const t3 = Date.now(), saved = JSON.stringify({ pattern: p.name, note: p.note, base: p.base, tree: d }, null, 1);
    // 精査を見て直した形 (写しで。元の木と数字はそのまま)
    let fixed = ""; const u2 = new Ui(data, p.name, p.base);
    if (p.fix) {
      u2.d = structuredClone(d);
      const why = p.fix(u2);
      const fi = checkTree(data, u2.d); await tick();
      const fr = runTree(data, u2.d, { n: 100, seed: 1, price }); await tick();
      const fh = doneHeld(data, u2.d); await tick();
      fixed = `  直した後 (${why}): 精査 穴 ${fi.length} [${fi.map((x) => `${x.kind} ${x.boxId}`).join(", ")}] · 完成 ${fr.finished}% · 打ち止め ${fr.capped} · 1 個 ${fr.perItem.toFixed(2)} 神 · 中央 ${fr.median.toFixed(1)} · 90% ${fr.p90.toFixed(1)} · 止まり ${fr.stuck} ${JSON.stringify(fr.stuckAt)} · 完成の中身 ${JSON.stringify(fh)}`;
    }
    console.log(`\n■ ${p.name} (${p.base}) ${p.note}\n  箱 ${Object.keys(d.boxes).length} · 狙い ${aimsOf(d).length} · 組む ${t1 - t0}ms · 精査 ${t2 - t1}ms · 100 人 ${t3 - t2}ms`);
    for (const l of u.log) console.log(`  手 ${l}`);
    for (const f of u.finds) console.log(`  組めない ${f.where}: ${f.what}`);
    const auto = Object.values(d.boxes).filter((b) => b.autoBack).map((b) => `${b.id}(${b.out})→${b.back}`);
    if (auto.length) console.log(`  自動でつながった: ${auto.join(" ")}`);
    console.log(`  精査 穴 ${issues.length}`);
    for (const x of issues) console.log(`    ${x.kind.padEnd(10)} ${String(x.boxId).padEnd(5)} 来た ${String(r.boxes[x.boxId]?.reach ?? "-").padStart(3)} 止まり ${String(r.stuckAt[x.boxId] ?? 0).padStart(3)} | ${x.text}${typeof x.boxId === "string" ? "" : ` [boxId ${typeof x.boxId} ${JSON.stringify(x.boxId)}]`}`);
    const flagged = new Set(issues.map((x) => x.boxId));
    const miss = [...Object.keys(r.stuckAt), ...Object.keys(r.unexpected)].filter((id, i, a) => a.indexOf(id) === i && !flagged.has(id));
    if (miss.length) console.log(`  精査が言わない止まり・想定外: ${miss.map((id) => `${id} (止まり ${r.stuckAt[id] ?? 0} · 想定外 ${r.unexpected[id] ?? 0})`).join(" / ")}`);
    const uses = Object.entries(r.uses).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(" · ");
    console.log(`  100 人: 完成 ${r.finished}% · 1 個 ${r.perItem.toFixed(2)} 神 · 中央 ${r.median.toFixed(1)} · 90% ${r.p90.toFixed(1)} · 打ち止め ${r.capped} · 止まり ${r.stuck} ${JSON.stringify(r.stuckAt)} · 想定外 ${JSON.stringify(r.unexpected)} · 作り直し ${r.restarts.toFixed(2)}`);
    console.log(`  1 人あたり: ${uses}`);
    const dn = Object.values(dh).reduce((a, b) => a + b, 0);
    console.log(`  完成の中身 (狙いの数: 人数): ${JSON.stringify(dh)}${dn !== r.finished ? ` ※ 辿り直しの完成 ${dn} が runTree の ${r.finished} と違う` : ""}`);
    if (zero.size) console.log(`  値段 0: ${[...zero].join(", ")}`);
    if (fixed) console.log(fixed);
    for (const [id, w] of Object.entries(r.stuckWhy)) console.log(`  止まり ${id} (戻り ${w.backs.join(" → ")}): ${w.reason} / 前 ${w.item.prefixes.map((m) => `${m.modId}${m.fractured ? "✦" : ""}`).join(", ")} / 後 ${w.item.suffixes.map((m) => m.modId).join(", ")}`);
    rows.push(`| ${p.name} | ${Object.keys(d.boxes).length} | ${aimsOf(d).length} | ${u.finds.length} | ${issues.length} | ${r.finished}% | ${r.perItem.toFixed(2)} | ${r.median.toFixed(1)} | ${r.p90.toFixed(1)} | ${r.stuck} ${JSON.stringify(r.stuckAt)} | ${JSON.stringify(r.unexpected)} |`);
    finds.push(...u.finds);
    if (out) fs.writeFileSync(`${out}/${p.name}.json`, saved);
    if (out && p.fix) fs.writeFileSync(`${out}/${p.name}-fixed.json`, JSON.stringify({ pattern: `${p.name}-fixed`, note: p.note, base: p.base, tree: u2.d }, null, 1));
  });
}
afterAll(() => {
  console.log(`\n| 名前 | 箱 | 狙い | 組めない | 精査の穴 | 完成 | 1 個 | 中央 | 90% | 止まり | 想定外 |\n|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}`);
  console.log(`組めない ${finds.length} 件`);
});
