/**
 * _tree-patterns-ui.ts — _tree-patterns-probe.test.ts の画面の真似 (Ui)・値段の表・完成の中身の確かめ (doneHeld)。
 * 台本が 500 行を超えたので分けた (2026-10-24、中身はそのまま)。説明は _tree-patterns-probe.test.ts の頭。
 * 11-07 に今の判定へ直した:
 * - 手は画面の手の窓・猿の口と同じ口 (tree-hand-plan の planPick → applyPick)。前は台本の中で当たりの札・1 通りを数え、setHand → joinSameShape → tree-shape の
 *   linkSameShape (形の鍵 = 道の狙いの組 + 外れの有無) でつないでいた。形の鍵の判定は旧い判定と一緒に消えた (11-07)。今のつなぎ・まとめは applyPick の中
 *   (箱どうしの判定 tree-judge の judgeMemo で linkByContent・mergeOpenSame・pruneByContent・foldAround、外れの道の同じ枠探し)
 * - カオススパムの札 (前の onSpam = linkSameShape を呼ばない setHand) は画面から無くなったので、カオスの「当たるまで」を同じ口で置く
 * - 始まりの乱数の MOD の数 (startRandom) は旧い始まりの形と一緒に消えた (10-23)。random は始まりの＋で外れの MOD を n 個足す形に読み替えた (乱数の外れではない)
 * - 始まりの ✦ は完成形の狙いのフラクチャーの印 (memoAims の fractured、tree-model の migrateStart と同じ形)
 * - 完成の中身 (doneHeld) は、前は台本の中で回し方 (shapesOf・matchItem・settle) を写していた。今は回す所そのもの (runTree の onPerson) で完成した人の品を見る
 */
