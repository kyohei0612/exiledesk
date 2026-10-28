// rebuild-tree.js — 見本の木を、同じ完成形と始まりから今の仕組み (開発版のスイッチを開いた形) で打ち直す (10-29 オーナー「見本も新ツリーにした状態で回そうか」)。
// ページの中で動かす式 (scripts/sim-watch/rebuild.mjs が開いた木で評価する)。古い木の手を上から順に猿の口 (__simMonkey.add) で打ち直し、
// 当たりの狙い・狙い無し・残したい MOD・発現・カタリストの % は古い手から取る。子の箱は 結果の種類・狙い・外れの側の鍵 で古い箱に対応させる。
// 完成・失敗の印は写す。人が選んだ戻り先・まとめる・整列は写さない (自動のつなぎ・まとめ・並べ方に任せる、S-50b・S-52b・S-140)。
// window.__rebuildOpt = { catBefore: { "<古い箱>": { key, to } } } で、その箱の手の前にカタリストの手を足す (FmNY7Wwv の完成の前の品質)
(async () => {
  const M = window.__simMonkey, opt = window.__rebuildOpt ?? {};
  const { useTree } = await import("/src/views/simulator/tree/use-tree.ts");
  const { treeShareUrl } = await import("/src/views/simulator/recipe-share.ts");
  const { runTree } = await import("/src/services/simulator/tree/tree-run.ts");
  const { craftStage } = await import("/src/state/craft-stage.ts");
  const t = useTree();
  const old = M.dump(); delete old.startRarity;
  const fresh = JSON.parse(JSON.stringify(old));
  fresh.boxes = { start: { ...old.boxes.start, hand: null, outs: [], back: null, done: null } };
  delete fresh.boxes.start.autoBack;
  t.open(fresh);
  await new Promise((r) => setTimeout(r, 300));
  const log = [], map = { start: "start" };
  const keyOf = (b) => `${b.out}|${b.aim?.modId ?? ""}|${b.junkKey ?? ""}`;
  const queue = ["start"];
  while (queue.length) {
    const oid = queue.shift(), ob = old.boxes[oid];
    let nid = map[oid];
    if (!ob?.hand || !nid) continue;
    const cb = opt.catBefore?.[oid];
    if (cb) {
      const r = M.add(nid, cb.key, [], { qualityTo: cb.to });
      log.push(`${oid}: 前にカタリスト ${cb.key} ${cb.to}% → ${r.ok ? r.boxes.map((b) => b.id).join(",") : r.problem}`);
      if (r.ok && r.boxes[0]) nid = r.boxes[0].id;
    }
    const h = ob.hand, kids = ob.outs.map((o) => old.boxes[o]).filter(Boolean);
    const hits = kids.filter((k) => k.out === "hit" && k.aim).map((k) => k.aim.modId);
    const o = { hitAims: h.free ? [] : hits, ...(h.keep ? { keep: h.keep } : {}), ...(h.veil ? { veil: h.veil } : {}), ...(h.quality ? { qualityTo: h.quality } : {}), ...(h.repeat ? { spam: true, spamMax: h.repeat.max } : {}) };
    const r = M.add(nid, h.currency, h.omens ?? [], o);
    if (!r.ok) { log.push(`${oid} (${h.currency}): 打てない ${r.problem}`); continue; }
    const at = r.at ?? nid;
    const now = M.dump().boxes;
    const outs = (now[at]?.outs ?? []).map((id) => now[id]);
    for (const k of kids) {
      const m = outs.find((x) => keyOf(x) === keyOf(k)) ?? outs.find((x) => x.out === k.out && (x.aim?.modId ?? "") === (k.aim?.modId ?? "")) ?? null;
      if (!m) { log.push(`${oid} → ${k.id} (${keyOf(k)}): 新しい木に同じ結果の箱が無い (新しい箱: ${outs.map(keyOf).join(" / ")})`); continue; }
      map[k.id] = m.id;
      if (k.done) M.setDone(m.id, k.done === "fail" ? "fail" : true);
      if (k.hand) queue.push(k.id);
    }
  }
  // 人が選んでいた戻り先 (今は選べない、S-52b) は、戻り先の箱と同じ手を足して再現する (S-51 の同じ手なら戻る = 今の画面と同じ操作)
  const optOf = (x) => { const ks = x.outs.map((o) => old.boxes[o]).filter(Boolean); return { hitAims: x.hand.free ? [] : ks.filter((k) => k.out === "hit" && k.aim).map((k) => k.aim.modId) }; };
  for (const ob of Object.values(old.boxes)) {
    if (!ob.back || ob.autoBack || ob.back === "match" || ob.back === "restart" || !map[ob.id]) continue;
    const nb = M.dump().boxes[map[ob.id]], to = old.boxes[ob.back], nto = map[ob.back];
    if (!nb || nb.hand || nb.back || nb.done || !to?.hand || !nto) continue;
    const r = M.add(nb.id, to.hand.currency, to.hand.omens ?? [], optOf(to));
    const back = M.dump().boxes[nb.id]?.back;
    log.push(back === nto ? `${ob.id} → ${ob.back}: 同じ手で戻る (${nb.id} → ${nto})` : `${ob.id} → ${ob.back}: 同じ手でも戻らない (${r.ok ? "新しい段 " + (r.boxes ?? []).map((b) => b.id).join(",") : r.problem})`);
  }
  await new Promise((r) => setTimeout(r, 300));
  const chk = await M.check();
  const d = M.dump(); delete d.startRarity;
  const run = runTree(craftStage.data.value, d, { n: 100, seed: 1, price: () => 1 });
  const url = await treeShareUrl({ name: "rebuild", tree: d });
  const unset = Object.values(d.boxes).filter((b) => b.id !== "start" && !b.hand && !b.back && !b.done).map((b) => b.id);
  return { log, boxes: Object.keys(d.boxes).length, oldBoxes: Object.keys(old.boxes).length, passed: chk.passed, notices: chk.issues.map((x) => `${x.boxId} ${x.kind}: ${x.text}`.slice(0, 260)), finished: run.finished, stuck: run.stuck, stuckAt: run.stuckAt, failed: run.failed, unset, code: url.replace(/^.*recipe=/, "") };
})()
