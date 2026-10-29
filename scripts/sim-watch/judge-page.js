// judge-page.js — 決まりの見張り (judge.mjs) がページの中で評価する所。window.__judge に置く。
// ここは事実を集めるだけ (木の形・箱ごとの見本 4 つの MOD・描いた箱の位置・回した時の止まり)。決まりの判定は Node の側 (judge-rules.mjs) で、
// 画面の判定 (tree-judge の contentOf・shapeOf) は呼ばない = 判定が間違っていても見張りが一緒に間違えない (doc.mjs と同じ考え、todo の B)。
// 見本は画面と同じ sampleOf (S-74、箱に描いている物 = S-60 の比べの元)。grow は猿の口で手を乱暴に足す (モンキーの形、R-18)。
(() => {
  const M = window.__simMonkey;
  const modOf = (m) => ({ side: m.side, modId: m.modId, tier: m.tierName ?? null, fractured: !!m.fractured, desecrated: !!m.desecrated, unrevealed: !!m.unrevealed });
  /** 木と、箱ごとの見本 1〜4 (作れない見本は null) と描いた箱の位置 */
  async function facts(seeds = 4) {
    const { sampleOf } = await import("/src/services/simulator/tree/tree-sample.ts");
    const { craftStage } = await import("/src/state/craft-stage.ts");
    const data = craftStage.data.value, d = M.dump();
    const { useTree } = await import("/src/views/simulator/tree/use-tree.ts");
    const doc = useTree().doc.value;
    const samples = {};
    for (const id of Object.keys(doc.boxes)) {
      samples[id] = [];
      for (let k = 1; k <= seeds; k++) {
        let s = null;
        try { s = sampleOf(data, doc, id, k); } catch { s = null; }
        samples[id].push(!s || s.note === "none" || String(s.note ?? "").startsWith("cant:") ? null : { rarity: s.item.rarity, mods: [...s.item.prefixes, ...s.item.suffixes].map(modOf) });
      }
    }
    // 描いた箱 (まとめて描かない箱 S-66 は無い)。位置は木の座標 (x, y) と箱の大きさ
    const pos = {};
    for (const e of document.querySelectorAll("[data-tree-box]")) { const id = e.getAttribute("data-box-id"), b = d.boxes[id]; if (b) pos[id] = { x: b.x, y: b.y, w: e.offsetWidth, h: e.offsetHeight }; }
    delete d.startRarity;
    return { doc: d, samples, pos };
  }
  /** 回した時の止まり (画面と同じ tree-run を種 1 で)。行き先へ移ろうとして箱が無い (noBox) を数える */
  function stops(n = 30) {
    const r = M.run(n, 1);
    return r ? { n: r.n, finished: r.finished, stuck: r.stuck, stuckWhy: r.stuckWhy } : null;
  }
  /** 種つきの乱数 (mulberry32) */
  const rand = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // 乱暴に足す時に好んで選ぶ手 (S-160 の表で枝の分かれが多い物)。ほかの手も 1 つ分の重みで選ぶ
  const LIKE = { chaos: 4, annul: 4, exalt: 3, regal: 2, augment: 2, transmute: 2, fracture: 1 };
  /** 手の無い箱に n 回手を足す (猿の口の add)。返すのは打った記録 (種と並びで同じ木が出る) */
  function grow(n = 6, seed = 1) {
    const r = rand(seed), one = (xs) => xs[Math.floor(r() * xs.length)], log = [];
    for (let i = 0; i < n; i++) {
      // 台本で組んだ木は箱が全部決まっている (↩・完成・失敗) ので、手の無い箱を 1 つ選び、決めを外してから足す (人が ↩ を × で外して ＋ を押すのと同じ)
      const d = M.dump(), cand = Object.values(d.boxes).filter((b) => b.id !== "start" && !b.hand && !b.split && b.out !== "pass" && !(b.merged && b.back));
      if (!cand.length) { log.push("足せる箱が無い"); break; }
      const pick = one(cand);
      if (pick.back) M.setBack(pick.id, null);
      if (pick.done) M.setDone(pick.id, false);
      const open = M.addable().filter((b) => !b.needAim && b.id === pick.id);
      if (!open.length) { log.push(`${pick.id}: 決めを外しても足せない`); continue; }
      const at = pick.id;
      const shelf = M.shelf(at).filter((x) => x.ok);
      if (!shelf.length) { log.push(`${at}: 棚が空`); continue; }
      const bag = shelf.flatMap((x) => Array(LIKE[x.key] ?? (x.key.startsWith("essence") ? 2 : 1)).fill(x.key));
      const key = one(bag);
      const okOmens = M.omens(at, key).filter((o) => o.ok).map((o) => o.key);
      const omens = okOmens.length && r() < 0.4 ? [one(okOmens)] : [];
      const opt = {};
      const hc = M.hitChoices(at, key, omens);
      if (hc.length) opt.hitAims = r() < 0.3 ? [] : hc.filter(() => r() < 0.6).map((h) => h.modId);
      if (opt.hitAims && hc.length && !opt.hitAims.length && r() < 0.5) opt.hitAims = [hc[0].modId];
      // 狙い無しは hitAims: [] だけでは足りず free が要る (10-30 シミュ部長 48 の気付き)
      if (opt.hitAims && !opt.hitAims.length) opt.free = true;
      if (key === "annul") {
        const goals = new Set((M.dump().memoAims ?? []).map((a) => a.modId));
        const held = (M.boxItem(at)?.item.mods ?? []).filter((m) => goals.has(m.modId) && !m.fractured);
        opt.keep = held.length && r() < 0.5 ? [{ modId: held[0].modId, tier: (M.dump().memoAims.find((a) => a.modId === held[0].modId) ?? {}).tier ?? 1 }] : [];
      }
      const res = M.add(at, key, omens, opt);
      log.push(`${at} ⇒ ${key}${omens.length ? "+" + omens.join("+") : ""}${opt.hitAims ? " ☑" + opt.hitAims.map((x) => x.replace(/^[A-Za-z_]+\//, "")).join("/") : ""}${opt.keep ? " 残す" + opt.keep.map((x) => x.modId.replace(/^[A-Za-z_]+\//, "")).join("/") : ""} → ${res.ok ? (res.boxes ?? []).map((b) => b.id + ":" + b.out).join(" ") : "✗ " + res.problem}`);
      // 当たりの箱で MOD の要る物は付きうる狙いの先頭を選ぶ (画面の MOD を選ぶ窓)
      for (const b of M.addable().filter((x) => x.needAim)) { const g = (M.dump().memoAims ?? [])[0]; if (g) M.setAim(b.id, g.modId, g.tier); }
    }
    return log;
  }
  /**
   * 見張りの照らし (judge.mjs --plant): 穴を 2 つ植えて、植えた所を返す。
   * ① 自動の ↩ を持つ外れ側の箱 1 つの ↩ を外す (人の × と同じ、付け直さない) = 中身の同じ手のある箱があるのに手も戻りも無い (J2)
   * ② 別の ↩ の箱を、中身の違う手のある箱 (スタート以外で一番深い物) へ張り替える = つながった箱の中身が違う (J1)
   */
  function plant() {
    const d = M.dump(), B = Object.values(d.boxes), out = [];
    const autos = B.filter((b) => b.autoBack && !b.merged && b.back && d.boxes[b.back] && b.out !== "hit");
    const a = autos[0];
    if (a && M.setBack(a.id, null).ok) out.push({ rule: "J2", box: a.id, what: `${a.id} の自動の ↩ ${a.back} を外した` });
    const b = autos.find((x) => x !== a);
    const to = b && B.filter((x) => x.hand && x.id !== "start" && x.id !== b.back && x.id !== b.id && !M.sameShape(b.id, x.id)).sort((x, y) => y.y - x.y)[0];
    if (b && to && M.setBack(b.id, to.id).ok) out.push({ rule: "J1", box: b.id, what: `${b.id} の ↩ ${b.back} を中身の違う ${to.id} へ張り替えた` });
    // J5 (当たりの見本) は植えない: 札を替えると見本もその札に合わせて引き直され (S-74)、下の道の見本も変わって比べから外れる (10-30 kamasan で J1・J2 も拾えなくなった)
    return out;
  }
  window.__judge = { facts, stops, grow, plant };
  return 1;
})()