import { applyCurrency, freshItem, modListFor, mulberry32, RUNES, socketCapOf, type PatchData } from "../src/services/craft-stage/engine";
import { craftStage } from "../src/state/craft-stage";
import { aimHeldOn } from "../src/services/simulator/tree/tree-aim";
import { effectOf, isBone, TREE_CATALYSTS } from "../src/services/simulator/tree/tree-hands";
import { addHit, aimKey, newTree, setAim, setBack, setDone, startRarity, type Aim, type SplitWhen, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { addSplitRow, setSplit, setSplitWhen } from "../src/services/simulator/tree/tree-model-ops";
import { toggleMemoAim } from "../src/services/simulator/tree/tree-memo";
import { aimsOf, handProblem, sampleOf } from "../src/services/simulator/tree/tree-sample";
import { runTree } from "../src/services/simulator/tree/tree-run";
import { applyPick, planPick, shelfKeysOf } from "../src/views/simulator/tree/tree-hand-plan";
import { heldOmensOf } from "../src/components/for-share/shelf/held-omens";

const EX: Record<string, number> = { chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.83 };
export const zero = new Set<string>();
export const price = (k: string): number => { if (!(k in EX)) zero.add(k); return (EX[k] ?? 0) / 696.929; };

/** 台本の狙いに使う MOD の系統 (始まりの外れにしない、random の読み替え) */
const AIM_WORDS = ["Resist", "Life", "EnergyShield", "CastSpeed", "Critical", "SpellSkill", "SpellDamage", "AttackSpeed", "Spirit", "Rarity", "Movement", "Projectile"];
type Row = { kind: "held"; n: number } | { kind: "none" } | { kind: "junk"; side: "prefix" | "suffix" | "any"; n: number };
/** TreeSplitPick の whenOf と同じ */
const whenOf = (r: Row): SplitWhen => (r.kind === "none" ? { heldCount: [0, 0] } : r.kind === "junk" ? { junk: { [r.side]: [Math.max(1, r.n), 99] } } : { heldCount: [Math.max(1, r.n), 99] });
export interface Find { pat: string; where: string; what: string }
interface HandOpt { spam?: boolean; max?: number; free?: boolean; /** 骨の手のアビスの反響 (既定で付ける) */ echo?: boolean; /** 触媒の前のカタリスト (手の窓のカタリストの選び。既定は planPick の autoCatOf) */ cat?: string }

export class Ui {
  d: TreeDoc;
  finds: Find[] = [];
  log: string[] = [];
  /** 安全網 (fillMissOuts) が足した結果の箱 (手ごと) と、数えた骨の手の数 */
  safety: string[] = [];
  bones = 0;
  constructor(readonly data: PatchData, readonly pat: string, base: string, ilvl = 82) {
    this.d = newTree(base, ilvl);
    // tree-hand-plan (applyPick・judgeOf) は読み込んだデータを craftStage から読む (画面と同じ)
    craftStage.data.value = data;
  }
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
    const d = this.d;
    d.start ??= { rarity: "rare", mods: [] };
    if (fractured) {
      // ✦ は完成形の狙いの印 (1 つだけ。tree-model の migrateStart と同じ形)
      const list = d.memoAims ?? [];
      for (const a of list) delete a.fractured;
      const g = list.find((a) => a.modId === modId);
      if (g) { g.tier = tier; g.fractured = true; } else list.push({ modId, tier, fractured: true });
      d.memoAims = list;
    } else {
      const m = d.start.mods.find((y) => y.modId === modId);
      if (m) m.tier = tier; else d.start.mods.push({ modId, tier });
    }
    d.start.rarity = startRarity(d);
  }
  rune(en: string): void {
    const it = freshItem(this.data, this.d.base, this.d.itemLevel, "rare");
    const cap = socketCapOf(it.base, it.cls.category);
    const ok = Object.entries(RUNES).some(([e, r]) => e === en && r.kind === "rune" && r.available !== false && applyCurrency(this.data, { ...it, sockets: 1 }, `rune:${e}`, mulberry32(1)).applied);
    const st = this.d.start!;
    if (!ok || (st.runes ?? []).length >= cap) { this.find("TreeStartPick ルーン", `${en} を差せない (一覧に無い / 上限 ${cap})`); return; }
    st.runes = [...(st.runes ?? []), en];
  }
  /**
   * 乱数の MOD の数 (前の NumStep 0〜5)。startRandom は 10-23 に始まりの形から外れた (外れは自分で付ける) ので、始まりの＋で外れの MOD を n 個足す形に読み替える:
   * 普通の MOD の行のうち、台本の狙いに使う系統 (AIM_WORDS) でない物の一番下の段を、プレ → サフィ → … の順に (側は 3 つまで)
   */
  random(n: number): void {
    if (n <= 0) return;
    const d = this.d, taken = new Set([...(d.memoAims ?? []), ...(d.start?.mods ?? [])].map((a) => a.modId));
    const rows = this.rows().filter((r) => r.group === "normal" && !AIM_WORDS.some((w) => r.id.includes(w)));
    const all = this.rows(), sideOf = (modId: string): string | undefined => all.find((r) => r.tiers.some((t) => (t.modId ?? r.id) === modId))?.side;
    const on = [...(d.start?.mods ?? []), ...(d.memoAims ?? []).filter((a) => a.fractured)].map((m) => sideOf(m.modId));
    const side = { prefix: on.filter((s) => s === "prefix").length, suffix: on.filter((s) => s === "suffix").length };
    let added = 0;
    for (let i = 0; added < n && i < 2 * n + 2; i++) {
      const want = i % 2 === 0 ? "prefix" : "suffix";
      if (side[want] >= 3) continue;
      const r = rows.find((x) => x.side === want && !taken.has((x.tiers.at(-1)?.modId ?? x.id)));
      const t = r?.tiers.at(-1);
      if (!r || !t) continue;
      const modId = t.modId ?? r.id;
      taken.add(modId); side[want]++; added++;
      this.startMod(modId, Number(t.rank.slice(1)));
    }
    this.log.push(`始まりの乱数 ${n} → 始まりの＋の外れ ${added} 個 (${(d.start?.mods ?? []).map((m) => `${m.modId.split("/")[1]} T${m.tier}`).join("・")})`);
    if (added < n) this.find("TreeStartPick 乱数", `始まりの外れを ${n} 個足せず ${added} 個にした`);
  }
  memo(a: Aim): void { if (!this.pickable(a, "hit")) this.find("TreeMemoFloat", `欲しい MOD ${a.modId} T${a.tier} が一覧に無い`); toggleMemoAim(this.d, a); }
  // ── 手 (手の窓 → SimTreePage.pickHand = 猿の口 add と同じ planPick → applyPick) ──
  hand(id: string | null | undefined, currency: string, omens: string[] = [], o: HandOpt = {}): string | null {
    const d = this.d, data = this.data, b = id ? d.boxes[id] : undefined;
    if (!id || !b) return null;
    if (b.back) { this.log.push(`${id} は戻り (${b.back}${b.autoBack ? " 自動" : ""}) を × で外してから手`); setBack(d, id, null); }
    const item = sampleOf(data, d, id, 1).item;
    if (!shelfKeysOf(data, item).includes(currency)) { this.find(`棚 (箱 ${id})`, `${currency} が棚に無い`); return null; }
    const can = heldOmensOf(currency);
    for (const x of omens) if (!can.includes(x)) this.find(`お告げの欄 (箱 ${id})`, `${currency} に ${x} を掛けられない`);
    if (o.free && effectOf(currency) !== "add") this.find(`狙い無し (箱 ${id})`, `${currency} は狙い無しにできない`);
    // 骨の手はアビスの反響を既定で付ける (台本の前からの既定。画面の手の窓の ☑ と同じ)
    const plan = planPick(data, d, id, item, currency, omens.filter((x) => can.includes(x)), { spam: o.spam, spamMax: o.max ?? null, free: o.free, echo: isBone(currency) && o.echo !== false }, d.memoAims ?? []);
    if (o.spam && !plan.hand.repeat) this.find(`当たるまで (箱 ${id})`, `${currency} は当たるまでにできない`);
    if (plan.problem) { this.find(`この手にする (箱 ${id})`, `${[currency, ...plan.hand.omens].join("+")}${o.spam ? " 当たるまで" : ""} が押せない: ${plan.problem}`); return null; }
    const pre = plan.preCat ? (o.cat && TREE_CATALYSTS.includes(o.cat) ? o.cat : plan.preCat) : null;
    if (pre) this.log.push(`${id}: 前にカタリスト ${pre}`);
    const at = applyPick(d, id, plan.hand, plan.kind, plan.aims, pre, plan.only);
    const h = plan.hand, here = d.boxes[at]!;
    // 安全網の差: 起こりうる結果の一覧 (planPick の only = possibleOutsOf) に無いのに手の下にできた結果の箱 = applyPick の fillMissOuts (配置の行き先の無い結果) が足した物。
    // 一覧と配置 (回す時と同じ分け) が揃っていれば 0 (B、11-07: 骨で ☑ の無い完成形の MOD が消える所)
    if (plan.only && here.hand) {
      const want = new Set(plan.only.map((e) => `${e.out}|${e.junkKey ?? ""}`));
      const extra = here.outs.filter((x) => { const c = d.boxes[x]; return !!c && c.out !== "hit" && !want.has(`${c.out}|${c.junkKey ?? ""}`); });
      if (extra.length) { this.safety.push(`${at} ${h.currency}: ${extra.map((x) => `${d.boxes[x]!.out}[${d.boxes[x]!.junkKey ?? ""}]`).join(" ")}`); }
      if (isBone(h.currency)) this.bones++;
    }
    const outs = here.back ? `↩${here.back} (同じ手なら戻る)` : here.outs.map((x) => `${x}:${d.boxes[x]!.out}${d.boxes[x]!.aim ? `(${d.boxes[x]!.aim!.modId.split("/")[1]})` : ""}${d.boxes[x]!.back ? `↩${d.boxes[x]!.back}` : ""}`).join(" ");
    this.log.push(`${id}${at !== id ? `→${at}` : ""} ${[h.currency, ...h.omens].join("+")}${h.repeat ? " 当たるまで" : ""}${h.free ? " 狙い無し" : ""} → ${outs}`);
    return here.hand ? at : null;
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
  /** カオススパムの札 (前の onSpam。画面から無くなったので、カオスの当たるまでを手の口で置く) */
  spam(id: string): string { return this.hand(id, "chaos", [], { spam: true }) ?? id; }
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
    if (!from || !to || !d.boxes[from]) return;
    if (to !== "start") {
      const t = d.boxes[to]!;
      const why = t.split ? null : !t.hand ? "この箱にはまだ打つ手が無い" : handProblem(this.data, sampleOf(this.data, d, from, 1).item, t.hand);
      if (why) this.find(`戻り先を選ぶ (${from} → ${to})`, `灰色で押せない: ${why} (＋の引っ張りではつながる)`);
    }
    if (d.boxes[from]!.hand) { this.find(`戻り (${from})`, "手のある箱には戻りを張れない"); return; }
    setBack(d, from, to);
  }
  split(id: string | undefined, rows: Row[]): string[] {
    if (!id || !this.d.boxes[id]) { this.find("分かれ目", "分かれ目にする箱が無い (前の手の結果に無かった)"); return []; }
    if (this.d.boxes[id]!.out === "start") { this.find("分かれ目", "始まりの箱は分かれ目にできない"); return []; }
    setSplit(this.d, id);
    rows.forEach((r, i) => { addSplitRow(this.d, id, { heldCount: [2, 99] }); setSplitWhen(this.d, id, i, whenOf(r)); });
    return this.d.boxes[id]!.split!.map((r) => r.to!);
  }
  /** 結果の箱を全部同じ所へ戻す */
  allBack(at: string | null, to: string): void { for (const x of (at && this.d.boxes[at]?.outs) || []) this.back(x, to); }
}

/**
 * 完成の中身の確かめ: 回す所そのもの (runTree、同じ seed) で完成した人の品を見て、狙いがいくつ付いていたかを数える。
 * runTree は完成の箱に着いたら中身を見ずに完成と数える (S-05) ので、狙いが消えた形で着いた人も完成になる (数字が安く出る)
 */
export function doneHeld(data: PatchData, doc: TreeDoc, n = 100, seed = 1): Record<number, number> {
  const aims = aimsOf(doc), out: Record<number, number> = {};
  runTree(data, doc, { n, seed, price, onPerson: (p) => {
    if (p.end !== "done" || !p.why) return;
    const item = p.why.item, k = aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).length;
    out[k] = (out[k] ?? 0) + 1;
    if (process.env.DONE_MISS && k < aims.length) console.log(`  足りない完成 ${p.at}: 無い ${aims.filter((a) => !aimHeldOn(data, item, a, { sameText: true })).map((a) => a.modId).join(", ")} / 前 ${item.prefixes.map((m) => m.modId + m.tierName).join(", ")} / 後 ${item.suffixes.map((m) => m.modId + m.tierName).join(", ")}`);
  } });
  return out;
}
