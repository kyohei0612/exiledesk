/**
 * tut-dom.ts — シミュのチュートリアルが開いている窓・棚を読む小さな口 (PC の use-sim-tutorial とスマホの use-sim-tutorial-phone で共用)。
 * 木の中身に出ない変わり目 (持った・お告げを掛けた・☑ した) は DOM の目印 (tutorial.md T-13) から読む。画面は変えない
 */
/** 打つ手の窓が開いているか */
export const handOpen = (): boolean => !!document.querySelector("[data-tree-hand-pick]");
/** 手の窓の棚でその物を持っているか (棚のボタンの枠が光る = g-slot の on。お告げの欄の中は見ない) */
export const holding = (key: string): boolean => [...document.querySelectorAll<HTMLElement>(`[data-tree-shelf] [data-shelf][data-key="${CSS.escape(key)}"]`)].some((b) => !b.closest("[data-held-omens]") && !!b.querySelector(".g-slot.on"));
/** 持っている物に掛けたお告げ (お告げの欄の「有効」) */
export const omenOn = (key: string): boolean => !!document.querySelector(`[data-held-omens] [data-key="${CSS.escape(key)}"] .stage-omen-on`);
export const omensOnNow = (): string[] => [...document.querySelectorAll<HTMLElement>("[data-held-omens] [data-key]")].filter((b) => !!b.querySelector(".stage-omen-on")).map((b) => b.dataset.key!);
/** 棚の物の CSS (エッセンスは同じ仲間の束の中にあることがある) */
export const shelfSel = (key: string): string => `[data-tree-shelf] [data-shelf][data-key="${CSS.escape(key)}"], [data-tree-shelf] [data-ess-keys~="${CSS.escape(key)}"]`;
/** 見えている (描かれている) 最初の要素 */
export function shown(sel: string): HTMLElement | null {
  try { return [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.offsetParent || e.getClientRects().length) ?? null; } catch { return null; }
}
/** 要素が画面の中にあるか (上の帯の下に隠れていないかまでは見ない) */
export function inView(el: HTMLElement | null): boolean {
  const r = el?.getBoundingClientRect();
  return !!r && r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}
/** チェックの欄 (label の中の input) が ☑ か */
export const checked = (sel: string): boolean => !!document.querySelector<HTMLInputElement>(`${sel} input:checked`);
/** 狙う MOD の欄 (☑ の MOD ごと) の目印 */
export const aimSel = (modId: string): string => `[data-tree-hand-aim][data-aim="${CSS.escape(`${modId}|1`)}"]`;
export const keepSel = (modId: string): string => `[data-tree-hand-keep-mod][data-mod="${CSS.escape(`${modId}|1`)}"]`;
/** ☑ の入った狙う MOD (data-aim の modId) */
export const aimsChecked = (): string[] => [...document.querySelectorAll<HTMLElement>("[data-tree-hand-aim]")].filter((l) => !!l.querySelector("input:checked")).map((l) => (l.dataset.aim ?? "").split("|")[0]!);
