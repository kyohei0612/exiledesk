"""ExileDesk のアプリ (録画モード) を操作して録る。宣伝の回の操作 (docs/app_recording.md).

先にアプリを録画モードで起動しておく (EXILEDESK_REMOTE_DEBUG_PORT=9333 / EXILEDESK_FULLSCREEN=1)。
終わったらアプリをタスクキルして、いつもの起動に戻す。

録る物 (1 つ 1 ファイル): open (開いて白い金の指輪) / orbs (変成→増強→王者→高貴×3) /
undo (1 手戻す) / modlist (MOD 一覧で指名) / sim (シミュレーション、record_app_sim.py)

    python scripts/record_app.py output/app_rec               # 全部
    python scripts/record_app.py output/app_rec orbs undo     # 一部だけ (白い金の指輪から始める)
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import structlog
from playwright.sync_api import Locator, Page, sync_playwright
from record_app_js import APP_FX_FIXED, CURSOR_JS, HIDE_JS, LAST_CHANGE_JS

log = structlog.get_logger()
CDP = "http://127.0.0.1:9333"
CREATE_NO_WINDOW = 0x08000000
# 操作の速さ (kyohei 2026-10-08「速度はこの倍でいい」: 編集で倍速・一時停止できるので速めに録る)
SPEED = 2.0


def pause(seconds: float) -> None:
    """操作の間の待ち (SPEED で縮める)."""
    time.sleep(seconds / SPEED)


def focus_app() -> None:
    """全画面の ExileDesk の窓を前面に出す (前面でないとタスクバーが上に写る).

    開発版など窓モードの ExileDesk が同時に開いていることがある → 0,0 から画面いっぱいの窓を選ぶ。
    """
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    found: list[int] = []

    def visit(hwnd: int, _: int) -> bool:
        buf = ctypes.create_unicode_buffer(64)
        user32.GetWindowTextW(hwnd, buf, 64)
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        full = (rect.left, rect.top, rect.right, rect.bottom) == (0, 0, 1920, 1080)
        if buf.value == "ExileDesk" and user32.IsWindowVisible(hwnd) and full:
            found.append(hwnd)
        return True

    proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    user32.EnumWindows(proc(visit), 0)
    if not found:
        log.warning("fullscreen ExileDesk window not found")
        return
    user32.keybd_event(0x12, 0, 0, 0)  # Alt を押して離す (前面に出す制限を外す定番の手)
    user32.keybd_event(0x12, 0, 2, 0)
    user32.ShowWindow(found[0], 9)
    user32.SetForegroundWindow(found[0])
    time.sleep(0.5)


class Recorder:
    """ddagrab で 1 枚目のモニターを録る (GPU のコマを下ろしてから NVENC)."""

    def __init__(self, path: Path) -> None:
        focus_app()
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


HAND_CLIPS = ["open", "orbs", "undo", "modlist"]


def setup(page: Page) -> None:
    """カーソルの絵を入れ、映さないボタンを隠す (ページを切り替えたら入れ直す)."""
    page.evaluate(CURSOR_JS, APP_FX_FIXED)
    page.evaluate(HIDE_JS)


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

    def hold(key: str) -> None:
        hand.click(page.locator(f'[data-shelf][data-key="{key}"]'), 650, 0)
        page.get_by_text(re.compile("^持っている: ")).wait_for(timeout=3000)

    notes: list[dict[str, Any]] = []  # 1 手ごとの結果 (台本の台詞を録画に合わせる用)

    def use(n: int) -> None:
        hand.click(card.locator("p.stage-item-name").first, 700, 0)
        steps(n).wait_for(timeout=5000)
        change = page.evaluate(LAST_CHANGE_JS)
        notes.append({"step": n, "change": change, "item": card.inner_text()})
        pause(1.8)  # 演出 1.4 秒 + 付いた MOD の光 1.6 秒

    def dump(name: str) -> None:
        """録画と同じ名前の JSON に、その録画で打った手の結果を書く."""
        path = out / f"{name}.json"
        path.write_text(json.dumps(notes, ensure_ascii=False, indent=1), encoding="utf-8")
        notes.clear()

    def top() -> None:
        scroller.evaluate("e => e.scrollTo({top: 0})")
        pause(0.3)

    def white() -> None:
        top()
        page.get_by_role("button", name="白に戻す", exact=True).click()
        steps(0).wait_for(timeout=3000)

    page.keyboard.press("Escape")
    setup(page)
    page.mouse.move(hand.x, hand.y)
    if "open" in only:
        rec = Recorder(out / "open.mp4")
        hand.click(nav, 900, 0)
        page.locator("[data-shelf]").first.wait_for(timeout=20000)
        pause(0.8)
        setup(page)
        hand.click(page.get_by_role("button", name="手で打つ", exact=True))
        hand.click(page.get_by_role("button").filter(has_text=re.compile("▼ 変える")), 700, 0.8)
        cat = page.get_by_placeholder("名前で探す (例: サファイア、ルビー)").locator("xpath=../..")
        hand.click(cat.get_by_role("button", name="指輪", exact=True), 700, 0.8)
        ring = page.locator("b", has_text=re.compile(r"^金の指輪$"))
        hand.click(cat.locator("button").filter(has=ring), 800, 0.8)
        level = page.locator("span:has(> span:text-is('アイテムレベル'))")
        hand.click(level.get_by_role("button", name="82", exact=True), 700, 0.5)
        steps(0).wait_for(timeout=3000)
        setup(page)
        hand.glide(480, 520, 700)
        pause(2.0)
        rec.stop()
    else:
        nav.click()
        page.locator("[data-shelf]").first.wait_for(timeout=20000)
        page.get_by_role("button", name="手で打つ", exact=True).click()
        setup(page)
        white()

    if "orbs" in only:
        top()
        notes.clear()
        rec = Recorder(out / "orbs.mp4")
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
        dump("orbs")

    if "undo" in only:
        top()
        notes.clear()
        rec = Recorder(out / "undo.mp4")
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
        dump("undo")

    if "modlist" in only:
        white()
        rec = Recorder(out / "modlist.mp4")
        head = page.get_by_role("button", name=re.compile("^このベースに付く MOD"))
        modlist = page.locator("section").filter(has=head).filter(visible=True)
        modlist.get_by_role("button", name=re.compile("^このベースに付く MOD")).evaluate(
            "e => e.scrollIntoView({behavior: 'smooth', block: 'start'})"
        )
        pause(1.2)

        def attach(kind: str, text: str | None, tier: str, button: str) -> None:
            """目次で種類へ飛ぶ → 行を押してティアの表 → その段のボタン → 表を閉じる."""
            toc = modlist.locator("div.sticky button", has_text=re.compile(rf"^\s*{kind}")).first
            hand.click(toc, 700, 1.0)
            head = page.locator("h3 > span", has_text=re.compile(rf"^{kind}$"))
            rows = modlist.locator("section.scroll-mt-12").filter(has=head).locator("button.w-full")
            row = (rows.filter(has_text=text) if text else rows).first
            hand.click(row, 800, 1.0)
            tbl = row.locator("xpath=following-sibling::table[1]")
            tbl.wait_for(timeout=3000)
            pause(1.5)
            cell = page.locator("td:first-child", has_text=re.compile(rf"^{tier}$"))
            hand.click(
                tbl.locator("tr").filter(has=cell).get_by_role("button", name=button), 800, 1.5
            )
            hand.click(row, 700, 0.8)  # 同じ行をもう一度押して表を閉じる

        attach("普通", "火耐性", "T1", "付ける")
        attach("普通", "最大ライフ", "T2", "フラクチャー")
        attach("冒涜", "火および混沌耐性", "T1", "冒涜")
        top()
        pause(2.0)
        notes.append({"item": card.inner_text()})
        rec.stop()
        dump("modlist")


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    only = sys.argv[2:] or [*HAND_CLIPS, "sim"]
    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(CDP, timeout=20000)
        page = browser.contexts[0].pages[0]
        if any(c in only for c in HAND_CLIPS):
            run(page, out, only)
        if "sim" in only:  # ベースが「手で打つ」と共通なので最後に (docs/app_recording_map.md)
            from record_app_sim import run_sim

            run_sim(page, out)


if __name__ == "__main__":
    main()
