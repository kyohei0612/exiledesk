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

from playwright.sync_api import Locator, Page, sync_playwright
from record_app import Hand, mark, pause, setup
from record_app_rec import CREATE_NO_WINDOW, Recorder

URL = "https://exiledesk.com/"
ALL = ["open", "orbs", "undo", "modlist", "aim", "reveal", "rune"]
SEARCH = "名前で探す (例: サファイア、ルビー)"
# ウェブ版だけの物を隠す (アプリ版の札・訪問者・チャンネルの欄・一番下)。
# 要望の札は 8 章で使うので残す
WEB_HIDE_JS = r"""
() => {
  const st = document.createElement('style');
  st.textContent = 'aside, footer { display: none !important; }';
  document.head.appendChild(st);
  for (const el of document.querySelectorAll('button, a, span')) {
    const t = (el.textContent || '').trim();
    if (/^アプリ版/.test(t) || /^本日の訪問者/.test(t)) el.style.visibility = 'hidden';
  }
}
"""
# 使い方の記録を止める (録画で開いた分を数えない)
NO_LOG_JS = r"""
() => {
  const b = [...document.querySelectorAll('button')].find(
    e => /^記録: しています/.test(e.textContent.trim())
      || e.textContent.trim() === 'この端末は記録しない');
  if (b) b.click();
  return b ? b.textContent.trim() : '';
}
"""
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
        return self.page.locator(f'[data-shelf][data-key="{k}"]').filter(visible=True).first

    def count(self) -> int:
        n: int = self.page.evaluate(HIST_JS)[0]
        return n

    def steps(self, n: int) -> Locator:
        return self.page.get_by_text(re.compile(rf"· {n} 手$"))

    def prepare(self) -> None:
        setup(self.page)
        self.page.evaluate(WEB_HIDE_JS)

    def pick_base(self, name: str, slow: bool = True) -> None:
        """ベース選び: 開いていなければ「ベースを変える」→ 名前で探す → カード."""
        p = self.page
        box = p.get_by_placeholder(SEARCH)
        if not box.is_visible():
            opener = p.locator("[data-stage-settings] > div.w-full > button[aria-expanded]")
            self.hand.click(opener, 700, 0.8) if slow else opener.click()
        if slow:
            self.hand.click(box, 600, 0.2)
            p.keyboard.type(name, delay=60)
            pause(0.8)
        else:
            box.fill(name)
            p.wait_for_timeout(500)
        b = p.locator("b", has_text=re.compile(rf"^{name}$"))
        card = p.locator("button.g-item").filter(has=b).first
        self.hand.click(card, 800, 1.2) if slow else card.click()
        p.wait_for_timeout(900)

    def quick(self, keys: list[str]) -> None:
        """準備の手 (録らない)."""
        held = None
        for k in keys:
            if k != held:
                self.key(k).click()
                held = k
            n = self.count()
            self.card.locator("p.st-name").first.click()
            self.steps(n + 1).wait_for(timeout=5000)
        self.page.keyboard.press("Escape")

    def hold(self, k: str) -> None:
        self.hand.click(self.key(k), 650, 0)
        self.page.get_by_text(re.compile("^持っている: ")).wait_for(timeout=3000)

    def use(self) -> None:
        n = self.count()
        self.hand.click(self.card.locator("p.st-name").first, 700, 0)
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
        return self.page.get_by_role("dialog", name="このベースに付く MOD")

    def open_modlist(self) -> Locator:
        btn = self.page.locator("button.tbtn-top", has_text="MOD 一覧").filter(visible=True).first
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
        rec = Recorder(w.out / "open.mp4")
        pause(1.5)
        w.pick_base("金の指輪")
        h.glide(500, 520, 700)
        pause(2.0)
        rec.stop()
        w.dump("open")
    else:
        w.pick_base("金の指輪", slow=False)
    w.prepare()

    if "orbs" in only:  # 変成 → 増強 → 王者 → 高貴 ×3
        rec = Recorder(w.out / "orbs.mp4")
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
        rec = Recorder(w.out / "undo.mp4")
        pause(1.0)
        h.click(p.get_by_role("button", name="1 手戻す", exact=True), 700, 1.5)
        title = p.locator("b.g-sec-title", has_text=re.compile("^工程$"))
        hist = p.locator("div.g-panel", has=title)
        rows = hist.locator("ol > li")
        h.click(rows.nth(2), 700, 1.8)  # 新しい順の 3 つ目 = 3 手目の直後へ
        h.click(rows.last, 700, 1.8)  # 一番下の「始め」
        pause(1.5)
        rec.stop()
        w.dump("undo")

    if "modlist" in only:  # MOD 一覧 (Tab) → 行 → ティアの表 → 閉じる → 持って開く (付く確率)
        w.quick(["transmute"])  # マジックにしておく (増強が棚に出る)
        rec = Recorder(w.out / "modlist.mp4")
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
        rec = Recorder(w.out / "aim.mp4")
        pause(1.0)
        dlg = w.open_modlist()
        r = w.row(dlg, r"^火耐性")
        h.click(r, 800, 1.2)
        tbl = r.locator("xpath=following-sibling::table[1]")
        t2 = p.locator("td:first-child", has_text=re.compile("^T2$"))
        aim_btn = tbl.locator("tr").filter(has=t2).first.get_by_role("button", name="次の手で狙う")
        h.click(aim_btn, 800, 1.2)
        win = p.get_by_role("dialog", name="次の手で狙う")
        h.click(win.get_by_role("button", name=re.compile(r"^確率を見る")), 800, 0.5)
        p.get_by_text(re.compile("^計算中…")).first.wait_for(state="hidden", timeout=60000)
        mark("確率が出た")
        panel = p.locator("section[data-aim-panel]")
        pause(3.0)
        top = panel.locator("ol > li").first
        w.notes.append({"aim": panel.inner_text()})
        h.click(top.locator("button").first, 700, 1.5)
        h.click(panel.get_by_role("button", name="100", exact=True), 600, 0.6)
        h.click(top.get_by_role("button", name="回す", exact=True), 700, 0)
        p.get_by_text(re.compile("回中")).first.wait_for(timeout=30000)
        mark("回した")
        w.notes.append({"spun": panel.inner_text()})
        pause(3.0)
        p.keyboard.press("Escape")
        rec.stop()
        w.dump("aim")

    if "reveal" in only:  # レアの指輪に骨 → お告げ (アビスの反響) → 発現 → 引き直し → 選ぶ
        w.pick_base("金の指輪", slow=False)
        _white(p)
        w.quick(["transmute", "augment", "regal", "exalt"])
        rec = Recorder(w.out / "reveal.mp4")
        pause(1.0)
        w.hold("desecrate")
        pause(1.5)  # 持つと下にお告げが出る
        echo = p.locator('[data-held-omens] [data-key="OmenofAbyssalEchoes"]').first
        h.click(echo, 700, 1.5)
        w.use()
        p.keyboard.press("Escape")
        panel = p.locator("[data-reveal-panel]")
        offers = [t.replace("\n", " ") for t in panel.locator("button.w-full").all_inner_texts()]
        pause(2.0)
        h.click(panel.get_by_role("button", name="引き直す", exact=True), 700, 1.8)
        again = [t.replace("\n", " ") for t in panel.locator("button.w-full").all_inner_texts()]

        def rank(i: int) -> tuple[int, int]:  # ティアが良い物 → 短い物
            m = re.search(r"T(\d+)", again[i])
            return (int(m.group(1)) if m else 99, len(again[i]))

        pick = min(range(len(again)), key=rank)
        n = w.count()
        h.click(panel.locator("button.w-full").nth(pick), 800, 0)
        w.steps(n + 1).wait_for(timeout=5000)
        mark("発現した")
        w.notes.append({"offers": offers, "rerolled": again, "picked": again[pick]})
        pause(2.5)
        rec.stop()
        w.dump("reveal")

    if "rune" in only:  # 6 つ埋まった胴にセールの凱旋 → 高貴で 4 つ目のサフィックス
        w.pick_base("ウォーロードの胴鎧", slow=False)
        w.quick(["transmute", "augment", "regal", "exalt", "exalt", "exalt"])
        rec = Recorder(w.out / "rune.mp4")
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
    btn = page.get_by_role("button", name="白に戻す", exact=True)
    if btn.is_enabled():
        btn.click()
        page.get_by_role("button", name="もう一度押すと白に戻す", exact=True).click()
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
        args = ["--start-fullscreen", "--window-position=0,0", "--window-size=1920,1080"]
        browser = pw.chromium.launch(headless=False, args=args)
        page = browser.new_page(no_viewport=True)
        page.goto(a.url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2000)
        page.evaluate(NO_LOG_JS)
        page.wait_for_timeout(500)
        w = Web(page, a.out)
        w.prepare()
        page.mouse.move(w.hand.x, w.hand.y)
        page.bring_to_front()
        record(w, a.only)
        browser.close()


if __name__ == "__main__":
    main()
