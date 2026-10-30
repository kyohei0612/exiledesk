/**
 * view.mjs — 1 回の結果を木にする (S-170b、view.html が読む)。箱 = 状態 (レアリティ + 狙いの数)、線 = 手。自動ツリー専用の実験で、シミュの画面は使わない
 */
const W = 320, GAP_X = 110, GAP_Y = 26, TOP = 20, LEFT = 24, ROW = 40, HEAD = 34;
const RARITY = { normal: "ノーマル", magic: "マジック", rare: "レア" };
const END = { done: "完成", stop: "諦め", budget: "打ち止め", limit: "上限", stuck: "止まり" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fix = (x) => (x >= 100 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x.toFixed(2));

const parts = (key) => {
  const [rarity, aims = ""] = key.split("|");
  return { rarity, aims: aims ? aims.split(",").map((x) => x.split(":")) : [] };
};
const titleOf = (key) => {
  if (END[key]) return END[key];
  const p = parts(key);
  return [RARITY[p.rarity] ?? p.rarity, ...p.aims.map(([k, v]) => `${k} ${v}`)].join(" / ");
};
const colOf = (key, last) => {
  if (END[key]) return last;
  const p = parts(key);
  return ({ normal: 0, magic: 1 }[p.rarity] ?? 2) + p.aims.reduce((a, [, v]) => a + Number(v), 0);
};
const shareText = (to, total) => Object.entries(to).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${titleOf(k)} ${(100 * v / total).toFixed(0)}%`).join("  ");

/** 箱の並びを決める */
function layout(graph, people) {
  const ends = new Set();
  for (const s of Object.values(graph)) {
    for (const k of Object.keys(s.ends ?? {})) ends.add(k);
    for (const m of Object.values(s.moves ?? {})) for (const k of Object.keys(m)) if (END[k]) ends.add(k);
  }
  const keys = [...Object.keys(graph).filter((k) => !END[k]), ...ends];
  const last = Math.max(0, ...keys.filter((k) => !END[k]).map((k) => colOf(k, 0))) + 1;
  const cols = new Map();
  for (const k of keys) { const c = colOf(k, last); (cols.get(c) ?? cols.set(c, []).get(c)).push(k); }
  const box = new Map();
  for (const [c, list] of cols) {
    let y = TOP;
    list.sort((a, b) => (graph[b]?.n ?? 0) - (graph[a]?.n ?? 0));
    for (const k of list) {
      const rows = Object.keys(graph[k]?.moves ?? {}).length;
      const h = HEAD + rows * ROW + 8;
      box.set(k, { key: k, x: LEFT + c * (W + GAP_X), y, h, visits: (graph[k]?.n ?? 0) / people });
      y += h + GAP_Y;
    }
  }
  return box;
}

export function renderTree(row) {
  const { graph, people } = row;
  const box = layout(graph, people);
  const edges = new Map();
  const add = (a, b, n) => { if (a !== b) edges.set(`${a}\n${b}`, (edges.get(`${a}\n${b}`) ?? 0) + n); };
  for (const [k, s] of Object.entries(graph)) {
    for (const m of Object.values(s.moves ?? {})) for (const [to, n] of Object.entries(m)) add(k, to, n);
    for (const [how, n] of Object.entries(s.ends ?? {})) add(k, how, n);
  }
  const lines = [...edges].map(([id, n]) => {
    const [a, b] = id.split("\n"), p = box.get(a), q = box.get(b);
    const back = q.x <= p.x;
    const x1 = back ? p.x : p.x + W, x2 = back ? q.x + W : q.x, y1 = p.y + p.h / 2, y2 = q.y + q.h / 2;
    const bend = back ? Math.max(90, Math.abs(y2 - y1) / 2) : GAP_X / 2;
    const d = back ? `M${x1} ${y1}C${x1 - bend} ${y1 + 60} ${x2 + bend} ${y2 + 60} ${x2} ${y2}` : `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`;
    return `<path class="${back ? "back" : "go"}" d="${d}" stroke-width="${(1 + Math.log10(1 + n / people) * 2.5).toFixed(1)}"><title>${esc(titleOf(a))} → ${esc(titleOf(b))}: 1 人 ${fix(n / people)} 回</title></path>`;
  }).join("");
  const boxes = [...box.values()].map((b) => {
    const s = graph[b.key];
    const rows = Object.entries(s?.moves ?? {}).sort((x, y) => sum(y[1]) - sum(x[1])).map(([label, to]) => {
      const total = sum(to);
      return `<div class="rule"><b>${esc(label)}</b> <i>×${fix(total / people)}</i><span>${esc(shareText(to, total))}</span></div>`;
    }).join("");
    return `<section class="box ${END[b.key] ? `end ${b.key}` : ""}" style="left:${b.x}px;top:${b.y}px;width:${W}px;height:${b.h}px"><h2>${esc(titleOf(b.key))}${END[b.key] ? "" : ` <i>${fix(b.visits)}</i>`}</h2>${rows}</section>`;
  }).join("");
  const width = Math.max(...[...box.values()].map((b) => b.x + W)) + LEFT, height = Math.max(...[...box.values()].map((b) => b.y + b.h)) + 90;
  return `<div style="position:relative;width:${width}px;height:${height}px"><svg width="${width}" height="${height}">${lines}</svg>${boxes}</div>`;
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
