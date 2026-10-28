/**
 * use-shelf-card.ts — シミュの手の窓の小さな札 (カタリストの種類など) に、エミュの棚の札 (for-share の ShelfButton) と同じ説明のカードを出す
 * (同じ hoverStack の kind "shelf" = 公式の説明 + ステージでの動き、品質の種類・効く MOD まで)。10-29 オーナー「カタリストホバーで…エミュのほばーと同じにしてあげたいね
 * カタリスト　名前だけだからな」。前は title の名前だけだった。指の端末では出さない (ShelfButton と同じ)
 */
import { hoverStack } from "../../../state/hover-stack";
import { isTouchOnly } from "../../../utils/use-phone";
import { afterPointerMoves } from "../../../utils/pointer-moved";
import { toCss } from "../../../utils/zoom";
import { flag } from "../../../web/release-flags";
import { useReason, type StageItem } from "../../../services/craft-stage/engine";
import { craftStage as s } from "../../../state/craft-stage";

const touchOnly = isTouchOnly();
let stopWait = (): void => undefined;

/** 札に乗せた時: k の説明のカード (item = 棚の文脈のアイテム、打てない理由もカードに出る) */
export function shelfCardOn(e: MouseEvent, k: string, item: StageItem | null): void {
  if (touchOnly) return;
  const el = e.currentTarget as HTMLElement;
  const open = (): void => {
    const r = el.getBoundingClientRect(), d = s.data.value;
    const reason = d && item ? useReason(d, item, k) : null;
    hoverStack.openRootDelayed({ kind: "shelf", k, reason, omen: false, item }, toCss(r.right), toCss(r.top), { left: toCss(r.left), right: toCss(r.right), top: toCss(r.top), bottom: toCss(r.bottom) });
  };
  stopWait();
  if (flag("firstVisit1024")) stopWait = afterPointerMoves(e, open); else open();
}
export function shelfCardOff(): void { stopWait(); hoverStack.leave(); }
