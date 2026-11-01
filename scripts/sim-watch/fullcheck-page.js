// fullcheck-page.js — S-160 の表とエンジンの突き合わせのページの中の口 (window.__fc)。fullcheck.mjs が読み込む。
// 判定の見方 (木の作りに頼らず、エンジンの結果と決まりの文から出す):
//  N 箱が無い: エンジンの結果を boxOutcomeOf → outBoxOf で結んで箱が無い (S-21)
//  C 中身違い: 結んだ箱の見本のどの中身とも、着いた人の中身 (S-60) が違う
//  V 起きない枝: 手の箱の結果の箱に、着いた人のエンジンの結果が 1 つも来ない
//  S 見本: 結果の箱の見本が親から 1 手で作れない (消える数・付く数がエンジンの結果の組に無い)・見本が作れない・見本の結果が別の箱へ行く
//  M 印: 手の後の ☑ の印が S-27e・S-27d・S-28c の式と違う (消えない MOD が外れ MOD になった等)
//  K 種類: 結果の種類が S-22b・S-23・S-27・S-27d の式と違う
//  E ＝: 打った後の中身が＝なのに別の箱へ行く (S-65b「ようは＝」)
//  T 札: 箱のカードの「外れ MOD」の札と見本の ☑ の印が違う (印より先に札を引く = 手を足した直後の形)
(async () => {
  const rs = performance.getEntriesByType("resource").map((e) => e.name);
  const U = (p) => rs.filter((n) => n.includes(p) && !n.includes("?import")).at(-1) ?? p;
  const T = "/src/services/simulator/tree/";
  const [S, OC, SH, J, EN, H, UB, AIM, KP, UT, CS, LK, VL, MODEL, SHELF, TAGS] = await Promise.all([
    T + "tree-sample.ts", T + "tree-outcome.ts", T + "tree-shape.ts", T + "tree-judge.ts", "/src/services/simulator/sim-engine.ts", T + "tree-hands.ts", T + "tree-unbounded.ts", T + "tree-aim.ts", T + "tree-keep.ts",
    "/src/views/simulator/tree/use-tree.ts", "/src/state/craft-stage.ts", T + "tree-judge-link.ts", T + "tree-veil.ts", T + "tree-model.ts", "/src/state/for-share/craft-stage-shelf.ts", "/src/views/simulator/tree/tree-row-tags.ts",
  ].map((p) => import(U(p))));
  const M = window.__simMonkey, t = UT.useTree(), data = () => CS.craftStage.data.value;
  const mods = (it) => [...it.prefixes, ...it.suffixes];
  const sh = (m) => `${m.side === "prefix" ? "P" : "S"}:${m.modId.replace(/^[A-Za-z_]+\//, "")}${m.tierName ? "." + m.tierName : ""}${m.fractured ? "✦" : ""}${m.unrevealed ? "?" : ""}${m.desecrated ? "†" : ""}`;
  const show = (it) => mods(it).map(sh).join(" ");
  const sig = (it) => mods(it).map((m) => `${m.side[0]}${m.modId}.${m.tierIndex}${m.fractured ? "f" : ""}${m.unrevealed ? "u" : ""}`).sort().join("|");
  /** 打つ前後の違い: 消えた数・付いた数 (同じ MOD・同じ段は残ったとみなす) */
  function diff(a, b) {
    const left = mods(a).map((m) => `${m.side[0]}${m.modId}.${m.tierIndex}`), add = [];
    for (const m of mods(b)) { const k = `${m.side[0]}${m.modId}.${m.tierIndex}`, i = left.indexOf(k); if (i >= 0) left.splice(i, 1); else add.push(k); }
    return { r: left.length, a: add.length, removed: left };
  }
  const held = (it, g) => AIM.aimHeldOn(data(), it, g, { sameText: true });
  const goalOf = (doc, id) => (doc.memoAims ?? []).find((g) => g.modId === id) ?? { modId: id, tier: 99 };
  /** この手でこの人に起きる結果の一覧 (エンジン)。全部数えられない手は打って集める */
  function outcomesOf(doc, at, person, cap) {
    const d = data(), b = doc.boxes[at], h = b.hand, cur = h.currency;
    const fr = H.effectOf(cur) === "fracture";
    const veilPick = VL.veilPick(h);
    let list = null, how = "全部";
    if (!h.repeat && !veilPick) {
      const raw = EN.stepOutcomes(d, UB.prepFor(d, person.item, cur), cur, H.engineOmens(h));
      if (raw) list = raw.filter((o) => !o.void).map((o) => ({ p: o.p, item: o.item }));
    }
    if (list && list.length > cap) {
      // 数の多い手 (大いなる高貴): 種を決めて間引く。狙いが付く物は残す
      const aims = S.aimsOf(doc), keep = list.filter((o) => aims.some((g) => !held(person.item, g) && held(o.item, g)));
      const rest = list.filter((o) => !keep.includes(o)); let x = 12345;
      const out = [...keep.slice(0, cap / 2)];
      while (out.length < cap && rest.length) { x = (x * 1103515245 + 12345) & 0x7fffffff; out.push(rest.splice(x % rest.length, 1)[0]); }
      list = out; how = `間引き ${cap}`;
    }
    if (!list) {
      how = "打って集める";
      let x = 7; const rng = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
      const own = S.handAims(doc, at, S.aimsOf(doc)), seen = new Map();
      for (let i = 0; i < 300; i++) {
        const r = S.playHand(d, person.item, h, rng, own, undefined, false, OC.stripStop(d, doc, b));
        if (!r.applied) { if (!i) return { list: [], how: "打てない" }; continue; }
        const k = sig(r.item); if (!seen.has(k)) seen.set(k, { p: 0, item: r.item }); seen.get(k).p += 1 / 300;
      }
      list = [...seen.values()];
    }
    // ✦ の木の確定フラクチャーは ✦ の印だけ (S-42・S-43)
    if (fr && h.pick !== "random" && MODEL.fractureMarks(doc).length) {
      const marks = MODEL.fractureMarks(doc).map((a) => a.modId);
      list = list.filter((o) => { const nf = mods(o.item).find((m) => m.fractured && !mods(person.item).some((x) => x.fractured && x.modId === m.modId)); return !nf || marks.some((id) => nf.modId === id || held({ ...o.item, prefixes: nf.side === "prefix" ? [nf] : [], suffixes: nf.side === "suffix" ? [nf] : [] }, goalOf(doc, id))); });
    }
    return { list, how };
  }
  /** この手で消えうる MOD (エンジンの結果の前後から) */
  const candOf = (person, list) => { const s = new Set(); for (const o of list) for (const k of diff(person.item, o.item).removed) s.add(k.slice(1).replace(/\.\d+$/, "").replace(/\.-?\d+$/, "")); return s; };
  const onlyMod = (it, m) => ({ ...it, prefixes: m.side === "prefix" ? [m] : [], suffixes: m.side === "suffix" ? [m] : [] });
  /** 手の後の印の式 (S-27e・S-27d・S-28c)。返すのは [足りない印, 余分な印] */
  function marksRule(doc, h, person, after, list, afterAimed, nextBox) {
    const cand = candOf(person, list), strip = !!h.keep && !h.keep.length && H.effectOf(h.currency) === "remove";
    const keepIds = h.keep?.length ? h.keep.map((a) => a.modId) : null;
    const marks = MODEL.fractureMarks(doc).map((a) => a.modId), miss = [], extra = [];
    for (const id of person.aimed) {
      const g = goalOf(doc, id);
      if (!held(after, g)) continue;
      const mine = mods(person.item).filter((m) => m.modId === id || held(onlyMod(person.item, m), g));
      const isCand = mine.some((m) => !m.fractured && cand.has(m.modId));
      let want;
      if (marks.includes(id) || !isCand) want = true;
      else if (strip) want = false;
      else if (keepIds) want = keepIds.includes(id);
      else want = true;
      if (want && !afterAimed.has(id)) miss.push(id);
      if (!want && afterAimed.has(id)) extra.push(id);
    }
    if (nextBox?.out === "hit" && nextBox.aim) for (const a of MODEL.boxAims(nextBox)) if (held(after, a) && !held(person.item, a) && !afterAimed.has(a.modId)) miss.push(a.modId);
    return { miss, extra };
  }
  /** 結果の種類の式 (S-22・S-22b・S-23・S-27・S-27d)。見ない手は null */
  function kindRule(doc, b, person, after) {
    const h = b.hand, e = H.effectOf(h.currency), strip = !!h.keep && !h.keep.length && e === "remove";
    if (strip || h.omens.includes("OmenofLight") || e === "fracture" || e === "quality" || H.isRuneHand(h.currency) || VL.isRevealHand(h.currency)) return null;
    const keep = h.keep?.length ? h.keep.map((a) => (doc.memoAims ?? []).find((g) => g.modId === a.modId) ?? a) : [...person.aimed].map((id) => goalOf(doc, id)).filter((g) => !g.fractured);
    const lost = keep.some((g) => held(person.item, g) && !held(after, g));
    if (e === "remove") return lost ? "lost" : "junkGone";
    if (VL.veilKeep(h) || VL.veilPick(h)) return lost ? "lost" : null;
    if (lost) return "lost";
    if (e === "essence") return null;
    const own = b.outs.flatMap((id) => { const c = doc.boxes[id]; return c?.out === "hit" && c.aim ? MODEL.boxAims(c) : []; });
    if (own.some((a) => !held(person.item, a) && held(after, a))) return "hit";
    return h.free ? "any" : "junk";
  }
  const peopleOf = (doc, at, n) => {
    const d = data(), out = [], seen = new Set();
    for (let seed = 1; seed <= n; seed++) {
      const s = S.sampleOf(d, doc, at, seed);
      if (s.note === "none" || s.note?.startsWith("cant:")) continue;
      const aimed = J.sampleAimed(d, doc, at, seed), k = sig(s.item) + "#" + [...aimed].sort().join();
      if (seen.has(k)) continue;
      seen.add(k); out.push({ seed, item: s.item, aimed });
    }
    return out;
  };
  /** 手のある箱 at を調べる。返すのは { persons, outcomes, outs, finds } */
  function checkBox(at, seeds = 24, cap = 2500) {
    const d = data(), doc = t.doc.value, b = doc.boxes[at], h = b.hand, aims = S.aimsOf(doc), j = J.judgeMemo(d, doc);
    const people = peopleOf(doc, at, seeds), finds = new Map(), reached = new Set(), cnt = new Map();
    const parentMixed = (j.contents(at)?.size ?? 0) > 1;
    const eqBoxes = new Map(); // 打った後の中身 → 着いた箱
    // 札 (印を引く前に札を見る = 手を足した直後のカード)
    const MISS = ["junk", "lost", "junkGone", "any"];
    for (const x of [at, ...(b.outs ?? [])]) {
      const c = doc.boxes[x]; if (!c || !MISS.includes(c.out)) continue;
      const s = S.sampleOf(d, doc, x, 1); if (s.note === "none" || s.note?.startsWith("cant:")) continue;
      const tags = TAGS.boxTagsOf(d, doc, x, s.item), am = J.sampleAimed(d, doc, x, 1);
      for (const m of mods(s.item)) { if (m.fractured || m.unrevealed) continue; const miss = /外れ MOD/.test(tags.get(m.modId)?.text ?? ""); if (am.has(m.modId) && miss) add("T", `印があるのに外れ MOD ${c.out}`, { box: x, mod: m.modId, marks: [...am] }); if (!am.has(m.modId) && !miss) add("T", `印が無いのに外れ MOD でない ${c.out}`, { box: x, mod: m.modId, tag: tags.get(m.modId)?.text ?? null, marks: [...am] }); }
    }
    const add = (kind, key0, ex) => { const key = key0 + (ex?.seed > 8 && kind !== "S" ? " [9 人目以降]" : ""); const k = `${kind}|${key}`, f = finds.get(k) ?? { kind, key, n: 0, ex: [] }; f.n++; if (f.ex.length < 2) f.ex.push(ex); finds.set(k, f); };
    let outcomes = 0, how = "全部";
    const perPerson = new Map();
    for (const p of people) {
      const { list, how: w } = outcomesOf(doc, at, p, cap);
      perPerson.set(p, list); if (w !== "全部") how = w;
      const gone = list;
      for (const o of list) {
        outcomes++;
        const oc = OC.boxOutcomeOf(d, doc, b, p.item, o.item, aims, p.aimed);
        const next = SH.outBoxOf(doc, b, oc, o.item);
        const ex = () => ({ seed: p.seed, before: show(p.item), marks: [...p.aimed].map((x) => x.replace(/^[A-Za-z_]+\//, "")), after: show(o.item), oc: { out: oc.out, junkKey: oc.junkKey, hits: oc.hits?.map((a) => a.modId) }, p: +o.p.toFixed(4) });
        const want = kindRule(doc, b, p, o.item);
        if (want && (next ? doc.boxes[next].out : oc.out) !== want) add("K", `${want}→${next ? doc.boxes[next].out : oc.out}`, ex());
        if (!next) { add("N", `${oc.out}:${(oc.junkKey ?? "").replace(/g:.*/, "g")}`, ex()); continue; }
        reached.add(next); cnt.set(next, (cnt.get(next) ?? 0) + o.p);
        const af = J.nextAimed(d, doc, p.aimed, next, o.item, p.item), nb = doc.boxes[next];
        const key = J.looseKey(J.contentOf(d, doc, o.item, af)), cs = j.contents(next);
        if (!eqBoxes.has(key)) eqBoxes.set(key, new Map()); { const q = eqBoxes.get(key); if (!q.has(next)) q.set(next, ex()); }
        if (cs && !cs.has(key)) {
          const hit = j.boxesOf(o.item, af).filter((x) => x !== next).length || j.openOf(o.item, af).filter((x) => x !== next).length;
          add("C", `${parentMixed ? "親混ざり " : ""}${nb.out}:${(nb.junkKey ?? "").slice(0, 30)}${hit ? " 同じ中身の箱あり" : ""}`, { ...ex(), to: next, key, box: [...cs].slice(0, 4), sample: show(S.sampleOf(d, doc, next, 1).item) });
        }
        const r = marksRule(doc, h, p, o.item, gone, window.__plant ? new Set([...af].slice(1)) : af, nb); // __plant = 見張りが拾うかの対照 (印を 1 つ抜く)
        if (r.miss.length) add("M", `消えない・残す印が外れた ${r.miss.map((x) => x.replace(/^[A-Za-z_]+\//, "")).join()}`, { ...ex(), to: next, after印: [...af].map((x) => x.replace(/^[A-Za-z_]+\//, "")) });
        if (r.extra.length) add("M", `外れるはずの印が残った ${r.extra.map((x) => x.replace(/^[A-Za-z_]+\//, "")).join()}`, { ...ex(), to: next, after印: [...af].map((x) => x.replace(/^[A-Za-z_]+\//, "")) });
      }
    }
    if (![...perPerson.values()].some((l) => l.length)) return { cant: true, persons: people.length, outcomes: 0, outs: [], finds: [] };
    for (const [k, q] of eqBoxes) if (q.size > 1) { const ids = [...q.keys()], kinds = ids.map((x) => doc.boxes[x].out + ":" + (doc.boxes[x].junkKey ?? "").slice(0, 26)); add("E", kinds.sort().join(" ＝ ").replace(/s:[-\d|]+/g, "s:*"), { key: k, boxes: ids, ex: q.get(ids[0]) }); }
    // 起きない枝
    const pass = (x) => doc.boxes[x]?.out === "pass";
    const open = (b.outs ?? []).filter((x) => doc.boxes[x]);
    if (people.length && perPerson.size && [...perPerson.values()].some((l) => l.length)) for (const x of open) if (!reached.has(x) && !pass(x)) { const c = doc.boxes[x]; add("V", `${c.out}:${(c.junkKey ?? "").slice(0, 30)}${c.aim ? ":" + c.aim.modId.replace(/^[A-Za-z_]+\//, "") : ""}`, { box: x, sample: show(S.sampleOf(d, doc, x, 1).item), parent: show(people[0].item), people: people.length }); }
    // 見本
    for (const x of open) {
      const c = doc.boxes[x], nope = [];
      for (let seed = 1; seed <= 8; seed++) {
        const s = S.sampleOf(d, doc, x, seed);
        if (s.note === "none" || s.note?.startsWith("cant:")) { nope.push(s.note); continue; }
        if (c.out === "hit" && c.aim && H.effectOf(h.currency) !== "fracture" && !MODEL.boxAims(c).some((a) => held(s.item, a))) add("S", `当たりの見本に狙いが無い`, { box: x, seed, sample: show(s.item), aim: c.aim.modId });
        const own = people.find((p) => p.seed === seed);
        // 親の見本から 1 手か: まず同じ種の親、無ければどの親でも
        const cnt2 = (it) => [it.prefixes.length, it.suffixes.length];
        const fits = (p) => { const l = perPerson.get(p) ?? []; const [a0, b0] = cnt2(p.item), [a1, b1] = cnt2(s.item); return l.some((o) => sig(o.item) === sig(s.item)) ? "same" : l.some((o) => { const [a2, b2] = cnt2(o.item); return a2 - a0 === a1 - a0 && b2 - b0 === b1 - b0; }) ? "count" : null; };
        const any = (own && fits(own) === "same" ? own : null) ?? people.find((p) => fits(p) === "same") ?? people.find((p) => fits(p));
        const seedless = !own;
        if (!any && !seedless) {
          const pr = diff(own.item, s.item), pairs = [...new Set((perPerson.get(own) ?? []).map((o) => { const q = diff(own.item, o.item); return `-${q.r}+${q.a}`; }))];
          add("S", `1 手で作れない ${c.out}:${(c.junkKey ?? "").slice(0, 24)} 見本 -${pr.r}+${pr.a} エンジン ${pairs.join(",")}`, { box: x, seed, parent: show(own.item), sample: show(s.item) });
          continue;
        }
        if (any && any === own && fits(any) === "same") {
          const oc = OC.boxOutcomeOf(d, doc, b, any.item, s.item, aims, any.aimed), to = SH.outBoxOf(doc, b, oc, s.item);
          if (to !== x) add("S", `見本の結果が別の箱へ ${c.out}→${oc.out}`, { box: x, to, seed, parent: show(any.item), sample: show(s.item), oc: { out: oc.out, junkKey: oc.junkKey }, boxKey: c.junkKey });
          const am = J.sampleAimed(d, doc, x, seed), lst = perPerson.get(any) ?? [];
          if (own && any === own) { const r = marksRule(doc, h, any, s.item, lst, am, c); if (r.miss.length || r.extra.length) add("M", `見本の印 足りない ${r.miss.map((y) => y.replace(/^[A-Za-z_]+\//, ""))} 余分 ${r.extra.map((y) => y.replace(/^[A-Za-z_]+\//, ""))}`, { box: x, seed, before: show(any.item), marks: [...any.aimed], after: show(s.item), after印: [...am] }); }
        }
      }
      if (nope.length === 8) add("S", `見本が 8 つとも作れない ${c.out}:${(c.junkKey ?? "").slice(0, 30)}`, { box: x, note: nope[0] });
    }
    return { persons: people.length, outcomes, how, outs: open.map((x) => { const c = doc.boxes[x]; return `${x}:${c.out}:${(c.junkKey ?? "").slice(0, 24)}${c.aim ? ":" + c.aim.modId.replace(/^[A-Za-z_]+\//, "") : ""}${c.back ? "↩" + c.back : ""}`; }), finds: [...finds.values()], probs: Object.fromEntries([...cnt].map(([k, v]) => [k, +(v / (people.length || 1)).toFixed(3)])) };
  }
  /** 親を作る。spec = { goals, start, startRandom, path:[{key,omens,opt,pick}] }。返すのは親の箱 */
  async function makeParent(spec) {
    const u = M.setBase(spec.part, spec.base, spec.ilvl ?? 82);
    if (!u.ok) return { err: "base " + JSON.stringify(u) };
    const g = M.setGoal(spec.goals);
    if (!g.ok) return { err: "goal " + JSON.stringify(g) };
    const dd = JSON.parse(JSON.stringify(t.doc.value));
    dd.boxes = { start: { ...dd.boxes.start, hand: null, outs: [], back: null, done: null } };
    delete dd.boxes.start.autoBack; delete dd.orphans;
    dd.start = { ...(dd.start ?? {}), rarity: spec.start.rarity, mods: spec.start.mods };
    if (spec.startRandom) dd.startRandom = spec.startRandom; else delete dd.startRandom;
    t.open(dd);
    await new Promise((r) => setTimeout(r, 300));
    let at = "start";
    for (const st of spec.path ?? []) {
      const r = M.add(at, st.key, st.omens ?? [], st.opt ?? {});
      if (!r.ok) return { err: `道 ${st.key}: ${r.problem}` };
      const nb = r.boxes.find((x) => (!st.pick || x.out === st.pick) && (!st.has || x.mods.some((m) => m.modId.includes(st.has))) && (!st.lacks || !x.mods.some((m) => m.modId.includes(st.lacks))));
      if (!nb) return { err: `道 ${st.key}: 箱が無い ${r.boxes.map((x) => x.out)}` };
      at = nb.id;
    }
    const smp = S.sampleOf(data(), t.doc.value, at, 1);
    return { at, item: show(smp.item), rarity: smp.item.rarity, note: smp.note, people: peopleOf(t.doc.value, at, 8).map((p) => show(p.item) + " ☑" + [...p.aimed].map((x) => x.replace(/^[A-Za-z_]+\//, "")).join()) };
  }
  /** 手の組 (親の見本から候補を作る): list = [{ key, omens, variants }]。 */
  function tryHand(parentId, hand) {
    const before = Object.keys(t.doc.value.boxes).length;
    if (hand.key === "rune:*") { const k = M.shelf(parentId).find((x) => x.key.startsWith("rune:") && x.ok)?.key; if (!k) return { skip: "ルーンが打てない" }; hand = { ...hand, key: k }; }
    let opt = { ...(hand.opt ?? {}) };
    const smp = S.sampleOf(data(), t.doc.value, parentId, 1).item, aimed = J.sampleAimed(data(), t.doc.value, parentId, 1), doc0 = t.doc.value;
    const heldAims = [...aimed].filter((id) => !MODEL.fractureMarks(doc0).some((a) => a.modId === id));
    const junk = mods(smp).filter((m) => !m.fractured && !m.unrevealed && !aimed.has(m.modId));
    if (hand.stone) opt.hitAims = [hand.stoneId];
    else if (hand.hit === "one" || hand.hit === "all") {
      const ch = M.hitChoices(parentId, hand.key, hand.omens ?? [], !!opt.echo).filter((c) => !hand.aimOnly || (doc0.memoAims ?? []).some((g) => g.modId === c.modId));
      if (!ch.length) return { skip: "☑ の候補が無い" };
      opt.hitAims = hand.hit === "one" ? [ch[0].modId] : ch.map((c) => c.modId);
    } else if (hand.hit === "free") opt.hitAims = [];
    if (hand.keep === "first") { if (heldAims.length < 2) return { skip: "残す候補が 2 つ無い" }; const a = goalOf(doc0, heldAims[0]); opt.keep = [{ modId: a.modId, tier: a.tier }]; }
    if (hand.keep === "oneAim") { if (!heldAims.length) return { skip: "狙いが無い" }; const a = goalOf(doc0, heldAims[0]); opt.keep = [{ modId: a.modId, tier: a.tier }]; }
    if (hand.keep === "none") opt.keep = [];
    if (hand.keep === "junk") { if (!junk.length) return { skip: "外れが無い" }; opt.keep = [{ modId: junk[0].modId, tier: Number(/\d+/.exec(junk[0].tierName ?? "1")?.[0] ?? 1) }]; }
    const r = M.add(parentId, hand.key, hand.omens ?? [], opt);
    if (!r.ok) return { skip: r.problem ?? "打てない" };
    const nowDoc = t.doc.value, b = nowDoc.boxes[r.at ?? parentId];
    let res;
    if (!b?.hand) res = { back: nowDoc.boxes[parentId]?.back ?? "?", persons: 0, outcomes: 0, outs: [], finds: [] };
    else { const q = checkBox(b.id, hand.seeds ?? 24, hand.cap ?? 2500); res = q.cant ? { skip: "エンジンで打てない形" } : { ...q, keep: b.hand.keep, free: !!b.hand.free, hitAims: opt.hitAims?.map((x) => x.replace(/^[A-Za-z_]+\//, "")) }; }
    M.undo();
    if (Object.keys(t.doc.value.boxes).length !== before) return { ...res, undoBad: true };
    return res;
  }
  /** 開いた木 (trees.json) の手のある箱を全部見る */
  const handBoxes = () => Object.values(t.doc.value.boxes).filter((b) => b.hand && !b.hand.repeat).map((b) => ({ id: b.id, cur: b.hand.currency, omens: b.hand.omens, free: !!b.hand.free, keep: b.hand.keep, veil: b.hand.veil }));
  window.__fc = { makeParent, tryHand, checkBox, handBoxes, M, t, CATS: SHELF.CATALYSTS };
  return 1;
})()
