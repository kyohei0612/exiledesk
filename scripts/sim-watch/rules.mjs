/**
 * rules.mjs — どの木でも必ず成り立つ決まり (10-28 ブラックの対策 3 番、オーナー OK「冒涜周りはしっかりチェック」)。
 * watch.mjs の「前と同じか」と違い、その場の画面と木だけで合う / 合わないが決まる。見つけてもツリーは直さない (シミュ部長へ)。
 *  (A) つながった箱どうし (↩ 戻り・統合) は同じ形。形は開発版の window.__simMonkey の形の関数を呼ぶ (本番の作りには口が無いので見られない所)
 *  (B) 子の箱に手を足しても、ほかの箱の表示 (題・戻りの札・次の手の札・カードの行) は変わらない
 *  (C) 結果の箱の題 (「〇〇が付いた」「〇〇がフラクチャーされた場合」「未発現の冒涜が付いた」など) と、その箱の見本の行が合う
 *  (D) 画面のカレンシー・お告げ・骨の名前がデータ (src/services/htc/price-keys.json) と同じで、箱の札・棚・手の窓で同じ
 * 題と行の比べは文字だけ (MOD の名前の数・括弧を落とす = tree-names の modShort と同じ落とし方。エンジンの関数は呼ばない)。
 */
import { readFileSync } from "node:fs";

const KEYS = JSON.parse(readFileSync(new URL("../../src/services/htc/price-keys.json", import.meta.url), "utf8"));
const BONES = new Set(Object.values(KEYS.bones).map((x) => x.ja));
/** データの名前の答え: 文字列 = その名前、Set = どれか (骨は部位で変わる)、null = データに無い (エッセンス・発現などは比べない) */
export function dataName(key) {
  if (KEYS.omens[key]) return KEYS.omens[key].ja;
  if (key === "desecrate") return BONES;
  return KEYS.currency[key]?.ja ?? null;
}
const nameOk = (want, got) => (want instanceof Set ? want.has(got) : want === got);
const wantText = (want) => (want instanceof Set ? `骨のどれか (${[...want].slice(0, 3).join("・")} …)` : want);
/** MOD の文から数・括弧・「が増加する」を落とす (tree-names の modShort と同じ落とし方) */
export const modShort = (s) => String(s ?? "").replace(/\([^)]*\)/g, "").replace(/[+-]?\d+(\.\d+)?%?/g, "").replace(/%/g, "").replace(/が(増加|減少)する$/, "").replace(/\s+/g, " ").trim();
const HAND_SUFFIX = /\s*\((?:どれが消えてもよい|\d+ MOD 残す|狙い無し|未発現のまま|発現させる|品質を最大まで)\)$/;
/** 次の手の札 (handLabel) → 名前の並び [カレンシー, お告げ…]。触媒の前置き・当たるまでの包み・後ろの括弧 (どれが消えてもよい・狙い無し・未発現のまま など) を外す */
export function handParts(label) {
  let s = String(label ?? "").replace(/\s+/g, " ").trim().replace(/^→\s*/, "");
  if (s.includes(" → ")) s = s.slice(s.lastIndexOf(" → ") + 3);
  const spam = /^カオススパムオーブ \((.*)\)$/.exec(s);
  if (spam) s = spam[1].replace(/、\d+ 回まで$/, "");
  // 外すのは handLabel が足す括弧だけ (「王者のオーブ (完全)」の (完全) は名前のうち)
  while (HAND_SUFFIX.test(s)) s = s.replace(HAND_SUFFIX, "");
  return s.split(" + ").map((x) => x.trim()).filter(Boolean);
}

