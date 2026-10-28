/**
 * 上の切り替えタブで来た直後か (スイッチ backPlace、U-27)。web/page.ts の topOfPage が印を付け、開いた時に自分で送る部品 (ベース選びの一覧など) は
 * この間 (2 秒) は送らずに一番上のまま (オーナー 10-28「エミュレーターとか押したらさ、MODにスクロールされるでしょ。…一番上にそのまま案内させておkだよ」)
 */
let at = -Infinity;
export const markTabArrive = (): void => { at = performance.now(); };
export const cameByTab = (): boolean => performance.now() - at < 2000;

/** ベースを押した直後か (1.5 秒)。ベース選びの部品 (BaseCatalog) はどの置き場の物もこの間は一覧へ送らない (オーナー 10-28「ベースを選んで、最初の挙動でスクロールがMODから始まる」) */
let picked = -Infinity;
export const markBasePick = (): void => { picked = performance.now(); };
export const justPickedBase = (): boolean => performance.now() - picked < 1500;
