/**
 * recipe-pattern-run.ts — パターンの通りに打つ (recipe-sim.ts の runRecipeOnce から分けた。2026-10-16、500 行の決まり)。
 * 1 回の挑戦の状態 (cur) と手の打ち方は runRecipeOnce から受け取る
 */
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import { unrevealedOf } from "./apply-desecrate";
import { LOST_RESTART, ONCE_KINDS, type PatternKind } from "./pattern";
import { allMods, limitOf, listOf, room } from "./stage-core";
import type { StageItem, StageMod, StageSide } from "./types";
import { ESS, SIDE_OMEN, crystalSides, hits, membersOf, needOf, type CompiledStep, type RecipeRun, type RecipeSpec, type RecipeTarget } from "./recipe-defs";

/** 1 回の挑戦の書き換わる物 (アイテム・かかった費用・再生の始め・使ったベースの数・手ごとの費用の数え) */
export interface RunState { item: StageItem; cost: number; replayFrom: number; bases: number; accAt: number; accCost: number }
/** runRecipeOnce の中の物で、パターンの打ち方が使う物 */
export interface RunCtx {
  cur: RunState;
  spec: RecipeSpec;
  max: number;
  steps: RecipeRun["steps"];
  seed: number;
  runes: string[];
  fractureTs: RecipeTarget[];
  stepPresses: number[];
  stepCost: number[];
  play: (key: string, omens?: string[]) => string | null;
  reveal: (desire: RecipeTarget | null, echoes?: boolean) => string | null;
  fail: (reason: string) => RecipeRun;
  flushStep: () => void;
  annulOn: (side: StageSide) => string | null;
  junkOn: (it: StageItem, side: StageSide) => StageMod[];
  isGood: (m: StageMod) => boolean;
  meets: (it: StageItem, t: RecipeTarget) => boolean;
  unmet: (it: StageItem) => RecipeTarget | null;
  hitsNow: () => string[];
  fixedHit: () => boolean;
  grade: (base: "exalt" | "transmute" | "augment", t: RecipeTarget) => string;
  sideOf: (id: string) => StageSide;
  mod: (id: string) => NonNullable<ReturnType<RecipeSpec["data"]["mods"]["get"]>>;
  cheapestPerfectEssence: (side: StageSide) => string | null;
  magicEssenceKey: (t: RecipeTarget) => string | null;
}

