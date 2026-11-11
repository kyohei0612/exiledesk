/**
 * daily-side-fit.ts — 挑戦の木の右の欄 (完成形のカード・提出・諦める・ミニマップ・倍率の道具) を欄の高さに収める (D-37m)。
 * 欄は木の枠と同じ高さ (シミュの並び) で、中身が高さを越えると下 (ミニマップ・倍率の道具) が切れた
 * (11-11 オーナー「ここ絶対スクロール必要ないからだして」「した見切れてる」)。機種の幅・高さで分けず、欄の高さから数える:
 * ① カードの倍率 (--daily-card-z) を、カード + 提出 + 倍率の道具が収まる所まで下げる (上は幅で決めた --daily-card-zmax、下は Z_MIN)
 * ② ミニマップは残りが MAP_MIN 以上ある時だけ出す (印 data-daily-side-tight で隠す、daily-play.css)
 * シミュの部品は触らない (欄の中を測って、デイリーの層の CSS の値と印を置くだけ)
 */
const Z_MIN = 0.7;
/** ミニマップを出す残りの高さ (シミュのミニマップの下限 96px + 間) */
const MAP_MIN = 110;
const GAP = 8;

/** 欄を見張って収める。返り = 見張りを外す */
export function fitDailySide(side: HTMLElement): () => void {
  const root = side.closest<HTMLElement>("[data-daily-play]");
  if (!root) return () => {};
  const fit = (): void => {
    const card = side.querySelector<HTMLElement>(":scope > [data-tree-goal-side]");
    if (!card || side.style.display === "none" || !side.clientHeight) return;
    const cs = getComputedStyle(root);
    const zMax = Number(cs.getPropertyValue("--daily-card-zmax")) || 1, zNow = Number(cs.getPropertyValue("--daily-card-z")) || zMax;
    const acts = side.querySelector<HTMLElement>(":scope > [data-daily-acts]"), bar = side.querySelector<HTMLElement>("[data-tree-tools] [role='toolbar']");
    const sr = side.getBoundingClientRect(), cr = card.getBoundingClientRect();
    // カードの外で要る高さ = カードより上 (閉じる・余白) + 提出の段 + 倍率の道具 + 間と下の余白
    const fixed = (cr.top - sr.top) + (acts ? acts.offsetHeight + GAP + 2 : 0) + (bar ? Math.max(bar.offsetHeight, bar.scrollHeight + 2) + GAP : 0) + GAP + 6; // 道具は潰れる前の高さで (潰れた後の高さを測ると足りないまま落ち着く)
    const natural = cr.height / zNow;
    if (natural <= 0) return;
    const z = Math.max(Z_MIN, Math.min(zMax, (sr.height - fixed) / natural));
    if (Math.abs(z - zNow) > 0.005) root.style.setProperty("--daily-card-z", z.toFixed(3));
    const tight = sr.height - fixed - natural * z < MAP_MIN;
    if (tight !== side.hasAttribute("data-daily-side-tight")) side.toggleAttribute("data-daily-side-tight", tight);
  };
  const ro = new ResizeObserver(fit);
  ro.observe(side);
  const watchKids = (): void => { for (const k of side.children) ro.observe(k); };
  watchKids();
  // 提出の段は後から差し込まれる (Teleport)
  const mo = new MutationObserver(() => { watchKids(); fit(); });
  mo.observe(side, { childList: true });
  window.addEventListener("resize", fit);
  fit();
  return () => { ro.disconnect(); mo.disconnect(); window.removeEventListener("resize", fit); root.style.removeProperty("--daily-card-z"); };
}
