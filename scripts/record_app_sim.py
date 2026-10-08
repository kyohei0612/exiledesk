"""シミュレーション (実験) の操作を録る。record_app.py から呼ぶ (単体でも動く).

手袋 (磨かれた弓籠手、ソケット 1)。狙いは 最大ライフ / アタックスピード (T2 以上) の 2 つ。
最大ライフはフラクチャー予定。4 最安値スタートは「フラクチャー済みを買う」が一番安くなる値段。
6 パターンは高貴で埋めてからカオススパム (アタックスピード) を組んで「回す ▶」。
kyohei 2026-10-08「シミュレーションも録ってみて」「手袋にしようか」
「フラクチャー後カオススパムで完成」

    python scripts/record_app_sim.py output/app_rec
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import Locator, Page, sync_playwright
from record_app import CDP, SPEED, Hand, Recorder, open_stage, pause, setup

BASE_KIND, BASE = "手袋(dex)", "磨かれた弓籠手"
TARGETS = [r"^最大ライフ \(120", r"^アタックスピードが"]
WHITE_PRICE = "1"  # カオス (白ベース)
START_PRICES = ["10", "30"]  # 神 (② レアのフラクチャー無し / ③ フラクチャー済み)
FILLERS = 3  # フラクチャーの後、カオスの前に高貴で埋める数


def run_sim(page: Page, out: Path) -> None:
    hand = Hand(page)
    tools = page.locator("#sim-tools")
    scroller = page.locator("div.h-full.overflow-auto.p-4").first

    def blk(name: str) -> Locator:
        head = page.get_by_role("button", name=name, exact=True)
        return page.locator("div.rounded-xl").filter(has=head)

    def type_in(box: Locator, text: str) -> None:
        hand.click(box, 600, 0.1)
        page.keyboard.press("Control+a")
        page.keyboard.type(text, delay=int(180 / SPEED))
        pause(0.5)

    def decide(name: str) -> None:
        hand.click(blk(name).get_by_role("button", name="決めた →", exact=True), 700, 1.2)

    # 準備 (録らない): 前の途中を消して「1 ベース」の選ぶ所にしておく
    page.keyboard.press("Escape")
    open_stage(page)
    page.get_by_role("button", name="手で打つ", exact=True).wait_for(timeout=20000)
    page.get_by_role("button", name="シミュレーション (実験)", exact=True).click()
    page.wait_for_timeout(800)
    if not page.get_by_placeholder("名前で探す (例: サファイア、ルビー)").is_visible():
        tools.get_by_role("button", name=re.compile("リセット")).click()
        page.wait_for_timeout(300)
        tools.get_by_role("button", name=re.compile("リセット")).click()
        page.wait_for_timeout(800)
    scroller.evaluate("e => e.scrollTo({top: 0})")
    setup(page)
    page.mouse.move(hand.x, hand.y)

    rec = Recorder(out / "sim.mp4")
    pause(1.0)  # ベース一覧が開いた「1 ベース」から始める
    setup(page)
    # 1 ベース
    cat = page.get_by_placeholder("名前で探す (例: サファイア、ルビー)").locator("xpath=../..")
    hand.click(cat.get_by_role("button", name=BASE_KIND, exact=True), 700, 0.8)
    base = page.locator("b", has_text=re.compile(rf"^{BASE}$"))
    hand.click(cat.locator("button").filter(has=base), 800, 1.0)
    socket = page.locator("span:has(> span:text-is('ソケット'))")
    hand.click(socket.get_by_role("button", name="1", exact=True), 600, 1.0)
    # 2 狙う MOD (行を押してティアの表 → 「T2 以上」)
    for rx in TARGETS:
        row = blk("2 狙う MOD").get_by_role("button").filter(has_text=re.compile(rx)).first
        hand.click(row, 800, 0.8)
        tbl = row.locator("xpath=following-sibling::table[1]")
        hand.click(tbl.get_by_role("button", name=re.compile(r"^(✓ )?T2 以上$")), 700, 1.0)
        hand.click(row, 600, 0.5)  # 表を閉じる
    scroller.evaluate("e => e.scrollTo({top: 0, behavior: 'smooth'})")
    pause(1.5)
    plan = page.locator('select[title="付け方の予定"]').first
    hand.click(plan, 700, 0)  # 押して見せるだけ (OS のリストは開かないように Esc)
    page.keyboard.press("Escape")
    plan.select_option("fracture")
    pause(1.0)
    for sel in page.locator('select[title="付け方の予定"]').all():  # 残りはカオススパム
        if sel.evaluate("e => e.value") != "fracture":
            hand.click(sel, 600, 0)
            page.keyboard.press("Escape")
            sel.select_option("chaos")
            pause(0.6)
    pause(1.0)
    decide("2 狙う MOD")
    # 3 白ベースの値段
    type_in(blk("3 白ベース設定").locator('input[type="number"]').first, WHITE_PRICE)
    decide("3 白ベース設定")
    # 4 最安値スタート (② と ③ の値段)
    b4 = blk("4 最安値スタート")
    for i, price in enumerate(START_PRICES):
        b4.locator("select").nth(i).select_option("divine")
        type_in(b4.locator('input[type="number"]').nth(i), price)
    pause(2.5)  # 「一番安い」が付くのを見せる
    decide("4 最安値スタート")
    decide("5 順番計画")
    # 6 パターン: 高貴で埋める → カオススパムでアタックスピード
    # (カオスは消せる MOD が要る。フラクチャーの 1 つだけだと狙いを毎回消してしまう)
    b6 = blk("6 パターン")

    def add_hand(mod: str | None, orb: str, fail: str | None = None) -> None:
        hand.click(b6.get_by_role("button", name="＋ 手を足す").first, 600, 0.6)
        if mod is None:
            pick = b6.get_by_role("button").filter(has_text="何が付いてもいい").first
        else:
            pick = b6.get_by_role("button").filter(has_text=mod).filter(has_text="取り直し").first
        hand.click(pick, 600, 0.6)
        hand.click(b6.locator(f'button[title="{orb}"]').first, 600, 0.6)
        if fail:
            hand.click(b6.get_by_role("button").filter(has_text="付かなかったら").first, 600, 0.6)
            hand.click(b6.get_by_role("button").filter(has_text=fail).first, 600, 1.0)

    for _ in range(FILLERS):
        add_hand(None, "高貴なオーブ")
    for mod in ("アタックスピードが(11-13)",):
        add_hand(mod, "カオスオーブ", "カオスで入れ替える")
    done = b6.get_by_role("button", name="この手にする")
    if done.is_visible():  # 右の枠を閉じる (出ていない時もある)
        hand.click(done, 600, 0.8)
    hand.click(b6.get_by_role("button", name="回す ▶", exact=True), 700, 0.3)
    page.get_by_role("button", name="中止").wait_for(state="hidden", timeout=180000)
    result = page.get_by_text(re.compile(r" の 1 個あたり")).first
    result.evaluate("e => e.scrollIntoView({behavior: 'smooth', block: 'center'})")
    pause(1.5)
    hand.glide(1500, 1000, 600)
    pause(5.0)
    rec.stop()


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        run_sim(p.chromium.connect_over_cdp(CDP, timeout=20000).contexts[0].pages[0], out)


if __name__ == "__main__":
    main()
