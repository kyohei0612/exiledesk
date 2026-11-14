// ブラウザの右クリックのメニューを出さない (U-38、スイッチ noCtxMenu)。
// オーナー 11-15「右クリックでこのアプリ使ってる最中はどんな時でも右クリックでコピーとかプロパティとかださないでくれ。不快」。
// 文字を打つ欄 (検索・URL の貼り付けなど) だけは貼り付けのために残す。
// 右クリックで何かをする所 (持った物を離す・フラクチャーの印など) は自分の処理で preventDefault するので、
// ここは document の泡の段で既定の動きを止めるだけ (伝わりは止めない = 今の処理はそのまま動く)。
const TYPING = 'input:not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="submit"]), textarea, [contenteditable]:not([contenteditable="false"])';

export function startNoContextMenu(): void {
  document.addEventListener("contextmenu", (e) => {
    if (e.defaultPrevented) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest(TYPING)) return;
    e.preventDefault();
  });
}
