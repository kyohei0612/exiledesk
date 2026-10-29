/**
 * judge-rules.mjs — 木の形に頼らない決まりの見張り (todo の B、10-30 見張り部長)。judge-page.js が集めた事実 (木・見本・位置) から、
 * 設計図の決まりだけで合う / 合わないを数える。箱の中身は S-60・S-161 の一覧からここで作る (画面の tree-judge の contentOf は呼ばない)。
 *  J1 つながった箱 (↩・統合・まとめ) は同じ中身 (S-50・S-62・R-30)
 *  J2 手の無い箱でも、中身の同じ手のある箱があれば ↩ でつながる (S-50。結果 1 通りの手の親へは戻さない)
 *  J3 中身が同じで手も同じ箱は 2 つ無い (S-51「同じ手なら戻る」)
 *  J4 同じ段の、手の無い同じ中身の外れ側の箱はまとまる (S-66。削減の順位の鍵 w: が違えば別、S-65b)
 *  J5 当たりの見本は、親の見本が持っていた狙い + その箱の狙いを全部持つ (S-22b・S-24)。狙いが消えたの見本は持っていた狙いを 1 つ以上なくす
 *  J6 戻り先・行き先が空でない: ↩ の行き先の箱が木にある / 形の合う箱へ (match) は中身の同じ決めのある箱がある / 回して「行き先の箱が無い」で止まる人 0 (S-64・S-72)
 *  J7 縦の線・横線の上に別の箱が乗らない (S-142b・S-148。線は親の下の真ん中 → 子の上 24 の横線 → 子の上の真ん中)
 *  J8 狙い無しの手 (free) の結果は打った後だけ (当たりの箱を作らない、S-160・S-65)
 * どの決まりも、その箱を作った手 (親の手) の S-160 の行に数える (J3 は手の箱の行)。
 */

/** S-160 の表の行 (順は表のまま) */
export const ROWS = ["変成", "増強", "王者", "高貴", "カオス", "削減 + カオス", "消去 (全部消えてよい)", "消去 (残したい MOD)", "消去 + 光", "消去 + 側のお告げ", "エッセンス", "パーフェクトエッセンス", "カタリスト", "ルーン", "骨 (未発現のまま)", "骨 (発現させる)", "発現 (後から)", "フラクチャー (乱数)", "フラクチャー (✦ の木)"];
const SIDE_ANNUL = ["OmenofSinistralAnnulment", "OmenofDextralAnnulment"];

/** 手 → S-160 の行。分からない手は "(表に無い) <key>" */
export function rowOf(h, doc) {
  const c = String(h?.currency ?? ""), om = h?.omens ?? [];
  if (/^transmute/.test(c)) return "変成";
  if (/^augment/.test(c)) return "増強";
  if (/^regal/.test(c)) return "王者";
  if (/^exalt/.test(c)) return "高貴";
  if (/^chaos/.test(c)) return om.includes("OmenofWhittling") ? "削減 + カオス" : "カオス";
  if (c === "annul") {
    if (om.includes("OmenofLight")) return "消去 + 光";
    if (om.some((o) => SIDE_ANNUL.includes(o))) return "消去 + 側のお告げ";
    return Array.isArray(h.keep) && h.keep.length === 0 ? "消去 (全部消えてよい)" : "消去 (残したい MOD)";
  }
  if (/^essence:perfect/.test(c)) return "パーフェクトエッセンス";
  if (/^essence/.test(c)) return "エッセンス";
  if (/catalyst_/.test(c)) return "カタリスト";
  if (/^rune:/.test(c)) return "ルーン";
  if (c === "reveal" || /^reveal/.test(c)) return "発現 (後から)";
  if (h?.veil === "keep") return "骨 (未発現のまま)";
  if (h?.veil === "pick" || /bone|desecrat/i.test(c)) return "骨 (発現させる)";
  if (c === "fracture") return (doc.memoAims ?? []).some((a) => a.fractured) ? "フラクチャー (✦ の木)" : "フラクチャー (乱数)";
  return `(表に無い) ${c}`;
}

