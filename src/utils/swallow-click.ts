/**
 * swallow-click.ts — 小窓の外を押して閉じた時、その「押した」を下の物に届けない (2026-10-19)。
 * pointerdown で小窓を閉じても、続く click は下の物 (MOD 一覧の見出し = 開け閉め など) に届いてしまい、
 * 「付け方の小窓の外を押したら一覧がたたまれて戻らない」になっていた (オーナー「プルダウン外クリックで戻れない」)。
 * 閉じた直後の click を 1 回だけ (0.6 秒以内) 受け止める。付け方の小窓 (SimMethodPop)・付けるの小窓 (ModAddPicker) で使う
 */
export function swallowNextClick(): void {
  const stop = (e: Event): void => { e.stopPropagation(); e.preventDefault(); done(); };
  const done = (): void => { document.removeEventListener("click", stop, true); clearTimeout(timer); };
  const timer = setTimeout(done, 600);
  document.addEventListener("click", stop, true);
}