/** 箱ごとの表示 (題・戻りの札・次の手の札・カードの行)。(B) の前後の比べ */
export const DISPLAY = `Object.fromEntries([...document.querySelectorAll("[data-tree-box]")].map((b) => [b.getAttribute("data-box-id"), { head: b.querySelector("[data-tree-legend]")?.innerText.trim() ?? "", back: b.querySelector("[data-tree-back-tag]")?.innerText.replace(/\\s+/g, " ").trim() ?? "", hand: b.querySelector("[data-tree-next-hand]")?.innerText.replace(/\\s+/g, " ").trim() ?? "", rows: [...b.querySelectorAll("p.group\\\\/row, [data-fracture-member]")].map((p) => p.innerText.replace(/\\s+/g, " ").trim()) }]))`;
/** 箱ごとの題と行 (側の P / S・フラクチャー・札の名前・未発現・MOD の文)。(C) */
const HEADS = `Object.fromEntries([...document.querySelectorAll("[data-tree-box]")].map((b) => { const side = (p) => (p.querySelector(".tabular-nums")?.innerText ?? "").trim().slice(0, 1); const text = (p) => (p.querySelector(".min-w-0.flex-1")?.firstElementChild ?? p.querySelector(".min-w-0.flex-1"))?.innerText.trim() ?? ""; return [b.getAttribute("data-box-id"), { head: b.querySelector("[data-tree-legend]")?.innerText.trim() ?? "", cant: b.getAttribute("data-sample-note") === "cant:unreachable", rows: [...[...b.querySelectorAll("p.group\\\\/row")].map((p) => ({ side: side(p), frac: p.classList.contains("text-mod-fractured"), tag: p.querySelector("[data-row-tag-name]")?.innerText.trim() ?? "", unrev: !!p.querySelector("[data-unrevealed]"), text: text(p) })), ...[...b.querySelectorAll("[data-fracture-member]")].map((p) => ({ side: side(p), frac: true, tag: "", unrev: false, text: text(p) }))] }]; }))`;
/** 棚のボタン [{ key, name }] (aria-label = 名前 — 打てない理由) */
const SHELF = `[...document.querySelectorAll("[data-tree-shelf] [data-shelf]")].map((b) => ({ key: b.getAttribute("data-key"), name: (b.getAttribute("aria-label") ?? "").split(" — ")[0].trim(), off: !!(b.getAttribute("aria-label") ?? "").includes(" — ") || b.getAttribute("aria-disabled") === "true" }))`;
/** 手の窓の持っている物の題 (TreeHandShelf の b[title] = 持った物 + お告げ) */
const HELD_TITLE = `(() => { const b = [...document.querySelectorAll("b[title]")].find((x) => x.offsetParent && !x.closest("[data-tree-box]") && x.parentElement?.querySelector("img")); return b ? b.innerText.replace(/\\s+/g, " ").trim() : null; })()`;
const PLUS = (id) => `(() => { const x = document.querySelector('[data-box-id="${id}"] [data-tree-next]'); if (!x) return false; const o = { bubbles: true, pointerId: 1, isPrimary: true, button: 0 }; x.dispatchEvent(new PointerEvent("pointerdown", o)); window.dispatchEvent(new PointerEvent("pointerup", o)); document.dispatchEvent(new PointerEvent("pointerup", o)); return true; })()`;
const PREFER = ["chaos", "exalt", "annul", "augment", "transmute", "regal"];

