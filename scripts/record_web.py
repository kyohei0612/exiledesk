"""ウェブ版 (exiledesk.com) のエミュレーターを操作して録る。宣伝の回 (作り直し) の画面.

kyohei 2026-10-12「チェックは基本的にウェブ版、録画も」。Chromium を画面に出して 1 枚目のモニターに
全画面 → ddagrab で録る (record_app_rec.Recorder)。ウェブ版だけの物 (アプリ版の札・訪問者・
チャンネルの欄・一番下の決まり事) は録画の間だけ隠し、使い方の記録は止めてから録る。

録る物 (1 つ 1 ファイル + 結果の JSON): open / orbs / undo / modlist / aim / reveal / rune
と静止画 intro_done (完成した指輪) / web_feedback (要望・バグを送る)

    python scripts/record_web.py output/app_rec                 # 全部
    python scripts/record_web.py output/app_rec aim --url http://localhost:1440/web.html
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

import structlog
from playwright.sync_api import Locator, Page, sync_playwright
from record_app import PAGE, Hand, mark, pause, setup
from record_app_rec import CREATE_NO_WINDOW, Screencast

log = structlog.get_logger()
URL = "https://exiledesk.com/?rec=1"  # 録画モード (ExileDesk 要望 ㊶): 隠す物・記録は向こうが持つ
ALL = ["open", "orbs", "undo", "modlist", "aim", "reveal", "rune"]
BASE_JA = {"Gold Ring": "金の指輪", "Warlord Cuirass": "ウォーロード"}
HIST_JS = r"""
() => { const p = [...document.querySelectorAll('div.g-panel')].find(e => e.offsetParent
  && e.querySelector('b.g-sec-title')?.textContent.trim() === '工程');
  const m = p?.querySelector('.g-sec-head')?.innerText.match(/· (\d+) 手/);
  return [m ? +m[1] : 0, p?.querySelector('ol > li')?.innerText ?? ''];
}
"""


class Web:
    """ウェブ版のエミュレーターを 1 手ずつ操作する (結果は notes に残す)."""

    def __init__(self, page: Page, out: Path) -> None:
        self.page, self.out, self.hand = page, out, Hand(page)
        self.notes: list[dict[str, Any]] = []

    @property
    def card(self) -> Locator:
        return self.page.locator("[data-stage-card]").filter(visible=True).first

    def key(self, k: str) -> Locator:
        return self.rec(f"shelf:{k}")

    def count(self) -> int:
        n: int = self.page.evaluate(HIST_JS)[0]
        return n

    def steps(self, n: int) -> Locator:
        return self.page.get_by_text(re.compile(rf"· {n} 手$"))

    def prepare(self) -> None:
        setup(self.page)

    def rec(self, v: str) -> Locator:
        """録画用の固定の目印 data-rec (ExileDesk 要望 ㊶)."""
        return self.page.locator(f'[data-rec="{v}"]').filter(visible=True).first

    def pick_base(self, name: str, slow: bool = True) -> None:
        """ベース選び: 開いていなければ「ベースを変える」→ 名前で探す → カード (name は英語名)."""
        jp = BASE_JA.get(name, name)
        p = self.page
        box = self.rec("base-search")
        opener = self.rec("base-toggle")  # 検索欄が残っていても一覧は閉じている事がある
        if opener.get_attribute("aria-expanded") != "true":
            if slow:
                self.hand.click(opener, 700, 0.8)
            else:  # 録らない準備: 上に重なる帯にクリックを取られないよう、ページの中から押す
                opener.evaluate("e => e.click()")
                p.wait_for_timeout(600)
        if slow:
            self.hand.click(box, 600, 0.2)
            p.keyboard.type(jp, delay=60)
            pause(0.8)
        else:
            box.fill(jp)
            p.wait_for_timeout(500)
        card = self.rec(f"base:{name}")
        if not card.is_visible():  # 開いた直後で一覧がまだ無い時は、もう一度探し直す
            p.wait_for_timeout(800)
            box.fill("")
            box.fill(jp)
            p.wait_for_timeout(800)
        log.info(
            "base cards",
            seen=p.locator('[data-rec^="base:"]').evaluate_all(
                "els => els.filter(e => e.offsetParent).map(e => e.dataset.rec)"
            )[:5],
        )
        if slow:
            self.hand.click(card, 800, 1.2)
        else:
            card.evaluate("e => e.click()")
        p.wait_for_timeout(900)

    def quick(self, keys: list[str]) -> None:
        """準備の手 (録らない)."""
        held = None
        for k in keys:
            if k != held:
                self.key(k).click()
                held = k
            n = self.count()
            self.rec("item-name").click()
            self.steps(n + 1).wait_for(timeout=5000)
        self.page.keyboard.press("Escape")

    def hold(self, k: str) -> None:
        self.hand.click(self.key(k), 650, 0)
        self.page.get_by_text(re.compile("^持っている: ")).wait_for(timeout=3000)

    def use(self) -> None:
        n = self.count()
        self.hand.click(self.rec("item-name"), 700, 0)
        self.steps(n + 1).wait_for(timeout=5000)
        mark(f"付いた: {n + 1} 手目")
        self.notes.append({"step": n + 1, "last": self.page.evaluate(HIST_JS)[1]})
        pause(1.8)

    def dump(self, name: str) -> None:
        self.notes.append({"card": self.card.inner_text()})
        path = self.out / f"{name}.json"
        path.write_text(json.dumps(self.notes, ensure_ascii=False, indent=1), encoding="utf-8")
        self.notes = []

    def modlist(self) -> Locator:
        return self.rec("mod-list")

    def open_modlist(self) -> Locator:
        btn = self.rec("mod-list-open")
        self.hand.click(btn, 700, 0.8)
        return self.modlist()

    def row(self, dlg: Locator, rx: str) -> Locator:
        return dlg.locator("button.w-full").filter(has_text=re.compile(rx)).first


def still(src: Path, at: float, dest: Path) -> None:
    """録画の at 秒目のコマを 4 秒の静止の動画にする (intro_done など)."""
    ff = shutil.which("ffmpeg") or "ffmpeg"
    png = dest.with_suffix(".png")
    run = [ff, "-v", "error", "-y", "-ss", str(at), "-i", str(src), "-frames:v", "1", str(png)]
    subprocess.run(run, check=True, creationflags=CREATE_NO_WINDOW)
    vid = [ff, "-v", "error", "-y", "-loop", "1", "-i", str(png), "-t", "4", "-r", "30"]
    vid += ["-c:v", "h264_nvenc", "-pix_fmt", "yuv420p", str(dest)]
    subprocess.run(vid, check=True, creationflags=CREATE_NO_WINDOW)


def record(w: Web, only: list[str]) -> None:
    p, h = w.page, w.hand
    if "open" in only:  # 開いた所 (ベース選び) → 金の指輪
        rec = Screencast(w.page, w.out / "open.mp4")
        pause(1.5)
        w.pick_base("Gold Ring")
        h.glide(500, 520, 700)
        pause(2.0)
        rec.stop()
        w.dump("open")
    else:
        w.pick_base("Gold Ring", slow=False)
    w.prepare()

    if "orbs" in only:  # 変成 → 増強 → 王者 → 高貴 ×3
        rec = Screencast(w.page, w.out / "orbs.mp4")
        pause(1.0)
        for k in ("transmute", "augment", "regal"):
            w.hold(k)
            w.use()
        w.hold("exalt")
        for _ in range(3):
            w.use()
        p.keyboard.press("Escape")
        h.glide(500, 980, 600)
        pause(2.0)
        rec.stop()
        w.dump("orbs")
        end = max(0.0, _dur(w.out / "orbs.mp4") - 0.5)
        still(w.out / "orbs.mp4", end, w.out / "intro_done.mp4")

    if "undo" in only:  # 1 手戻す → 工程の行で戻る → 始め
        rec = Screencast(w.page, w.out / "undo.mp4")
        pause(1.0)
        h.click(w.rec("undo"), 700, 1.5)
        h.click(w.rec("step:3"), 700, 1.8)  # 3 手目の直後へ
        h.click(w.rec("step:start"), 700, 1.8)  # 一番下の「始め」
        pause(1.5)
        rec.stop()
        w.dump("undo")

    if "modlist" in only:  # MOD 一覧 (Tab) → 行 → ティアの表 → 閉じる → 持って開く (付く確率)
        w.quick(["transmute"])  # マジックにしておく (増強が棚に出る)
        rec = Screencast(w.page, w.out / "modlist.mp4")
        pause(1.0)
        dlg = w.open_modlist()
        pause(2.0)
        r = w.row(dlg, r"^火耐性")
        h.click(r, 800, 2.5)
        p.keyboard.press("Escape")
        pause(1.0)
        w.hold("augment")
        dlg = w.open_modlist()
        pause(3.5)
        p.keyboard.press("Escape")
        p.keyboard.press("Escape")
        pause(1.0)
        rec.stop()
        w.dump("modlist")

    if "aim" in only:  # 次の手で狙う: 火耐性 T2 → 確率を見る → 一番上の行 → 100 回まわす
        rec = Screencast(w.page, w.out / "aim.mp4")
        pause(1.0)
        dlg = w.open_modlist()
        r = w.row(dlg, r"^火耐性")
        h.click(r, 800, 1.2)
        tbl = r.locator("xpath=following-sibling::table[1]")
        aim_btn = tbl.locator('[data-rec^="aim:"][data-rec$=":T2"]').first
        h.click(aim_btn, 800, 1.2)
        h.click(w.rec("aim-decide"), 800, 0.5)
        p.get_by_text(re.compile("^計算中…")).first.wait_for(state="hidden", timeout=60000)
        mark("確率が出た")
        panel = w.rec("aim-panel")
        pause(3.0)
        top = panel.locator('[data-rec^="aim-row:"]').first
        w.notes.append({"aim": panel.inner_text()})
        h.click(top, 700, 1.5)
        h.click(w.rec("aim-n:100"), 600, 0.6)
        h.click(panel.locator('[data-rec^="aim-roll:"]').first, 700, 0)
        p.get_by_text(re.compile("回中")).first.wait_for(timeout=30000)
        mark("回した")
        w.notes.append({"spun": panel.inner_text()})
        pause(3.0)
        p.keyboard.press("Escape")
        rec.stop()
        w.dump("aim")

    if "reveal" in only:  # レアの指輪に骨 → お告げ (アビスの反響) → 発現 → 引き直し → 選ぶ
        _white(p)  # ここまでの金の指輪を白に戻して使う (同じベースは選び直せない)
        w.quick(["transmute", "augment", "regal", "exalt"])
        rec = Screencast(w.page, w.out / "reveal.mp4")
        pause(1.0)
        w.hold("desecrate")
        pause(1.5)  # 持つと下にお告げが出る
        echo = w.rec("shelf:OmenofAbyssalEchoes")
        h.click(echo, 700, 1.5)
        w.use()
        p.keyboard.press("Escape")
        cand = [w.rec(f"reveal:{i}") for i in (1, 2, 3)]
        offers = [c.inner_text().replace("\n", " ") for c in cand]
        pause(2.0)
        h.click(w.rec("reveal-reroll"), 700, 1.8)
        again = [c.inner_text().replace("\n", " ") for c in cand]

        def rank(i: int) -> tuple[int, int]:  # ティアが良い物 → 短い物
            m = re.search(r"T(\d+)", again[i])
            return (int(m.group(1)) if m else 99, len(again[i]))

        pick = min(range(len(again)), key=rank)
        n = w.count()
        h.click(cand[pick], 800, 0)
        w.steps(n + 1).wait_for(timeout=5000)
        mark("発現した")
        w.notes.append({"offers": offers, "rerolled": again, "picked": again[pick]})
        pause(2.5)
        rec.stop()
        w.dump("reveal")

    if "rune" in only:  # 6 つ埋まった胴にセールの凱旋 → 高貴で 4 つ目のサフィックス
        w.pick_base("Warlord Cuirass", slow=False)
        w.quick(["transmute", "augment", "regal", "exalt", "exalt", "exalt"])
        rec = Screencast(w.page, w.out / "rune.mp4")
        h.glide(500, 600, 600)
        pause(1.5)
        w.hold("rune:Serle's Triumph")
        w.use()
        p.keyboard.press("Escape")
        w.hold("exalt")
        w.use()
        p.keyboard.press("Escape")
        h.glide(500, 980, 600)
        pause(2.5)
        rec.stop()
        w.dump("rune")


def _white(page: Page) -> None:
    """白に戻す (2 回押し)。手も始めの MOD も無い時は押せないので飛ばす."""
    btn = page.locator('[data-rec="reset"]').filter(visible=True).first
    if btn.is_enabled():
        btn.click()
        btn.click()  # 2 回押し (1 回目で「もう一度押すと白に戻す」に変わる)
        page.wait_for_timeout(500)


def _dur(path: Path) -> float:
    probe = shutil.which("ffprobe") or "ffprobe"
    cmd = [probe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]
    out = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
    return float(out.stdout.strip() or 0)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("out", type=Path)
    ap.add_argument("only", nargs="*", default=ALL)
    ap.add_argument("--url", default=URL)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        # 画面に出さない (headless)。ページの中身だけを screencast で録る
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        PAGE.append(page)
        page.goto(a.url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2000)
        w = Web(page, a.out)
        w.prepare()
        page.mouse.move(w.hand.x, w.hand.y)
        record(w, a.only)
        browser.close()


if __name__ == "__main__":
    main()
