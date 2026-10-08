"""宣伝の回 3 章 (骨・お告げ・ルーン) の操作を録る。record_app.py の部品を使う.

reveal: レアの金の指輪にアビスの反響のお告げを掛けて骨 → 未発現の冒涜 MOD → 引き直す → 1 つ選ぶ
rune:   6 つ埋まったウォーロードの胴鎧にセールの凱旋を差す → 高貴で 4 つ目のサフィックス
準備の手 (白からレアまで) は録らない。打った結果は <name>.json (台詞を録画に合わせる用)

    python scripts/record_app_ch3.py output/app_rec            # 両方
    python scripts/record_app_ch3.py output/app_rec rune       # 片方だけ
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import Locator, Page, sync_playwright
from record_app import CDP, Hand, Recorder, pause, setup
from record_app_js import LAST_CHANGE_JS


def run_ch3(page: Page, out: Path, only: list[str]) -> None:
    hand = Hand(page)
    card = (
        page.locator("div.select-none.border-2", has=page.locator("p.stage-item-name"))
        .filter(visible=True)
        .first
    )
    shelf = page.locator("section", has=page.locator("b", has_text=re.compile("^カレンシー$")))
    scroller = page.locator("div.h-full.overflow-auto.p-4").first
    notes: list[dict[str, Any]] = []

    def steps(n: int) -> Locator:
        return page.get_by_text(re.compile(rf"· {n} 手$"))

    def count() -> int:
        m = re.search(r"· (\d+) 手", page.evaluate(LAST_CHANGE_JS))
        return int(m.group(1)) if m else 0

    def tab(name: str) -> Locator:
        return shelf.get_by_role("button", name=re.compile(rf"^{name}"))

    def quick(keys: list[str]) -> None:
        """準備の手 (録らない): 持って 1 回ずつ使う."""
        held = None
        for key in keys:
            if key != held:  # 持っている物をもう一度押すと手放してしまう
                page.locator(f'[data-shelf][data-key="{key}"]').click()
                held = key
            n = count()
            card.locator("p.stage-item-name").first.click()
            steps(n + 1).wait_for(timeout=5000)
        page.keyboard.press("Escape")

    def use() -> None:
        n = count()
        hand.click(card.locator("p.stage-item-name").first, 700, 0)
        steps(n + 1).wait_for(timeout=5000)
        notes.append({"change": page.evaluate(LAST_CHANGE_JS), "item": card.inner_text()})
        pause(1.8)

    def base(kind: str, name: str) -> None:
        scroller.evaluate("e => e.scrollTo({top: 0})")
        page.get_by_role("button").filter(has_text=re.compile("▼ 変える")).first.click()
        cat = page.get_by_placeholder("名前で探す (例: サファイア、ルビー)").locator("xpath=../..")
        cat.get_by_role("button", name=kind, exact=True).click()
        b = page.locator("b", has_text=re.compile(rf"^{name}$"))
        cat.locator("button").filter(has=b).click()
        page.get_by_role("button", name="白に戻す", exact=True).click()
        steps(0).wait_for(timeout=3000)
        page.get_by_role("button", name="オーブ・骨", exact=True).click()

    def dump(name: str) -> None:
        path = out / f"{name}.json"
        path.write_text(json.dumps(notes, ensure_ascii=False, indent=1), encoding="utf-8")
        notes.clear()

    page.keyboard.press("Escape")
    page.locator("aside nav button", has_text="クラフトステージ").click()
    page.get_by_role("button", name="手で打つ", exact=True).click()
    page.locator("[data-shelf]").first.wait_for(timeout=20000)
    setup(page)
    page.mouse.move(hand.x, hand.y)

    if "reveal" in only:
        base("指輪", "金の指輪")
        quick(["transmute", "augment", "regal", "exalt"])
        scroller.evaluate("e => e.scrollTo({top: 0})")
        rec = Recorder(out / "reveal.mp4")
        hand.click(tab("お告げ"), 700, 0.6)
        hand.click(page.locator('[data-shelf][data-key="OmenofAbyssalEchoes"]'), 700, 0.8)
        hand.click(tab("オーブ・骨"), 700, 0.6)
        hand.click(page.locator('[data-shelf][data-key="desecrate"]'), 700, 0)
        use()
        page.keyboard.press("Escape")
        reveal = page.locator("section", has_text="魂の井戸で発現")
        reveal.wait_for(timeout=3000)
        hand.glide(480, 900, 500)
        pause(2.0)
        offers = [reveal.locator("button.w-full").nth(i).inner_text() for i in range(3)]
        hand.click(reveal.get_by_role("button", name="引き直す", exact=True), 700, 1.5)
        rerolled = [reveal.locator("button.w-full").nth(i).inner_text() for i in range(3)]
        pause(1.0)
        n = count()
        hand.click(reveal.locator("button.w-full").nth(0), 800, 0)
        steps(n + 1).wait_for(timeout=5000)
        notes.append({"offers": offers, "rerolled": rerolled, "picked": rerolled[0]})
        notes.append({"change": page.evaluate(LAST_CHANGE_JS), "item": card.inner_text()})
        hand.glide(480, 900, 600)
        pause(2.5)
        rec.stop()
        dump("reveal")

    if "rune" in only:
        base("鎧(str)", "ウォーロードの胴鎧")
        quick(["transmute", "augment", "regal", "exalt", "exalt", "exalt"])
        scroller.evaluate("e => e.scrollTo({top: 0})")
        rec = Recorder(out / "rune.mp4")
        hand.glide(480, 600, 600)
        pause(1.5)  # 6 つ埋まった姿を見せる
        hand.click(tab("ルーン"), 700, 0.6)
        hand.click(page.locator('[data-shelf][data-key="rune:Serle\'s Triumph"]'), 700, 0)
        use()
        page.keyboard.press("Escape")
        hand.click(tab("オーブ・骨"), 700, 0.6)
        hand.click(page.locator('[data-shelf][data-key="exalt"]'), 700, 0)
        use()
        page.keyboard.press("Escape")
        hand.glide(480, 950, 600)
        pause(2.5)
        rec.stop()
        dump("rune")


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    only = sys.argv[2:] or ["reveal", "rune"]
    with sync_playwright() as p:
        page = p.chromium.connect_over_cdp(CDP, timeout=20000).contexts[0].pages[0]
        run_ch3(page, out, only)


if __name__ == "__main__":
    main()
