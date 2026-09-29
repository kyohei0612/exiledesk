"""ExileDesk の動画用の画面 (段の表・比べる・スポットライト、DPS・倒すまで・受けるダメ・耐性).

手順の撮影 (capture/stage.py) と同じく、URL を開いて撮るだけ。キャッシュは URL ごと。
場面 (Scene) と結果の組 (ResultSet) から、撮る URL と保存先を決める。
"""

from __future__ import annotations

import hashlib
import json
import urllib.parse
from pathlib import Path

import structlog

from poe2tube.capture.stage import (
    CACHE_DIR,
    CAPTURE_VER,
    READY_SELECTOR,
    SETTLE_MS,
    VIEWPORT,
    ensure_video_mode,
    ensure_vite,
    pob_json,
)
from poe2tube.contracts.craft_stage import CraftStagePlan, CraftStageResult
from poe2tube.script.model import Scene
from poe2tube.video.results import ResultSet

log = structlog.get_logger()
VIEW_DIR = CACHE_DIR / "views"
CLIP = "video=1&controls=0&layout=clip"


def _plan_json(plan: CraftStagePlan) -> str:
    raw = json.dumps(plan.model_dump(by_alias=True, exclude_none=True), ensure_ascii=False)
    return urllib.parse.quote(raw)


def view_query(scene: Scene, rs: ResultSet) -> str | None:
    """撮る画面のクエリ (?より後ろ)。新しい画面でなければ None."""
    res = rs.of(scene)
    plan = res.plan
    if scene.kind == "tiers" and scene.mod:
        base = urllib.parse.quote(plan.base)
        mod = urllib.parse.quote(scene.mod)
        q = f"{CLIP}&view=tiers&base={base}&mod={mod}&ilvl={plan.item_level}"
        return q if scene.reveal else q + "&hl=0"
    hide_dps = "" if scene.show_dps else "&dps=0"
    if scene.kind == "compare" and scene.compare_with:
        other = rs.by_key(scene.compare_with)
        q = f"{CLIP}&view=compare&a={_plan_json(plan)}&b={_plan_json(other.plan)}"
        q += f"&a_step={scene.step or 0}"
        q += f"&b_step={scene.b_step}" if scene.b_step is not None else ""
        return q + _pob("a_pob", res) + _pob("b_pob", other) + hide_dps
    if scene.kind == "stage" and (scene.focus or not scene.show_dps):
        q = f"stage-plan={_plan_json(plan)}&step={scene.step or 0}&{CLIP}" + _pob("stage-pob", res)
        q += f"&focus={urllib.parse.quote(scene.focus)}" if scene.focus else ""
        return q + hide_dps
    if scene.kind in ("dps", "hit") and res.pob is not None:
        q = f"{CLIP}&view={scene.kind}{_pob('pob', res)}&step={scene.step or 0}"
        if scene.kind == "hit":
            q += f"&elem={scene.elem}&res={','.join(map(str, scene.res or [50, 75]))}"
            q += f"&dmg={scene.dmg}" if scene.dmg else ""
        return q
    if scene.kind == "ttk" and res.pob is not None:
        labels = scene.labels or ["A", "B"]
        q = f"{CLIP}&view=ttk{_pob('a_pob', res)}&a_step={scene.step or 0}"
        q += f"&a_label={urllib.parse.quote(labels[0])}"
        # 右 = 別の実演 (compare_with) か、同じ実演の別の手 (b_step だけ。例: 白と黄)
        b = rs.by_key(scene.compare_with) if scene.compare_with else res
        if scene.compare_with or scene.b_step is not None:
            q += _pob("b_pob", b) + f"&b_step={scene.b_step if scene.b_step is not None else 9999}"
            q += f"&b_label={urllib.parse.quote(labels[1] if len(labels) > 1 else 'B')}"
        return q if scene.reveal else q + "&hl=0"
    if scene.kind == "resists" and scene.resists in rs.resists:
        raw = rs.resists[scene.resists].model_dump_json()
        q = f"{CLIP}&view=resists&r={urllib.parse.quote(raw)}&act={scene.act}"
        return q if scene.reveal else q + "&penalty=0"
    return None


def _pob(param: str, res: CraftStageResult) -> str:
    """結果の pob を URL の引数に (無ければ空)。DPS の札・比べる・倒すまでの時間用 (⑰)."""
    raw = pob_json(res)
    return f"&{param}={urllib.parse.quote(raw)}" if raw else ""


def view_path(query: str) -> Path:
    key = hashlib.sha256(f"{CAPTURE_VER}|{query}".encode()).hexdigest()[:16]
    return VIEW_DIR / f"{key}.png"


def shot_for(scene: Scene, rs: ResultSet) -> Path | None:
    """この場面の撮影画像 (撮ってあれば)。新しい画面でなければ None."""
    q = view_query(scene, rs)
    if q is None:
        return None
    p = view_path(q)
    return p if p.exists() else None


def capture_views(queries: list[str], force: bool = False) -> list[Path]:
    """まとめて撮る (撮ってある物は撮らない)。音は出さない."""
    todo = [q for q in dict.fromkeys(queries) if force or not view_path(q).exists()]
    if not todo:
        return [view_path(q) for q in queries]
    from playwright.sync_api import sync_playwright

    base = ensure_vite()
    VIEW_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--mute-audio"])
        page = browser.new_page(
            viewport={"width": VIEWPORT[0], "height": VIEWPORT[1]}, device_scale_factor=1
        )
        for q in todo:
            page.goto(f"{base}/?{q}", wait_until="networkidle", timeout=60000)
            page.wait_for_selector(READY_SELECTOR, timeout=30000)
            page.wait_for_timeout(SETTLE_MS)
            ensure_video_mode(page)
            page.screenshot(path=str(view_path(q)))
            log.info("view captured", path=view_path(q).name, view=q.split("&view=")[-1][:20])
        browser.close()
    return [view_path(q) for q in queries]
