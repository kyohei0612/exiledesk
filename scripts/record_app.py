"""ExileDesk のアプリ (録画モード) を操作して録る。宣伝の回 2〜5 章 (docs/app_recording.md).

先にアプリを録画モードで起動しておく (EXILEDESK_REMOTE_DEBUG_PORT=9333 / EXILEDESK_FULLSCREEN=1)。
終わったらアプリをタスクキルして、いつもの起動に戻す。

    python scripts/record_app.py output/app_rec            # 2〜5 章を全部
    python scripts/record_app.py output/app_rec ch3 ch4    # 一部だけ (白い金の指輪から始める)
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import structlog
from playwright.sync_api import Locator, Page, sync_playwright

log = structlog.get_logger()
CDP = "http://127.0.0.1:9333"
CREATE_NO_WINDOW = 0x08000000
# 操作の速さ (kyohei 2026-10-08「速度はこの倍でいい」: 編集で倍速・一時停止できるので速めに録る)
SPEED = 2.0


def pause(seconds: float) -> None:
    """操作の間の待ち (SPEED で縮める)."""
    time.sleep(seconds / SPEED)


# カーソルの絵 (Playwright の操作では OS のカーソルが動かない)。
# アプリの「持っているカレンシー」の絵・波紋は拡大 (zoom) の補正が抜けて右下にずれるので隠し、
# 持っている絵は自前のカーソルに付ける。棚の詳細カード (0.4 秒で出る) と、
# 画面の一番下の取得中の帯 (「自動巡回中」、FetchBusyBar) も録画では隠す
CURSOR_JS = r"""
(() => {
  if (window.__recCursor) return;
  const c = document.createElement('div');
  c.innerHTML = '<svg width="30" height="30" viewBox="0 0 28 28"><path d="M3 2 L3 22 L8.5 17 '
    + 'L12 25 L15.5 23.5 L12 15.8 L19.5 15.8 Z" fill="white" stroke="black" stroke-width="1.6" '
    + 'stroke-linejoin="round"/></svg>';
  Object.assign(c.style, {position: 'fixed', left: '960px', top: '540px', zIndex: 2147483647,
    pointerEvents: 'none', transform: 'translate(-3px,-2px)'});
  document.documentElement.appendChild(c);
  const st = document.createElement('style');
  st.textContent = 'img.fixed.z-\\[200\\], .stage-ripple, .stage-drop, '
    + 'body > div.fixed.z-\\[500\\].w-\\[340px\\], '
    + 'div.fixed.bottom-0.z-\\[95\\] { display: none !important; }';
  document.head.appendChild(st);
  const held = document.createElement('img');
  Object.assign(held.style, {position: 'absolute', left: '14px', top: '14px', width: '46px',
    height: '46px', objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(250,204,21,.85))',
    display: 'none'});
  c.appendChild(held);
  setInterval(() => {
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
})();
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


class Recorder:
    """ddagrab で 1 枚目のモニターを録る (GPU のコマを下ろしてから NVENC)."""

    def __init__(self, path: Path) -> None:
        ff = shutil.which("ffmpeg") or "ffmpeg"
        cmd = [ff, "-y", "-loglevel", "error", "-f", "lavfi"]
        cmd += ["-i", "ddagrab=output_idx=0:framerate=30:draw_mouse=0"]
        cmd += ["-vf", "hwdownload,format=bgra", "-c:v", "h264_nvenc", "-preset", "p4"]
        cmd += ["-cq", "21", "-pix_fmt", "yuv420p", str(path)]
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, creationflags=CREATE_NO_WINDOW)
        self.path = path
        time.sleep(1.2)

    def stop(self) -> None:
        time.sleep(1.0)
        assert self.proc.stdin is not None
        self.proc.stdin.write(b"q")
        self.proc.stdin.flush()
        self.proc.wait(timeout=30)
        log.info("recorded", file=str(self.path))


