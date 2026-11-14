// ブラウザの右クリックのメニューを出さない (U-38、スイッチ noCtxMenu)。
// オーナー 11-15「右クリックでこのアプリ使ってる最中はどんな時でも右クリックでコピーとかプロパティとかださないでくれ。不快」。
// 文字を打つ欄・写すための欄 (検索・URL の貼り付け・読むだけの input / textarea) と、選んだ文字の上は残す (オーナー 11-15「文字入力やコピペのとこ以外で禁止にしたらおｋ」)。
// 右クリックで何かをする所 (持った物を離す・フラクチャーの印など) は自分の処理で preventDefault するので、
// ここは document の泡の段で既定の動きを止めるだけ (伝わりは止めない = 今の処理はそのまま動く)。
import { flag } from "../web/release-flags";

const TYPING = 'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]), textarea, [contenteditable]:not([contenteditable="false"])';

/** 選んだ文字の上の右クリック (選んで写す所。オーナー 11-15「文字入力やコピペのとこ以外で禁止」) */
function onSelection(e: MouseEvent): boolean {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) return false;
  for (let i = 0; i < sel.rangeCount; i++) for (const r of sel.getRangeAt(i).getClientRects()) {
    if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) return true;
  }
  return false;
}

/** 文字の欄・写す欄・選んだ文字の上 = ブラウザのメニューを残す所 */
const keepHere = (e: MouseEvent): boolean => (e.target instanceof Element && !!e.target.closest(TYPING)) || onSelection(e);

/**
 * 右クリックで自分の処理をする所 (持った物を離すなど) が既定の動きを止める時に使う: スイッチ noCtxMenu の間は、
 * 文字の欄・写す欄・選んだ文字の上ならメニューを残す (止めない)。閉じている間は今までどおりいつも止める
 */
export function preventMenu(e: MouseEvent): void {
  if (flag("noCtxMenu") && keepHere(e)) return;
  e.preventDefault();
}

export function startNoContextMenu(): void {
  document.addEventListener("contextmenu", (e) => {
    if (e.defaultPrevented || keepHere(e)) return;
    e.preventDefault();
  });
}