export function makeRules({ ev, sleep, count, bad, note, openTree, mode }) {
  /** (C) 結果の箱の題と、その箱の見本の行 */
  async function checkHeads(t) {
    const boxes = await ev(HEADS);
    for (const [id, { head, rows, cant }] of Object.entries(boxes)) {
      if (!head || !rows.length) continue;
      // この道では作れない箱 (見本は親の物のまま、S-74・data-sample-note) は題と見本を比べず、別に数える
      if (cant) { count(t.key, "作れない箱 (見本の印)"); continue; }
      const frac = rows.filter((r) => r.frac);
      if (/^未発現の冒涜が付いた/.test(head)) {
        count(t.key, "箱の題と見本");
        if (!rows.some((r) => r.unrev)) bad(t.key, `PC ${id} の題`, "「未発現の冒涜が付いた」なのに見本に未発現の行が無い", rows.map((r) => r.tag || r.text).join(" / "), "未発現の行 1 つ以上");
        continue;
      }
      const junkFrac = /^外れ MOD(?: \((.+)\))? ?(?:がフラクチャーされた場合|が固定された)$/.exec(head);
      if (junkFrac) {
        count(t.key, "箱の題と見本");
        const side = /プレ/.test(junkFrac[1] ?? "") ? "P" : /サフィ/.test(junkFrac[1] ?? "") ? "S" : null;
        if (!frac.length) bad(t.key, `PC ${id} の題`, "外れ MOD がフラクチャーされた箱なのに見本にフラクチャーの行が無い", rows.map((r) => r.tag || r.text).join(" / "), "フラクチャーの行 1 つ以上");
        else if (side && !frac.some((r) => r.side === side)) bad(t.key, `PC ${id} の題`, "題の側と見本のフラクチャーの行の側が違う", frac.map((r) => `${r.side} ${r.tag || r.text}`).join(" / "), `${side} のフラクチャーの行`);
        continue;
      }
      const m = /^(.+?)(が付いた|がフラクチャーされた場合|が固定された)$/.exec(head);
      if (!m) continue;
      count(t.key, "箱の題と見本");
      const name = m[1].trim(), needFrac = m[2] !== "が付いた";
      const hit = rows.filter((r) => !r.unrev && !r.tag && r.text && (needFrac ? r.frac : true)).find((r) => { const s = modShort(r.text); return s && (s === name || name.includes(s)); });
      if (!hit) bad(t.key, `PC ${id} の題`, needFrac ? "題の MOD がフラクチャーされた行として見本に無い" : "題の MOD が見本の行に無い", rows.map((r) => `${r.frac ? "✦" : ""}${r.tag || modShort(r.text)}`).join(" / "), head);
    }
  }

  /** (D) 箱の次の手の札の名前 = データの名前。札の並びを返す ({ key: 札の名前 }、棚・手の窓と比べる) */
  async function checkHandNames(t, doc) {
    const labels = await ev(`Object.fromEntries([...document.querySelectorAll("[data-tree-box]")].map((b) => [b.getAttribute("data-box-id"), b.querySelector("[data-tree-next-hand]")?.innerText ?? null]))`);
    const seen = {};
    for (const [id, label] of Object.entries(labels)) {
      const h = doc.boxes[id]?.hand;
      if (!h || !label) continue;
      const keys = [h.currency, ...(h.omens ?? [])], parts = handParts(label);
      if (h.catalyst || h.repeat) continue; // 触媒・当たるまでは札の作りが違う (名前の並びを取り出さない)
      if (parts.length < keys.length) { note.push(`${t.key}: ${id} の次の手の札から名前を ${keys.length} つ取り出せない (${label})`); continue; }
      keys.forEach((k, i) => {
        seen[k] ??= parts[i];
        const want = dataName(k);
        count(t.key, "手の名前とデータ");
        if (want && !nameOk(want, parts[i])) bad(t.key, `PC ${id} の次の手`, "札のカレンシー・お告げの名前がデータの名前と違う", parts[i], wantText(want));
        if (seen[k] !== parts[i]) bad(t.key, `PC ${id} の次の手`, "同じ鍵の名前が箱によって違う", parts[i], seen[k]);
      });
    }
    return seen;
  }

  /** (D) 棚の名前 = データ・箱の札、持った時の手の窓の題 = 棚の名前。手の無い箱 1 つで ＋ → 棚 */
  async function checkShelfNames(t, doc, handNames) {
    const box = Object.values(doc.boxes).find((b) => !b.hand && !b.back && b.out !== "start");
    if (!box) { note.push(`${t.key}: 棚を開ける手の無い箱が無い`); return; }
    if (!(await ev(PLUS(box.id)))) { note.push(`${t.key}: ${box.id} の ＋ が押せない`); return; }
    await sleep(1200);
    const shelf = await ev(SHELF);
    if (!shelf.length) { note.push(`${t.key}: ${box.id} の棚が読めない`); return; }
    for (const s of shelf) {
      const want = dataName(s.key);
      if (!want) continue;
      count(t.key, "棚の名前とデータ");
      if (!nameOk(want, s.name)) bad(t.key, `PC ${box.id} の棚 ${s.key}`, "棚の名前がデータの名前と違う", s.name, wantText(want));
    }
    // 木の手の鍵 (骨・エッセンスも) は、棚の名前 = 箱の札の名前、持った時の手の窓の題の頭 = 棚の名前
    for (const [k, label] of Object.entries(handNames)) {
      const s = shelf.find((x) => x.key === k);
      if (!s) continue;
      count(t.key, "棚と札と手の窓の名前");
      if (s.name !== label) bad(t.key, `PC ${box.id} の棚 ${k}`, "棚の名前と箱の次の手の札の名前が違う", s.name, label);
      if (s.off || KEYS.omens[k]) continue; // 打てない物・お告げは持てないので窓の題を見ない
      await ev(`document.querySelector('[data-tree-shelf] [data-shelf][data-key="${k}"]')?.click(), 1`); await sleep(700);
      const title = await ev(HELD_TITLE);
      if (!title) { note.push(`${t.key}: ${k} を持った時の手の窓の題が読めない`); continue; }
      if (handParts(title)[0] !== s.name) bad(t.key, `PC ${box.id} で ${k} を持つ`, "手の窓の題の名前が棚の名前と違う", title, s.name);
    }
  }

  /** (B) 子の箱 (手も戻りも無い箱) に手を足しても、ほかの箱の表示は変わらない。木ごとに 2 箱まで */
  async function checkParentStable(t) {
    const doc0 = await openTree(t, 1660, 860, false);
    const kids = doc0 ? Object.values(doc0.boxes).filter((b) => !b.hand && !b.back && !b.done && b.parent && b.out !== "start").slice(0, 2) : [];
    if (!kids.length) { note.push(`${t.key}: (B) 手を足せる子の箱が無い`); return; }
    for (const kid of kids) {
      await openTree(t, 1660, 860, false);
      const before = await ev(DISPLAY);
      if (!(await ev(PLUS(kid.id)))) { note.push(`${t.key}: (B) ${kid.id} の ＋ が押せない`); continue; }
      await sleep(1200);
      const shelf = await ev(SHELF);
      const key = PREFER.find((k) => shelf.some((s) => s.key === k && !s.off)) ?? shelf.find((s) => !s.off)?.key;
      if (!key) { note.push(`${t.key}: (B) ${kid.id} で打てる物が棚に無い`); continue; }
      await ev(`document.querySelector('[data-tree-shelf] [data-shelf][data-key="${key}"]')?.click(), 1`); await sleep(800);
      // 狙う MOD を選ぶ所で止まる時は狙い無しで打つ
      await ev(`(() => { const f = document.querySelector("[data-tree-hand-free] input"); if (document.querySelector("[data-tree-hand-problem]") && f && !f.checked) f.click(); return 1; })()`); await sleep(500);
      const used = await ev(`(() => { const c = document.querySelector("[data-tree-hand-card] [data-stage-card]"); c?.click(); return !!c; })()`);
      await sleep(2000);
      const after = await ev(DISPLAY);
      if (!used || !after[kid.id]?.hand) { note.push(`${t.key}: (B) ${kid.id} に ${key} を足せなかった`); continue; }
      count(t.key, "子に手を足した時のほかの箱");
      for (const [id, was] of Object.entries(before)) {
        if (id === kid.id) continue;
        const now = after[id];
        const diff = !now ? ["箱が消えた"] : ["head", "back", "hand", "rows"].filter((k) => JSON.stringify(was[k]) !== JSON.stringify(now[k]));
        if (!diff.length) continue;
        const what = id === kid.parent ? "子の箱に手を足したら親の箱の表示が変わった" : "子の箱に手を足したらほかの箱の表示が変わった";
        bad(t.key, `PC ${kid.id} に ${key} → ${id}`, what, now ? diff.map((k) => `${k}: ${JSON.stringify(now[k])}`).join(" / ") : "(箱なし)", diff.map((k) => `${k}: ${JSON.stringify(was[k])}`).join(" / "));
      }
    }
  }

  /** (A) つながった箱どうしは同じ形 (開発版の __simMonkey の形の関数。sameShape か shapeOf のどちらか) */
  async function checkLinkShape(t, doc) {
    const api = await ev(`(() => { const m = window.__simMonkey; return m ? { same: typeof m.sameShape === "function", of: typeof m.shapeOf === "function" } : null; })()`);
    if (!api?.same && !api?.of) { note.push(`${t.key}: (A) 形の関数を呼べない (${mode === "dev" ? "__simMonkey に sameShape / shapeOf が無い" : "本番の作りには __simMonkey が無い"})`); return; }
    for (const b of Object.values(doc.boxes)) {
      // 始めに戻る・形の合う箱へ (行き先は回し方しだい)・始まりの箱 (体を比べない決め) は比べない
      if (!b.back || !doc.boxes[b.back] || b.back === "start") continue;
      const r = await ev(`(() => { const m = window.__simMonkey; try { return ${api.same ? `{ same: !!m.sameShape("${b.id}", "${b.back}"), a: ${api.of ? `JSON.stringify(m.shapeOf("${b.id}"))` : "null"}, b: ${api.of ? `JSON.stringify(m.shapeOf("${b.back}"))` : "null"} }` : `{ a: JSON.stringify(m.shapeOf("${b.id}")), b: JSON.stringify(m.shapeOf("${b.back}")) }`}; } catch (e) { return { err: String(e) }; } })()`);
      if (r.err) { note.push(`${t.key}: (A) ${b.id} → ${b.back} の形が読めない (${r.err})`); continue; }
      // 見本 4 つで外れの種類が違う箱 (body が mixed:) はどの箱とも同じにならない決めなので数えない (王者の外れなど。シミュ部長 33、10-28)
      if (/"body":"mixed:/.test(r.a ?? "")) { note.push(`${t.key}: (A) ${b.id} は見本ごとに外れの種類が違う (mixed) ので ${b.back} との形を比べない`); continue; }
      count(t.key, "つながった箱の形");
      const same = "same" in r ? r.same : r.a === r.b;
      if (!same) bad(t.key, `PC ${b.id} → ${b.back}`, "つながった箱どうしの形が違う", `${b.id}: ${r.a ?? "?"}`, `${b.back}: ${r.b ?? "?"}`);
    }
  }

  return { checkHeads, checkHandNames, checkShelfNames, checkParentStable, checkLinkShape };
}
