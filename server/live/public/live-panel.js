/**
 * ライブ中のチャンネルの枠。/live.json を読んで描き、60 秒ごとに読み直す。
 *   mountLivePanel(el, { url: "https://…/live.json", demo: false })
 * 枠組みを選ばない (素の JS) ので、Web 版 (Vue) でもそのまま mount できる。見本は ?demo=1
 */
const PF = { youtube: "YouTube", twitch: "Twitch" };

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmtViewers = (n) => (n == null ? "" : n >= 10000 ? `${(n / 10000).toFixed(1)}万人` : `${n.toLocaleString("ja-JP")}人`);
/** 予定: 今日なら 19:00、違う日なら 10/8 19:00 */
function fmtWhen(iso, now = new Date()) {
  if (!iso) return "予定";
  const d = new Date(iso);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `今日 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
/** 配信してからの時間 (1 時間 20 分 → 1:20) */
function fmtSince(iso, now = Date.now()) {
  if (!iso) return "";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

const avatar = (c) => `<span class="lp-avatar">${c.avatar ? `<img src="${esc(c.avatar)}" alt="" loading="lazy">` : esc(c.name.slice(0, 1))}</span>`;
const nameLine = (c) => `<div class="lp-name"><span>${esc(c.name)}</span><span class="lp-pf ${esc(c.platform)}">${PF[c.platform] ?? esc(c.platform)}</span>${c.pr ? `<span class="lp-pr" title="協賛">PR</span>` : ""}</div>`;

/** ライブ中・予定の札 (サムネ付き) */
function cardOn(e, avatarUrl) {
  const live = e.status === "live";
  return `<li class="lp-ch ${live ? "live" : "upcoming"}"><a href="${esc(e.watchUrl)}" target="_blank" rel="noopener" title="${esc(e.title)}">
    <div class="lp-thumb">${e.thumb ? `<img src="${esc(e.thumb)}" alt="" loading="lazy">` : ""}
      <span class="lp-badge ${live ? "" : "up"}">${live ? "LIVE" : esc(fmtWhen(e.scheduledAt))}</span>
      ${live && (e.viewers != null || e.startedAt) ? `<span class="lp-viewers">${esc([fmtViewers(e.viewers), fmtSince(e.startedAt)].filter(Boolean).join(" · "))}</span>` : ""}
    </div>
    <div class="lp-row">${avatar({ ...e, avatar: avatarUrl })}<div class="lp-body">${nameLine(e)}<div class="lp-title">${esc(e.title)}</div></div></div>
  </a></li>`;
}
/** 配信していない札 (1 行) */
const cardOff = (c) => `<li class="lp-ch off"><a href="${esc(c.url)}" target="_blank" rel="noopener"><div class="lp-row">${avatar(c)}<div class="lp-body">${nameLine(c)}</div></div></a></li>`;

export function render(el, state) {
  const avatars = new Map((state.channels ?? []).map((c) => [c.id, c.avatar]));
  const on = [...(state.live ?? []), ...(state.upcoming ?? [])];
  const onIds = new Set(on.map((e) => e.id));
  const off = (state.channels ?? []).filter((c) => !onIds.has(c.id));
  const liveN = (state.live ?? []).length;
  const items = [...on.map((e) => cardOn(e, avatars.get(e.id))), ...off.map(cardOff)];
  el.classList.add("lp");
  el.innerHTML = `
    <div class="lp-head"><b>配信</b><span>${liveN ? `${liveN} 人がライブ中` : "ライブ中なし"}</span><span class="lp-count">${(state.channels ?? []).length} ch</span></div>
    ${items.length ? `<ul class="lp-list">${items.join("")}</ul>` : `<div class="lp-empty">チャンネルがまだ無い</div>`}
    <p class="lp-foot">${state.updatedAt ? `更新 ${new Date(state.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}` : "まだ調べていない"}</p>`;
}

/** 見本 (鍵が無くても見た目を確かめる) */
export function demoState(now = new Date()) {
  const in2h = new Date(now.getTime() + 2 * 3600e3).toISOString();
  const ago = new Date(now.getTime() - 83 * 60e3).toISOString();
  return {
    updatedAt: now.toISOString(),
    live: [
      { id: "poe2tube", name: "POE2Tube", platform: "youtube", url: "#", pr: false, status: "live", title: "手袋 6MOD を 600 神で作る (偉大 → 骨)", thumb: null, watchUrl: "#", startedAt: ago, scheduledAt: null, viewers: 128 },
      { id: "spon1", name: "協賛チャンネル A", platform: "twitch", url: "#", pr: true, status: "live", title: "Act 3 から順にやる", thumb: null, watchUrl: "#", startedAt: ago, scheduledAt: null, viewers: 41 },
    ],
    upcoming: [
      { id: "spon2", name: "協賛チャンネル B", platform: "youtube", url: "#", pr: true, status: "upcoming", title: "新リーグ初日 一緒にやる", thumb: null, watchUrl: "#", startedAt: null, scheduledAt: in2h, viewers: null },
    ],
    channels: [
      { id: "poe2tube", name: "POE2Tube", platform: "youtube", url: "#", pr: false, status: "live", avatar: null },
      { id: "spon1", name: "協賛チャンネル A", platform: "twitch", url: "#", pr: true, status: "live", avatar: null },
      { id: "spon2", name: "協賛チャンネル B", platform: "youtube", url: "#", pr: true, status: "upcoming", avatar: null },
      { id: "spon3", name: "協賛チャンネル C", platform: "twitch", url: "#", pr: true, status: "off", avatar: null },
    ],
    errors: [],
  };
}

export function mountLivePanel(el, { url = "/live.json", demo = false, every = 60_000 } = {}) {
  let timer = null;
  async function tick() {
    try {
      if (demo) { render(el, demoState()); return; }
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) throw new Error(String(r.status));
      render(el, await r.json());
    } catch (e) {
      if (!el.innerHTML) { el.classList.add("lp"); el.innerHTML = `<div class="lp-empty">読めなかった (${esc(e.message)})</div>`; }
    }
  }
  void tick();
  if (!demo) timer = setInterval(() => { if (document.visibilityState === "visible") void tick(); }, every);
  return () => { if (timer) clearInterval(timer); };
}