const tierNo = (t) => { const m = /(\d+)/.exec(String(t ?? "")); return m ? Number(m[1]) : null; };
const short = (id) => String(id).replace(/^[A-Za-z_]+\//, "");

export function judgeTree(f, { key, row: rowHook } = {}) {
  const { doc, samples, pos } = f, B = doc.boxes;
  const goals = new Map((doc.memoAims ?? []).map((a) => [a.modId, a]));
  // 段は完成形の段以上なら狙い (S-60・S-161)。段の数が読めない MOD は狙いの側に倒す
  const aimTier = (m) => { const g = goals.get(m.modId); if (!g) return false; const n = tierNo(m.tier); return n === null || !g.tier || n <= g.tier; };
  const present = (s) => new Set(s.mods.filter((m) => !m.fractured && aimTier(m)).map((m) => m.modId));
  const frGoals = (s) => s.mods.filter((m) => m.fractured && goals.has(m.modId)).map((m) => m.modId);

  /** 見本 k の ☑ の印 (S-60 の書き: 当たりの箱でその札の MOD・消えたら外れる・残したい MOD の消去の後はその MOD だけ・全部消えてよい消去の後は全部外れ・✦ は狙いのまま) */
  const heldMemo = new Map();
  function heldOf(id, k) {
    const mk = `${id}#${k}`;
    if (heldMemo.has(mk)) return heldMemo.get(mk);
    heldMemo.set(mk, null);
    const b = B[id], s = samples[id]?.[k] ?? null;
    let out = null;
    if (b && s) {
      const pr = present(s);
      let base;
      if (id === "start" || !b.parent || !B[b.parent]) base = new Set(pr);
      else {
        const p = heldOf(b.parent, k) ?? heldOf(b.parent, 0) ?? new Set();
        const ph = B[b.parent].hand;
        if (ph?.currency === "annul" && Array.isArray(ph.keep)) base = new Set(ph.keep.length ? [...p].filter((x) => ph.keep.some((a) => a.modId === x)) : []);
        else base = new Set(p);
        if (b.aim?.modId) base.add(b.aim.modId);
        for (const a of b.anyOf ?? []) base.add(a.modId);
      }
      out = new Set([...[...base].filter((x) => pr.has(x)), ...frGoals(s)]);
    }
    heldMemo.set(mk, out);
    return out;
  }
  /** 見本 k の中身の鍵 (S-60・S-161: 狙いの組 # 側ごとの外れ.未発現 (光と比べる時は .冒涜の発現済み) # 側ごとの ✦ 狙い / 外れ # レアリティ) */
  function contentKey(id, k, withDes) {
    const s = samples[id]?.[k], held = heldOf(id, k);
    if (!s || !held) return null;
    const side = (sd) => {
      const ms = s.mods.filter((m) => m.side === sd);
      let j = 0, u = 0, x = 0, fg = 0, fj = 0;
      for (const m of ms) {
        if (m.fractured) { if (goals.has(m.modId)) fg++; else fj++; continue; }
        if (m.unrevealed) { u++; continue; }
        if (held.has(m.modId) && aimTier(m)) continue;
        j++; if (m.desecrated) x++;
      }
      return { body: `${j}.${u}${withDes ? "." + x : ""}`, fr: `g${fg}j${fj}` };
    };
    const p = side("prefix"), q = side("suffix");
    return `${[...held].sort().join(",")}#${p.body}|${q.body}#${p.fr}.${q.fr}#${s.rarity}`;
  }
  /** 箱の中身 (見本の鍵の組)。null = 分からない (見本が作れない)、"mixed" = 未発現の有る見本と無い見本が混ざる (S-63、比べない) */
  const setMemo = new Map();
  function contentSet(id, withDes = false) {
    const mk = `${id}#${withDes}`;
    if (setMemo.has(mk)) return setMemo.get(mk);
    const ks = (samples[id] ?? []).map((_, k) => contentKey(id, k, withDes)).filter(Boolean);
    let out = ks.length ? new Set(ks) : null;
    if (out) { const un = new Set((samples[id] ?? []).filter(Boolean).map((s) => s.mods.some((m) => m.unrevealed))); if (un.size > 1) out = "mixed"; }
    setMemo.set(mk, out);
    return out;
  }
  const light = (id) => !!B[id]?.hand?.omens?.includes("OmenofLight");
  /** a の人が b の箱と同じ中身か (b が光のお告げの手の箱なら冒涜の発現済みの数も)。分からない・混ざりは null */
  function same(a, b) {
    const w = light(b), x = contentSet(a, w), y = contentSet(b, w);
    if (!x || !y || x === "mixed" || y === "mixed") return null;
    return x.size === y.size && [...x].every((v) => y.has(v));
  }
  const show = (id) => { const x = contentSet(id); return x === "mixed" ? "mixed" : x ? [...x].map((v) => v.replace(/[A-Za-z_]+\//g, "")).join(" / ") : "(見本なし)"; };

  const out = []; // { rule, row, box, what }
  const seen = {}; // `${rule}|${row}` → 比べた数
  const rowOfBox = (id) => { const p = B[B[id]?.parent]; return p?.hand ? rowOf(p.hand, doc) : "(スタート)"; };
  const look = (rule, row) => { seen[`${rule}|${row}`] = (seen[`${rule}|${row}`] ?? 0) + 1; };
  const bad = (rule, row, box, what) => out.push({ tree: key, rule, row, box, what });
  const ids = Object.keys(B), withHand = ids.filter((id) => B[id].hand);
  const isOpen = (b) => b.out !== "start" && !b.hand && !b.back && !b.done && !b.split;
  const depth = (id) => { let n = 0; for (let b = B[id]; b?.parent && B[b.parent] && n < 999; b = B[b.parent]) n++; return n; };

  // J1 つながった箱は同じ中身
  for (const id of ids) {
    const b = B[id];
    if (!b.back || !B[b.back]) continue;
    const r = rowOfBox(id), s = same(id, b.back);
    if (s === null) continue;
    look("J1", r);
    if (!s) bad("J1", r, id, `↩ ${b.back}${b.merged ? " (まとめ)" : b.autoBack ? " (自動)" : " (人)"} なのに中身が違う: ${show(id)} ≠ ${show(b.back)}`);
  }
  // J2 手の無い箱 → 中身の同じ手のある箱
  for (const id of ids) {
    const b = B[id];
    if (!isOpen(b)) continue;
    const r = rowOfBox(id);
    const p = B[b.parent];
    const cands = withHand.filter((t) => t !== id && !(t === b.parent && (p?.outs ?? []).length === 1));
    look("J2", r);
    const hit = cands.find((t) => same(id, t) === true);
    if (hit) bad("J2", r, id, `手も戻りも無いが、中身の同じ手のある箱 ${hit} がある: ${show(id)}`);
  }
  // J3 中身も手も同じ箱が 2 つ
  const handSig = (h) => `${h.currency}|${[...(h.omens ?? [])].sort().join("+")}|${Array.isArray(h.keep) ? h.keep.map((a) => a.modId).sort().join("/") : "-"}`;
  for (let i = 0; i < withHand.length; i++) for (let j = i + 1; j < withHand.length; j++) {
    const a = withHand[i], c = withHand[j];
    if (handSig(B[a].hand) !== handSig(B[c].hand)) continue;
    const s = same(a, c), r = rowOf(B[a].hand, doc);
    if (s === null) continue;
    look("J3", r);
    if (s) bad("J3", r, `${a}・${c}`, `中身も手 (${B[a].hand.currency}) も同じ箱が 2 つ (同じ枝がもう 1 本): ${show(a)}`);
  }
  // J4 同じ段の手の無い同じ中身の外れ側の箱
  const OPEN_OUTS = ["junk", "any", "junkGone", "lost"];
  const open = ids.filter((id) => isOpen(B[id]) && OPEN_OUTS.includes(B[id].out));
  const wKey = (b) => (/(^|;)w:([^;]*)/.exec(b.junkKey ?? "") ?? [])[2] ?? "";
  for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
    const a = B[open[i]], c = B[open[j]];
    if (a.y !== c.y || wKey(a) !== wKey(c)) continue;
    const s = same(a.id, c.id), r = rowOfBox(a.id);
    if (s === null) continue;
    look("J4", r);
    if (s) bad("J4", r, `${a.id}・${c.id}`, `同じ段の手の無い箱で中身が同じなのにまとまっていない: ${show(a.id)}`);
  }
  // J5 当たりの見本は持っていた狙いを全部持つ / 狙いが消えたは 1 つ以上なくす
  for (const id of ids) {
    const b = B[id];
    if (!b.parent || !B[b.parent] || (b.out !== "hit" && b.out !== "lost")) continue;
    const r = rowOfBox(id);
    (samples[id] ?? []).forEach((s, k) => {
      const ph = heldOf(b.parent, k);
      if (!s || !ph) return;
      const pr = present(s), have = new Set([...pr, ...frGoals(s)]);
      const need = new Set([...ph].filter((x) => !frGoals(s).includes(x)));
      look("J5", r);
      if (b.out === "hit") {
        if (b.aim?.modId) need.add(b.aim.modId);
        const miss = [...need].filter((x) => !have.has(x) && !(b.anyOf ?? []).some((a) => a.modId === x));
        const anyOk = !(b.anyOf ?? []).length || b.anyOf.some((a) => have.has(a.modId));
        if (miss.length || !anyOk) bad("J5", r, id, `当たりの見本 ${k + 1} に持っていた狙いが無い: ${(miss.length ? miss : (b.anyOf ?? []).map((a) => a.modId)).map(short).join("・")}`);
      } else if (need.size && [...need].every((x) => have.has(x))) bad("J5", r, id, `狙いが消えたの見本 ${k + 1} が持っていた狙いを全部持っている: ${[...need].map(short).join("・")}`);
    });
  }
  // J6 行き先が空でない (木の中の戻り先・形の合う箱へ)。回した止まりは judge.mjs が足す
  for (const id of ids) {
    const b = B[id];
    if (!b.back) continue;
    const r = rowOfBox(id);
    look("J6", r);
    if (b.back === "restart") continue;
    if (String(b.back).startsWith("match")) { const hit = ids.some((t) => t !== id && (B[t].hand || B[t].done) && same(id, t) === true); if (!hit) bad("J6", r, id, `形の合う箱へ (${b.back}) なのに中身の同じ決めのある箱が無い: ${show(id)}`); continue; }
    if (!B[b.back]) bad("J6", r, id, `↩ の行き先 ${b.back} が木に無い`);
  }
  // J8 狙い無しの手 (free) の結果は打った後 (側ごと) だけ = 当たりの箱を作らない (S-160 の変成・増強・王者・高貴の行「狙い無しは打った後」、S-65)
  for (const id of withHand) {
    const h = B[id].hand;
    if (!h.free) continue;
    const r = rowOf(h, doc), hits = (B[id].outs ?? []).filter((o) => B[o]?.out === "hit");
    look("J8", r);
    if (hits.length) bad("J8", r, id, `狙い無しの手 (${h.currency}) なのに当たりの箱が ${hits.length} つ: ${hits.map((o) => `${o} ${short(B[o].aim?.modId ?? "")}`).join("・")}`);
  }
  // J7 線の上の箱
  for (const [id, p] of Object.entries(pos)) {
    const kids = (B[id]?.outs ?? []).filter((k) => pos[k]);
    if (!kids.length) continue;
    const ks = kids.map((k) => pos[k]), top = Math.min(...ks.map((k) => k.y)), cx = p.x + p.w / 2, bot = p.y + p.h, by = top - 24;
    const segs = [[cx, bot, cx, by], [Math.min(cx, ...ks.map((k) => k.x + k.w / 2)), by, Math.max(cx, ...ks.map((k) => k.x + k.w / 2)), by], ...ks.map((k) => [k.x + k.w / 2, by, k.x + k.w / 2, k.y])];
    const r = B[id].hand ? rowOf(B[id].hand, doc) : "(手なし)";
    look("J7", r);
    for (const [o, q] of Object.entries(pos)) {
      if (o === id || kids.includes(o)) continue;
      if (segs.some(([a, b2, c, e]) => c >= q.x && a <= q.x + q.w && e >= q.y && b2 <= q.y + q.h)) bad("J7", r, o, `${id} から子への線の上に乗っている`);
    }
  }
  const rows = new Set(withHand.map((id) => rowOf(B[id].hand, doc)));
  rowHook?.(rows);
  return { found: out, seen, rows: [...rows], boxes: ids.length, unknown: ids.filter((id) => contentSet(id) === null).length, mixed: ids.filter((id) => contentSet(id) === "mixed").length, depthMax: Math.max(...ids.map(depth)) };
}
