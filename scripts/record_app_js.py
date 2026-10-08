"""record_app.py がページに入れる JavaScript (カーソルの絵・隠す物・結果の読み取り)."""

# カーソルの絵 (Playwright の操作では OS のカーソルが動かない)。
# 録画では隠す: 棚の詳細カード (0.4 秒で出る)・一番下の取得中の帯 (「自動巡回中」)・
# サイドバー (アプリ版だけの機能とログインの状態が出る。宣伝はウェブ版、kyohei 2026-10-08)
# v0.1.390 まではアプリの「持っているカレンシー」の絵・波紋が拡大 (zoom) の補正抜けで右下にずれた
# → 隠して持っている絵を自前のカーソルに付けた。v0.1.391 で直った (要望 ㊳) のでアプリの物を使う
APP_FX_FIXED = True  # v0.1.390 以前を録る時だけ False
CURSOR_JS = r"""
(appFxFixed) => {
  if (window.__recCursor) return;
  const c = document.createElement('div');
  c.innerHTML = '<svg width="30" height="30" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 '
    + 'L12 25 L15.5 23.5 L12 15.8 L19.5 15.8 Z" fill="white" stroke="black" stroke-width="1.6" '
    + 'stroke-linejoin="round"/></svg>';
  Object.assign(c.style, {position: 'fixed', left: '960px', top: '540px', zIndex: 2147483647,
    pointerEvents: 'none', transform: 'translate(-3px,-2px)'});
  document.documentElement.appendChild(c);
  const st = document.createElement('style');
  st.textContent = (appFxFixed ? '' : 'img.fixed.z-\\[200\\], .stage-ripple, .stage-drop, ')
    + 'body > div.fixed.z-\\[500\\].w-\\[340px\\], '
    + 'div.fixed.bottom-0.z-\\[95\\], aside { display: none !important; }';
  document.head.appendChild(st);
  const held = document.createElement('img');
  Object.assign(held.style, {position: 'absolute', left: '14px', top: '14px', width: '46px',
    height: '46px', objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(250,204,21,.85))',
    display: 'none'});
  c.appendChild(held);
  if (!appFxFixed) setInterval(() => {
    const a = document.querySelector('img.fixed.z-\\[200\\]');
    if (a) { if (held.src !== a.src) held.src = a.src; held.style.display = 'block'; }
    else held.style.display = 'none';
  }, 50);
  const z = () => parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1;
  const ring = (x, y) => {
    const r = document.createElement('div');
    Object.assign(r.style, {position: 'fixed', left: (x - 16) + 'px', top: (y - 16) + 'px',
      width: '32px', height: '32px', borderRadius: '50%', border: '3px solid rgba(255,200,60,.95)',
      zIndex: 2147483646, pointerEvents: 'none',
      transition: 'transform .45s ease-out, opacity .45s ease-out'});
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(2.2)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 500);
  };
  addEventListener('mousemove', e => {
    c.style.left = (e.clientX / z()) + 'px'; c.style.top = (e.clientY / z()) + 'px'; }, true);
  addEventListener('mousedown', e => ring(e.clientX / z(), e.clientY / z()), true);
  window.__recCursor = c;
}
"""
# 「直前の変化」の枠の文字 (付いた / 消えた MOD)
LAST_CHANGE_JS = r"""
() => {
  const el = [...document.querySelectorAll('div, section')].filter(
    e => e.offsetParent && e.textContent.trim().startsWith('直前の変化'))
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];
  return el ? el.innerText : '';
}
"""
# 映さないボタン (動画モード・JSON・取引所検索)
HIDE_JS = r"""
(() => { for (const b of document.querySelectorAll('button')) {
  const t = b.textContent.trim();
  if (/^(動画モード|手順 JSON|結果 JSON|相場 JSON)$/.test(t)
      || t.startsWith('今の MOD を取引所で検索'))
    b.style.display = 'none';
}})();
"""
