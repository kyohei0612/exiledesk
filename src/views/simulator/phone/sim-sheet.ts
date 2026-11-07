/**
 * sim-sheet.ts — シミュのスマホの形 (1280 未満) の下から出る窓の枠の見た目 (共通の ModalShell の sheet に panelClass で渡す、U-15)。
 * 前は 4 つの窓 (箱の窓・足りない所・答えの選び・完成形と全体図) が殻ごと自前で、この組を写していた。border = 上の線の色 (足りない所は赤)
 */
export const simSheet = (border = "border-[#b08a3c]"): string => `border-t-2 ${border} bg-sim-panel shadow-[0_-10px_30px_rgba(0,0,0,0.8)]`;
