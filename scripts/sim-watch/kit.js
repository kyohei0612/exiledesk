// kit.js — 見本の木を 1 本ずつ組み直す台本の道具 (10-29 オーナー「イ」= 1 本ずつ組み直す)。ページの中で評価し window.__kit に置く (build.mjs が木の台本の前に読む)。
// 中身は猿の口 (window.__simMonkey) を呼ぶだけ。決め方は台本ごとに書き、残った箱だけ finish の決まりで閉じる:
//   1 完成の狙いが全部そろった箱 = 完成
//   2 外れ・打った後・外れが消えた の箱 = 親と同じ手 (同じ形なら S-51 で親へ戻る = 再挑戦)。戻らず新しい段になった時は 1 つ戻して 3 へ
//   3 それでも行き先の無い箱 = 失敗 (狙いが消えた・素材の買い直しの道は無い、sim-decisions)
(() => {
  const M = window.__simMonkey;
  const sm = (m) => (m.side === "prefix" ? "P:" : "S:") + m.modId.replace(/^[A-Za-z_]+\//, "") + (m.fractured ? "✦" : "");
  const log = [];
  const box = (id) => M.dump().boxes[id];
  const mods = (id) => M.boxItem(id)?.item.mods ?? [];
  const has = (id, modId) => mods(id).some((m) => m.modId.endsWith(modId));
  const kids = (id) => (box(id)?.outs ?? []).map((o) => box(o)).filter(Boolean);
  const say = (id) => { const b = box(id); return b ? `${id}[${b.out}${b.aim ? " ◎" + b.aim.modId.replace(/^[A-Za-z_]+\//, "") : ""}${b.junkKey ? " " + b.junkKey : ""}] ${mods(id).map(sm).join(", ")}` : `${id}(無い)`; };
  /** 手を打つ。返すのは結果の箱 (手の箱の outs) */
  function add(at, key, omens = [], opt = {}) {
    let r = M.add(at, key, omens, opt);
    // 「今は意味なし」のお告げ (その形ではお告げが無くても同じ結果) は外して打つ。画面でも掛けられない (omenBlock)
    if (!r.ok && omens.length) {
      const ok = new Set(M.omens(at, key).filter((o) => o.ok).map((o) => o.key)), keep = omens.filter((o) => ok.has(o));
      if (keep.length < omens.length) { log.push(`  (${at}: ${omens.filter((o) => !ok.has(o)).join("+")} は今は意味なし、外して打つ)`); omens = keep; r = M.add(at, key, omens, opt); }
    }
    if (!r.ok) { log.push(`✗ ${at} ${key}${omens.length ? "+" + omens.join("+") : ""}: ${r.problem}`); return []; }
    const outs = kids(r.at ?? at);
    log.push(`${at} ⇒ ${key}${omens.length ? "+" + omens.join("+") : ""}${opt.hitAims ? " ☑" + (opt.hitAims.length ? opt.hitAims.map((x) => x.replace(/^[A-Za-z_]+\//, "")).join("/") : "無し") : ""}${r.at && r.at !== at ? ` (手の箱 ${r.at})` : ""} → ${outs.map((b) => say(b.id) + (b.back ? " ↩" + b.back : "")).join(" | ")}`);
    return outs.map((b) => b.id);
  }
  /** 結果の箱から条件で 1 つ */
  const pick = (ids, f) => ids.find((id) => f(box(id), mods(id)));
  const goalsHeld = (id) => { const g = M.dump().memoAims ?? []; return g.length > 0 && g.every((a) => has(id, a.modId)); };
  const unset = () => Object.values(M.dump().boxes).filter((b) => b.id !== "start" && !b.hand && !b.back && !b.done && b.out !== "pass");
  async function finish(maxRounds = 6) {
    // K.noAgain = true の木は「もう一度」(戻らない同じ手で新しい段) をせず、戻らなければ失敗 (付きにくい箱を増やさない。オーナーの木)
    const { useTree } = await import("/src/views/simulator/tree/use-tree.ts");
    const t = useTree();
    for (let round = 0; round < maxRounds; round++) {
      const list = unset();
      if (!list.length) break;
      for (const b of list) {
        const cur = box(b.id);
        if (!cur || cur.hand || cur.back || cur.done) continue;
        if ((cur.out === "hit" || cur.out === "any" || cur.out === "junkGone") && goalsHeld(cur.id)) { M.setDone(cur.id, true); log.push(`完成 ${say(cur.id)}`); continue; }
        const p = cur.parent ? box(cur.parent) : null;
        if (p?.hand && ["junk", "any", "junkGone"].includes(cur.out) && !p.hand.keep && !p.hand.veil && !p.hand.quality) {
          const before = Object.keys(M.dump().boxes).length;
          const kidsOf = (x) => (x.outs ?? []).map((o) => M.dump().boxes[o]).filter(Boolean);
          const o = { hitAims: p.hand.free ? [] : kidsOf(p).filter((k) => k.out === "hit" && k.aim).map((k) => k.aim.modId), ...(p.hand.repeat ? { spam: true, spamMax: p.hand.repeat.max } : {}) };
          const r = M.add(cur.id, p.hand.currency, p.hand.omens ?? [], o);
          const now = box(cur.id);
          if (r.ok && now?.back) { log.push(`再挑戦 ${say(cur.id)} ↩${now.back}`); continue; }
          // 戻らず新しい段になった: 同じ手が上に 2 回までなら残す (その下は次の回で決める)。それより深い繰り返しは戻して失敗
          let same = 0;
          for (let a = box(cur.id)?.parent; a; a = box(a)?.parent) { const ah = box(a)?.hand; if (ah && ah.currency === p.hand.currency && (ah.omens ?? []).join() === (p.hand.omens ?? []).join()) same++; }
          if (r.ok && now?.hand && same <= 2 && !window.__kit.noAgain) { log.push(`もう一度 ${say(cur.id)} ⇒ ${p.hand.currency} → ${kids(cur.id).map((k) => say(k.id) + (k.back ? " ↩" + k.back : "")).join(" | ")}`); continue; }
          if (r.ok && Object.keys(M.dump().boxes).length !== before) t.undo();
        }
        M.setDone(cur.id, "fail");
        log.push(`失敗 ${say(cur.id)}`);
      }
    }
  }
  /** 精査・100 人回す・URL */
  async function report(n = 100) {
    const chk = await M.check();
    const res = await M.result(n, 1);
    const { treeShareUrl } = await import("/src/views/simulator/recipe-share.ts");
    const d = M.dump(); delete d.startRarity;
    const run = M.run(n, 1);
    const code = (await treeShareUrl({ name: "sample", tree: d })).replace(/^.*recipe=/, "");
    return { boxes: Object.keys(d.boxes).length, passed: chk.passed, issues: chk.issues.map((x) => `${x.boxId} ${x.kind}: ${x.text}`.slice(0, 240)), finished: res.finished, n: res.n, stuck: res.stuck, stuckAt: res.stuckAt, failed: res.failed, failAt: res.failAt, capped: res.capped, loopAt: run.loopAt, stuckWhy: run.stuckWhy, unset: unset().map((b) => b.id), code };
  }
  /** 木の中身 (読める形) */
  function tree() {
    const d = M.dump(), lines = [];
    const walk = (id, ind) => { const b = d.boxes[id]; if (!b) return; const h = b.hand; lines.push(ind + say(id) + (h ? ` ⇒ ${h.currency}${h.omens?.length ? "+" + h.omens.join("+") : ""}${h.free ? " 狙い無し" : ""}${h.quality ? " q" + h.quality : ""}${h.repeat ? " 当たるまで" : ""}${h.keep ? " 残す" + h.keep.map((k) => k.modId.replace(/^[A-Za-z_]+\//, "")).join("/") : ""}` : "") + (b.back ? ` ↩${b.back}${b.merged ? "(まとめ)" : b.autoBack ? "(自動)" : ""}` : "") + (b.done ? ` done=${b.done}` : "")); for (const o of b.outs ?? []) walk(o, ind + "  "); };
    walk("start", "");
    return lines;
  }
  window.__kit = { M, log, box, mods, has, kids, say, add, pick, goalsHeld, unset, finish, report, tree };
  return 1;
})()