/**
   * パターンの通りに打つ。1 手打って、狙いの候補が増えた (か揃った) ら当たりで次の手へ。外れたら手ごとの決まり:
   * そのまま次へ / 同じ手をもう一度 / 外れを消去してもう一度 / 最初から (ここまで = フラクチャー済みのベースを手に入れ直す)。
   * 最後の手まで来て狙いが揃っていなければ失敗
   */
  export function runPattern(c: RunCtx, pat: readonly CompiledStep[]): RecipeRun {
  const { cur, spec, max, steps, seed, runes, fractureTs, stepPresses, stepCost, play, reveal, fail, flushStep, annulOn, junkOn, isGood, meets, unmet, hitsNow, fixedHit, grade, sideOf, mod, cheapestPerfectEssence, magicEssenceKey } = c;
  const startItem = cur.item, startCost = cur.cost;
  /** 始めから付いていた MOD (手打ちの状態から始めた時だけ) */
  const startHad = new Set(spec.startItem ? allMods(spec.startItem).map((m) => m.modId) : []);
  let preRunes = new Set(runes);
  /** 消えた狙いを取り直す時の手 (元の手の番号 → 替えた手) */
  const regain = new Map<number, CompiledStep>();
  /** 前の手の後に付いていた狙い (消えた物を見つけて、その手の「MOD が消えたら」で戻る) と、最後に打った手 */
  // 固定した物も数える (自前のフラクチャーで固定した狙いが「消えた」ことにならないように)
  const metIds = (): Set<string> => new Set(allMods(cur.item).filter((m) => !m.unrevealed && spec.targets.some((t) => hits(t, m))).map((m) => m.modId));
  let prevMet = metIds();
  let lastAt = -1;
  const count = (t: RecipeTarget): number => new Set(allMods(cur.item).filter((m) => !m.unrevealed && hits(t, m)).map((m) => m.modId)).size;
  let i = 0;
  /** 反応で「この手をもう一度 (別の打ち方で)」を選んだ時の、次の 1 回だけの打ち方 */
  const againRef: { v: { i: number; s: { kind?: PatternKind; currency: string; omens: string[] } } | null } = { v: null };
  /** 反応の先に打つ物を打ち、次にすることを返す (true = ループを続ける) */
  const react = (rx: NonNullable<CompiledStep["on"]>[keyof NonNullable<CompiledStep["on"]>], at: number): string | null => {
    if (!rx) return null;
    if (rx.pre) {
      let e: string | null = null;
      if (rx.pre.kind === "essence_perfect" && !rx.pre.currency) { const k = cheapestPerfectEssence(pat[at]?.target ? sideOf(pat[at]!.target!.modId) : "prefix"); e = k ? play(k, rx.pre.omens) : "使えるパーフェクトエッセンスが無い"; }
      else e = play(rx.pre.currency, rx.pre.omens.filter((o) => o !== "OmenofAbyssalEchoes"));
      if (!e && rx.pre.kind === "desecrate" && unrevealedOf(cur.item)) e = reveal(null, false);
      if (e) return `${at + 1} 手目の反応: ${e}`;
    }
    if (rx.then === "next") i = at + 1;
    else if (rx.then === "restart") restartPattern();
    else if (rx.then === "goto" && rx.goto != null) i = rx.goto;
    else { i = at; if (rx.again) againRef.v = { i: at, s: rx.again }; }
    return null;
  };
  /** N MOD 残し消去 (既定 1): 固定以外の MOD が keep 個になるまで素の消去を打ち、to の手へ戻る */
  const resetTo = (to: number, keep = 1): string | null => {
    for (let g = 0; g < 12 && allMods(cur.item).filter((m) => !m.fractured).length > keep && steps.length < max; g++) {
      const e3 = play("annul", []);
      if (e3) return e3;
    }
    i = to;
    return null;
  };
  /** 揃った手の次 (行き先・当たった側で分ける) */
  const adv = (q: CompiledStep): void => {
    if (q.branch && q.target) {
      const hit = allMods(cur.item).find((m) => !m.unrevealed && !m.fractured && hits(q.target!, m));
      i = q.branch[hit?.side === "suffix" ? "suffix" : "prefix"];
    } else if (q.next != null) i = q.next;
    else i++;
  };
  /** この周で通った手 (付けた手を探す。道で分かれる時、並びの前の手ではなく本当に通った手。2026-10-10 MazBro の指輪: プレの道で消えた最大マナ量をサフィの道の手で取り直していた) */
  let trail: number[] = [];
  const restartPattern = (): void => { cur.cost += startCost; cur.bases++; cur.item = startItem; i = 0; cur.replayFrom = steps.length; preRunes = new Set(runes); regain.clear(); prevMet = metIds(); trail = []; };
  /** もう一度打てる手 (レアに打てる物。変成・増強・王者・錬金はレアリティが変わるので戻れない) */
  const REDO = new Set<PatternKind>(["exalt", "chaos", "desecrate", "essence_perfect"]);
  while (steps.length < max) {
    // 手ごとの費用: 前の周の分をその手に足し、この周の始まりを覚える
    flushStep(); cur.accAt = i; cur.accCost = cur.cost;
    if (fractureTs.length && !fixedHit()) return fail("固定した MOD が消えた");
    // 打った手で消えた MOD に、その手の「MOD が消えたら」があればそこへ戻る (無ければ下の、付けた手に戻る)
    {
      const now = metIds();
      const gone = [...prevMet].filter((id) => !now.has(id));
      prevMet = now;
      let goto = lastAt >= 0 ? gone.map((id) => pat[lastAt]?.lostGoto?.[id]).find((g) => g != null) : undefined;
      // 「残り」の手で候補が消えた: まだ付いていればこの手を続ける、全部消えたら元の手 (カオスなど) へ
      const rq = lastAt >= 0 ? pat[lastAt] : undefined;
      if (goto == null && rq?.restFrom != null && rq.target && gone.length && gone.every((id) => membersOf(rq.target!).some((a) => a.modId === id))) goto = count(rq.target) > 0 ? lastAt : rq.restFrom;
      // 決めていなければ、マジックの手 (変成・増強・王者・錬金・エッセンス) で付けた物は打ち直せないので新しいベースで最初から
      // (2026-10-07 靴で試すと、レアで移動スピードが消えても画面は「2 手目 (増強) に戻る」、計算は戻らず最後に失敗していた)
      // まだマジックで、消えた物がこの増強の手の狙い (候補) なら、この手をもう一度 (増強で 2 つ狙う時、普通の消去で当たった方が消えた。
      // 2026-10-07 前は新しいベースからで、指輪のライフ + 火耐性でベースを 10 個使っていた。オーナー「最初増強で 2 MOD 狙うやり方も作れる道」)
      if (goto == null && lastAt >= 0 && cur.item.rarity === "magic" && pat[lastAt]?.kind === "augment" && pat[lastAt]!.target && gone.length && gone.every((id) => membersOf(pat[lastAt]!.target!).some((a) => a.modId === id))) goto = lastAt;
      // 付けた手 = その MOD を狙った一番後ろの手 (画面の placedAt と同じ。2026-10-08 レビュー C2: 前は一番前の手を見ていて、変成 → 高貴で取り直した物でも新しいベースにしていた)
      const placedAt = (id: string): number => {
        // 道のある (打って作る) パターンは通った手から。無ければ並びの前の手から
        if (pat.some((q) => q.branch || q.next != null)) { for (let t = trail.length - 1; t >= 0; t--) { const k = trail[t]!; if (k === lastAt) continue; const q = pat[k]!; if (q.target && membersOf(q.target).some((a) => a.modId === id)) return k; } return -1; }
        for (let k = lastAt - 1; k >= 0; k--) { const q = pat[k]!; if (q.target && membersOf(q.target).some((a) => a.modId === id)) return k; } return -1;
      };
      // 始めから付いていた狙い (手打ちの状態から) は、どの手も付けていない: 消えたらこの状態を買い直して最初から (2026-10-08 完成判定 1:
      // 戻り先が決まらず取り直さないまま最後で失敗、97% が止まっていた)
      if (goto == null && lastAt >= 0 && startHad.size && gone.some((id) => startHad.has(id) && placedAt(id) < 0)) goto = LOST_RESTART;
      if (goto == null && lastAt >= 0 && gone.some((id) => { const j = placedAt(id); return j >= 0 && ONCE_KINDS.has(pat[j]!.kind); })) goto = LOST_RESTART;
      // 「そのまま次へ」の高貴・カオス・骨などで付けた物が消えたら、その手へ戻ってもう一度 (画面の既定「N 手目に戻る」と同じ。
      // 2026-10-08 レビュー N2: lost の引き戻しを「そのまま次へ」で止めたので、ここで戻さないと取り直さず最後まで行って失敗していた)
      // 2 つ以上消えたら一番前の手へ (2026-10-10 MazBro の指輪: 消去で最大マナ% とカオスで付けたサフィが続けて消えると、エッセンスの手に戻ってカオスに戻らず、最後で揃わずに作り直していた)
      if (goto == null && lastAt >= 0) { for (const id of gone) { const j = placedAt(id); if (j >= 0 && REDO.has(pat[j]!.kind) && (goto == null || j < goto)) goto = j; } }
      lastAt = -1;
      if (goto === LOST_RESTART) { restartPattern(); continue; }
      if (goto != null && goto !== i && goto < pat.length) { i = goto; continue; }
    }
    // 前の手で付けた狙いが消えていたら (消去・カオスで)、その手に戻る (自動の付け方と同じ「前に付けた物が消えたら、また上から」)
    // 戻れるのはもう一度打てる手だけ (変成・増強・王者・錬金はレアリティが変わるので戻れない。その時は最後まで行って揃わなければ失敗)
    // 「付かなかった → そのまま次へ」の手は戻らない (外れを諦めて進む手。後の手で同じ MOD をもう一度狙う時は maybe で繋ぐ。2026-10-08 レビュー B1:
    // 前は onMiss を見ずに毎周その手へ戻していて、高貴・カオス・骨の「そのまま次へ」が実質「もう一度打つ」になっていた)
    const lost = pat.findIndex((q, j) => j < i && !q.play && q.target && REDO.has(q.kind) && q.onMiss !== "next" && !meets(cur.item, q.target));
    if (lost >= 0) {
      i = lost;
      // 消えた狙いをカオスの手で取り直すと、付いている他の狙いもランダムに消してしまう (2026-10-07 手袋の比べで 9 割が止まった)。
      // 取り直しは完全高貴 + その側のお告げ (外れは普通の消去) に替える。オーナー「完全高貴スパム、削減は消える可能性があるので使わない」
      const q = pat[lost]!;
      if (q.kind === "chaos" && q.target && !regain.has(lost)) {
        regain.set(lost, { kind: "exalt", currency: spec.itemLevel >= CURRENCY_FLOOR.exalt.perfect ? "exalt_perfect" : grade("exalt", q.target), omens: [SIDE_OMEN.exalt[sideOf(q.target.modId)]], target: q.target, onMiss: "annul_redo", miss: { kind: "annul", currency: "annul", omens: [] } });
      }
    }
    if (i >= pat.length) {
      cur.accAt = -1;
      if (!unmet(cur.item)) return { done: true, cost: cur.cost, steps, seed, replayFrom: cur.replayFrom, bases: cur.bases, hits: hitsNow(), stepPresses, stepCost };
      // 最後まで来て揃っていなければ、新しいベース (手打ちの状態ならその状態) で最初から。実際のクラフトと同じく、1 個できるまで続ける
      // (2026-10-08 完成判定 2: 前は「止まった」で終わり、完成 4% に全員の出費が乗って 1 個あたりが 10 倍に膨らんでいた)。
      // 1 手も進まない組み方で回り続けないよう、作り直しは手の上限の中だけ
      restartPattern();
      continue;
    }
    let p = regain.get(i) ?? pat[i]!;
    // 前に通った手へ戻ったら、そこから先は通っていない事にする (カオスへ戻った後、カオスで消えた最大マナ% を後の手のエッセンスで取り直しに行っていた)
    { const at = trail.lastIndexOf(i); if (at >= 0) trail = trail.slice(0, at + 1); else trail.push(i); }
    lastAt = i;
    // 自前のフラクチャー: 狙いが固定されていれば次へ。打って違う MOD が固定されたら外れ (既定は新しいベースで最初から)
    if (p.kind === "fracture") {
      const fixedNow = (): StageMod | undefined => allMods(cur.item).find((m) => m.fractured);
      const ok = (): boolean => { const f = fixedNow(); return !!f && !!p.target && hits(p.target, f); };
      if (!ok()) {
        if (!fixedNow()) {
          stepPresses[i] = (stepPresses[i] ?? 0) + 1;
          const e = play(p.currency || "fracture");
          if (e) return fail(`${i + 1} 手目: ${e}`);
        }
        if (!ok()) {
          if (p.onMiss === "next") { i++; continue; }
          restartPattern();
          continue;
        }
      }
      i++;
      continue;
    }
    // 偉大の手 (候補のどれか 2 つ) は、もう 2 つ付いていれば次へ。1 つ付いている時は偉大を外して残りの 1 つだけ狙う (2 つ足すと外れが 1 つ増える)
    const two = !!p.target && needOf(p.target) >= 2;
    if (two && meets(cur.item, p.target!)) { adv(p); continue; }
    // 狙いがもう付いている手は打たない (消えた物の手に戻った後、続く手の狙いが残っていればそのまま次へ。
    // 2026-10-07 パターンで試すと、付いている MOD の手もまた打っていた)
    if (!two && p.target && p.kind !== "rune" && meets(cur.item, p.target)) { adv(p); continue; }
    // 残りが 1 つだけの時に偉大を外す (「残り」の手で 3 つ揃える時、1 つしか付いていなければ偉大で 2 つ足す。2026-10-08: 前は 1 つ付いていれば
    // 必ず偉大を外していて、残り 2 つを 1 つずつ打っていた)
    if (two && needOf(p.target!) - count(p.target!) === 1 && p.omens.includes("OmenofGreaterExaltation")) p = { ...p, ...(p.single ? { currency: p.single.currency, omens: [...p.single.omens] } : { omens: p.omens.filter((o) => o !== "OmenofGreaterExaltation") }) };
    const ag = againRef.v;
    if (ag && ag.i === i) { p = { ...p, ...(ag.s.kind ? { kind: ag.s.kind } : {}), currency: ag.s.currency, omens: [...ag.s.omens] }; againRef.v = null; }
    const before = p.target ? count(p.target) : 0;
    /** 打つ前に付いていた MOD (ハズレがどちらの側に付いたかを見る) */
    const had = new Set(allMods(cur.item));
    let e: string | null = null;
    // 始めから差さっているルーン (固定する MOD に要る物) の手は打たずに次へ
    if (p.kind === "rune" && p.rune && preRunes.has(p.rune)) { preRunes.delete(p.rune); i++; continue; }
    // もう差さっているルーンは差し直さない (消えた物の手に戻った後。2026-10-07 戻るたびにアストリッドを買い直していた)
    if (p.kind === "rune" && p.rune && (cur.item.augments ?? []).some((x) => x.key === `rune:${p.rune}`)) { i++; continue; }
    if (p.kind === "rune") e = p.rune ? play(`rune:${p.rune}`) : "ルーンが選ばれていない";
    else if (p.kind === "essence_perfect" && p.target && allMods(cur.item).some((m) => !m.fractured && !isGood(m) && m.family === mod(p.target!.modId).family)) {
      // 狙いと同じ系統の外れ (埋めの高貴で付いた低い段など) があるとパーフェクトエッセンスが打てないので、先にその側を消す
      // (2026-10-07 パターンで試すと、どのパターンも 2% ほどが「同じ系統の MOD が付いている」で止まっていた)
      e = annulOn(sideOf(p.target.modId));
      if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
      continue;
    } else if (p.kind === "essence_perfect" && p.target && !(["prefix", "suffix"] as StageSide[]).filter((x) => crystalSides(p.omens).includes(x)).some((x) => junkOn(cur.item, x).length) && crystalSides(p.omens).some((x) => room(cur.item, x))) {
      // パーフェクトエッセンスは (結晶化の側の) MOD を 1 つ消してから付く。外れが無いと付けた当たりが消える (ソウルコアとクリティカルが消し合って回り続けた。
      // 2026-10-07)。先に高貴でその側に外れを 1 つ足す
      e = play("exalt", [SIDE_OMEN.exalt[crystalSides(p.omens).find((x) => room(cur.item, x))!]]);
      if (e) return fail(`${i + 1} 手目の前の高貴: ${e}`);
      continue;
    } else if (p.kind === "essence" || p.kind === "essence_perfect") {
      // セットのエッセンス (1 個ずつ選んだ物)。古いパターン (エッセンスが空) は付ける物から引く
      const key = p.currency || (p.target ? (p.kind === "essence" ? magicEssenceKey(p.target) : `essence:perfect:${p.target.modId}`) : null);
      e = key && ESS[key] ? play(key, p.omens) : "このエッセンスが無い";
    } else {
      // 高貴・冒涜は狙いの側に空きが無ければ、先にその側の外れを消す (戻った手で、外れが残ったまま埋まっていることがある)
      const ts = p.target ? sideOf(p.target.modId) : null;
      // 両側の狙い (プレかサフィのどれか) の高貴: どの側にも空きが無ければ、外れのある側を消してから打つ (外れが多い側を先に)。
      // 片側に空きがあれば、そのまま打つ (空いている側にしか付かない)。2026-10-09 オーナー「どれか 1 つで次へ、高貴でも同じようにルートにならん？」
      const anySides = p.target ? [...new Set(membersOf(p.target).map((a) => sideOf(a.modId)))] : [];
      if (p.kind === "exalt" && anySides.length > 1 && !anySides.some((x) => room(cur.item, x))) {
        const sd = [...anySides].sort((a, b) => junkOn(cur.item, b).length - junkOn(cur.item, a).length).find((x) => junkOn(cur.item, x).length);
        if (sd) {
          e = annulOn(sd);
          if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
          continue;
        }
      }
      // 状況「打つ前に狙いの側がハズレで埋まっている」の反応 (選んだ時だけ。下の組み込みの消去より先)
      if (p.on?.pre_full && ts && !room(cur.item, ts) && junkOn(cur.item, ts).length) {
        const at = i;
        const err = react({ ...p.on.pre_full, then: p.on.pre_full.then === "repeat" ? "repeat" : p.on.pre_full.then }, at);
        if (err) return fail(err);
        continue;
      }
      // 偉大 (2 つ狙い) は、その側に 2 枠空くまで外れを消してから打つ (空きが 1 つだと偉大でも 1 つしか付かない。狙いはまだ付いていないので消去で失う物が無い。
      // 2026-10-07 手順を追うと、外れが残ったまま偉大を打っていた)
      const free = ts ? limitOf(cur.item, ts) - listOf(cur.item, ts).length : 0;
      // 狙いがまだ 1 つも付いていない時は外れを全部消す (2 枠空いていても外れを残すと、偉大で 2 つ当たった時にその側が満杯になり、
      // 次の手 (骨など) の前の消去で当たりを巻き込んでいた。2026-10-07 オーナー「パターン 2 計算合ってる？」)
      if (p.kind === "exalt" && two && p.omens.includes("OmenofGreaterExaltation") && ts && (free < 2 || count(p.target!) === 0) && junkOn(cur.item, ts).length) {
        e = annulOn(ts);
        if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
        continue;
      }
      // 増強も同じ (変成の外れが狙いの側に付いた時、そのまま増強すると反対の側にしか付かない。2026-10-07 オーナー「付かなかったら消去で増強やん、1 手目から」)
      if ((p.kind === "exalt" || p.kind === "desecrate" || (p.kind === "augment" && membersOf(p.target!).length === 1)) && anySides.length < 2 && ts && !room(cur.item, ts) && junkOn(cur.item, ts).length) {
        e = annulOn(ts);
        if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
        continue;
      }
      // 打つだけの高貴は埋めるための手なので、お告げの側 (無ければ両側) に空きが無ければ打たずに次へ
      // (2026-10-07 パターンで試すと、プレが満杯の時に「お告げの側に空きが無い」で止まっていた)
      if (p.kind === "exalt" && !p.target) {
        const sds: StageSide[] = p.omens.includes(SIDE_OMEN.exalt.prefix) ? ["prefix"] : p.omens.includes(SIDE_OMEN.exalt.suffix) ? ["suffix"] : ["prefix", "suffix"];
        if (!sds.some((x) => room(cur.item, x))) { i++; continue; }
      }
      // カオスで外せる物がその側 (抹消のお告げの側、無ければ両側) に無い時は、先に高貴でその側に 1 つ足す
      // (2026-10-07 左の抹消のカオスでサフィが付くとプレが空になり、次のカオスが「外せる MOD が無い」で止まっていた)
      if (p.spam && p.kind === "chaos" && allMods(cur.item).filter((m) => !m.fractured && !m.unrevealed && !isGood(m)).length > 1) {
        e = play("annul");
        if (e) return fail(`${i + 1} 手目の前の消去: ${e}`);
        continue;
      }
      if (p.kind === "chaos") {
        const sd: StageSide | null = p.omens.includes("OmenofSinistralErasure") ? "prefix" : p.omens.includes("OmenofDextralErasure") ? "suffix" : null;
        const sds: StageSide[] = sd ? [sd] : ["prefix", "suffix"];
        if (!sds.some((x) => listOf(cur.item, x).some((m) => !m.fractured))) {
          const to = sds.find((x) => room(cur.item, x));
          e = to ? play("exalt", [SIDE_OMEN.exalt[to]]) : "カオスで外せる MOD が無い";
          if (e) return fail(`${i + 1} 手目の前の高貴: ${e}`);
          continue;
        }
      }
      // アビスの反響は発現の手で使う (骨には掛けない)。セットに入っている時だけ引き直す
      const echoes = p.omens.includes("OmenofAbyssalEchoes");
      stepPresses[i] = (stepPresses[i] ?? 0) + 1;
      e = play(p.currency, p.omens.filter((o) => o !== "OmenofAbyssalEchoes"));
      // 打つだけの骨で、後ろに自前のフラクチャーの手があれば発現させない (未発現の冒涜はフラクチャーされない = 壁。2026-10-07 発現させていて当たりが 1/5 に下がっていた)
      const wall = !p.target && pat.slice(i + 1).some((q) => q.kind === "fracture");
      if (!e && p.kind === "desecrate" && unrevealedOf(cur.item) && !wall) e = reveal(p.target, echoes);
    }
    if (e) return fail(`${i + 1} 手目: ${e}`);
    // 結果の状態ごとの行動 (選んだ状態だけ。狙いの側の 当たり・ハズレ の数で決める)。打った結果がまた別の状態になれば、そこで決めた物を続ける
    // 揃った = この手の狙いが揃い、反対の側の前の手の狙いも減っていない (gNeed)
    const otherGood = (sd: StageSide): number => listOf(cur.item, sd === "prefix" ? "suffix" : "prefix").filter((m) => !m.fractured && !m.unrevealed && isGood(m)).length;
    const doneHere = (t: RecipeTarget): boolean => meets(cur.item, t) && (p.gNeed == null || otherGood(sideOf(t.modId)) >= p.gNeed);
    if (p.policy && p.target && !doneHere(p.target)) {
      const pts = membersOf(p.target).map((a) => sideOf(a.modId));
      const side = pts.every((x) => x === pts[0]) ? pts[0]! : null;
      let moved = false;
      for (let g = 0; side && g < 400 && steps.length < max; g++) {
        if (doneHere(p.target)) break;
        // 反対の側の前の手の狙いを数える決まり (キーが h-j-g) なら、その数も (固定は消えないので数えない)
        const other: StageSide = side === "prefix" ? "suffix" : "prefix";
        const withG = Object.keys(p.policy).some((k) => k.split("-").length === 3);
        const key = `${listOf(cur.item, side).filter((m) => !m.fractured && !m.unrevealed && isGood(m)).length}-${junkOn(cur.item, side).length}${withG ? `-${listOf(cur.item, other).filter((m) => !m.fractured && !m.unrevealed && isGood(m)).length}` : ""}`;
        const rx = p.policy[key];
        if (!rx) break;
        if (rx.act) {
          // 先に打つ物 (触媒など)。打てない時 (品質が上限など) は飛ばす
          for (const q of rx.pre ?? []) play(q.currency, q.omens);
          const e2 = play(rx.act.currency, rx.act.omens);
          if (e2) return fail(`${i + 1} 手目 (狙い・狙い以外 ${key} の時): ${e2}`);
          // カオスも消去も、打った後の形の行で続ける (形の表。2026-10-09)
          continue;
        }
        if (rx.then === "next") { i++; moved = true; break; }
        if (rx.then === "restart") { restartPattern(); moved = true; break; }
        if (rx.then === "reset" && rx.goto != null) { const e4 = resetTo(rx.goto, rx.keep ?? 1); if (e4) return fail(`${i + 1} 手目のリセット: ${e4}`); moved = true; break; }
        if (rx.then === "goto" && rx.goto != null) { i = rx.goto; moved = true; break; }
        break;
      }
      if (moved) continue;
      if (doneHere(p.target)) { adv(p); continue; }
    }
    if (!p.target || (two ? meets(cur.item, p.target) : count(p.target) > before || meets(cur.item, p.target))) { adv(p); continue; }
    // 状況ごとの反応 (選んだ時だけ): 一部当たり / ハズレが狙いの側・反対の側に付いた
    if (p.on) {
      const ts0 = membersOf(p.target).length && new Set(membersOf(p.target).map((a) => sideOf(a.modId))).size === 1 ? sideOf(p.target.modId) : null;
      const junkNew = allMods(cur.item).filter((m) => !had.has(m) && !isGood(m));
      const sit = count(p.target) > before ? "partial" : !ts0 ? "miss" : junkNew.some((m) => m.side === ts0) ? "miss_t" : junkNew.length ? "miss_o" : "miss";
      const rx = p.on[sit] ?? (sit === "miss_t" || sit === "miss_o" ? p.on.miss : sit === "partial" ? undefined : undefined);
      if (rx) { const err = react(rx, i); if (err) return fail(err); continue; }
    }
    // 外れ
    if (p.onMiss === "next") { i++; continue; }
    // 狙いの側に外れが付いて埋まっていたら消去してから次へ (反対の側なら残して次へ: 次の増強は必ず狙いの側に付く)
    if (p.onMiss === "annul_next") {
      const sides = [...new Set(p.target ? membersOf(p.target).map((a) => sideOf(a.modId)) : [])];
      const blocked = sides.find((sd) => !room(cur.item, sd) && junkOn(cur.item, sd).length);
      if (blocked) { e = annulOn(blocked); if (e) return fail(`${i + 1} 手目の外し: ${e}`); }
      i++;
      continue;
    }
    if (p.onMiss === "restart") { restartPattern(); continue; }
    if (p.onMiss === "reset" && p.resetTo != null) { const e4 = resetTo(p.resetTo); if (e4) return fail(`${i + 1} 手目のリセット: ${e4}`); continue; }
    // カオスの手のやり直しがカオス (同じ物・お告げ) なら、次のカオスがそのまま入れ替えになる。やり直しのカオスを別に打つと、
    // その結果を見ないまま次のカオスを打つので 2 回打って 1 回分しか判定していなかった (2026-10-07 オーナー「回る速度遅くね」「500 回の 50 神以内で付くかなと思ってた」)
    if (p.onMiss === "annul_redo" && p.kind === "chaos" && p.miss?.kind === "chaos" && p.miss.currency === p.currency && p.miss.omens.join("+") === p.omens.join("+")) continue;
    if (p.onMiss === "annul_redo" && p.miss) {
      // 外す物を手で決めた手 (消去 + お告げ / カオス + 削減 / パーフェクトエッセンス + 結晶化 / 骨 + ネクロマンシー)。打ってから同じ手をもう一度
      if (p.miss.kind === "essence_perfect") {
        // 外れの側 (結晶化の側、無ければ狙いの側) に付く一番安いパーフェクトエッセンスで上書き (計算機の「天体」と同じ)
        const sd: StageSide = p.miss.omens.some((o) => /Sinistral/.test(o)) ? "prefix" : p.miss.omens.some((o) => /Dextral/.test(o)) ? "suffix" : sideOf(p.target!.modId);
        const key = p.miss.currency || cheapestPerfectEssence(sd);
        e = key ? play(key, p.miss.omens) : "外れの側に使えるパーフェクトエッセンスが無い";
      } else if (p.miss.kind === "desecrate") {
        e = play(p.miss.currency, p.miss.omens.filter((o) => o !== "OmenofAbyssalEchoes"));
        if (!e && unrevealedOf(cur.item)) e = reveal(null, false);
      } else {
        // お告げ無しの消去は、どちらの側が消えたかで枝分かれ (PatternStep.otherGone)。反対の側が消えて、狙いの側に外れが残っていれば、もう一度消去
        // 狙いが 1 つの手だけ (2 つ狙い・候補のある手は、どちらの側が狙いか決まらない)
        const ts = p.target && membersOf(p.target).length === 1 ? sideOf(p.target.modId) : null;
        const plain = p.miss.kind === "annul" && !p.miss.omens.length;
        // 外れが反対の側に付いた (狙いの側に外れが無く空きがある) なら、消さずにもう一度打つ (反対の側を壁にする)
        const keep = plain && ts && p.otherJunk === "keep" && !junkOn(cur.item, ts).length && room(cur.item, ts);
        for (let k = 0; k < 6 && !keep; k++) {
          const otherBefore = ts ? listOf(cur.item, ts === "prefix" ? "suffix" : "prefix").length : 0;
          e = play(p.miss.currency, p.miss.omens);
          if (e || !plain || !ts || p.otherGone !== "annul") break;
          const otherGone = listOf(cur.item, ts === "prefix" ? "suffix" : "prefix").length < otherBefore;
          if (!otherGone || !junkOn(cur.item, ts).length) break;
        }
      }
      if (e) return fail(`${i + 1} 手目の外し: ${e}`);
    } else if (p.onMiss === "annul_redo") {
      // 冒涜の外れは光のお告げで冒涜の MOD を消す。ほかは外れのある側 (狙いの側を先に)
      if (p.kind === "desecrate" && allMods(cur.item).some((m) => m.desecrated && !m.unrevealed && !isGood(m))) e = play("annul", ["OmenofLight"]);
      else {
        const ts = sideOf(p.target!.modId);
        const side = junkOn(cur.item, ts).length ? ts : junkOn(cur.item, ts === "prefix" ? "suffix" : "prefix").length ? (ts === "prefix" ? "suffix" : "prefix") : null;
        const mode = side ? spec.annulSides?.[side] : undefined;
        e = !side ? null : mode === "side" ? play("annul", [SIDE_OMEN.annul[side]]) : mode === "plain" ? play("annul") : annulOn(side);
      }
      if (e) return fail(`${i + 1} 手目の消去: ${e}`);
    }
    // redo / annul_redo: 同じ手をもう一度
  }
  return fail(`手が多すぎる (${max.toLocaleString()} 手を超えた)`);
}
