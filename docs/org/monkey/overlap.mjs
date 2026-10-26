// ツリーの UI の重なりを数える (モンキー隊長 8 本目、10-26 オーナー「全体的に被る、UI チェック入れたがいいかも」)
// 画面の中で動く式 OVERLAP を c.ev(OVERLAP) で呼ぶと、重なりの一覧 (かぶっている 2 つ・何 px) を返す。
// 見る物: 箱 (.vue-flow__node)・線の札 (箱の外の文)・印 (! など)・＋・浮いた窓 (完成形の設定・足りない所・メモ・倍率の道具など、固定や絶対の位置の枠)。
// 2 段で数える: 部品の枠どうし (箱と窓、札と箱、窓と窓) と、字どうし (違う部品の字、同じ部品の中の別の字)。
// 字は巻き取りの枠 (overflow) で切ってから比べる (隠れている行は数えない)。
// 木が無い画面 (スマホ幅の木) は、字どうしだけを見る (上に貼り付く帯と下の文は数えない)。
export const OVERLAP = `(() => {
  const vis = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const R = (r) => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) });
  const cut = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
  const inter = (a, b) => { const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); return w > 0 && h > 0 ? { w, h } : null; };
  const ok = (r) => r.r - r.l >= 2 && r.b - r.t >= 2;
  const VIEW = { l: 0, t: 0, r: innerWidth, b: innerHeight };
  const clipCache = new Map();
  // 祖先の巻き取り枠・画面で切った見える範囲
  const clipOf = (el) => {
    if (!el || el === document.body || el === document.documentElement) return VIEW;
    if (clipCache.has(el)) return clipCache.get(el);
    let c = clipOf(el.parentElement);
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') c = cut(c, R(el.getBoundingClientRect()));
    if (cs.position === 'fixed') c = VIEW;
    clipCache.set(el, c); return c;
  };
  const seenR = (el, rr) => cut(R(rr || el.getBoundingClientRect()), clipOf(el.parentElement));
  const short = (el) => (el.innerText || el.getAttribute('aria-label') || el.title || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
  const pinned = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e; } return null; };
  const pane = document.querySelector('.vue-flow');
  const parts = [];
  const floats = [];
  if (pane) {
    const paneR = R(pane.getBoundingClientRect());
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('.vue-flow__node, .vue-flow__edge, .vue-flow__edges, .vue-flow__edge-labels, .vue-flow__edge-label')) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (!vis(el)) continue;
      if (el.closest('.vue-flow__viewport, .vue-flow__transformationpane')) continue;
      const r = seenR(el);
      if (!ok(r) || (r.r - r.l) < 40 || (r.b - r.t) < 20) continue;
      if (!inter(r, paneR)) continue;
      if ((r.r - r.l) * (r.b - r.t) > 0.6 * (paneR.r - paneR.l) * (paneR.b - paneR.t)) continue; // 木の下地そのもの
      if (!short(el) && !el.querySelector('svg, canvas')) continue;
      if (floats.some((f) => f.el.contains(el))) continue; // 外側の窓だけ
      for (let k = floats.length - 1; k >= 0; k--) if (el.contains(floats[k].el)) floats.splice(k, 1);
      floats.push({ el, r });
    }
    document.querySelectorAll('.vue-flow__node').forEach((el, i) => { if (!vis(el)) return; const r = seenR(el); if (ok(r)) parts.push({ kind: 'box', el, r, name: '箱' + i + '「' + short(el).slice(0, 18) + '」' }); });
    const labelRoots = new Set();
    for (const el of pane.querySelectorAll('*')) {
      if (el.closest('.vue-flow__node')) continue;
      if (!vis(el)) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own && el.tagName !== 'BUTTON') continue;
      let root = el; // 文の塊の外側 (札) を取る
      while (root.parentElement && root.parentElement !== pane && !root.parentElement.matches('.vue-flow__edge-labels, .vue-flow__viewport, .vue-flow__transformationpane, .vue-flow__edges, svg') && root.parentElement.getBoundingClientRect().width < 360) root = root.parentElement;
      if (floats.some((f) => f.el.contains(root))) continue;
      labelRoots.add(root);
    }
    for (const el of labelRoots) { const r = seenR(el); if (ok(r)) parts.push({ kind: 'label', el, r, name: '札「' + short(el) + '」' }); }
    floats.forEach((f) => parts.push({ kind: 'float', el: f.el, r: f.r, name: '窓「' + (short(f.el).slice(0, 18) || 'ミニマップ') + '」' }));
  }
  const partOf = (el) => parts.find((p) => p.el === el || p.el.contains(el)) || (pane ? null : { el, name: '' });
  // 字の粒: 自分の文を持つ要素の字の範囲 (Range)、と中身の無い小さなボタン・絵
  const atoms = [];
  const scope = pane ? [pane, ...floats.map((f) => f.el)] : [document.querySelector('main') || document.body];
  for (const root of scope) for (const el of root.querySelectorAll('*')) {
    if (!vis(el)) continue;
    const p = partOf(el); if (!p) continue;
    const txt = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    const clip = clipOf(el);
    if (txt.length) {
      const rg = document.createRange(); rg.setStartBefore(txt[0]); rg.setEndAfter(txt[txt.length - 1]);
      for (const rr of rg.getClientRects()) { const r = cut(R(rr), clip); if (ok(r)) atoms.push({ el, p, r, t: txt.map((n) => n.textContent.trim()).join(' ').slice(0, 30) }); }
    } else if ((el.tagName === 'BUTTON' || el.tagName === 'IMG' || (el.tagName === 'svg' && !el.closest('button'))) && !el.querySelector('*:not(svg *):not(path)')) {
      const r = cut(R(el.getBoundingClientRect()), clip); if (ok(r)) atoms.push({ el, p, r, t: short(el) || el.tagName });
    }
  }
  const out = [];
  const seen = new Set();
  const add = (o) => { const k = o.a + '|' + o.b; if (seen.has(k)) return; seen.add(k); out.push(o); };
  // 1 段目: 部品の枠どうし (箱・札・窓)
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const x = inter(a.r, b.r); if (!x || x.w < 3 || x.h < 3) continue;
    add({ lv: '枠', a: a.name, b: b.name, w: x.w, h: x.h, at: [Math.max(a.r.l, b.r.l), Math.max(a.r.t, b.r.t)] });
  }
  // 2 段目: 字どうし (違う部品か、同じ部品の中の別の要素)
  for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
    const a = atoms[i], b = atoms[j];
    if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (!pane && pinned(a.el) !== pinned(b.el)) continue; // 貼り付く帯の下を流れる文は数えない
    const x = inter(a.r, b.r); if (!x || x.w < 2 || x.h < 2) continue;
    const pa = a.p.name ? a.p.name + ' の' : '', pb = b.p.name ? b.p.name + ' の' : '';
    add({ lv: '字', a: pa + '「' + a.t + '」', b: pb + '「' + b.t + '」', w: x.w, h: x.h, at: [Math.max(a.r.l, b.r.l), Math.max(a.r.t, b.r.t)] });
  }
  // はみ出し: 窓・札が画面の外へ
  for (const p of parts) if (p.kind !== 'box') { const r = R(p.el.getBoundingClientRect()); if (r.l < -2 || r.r > innerWidth + 2) add({ lv: 'はみ出し', a: p.name, b: '画面の横の端', w: 0, h: 0, at: [r.l, r.t] }); }
  if (!pane) for (const el of document.querySelectorAll('main *, body > div *')) { const r = el.getBoundingClientRect(); if (r.width > 4 && r.right > innerWidth + 2 && vis(el) && clipOf(el.parentElement).r >= innerWidth - 1) { add({ lv: 'はみ出し', a: '「' + short(el).slice(0, 30) + '」 ' + el.tagName, b: '画面の横の端', w: Math.round(r.right - innerWidth), h: 0, at: [Math.round(r.left), Math.round(r.top)] }); } }
  const zoom = (([...document.querySelectorAll('button, span, div')].find((e) => /^\\d+%$/.test((e.innerText || '').trim())) || {}).innerText || '').trim();
  return { tree: !!pane, zoom, n: out.length, boxes: parts.filter((p) => p.kind === 'box').length, labels: parts.filter((p) => p.kind === 'label').length, floats: floats.map((f) => short(f.el).slice(0, 24) || 'ミニマップ'), list: out };
})()`;