class Hand:
    """カーソルを滑らかに動かして押す (smoothstep、16ms ごと)."""

    def __init__(self, page: Page) -> None:
        self.page = page
        self.x, self.y = 960.0, 540.0

    def glide(self, x: float, y: float, ms: int = 650) -> None:
        ms = int(ms / SPEED)
        n = max(8, ms // 16)
        x0, y0 = self.x, self.y
        for i in range(1, n + 1):
            t = i / n
            e = t * t * (3 - 2 * t)
            self.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
            time.sleep(ms / 1000 / n)
        self.x, self.y = x, y

    def click(self, loc: Locator, ms: int = 650, after: float = 0.35) -> None:
        loc.scroll_into_view_if_needed()
        bb: Any = loc.bounding_box()
        self.glide(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2, ms)
        pause(0.15)
        self.page.mouse.down()
        pause(0.07)
        self.page.mouse.up()
        pause(after)


def run(page: Page, out: Path, only: list[str]) -> None:
    hand = Hand(page)
    card = (
        page.locator("div.select-none.border-2", has=page.locator("p.stage-item-name"))
        .filter(visible=True)
        .first
    )
    shelf = page.locator("section", has=page.locator("b", has_text=re.compile("^カレンシー$")))
    scroller = page.locator("div.h-full.overflow-auto.p-4").first
    nav = page.locator("aside nav button", has_text="クラフトステージ")

    def steps(n: int) -> Locator:
        return page.get_by_text(re.compile(rf"· {n} 手$"))

    def setup() -> None:
        page.evaluate(CURSOR_JS)
        page.evaluate(HIDE_JS)

    def hold(key: str) -> None:
        hand.click(page.locator(f'[data-shelf][data-key="{key}"]'), 650, 0)
        page.get_by_text(re.compile("^持っている: ")).wait_for(timeout=3000)

    def use(n: int) -> None:
        hand.click(card.locator("p.stage-item-name").first, 700, 0)
        steps(n).wait_for(timeout=5000)
        pause(1.8)  # 演出 1.4 秒 + 付いた MOD の光 1.6 秒

    def top() -> None:
        scroller.evaluate("e => e.scrollTo({top: 0})")
        pause(0.3)

    def white() -> None:
        top()
        page.get_by_role("button", name="白に戻す", exact=True).click()
        steps(0).wait_for(timeout=3000)

    page.keyboard.press("Escape")
    setup()
    page.mouse.move(hand.x, hand.y)
    if "ch2" in only:
        rec = Recorder(out / "ch2_open.mp4")
        hand.click(nav, 900, 0)
        page.locator("[data-shelf]").first.wait_for(timeout=20000)
        pause(0.8)
        setup()
        hand.click(page.get_by_role("button", name="手で打つ", exact=True))
        hand.click(page.get_by_role("button").filter(has_text=re.compile("▼ 変える")), 700, 0.8)
        cat = page.get_by_placeholder("名前で探す (例: サファイア、ルビー)").locator("xpath=../..")
        hand.click(cat.get_by_role("button", name="指輪", exact=True), 700, 0.8)
        ring = page.locator("b", has_text=re.compile(r"^金の指輪$"))
        hand.click(cat.locator("button").filter(has=ring), 800, 0.8)
        level = page.locator("span:has(> span:text-is('アイテムレベル'))")
        hand.click(level.get_by_role("button", name="82", exact=True), 700, 0.5)
        steps(0).wait_for(timeout=3000)
        setup()
        hand.glide(480, 520, 700)
        pause(2.0)
        rec.stop()
    else:
        nav.click()
        page.locator("[data-shelf]").first.wait_for(timeout=20000)
        page.get_by_role("button", name="手で打つ", exact=True).click()
        setup()
        white()

    if "ch3" in only:
        top()
        rec = Recorder(out / "ch3_orbs.mp4")
        hand.click(shelf.get_by_role("button", name="オーブ・骨", exact=True), 700, 0.6)
        for n, key in ((1, "transmute"), (2, "augment"), (3, "regal")):
            hold(key)
            use(n)
        hold("exalt")
        for n in (4, 5, 6):  # 持ったまま 3 回
            use(n)
        page.keyboard.press("Escape")
        hand.glide(480, 900, 600)
        pause(1.5)
        rec.stop()

    if "ch4" in only:
        top()
        rec = Recorder(out / "ch4_undo.mp4")
        hand.click(page.get_by_role("button", name="1 手戻す", exact=True), 700, 0)
        steps(5).wait_for(timeout=3000)
        hand.glide(480, 900, 600)
        pause(2.0)
        hold("exalt")
        use(6)  # 同じ種なので、さっきと同じ MOD が付く
        page.keyboard.press("Escape")
        hand.glide(480, 900, 600)
        pause(1.5)
        rec.stop()

    if "ch5" in only:
        white()
        rec = Recorder(out / "ch5_modlist.mp4")
        head = page.get_by_role("button", name=re.compile("^このベースに付く MOD"))
        modlist = page.locator("section").filter(has=head).filter(visible=True)
        modlist.get_by_role("button", name=re.compile("^このベースに付く MOD")).evaluate(
            "e => e.scrollIntoView({behavior: 'smooth', block: 'start'})"
        )
        pause(1.2)
        toc = modlist.locator("div.sticky button", has_text=re.compile(r"^\s*普通")).first
        hand.click(toc, 700, 1.0)
        normal = page.locator("h3 > span", has_text=re.compile("^普通$"))
        sec = modlist.locator("section.scroll-mt-12").filter(has=normal)
        row = sec.locator("button.w-full").filter(has_text="火耐性").first
        hand.click(row, 800, 1.0)
        tbl = row.locator("xpath=following-sibling::table[1]")
        tbl.wait_for(timeout=3000)
        pause(1.5)
        t1 = page.locator("td:first-child", has_text=re.compile("^T1$"))
        hand.click(tbl.locator("tr").filter(has=t1).get_by_role("button", name="付ける"), 800, 1.5)
        hand.click(row, 700, 0.8)  # 同じ行をもう一度押して表を閉じる
        top()
        pause(2.0)
        rec.stop()


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    only = sys.argv[2:] or ["ch2", "ch3", "ch4", "ch5"]
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP, timeout=20000)
        run(browser.contexts[0].pages[0], out, only)


if __name__ == "__main__":
    main()
